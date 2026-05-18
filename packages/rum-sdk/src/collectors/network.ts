export interface NetworkEvent {
  url: string;
  method: string;
  status: number;
  duration: number;
  type: 'fetch' | 'xhr';
}

export class NetworkCollector {
  constructor(private onEvent: (event: NetworkEvent) => void) {
    this.initFetch();
    this.initXHR();
  }

  private initFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - start;
        this.onEvent({
          url: typeof args[0] === 'string' ? args[0] : (args[0] as Request).url,
          method: (args[1]?.method || 'GET').toUpperCase(),
          status: response.status,
          duration: Math.round(duration),
          type: 'fetch'
        });
        return response;
      } catch (error) {
        const duration = performance.now() - start;
        this.onEvent({
          url: typeof args[0] === 'string' ? args[0] : (args[0] as Request).url,
          method: (args[1]?.method || 'GET').toUpperCase(),
          status: 0, // Failed
          duration: Math.round(duration),
          type: 'fetch'
        });
        throw error;
      }
    };
  }

  private initXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string) {
      (this as any)._url = url;
      (this as any)._method = method;
      (this as any)._start = performance.now();
      return originalOpen.apply(this, arguments as any);
    };

    const self = this;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('loadend', function() {
        const duration = performance.now() - (this as any)._start;
        self.onEvent({
          url: (this as any)._url,
          method: (this as any)._method,
          status: this.status,
          duration: Math.round(duration),
          type: 'xhr'
        });
      });
      return originalSend.apply(this, arguments as any);
    };
  }
}
