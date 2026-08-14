-- Backfills customer_profiles.metadata.firstName/lastName from the display name
-- the tracker already captured on sessions.
--
-- Some platforms expose a name without an email: Magento's customer section
-- returns fullname but not the address unless extended. Those shoppers ARE
-- identified, but the resolver only stored email/phone/external-id, so the
-- Customers pages — which build a label from metadata.firstName/lastName and
-- fall back to the email local part — had nothing to show and rendered "Guest".
--
-- The resolver now persists the name going forward (IdentityResolver
-- .splitDisplayName); this recovers the profiles already created.
--
-- Never overwrites an existing name: one synced from the platform's own customer
-- record is more authoritative than one read off a storefront page.

WITH names AS (
    SELECT s.customer_profile_id AS pid,
           -- Most recent non-empty name wins.
           (array_agg(btrim(s.metadata -> 'identity' ->> 'customer_name')
                      ORDER BY s.last_active_at DESC))[1] AS nm
      FROM storefront_sessions s
     WHERE s.customer_profile_id IS NOT NULL
       AND btrim(COALESCE(s.metadata -> 'identity' ->> 'customer_name', '')) <> ''
     GROUP BY 1
)
UPDATE customer_profiles p
   SET metadata = jsonb_strip_nulls(
         COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
           'firstName', left(split_part(n.nm, ' ', 1), 100),
           -- Everything after the first space; NULL when the name is one word,
           -- and stripped out by jsonb_strip_nulls.
           'lastName',  NULLIF(left(btrim(substr(n.nm, length(split_part(n.nm, ' ', 1)) + 2)), 100), '')
         )
       )
  FROM names n
 WHERE p.id = n.pid
   AND COALESCE(p.metadata ->> 'firstName', '') = ''
   AND COALESCE(p.metadata ->> 'lastName', '')  = '';
