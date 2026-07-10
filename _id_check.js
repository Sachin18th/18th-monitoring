const { prisma, decryptEmail } = require('@kpi-platform/db');
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, connector_instance_id, external_ids->>'shopify' AS shopify_id, email_encrypted, metadata->>'firstName' AS first, metadata->>'lastName' AS last
         FROM customer_profiles WHERE external_ids->>'shopify' = $1 LIMIT 5`,
      '10018291876062'
    );
    if (!rows.length) console.log('>> NO synced profile for shopify id 10018291876062');
    for (const r of rows) console.log('>> MATCH', { connector: r.connector_instance_id,
      name: [r.first, r.last].filter(Boolean).join(' ') || null,
      email: r.email_encrypted ? decryptEmail(r.email_encrypted) : null });
    const total = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM customer_profiles WHERE external_ids ? 'shopify'`);
    console.log('>> total shopify-synced profiles:', total[0].c);
  } catch (e) { console.error('>> ERR', e.message); } finally { await prisma.$disconnect(); }
})();
