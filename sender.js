'use strict';

const nodemailer = require('nodemailer');
const chalk = require('chalk');
const fs = require('fs').promises;
const randomstring = require('randomstring');
function printWithDelay(text, color, delay) {
    return new Promise(resolve => {
        setTimeout(() => {
            console.log(color + text);
            resolve();
        }, delay);
    });
}

async function printLines() {
    await printWithDelay('Node Maghx Inbox Sender Start', '\x1b[33m', 500);
    await printWithDelay('', '', 500);
    await printWithDelay(`
\x1b[36m███╗   ███╗ █████╗  ██████╗ ██╗  ██╗██╗  ██╗    ██╗███╗   ██╗██████╗  ██████╗ ██╗  ██╗
\x1b[35m████╗ ████║██╔══██╗██╔════╝ ██║  ██║╚██╗██╔╝    ██║████╗  ██║██╔══██╗██╔═══██╗██║ ██╔╝
\x1b[34m██╔████╔██║███████║██║  ███╗███████║ ╚███╔╝     ██║██╔██╗ ██║██║  ██║██║   ██║█████╔╝
\x1b[33m██║╚██╔╝██║██╔══██║██║   ██║██╔══██║ ██╔██╗     ██║██║╚██╗██║██║  ██║██║   ██║██╔═██╗
\x1b[32m██║ ╚═╝ ██║██║  ██║╚██████╔╝██║  ██║██╔╝ ██╗    ██║██║ ╚████║██████╔╝╚██████╔╝██║  ██╗
\x1b[31m╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝
`, '', 500);
    await printWithDelay('[+] Node Maghx Sender v1', '\x1b[31m', 500);
    await printWithDelay('[+] Best For All Spamming Hit Aol Yahoo Office Gmail', '\x1b[32m', 500);
    await printWithDelay('[+] Code By Maghx Inbox', '\x1b[33m', 500);
    await printWithDelay('[+] Configuration Check', '\x1b[32m', 500);
    await printWithDelay('[+] Smtp Connected', '\x1b[33m', 500);
}

printLines();



async function checkSMTP(data) {
    try {
        const transporter = nodemailer.createTransport(data);
        await transporter.verify();
        return transporter;
    } catch(err) {
        throw new Error(`SMTP ERROR: ${err.message}`);
    }
}

async function readTemplate(templatePath, replacements) {
    try {
        let template = await fs.readFile(templatePath, 'utf-8');
        const fakeData = generateFakeData();

        // Replace email-related tags
        template = template.replace(/\[-email-\]/g, replacements['-email-']);
        template = template.replace(/\[-emailuser-\]/g, replacements['-emailuser-']);
        template = template.replace(/\[-emaildomain-\]/g, replacements['-emaildomain-']);

        // Replace time-related tag
        template = template.replace(/\[-time-\]/g, getCurrentTime(timezone, 'fulltime12'));

        // Replace random string tag
        template = template.replace(/\[-randomstring-\]/g, randomstring.generate());
        template = template.replace(/\[-random_fname-\]/g, fakeData.companyName);
        template = template.replace(/\[-random_femail-\]/g, fakeData.email);

        // Replace random number tag
        template = template.replace(/\[-randomnumber-\]/g, Math.floor(Math.random() * 10));

        // Replace random letters tag
        template = template.replace(/\[-randomletters-\]/g, randomstring.generate({ charset: 'alphabetic' }));

        // Replace random MD5 tag
        template = template.replace(/\[-randommd5-\]/g, require('crypto').createHash('md5').update(randomstring.generate()).digest('hex'));

        return template;
    } catch(err) {
        throw new Error(`Template Read Error: ${err.message}`);
    }
}

async function sendEmails(emailListPath, smtpConfig, templatePath, subject, timezone, attachment, senderName, delay) {
    try {
        const transporter = await checkSMTP(smtpConfig);
        const emailList = (await fs.readFile(emailListPath, 'utf-8')).split(/\r?\n/);

        for (const email of emailList) {
            if (validateEmail(email)) {
                const replacements = {
                    '-email-': email,
                    '-emailuser-': email.split('@')[0],
                    '-emaildomain-': email.split('@')[1],
                };

                const emailContent = await readTemplate(templatePath, replacements);
                const emailSubject = await readTemplate(subject, replacements);

                const fakeData = generateFakeData();
                const processedSenderName = senderName
                    .replace(/\[-randomletters-\]/g, randomstring.generate({ charset: 'alphabetic' }))
                    .replace(/\[-random_fname-\]/g, fakeData.companyName)
                    .replace(/\[-random_femail-\]/g, fakeData.email);

                const fromEmail = smtpConfig.auth.user
                    .replace(/\[-random_fname-\]/g, fakeData.companyName)
                    .replace(/\[-random_femail-\]/g, fakeData.email);

                await transporter.sendMail({
                    from: `"${processedSenderName}" <${fromEmail}>`, // Include sender name
                    to: email,
                    subject: emailSubject,
                    html: emailContent,
                });

                console.log(chalk.green('=================================================='));
                console.log(chalk.red('To               : ') + chalk.green(email));
                console.log(chalk.red('Subject    : ') + chalk.magenta(emailSubject));
                console.log(chalk.red('Name       : ') + chalk.white(processedSenderName));
                console.log(chalk.red('Smtp        : ') + chalk.yellow(smtpConfig.host));
                console.log(chalk.red('Status      : ') + chalk.red('Sent'));
                console.log(chalk.green('=================================================='));

                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(chalk.yellow(`Invalid email address: ${email}`));
            }
        }
    } catch (err) {
        console.error(chalk.red(`Error sending emails: ${err.message}`));
    }
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

const FAKE_COMPANY_NOUNS = ['Solutions', 'Systems', 'Enterprises', 'Innovations', 'Dynamics', 'Technologies', 'Group', 'Partners'];
const FAKE_COMPANY_ADJECTIVES = ['Global', 'Dynamic', 'Innovative', 'Strategic', 'Advanced', 'Creative', 'Secure', 'Future'];

function generateFakeData() {
    const adjective = FAKE_COMPANY_ADJECTIVES[Math.floor(Math.random() * FAKE_COMPANY_ADJECTIVES.length)];
    const noun = FAKE_COMPANY_NOUNS[Math.floor(Math.random() * FAKE_COMPANY_NOUNS.length)];
    const companyName = `${adjective} ${noun}`;
    const domain = `${adjective.toLowerCase()}${noun.toLowerCase()}.com`;
    const email = `contact@${domain}`;
    return { companyName, email, domain };
}

function getCurrentTime(timezone, format) {
    try {
        const options = {
            timeZone: timezone,
            hour12: true,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        };
        if (format === 'fulltime12') {
            return new Date().toLocaleString('en-US', options);
        }
        return new Date().toLocaleString('en-US', { timeZone: timezone });
    } catch (e) {
        // Fallback for invalid timezone
        console.error(`Invalid timezone: ${timezone}. Falling back to local time.`);
        return new Date().toLocaleString();
    }
}

// Define SMTP configuration, template path, subject, and other parameters

// SPF (Sender Policy Framework) is a DNS record that helps prevent email spoofing.
// To use SPF, you need to add a TXT record to your domain's DNS settings.
// The record should specify which mail servers are allowed to send email on behalf of your domain.
// For example, if you are using IONOS, your SPF record might look like this:
// "v=spf1 include:spf.ionos.com ~all"
// Please check with your email provider for the correct SPF record.

const smtpConfig = {
    host: 'smtp.ionos.com',
    port: 465,
    secure: true,
    requireTLS: true,
    auth: {
        user: 'EMAIL',
        pass: 'PACC',
    },
    dkim: {
        domainName: 'your-domain.com', // Your domain name
        keySelector: 'dkim', // The DKIM selector
        privateKey: `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----`, // Your private key
    },
};

const senderName = 'Docusign [-randomletters-]';
const templatePath = 'letter.html';
const subject = 'subject.txt';
const attachment = 'attachment.htm';
const emailListPath = 'list.txt';
const timezone = 'America/New_York'; // Example timezone
const delay = 1000; // Delay between emails in milliseconds

sendEmails(emailListPath, smtpConfig, templatePath, subject, timezone, attachment, senderName, delay);
