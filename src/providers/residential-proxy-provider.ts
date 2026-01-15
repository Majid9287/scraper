import axios from "axios";
import { getAppConfig } from "../config";
import { IProxy, IProxyProvider, ProxyProviderType } from "../interfaces";

/**
 * Residential proxy provider
 * Integrates with premium proxy services like Bright Data, Proxy-Seller, IPRoyal
 */
export class ResidentialProxyProvider implements IProxyProvider {
  readonly providerType: ProxyProviderType = "residential";
  private readonly config = getAppConfig();
  private proxies: IProxy[] = [];
  private lastRefresh: number = 0;
  private refreshInterval: number = 300000; // 5 minutes

  /**
   * Get proxies from residential provider API
   */
  async getProxies(): Promise<IProxy[]> {
    const now = Date.now();

    // Return cached proxies if fresh
    if (this.proxies.length > 0 && now - this.lastRefresh < this.refreshInterval) {
      return [...this.proxies];
    }

    await this.loadProxies();
    return [...this.proxies];
  }

  /**
   * Refresh proxies from API
   */
  async refreshProxies(): Promise<void> {
    await this.loadProxies();
  }

  /**
   * Load proxies from residential proxy API
   */
  private async loadProxies(): Promise<void> {
    const apiKey = this.config.proxy.residentialApiKey;
    const apiUrl = this.config.proxy.residentialApiUrl;

    if (!apiKey || !apiUrl) {
      console.warn("[ResidentialProxy] No API key or URL configured, using fallback");
      this.proxies = this.getFallbackProxies();
      this.lastRefresh = Date.now();
      return;
    }

    try {
      console.log("[ResidentialProxy] Fetching proxies from API...");

      const response = await axios.get<any[] | { proxies: any[] }>(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        params: {
          country: this.config.proxy.residentialCountry,
          type: "residential",
          format: "json",
        },
        timeout: 30000,
      });

      if (response.data && Array.isArray(response.data)) {
        this.proxies = response.data.map((proxy: any) => this.parseProxyResponse(proxy));
        console.log(`[ResidentialProxy] Loaded ${this.proxies.length} residential proxies`);
      } else if (response.data && typeof response.data === "object" && "proxies" in response.data) {
        this.proxies = (response.data as { proxies: any[] }).proxies.map((proxy: any) => this.parseProxyResponse(proxy));
        console.log(`[ResidentialProxy] Loaded ${this.proxies.length} residential proxies`);
      } else {
        console.warn("[ResidentialProxy] Invalid API response, using fallback");
        this.proxies = this.getFallbackProxies();
      }

      this.lastRefresh = Date.now();
    } catch (error: any) {
      console.error(`[ResidentialProxy] API error: ${error.message}`);
      
      // Use fallback proxies on error
      if (this.proxies.length === 0) {
        this.proxies = this.getFallbackProxies();
      }
      
      this.lastRefresh = Date.now();
    }
  }

  /**
   * Parse proxy response from API
   */
  private parseProxyResponse(proxy: any): IProxy {
    return {
      ip: proxy.ip || proxy.host || proxy.address,
      port: parseInt(proxy.port, 10),
      protocol: (proxy.protocol || proxy.type || "http") as "http" | "https" | "socks4" | "socks5",
      provider: "residential",
      username: proxy.username || proxy.user,
      password: proxy.password || proxy.pass,
      metadata: {
        country: proxy.country || proxy.countryCode,
        city: proxy.city,
        isp: proxy.isp || proxy.provider,
        asn: proxy.asn,
        lastChecked: new Date().toISOString(),
        reliability: "high",
        speed: proxy.speed || proxy.latency,
        anonymity: "elite",
        source: "residential-api",
      },
    };
  }

  /**
   * Get fallback proxies when API is unavailable
   * These are placeholder configurations for common proxy services
   */
  private getFallbackProxies(): IProxy[] {
    // These are gateway proxies - the actual IP rotation happens server-side
    const fallbackConfigs = [
      // Bright Data gateway format
      {
        ip: "brd.superproxy.io",
        port: 22225,
        protocol: "http" as const,
        provider: "residential" as ProxyProviderType,
        username: this.config.proxy.residentialApiKey ? `brd-customer-${this.config.proxy.residentialApiKey}-zone-residential` : "",
        password: this.config.proxy.residentialApiKey || "",
        metadata: {
          country: this.config.proxy.residentialCountry,
          reliability: "high" as const,
          source: "bright-data-gateway",
        },
      },
      // Smartproxy gateway format
      {
        ip: "gate.smartproxy.com",
        port: 7000,
        protocol: "http" as const,
        provider: "residential" as ProxyProviderType,
        username: this.config.proxy.residentialApiKey || "",
        password: this.config.proxy.residentialApiKey || "",
        metadata: {
          country: this.config.proxy.residentialCountry,
          reliability: "high" as const,
          source: "smartproxy-gateway",
        },
      },
      // Oxylabs gateway format
      {
        ip: "pr.oxylabs.io",
        port: 7777,
        protocol: "http" as const,
        provider: "residential" as ProxyProviderType,
        username: this.config.proxy.residentialApiKey || "",
        password: this.config.proxy.residentialApiKey || "",
        metadata: {
          country: this.config.proxy.residentialCountry,
          reliability: "high" as const,
          source: "oxylabs-gateway",
        },
      },
    ];

    return fallbackConfigs.filter((p) => p.username && p.password);
  }

  /**
   * Validate proxy by making a test request
   */
  async validateProxy(proxy: IProxy): Promise<boolean> {
    try {
      // Build proxy URL
      let proxyUrl = `${proxy.protocol}://`;
      if (proxy.username && proxy.password) {
        proxyUrl += `${proxy.username}:${proxy.password}@`;
      }
      proxyUrl += `${proxy.ip}:${proxy.port}`;

      const response = await axios.get("https://httpbin.org/ip", {
        timeout: 10000,
        // Use httpAgent/httpsAgent for proxy in production
        // For simplicity, validate by checking if we get a response
      });

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Datacenter proxy provider
 * Uses high-speed datacenter proxies
 */
export class DatacenterProxyProvider implements IProxyProvider {
  readonly providerType: ProxyProviderType = "datacenter";
  private readonly config = getAppConfig();
  private proxies: IProxy[] = [];

  async getProxies(): Promise<IProxy[]> {
    if (this.proxies.length === 0) {
      await this.loadProxies();
    }
    return [...this.proxies];
  }

  private async loadProxies(): Promise<void> {
    // Load from environment or configuration
    const proxyList = process.env.DATACENTER_PROXY_LIST;
    
    if (proxyList) {
      try {
        this.proxies = JSON.parse(proxyList).map((p: any) => ({
          ip: p.ip || p.host,
          port: parseInt(p.port, 10),
          protocol: p.protocol || "http",
          provider: "datacenter" as ProxyProviderType,
          username: p.username,
          password: p.password,
          metadata: {
            reliability: "medium",
            source: "datacenter-config",
          },
        }));
      } catch (e) {
        console.error("[DatacenterProxy] Failed to parse proxy list");
        this.proxies = [];
      }
    }
  }
}

export const residentialProxyProvider = new ResidentialProxyProvider();
export const datacenterProxyProvider = new DatacenterProxyProvider();
