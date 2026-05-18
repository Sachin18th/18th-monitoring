import { Alert, AlertSeverity } from '../utils/alerting/types';

export class NotificationService {
  static async notify(alert: Alert) {
    console.log(`[NotificationService] 🔔 Dispatching notification for Alert: ${alert.title} (${alert.severity})`);

    // 1. Slack Adapter (Simulated)
    if (alert.severity === AlertSeverity.CRITICAL || alert.severity === AlertSeverity.HIGH) {
      this.sendToSlack(alert);
    }

    // 2. Email Adapter (Simulated)
    if (alert.severity === AlertSeverity.CRITICAL) {
      this.sendEmail(alert);
    }

    // 3. Webhook Adapter (Simulated)
    this.triggerWebhook(alert);
  }

  private static sendToSlack(alert: Alert) {
    console.log(`[Slack] [${alert.severity}] ALERT: ${alert.title} - ${alert.message} | Link: /project/${alert.siteId}/observability/alerts`);
  }

  private static sendEmail(alert: Alert) {
    console.log(`[Email] To: on-call@example.com | Subject: CRITICAL ALERT - ${alert.title}`);
  }

  private static triggerWebhook(alert: Alert) {
    console.log(`[Webhook] POST https://external-system.com/alerts | Payload: ${JSON.stringify({ id: alert.id, status: 'triggered' })}`);
  }
}
