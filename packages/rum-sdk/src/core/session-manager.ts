import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'rum_session_id';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

export class SessionManager {
  private sessionId: string;
  private lastActivity: number;

  constructor() {
    this.sessionId = this.getOrStartSession();
    this.lastActivity = Date.now();
  }

  private getOrStartSession(): string {
    const stored = localStorage.getItem(SESSION_KEY);
    const now = Date.now();
    
    if (stored) {
      const { id, timestamp } = JSON.parse(stored);
      if (now - timestamp < SESSION_EXPIRY) {
        return id;
      }
    }

    const newId = this.generateId();
    this.persistSession(newId);
    return newId;
  }

  private generateId(): string {
    // Simple fallback if uuid is not available or to keep it light
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private persistSession(id: string) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id,
      timestamp: Date.now()
    }));
    // Cookie fallback
    document.cookie = `${SESSION_KEY}=${id}; path=/; max-age=${SESSION_EXPIRY / 1000}`;
  }

  public getSessionId(): string {
    const now = Date.now();
    if (now - this.lastActivity > SESSION_EXPIRY) {
      this.sessionId = this.generateId();
      this.persistSession(this.sessionId);
    }
    this.lastActivity = now;
    return this.sessionId;
  }
}
