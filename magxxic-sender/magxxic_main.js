const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { CampaignEngine } = require('./magxxic/core/engine');
const { validateProxies } = require('./magxxic/core/proxy_validator');
const { getDkimOptions } = require('./magxxic/core/signer');
const { checkLicense } = require('./magxxic/core/licensing');

const baseDir = path.join(__dirname, 'magxxic');
const dataDir = path.join(__dirname, 'data');

function printBanner(version = "2.2.1") {
    const brain = chalk.red(`
         @@@@     @@@@@@@@@@@@@@@@@@     @@@@
       @@@@@@@  @@@@@@@@@@@@@@@@@@@@@@  @@@@@@@
                @@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@@@@@@@@@@
                @@@@@@@@@@@@@@@@@@@@@@`);

    const banner = chalk.green("  __  __                             _        \n" +
" |  \\/  |                           (_)       \n" +
" | \\  / |  __ _   __ _ __  __ __  __ _   ___  \n" +
" | |\\/| | / _` | / _` |\\ \\/ / \\ \\/ /| | / __| \n" +
" | |  | || (_| || (_| | >  <   >  < | || (__  \n" +
" |_|  |_| \\__,_| \\__, |/_/\\_\\ /_/\\_\\|_| \\___| \n" +
"                  __/ |                       \n" +
"                 |___/                        \n");
    console.log(brain);
    console.log(banner);
    console.log(chalk.green("      >>> PROXY-ONLY DIRECT-TO-MX DELIVERY SYSTEM (NODE.JS) - STATUS: ARMED <<<"));
    console.log("      [RFC-2822] [DKIM-SIGNED] [SOCKS5-CHAIN] [ZERO-SMTP-RELAY]");
    console.log(`      VERSION ${version} | BUILD 2026-02-14 | SCORPION PROTOCOL`);
    console.log(chalk.green("=".repeat(85)));
}

function loadList(filepath, required = false) {
    if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath, 'utf8').split('\n').map(l => l.trim()).filter(l => l);
    }
    if (required) {
        console.error(chalk.red(`[CRITICAL] 🔥 DATA FOLDER ONLY - NO CONFIG.JSON FALLBACK 🔥`));
        console.error(chalk.red(`[ERROR] File MUST exist at ${filepath} or script will ERROR and EXIT!`));
        process.exit(1);
    }
    return [];
}

function loadTemplates(templateDir) {
    const templates = [];
    if (fs.existsSync(templateDir)) {
        fs.readdirSync(templateDir).forEach(f => {
            if (f.endsWith('.html') || f.endsWith('.mhtml') || f.endsWith('.mht')) {
                templates.push([f, fs.readFileSync(path.join(templateDir, f), 'utf8')]);
            }
        });
    }
    return templates;
}

function deliveryCallback(recipient, success, error, subject, templateName, sender) {
    const timestamp = new Date().toLocaleTimeString();
    const status = success ? chalk.green("DELIVERED") : chalk.red("FAILED");
    const maskRecipient = `${recipient.slice(0, 3)}***${recipient.slice(recipient.indexOf('@') - 1)}`;

    // Live Progress Stats
    const currentStats = `(${chalk.green(engineInstance.stats.delivered)}/${chalk.red(engineInstance.stats.failed)}/${engineInstance.stats.total})`;

    console.log(`[${timestamp}] ${status.padEnd(20)} ${maskRecipient.padEnd(25)} ${sender.padEnd(25)} ${currentStats}`);
    if (!success) {
        console.log(`      ${chalk.red('Error: ' + String(error).slice(0, 50) + (String(error).length > 50 ? '...' : ''))}`);
    }
}

async function interactiveDashboard(appConfig) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query) => new Promise((resolve) => readline.question(query, resolve));

    while (true) {
        process.stdout.write('\x1Bc');
        printBanner();
        console.log(chalk.blue.bold("=".repeat(30) + " CONFIGURATION DASHBOARD " + "=".repeat(29)));

        const options = [
            ["Inbox Mode", "inbox_mode", !!appConfig.inbox_mode],
            ["DKIM Signing", "dkim_enabled", appConfig.dkim_enabled !== false],
            ["IP-Hiding (SOCKS5)", "hide_ip", appConfig.hide_ip !== false],
            ["PDF Attachments", "attach_pdf", !!appConfig.attach_pdf],
            ["Proxy Validation", "validate_proxies", appConfig.validate_proxies !== false],
        ];

        options.forEach(([label, key, value], i) => {
            const valStr = value ? chalk.green("[ON]") : chalk.red("[OFF]");
            console.log(`  ${i + 1}. ${label.padEnd(30)} ${valStr}`);
        });

        console.log(chalk.blue("-".repeat(85)));
        console.log("  S. START CAMPAIGN");
        console.log("  Q. QUIT");
        console.log(chalk.blue("=".repeat(85)));

        const choice = (await question("\nSelect an option to toggle or 'S' to start: ")).trim().toLowerCase();

        if (choice === 's') {
            readline.close();
            return true;
        } else if (choice === 'q') {
            process.exit(0);
        } else {
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < options.length) {
                const key = options[idx][1];
                appConfig[key] = !options[idx][2];
            }
        }
    }
}

let engineInstance = null;

function formatBar(delivered, total, length = 20) {
    if (total === 0) return chalk.gray("░".repeat(length));
    const filled = Math.floor(delivered / total * length);
    const pct = (delivered / total) * 100;
    const color = pct > 70 ? chalk.green : pct > 30 ? chalk.yellow : chalk.red;
    return color("█".repeat(filled)) + chalk.gray("░".repeat(length - filled));
}

async function main() {
    // Check License
    if (!await checkLicense(baseDir)) {
        process.exit(0);
    }

    const { program } = require('commander');
    program
        .option('--skip-dashboard', 'Skip interactive dashboard')
        .parse(process.argv);

    const options = program.opts();

    const configPath = path.join(baseDir, 'config.json');
    let appConfig = {};
    if (fs.existsSync(configPath)) {
        appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    const templateDir = path.join(__dirname, appConfig.format_folder || 'templates');
    const attachmentTemplateDir = path.join(baseDir, 'templates', 'attachments');

    // External files requirement
    const subjects = loadList(appConfig.subjects_file ? path.join(dataDir, appConfig.subjects_file) : path.join(dataDir, 'subject.txt'), true);
    const recipients = loadList(path.join(baseDir, 'recipients.txt'), true);
    const senderNames = loadList(appConfig.sender_names_file ? path.join(dataDir, appConfig.sender_names_file) : path.join(dataDir, 'senders_name.txt'), true);
    const links = loadList(appConfig.links_file ? path.join(dataDir, appConfig.links_file) : path.join(dataDir, 'link.txt'), true);

    const rawProxies = loadList(path.join(baseDir, 'proxies.txt'));
    const localIps = loadList(path.join(baseDir, 'local_ips.txt'));
    const templates = loadTemplates(templateDir);
    const attachmentTemplates = loadTemplates(attachmentTemplateDir);
    const senderEmails = appConfig.sender_emails || loadList(path.join(baseDir, 'fromEmail.txt'));

    // Launch Dashboard
    if (!options.skipDashboard) {
        await interactiveDashboard(appConfig);
    }

    process.stdout.write('\x1Bc');
    printBanner();

    console.log(chalk.blue("[DF] ") + "xhtml2pdf engine ready");
    console.log(chalk.blue("[TRACKING] ") + "Enabled - Campaign: " + (appConfig.tracking?.campaign_name || "my_campaign_2026"));
    console.log(chalk.blue("[TRACKING] ") + "Server: " + (appConfig.tracking?.server_url || "http://localhost:5000"));
    console.log(chalk.blue("[PROXY POOL] ") + `${rawProxies.length} proxies loaded from encrypted config`);
    console.log(chalk.blue("[PROXY POOL] ") + "Rotation: Round-robin (each email = different proxy IP)");
    if (rawProxies.length > 0) {
        console.log(chalk.blue("[PROXY POOL] ") + `Range: ${rawProxies[0].split(':')[0]}:31100-31163 (brai****)`);
    }
    console.log(chalk.blue("[IP-HIDING] ") + (appConfig.hide_ip ? chalk.green("Enabled") : chalk.red("Disabled (your real IP is visible to the sending proxy)")));
    console.log(chalk.blue("[SENDERS] ") + `Loaded ${senderEmails.length} sender templates from fromEmail.txt`);
    console.log("   Supports tags: [[RECIPIENTDOMAIN]], [[DOMAINNAME]], [[TLD]], [[SENDER_RANDOM_STRING(N)]], etc.");
    senderEmails.slice(0, 3).forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
    if (senderEmails.length > 3) console.log(`    ... and ${senderEmails.length - 3} more`);

    console.log(chalk.blue("[MX-MAILER] ") + "Initialized - Mode: DIRECT (Sending → MX)");
    console.log(chalk.blue("[MX-MAILER] ") + `EHLO: ${appConfig.ehlo_hostname || "monopostco.com"} | Timeout: 25s | Max MX attempts: 3`);
    console.log(chalk.blue("[MX-MAILER] ") + `Proxy rotation: ${rawProxies.length} proxies (round-robin)`);
    console.log(chalk.blue("[MX-MAILER] ") + "Connection pooling: 50 sends/conn | 120s max age");

    appConfig.html_template_paths?.forEach(t => {
        console.log(chalk.blue("[TEMPLATE] ") + `${t} (HTML)`);
    });

    const speed = appConfig.sending_speed || 1;
    const speedLevel = speed <= 2 ? "Very Slow (Safe)" : speed <= 4 ? "Slow (Conservative)" : "Normal";
    console.log(chalk.blue("[SPEED] ") + `Level ${speed}/10 (${speedLevel}) | 200+ emails/min`);
    console.log(chalk.blue("[SETUP] ") + `Threads: ${appConfig.max_threads || 10} | Batch: 20 | Delay: 3.0s`);
    console.log(chalk.blue("[PDF] ") + "Engine: wkhtmltopdf (" + (appConfig.wkhtmltopdf_path || "/usr/bin/wkhtmltopdf") + ")");

    const engine = new CampaignEngine({
        ...appConfig,
        subjects,
        templates,
        attachment_templates: attachmentTemplates,
        recipients,
        proxies: rawProxies,
        local_ips: localIps,
        links,
        senders: senderEmails,
        senderNames
    });

    console.log(chalk.green("[GO] LAUNCHING CAMPAIGN (NODE.JS)"));
    console.log(chalk.white.bold(`${'TIME'.padEnd(10)} ${'STATUS'.padEnd(20)} ${'RECIPIENT'.padEnd(25)} ${'SENDER'.padEnd(25)} ${'PROGRESS'}`));
    console.log("-".repeat(100));

    engineInstance = engine;
    const stats = await engine.run(deliveryCallback);

    const duration = (stats.endTime - stats.startTime) / 1000;
    const throughput = (stats.delivered + stats.failed) / (duration / 60) || 0;
    const successRate = (stats.delivered / stats.total * 100) || 0;

    console.log("\n" + chalk.green("=".repeat(85)));
    console.log(chalk.green("OPERATION COMPLETE - MAGXXIC V2.2.1 (NODE.JS)"));
    console.log(chalk.green("=".repeat(85)));

    console.log(chalk.white.bold("[DELIVERY STATISTICS]"));
    console.log(`  DELIVERED:    ${chalk.green(stats.delivered + " emails")}`);
    console.log(`  FAILED:       ${chalk.red(stats.failed + " emails")}`);
    console.log(`  TOTAL:        ${stats.total} emails`);
    const rateColor = successRate > 80 ? chalk.green : successRate > 20 ? chalk.yellow : chalk.red;
    console.log(`  SUCCESS RATE: ${rateColor(successRate.toFixed(1) + "%")} (${successRate > 80 ? 'HEALTHY' : successRate > 20 ? 'DEGRADED' : 'CRITICAL'})`);

    console.log("\n" + chalk.white.bold("[PERFORMANCE METRICS]"));
    console.log(`  DURATION:     ${chalk.cyan(duration.toFixed(1) + "s")}`);
    console.log(`  THROUGHPUT:   ${chalk.cyan(throughput.toFixed(1) + " emails/minute")}`);

    console.log("\n" + chalk.blue("-".repeat(85)));
    console.log(chalk.white.bold("DOMAIN ENGAGEMENT REPORT"));
    console.log(chalk.blue("-".repeat(85)));

    Object.entries(stats.domainEngagement).sort((a,b) => (b[1].delivered+b[1].failed) - (a[1].delivered+a[1].failed)).slice(0, 15).forEach(([domain, data]) => {
        const dTotal = data.delivered + data.failed;
        const dRate = (data.delivered / dTotal * 100) || 0;
        const bar = formatBar(data.delivered, dTotal);
        console.log(`  ${domain.padEnd(30)} ${bar} ${dRate.toFixed(0).padStart(3)}% (${data.delivered}/${dTotal})`);
    });

    console.log(chalk.blue("=".repeat(85)));
    process.exit(0);
}

main().catch(err => {
    console.error(chalk.red(err));
    process.exit(1);
});
