import axios from 'axios';

async function verifyPerfectRoutes() {
    console.log('--- STARTING PORT 4005 VERIFICATION ---\n');
    const api = axios.create({ baseURL: 'http://localhost:4005/api/v1' });

    try {
        // 1. Login
        console.log('Authenticating...');
        const loginRes = await api.post('/auth/login', { email: 'superadmin@monitor.io', password: 'password123' });
        const token = loginRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // 2. Test Scoped Catalog
        const siteId = 'store_001';
        console.log(`Testing GET /config/p/${siteId}/integrations/catalog`);
        const catRes = await api.get(`/config/p/${siteId}/integrations/catalog`, config);
        console.log(`  - Status: ${catRes.status} | Catalog Size: ${catRes.data.length}`);

        // 3. Test Scoped Keys
        console.log(`Testing GET /config/p/${siteId}/access-control/keys`);
        const keyRes = await api.get(`/config/p/${siteId}/access-control/keys`, config);
        console.log(`  - Status: ${keyRes.status} | Keys Found: ${keyRes.data.length}`);

        console.log('\n✅ 100% VERIFIED ON PORT 4005.');
    } catch (err: any) {
        console.error('❌ Verification Failed on 4005:', err.response?.status, err.response?.data || err.message);
    }
}

verifyPerfectRoutes();
