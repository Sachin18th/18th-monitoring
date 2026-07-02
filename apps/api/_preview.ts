import { NotificationService } from './src/services/notification.service';
const N: any = NotificationService;
const rows = [{
  severity: 'CRITICAL', rule: 'No orders coming in', metric: 'order_count', metricFamily: 'orders',
  value: 0, operator: '<', threshold: 1, windowMinutes: 60, message: 'Orders received is 0',
}];
const { html } = N.renderAlertEmail('proj_ff5698bbae931d3a', rows);
require('fs').writeFileSync('/tmp/claude-1000/-var-www-html-kpi-monitoring/b6b1964d-37af-44b7-8c04-4ef03cea4f67/scratchpad/preview.html', html);
console.log('OK', html.length, 'bytes');
