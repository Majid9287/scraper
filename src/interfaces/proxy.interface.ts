/**
 * Base proxy interface
 */
export interface IProxy {
  ip: string;
  port: number;
  protocol: "http" | "https" | "socks4" | "socks5";
  provider: ProxyProviderType;
  username?: string;
  password?: string;
  metadata?: IProxyMetadata;
}

/**
 * Proxy metadata interface
 */
export interface IProxyMetadata {
  country?: string;
  city?: string;
  isp?: string;
  asn?: string;
  lastChecked?: string;
  reliability?: "low" | "medium" | "high";
  speed?: number;
  anonymity?: "transparent" | "anonymous" | "elite";
  source?: string;
}

/**
 * Proxy provider types
 */
export type ProxyProviderType = "free" | "residential" | "datacenter" | "rotating" | "mobile";

/**
 * Proxy provider interface
 */
export interface IProxyProvider {
  readonly providerType: ProxyProviderType;
  getProxies(): Promise<IProxy[]>;
  refreshProxies?(): Promise<void>;
  validateProxy?(proxy: IProxy): Promise<boolean>;
}

/**
 * Proxy service interface
 */
export interface IProxyService {
  getNextProxy(preferResidential?: boolean): Promise<IProxy>;
  getAvailableProxies(): Promise<IProxy[]>;
  markProxyFailed(proxy: IProxy): Promise<void>;
  markProxySuccess(proxy: IProxy): Promise<void>;
}

/**
 * Provider factory interface
 */
export interface IProxyProviderFactory {
  getProvider(type: ProxyProviderType): IProxyProvider;
  registerProvider(type: ProxyProviderType, provider: IProxyProvider): void;
}

/**
 * Proxy health status
 */
export interface IProxyHealth {
  proxy: IProxy;
  successCount: number;
  failureCount: number;
  lastSuccess?: number;
  lastFailure?: number;
  averageResponseTime?: number;
  isHealthy: boolean;
}

/**
 * Residential proxy configuration
 */
export interface IResidentialProxyConfig {
  apiKey: string;
  baseUrl: string;
  country?: string;
  city?: string;
  sessionType?: "rotating" | "sticky";
  sessionDuration?: number;
}
