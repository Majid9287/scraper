import {
  IProxyProvider,
  IProxyProviderFactory,
  ProxyProviderType,
} from "../interfaces/proxy.interface";

/**
 * Provider factory for creating proxy providers
 * Supports multiple provider types: free, residential, datacenter
 */
class ProxyProviderFactory implements IProxyProviderFactory {
  private providers: Map<ProxyProviderType, IProxyProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Get provider by type with type safety
   * @param type - Provider type
   * @returns Provider instance
   */
  getProvider(type: ProxyProviderType): IProxyProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider '${type}' not found`);
    }
    return provider;
  }

  /**
   * Register a new provider
   * @param type - Provider type
   * @param provider - Provider instance
   */
  registerProvider(type: ProxyProviderType, provider: IProxyProvider): void {
    this.providers.set(type, provider);
    console.log(`[ProxyProviderFactory] Registered provider: ${type}`);
  }

  /**
   * Check if provider is registered
   * @param type - Provider type
   * @returns true if provider exists
   */
  hasProvider(type: ProxyProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get all registered provider types
   * @returns Array of provider types
   */
  getAvailableProviders(): ProxyProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Initialize providers
   */
  private initializeProviders(): void {
    // Initialize free proxy provider
    const { FreeProxyProvider } = require("./free-proxy-provider");
    this.providers.set("free", new FreeProxyProvider());

    // Initialize residential proxy provider
    const { ResidentialProxyProvider, DatacenterProxyProvider } = require("./residential-proxy-provider");
    this.providers.set("residential", new ResidentialProxyProvider());
    this.providers.set("datacenter", new DatacenterProxyProvider());

    console.log(`[ProxyProviderFactory] Initialized providers: ${this.getAvailableProviders().join(", ")}`);
  }
}

export const proxyProviderFactory = new ProxyProviderFactory();
export default proxyProviderFactory;
