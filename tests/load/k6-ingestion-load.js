import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 500 }, // Ramping aggressive simulated JS Agent connections mapping globally
    { duration: '1m', target: 500 },  // Testing threshold saturation scaling
    { duration: '10s', target: 0 },   // Clean tear down mappings cleanly
  ],
};

export default function () {
    const url = 'http://localhost:3000/api/v1/i/browser';
    const payload = JSON.stringify({
        siteId: 'store_perf_test',
        events: [{ eventType: 'page_view', timestamp: new Date().toISOString() }]
    });

    const headers = { 'Content-Type': 'application/json' };
    const res = http.post(url, payload, { headers });

    // Validate boundaries dropping effectively explicitly 
    check(res, {
        'is status 200 mapping response': (r) => r.status === 200,
    });
}
