-- Widen campaign_messages.trigger to fit "group:<uuid>" keys (group campaigns).
-- Fused segment names fit in 40; a group key is "group:" + 36-char uuid = 42.
ALTER TABLE "campaign_messages" ALTER COLUMN "trigger" TYPE VARCHAR(80);
