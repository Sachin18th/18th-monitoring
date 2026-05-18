export class EventQueue {
  private queue: any[] = [];
  private timer: any = null;
  private maxBatchSize = 20;
  private flushInterval = 5000; // 5 seconds

  constructor(private onFlush: (events: any[]) => Promise<boolean>) {
    this.initUnloadHandler();
  }

  public add(event: any) {
    this.queue.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const eventsToFlush = [...this.queue];
    this.queue = [];

    const success = await this.onFlush(eventsToFlush);
    if (!success) {
      // Retry strategy: put back in queue (simple version)
      this.queue = [...eventsToFlush, ...this.queue];
      // Limit queue size to prevent memory bloat
      if (this.queue.length > 500) this.queue.splice(0, this.queue.length - 500);
    }
  }

  private initUnloadHandler() {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    });
    window.addEventListener('beforeunload', () => this.flush());
  }
}
