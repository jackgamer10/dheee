const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { MXMailer } = require('./mx_mailer');
const { MessageBuilder } = require('./message_builder');

class CampaignEngine {
    constructor(config) {
        this.config = config;
        this.stats = {
            delivered: 0,
            failed: 0,
            total: config.recipients ? config.recipients.length : 0,
            startTime: new Date(),
            endTime: null,
            domainEngagement: {}
        };
        this.threads = config.max_threads || 10;
        this.delay = (config.sending_speed || 1) * 1000;
        this.mailer = new MXMailer(config);
        this.builder = new MessageBuilder(config);
        this.throttles = new Map();
    }

    async run(callback) {
        const isInbox = !!this.config.inbox_mode;

        if (isInbox) {
            console.log(chalk.blue("[INBOX MODE] ") + chalk.green("ENABLED") + " — Using proven Node.js patterns");
        } else {
            console.log(chalk.blue("[INIT] ") + "Initializing military-grade features...");
            await this.delayMs(300);
            const mf = this.config.military_features || {};
            if (mf.email_verification?.enabled) console.log(chalk.blue("[VERIFY] ") + chalk.green("✓") + " Email verification enabled");
            if (mf.bounce_handler?.enabled) console.log(chalk.blue("[BOUNCE] ") + chalk.green("✓") + " Bounce handler enabled");
            if (mf.list_hygiene?.enabled) console.log(chalk.blue("[HYGIENE] ") + chalk.green("✓") + " List hygiene engine enabled");

            console.log(chalk.blue("[INIT] ") + "Activating ULTIMATE COMBO features...");
            await this.delayMs(300);
            if (mf.html_polymorphic?.enabled) console.log(chalk.blue("[POLY] ") + chalk.green("✓") + " HTML polymorphic engine enabled");
            if (mf.bayesian_poison?.enabled) console.log(chalk.blue("[BAYES] ") + chalk.green("✓") + " Bayesian poisoner enabled");
            if (mf.domain_throttling?.enabled) console.log(chalk.blue("[THROTTLE] ") + chalk.green("✓") + " Domain throttling enabled");

            console.log(chalk.blue("[INIT] ") + chalk.green("✓") + " Military features ready!");
        }

        this.printMilitaryStatus();
        await this.delayMs(1000);

        let index = 0;
        let activePromises = [];

        while (index < this.config.recipients.length || activePromises.length > 0) {
            while (activePromises.length < this.threads && index < this.config.recipients.length) {
                const currentIndex = index++;
                const recipient = this.config.recipients[currentIndex];
                const senderTemplate = this.config.senders[currentIndex % this.config.senders.length];
                const subject = this.config.subjects[currentIndex % this.config.subjects.length] || "Important Document";
                const template = this.config.templates[currentIndex % this.config.templates.length]?.[1] || "<html><body>Test</body></html>";
                const link = this.config.links[currentIndex % this.config.links.length] || "http://example.com";

                const docNames = this.config.document_names || [];
                const docNameBase = docNames.length > 0 ? docNames[Math.floor(Math.random() * docNames.length)] : (this.config.document_name || "Document");

                const proxy = this.config.proxies[currentIndex % this.config.proxies.length];
                const message = this.builder.build(recipient, senderTemplate, subject, template, link, docNameBase);
                const processedSender = this.builder.processSender(senderTemplate, recipient);

                const p = this.mailer.send(recipient, message, processedSender, proxy)
                    .then(() => {
                        this.stats.delivered++;
                        this.updateStats(recipient, true);
                        callback(recipient, true, null, subject, docNameBase, processedSender);
                    })
                    .catch((e) => {
                        this.stats.failed++;
                        this.updateStats(recipient, false);
                        callback(recipient, false, e.message, subject, docNameBase, processedSender);
                    });

                activePromises.push(p);
                p.finally(() => {
                    activePromises = activePromises.filter(item => item !== p);
                });

                if (this.config.military_features?.timing_jitter?.enabled && !isInbox) {
                    await this.delayMs(2000 + Math.random() * 5000);
                } else {
                    await this.delayMs(this.delay / this.threads);
                }
            }

            if (activePromises.length > 0) {
                await Promise.race(activePromises);
            }
        }

        this.stats.endTime = new Date();
        return this.stats;
    }

    updateStats(recipient, success) {
        const domain = recipient.split('@')[1];
        if (!this.stats.domainEngagement[domain]) {
            this.stats.domainEngagement[domain] = { delivered: 0, failed: 0 };
        }
        if (success) {
            this.stats.domainEngagement[domain].delivered++;
        } else {
            this.stats.domainEngagement[domain].failed++;
        }
    }

    printMilitaryStatus() {
        const isInbox = !!this.config.inbox_mode;
        const mf = this.config.military_features || {};
        const check = (feature) => (mf[feature]?.enabled && !isInbox) ? chalk.green("✓") : chalk.red("✗");

        console.log(chalk.white(`
╔════════════════════════════════════════════════════════════════════════════════════════╗
║                             ◆  MILITARY FEATURES STATUS  ◆                             ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  VERIFY          ${check('email_verification')} Email Verification                                                  ║
║  BOUNCE          ${check('bounce_handler')} Bounce Handler                                                      ║
║  ENGAGEMENT      ${check('engagement_filter')} Engagement Filter                                                   ║
║  DEDUP           ${check('remove_duplicates')} Duplicate Removal                                                   ║
║  TIMING          ${check('send_time_optimization')} Send Time Optimization                                              ║
║  HYGIENE         ${check('list_hygiene')} List Hygiene Engine                                                 ║
║  RANDOM          ${check('content_randomization')} Content Randomization                                               ║
╠═══════════════════════════════════ STEALTH FEATURES ═══════════════════════════════════╣
║  POLYMORPHIC     ${check('html_polymorphic')} HTML Polymorphic                                                    ║
║  MIME-RAND       ${check('mime_randomization')} MIME Randomization                                                  ║
║  JITTER          ${check('timing_jitter')} Timing Jitter                                                       ║
║  BAYESIAN        ${check('bayesian_poison')} Bayesian Poisoning                                                  ║
║  THROTTLE        ${check('domain_throttling')} Domain Throttling                                                   ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  MODE            ${isInbox ? "INBOX MODE " : "PRODUCTION"} — ${isInbox ? "Standard patterns" : "Filters active"}                 ║
║  INBOX MODE      ${isInbox ? chalk.green("ENABLED") : chalk.red("DISABLED")} — ${isInbox ? "Clean Node.js headers" : "Military features active"}          ║
╚════════════════════════════════════════════════════════════════════════════════════════╝
`));
    }

    async delayMs(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { CampaignEngine };
