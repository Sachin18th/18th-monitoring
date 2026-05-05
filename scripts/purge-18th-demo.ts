import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ADMIN_EMAIL = 'superadmin@18thdigitech.com'; // Or any other super admin
const ADMIN_PWD = 'Demo@1234!';

async function purge() {
    console.log('🚀 Initiating remote purge of 18th Digitech demo data...');

    try {
        // 1. Login to get token
        console.log('🔑 Authenticating as Super Admin...');
        const loginRes = await axios.post(`${API_BASE}/api/v1/auth/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PWD
        });

        const token = loginRes.data.data.token;

        // 2. Trigger Purge
        console.log('🧹 Sending purge request...');
        const purgeRes = await axios.post(`${API_BASE}/api/v1/admin/demo/purge`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (purgeRes.data.success) {
            console.log('✅ Purge successful:', purgeRes.data.message);
        } else {
            console.error('❌ Purge failed:', purgeRes.data.error);
        }
    } catch (error: any) {
        console.error('❌ Error during purge:', error.response?.data?.message || error.message);
        console.log('\nNote: Ensure the API server is running on ' + API_BASE);
    }
}

purge();
