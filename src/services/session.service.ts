import { v4 as uuidv4 } from "uuid";
import { BrowserContext, Browser, chromium } from "playwright";
import { getAppConfig } from "../config";
import { redisService } from "./redis.service";

/**
 * Session data interface
 */
export interface ISession {
  id: string;
  domain: string;
  cookies: any[];
  localStorage: Record<string, string>;
  createdAt: number;
  lastUsed: number;
  userAgent: string;
  viewport: { width: number; height: number };
}

/**
 * Session storage state interface
 */
export interface IStorageState {
  cookies: any[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Session management service
 * Handles persistent sessions, cookies, and browser contexts
 */
export class SessionService {
  private readonly config = getAppConfig();
  private readonly SESSION_PREFIX = "session:";
  private readonly SESSION_LIST_KEY = "sessions:active";
  private activeSessions: Map<string, { context: BrowserContext; browser: Browser }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize session service
   */
  async initialize(): Promise<void> {
    if (!this.config.session.enabled) {
      console.log("[SessionService] Session management disabled");
      return;
    }

    // Start cleanup interval
    this.startCleanupInterval();
    console.log("[SessionService] Initialized");
  }

  /**
   * Start cleanup interval for expired sessions
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, this.config.session.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Create new session for a domain
   */
  async createSession(domain: string, options: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    storageState?: IStorageState;
  } = {}): Promise<string> {
    const sessionId = uuidv4();
    const now = Date.now();

    const session: ISession = {
      id: sessionId,
      domain,
      cookies: options.storageState?.cookies || [],
      localStorage: {},
      createdAt: now,
      lastUsed: now,
      userAgent: options.userAgent || this.getDefaultUserAgent(),
      viewport: options.viewport || { width: 1920, height: 1080 },
    };

    // Extract localStorage from storage state
    if (options.storageState?.origins) {
      const domainOrigin = options.storageState.origins.find(
        (o) => o.origin.includes(domain)
      );
      if (domainOrigin) {
        domainOrigin.localStorage.forEach((item) => {
          session.localStorage[item.name] = item.value;
        });
      }
    }

    // Save session to Redis
    await this.saveSession(session);

    // Add to active sessions list
    await redisService.set(
      this.SESSION_LIST_KEY,
      JSON.stringify([
        ...(await this.getActiveSessionIds()),
        sessionId,
      ])
    );

    console.log(`[SessionService] Created session ${sessionId} for ${domain}`);
    return sessionId;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<ISession | null> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const data = await redisService.get(key);

    if (!data) {
      return null;
    }

    const session = JSON.parse(data) as ISession;

    // Check if session is expired
    if (Date.now() - session.createdAt > this.config.session.maxAge) {
      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get session by domain
   */
  async getSessionByDomain(domain: string): Promise<ISession | null> {
    const sessionIds = await this.getActiveSessionIds();

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && session.domain === domain) {
        return session;
      }
    }

    return null;
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: Partial<ISession>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updatedSession: ISession = {
      ...session,
      ...updates,
      lastUsed: Date.now(),
    };

    await this.saveSession(updatedSession);
    console.log(`[SessionService] Updated session ${sessionId}`);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    await redisService.del(key);

    // Remove from active sessions list
    const sessionIds = await this.getActiveSessionIds();
    const updatedIds = sessionIds.filter((id) => id !== sessionId);
    await redisService.set(this.SESSION_LIST_KEY, JSON.stringify(updatedIds));

    // Close browser context if exists
    const activeSession = this.activeSessions.get(sessionId);
    if (activeSession) {
      try {
        await activeSession.context.close();
        await activeSession.browser.close();
      } catch (e) {
        // Ignore close errors
      }
      this.activeSessions.delete(sessionId);
    }

    console.log(`[SessionService] Deleted session ${sessionId}`);
  }

  /**
   * Get storage state for session
   */
  async getStorageState(sessionId: string): Promise<IStorageState | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      cookies: session.cookies,
      origins: [
        {
          origin: `https://${session.domain}`,
          localStorage: Object.entries(session.localStorage).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    };
  }

  /**
   * Save storage state from browser context to session
   */
  async saveStorageStateFromContext(
    sessionId: string,
    context: BrowserContext
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const storageState = await context.storageState();

    await this.updateSession(sessionId, {
      cookies: storageState.cookies,
      localStorage: this.extractLocalStorage(storageState, session.domain),
    });
  }

  /**
   * Create browser context with session
   */
  async createContextWithSession(
    sessionId: string,
    browser?: Browser
  ): Promise<{ context: BrowserContext; browser: Browser }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const storageState = await this.getStorageState(sessionId);
    
    const ownBrowser = browser || await chromium.launch({
      headless: this.config.browser.headless,
    });

    const context = await ownBrowser.newContext({
      userAgent: session.userAgent,
      viewport: session.viewport,
      storageState: storageState || undefined,
    });

    // Store in active sessions
    this.activeSessions.set(sessionId, { context, browser: ownBrowser });

    // Update last used
    await this.updateSession(sessionId, { lastUsed: Date.now() });

    console.log(`[SessionService] Created context for session ${sessionId}`);
    return { context, browser: ownBrowser };
  }

  /**
   * Get or create session for domain
   */
  async getOrCreateSession(domain: string, options: {
    userAgent?: string;
    viewport?: { width: number; height: number };
  } = {}): Promise<string> {
    const existingSession = await this.getSessionByDomain(domain);
    
    if (existingSession) {
      await this.updateSession(existingSession.id, { lastUsed: Date.now() });
      return existingSession.id;
    }

    return this.createSession(domain, options);
  }

  /**
   * Cleanup expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const sessionIds = await this.getActiveSessionIds();
    const now = Date.now();
    let cleanedCount = 0;

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (!session || now - session.createdAt > this.config.session.maxAge) {
        await this.deleteSession(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SessionService] Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Get all active session IDs
   */
  private async getActiveSessionIds(): Promise<string[]> {
    const data = await redisService.get(this.SESSION_LIST_KEY);
    if (!data) {
      return [];
    }
    return JSON.parse(data);
  }

  /**
   * Save session to Redis
   */
  private async saveSession(session: ISession): Promise<void> {
    const key = `${this.SESSION_PREFIX}${session.id}`;
    const ttlSeconds = Math.ceil(this.config.session.maxAge / 1000);
    await redisService.set(key, JSON.stringify(session), ttlSeconds);
  }

  /**
   * Extract localStorage from storage state
   */
  private extractLocalStorage(
    storageState: IStorageState,
    domain: string
  ): Record<string, string> {
    const localStorage: Record<string, string> = {};

    const origin = storageState.origins.find((o) => o.origin.includes(domain));
    if (origin) {
      origin.localStorage.forEach((item) => {
        localStorage[item.name] = item.value;
      });
    }

    return localStorage;
  }

  /**
   * Get default user agent
   */
  private getDefaultUserAgent(): string {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  /**
   * Get all sessions for a domain
   */
  async getSessionsForDomain(domain: string): Promise<ISession[]> {
    const sessionIds = await this.getActiveSessionIds();
    const sessions: ISession[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && session.domain === domain) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Close all active browser contexts
   */
  async closeAllContexts(): Promise<void> {
    for (const [sessionId, { context, browser }] of this.activeSessions) {
      try {
        await context.close();
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    this.activeSessions.clear();
    console.log("[SessionService] Closed all active browser contexts");
  }

  /**
   * Shutdown session service
   */
  async shutdown(): Promise<void> {
    this.stopCleanupInterval();
    await this.closeAllContexts();
    console.log("[SessionService] Shutdown complete");
  }
}

export const sessionService = new SessionService();
export default sessionService;
