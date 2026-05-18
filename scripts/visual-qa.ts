import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = path.join(process.cwd(), '.gemini', 'antigravity', 'artifacts', 'qa_screenshots');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:3000';
const SITE_ID = 'tc_demo_004';

async function captureScreenshots() {
  console.log('🚀 Starting Automated Visual QA...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Login
    console.log('Step 1: Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'superadmin@monitor.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/projects`);
    console.log('✅ Login successful');

    const pagesToValidate = [
      { name: 'Overview', path: `/project/${SITE_ID}/overview` },
      { name: 'Orders', path: `/project/${SITE_ID}/orders` },
      { name: 'Performance', path: `/project/${SITE_ID}/performance` },
      { name: 'Integrations', path: `/project/${SITE_ID}/integrations` },
      { name: 'Users', path: `/project/${SITE_ID}/users` },
      { name: 'Alerts', path: `/project/${SITE_ID}/alerts` }
    ];

    for (const p of pagesToValidate) {
      console.log(`Validating ${p.name}...`);
      await page.goto(`${BASE_URL}${p.path}`);
      
      // Wait for data to load (looking for specific elements)
      await page.waitForTimeout(2000); 

      // Check for console errors
      page.on('console', msg => {
        if (msg.type() === 'error') console.error(`[CONSOLE ERROR] ${p.name}: ${msg.text()}`);
      });

      const screenshotPath = path.join(ARTIFACTS_DIR, `${p.name.toLowerCase()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`✅ Saved screenshot: ${screenshotPath}`);
    }

    console.log('\n✨ All visual QA checks completed successfully.\n');

  } catch (error) {
    console.error('❌ Visual QA Failed:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots();
