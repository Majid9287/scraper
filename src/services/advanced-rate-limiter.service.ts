import { getAppConfig } from "../config";
import { redisService } from "./redis.service";
import { IProxy } from "../interfaces";

/**
 * Rate limit entry interface
 */
interface IRateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

/**
 * Adaptive rate limit state
 */
interface IAdaptiveState {
  successRate: number;
  currentDelay: number;
  lastAdjustment: number;
}

/**
 * Advanced rate limiting service with adaptive throttling
 * Implements exponential backoff, jitter, and domain-specific limits
 */
export class AdvancedRateLimiterService {
  private readonly config = getAppConfig();
  private readonly RATE_LIMIT_PREFIX = "rate_limit:";
  private readonly ADAPTIVE_STATE_PREFIX = "adaptive:";
  private localCache: Map<string, IRateLimitEntry> = new Map();
  private adaptiveStates: Map<string, IAdaptiveState> = new Map();

  /**
   * Check if request is within rate limit
   */
  async isWithinRateLimit(
    key: string,
    requestsPerSecond?: number
  ): Promise<boolean> {
    const limit = requestsPerSecond || this.config.rateLimit.defaultRequestsPerSecond;
    const windowMs = this.config.rateLimit.windowMs;
    const now = Date.now();

    const entry = await this.getRateLimitEntry(key);

    if (!entry) {
      return true;
    }

    // Check if window has expired
    if (now - entry.firstRequest > windowMs) {
      await this.resetRateLimit(key);
      return true;
    }

    // Check if within limit
    return entry.count < limit;
  }

  /**
   * Increment rate limit counter
   */
  async incrementRateLimit(
    key: string,
    requestsPerSecond?: number
  ): Promise<boolean> {
    const limit = requestsPerSecond || this.config.rateLimit.defaultRequestsPerSecond;
    const windowMs = this.config.rateLimit.windowMs;
    const now = Date.now();

    let entry = await this.getRateLimitEntry(key);

    if (!entry || now - entry.firstRequest > windowMs) {
      // Start new window
      entry = {
        count: 1,
        firstRequest: now,
        lastRequest: now,
      };
    } else if (entry.count >= limit) {
      console.log(`[AdvancedRateLimiter] Rate limit exceeded for ${key}: ${entry.count}/${limit}`);
      return false;
    } else {
      entry.count++;
      entry.lastRequest = now;
    }

    await this.setRateLimitEntry(key, entry);
    return true;
  }

  /**
   * Get delay before next request (with jitter)
   */
  async getDelay(key: string): Promise<number> {
    const entry = await this.getRateLimitEntry(key);
    const minDelay = this.config.rateLimit.minDelay;
    const maxDelay = this.config.rateLimit.maxDelay;

    if (!entry) {
      return this.addJitter(minDelay);
    }

    // Calculate base delay based on request count
    const limit = this.config.rateLimit.defaultRequestsPerSecond;
    const windowMs = this.config.rateLimit.windowMs;
    const elapsed = Date.now() - entry.firstRequest;
    const remaining = Math.max(0, windowMs - elapsed);

    if (entry.count >= limit && remaining > 0) {
      // Must wait for window to expire
      return this.addJitter(remaining);
    }

    // Adaptive delay based on success rate
    if (this.config.rateLimit.enableAdaptive) {
      const adaptiveDelay = await this.getAdaptiveDelay(key);
      return this.addJitter(Math.max(minDelay, Math.min(maxDelay, adaptiveDelay)));
    }

    return this.addJitter(minDelay);
  }

  /**
   * Calculate delay with exponential backoff
   */
  getExponentialBackoffDelay(attempt: number, baseDelay?: number): number {
    const base = baseDelay || this.config.rateLimit.minDelay;
    const maxDelay = this.config.rateLimit.maxDelay;
    const delay = base * Math.pow(2, attempt - 1);
    return this.addJitter(Math.min(delay, maxDelay));
  }

  /**
   * Add jitter to delay (±25%)
   */
  private addJitter(delay: number): number {
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(delay + jitter));
  }

  /**
   * Get adaptive delay based on success rate
   */
  private async getAdaptiveDelay(key: string): Promise<number> {
    const state = await this.getAdaptiveState(key);
    
    if (!state) {
      return this.config.rateLimit.minDelay;
    }

    // Higher success rate = lower delay
    const minDelay = this.config.rateLimit.minDelay;
    const maxDelay = this.config.rateLimit.maxDelay;
    const delayRange = maxDelay - minDelay;
    
    // Map success rate (0-1) to delay (maxDelay-minDelay)
    return maxDelay - (state.successRate * delayRange);
  }

  /**
   * Update adaptive state based on request result
   */
  async updateAdaptiveState(key: string, success: boolean): Promise<void> {
    if (!this.config.rateLimit.enableAdaptive) {
      return;
    }

    let state = await this.getAdaptiveState(key);
    const now = Date.now();

    if (!state) {
      state = {
        successRate: 0.5,
        currentDelay: this.config.rateLimit.minDelay,
        lastAdjustment: now,
      };
    }

    // Exponential moving average for success rate
    const alpha = 0.2; // Smoothing factor
    state.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * state.successRate;
    state.lastAdjustment = now;

    // Calculate new delay
    state.currentDelay = await this.getAdaptiveDelay(key);

    await this.setAdaptiveState(key, state);

    console.log(
      `[AdvancedRateLimiter] Adaptive state for ${key}: ` +
      `successRate=${(state.successRate * 100).toFixed(1)}%, delay=${state.currentDelay}ms`
    );
  }

  /**
   * Check rate limit for proxy
   */
  async isProxyWithinRateLimit(proxy: IProxy, requestsPerSecond?: number): Promise<boolean> {
    const key = `proxy:${proxy.ip}:${proxy.port}`;
    return this.isWithinRateLimit(key, requestsPerSecond);
  }

  /**
   * Increment rate limit for proxy
   */
  async incrementProxyRateLimit(proxy: IProxy, requestsPerSecond?: number): Promise<boolean> {
    const key = `proxy:${proxy.ip}:${proxy.port}`;
    return this.incrementRateLimit(key, requestsPerSecond);
  }

  /**
   * Check rate limit for domain
   */
  async isDomainWithinRateLimit(domain: string, requestsPerSecond?: number): Promise<boolean> {
    const key = `domain:${domain}`;
    return this.isWithinRateLimit(key, requestsPerSecond);
  }

  /**
   * Increment rate limit for domain
   */
  async incrementDomainRateLimit(domain: string, requestsPerSecond?: number): Promise<boolean> {
    const key = `domain:${domain}`;
    return this.incrementRateLimit(key, requestsPerSecond);
  }

  /**
   * Get delay for domain with adaptive throttling
   */
  async getDomainDelay(domain: string): Promise<number> {
    const key = `domain:${domain}`;
    return this.getDelay(key);
  }

  /**
   * Update domain success rate for adaptive throttling
   */
  async updateDomainSuccessRate(domain: string, success: boolean): Promise<void> {
    const key = `domain:${domain}`;
    await this.updateAdaptiveState(key, success);
  }

  /**
   * Wait for rate limit with automatic delay
   */
  async waitForRateLimit(key: string): Promise<void> {
    const isWithin = await this.isWithinRateLimit(key);
    
    if (!isWithin) {
      const delay = await this.getDelay(key);
      console.log(`[AdvancedRateLimiter] Waiting ${delay}ms for rate limit on ${key}`);
      await this.sleep(delay);
    }
  }

  /**
   * Throttle request with automatic waiting
   */
  async throttle(key: string): Promise<void> {
    await this.waitForRateLimit(key);
    await this.incrementRateLimit(key);
  }

  /**
   * Throttle domain request
   */
  async throttleDomain(domain: string): Promise<void> {
    const key = `domain:${domain}`;
    await this.throttle(key);
  }

  /**
   * Reset rate limit for key
   */
  async resetRateLimit(key: string): Promise<void> {
    const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;
    await redisService.del(redisKey);
    this.localCache.delete(key);
  }

  /**
   * Get rate limit entry from cache or Redis
   */
  private async getRateLimitEntry(key: string): Promise<IRateLimitEntry | null> {
    // Check local cache first
    const cached = this.localCache.get(key);
    if (cached) {
      return cached;
    }

    // Check Redis
    try {
      const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;
      const data = await redisService.get(redisKey);
      
      if (data) {
        const entry = JSON.parse(data) as IRateLimitEntry;
        this.localCache.set(key, entry);
        return entry;
      }
    } catch (error) {
      // Ignore Redis errors, use local cache only
    }

    return null;
  }

  /**
   * Set rate limit entry in cache and Redis
   */
  private async setRateLimitEntry(key: string, entry: IRateLimitEntry): Promise<void> {
    this.localCache.set(key, entry);

    try {
      const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;
      const ttlSeconds = Math.ceil(this.config.rateLimit.windowMs / 1000) + 1;
      await redisService.set(redisKey, JSON.stringify(entry), ttlSeconds);
    } catch (error) {
      // Ignore Redis errors, use local cache only
    }
  }

  /**
   * Get adaptive state from Redis
   */
  private async getAdaptiveState(key: string): Promise<IAdaptiveState | null> {
    const cached = this.adaptiveStates.get(key);
    if (cached) {
      return cached;
    }

    try {
      const redisKey = `${this.ADAPTIVE_STATE_PREFIX}${key}`;
      const data = await redisService.get(redisKey);
      
      if (data) {
        const state = JSON.parse(data) as IAdaptiveState;
        this.adaptiveStates.set(key, state);
        return state;
      }
    } catch (error) {
      // Ignore Redis errors
    }

    return null;
  }

  /**
   * Set adaptive state in Redis
   */
  private async setAdaptiveState(key: string, state: IAdaptiveState): Promise<void> {
    this.adaptiveStates.set(key, state);

    try {
      const redisKey = `${this.ADAPTIVE_STATE_PREFIX}${key}`;
      await redisService.set(redisKey, JSON.stringify(state), 3600); // 1 hour TTL
    } catch (error) {
      // Ignore Redis errors
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get burst allowance
   */
  async getBurstAllowance(key: string): Promise<number> {
    const entry = await this.getRateLimitEntry(key);
    if (!entry) {
      return this.config.rateLimit.burstLimit;
    }

    const limit = this.config.rateLimit.defaultRequestsPerSecond;
    return Math.max(0, limit + this.config.rateLimit.burstLimit - entry.count);
  }

  /**
   * Clear all rate limits (for testing)
   */
  clearLocalCache(): void {
    this.localCache.clear();
    this.adaptiveStates.clear();
  }
}

export const advancedRateLimiterService = new AdvancedRateLimiterService();
export default advancedRateLimiterService;
