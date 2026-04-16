const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8080';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();
        console.log(`[console:${type}] ${text}`);
    });

    page.on('pageerror', (err) => {
        console.log(`[pageerror] ${err.message}`);
        console.log(err.stack);
    });

    try {
        console.log(`Navigating to ${url} ...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // Wait a bit for initial render
        await page.waitForTimeout(1000);

        // Log all network errors
        const requests = [];
        page.on('response', (res) => {
            if (!res.ok() && res.status() >= 400) {
                requests.push(`${res.status()} ${res.url()}`);
            }
        });

        const screenshotPath = 'debug-screenshot.png';
        await page.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot: ${screenshotPath}`);

    } catch (err) {
        console.log('[error]', err.message || err);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();
