export enum FunnelStep {
  SEARCH = 'SEARCH',
  PLP = 'PLP',
  PDP = 'PDP',
  CART = 'CART',
  CHECKOUT = 'CHECKOUT',
  PAYMENT = 'PAYMENT',
  COMPLETED = 'COMPLETED'
}

export interface JourneySession {
  sessionId: string;
  steps: { step: FunnelStep; timestamp: string }[];
  lastStep: FunnelStep;
  isCompleted: boolean;
  isTechnicalDropoff: boolean;
  dropoffReason?: string;
  signals: string[]; // rage_click, dead_click, etc.
}

export class JourneyEngine {
  private static STEP_ORDER: FunnelStep[] = [
    FunnelStep.SEARCH,
    FunnelStep.PLP,
    FunnelStep.PDP,
    FunnelStep.CART,
    FunnelStep.CHECKOUT,
    FunnelStep.PAYMENT,
    FunnelStep.COMPLETED
  ];

  static analyzeSession(events: any[]): JourneySession {
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sessionId = events[0]?.sessionId;
    
    const steps: { step: FunnelStep; timestamp: string }[] = [];
    const signals: string[] = [];
    let failureDetected = false;
    let slownessDetected = false;

    sortedEvents.forEach(event => {
      if (event.eventType === 'funnel_step') {
        steps.push({ step: event.metadata.step as FunnelStep, timestamp: event.timestamp });
      } else if (event.eventType === 'interaction_signal') {
        signals.push(event.metadata.type);
      } else if (event.eventType === 'js_error' || (event.eventType === 'backend_performance' && event.metadata.status >= 500)) {
        failureDetected = true;
      } else if (event.eventType === 'backend_performance' && event.metadata.duration > 2000) {
        slownessDetected = true;
      }
    });

    const lastStep = steps.length > 0 ? steps[steps.length - 1].step : FunnelStep.SEARCH;
    const isCompleted = lastStep === FunnelStep.COMPLETED;
    
    // Technical Dropoff Logic: 
    // If not completed AND a failure/slowness occurred within the same session
    let isTechnicalDropoff = false;
    let dropoffReason = undefined;

    if (!isCompleted && steps.length > 0) {
      if (failureDetected) {
        isTechnicalDropoff = true;
        dropoffReason = 'System Failure';
      } else if (slownessDetected) {
        isTechnicalDropoff = true;
        dropoffReason = 'Performance Degradation';
      } else if (signals.includes('rage_click')) {
        isTechnicalDropoff = true;
        dropoffReason = 'UX Friction (Rage Click)';
      }
    }

    return {
      sessionId,
      steps,
      lastStep,
      isCompleted,
      isTechnicalDropoff,
      dropoffReason,
      signals: [...new Set(signals)]
    };
  }

  static getStepProgression(current: FunnelStep): number {
    return this.STEP_ORDER.indexOf(current) + 1;
  }
}
