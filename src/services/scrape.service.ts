import { IProxy, IScrapeRequest, IScrapeResponse, IScrapeFlags, IScrapeMetadata } from "../interfaces";
import { proxyService } from "./proxy.service";
import { advancedRateLimiterService } from "./advanced-rate-limiter.service";
import { httpClientService } from "./http-client.service";
import { playwrightScraperService } from "./playwright-scraper.service";
import { captchaService } from "./captcha.service";
import { sessionService } from "./session.service";
import { monitoringService } from "./monitoring.service";
import { getAppConfig } from "../config";
import { SUCCESS_STATUS_RANGE } from "../constants";

/**
 * Main scrape service for orchestrating all scraping operations
 * Supports both HTTP and browser-based scraping with anti-detection features
 */
export class ScrapeService {
  private readonly config = getAppConfig();

  /**
   * Scrape a URL with automatic mode selection
   * @param request - Scrape request with URL and flags
   * @returns Scrape response with HTML, headers, and metadata
   */
  async scrapeUrl(request: IScrapeRequest): Promise<IScrapeResponse> {
    const startTime = Date.now();
    const flags = this.normalizeFlags(request.flags || {});
    const timeout = request.timeout || this.config.scraping.timeout;
    const requestsPerSecond = request.requestsPerSecond || this.config.scraping.requestsPerSecond;

    console.log(`[ScrapeService] Starting scrape for: ${request.url}`);
    console.log(`[ScrapeService] Flags: ${JSON.stringify(flags)}`);

    // Extract domain for rate limiting
    const domain = new URL(request.url).hostname;

    try {
      // Apply domain rate limiting with adaptive throttling
      await advancedRateLimiterService.throttleDomain(domain);

      // Determine scraping mode
      const useBrowser = flags.renderJs || flags.solveCaptcha || flags.screenshot || flags.pdf;

      if (useBrowser) {
        return await this.scrapeWithBrowser(request, flags, timeout);
      } else {
        return await this.scrapeWithHttp(request, flags, timeout, requestsPerSecond);
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error(`[ScrapeService] Scrape failed: ${error.message}`);

      // Update adaptive rate limiting on failure
      await advancedRateLimiterService.updateDomainSuccessRate(domain, false);

      // Record failure metric
      monitoringService.recordFailure(error.message, {
        url: request.url,
        domain,
        browser: flags.renderJs,
      });

      return {
        success: false,
        html: "",
        headers: {},
        error: error.message,
        metadata: {
          responseTime,
          attempts: 1,
          browserUsed: flags.renderJs || false,
        },
      };
    }
  }

  /**
   * Scrape using Playwright browser
   */
  private async scrapeWithBrowser(
    request: IScrapeRequest,
    flags: IScrapeFlags,
    timeout: number
  ): Promise<IScrapeResponse> {
    const startTime = Date.now();
    const domain = new URL(request.url).hostname;

    // Get proxy if needed
    let proxy: IProxy | undefined;
    if (flags.residential) {
      proxy = await proxyService.getNextProxy(true);
    } else {
      proxy = await proxyService.getNextProxy(false);
    }

    console.log(`[ScrapeService] Using browser mode with proxy: ${proxy ? `${proxy.ip}:${proxy.port}` : "none"}`);

    // Handle session management
    let sessionId: string | undefined;
    if (flags.useSession) {
      sessionId = await sessionService.getOrCreateSession(domain, {
        userAgent: undefined, // Will be randomized
        viewport: undefined, // Will be randomized
      });
      console.log(`[ScrapeService] Using session: ${sessionId}`);
    }

    try {
      // Scrape with Playwright
      const result = await playwrightScraperService.scrapeWithBrowser(
        { ...request, flags, timeout },
        proxy
      );

      if (result.success) {
        // Mark proxy as successful
        if (proxy) {
          await proxyService.markProxySuccess(proxy);
        }

        // Update adaptive rate limiting on success
        await advancedRateLimiterService.updateDomainSuccessRate(domain, true);

        // Record success metric
        monitoringService.recordSuccess({
          url: request.url,
          domain,
          browser: true,
          responseTime: result.metadata?.responseTime || Date.now() - startTime,
        });
      } else {
        // Mark proxy as failed
        if (proxy) {
          await proxyService.markProxyFailed(proxy);
        }

        // Update adaptive rate limiting on failure
        await advancedRateLimiterService.updateDomainSuccessRate(domain, false);
      }

      return result;
    } catch (error: any) {
      if (proxy) {
        await proxyService.markProxyFailed(proxy);
      }
      throw error;
    }
  }

  /**
   * Scrape using HTTP client (faster, but no JS rendering)
   */
  private async scrapeWithHttp(
    request: IScrapeRequest,
    flags: IScrapeFlags,
    timeout: number,
    requestsPerSecond: number
  ): Promise<IScrapeResponse> {
    const startTime = Date.now();
    const domain = new URL(request.url).hostname;
    const maxAttempts = flags.retries || this.config.scraping.maxAttempts;

    let lastError: string = "";
    let attempt = 0;
    let captchaSolved = false;

    while (attempt < maxAttempts) {
      const attemptStartTime = Date.now();

      // Check if we've exceeded total timeout
      if (attemptStartTime - startTime > timeout) {
        console.log(`[ScrapeService] Total timeout of ${timeout}ms exceeded`);
        break;
      }

      attempt++;
      let currentProxy: IProxy | null = null;

      try {
        console.log(`[ScrapeService] HTTP attempt ${attempt}/${maxAttempts}`);

        // Get proxy (prefer residential if flag is set)
        currentProxy = await proxyService.getNextProxy(flags.residential);
        console.log(`[ScrapeService] Using proxy: ${currentProxy.ip}:${currentProxy.port}`);

        // Check rate limit for this proxy
        const isWithinRateLimit = await advancedRateLimiterService.isProxyWithinRateLimit(
          currentProxy,
          requestsPerSecond
        );

        if (!isWithinRateLimit) {
          console.log(`[ScrapeService] Proxy rate limited, trying next`);
          continue;
        }

        // Increment rate limit counter
        await advancedRateLimiterService.incrementProxyRateLimit(currentProxy, requestsPerSecond);

        // Add random delay between requests (anti-detection)
        if (attempt > 1) {
          const delay = advancedRateLimiterService.getExponentialBackoffDelay(attempt);
          console.log(`[ScrapeService] Waiting ${delay}ms before retry`);
          await this.sleep(delay);
        }

        // Make HTTP request through proxy
        const response = await httpClientService.makeRequest(
          request.url,
          currentProxy,
          {
            timeout: this.config.scraping.proxyTimeout,
            headers: flags.customHeaders,
          }
        );

        // Check if successful
        if (response.status >= SUCCESS_STATUS_RANGE.min && response.status <= SUCCESS_STATUS_RANGE.max) {
          const responseTime = Date.now() - startTime;
          console.log(`[ScrapeService] Scrape successful in ${responseTime}ms`);

          // Mark proxy as successful
          await proxyService.markProxySuccess(currentProxy);

          // Update adaptive rate limiting on success
          await advancedRateLimiterService.updateDomainSuccessRate(domain, true);

          // Record success metric
          monitoringService.recordSuccess({
            url: request.url,
            domain,
            browser: false,
            responseTime,
            proxy: `${currentProxy.ip}:${currentProxy.port}`,
          });

          monitoringService.recordResponseTime(responseTime, {
            domain,
            browser: false,
          });

          const metadata: IScrapeMetadata = {
            responseTime,
            proxyUsed: `${currentProxy.ip}:${currentProxy.port}`,
            attempts: attempt,
            browserUsed: false,
            captchaSolved,
            finalUrl: response.finalUrl || request.url,
            statusCode: response.status,
            contentType: response.contentType || response.headers["content-type"],
            contentLength: response.data.length,
          };

          return {
            success: true,
            html: response.data,
            headers: response.headers,
            metadata,
          };
        } else {
          // Non-success status
          const error = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`[ScrapeService] Attempt ${attempt} failed: ${error}`);
          lastError = error;

          // Mark proxy as failed on 4xx/5xx
          if (response.status >= 400) {
            await proxyService.markProxyFailed(currentProxy);
          }

          continue;
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`[ScrapeService] Attempt ${attempt} error: ${errorMessage}`);
        lastError = errorMessage;

        // Mark proxy as failed
        if (currentProxy) {
          await proxyService.markProxyFailed(currentProxy);
        }

        continue;
      }
    }

    // All attempts failed
    const totalTime = Date.now() - startTime;
    console.log(`[ScrapeService] All attempts failed after ${totalTime}ms`);

    // Update adaptive rate limiting on failure
    await advancedRateLimiterService.updateDomainSuccessRate(domain, false);

    // Record failure metric
    monitoringService.recordFailure(lastError, {
      url: request.url,
      domain,
      browser: false,
      attempts: attempt,
    });

    return {
      success: false,
      html: "",
      headers: {},
      error: attempt >= maxAttempts
        ? `Maximum attempts (${maxAttempts}) reached: ${lastError}`
        : lastError || "All proxy attempts failed",
      metadata: {
        responseTime: totalTime,
        attempts: attempt,
        browserUsed: false,
        captchaSolved,
      },
    };
  }

  /**
   * Normalize flags with defaults from config
   */
  private normalizeFlags(flags: IScrapeFlags): IScrapeFlags {
    return {
      renderJs: flags.renderJs ?? this.config.scraping.defaultRenderJs,
      residential: flags.residential ?? false,
      bypass: flags.bypass ?? this.config.scraping.defaultBypass,
      stealth: flags.stealth ?? this.config.scraping.defaultStealth,
      blockImages: flags.blockImages ?? this.config.browser.blockImages,
      blockCss: flags.blockCss ?? this.config.browser.blockCss,
      blockFonts: flags.blockFonts ?? this.config.browser.blockFonts,
      solveCaptcha: flags.solveCaptcha ?? false,
      useSession: flags.useSession ?? false,
      waitForSelector: flags.waitForSelector,
      waitTime: flags.waitTime ?? 0,
      executeScript: flags.executeScript,
      screenshot: flags.screenshot ?? false,
      pdf: flags.pdf ?? false,
      mobile: flags.mobile ?? false,
      geoLocation: flags.geoLocation,
      customHeaders: flags.customHeaders,
      customCookies: flags.customCookies,
      retries: flags.retries ?? 3,
      priority: flags.priority ?? 5,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const scrapeService = new ScrapeService();
export default scrapeService;
