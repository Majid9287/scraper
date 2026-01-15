/**
 * Feature flags for scraping requests
 * These flags control the scraping behavior and anti-detection features
 */
export interface IScrapeFlags {
  /** Use Playwright browser for JavaScript rendering (default: false) */
  renderJs?: boolean;
  /** Use residential proxies instead of datacenter (default: false) */
  residential?: boolean;
  /** Enable anti-bot bypass features (default: true) */
  bypass?: boolean;
  /** Enable stealth mode with fingerprint randomization (default: true) */
  stealth?: boolean;
  /** Block images to speed up scraping (default: true) */
  blockImages?: boolean;
  /** Block CSS to speed up scraping (default: false) */
  blockCss?: boolean;
  /** Block fonts to speed up scraping (default: true) */
  blockFonts?: boolean;
  /** Enable CAPTCHA solving (default: false) */
  solveCaptcha?: boolean;
  /** Use persistent session/cookies (default: false) */
  useSession?: boolean;
  /** Wait for specific selector before returning (default: undefined) */
  waitForSelector?: string;
  /** Additional wait time in ms after page load (default: 0) */
  waitTime?: number;
  /** Execute custom JavaScript on page (default: undefined) */
  executeScript?: string;
  /** Screenshot the page (default: false) */
  screenshot?: boolean;
  /** Get page as PDF (default: false) */
  pdf?: boolean;
  /** Mobile device emulation (default: false) */
  mobile?: boolean;
  /** Geographic location for proxy (default: undefined) */
  geoLocation?: string;
  /** Custom headers to include (default: undefined) */
  customHeaders?: Record<string, string>;
  /** Custom cookies to include (default: undefined) */
  customCookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  /** Retry count for failed requests (default: 3) */
  retries?: number;
  /** Priority for queue (1-10, higher = more priority) */
  priority?: number;
}

/**
 * Scrape request interface
 */
export interface IScrapeRequest {
  url: string;
  flags?: IScrapeFlags;
  timeout?: number;
  requestsPerSecond?: number;
}

/**
 * Scrape response interface
 */
export interface IScrapeResponse {
  success: boolean;
  html: string;
  headers: Record<string, string>;
  error?: string;
  /** Screenshot as base64 if requested */
  screenshot?: string;
  /** PDF as base64 if requested */
  pdf?: string;
  /** Metadata about the scrape */
  metadata?: IScrapeMetadata;
}

/**
 * Metadata about the scrape operation
 */
export interface IScrapeMetadata {
  /** Time taken in milliseconds */
  responseTime: number;
  /** Proxy used for the request */
  proxyUsed?: string;
  /** Number of attempts made */
  attempts: number;
  /** Whether browser was used */
  browserUsed: boolean;
  /** Whether CAPTCHA was solved */
  captchaSolved?: boolean;
  /** Final URL after redirects */
  finalUrl?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Content type of the response */
  contentType?: string;
  /** Size of the response in bytes */
  contentLength?: number;
}

/**
 * Request body interface for scrape endpoint
 */
export interface IScrapeRequestBody {
  url: string;
  /** Feature flags for the request */
  flags?: IScrapeFlags;
  /** Custom timeout in ms */
  timeout?: number;
  /** Custom rate limit */
  requestsPerSecond?: number;
}

/**
 * Queue job data interface
 */
export interface IScrapeJobData {
  url: string;
  flags: IScrapeFlags;
  timeout: number;
  requestsPerSecond: number;
  jobId: string;
  createdAt: number;
}

/**
 * Queue job result interface
 */
export interface IScrapeJobResult {
  jobId: string;
  response: IScrapeResponse;
  completedAt: number;
}
