const fs=require('fs');
for(const l of fs.readFileSync('.env','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m){process.env[m[1]]=m[2].replace(/^"|"$/g,'');}}
const { PrismaClient } = require('.prisma/tenant-client');
const { prisma: controlPrisma, decryptString } = require('@kpi-platform/db');
(async()=>{
for (const cid of ['7a4e1e90-35c7-4c92-ade8-cadc0dd5efd3','f5bad586-3775-40f5-9927-b524fed5d1c6']){
  console.log('=== connector', cid, '===');
  try {
    const row = await controlPrisma.tenantDatabase.findUnique({ where: { connectorInstanceId: cid }});
    if(!row){ console.log('NO ROW'); continue; }
    console.log('status', row.status, 'db', row.dbName);
    const secret = decryptString(row.encryptedSecret);
    const url = JSON.parse(secret).url;
    console.log('url =>', url ? url.replace(/:[^:@]+@/, ':***@') : null);
    const db = new PrismaClient({ datasources:{ db:{ url }}});
    const since = new Date(Date.now()-5*60*1000);
    const rows = await db.$queryRaw`SELECT COUNT(DISTINCT visitor_id)::bigint AS lv, COUNT(*)::bigint AS ls FROM storefront_sessions WHERE connector_instance_id=${cid} AND last_active_at >= ${since}`;
    console.log('OK rows', JSON.stringify(rows, (k,v)=>typeof v==='bigint'?Number(v):v));
    await db.$disconnect();
  } catch(e){ console.log('ERROR:', e.message); }
}
await controlPrisma.$disconnect();
})();
