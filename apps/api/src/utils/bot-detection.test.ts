import { describe, it, expect } from 'vitest';
import { classifyUserAgent, BOT_UA_SQL_PATTERN } from './bot-detection';

describe('classifyUserAgent', () => {
    it('lets real browsers through', () => {
        const humans = [
            // Desktop Chrome
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // iPhone Safari
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
            // Android Chrome
            'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
            // Firefox
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        ];
        for (const ua of humans) {
            expect(classifyUserAgent(ua), ua).toEqual({ isBot: false, botName: null });
        }
    });

    it('identifies our own synthetic monitor specifically, not as a generic bot', () => {
        const ua =
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'HeadlessChrome/120.0.6099.109 Safari/537.36 AppmentoSynthetic/1.0';
        // The UA also contains "HeadlessChrome"; the synthetic rule must win so
        // our traffic stays distinguishable from third-party automation.
        expect(classifyUserAgent(ua)).toEqual({ isBot: true, botName: 'appmento-synthetic' });
    });

    it('flags crawlers, automation and scripted clients', () => {
        const cases: Array<[string, string]> = [
            ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'googlebot'],
            ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'bingbot'],
            ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'ahrefsbot'],
            ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1)', 'ai-crawler'],
            ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'social-unfurler'],
            ['Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36', 'headless-browser'],
            ['curl/8.4.0', 'http-client'],
            ['python-requests/2.31.0', 'http-client'],
        ];
        for (const [ua, expected] of cases) {
            expect(classifyUserAgent(ua).botName, ua).toBe(expected);
            expect(classifyUserAgent(ua).isBot, ua).toBe(true);
        }
    });

    it('treats a missing user agent as a bot', () => {
        // Every real browser sends one; absence means a scripted client.
        expect(classifyUserAgent(null)).toEqual({ isBot: true, botName: 'no-user-agent' });
        expect(classifyUserAgent('')).toEqual({ isBot: true, botName: 'no-user-agent' });
        expect(classifyUserAgent('   ')).toEqual({ isBot: true, botName: 'no-user-agent' });
    });

    it('does not mistake device names containing "bot" for bots', () => {
        // CUBOT is a real Android phone brand — the catch-all rule matches
        // standalone tokens only, precisely so this stays a human session.
        const ua =
            'Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/96.0.4664.104 Mobile Safari/537.36';
        expect(classifyUserAgent(ua)).toEqual({ isBot: false, botName: null });
    });

    it('keeps the SQL backfill pattern in step with the runtime rules', () => {
        // The migration backfills historical rows with SQL regexes rather than
        // this function. Drift between the two would silently misclassify
        // history, so every token in the SQL pattern must also be caught here.
        const sqlTokens = BOT_UA_SQL_PATTERN.split('|').filter((t) => t && !t.includes(' '));
        const missed = sqlTokens.filter((token) => !classifyUserAgent(`Mozilla/5.0 ${token}`).isBot);
        expect(missed).toEqual([]);
    });
});
