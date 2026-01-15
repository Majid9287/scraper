import {
  IProxy,
  IProxyService,
  ProxyProviderType,
  IProxyHealth,
} from "../interfaces/proxy.interface";
import { proxyProviderFactory } from "../providers";
import { redisService } from "./redis.service";
import { getAppConfig } from "../config";

/**
 * Proxy service for managing proxy selection, health tracking, and rotation
 * Supports multiple providers: free, residential, datacenter
 */
export class ProxyService implements IProxyService {
  private readonly config = getAppConfig();
  private currentIndex: number = 0;
  private residentialIndex: number = 0;
  private freeProxies: IProxy[] = [];
  private residentialProxies: IProxy[] = [];
  private datacenterProxies: IProxy[] = [];
  private proxyHealth: Map<string, IProxyHealth> = new Map();
  private readonly CACHE_KEY = "proxies:active";
  private readonly RESIDENTIAL_CACHE_KEY = "proxies:residential";
  private readonly HEALTH_PREFIX = "proxy:health:";
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the proxy service (call after Redis connection)
   */
  async initialize(): Promise<void> {
    await this.initializeProxies();
    this.startHealthCheck();
    console.log("[ProxyService] Initialized");
  }

  /**
   * Get next proxy using round-robin selection with health awareness
   * @param preferResidential - If true, prefer residential proxies
   */
  async getNextProxy(preferResidential: boolean = false): Promise<IProxy> {
    // Determine which pool to use
    if (preferResidential && this.residentialProxies.length > 0) {
      return this.getNextResidentialProxy();
    }

    // Use default provider from config
    const defaultProvider = this.config.proxy.defaultProvider;
    
    if (defaultProvider === "residential" && this.residentialProxies.length > 0) {
      return this.getNextResidentialProxy();
    }

    if (defaultProvider === "datacenter" && this.datacenterProxies.length > 0) {
      return this.getNextDatacenterProxy();
    }

    // Fallback to free proxies
    return this.getNextFreeProxy();
  }

  /**
   * Get next free proxy with health filtering
   */
  private async getNextFreeProxy(): Promise<IProxy> {
    if (this.freeProxies.length === 0) {
      throw new Error("No free proxies available. ProxyService not properly initialized.");
    }

    // Try to find a healthy proxy
    const maxAttempts = Math.min(this.freeProxies.length, 10);
    for (let i = 0; i < maxAttempts; i++) {
      const proxy = this.freeProxies[this.currentIndex % this.freeProxies.length];
      this.currentIndex = (this.currentIndex + 1) % this.freeProxies.length;

      const health = await this.getProxyHealth(proxy);
      if (!health || health.isHealthy) {
        return proxy;
      }
    }

    // Fallback to round-robin if no healthy proxy found
    const proxy = this.freeProxies[this.currentIndex % this.freeProxies.length];
    this.currentIndex = (this.currentIndex + 1) % this.freeProxies.length;
    return proxy;
  }

  /**
   * Get next residential proxy
   */
  private async getNextResidentialProxy(): Promise<IProxy> {
    if (this.residentialProxies.length === 0) {
      console.warn("[ProxyService] No residential proxies, falling back to free");
      return this.getNextFreeProxy();
    }

    const proxy = this.residentialProxies[this.residentialIndex % this.residentialProxies.length];
    this.residentialIndex = (this.residentialIndex + 1) % this.residentialProxies.length;
    return proxy;
  }

  /**
   * Get next datacenter proxy
   */
  private async getNextDatacenterProxy(): Promise<IProxy> {
    if (this.datacenterProxies.length === 0) {
      console.warn("[ProxyService] No datacenter proxies, falling back to free");
      return this.getNextFreeProxy();
    }

    const index = Math.floor(Math.random() * this.datacenterProxies.length);
    return this.datacenterProxies[index];
  }

  /**
   * Get all available proxies
   */
  async getAvailableProxies(): Promise<IProxy[]> {
    return [
      ...this.freeProxies,
      ...this.residentialProxies,
      ...this.datacenterProxies,
    ];
  }

  /**
   * Get proxies by provider type
   */
  async getProxiesByProvider(provider: ProxyProviderType): Promise<IProxy[]> {
    switch (provider) {
      case "free":
        return [...this.freeProxies];
      case "residential":
        return [...this.residentialProxies];
      case "datacenter":
        return [...this.datacenterProxies];
      default:
        return [];
    }
  }

  /**
   * Mark proxy as failed
   */
  async markProxyFailed(proxy: IProxy): Promise<void> {
    const key = this.getProxyKey(proxy);
    let health = this.proxyHealth.get(key);

    if (!health) {
      health = {
        proxy,
        successCount: 0,
        failureCount: 0,
        isHealthy: true,
      };
    }

    health.failureCount++;
    health.lastFailure = Date.now();
    health.isHealthy = health.failureCount < this.config.proxy.maxProxyFailures;

    this.proxyHealth.set(key, health);
    await this.saveProxyHealth(key, health);

    console.log(
      `[ProxyService] Proxy ${proxy.ip}:${proxy.port} failed ` +
      `(${health.failureCount}/${this.config.proxy.maxProxyFailures})`
    );
  }

  /**
   * Mark proxy as successful
   */
  async markProxySuccess(proxy: IProxy): Promise<void> {
    const key = this.getProxyKey(proxy);
    let health = this.proxyHealth.get(key);

    if (!health) {
      health = {
        proxy,
        successCount: 0,
        failureCount: 0,
        isHealthy: true,
      };
    }

    health.successCount++;
    health.lastSuccess = Date.now();
    
    // Reset failure count on success (recovery)
    if (health.failureCount > 0) {
      health.failureCount = Math.max(0, health.failureCount - 1);
    }
    health.isHealthy = true;

    this.proxyHealth.set(key, health);
    await this.saveProxyHealth(key, health);
  }

  /**
   * Get proxy health status
   */
  async getProxyHealth(proxy: IProxy): Promise<IProxyHealth | null> {
    const key = this.getProxyKey(proxy);
    
    // Check local cache
    const cached = this.proxyHealth.get(key);
    if (cached) {
      return cached;
    }

    // Check Redis
    try {
      const data = await redisService.get(`${this.HEALTH_PREFIX}${key}`);
      if (data) {
        const health = JSON.parse(data) as IProxyHealth;
        this.proxyHealth.set(key, health);
        return health;
      }
    } catch (error) {
      // Ignore Redis errors
    }

    return null;
  }

  /**
   * Initialize proxies on startup
   */
  private async initializeProxies(): Promise<void> {
    try {
      // Load free proxies
      await this.loadFreeProxies();

      // Load residential proxies if configured
      if (this.config.proxy.residentialApiKey) {
        await this.loadResidentialProxies();
      }

      console.log(
        `[ProxyService] Loaded proxies: ` +
        `${this.freeProxies.length} free, ` +
        `${this.residentialProxies.length} residential, ` +
        `${this.datacenterProxies.length} datacenter`
      );
    } catch (error) {
      console.error("[ProxyService] Failed to initialize proxies:", error);
      throw error;
    }
  }

  /**
   * Load free proxies from file/cache
   */
  private async loadFreeProxies(): Promise<void> {
    try {
      // Try cache first
      const cachedProxies = await redisService.get(this.CACHE_KEY);
      if (cachedProxies) {
        this.freeProxies = JSON.parse(cachedProxies);
        console.log(`[ProxyService] Loaded ${this.freeProxies.length} free proxies from cache`);
        return;
      }
    } catch (error) {
      // Ignore cache errors
    }

    // Load from provider
    try {
      const provider = proxyProviderFactory.getProvider("free");
      const freshProxies = await provider.getProxies();
      this.freeProxies = freshProxies;

      // Cache proxies
      await redisService.set(this.CACHE_KEY, JSON.stringify(freshProxies), 3600);
      console.log(`[ProxyService] Loaded ${freshProxies.length} free proxies from provider`);
    } catch (error) {
      console.error("[ProxyService] Failed to load free proxies:", error);
    }
  }

  /**
   * Load residential proxies from API
   */
  private async loadResidentialProxies(): Promise<void> {
    try {
      // Try cache first
      const cachedProxies = await redisService.get(this.RESIDENTIAL_CACHE_KEY);
      if (cachedProxies) {
        this.residentialProxies = JSON.parse(cachedProxies);
        console.log(`[ProxyService] Loaded ${this.residentialProxies.length} residential proxies from cache`);
        return;
      }
    } catch (error) {
      // Ignore cache errors
    }

    // Load from provider
    try {
      const provider = proxyProviderFactory.getProvider("residential");
      const freshProxies = await provider.getProxies();
      this.residentialProxies = freshProxies;

      // Cache proxies (shorter TTL for residential)
      await redisService.set(this.RESIDENTIAL_CACHE_KEY, JSON.stringify(freshProxies), 600);
      console.log(`[ProxyService] Loaded ${freshProxies.length} residential proxies from provider`);
    } catch (error) {
      console.error("[ProxyService] Failed to load residential proxies:", error);
    }
  }

  /**
   * Refresh all proxies
   */
  async refreshProxies(): Promise<void> {
    console.log("[ProxyService] Refreshing proxies...");
    
    // Clear cache
    await redisService.del(this.CACHE_KEY);
    await redisService.del(this.RESIDENTIAL_CACHE_KEY);
    
    // Reinitialize
    await this.initializeProxies();
  }

  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.cleanupUnhealthyProxies();
    }, this.config.proxy.proxyHealthCheckInterval);
  }

  /**
   * Stop health check interval
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Cleanup unhealthy proxies and potentially refresh pool
   */
  private async cleanupUnhealthyProxies(): Promise<void> {
    const unhealthyCount = Array.from(this.proxyHealth.values())
      .filter((h) => !h.isHealthy)
      .length;

    const totalProxies = this.freeProxies.length + this.residentialProxies.length;
    const unhealthyRatio = unhealthyCount / Math.max(totalProxies, 1);

    if (unhealthyRatio > 0.5) {
      console.log(`[ProxyService] High unhealthy ratio (${(unhealthyRatio * 100).toFixed(1)}%), refreshing proxies`);
      await this.refreshProxies();
    }
  }

  /**
   * Get proxy key for health tracking
   */
  private getProxyKey(proxy: IProxy): string {
    return `${proxy.ip}:${proxy.port}`;
  }

  /**
   * Save proxy health to Redis
   */
  private async saveProxyHealth(key: string, health: IProxyHealth): Promise<void> {
    try {
      await redisService.set(
        `${this.HEALTH_PREFIX}${key}`,
        JSON.stringify(health),
        3600
      );
    } catch (error) {
      // Ignore Redis errors
    }
  }

  /**
   * Get proxy statistics
   */
  async getStats(): Promise<{
    free: { total: number; healthy: number };
    residential: { total: number; healthy: number };
    datacenter: { total: number; healthy: number };
  }> {
    const getHealthyCount = async (proxies: IProxy[]): Promise<number> => {
      let healthy = 0;
      for (const proxy of proxies) {
        const health = await this.getProxyHealth(proxy);
        if (!health || health.isHealthy) {
          healthy++;
        }
      }
      return healthy;
    };

    const [freeHealthy, residentialHealthy, datacenterHealthy] = await Promise.all([
      getHealthyCount(this.freeProxies),
      getHealthyCount(this.residentialProxies),
      getHealthyCount(this.datacenterProxies),
    ]);

    return {
      free: { total: this.freeProxies.length, healthy: freeHealthy },
      residential: { total: this.residentialProxies.length, healthy: residentialHealthy },
      datacenter: { total: this.datacenterProxies.length, healthy: datacenterHealthy },
    };
  }

  /**
   * Shutdown proxy service
   */
  shutdown(): void {
    this.stopHealthCheck();
    console.log("[ProxyService] Shutdown complete");
  }
}

export const proxyService = new ProxyService();
export default proxyService;
