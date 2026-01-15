/**
 * Application configuration
 * Handles app-related environment variables
 */

export interface AppConfig {
  readonly port: number;
  readonly nodeEnv: string;
  readonly apiVersion: string;
  readonly corsOrigin: string;
  readonly maxRequestSize: string;
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password?: string;
  };
  readonly scraping: {
    readonly timeout: number;
    readonly requestsPerSecond: number;
    readonly proxyTimeout: number;
    readonly maxAttempts: number;
    readonly defaultRenderJs: boolean;
    readonly defaultBypass: boolean;
    readonly defaultStealth: boolean;
  };
  readonly browser: {
    readonly headless: boolean;
    readonly defaultViewportWidth: number;
    readonly defaultViewportHeight: number;
    readonly slowMo: number;
    readonly blockImages: boolean;
    readonly blockCss: boolean;
    readonly blockFonts: boolean;
  };
  readonly proxy: {
    readonly defaultProvider: "free" | "residential" | "datacenter";
    readonly residentialApiKey: string;
    readonly residentialApiUrl: string;
    readonly residentialCountry: string;
    readonly proxyHealthCheckInterval: number;
    readonly maxProxyFailures: number;
  };
  readonly captcha: {
    readonly enabled: boolean;
    readonly provider: "2captcha" | "anticaptcha" | "capmonster";
    readonly apiKey: string;
    readonly timeout: number;
  };
  readonly session: {
    readonly enabled: boolean;
    readonly maxAge: number;
    readonly cleanupInterval: number;
  };
  readonly queue: {
    readonly enabled: boolean;
    readonly concurrency: number;
    readonly maxJobsPerWorker: number;
    readonly jobTimeout: number;
    readonly retryAttempts: number;
    readonly retryDelay: number;
  };
  readonly monitoring: {
    readonly enabled: boolean;
    readonly metricsInterval: number;
    readonly alertThresholds: {
      readonly errorRate: number;
      readonly responseTime: number;
      readonly queueSize: number;
    };
  };
  readonly rateLimit: {
    readonly defaultRequestsPerSecond: number;
    readonly burstLimit: number;
    readonly windowMs: number;
    readonly enableAdaptive: boolean;
    readonly minDelay: number;
    readonly maxDelay: number;
  };
}

/**
 * Get application configuration from environment variables
 */
export const getAppConfig = (): AppConfig => {
  return {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    apiVersion: process.env.API_VERSION || "v1",
    corsOrigin: process.env.CORS_ORIGIN || "*",
    maxRequestSize: process.env.MAX_REQUEST_SIZE || "10mb",
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD,
    },
    scraping: {
      timeout: parseInt(process.env.SCRAPE_TIMEOUT_MS || "30000", 10),
      requestsPerSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND || "1", 10),
      proxyTimeout: parseInt(process.env.PROXY_TIMEOUT_MS || "10000", 10),
      maxAttempts: parseInt(process.env.MAX_ATTEMPTS || "100", 10),
      defaultRenderJs: process.env.DEFAULT_RENDER_JS === "true",
      defaultBypass: process.env.DEFAULT_BYPASS !== "false",
      defaultStealth: process.env.DEFAULT_STEALTH !== "false",
    },
    browser: {
      headless: process.env.BROWSER_HEADLESS !== "false",
      defaultViewportWidth: parseInt(process.env.DEFAULT_VIEWPORT_WIDTH || "1920", 10),
      defaultViewportHeight: parseInt(process.env.DEFAULT_VIEWPORT_HEIGHT || "1080", 10),
      slowMo: parseInt(process.env.BROWSER_SLOW_MO || "0", 10),
      blockImages: process.env.BLOCK_IMAGES !== "false",
      blockCss: process.env.BLOCK_CSS === "true",
      blockFonts: process.env.BLOCK_FONTS !== "false",
    },
    proxy: {
      defaultProvider: (process.env.DEFAULT_PROXY_PROVIDER as "free" | "residential" | "datacenter") || "free",
      residentialApiKey: process.env.RESIDENTIAL_PROXY_API_KEY || "",
      residentialApiUrl: process.env.RESIDENTIAL_PROXY_API_URL || "",
      residentialCountry: process.env.RESIDENTIAL_PROXY_COUNTRY || "US",
      proxyHealthCheckInterval: parseInt(process.env.PROXY_HEALTH_CHECK_INTERVAL || "60000", 10),
      maxProxyFailures: parseInt(process.env.MAX_PROXY_FAILURES || "3", 10),
    },
    captcha: {
      enabled: process.env.CAPTCHA_ENABLED === "true",
      provider: (process.env.CAPTCHA_PROVIDER as "2captcha" | "anticaptcha" | "capmonster") || "2captcha",
      apiKey: process.env.CAPTCHA_API_KEY || "",
      timeout: parseInt(process.env.CAPTCHA_TIMEOUT || "120000", 10),
    },
    session: {
      enabled: process.env.SESSION_ENABLED === "true",
      maxAge: parseInt(process.env.SESSION_MAX_AGE || "3600000", 10),
      cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || "300000", 10),
    },
    queue: {
      enabled: process.env.QUEUE_ENABLED === "true",
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || "5", 10),
      maxJobsPerWorker: parseInt(process.env.MAX_JOBS_PER_WORKER || "100", 10),
      jobTimeout: parseInt(process.env.JOB_TIMEOUT || "60000", 10),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || "3", 10),
      retryDelay: parseInt(process.env.RETRY_DELAY || "5000", 10),
    },
    monitoring: {
      enabled: process.env.MONITORING_ENABLED !== "false",
      metricsInterval: parseInt(process.env.METRICS_INTERVAL || "10000", 10),
      alertThresholds: {
        errorRate: parseFloat(process.env.ALERT_ERROR_RATE || "0.1"),
        responseTime: parseInt(process.env.ALERT_RESPONSE_TIME || "30000", 10),
        queueSize: parseInt(process.env.ALERT_QUEUE_SIZE || "1000", 10),
      },
    },
    rateLimit: {
      defaultRequestsPerSecond: parseInt(process.env.DEFAULT_REQUESTS_PER_SECOND || "1", 10),
      burstLimit: parseInt(process.env.BURST_LIMIT || "5", 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "1000", 10),
      enableAdaptive: process.env.ENABLE_ADAPTIVE_RATE_LIMIT === "true",
      minDelay: parseInt(process.env.MIN_DELAY_MS || "500", 10),
      maxDelay: parseInt(process.env.MAX_DELAY_MS || "10000", 10),
    },
  };
};

/**
 * Check if application is in development mode
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === "development";
};

/**
 * Check if application is in production mode
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === "production";
};
