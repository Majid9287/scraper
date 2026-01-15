import { chromium, Browser, BrowserContext, Page, Response } from "playwright";
import { getAppConfig } from "../config";
import {
  IProxy,
  IScrapeRequest,
  IScrapeResponse,
  IScrapeFlags,
  IScrapeMetadata,
  IBrowserContextOptions,
  IBrowserLaunchOptions,
} from "../interfaces";

// Monitoring service stub - will be set by setup
interface IMonitoringStub {
  recordMetric: (name: string, value: number, tags?: Record<string, any>) => void;
}

let monitoringServiceInstance: IMonitoringStub = {
  recordMetric: () => {},
};

/**
 * Set monitoring service instance (called from setup)
 */
export const setMonitoringService = (service: IMonitoringStub): void => {
  monitoringServiceInstance = service;
};

/**
 * Get monitoring service
 */
const getMonitoringService = (): IMonitoringStub => monitoringServiceInstance;

/**
 * User agents pool for randomization
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

/**
 * Viewports pool for randomization
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1440 },
];

/**
 * Timezones pool for randomization
 */
const TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
];

/**
 * Locales pool for randomization
 */
const LOCALES = ["en-US", "en-GB", "en-CA", "en-AU"];

/**
 * Playwright-based scraper service with anti-detection features
 * Implements stealth mode, fingerprint randomization, and request interception
 */
export class PlaywrightScraperService {
  private readonly config = getAppConfig();
  private browser: Browser | null = null;

  /**
   * Get random item from array
   */
  private getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Get random user agent
   */
  private getRandomUserAgent(): string {
    return this.getRandomItem(USER_AGENTS);
  }

  /**
   * Get random viewport
   */
  private getRandomViewport(): { width: number; height: number } {
    return this.getRandomItem(VIEWPORTS);
  }

  /**
   * Get random timezone
   */
  private getRandomTimezone(): string {
    return this.getRandomItem(TIMEZONES);
  }

  /**
   * Get random locale
   */
  private getRandomLocale(): string {
    return this.getRandomItem(LOCALES);
  }

  /**
   * Get browser launch arguments for stealth mode
   */
  private getBrowserArgs(flags: IScrapeFlags): string[] {
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-infobars",
      "--window-position=0,0",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-skip-list",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ];

    if (flags.bypass !== false) {
      args.push(
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-web-security"
      );
    }

    return args;
  }

  /**
   * Apply stealth scripts to page
   */
  private async applyStealthScripts(page: Page): Promise<void> {
    // Override navigator.webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // Override navigator.plugins
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          {
            0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin",
          },
          {
            0: { type: "application/pdf", suffixes: "pdf", description: "" },
            description: "",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
            length: 1,
            name: "Chrome PDF Viewer",
          },
          {
            0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
            description: "Native Client Executable",
            filename: "internal-nacl-plugin",
            length: 2,
            name: "Native Client",
          },
        ],
      });
    });

    // Override navigator.languages
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    // Override navigator.platform
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
      });
    });

    // Override navigator.hardwareConcurrency
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", {
        get: () => 8,
      });
    });

    // Override navigator.deviceMemory
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", {
        get: () => 8,
      });
    });

    // Override window.chrome
    await page.addInitScript(() => {
      (window as any).chrome = {
        runtime: {
          PlatformOs: { MAC: "mac", WIN: "win", ANDROID: "android", CROS: "cros", LINUX: "linux", OPENBSD: "openbsd" },
          PlatformArch: { ARM: "arm", X86_32: "x86-32", X86_64: "x86-64" },
          PlatformNaclArch: { ARM: "arm", X86_32: "x86-32", X86_64: "x86-64" },
          RequestUpdateCheckStatus: { THROTTLED: "throttled", NO_UPDATE: "no_update", UPDATE_AVAILABLE: "update_available" },
          OnInstalledReason: { INSTALL: "install", UPDATE: "update", CHROME_UPDATE: "chrome_update", SHARED_MODULE_UPDATE: "shared_module_update" },
          OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
        },
      };
    });

    // Override permissions.query
    await page.addInitScript(() => {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);
    });

    // Prevent canvas fingerprinting with subtle randomization
    await page.addInitScript(() => {
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (
        sx: number,
        sy: number,
        sw: number,
        sh: number
      ): ImageData {
        const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
        // Add subtle noise to prevent fingerprinting
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + Math.floor(Math.random() * 2) - 1));
        }
        return imageData;
      };
    });

    // Override WebGL fingerprinting
    await page.addInitScript(() => {
      const getParameterProxyHandler = {
        apply: function (target: any, thisArg: any, args: any[]) {
          const param = args[0];
          const gl = thisArg;
          // WebGL vendor and renderer
          if (param === 37445) {
            return "Intel Inc.";
          }
          if (param === 37446) {
            return "Intel Iris OpenGL Engine";
          }
          return Reflect.apply(target, thisArg, args);
        },
      };

      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);

      if (typeof WebGL2RenderingContext !== "undefined") {
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = new Proxy(originalGetParameter2, getParameterProxyHandler);
      }
    });

    // Override AudioContext fingerprinting
    await page.addInitScript(() => {
      const originalAudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (originalAudioContext) {
        const originalCreateOscillator = originalAudioContext.prototype.createOscillator;
        originalAudioContext.prototype.createOscillator = function () {
          const oscillator = originalCreateOscillator.call(this);
          const originalConnect = oscillator.connect.bind(oscillator);
          oscillator.connect = function (destination: any) {
            if (destination.context.createDynamicsCompressor) {
              const compressor = destination.context.createDynamicsCompressor();
              originalConnect(compressor);
              compressor.connect(destination);
              return destination;
            }
            return originalConnect(destination);
          };
          return oscillator;
        };
      }
    });
  }

  /**
   * Setup request interception for blocking resources
   */
  private async setupRequestInterception(page: Page, flags: IScrapeFlags): Promise<void> {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      // Block tracking and analytics
      const blockedDomains = [
        "google-analytics.com",
        "googletagmanager.com",
        "facebook.net",
        "doubleclick.net",
        "hotjar.com",
        "mixpanel.com",
        "segment.io",
        "amplitude.com",
        "newrelic.com",
        "sentry.io",
      ];

      if (blockedDomains.some((domain) => url.includes(domain))) {
        await route.abort();
        return;
      }

      // Block images if flag is set (default: true)
      if (flags.blockImages !== false && resourceType === "image") {
        await route.abort();
        return;
      }

      // Block CSS if flag is set
      if (flags.blockCss === true && resourceType === "stylesheet") {
        await route.abort();
        return;
      }

      // Block fonts if flag is set (default: true)
      if (flags.blockFonts !== false && resourceType === "font") {
        await route.abort();
        return;
      }

      // Block media files
      if (["media", "websocket"].includes(resourceType)) {
        await route.abort();
        return;
      }

      // Add custom headers if specified
      const headers = { ...request.headers() };
      if (flags.customHeaders) {
        Object.assign(headers, flags.customHeaders);
      }

      await route.continue({ headers });
    });
  }

  /**
   * Create browser context with anti-detection settings
   */
  private async createBrowserContext(
    browser: Browser,
    proxy?: IProxy,
    flags: IScrapeFlags = {}
  ): Promise<BrowserContext> {
    const viewport = this.getRandomViewport();
    const userAgent = this.getRandomUserAgent();
    const locale = this.getRandomLocale();
    const timezone = this.getRandomTimezone();

    const contextOptions: any = {
      userAgent,
      viewport,
      locale,
      timezoneId: timezone,
      permissions: ["geolocation"],
      colorScheme: "light",
      deviceScaleFactor: flags.mobile ? 2 : 1,
      isMobile: flags.mobile || false,
      hasTouch: flags.mobile || false,
      javaScriptEnabled: true,
      acceptDownloads: false,
      ignoreHTTPSErrors: true,
      bypassCSP: true,
    };

    // Add proxy if provided
    if (proxy) {
      const proxyUrl = proxy.username && proxy.password
        ? `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`
        : `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
      
      contextOptions.proxy = {
        server: proxyUrl,
        username: proxy.username,
        password: proxy.password,
      };
    }

    // Add geolocation if specified
    if (flags.geoLocation) {
      const geoLocations: Record<string, { latitude: number; longitude: number }> = {
        US: { latitude: 40.7128, longitude: -74.006 },
        UK: { latitude: 51.5074, longitude: -0.1278 },
        DE: { latitude: 52.52, longitude: 13.405 },
        FR: { latitude: 48.8566, longitude: 2.3522 },
        JP: { latitude: 35.6762, longitude: 139.6503 },
      };
      contextOptions.geolocation = geoLocations[flags.geoLocation] || geoLocations.US;
    }

    return await browser.newContext(contextOptions);
  }

  /**
   * Scrape URL with Playwright browser
   */
  async scrapeWithBrowser(request: IScrapeRequest, proxy?: IProxy): Promise<IScrapeResponse> {
    const startTime = Date.now();
    const flags = request.flags || {};
    const timeout = request.timeout || this.config.scraping.timeout;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let attempts = 0;
    let captchaSolved = false;

    try {
      console.log(`[Playwright] Starting browser scrape for: ${request.url}`);
      console.log(`[Playwright] Flags: ${JSON.stringify(flags)}`);

      // Launch browser with stealth arguments
      browser = await chromium.launch({
        headless: this.config.browser.headless,
        args: this.getBrowserArgs(flags),
        slowMo: this.config.browser.slowMo,
      });

      // Create context with anti-detection settings
      context = await this.createBrowserContext(browser, proxy, flags);
      page = await context.newPage();

      // Apply stealth scripts if bypass is enabled (default: true)
      if (flags.bypass !== false && flags.stealth !== false) {
        await this.applyStealthScripts(page);
        console.log("[Playwright] Stealth scripts applied");
      }

      // Setup request interception
      await this.setupRequestInterception(page, flags);
      console.log("[Playwright] Request interception configured");

      // Add custom cookies if specified
      if (flags.customCookies && flags.customCookies.length > 0) {
        const url = new URL(request.url);
        const cookies = flags.customCookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || url.hostname,
          path: cookie.path || "/",
        }));
        await context.addCookies(cookies);
        console.log(`[Playwright] Added ${cookies.length} custom cookies`);
      }

      // Set default navigation timeout
      page.setDefaultNavigationTimeout(timeout);
      page.setDefaultTimeout(timeout);

      // Navigate to URL
      console.log(`[Playwright] Navigating to: ${request.url}`);
      let response: Response | null = null;
      
      try {
        response = await page.goto(request.url, {
          waitUntil: "domcontentloaded",
          timeout,
        });
        attempts++;
      } catch (navError: any) {
        console.log(`[Playwright] Navigation error: ${navError.message}`);
        attempts++;
        
        // Try again with networkidle
        response = await page.goto(request.url, {
          waitUntil: "load",
          timeout,
        });
      }

      // Wait for additional time if specified
      if (flags.waitTime && flags.waitTime > 0) {
        console.log(`[Playwright] Waiting additional ${flags.waitTime}ms`);
        await page.waitForTimeout(flags.waitTime);
      }

      // Wait for specific selector if specified
      if (flags.waitForSelector) {
        console.log(`[Playwright] Waiting for selector: ${flags.waitForSelector}`);
        try {
          await page.waitForSelector(flags.waitForSelector, { timeout: timeout / 2 });
        } catch (selectorError) {
          console.log(`[Playwright] Selector timeout: ${flags.waitForSelector}`);
        }
      }

      // Execute custom script if specified
      if (flags.executeScript) {
        console.log("[Playwright] Executing custom script");
        try {
          await page.evaluate(flags.executeScript);
        } catch (scriptError: any) {
          console.log(`[Playwright] Script execution error: ${scriptError.message}`);
        }
      }

      // Get page content
      const html = await page.content();
      const finalUrl = page.url();

      // Get response headers
      const headers: Record<string, string> = {};
      if (response) {
        const responseHeaders = response.headers();
        Object.keys(responseHeaders).forEach((key) => {
          headers[key.toLowerCase()] = responseHeaders[key];
        });
      }

      // Take screenshot if requested
      let screenshot: string | undefined;
      if (flags.screenshot) {
        console.log("[Playwright] Taking screenshot");
        const screenshotBuffer = await page.screenshot({
          fullPage: true,
          type: "png",
        });
        screenshot = screenshotBuffer.toString("base64");
      }

      // Generate PDF if requested
      let pdf: string | undefined;
      if (flags.pdf) {
        console.log("[Playwright] Generating PDF");
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
        });
        pdf = pdfBuffer.toString("base64");
      }

      const responseTime = Date.now() - startTime;
      console.log(`[Playwright] Scrape completed in ${responseTime}ms`);

      // Record success metric
      const monitoring = getMonitoringService();
      monitoring.recordMetric("scrape_success", 1, {
        browser: true,
        proxy: proxy ? proxy.ip : "none",
      });

      const metadata: IScrapeMetadata = {
        responseTime,
        proxyUsed: proxy ? `${proxy.ip}:${proxy.port}` : undefined,
        attempts,
        browserUsed: true,
        captchaSolved,
        finalUrl,
        statusCode: response?.status(),
        contentType: headers["content-type"],
        contentLength: html.length,
      };

      return {
        success: true,
        html,
        headers,
        screenshot,
        pdf,
        metadata,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error(`[Playwright] Scrape failed: ${error.message}`);

      // Record failure metric
      const monitoring = getMonitoringService();
      monitoring.recordMetric("scrape_failure", 1, {
        browser: true,
        proxy: proxy ? proxy.ip : "none",
        error: error.message,
      });

      return {
        success: false,
        html: "",
        headers: {},
        error: error.message,
        metadata: {
          responseTime,
          proxyUsed: proxy ? `${proxy.ip}:${proxy.port}` : undefined,
          attempts,
          browserUsed: true,
          captchaSolved,
        },
      };
    } finally {
      // Cleanup
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
      if (context) {
        try {
          await context.close();
        } catch (e) {}
      }
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Detect if page has CAPTCHA
   */
  async detectCaptcha(page: Page): Promise<{
    hasCaptcha: boolean;
    type?: "recaptcha" | "hcaptcha" | "cloudflare" | "unknown";
    siteKey?: string;
  }> {
    try {
      // Check for reCAPTCHA
      const recaptcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha');
      if (recaptcha) {
        const siteKey = await page.evaluate(() => {
          const element = document.querySelector(".g-recaptcha");
          return element?.getAttribute("data-sitekey") || "";
        });
        return { hasCaptcha: true, type: "recaptcha", siteKey };
      }

      // Check for hCaptcha
      const hcaptcha = await page.$('iframe[src*="hcaptcha"], .h-captcha');
      if (hcaptcha) {
        const siteKey = await page.evaluate(() => {
          const element = document.querySelector(".h-captcha");
          return element?.getAttribute("data-sitekey") || "";
        });
        return { hasCaptcha: true, type: "hcaptcha", siteKey };
      }

      // Check for Cloudflare challenge
      const cloudflare = await page.$('#challenge-running, .cf-browser-verification');
      if (cloudflare) {
        return { hasCaptcha: true, type: "cloudflare" };
      }

      // Check for generic CAPTCHA indicators
      const captchaIndicators = await page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || "";
        return (
          text.includes("captcha") ||
          text.includes("robot") ||
          text.includes("human verification") ||
          text.includes("security check")
        );
      });

      if (captchaIndicators) {
        return { hasCaptcha: true, type: "unknown" };
      }

      return { hasCaptcha: false };
    } catch (error) {
      return { hasCaptcha: false };
    }
  }
}

export const playwrightScraperService = new PlaywrightScraperService();
export default playwrightScraperService;
