import { SessionManager } from './core/session-manager';
import { PerformanceCollector } from './collectors/performance';
import { NetworkCollector } from './collectors/network';
import { EventQueue } from './transport/queue';
import { InteractionCollector } from './collectors/interaction';
import { getBrowserMetadata, getNetworkInfo, generateUUID } from './utils/browser-metadata';

export interface SDKConfig {
  projectId: string;
  endpoint: string;
  userId?: string;
  samplingRate?: number;
}

export class MonitoringSDK {
  private static instance: MonitoringSDK;
  private config: SDKConfig;
  private sessionManager: SessionManager;
  private queue: EventQueue;

  private constructor(config: SDKConfig) {
    this.config = {
      samplingRate: 1.0,
      ...config
    };
    this.sessionManager = new SessionManager();
    this.queue = new EventQueue(this.sendBatch.bind(this));
    
    new InteractionCollector((signal) => {
      this.track('interaction_signal', signal);
    });

    this.initCollectors();
    this.initErrorTracking();
    this.trackPageView();
  }

  public static init(config: SDKConfig) {
    if (!MonitoringSDK.instance) {
      MonitoringSDK.instance = new MonitoringSDK(config);
    }
    return MonitoringSDK.instance;
  }

  private initCollectors() {
    new PerformanceCollector((metric) => {
      this.track('performance_metrics', { metric });
    });

    new NetworkCollector((event) => {
      this.track('api_latency', { network: event });
    });

    // Interaction tracking
    window.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        this.track('click', { 
          text: target.innerText?.substring(0, 50),
          id: target.id,
          class: target.className
        });
      }
    });
  }

  private initErrorTracking() {
    window.addEventListener('error', (event) => {
      // Ignore extension errors or script errors without context
      if (event.message === 'Script error.' && !event.lineno) return;
      
      this.track('js_error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        source: 'runtime'
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.track('js_error', {
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        source: 'promise'
      });
    });
  }

  public captureException(error: Error, metadata: any = {}) {
    this.track('js_error', {
      message: error.message,
      stack: error.stack,
      source: 'manual',
      ...metadata
    });
  }

  public captureBusinessFailure(category: string, reason: string, metadata: any = {}) {
    this.track('business_failure', {
      category,
      reason,
      ...metadata
    });
  }

  public setFunnelStep(step: string, metadata: any = {}) {
    this.track('funnel_step', {
      step,
      ...metadata
    });
  }

  public track(eventType: string, metadata: any = {}) {
    if (Math.random() > (this.config.samplingRate || 1)) return;

    this.queue.add({
      eventId: generateUUID(),
      eventType,
      siteId: this.config.projectId,
      sessionId: this.sessionManager.getSessionId(),
      userId: this.config.userId,
      metadata: {
        ...metadata,
        url: window.location.href,
        path: window.location.pathname,
        device: getBrowserMetadata(),
        network: getNetworkInfo()
      }
    });
  }

  private trackPageView() {
    this.track('page_view', {
      referrer: document.referrer,
      title: document.title
    });

    // Handle SPA routing
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (lastUrl !== window.location.href) {
        lastUrl = window.location.href;
        this.track('page_view', {
          type: 'route_change',
          title: document.title
        });
      }
    });
    observer.observe(document, { subtree: true, childList: true });
  }

  private async sendBatch(events: any[]): Promise<boolean> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: this.config.projectId,
          events
        }),
        keepalive: true
      });
      return response.ok;
    } catch (e) {
      console.warn('[MonitoringSDK] Failed to send events', e);
      return false;
    }
  }
}

// UMD Support
if (typeof window !== 'undefined') {
  (window as any).MonitoringSDK = MonitoringSDK;
}
