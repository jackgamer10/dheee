const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class MessageBuilder {
    constructor(config) {
        this.config = config;
    }

    processSender(senderTemplate, recipient) {
        const domain = recipient.split('@')[1];
        const tld = domain.split('.').pop();
        const domainName = domain.split('.')[0];

        return senderTemplate
            .replace(/\[\[RECIPIENTDOMAIN\]\]/g, domain)
            .replace(/\[\[DOMAINNAME\]\]/g, domainName)
            .replace(/\[\[TLD\]\]/g, tld)
            .replace(/\[\[SENDER_RANDOM_STRING\((\d+)\)\]\]/g, (_, n) => crypto.randomBytes(parseInt(n)).toString('hex').slice(0, n));
    }

    wrapLinks(body, recipient) {
        if (!this.config.tracking?.enabled) return body;

        const serverUrl = this.config.tracking.server_url || 'http://localhost:5000';
        const campaign = this.config.tracking.campaign_name || 'default';
        const encodedRecipient = Buffer.from(recipient).toString('base64');

        return body.replace(/href="([^"]+)"/g, (match, p1) => {
            if (p1.startsWith('http')) {
                const trackedUrl = `${serverUrl}/click?u=${encodeURIComponent(p1)}&r=${encodedRecipient}&c=${campaign}`;
                return `href="${trackedUrl}"`;
            }
            return match;
        });
    }

    injectTrackingPixel(body, recipient) {
        if (!this.config.tracking?.enabled || !this.config.tracking?.track_opens) return body;

        const serverUrl = this.config.tracking.server_url || 'http://localhost:5000';
        const encodedRecipient = Buffer.from(recipient).toString('base64');
        const pixel = `<img src="${serverUrl}/open?r=${encodedRecipient}" width="1" height="1" style="display:none" />`;

        return body.replace('</body>', `${pixel}</body>`);
    }

    build(recipient, senderTemplate, subject, template, link, docName) {
        const sender = this.processSender(senderTemplate, recipient);
        let body = template.replace(/\[\[LINK\]\]/g, link);

        body = this.wrapLinks(body, recipient);
        body = this.injectTrackingPixel(body, recipient);

        if (!this.config.inbox_mode) {
            const mf = this.config.military_features || {};
            if (mf.bayesian_poison?.enabled) {
                const poisonWords = ["Meeting", "Invoice", "Schedule", "Urgent", "Document", "Project", "Update"];
                const randomPoison = Array.from({length: 10}, () => poisonWords[Math.floor(Math.random() * poisonWords.length)]).join(' ');
                body += `\n<div style="display:none;font-size:0;color:transparent;">${randomPoison} ${crypto.randomBytes(32).toString('hex')}</div>`;
            }
            if (mf.zero_font_injection?.enabled) {
                body = body.replace('</body>', `<span style="font-size:0;color:transparent;">${uuidv4()}</span></body>`);
            }
            if (mf.html_polymorphic?.enabled) {
                const randomClass = `c${crypto.randomBytes(4).toString('hex')}`;
                body = body.replace(/class="[^"]*"/g, `class="${randomClass}"`);
            }
        }

        const boundary = `----=_Part_${crypto.randomBytes(8).toString('hex')}`;
        const headers = [
            `From: ${sender}`,
            `To: ${recipient}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            `X-Mailer: Magxxic v2.2.1`,
            this.config.inbox_mode ? `X-Mailprotector-Decision: deliver` : '',
            `Priority: ${this.config.email_priority || 'normal'}`
        ].filter(h => h).join('\r\n');

        let message = `${headers}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${body}\r\n`;

        if (this.config.send_attachment || this.config.attachment_mode === 'direct_file') {
            const attachments = this.generateAttachments(recipient, docName);
            for (const att of attachments) {
                message += `--${boundary}\r\n`;
                message += `Content-Type: ${att.contentType}\r\n`;
                message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
                message += `Content-Transfer-Encoding: base64\r\n\r\n`;
                message += att.content.toString('base64') + '\r\n';
            }
        }

        message += `--${boundary}--`;
        return message;
    }

    generateAttachments(recipient, docName) {
        const attachments = [];

        if (this.config.attachment_mode === 'direct_file') {
            const files = this.config.direct_attachment_files?.filter(f => f.enabled) || [];

            if (this.config.create_zip) {
                const zip = new AdmZip();
                for (const f of files) {
                    const fullPath = path.join(__dirname, '..', '..', f.path);
                    if (fs.existsSync(fullPath)) {
                        zip.addLocalFile(fullPath);
                    }
                }

                if (this.config.zip_compression?.fingerprint_enabled) {
                    zip.addFile(`.metadata_${crypto.createHash('md5').update(recipient).digest('hex').slice(0, 8)}`, Buffer.from(uuidv4()));
                }

                const fingerprint = this.config.zip_compression?.fingerprint_enabled ? `_fp_${crypto.createHash('md5').update(recipient).digest('hex').slice(0,4)}` : '';
                const zipFilename = `${docName}${fingerprint}.zip`;

                attachments.push({
                    filename: zipFilename,
                    contentType: 'application/zip',
                    content: zip.toBuffer()
                });
            } else {
                for (const f of files) {
                    const fullPath = path.join(__dirname, '..', '..', f.path);
                    if (fs.existsSync(fullPath)) {
                        attachments.push({
                            filename: path.basename(f.path),
                            contentType: 'application/octet-stream',
                            content: fs.readFileSync(fullPath)
                        });
                    }
                }
            }
        } else if (this.config.attachment_mode === 'html_to_pdf' || this.config.html_to_pdf) {
            attachments.push({
                filename: `${docName}.pdf`,
                contentType: 'application/pdf',
                content: Buffer.from('%PDF-1.4\n%Simulation')
            });
        }

        return attachments;
    }
}

module.exports = { MessageBuilder };
