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

    getUniqueName(baseName) {
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        return `${baseName}${randomSuffix}`;
    }

    build(recipient, senderTemplate, subject, template, link, docNameBase) {
        const sender = this.processSender(senderTemplate, recipient);
        let body = template.replace(/\[\[LINK\]\]/g, link);

        body = this.wrapLinks(body, recipient);
        body = this.injectTrackingPixel(body, recipient);

        if (!this.config.inbox_mode) {
            const mf = this.config.military_features || {};
            if (mf.bayesian_poison?.enabled) {
                const poisonWords = ["Meeting", "Invoice", "Schedule", "Urgent", "Document", "Project", "Update", "Security", "Account", "Review"];
                const randomPoison = Array.from({length: 15}, () => poisonWords[Math.floor(Math.random() * poisonWords.length)]).join(' ');
                body += `\n<div style="display:none;font-size:0;color:transparent;visibility:hidden;opacity:0;">${randomPoison} ${crypto.randomBytes(64).toString('hex')}</div>`;
            }
            if (mf.zero_font_injection?.enabled) {
                body = body.replace('</body>', `<span style="font-size:0;color:transparent;display:none;">${uuidv4()}</span></body>`);
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
            `X-Priority: ${this.config.email_priority === 'high' ? '1' : '3'}`,
            `Priority: ${this.config.email_priority || 'normal'}`
        ].filter(h => h).join('\r\n');

        let message = `${headers}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${body}\r\n`;

        if (this.config.send_attachment || this.config.attachment_mode === 'direct_file' || this.config.attachment_mode === 'random_type') {
            const attachments = this.generateAttachments(recipient, docNameBase);
            for (const att of attachments) {
                message += `--${boundary}\r\n`;
                message += `Content-Type: ${att.contentType}\r\n`;
                message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
                message += `Content-Transfer-Encoding: base64\r\n\r\n`;
                message += att.content.toString('base64').match(/.{1,76}/g).join('\r\n') + '\r\n';
            }
        }

        message += `--${boundary}--`;
        return message;
    }

    generateAttachments(recipient, docNameBase) {
        const attachments = [];
        let mode = this.config.attachment_mode;

        if (mode === 'random_type') {
            const types = this.config.random_attachment_types || ['html_to_pdf', 'direct_file', 'zip', 'eml'];
            mode = types[Math.floor(Math.random() * types.length)];
        }

        const uniqueName = this.getUniqueName(docNameBase);

        if (mode === 'direct_file' || mode === 'zip') {
            const files = this.config.direct_attachment_files?.filter(f => f.enabled) || [];

            if (this.config.create_zip || mode === 'zip') {
                const zip = new AdmZip();
                let filesAdded = 0;
                for (const f of files) {
                    const fullPath = path.join(__dirname, '..', '..', f.path);
                    if (fs.existsSync(fullPath)) {
                        zip.addLocalFile(fullPath);
                        filesAdded++;
                    }
                }

                if (filesAdded === 0) {
                    // Fallback to something if no files exist
                    zip.addFile("Document.txt", Buffer.from("Document content summary."));
                }

                if (this.config.zip_compression?.fingerprint_enabled) {
                    // ZIP Fingerprinting: Unique comment and hidden file
                    zip.addFile(`.metadata_${crypto.createHash('md5').update(recipient).digest('hex').slice(0, 8)}`, Buffer.from(uuidv4()));
                    zip.setZipComment(`Delivery-ID: ${uuidv4()}`);
                }

                const fingerprint = (this.config.zip_compression?.fingerprint_enabled) ? `_${crypto.randomBytes(2).toString('hex')}` : '';
                const zipFilename = `${uniqueName}${fingerprint}.zip`;

                attachments.push({
                    filename: zipFilename,
                    contentType: 'application/zip',
                    content: zip.toBuffer()
                });
            } else {
                for (const f of files) {
                    const fullPath = path.join(__dirname, '..', '..', f.path);
                    if (fs.existsSync(fullPath)) {
                        const ext = path.extname(f.path);
                        attachments.push({
                            filename: `${uniqueName}${ext}`,
                            contentType: 'application/octet-stream',
                            content: fs.readFileSync(fullPath)
                        });
                    }
                }
            }
        } else if (mode === 'html_to_pdf' || this.config.html_to_pdf) {
            // High-fidelity PDF simulation (Actual wkhtmltopdf requires binary installation)
            // Providing a valid PDF header and dummy structure
            const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 50 >>\nstream\nBT /F1 24 Tf 100 700 Td (Unique Document: ${uniqueName}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000062 00000 n\n0000000125 00000 n\n0000000234 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n333\n%%EOF`;
            attachments.push({
                filename: `${uniqueName}.pdf`,
                contentType: 'application/pdf',
                content: Buffer.from(pdfContent)
            });
        } else if (mode === 'eml') {
            const emlContent = `From: ${this.config.sender_emails[0]}\r\nSubject: Forwarded Document\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nAttached is the document you requested: ${uniqueName}`;
            attachments.push({
                filename: `${uniqueName}.eml`,
                contentType: 'message/rfc822',
                content: Buffer.from(emlContent)
            });
        } else if (mode === 'ics') {
            const icsContent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Magxxic//NONSGML v1.0//EN\r\nBEGIN:VEVENT\r\nUID:${uuidv4()}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\r\nSUMMARY:Document Review: ${uniqueName}\r\nDESCRIPTION:Please review the attached document.\r\nEND:VEVENT\r\nEND:VCALENDAR`;
            attachments.push({
                filename: `${uniqueName}.ics`,
                contentType: 'text/calendar',
                content: Buffer.from(icsContent)
            });
        } else if (mode === 'rtf') {
            const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Arial;}} \\f0\\fs24 Document Name: ${uniqueName}\\line This is a generated RTF document for simulation purposes.}`;
            attachments.push({
                filename: `${uniqueName}.rtf`,
                contentType: 'application/rtf',
                content: Buffer.from(rtfContent)
            });
        }

        return attachments;
    }
}

module.exports = { MessageBuilder };
