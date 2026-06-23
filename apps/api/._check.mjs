import { prisma } from '@kpi-platform/db';
try {
  const total = await prisma.storefrontSession.count();
  console.log('TOTAL storefront_sessions:', total);
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(device_type,'(null)') AS device, COUNT(*)::int AS c
    FROM storefront_sessions GROUP BY device_type ORDER BY c DESC LIMIT 25`;
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  await prisma.$disconnect();
}
