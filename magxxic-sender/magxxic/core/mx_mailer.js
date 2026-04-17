const dns = require('dns').promises;
const net = require('net');
const { SocksClient } = require('socks');

class MXMailer {
    constructor(config) {
        this.config = config;
    }

    async resolveMX(domain) {
        try {
            const records = await dns.resolveMx(domain);
            if (!records || records.length === 0) return domain;
            return records.sort((a, b) => a.priority - b.priority)[0].exchange;
        } catch (e) {
            return domain;
        }
    }

    async send(recipient, message, senderEmail, proxy) {
        const domain = recipient.split('@')[1];
        const mxServer = await this.resolveMX(domain);

        return new Promise((resolve, reject) => {
            let socket;
            if (proxy) {
                const [host, port] = proxy.split(':');
                SocksClient.createConnection({
                    proxy: { host, port: parseInt(port), type: 5 },
                    destination: { host: mxServer, port: 25 },
                    command: 'connect'
                }).then(info => {
                    this.handleSMTP(info.socket, recipient, message, senderEmail, resolve, reject);
                }).catch(reject);
            } else {
                socket = net.createConnection(25, mxServer);
                this.handleSMTP(socket, recipient, message, senderEmail, resolve, reject);
            }
        });
    }

    handleSMTP(socket, recipient, message, senderEmail, resolve, reject) {
        let step = 0;
        let buffer = '';
        socket.setEncoding('utf8');

        const sendCmd = (cmd) => {
            if (this.config.smtp_debug) console.log(`> ${cmd.trim()}`);
            socket.write(cmd);
        };

        socket.on('data', (chunk) => {
            buffer += chunk;
            if (!buffer.endsWith('\n')) return;

            const lines = buffer.split(/\r?\n/).filter(l => l);
            buffer = '';

            for (const line of lines) {
                if (this.config.smtp_debug) console.log(`< ${line}`);
                if (line[3] === '-') continue;

                const code = line.substring(0, 3);

                switch (step) {
                    case 0:
                        if (code === '220') {
                            sendCmd(`EHLO ${this.config.ehlo_hostname || 'localhost'}\r\n`);
                            step = 1;
                        } else reject(new Error(`Banner error: ${line}`));
                        break;
                    case 1:
                        if (code === '250') {
                            sendCmd(`MAIL FROM:<${senderEmail}>\r\n`);
                            step = 2;
                        } else reject(new Error(`EHLO error: ${line}`));
                        break;
                    case 2:
                        if (code === '250') {
                            sendCmd(`RCPT TO:<${recipient}>\r\n`);
                            step = 3;
                        } else reject(new Error(`MAIL FROM error: ${line}`));
                        break;
                    case 3:
                        if (code === '250') {
                            sendCmd('DATA\r\n');
                            step = 4;
                        } else reject(new Error(`RCPT TO error: ${line}`));
                        break;
                    case 4:
                        if (code === '354') {
                            sendCmd(message + '\r\n.\r\n');
                            step = 5;
                        } else reject(new Error(`DATA error: ${line}`));
                        break;
                    case 5:
                        if (code === '250') {
                            sendCmd('QUIT\r\n');
                            resolve(true);
                            socket.end();
                        } else reject(new Error(`Delivery error: ${line}`));
                        break;
                }
            }
        });

        socket.on('error', (err) => { socket.destroy(); reject(err); });
        const timeout = setTimeout(() => { socket.destroy(); reject(new Error('SMTP Timeout')); }, 30000);
        socket.on('close', () => clearTimeout(timeout));
    }
}

module.exports = { MXMailer };
