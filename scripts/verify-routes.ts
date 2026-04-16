import axios from 'axios';

async function verifyRoutes() {
    console.log('--- STARTING ROUTE VERIFICATION ---\n');
    const api = axios.create({ baseURL: 'http://localhost:4000/api/v1' });

    try {
        // 1. Login to get token
        console.log('Authenticating...');
        const loginRes = await api.post('/auth/login', { email: 'superadmin@monitor.io', password: 'password123' });
        const token = loginRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // 1b. Test Diagnostic Route
        console.log('Testing GET /config/health-check');
        const healthRes = await api.get('/config/health-check', config);
        console.log(`  - Status: ${healthRes.status} | Body: ${JSON.stringify(healthRes.data)}`);

        console.log('Testing GET /config/debug/catalog');
        const debugCatRes = await api.get('/config/debug/catalog', config);
        console.log(`  - Status: ${debugCatRes.status} | Body Size: ${JSON.stringify(debugCatRes.data).length}`);

        const siteId = 'store_001';

        // 2. Test Base Config
        console.log(`Testing GET /config/p/${siteId}`);
        const baseRes = await api.get(`/config/p/${siteId}`, config);
        console.log(`  - Status: ${baseRes.status} | Success: ${!!baseRes.data}`);

        // 3. Test Integrations Catalog
        console.log(`Testing GET /config/p/${siteId}/integrations/catalog`);
        const catRes = await api.get(`/config/p/${siteId}/integrations/catalog`, config);
        console.log(`  - Status: ${catRes.status} | Catalog Size: ${catRes.data.length}`);

        // 4. Test Access Keys
        console.log(`Testing GET /config/p/${siteId}/access-control/keys`);
        const keyRes = await api.get(`/config/p/${siteId}/access-control/keys`, config);
        console.log(`  - Status: ${keyRes.status} | Keys Found: ${keyRes.data.length}`);

        console.log('\n✅ ALL ROUTES VERIFIED SUCCESSFULLY.');
    } catch (err: any) {
        console.error('❌ Route Verification Failed:', err.response?.status, err.response?.data || err.message);
    }
}

verifyRoutes();
