import { Alert, Incident, IncidentStatus } from '../utils/alerting/types';
import crypto from 'crypto';

export class IncidentService {
  private static activeIncidents: Map<string, Incident> = new Map();

  static async handleAlert(alert: Alert): Promise<Incident> {
    // 1. Deduplication: Check if an active incident already exists for this rule and site
    const existingIncident = Array.from(this.activeIncidents.values()).find(
      i => i.siteId === alert.siteId && i.status !== IncidentStatus.RESOLVED && i.title === alert.title
    );

    if (existingIncident) {
      existingIncident.linkedAlertIds.push(alert.id);
      existingIncident.updatedAt = new Date().toISOString();
      return existingIncident;
    }

    // 2. Create new incident
    const incident: Incident = {
      id: `INC-${crypto.randomInt(1000, 9999)}`,
      title: alert.title,
      severity: alert.severity,
      status: IncidentStatus.OPEN,
      siteId: alert.siteId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedAlertIds: [alert.id],
      evidenceReferences: alert.evidence ? [JSON.stringify(alert.evidence)] : [],
      impact: alert.message || 'Inferred from linked signals',
      owner: 'SRE On-Call'
    };

    this.activeIncidents.set(incident.id, incident);
    console.log(`[IncidentService] 🔥 New Incident Created: ${incident.id} - ${incident.title}`);
    
    return incident;
  }

  static getActiveIncidents(siteId?: string): Incident[] {
    const all = Array.from(this.activeIncidents.values());
    return siteId ? all.filter(i => i.siteId === siteId) : all;
  }

  static resolveIncident(incidentId: string) {
    const incident = this.activeIncidents.get(incidentId);
    if (incident) {
      incident.status = IncidentStatus.RESOLVED;
      incident.updatedAt = new Date().toISOString();
    }
  }
}
