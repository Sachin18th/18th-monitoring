/**
 * User-agent based bot classification for storefront sessions.
 *
 * Sessions are FLAGGED, never dropped — bot volume is itself useful, and a
 * misclassification you cannot undo is worse than one you can filter out.
 *
 * Only bots that execute JavaScript ever reach us (the tracker has to run for a
 * session to exist), so this list is deliberately short: the big rendering
 * crawlers, the SEO suites, headless automation, and our own synthetic monitor.
 *
 * The synthetic entry is first on purpose — our own monitoring drives a real
 * Chromium over client storefronts on a schedule, so it is the single largest
 * source of non-human sessions on any store carrying the tracker. It tags
 * itself with a UA suffix (see apps/synthetic-agent/src/flows.ts) so it is
 * identified rather than guessed at.
 */

interface BotRule {
    /** Stable label stored in storefront_sessions.bot_name. */
    name: string;
    /** Matched case-insensitively against the raw user agent. */
    pattern: RegExp;
}

const BOT_RULES: BotRule[] = [
    // Ours — matched first so it is never mislabelled as a generic crawler.
    { name: 'appmento-synthetic', pattern: /AppmentoSynthetic/i },

    // Search engines that render JavaScript.
    { name: 'googlebot', pattern: /googlebot|google-inspectiontool|storebot-google/i },
    { name: 'bingbot', pattern: /bingbot|adidxbot/i },
    { name: 'yandexbot', pattern: /yandex(bot|images|mobilebot)/i },
    { name: 'duckduckbot', pattern: /duckduckbot/i },
    { name: 'baiduspider', pattern: /baiduspider/i },
    { name: 'applebot', pattern: /applebot/i },

    // SEO / marketing crawlers.
    { name: 'ahrefsbot', pattern: /ahrefsbot|ahrefssiteaudit/i },
    { name: 'semrushbot', pattern: /semrushbot|siteauditbot/i },
    { name: 'mj12bot', pattern: /mj12bot/i },
    { name: 'dotbot', pattern: /dotbot|rogerbot/i },
    { name: 'screaming-frog', pattern: /screaming frog/i },

    // AI / LLM crawlers.
    { name: 'ai-crawler', pattern: /gptbot|oai-searchbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|ccbot|bytespider|google-extended|meta-externalagent/i },

    // Social unfurlers — fire on link shares, look like real visits.
    { name: 'social-unfurler', pattern: /facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|pinterest(bot)?|redditbot/i },

    // Headless automation. Note this only catches the ones that admit it —
    // Puppeteer and Playwright can be told to send an ordinary Chrome UA, which
    // is why navigator.webdriver is the stronger signal to add to the tracker.
    { name: 'headless-browser', pattern: /headlesschrome|phantomjs|electron\/|puppeteer|playwright|selenium|webdriver|cypress/i },

    // Uptime / performance monitoring.
    { name: 'monitoring', pattern: /pingdom|uptimerobot|statuscake|site24x7|newrelicsynthetics|datadog|gtmetrix|lighthouse|chrome-lighthouse|pagespeed|pagespeedinsights/i },

    // Generic libraries — never a real shopper's browser.
    { name: 'http-client', pattern: /curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios\/|node-fetch|got \(|libwww-perl|scrapy|httpclient/i },

    // Catch-all, deliberately last so a specific rule always wins. Kept narrow:
    // "bot", "crawler", "spider" as standalone-ish tokens rather than anywhere
    // in the string, so e.g. "CUBOT" (an Android phone brand) is not caught.
    { name: 'generic-bot', pattern: /(^|[^a-z])(bot|crawler|spider|scraper|archiver)([^a-z]|$)/i },
];

export interface BotVerdict {
    isBot: boolean;
    /** Stable label when isBot, else null. */
    botName: string | null;
}

const NOT_A_BOT: BotVerdict = { isBot: false, botName: null };

/**
 * Classify a session's user agent.
 *
 * A missing user agent is treated as a bot: every real browser sends one, so an
 * absent header means a scripted client or a stripped request.
 */
export function classifyUserAgent(userAgent: string | null | undefined): BotVerdict {
    if (!userAgent || !userAgent.trim()) {
        return { isBot: true, botName: 'no-user-agent' };
    }
    for (const rule of BOT_RULES) {
        if (rule.pattern.test(userAgent)) {
            return { isBot: true, botName: rule.name };
        }
    }
    return NOT_A_BOT;
}

/**
 * SQL boolean expression matching bot user agents, for the backfill migration
 * and any ad-hoc reclassification. Kept in sync with BOT_RULES by the test in
 * bot-detection.test.ts — if you add a rule above, add its token here.
 */
export const BOT_UA_SQL_PATTERN =
    'appmentosynthetic|googlebot|google-inspectiontool|storebot-google|bingbot|adidxbot|' +
    'yandexbot|yandeximages|yandexmobilebot|duckduckbot|baiduspider|applebot|' +
    'ahrefsbot|ahrefssiteaudit|semrushbot|siteauditbot|mj12bot|dotbot|rogerbot|screaming frog|' +
    'gptbot|oai-searchbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|ccbot|bytespider|' +
    'google-extended|meta-externalagent|' +
    'facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|' +
    'discordbot|pinterest|redditbot|' +
    'headlesschrome|phantomjs|electron/|puppeteer|playwright|selenium|webdriver|cypress|' +
    'pingdom|uptimerobot|statuscake|site24x7|newrelicsynthetics|datadog|gtmetrix|lighthouse|' +
    'pagespeed|curl/|wget/|python-requests|python-urllib|go-http-client|okhttp|axios/|' +
    'node-fetch|libwww-perl|scrapy|httpclient';
