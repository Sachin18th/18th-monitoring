import { Browser, Page, chromium, devices } from 'playwright';

/**
 * Suffix appended to every synthetic run's user agent.
 *
 * These journeys drive a real Chromium over the client's storefront on a
 * schedule, so on any store carrying our tracker they register as ordinary
 * mobile and desktop sessions — inflating RUM and Journey Intel with our own
 * traffic. Tagging the UA lets the ingest path label them precisely
 * ('appmento-synthetic') instead of inferring "some kind of bot", which keeps
 * our monitoring distinguishable from third-party crawlers in the data.
 *
 * Must stay in step with the matching rule in
 * apps/api/src/utils/bot-detection.ts.
 */
const SYNTHETIC_UA_SUFFIX = 'AppmentoSynthetic/1.0';

/**
 * Playwright context options for a run, carrying the synthetic UA tag.
 *
 * Built from the device preset so mobile runs keep the iPhone viewport, touch
 * support and device-scale factor — only the user agent is extended.
 *
 * Desktop has no preset user agent, so one is built from the live browser
 * version rather than left to Playwright's default: an unset UA would arrive as
 * plain HeadlessChrome and be classified as a generic headless browser instead
 * of as our monitoring. "HeadlessChrome" is deliberately kept in the string —
 * the goal is to label our traffic, not to disguise it from the merchant.
 *
 * The extra header is for the merchant's benefit: it makes our requests
 * identifiable in their own server logs, where our user agent is all they'd
 * otherwise have to go on.
 */
function syntheticContextOptions(browser: Browser, isMobile: boolean) {
    const preset = isMobile ? devices['iPhone 13'] : {};
    const presetUa = (preset as { userAgent?: string }).userAgent;
    const desktopUa =
        `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `HeadlessChrome/${browser.version()} Safari/537.36`;
    return {
        ...preset,
        userAgent: `${presetUa || desktopUa} ${SYNTHETIC_UA_SUFFIX}`,
        extraHTTPHeaders: { 'X-Appmento-Synthetic': '1' },
    };
}

export interface JourneyResult {
    journey_name: string;
    device_type: 'desktop' | 'mobile';
    browser: string;
    success_status: boolean;
    step_name?: string;
    execution_time: number;
    error_logs?: string;
    screenshot_path?: string;
    metrics: {
        lcp?: number;
        cls?: number;
        ttfb?: number;
    };
}

async function captureMetrics(page: Page) {
    return await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = performance.getEntriesByType('paint');
        const lcpEntry = performance.getEntriesByType('largest-contentful-paint').pop() as any;
        
        return {
            ttfb: perf ? Math.round(perf.responseStart - perf.requestStart) : 0,
            lcp: lcpEntry ? Math.round(lcpEntry.startTime) : 0,
            cls: 0, // Simplified for mock
        };
    });
}

export async function runHomepageJourney(targetUrl: string, isMobile: boolean): Promise<JourneyResult> {
    const startTime = Date.now();
    const browser = await chromium.launch();
    const context = await browser.newContext(syntheticContextOptions(browser, isMobile));
    const page = await context.newPage();
    
    let result: JourneyResult = {
        journey_name: 'Homepage Load',
        device_type: isMobile ? 'mobile' : 'desktop',
        browser: 'chromium',
        success_status: false,
        execution_time: 0,
        metrics: {}
    };

    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        result.success_status = true;
        result.metrics = await captureMetrics(page);
    } catch (error: any) {
        result.error_logs = error.message;
        result.step_name = 'Initial Load';
    } finally {
        result.execution_time = Date.now() - startTime;
        await browser.close();
    }
    return result;
}

export async function runLoginJourney(targetUrl: string, isMobile: boolean): Promise<JourneyResult> {
    const startTime = Date.now();
    const browser = await chromium.launch();
    const context = await browser.newContext(syntheticContextOptions(browser, isMobile));
    const page = await context.newPage();
    
    let result: JourneyResult = {
        journey_name: 'Login Flow',
        device_type: isMobile ? 'mobile' : 'desktop',
        browser: 'chromium',
        success_status: false,
        execution_time: 0,
        metrics: {}
    };

    try {
        await page.goto(`${targetUrl}/login`, { waitUntil: 'networkidle' });
        
        // Simulate login steps
        await page.fill('input[type="email"]', 'admin@store001.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        
        // Wait for navigation or specific element on dashboard
        await page.waitForTimeout(2000); // Mock wait for simulation
        
        result.success_status = true;
        result.metrics = await captureMetrics(page);
    } catch (error: any) {
        result.error_logs = error.message;
        result.step_name = 'Form Submission';
    } finally {
        result.execution_time = Date.now() - startTime;
        await browser.close();
    }
    return result;
}

export async function runProtectedAccessJourney(targetUrl: string, isMobile: boolean): Promise<JourneyResult> {
    const startTime = Date.now();
    const browser = await chromium.launch();
    const context = await browser.newContext(syntheticContextOptions(browser, isMobile));
    const page = await context.newPage();
    
    let result: JourneyResult = {
        journey_name: 'Protected Route Access',
        device_type: isMobile ? 'mobile' : 'desktop',
        browser: 'chromium',
        success_status: false,
        execution_time: 0,
        metrics: {}
    };

    try {
        // Accessing a protected route without being logged in should redirect
        await page.goto(`${targetUrl}/project/store_001/performance`, { waitUntil: 'networkidle' });
        
        const url = page.url();
        if (url.includes('/login')) {
            result.success_status = true; // Expected behavior: redirected to login
        } else {
            result.success_status = false;
            result.error_logs = 'Failed to redirect to login on unauthorized access';
        }
    } catch (error: any) {
        result.error_logs = error.message;
    } finally {
        result.execution_time = Date.now() - startTime;
        await browser.close();
    }
    return result;
}
