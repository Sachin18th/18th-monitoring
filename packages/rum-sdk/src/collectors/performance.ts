export interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

export class PerformanceCollector {
  private metrics: Record<string, number> = {};

  constructor(private onMetric: (metric: PerformanceMetric) => void) {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Observe CWV
    this.observeMetric('largest-contentful-paint', 'LCP');
    this.observeMetric('layout-shift', 'CLS');
    this.observeMetric('first-input', 'FID'); // Legacy but good to have
    this.observeMetric('interaction', 'INP');

    // Traditional timings
    window.addEventListener('load', () => {
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (nav) {
          this.report('TTFB', nav.responseStart);
          this.report('DOMContentLoaded', nav.domContentLoadedEventEnd);
          this.report('LoadEvent', nav.loadEventEnd);
        }
      }, 0);
    });

    // FCP
    const fcpObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          this.report('FCP', entry.startTime);
          fcpObserver.disconnect();
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  }

  private observeMetric(type: string, name: string) {
    try {
      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const value = (entry as any).value || (entry as any).startTime || 0;
          this.report(name, value);
        }
      });
      observer.observe({ type, buffered: true });
    } catch (e) {
      // Browser might not support this type
    }
  }

  private report(name: string, value: number) {
    this.onMetric({
      name,
      value: Math.round(value),
      rating: this.rate(name, value)
    });
  }

  private rate(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    switch (name) {
      case 'LCP': return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
      case 'CLS': return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
      case 'INP': return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
      case 'TTFB': return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
      default: return 'good';
    }
  }
}
