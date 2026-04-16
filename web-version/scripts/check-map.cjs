const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8080';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();
        const location = msg.location ? `${msg.location.url}:${msg.location.lineNumber}` : '';
        const out = `[console:${type}] ${text} ${location}`.trim();
        console.log(out);
    });

    page.on('pageerror', (err) => {
        console.log(`[pageerror] ${err.message}`);
    });

    try {
        console.log(`Navigating to ${url} ...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        const screenshotPath = 'map-screenshot.png';
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`Saved screenshot: ${screenshotPath}`);
    } catch (err) {
        console.log('[error]', err.message || err);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();
