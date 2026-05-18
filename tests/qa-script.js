const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.join('C:\\', 'kpi monitoring', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
    console.log("Starting QA Script...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    const errors = [];
    page.on('pageerror', err => {
        errors.push(`PageError: ${err.message}`);
    });
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(`ConsoleError: ${msg.text()}`);
        }
    });

    const checkErrorOverlay = async (routeName) => {
        const hasOverlay = await page.evaluate(() => {
            return !!document.querySelector('body > nextjs-portal');
        }).catch(() => false);
        
        if (hasOverlay) {
            console.error(`Crash detected on route: ${routeName}`);
            errors.push(`Next.js Error Overlay detected on ${routeName}`);
        }
    };

    const visit = async (url, name) => {
        console.log(`Visiting ${url} ...`);
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 }).catch(e => console.log(e.message));
        await new Promise(r => setTimeout(r, 1000)); // allow paints
        await checkErrorOverlay(name);
        await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`), fullPage: true });
    };

    try {
        // 1. Visit Login
        await visit('http://localhost:3000/login', '01-login');
        
        // 2. Perform Login as Super Admin
        console.log("Logging in...");
        // Click the Super Admin demo shortcut
        const buttons = await page.$$('button');
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text === 'Super Admin') {
                await btn.click();
                break;
            }
        }
        
        // Click Sign In
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text === 'Sign In') {
                await btn.click();
                break;
            }
        }

        // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000)); // Allow redirect and loading
        
        // 3. Landing page
        const currentUrl = page.url();
        console.log(`Now at: ${currentUrl}`);
        await page.screenshot({ path: path.join(screenshotsDir, '02-landing.png'), fullPage: true });

        // 4. Visit project pages
        const routes = [
            'overview',
            'alerts',
            'customers',
            'integrations',
            'orders',
            'performance',
            'settings',
            'users'
        ];

        let index = 3;
        for (const route of routes) {
            const url = `http://localhost:3000/project/store_001/${route}`;
            const numStr = index.toString().padStart(2, '0');
            await visit(url, `${numStr}-store_001-${route}`);
            index++;
        }

        // 5. Check another project
        await visit('http://localhost:3000/project/store_003/overview', '11-store_003-overview');

    } catch (e) {
        console.error("QA Script error:", e);
    } finally {
        await browser.close();
        console.log("--- QA SCRIPT COMPLETE ---");
        console.log("Errors captured:", errors);
        fs.writeFileSync(path.join(screenshotsDir, 'qa-report.json'), JSON.stringify({ errors }, null, 2));
    }
})();
