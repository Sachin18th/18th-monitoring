-- Bot classification for storefront sessions.
--
-- user_agent has always been captured, so existing sessions can be classified
-- retroactively — the backfill at the end of this migration reclassifies all
-- history rather than only fixing traffic from here on.
--
-- Sessions are flagged, never deleted: bot volume is a useful figure, and RUM /
-- Journey Intel filter on is_bot = false instead of losing the rows.

ALTER TABLE storefront_sessions
  ADD COLUMN IF NOT EXISTS is_bot   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bot_name VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_storefront_session_bot
  ON storefront_sessions (connector_instance_id, is_bot);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Order matters: the most specific label must win, so our own synthetic monitor
-- is matched before the generic crawler catch-all. Mirrors BOT_RULES in
-- apps/api/src/utils/bot-detection.ts.

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'appmento-synthetic'
 WHERE bot_name IS NULL AND user_agent ILIKE '%appmentosynthetic%';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'googlebot'
 WHERE bot_name IS NULL AND user_agent ~* '(googlebot|google-inspectiontool|storebot-google)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'bingbot'
 WHERE bot_name IS NULL AND user_agent ~* '(bingbot|adidxbot)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'other-search-engine'
 WHERE bot_name IS NULL AND user_agent ~* '(yandex(bot|images|mobilebot)|duckduckbot|baiduspider|applebot)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'seo-crawler'
 WHERE bot_name IS NULL AND user_agent ~* '(ahrefsbot|ahrefssiteaudit|semrushbot|siteauditbot|mj12bot|dotbot|rogerbot|screaming frog)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'ai-crawler'
 WHERE bot_name IS NULL AND user_agent ~* '(gptbot|oai-searchbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|ccbot|bytespider|google-extended|meta-externalagent)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'social-unfurler'
 WHERE bot_name IS NULL AND user_agent ~* '(facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|pinterest|redditbot)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'headless-browser'
 WHERE bot_name IS NULL AND user_agent ~* '(headlesschrome|phantomjs|electron/|puppeteer|playwright|selenium|webdriver|cypress)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'monitoring'
 WHERE bot_name IS NULL AND user_agent ~* '(pingdom|uptimerobot|statuscake|site24x7|newrelicsynthetics|datadog|gtmetrix|lighthouse|pagespeed)';

UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'http-client'
 WHERE bot_name IS NULL AND user_agent ~* '(curl/|wget/|python-requests|python-urllib|go-http-client|okhttp|axios/|node-fetch|libwww-perl|scrapy|httpclient)';

-- Narrow catch-all: standalone tokens only, so device names containing "bot"
-- (e.g. the CUBOT Android range) are not swept up.
UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'generic-bot'
 WHERE bot_name IS NULL AND user_agent ~* '(^|[^a-z])(bot|crawler|spider|scraper|archiver)([^a-z]|$)';

-- Every real browser sends a user agent; its absence means a scripted client.
UPDATE storefront_sessions SET is_bot = TRUE, bot_name = 'no-user-agent'
 WHERE bot_name IS NULL AND (user_agent IS NULL OR btrim(user_agent) = '');
