import { Request, Response } from "express";
import { scrapeService } from "../services/scrape.service";
import { queueService } from "../services/queue.service";
import { monitoringService } from "../services/monitoring.service";
import { proxyService } from "../services/proxy.service";
import { IScrapeRequest, IScrapeRequestBody, IScrapeFlags } from "../interfaces";
import { BadRequestError, ScrapingError } from "../errors/custom-errors";
import { isValidUrl } from "../utils/validation";
import { getAppConfig } from "../config";

const config = getAppConfig();

/**
 * Scrape a URL using proxy rotation and rate limiting
 * POST /scrape
 * Body: {
 *   url: string,
 *   flags?: {
 *     renderJs?: boolean,     // Use browser for JS rendering
 *     residential?: boolean,   // Use residential proxies
 *     bypass?: boolean,        // Enable anti-bot bypass (default: true)
 *     stealth?: boolean,       // Enable stealth mode (default: true)
 *     blockImages?: boolean,   // Block images (default: true)
 *     blockCss?: boolean,      // Block CSS (default: false)
 *     blockFonts?: boolean,    // Block fonts (default: true)
 *     solveCaptcha?: boolean,  // Enable CAPTCHA solving
 *     useSession?: boolean,    // Use persistent session
 *     waitForSelector?: string,// Wait for specific selector
 *     waitTime?: number,       // Additional wait time in ms
 *     executeScript?: string,  // Custom script to execute
 *     screenshot?: boolean,    // Take screenshot
 *     pdf?: boolean,           // Generate PDF
 *     mobile?: boolean,        // Mobile device emulation
 *     geoLocation?: string,    // Geographic location (US, UK, etc.)
 *     customHeaders?: object,  // Custom headers
 *     customCookies?: array,   // Custom cookies
 *     retries?: number,        // Retry count
 *     priority?: number        // Queue priority (1-10)
 *   },
 *   timeout?: number,
 *   requestsPerSecond?: number,
 *   async?: boolean           // If true, returns jobId for async processing
 * }
 */
export const scrapeUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const body: IScrapeRequestBody & { async?: boolean } = req.body;
    const { url, flags, timeout, requestsPerSecond } = body;

    // Validate URL
    if (!url) {
      throw new BadRequestError("URL is required");
    }

    if (!isValidUrl(url)) {
      throw new BadRequestError("Invalid URL format");
    }

    // Validate flags if provided
    if (flags) {
      validateFlags(flags);
    }

    // Build scrape request
    const scrapeRequest: IScrapeRequest = {
      url,
      flags: flags || {},
      timeout,
      requestsPerSecond,
    };

    // Check if async processing is requested
    if (body.async && queueService.isEnabled()) {
      const jobId = await queueService.addJob(scrapeRequest, {
        priority: flags?.priority,
      });

      res.status(202).json({
        success: true,
        async: true,
        jobId,
        message: "Job queued for processing",
        checkStatusUrl: `/api/jobs/${jobId}`,
      });
      return;
    }

    // Synchronous processing
    const result = await scrapeService.scrapeUrl(scrapeRequest);

    if (result.success) {
      res.status(200).json({
        success: true,
        html: result.html,
        headers: result.headers,
        screenshot: result.screenshot,
        pdf: result.pdf,
        metadata: result.metadata,
      });
    } else {
      throw new ScrapingError(result.error || "Scraping failed");
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Get job status
 * GET /jobs/:jobId
 */
export const getJobStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      throw new BadRequestError("Job ID is required");
    }

    if (!queueService.isEnabled()) {
      throw new BadRequestError("Queue service is not enabled");
    }

    const jobInfo = await queueService.getJobStatus(jobId);

    if (!jobInfo) {
      res.status(404).json({
        success: false,
        error: "Job not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      job: jobInfo,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Wait for job completion and get result
 * GET /jobs/:jobId/result
 */
export const getJobResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const timeout = parseInt(req.query.timeout as string) || 60000;

    if (!jobId) {
      throw new BadRequestError("Job ID is required");
    }

    if (!queueService.isEnabled()) {
      throw new BadRequestError("Queue service is not enabled");
    }

    const result = await queueService.waitForJob(jobId, timeout);

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Cancel a job
 * DELETE /jobs/:jobId
 */
export const cancelJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      throw new BadRequestError("Job ID is required");
    }

    if (!queueService.isEnabled()) {
      throw new BadRequestError("Queue service is not enabled");
    }

    const cancelled = await queueService.cancelJob(jobId);

    res.status(200).json({
      success: cancelled,
      message: cancelled ? "Job cancelled" : "Job not found or already processed",
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get queue statistics
 * GET /queue/stats
 */
export const getQueueStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!queueService.isEnabled()) {
      throw new BadRequestError("Queue service is not enabled");
    }

    const stats = await queueService.getQueueStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get monitoring metrics
 * GET /metrics
 */
export const getMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const hours = parseInt(req.query.hours as string) || 1;
    const metrics = await monitoringService.getAggregatedMetrics(hours);

    res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get service health status
 * GET /health
 */
export const getHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await monitoringService.getHealthStatus();
    const proxyStats = await proxyService.getStats();

    res.status(health.status === "unhealthy" ? 503 : 200).json({
      success: true,
      status: health.status,
      details: {
        ...health.details,
        proxies: proxyStats,
        queue: queueService.isEnabled() ? await queueService.getQueueStats() : null,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get recent alerts
 * GET /alerts
 */
export const getAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = await monitoringService.getAlerts(limit);

    res.status(200).json({
      success: true,
      alerts,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get proxy statistics
 * GET /proxies/stats
 */
export const getProxyStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await proxyService.getStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Refresh proxies
 * POST /proxies/refresh
 */
export const refreshProxies = async (req: Request, res: Response): Promise<void> => {
  try {
    await proxyService.refreshProxies();
    const stats = await proxyService.getStats();

    res.status(200).json({
      success: true,
      message: "Proxies refreshed",
      stats,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Validate scrape flags
 */
function validateFlags(flags: IScrapeFlags): void {
  // Validate waitTime
  if (flags.waitTime !== undefined && (flags.waitTime < 0 || flags.waitTime > 60000)) {
    throw new BadRequestError("waitTime must be between 0 and 60000ms");
  }

  // Validate retries
  if (flags.retries !== undefined && (flags.retries < 1 || flags.retries > 10)) {
    throw new BadRequestError("retries must be between 1 and 10");
  }

  // Validate priority
  if (flags.priority !== undefined && (flags.priority < 1 || flags.priority > 10)) {
    throw new BadRequestError("priority must be between 1 and 10");
  }

  // Validate geoLocation
  const validGeoLocations = ["US", "UK", "DE", "FR", "JP", "CA", "AU"];
  if (flags.geoLocation && !validGeoLocations.includes(flags.geoLocation)) {
    throw new BadRequestError(`geoLocation must be one of: ${validGeoLocations.join(", ")}`);
  }

  // Validate customCookies format
  if (flags.customCookies) {
    if (!Array.isArray(flags.customCookies)) {
      throw new BadRequestError("customCookies must be an array");
    }
    for (const cookie of flags.customCookies) {
      if (!cookie.name || !cookie.value) {
        throw new BadRequestError("Each cookie must have name and value");
      }
    }
  }
}
