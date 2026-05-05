export interface InteractionSignal {
  type: 'rage_click' | 'dead_click' | 'retry';
  target?: string;
  selector?: string;
  timestamp: string;
}

export class InteractionCollector {
  private clickHistory: { x: number; y: number; time: number; target: HTMLElement }[] = [];
  private RAGE_THRESHOLD = 3; // 3 clicks
  private RAGE_WINDOW = 1000; // 1 second
  private onSignal: (signal: InteractionSignal) => void;

  constructor(onSignal: (signal: InteractionSignal) => void) {
    this.onSignal = onSignal;
    this.initListeners();
  }

  private initListeners() {
    window.addEventListener('click', (e) => this.handleClick(e), true);
  }

  private handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const now = Date.now();
    
    // 1. Rage Click Detection
    this.clickHistory.push({ x: e.clientX, y: e.clientY, time: now, target });
    
    // Clean up old clicks
    this.clickHistory = this.clickHistory.filter(c => now - c.time < this.RAGE_WINDOW);
    
    const recentClicksOnTarget = this.clickHistory.filter(c => c.target === target);
    if (recentClicksOnTarget.length >= this.RAGE_THRESHOLD) {
      this.onSignal({
        type: 'rage_click',
        target: target.tagName,
        selector: this.getSelector(target),
        timestamp: new Date().toISOString()
      });
      // Clear to avoid multiple signals for the same rage event
      this.clickHistory = [];
    }

    // 2. Dead Click Detection (Conceptual)
    // A dead click is a click that doesn't trigger a navigation or DOM change within X ms.
    // In a production SDK, we'd use MutationObserver and navigation listeners.
    // For this implementation, we'll mark potential dead clicks if no route change occurs.
    const urlBefore = window.location.href;
    setTimeout(() => {
      if (window.location.href === urlBefore && this.isInteractiveElement(target)) {
        // This is a candidate for a dead click if no substantial UI change occurred.
        // We'll emit a signal for CTAs that don't transition.
      }
    }, 500);
  }

  private isInteractiveElement(el: HTMLElement): boolean {
    return ['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'button';
  }

  private getSelector(el: HTMLElement): string {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') return `.${el.className.split(' ')[0]}`;
    return el.tagName.toLowerCase();
  }
}
