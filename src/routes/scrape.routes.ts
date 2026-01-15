import { Router } from "express";
import { asyncWrapper } from "../middlewares";
import {
  scrapeUrl,
  getJobStatus,
  getJobResult,
  cancelJob,
  getQueueStats,
  getMetrics,
  getHealth,
  getAlerts,
  getProxyStats,
  refreshProxies,
} from "../controllers/scrape.controller";

const router = Router();

/**
 * POST /scrape
 * Scrape a URL using proxy rotation and rate limiting
 * Body: {
 *   url: string,
 *   flags?: {
 *     renderJs?: boolean,      // Use browser for JS rendering
 *     residential?: boolean,    // Use residential proxies
 *     bypass?: boolean,         // Enable anti-bot bypass (default: true)
 *     stealth?: boolean,        // Enable stealth mode (default: true)
 *     blockImages?: boolean,    // Block images (default: true)
 *     blockCss?: boolean,       // Block CSS (default: false)
 *     blockFonts?: boolean,     // Block fonts (default: true)
 *     solveCaptcha?: boolean,   // Enable CAPTCHA solving
 *     useSession?: boolean,     // Use persistent session
 *     waitForSelector?: string, // Wait for specific selector
 *     waitTime?: number,        // Additional wait time in ms
 *     executeScript?: string,   // Custom script to execute
 *     screenshot?: boolean,     // Take screenshot
 *     pdf?: boolean,            // Generate PDF
 *     mobile?: boolean,         // Mobile device emulation
 *     geoLocation?: string,     // Geographic location (US, UK, etc.)
 *     customHeaders?: object,   // Custom headers
 *     customCookies?: array,    // Custom cookies
 *     retries?: number,         // Retry count (1-10)
 *     priority?: number         // Queue priority (1-10)
 *   },
 *   timeout?: number,
 *   requestsPerSecond?: number,
 *   async?: boolean            // If true, returns jobId for async processing
 * }
 */
router.post("/", asyncWrapper(scrapeUrl));

/**
 * GET /jobs/:jobId
 * Get job status
 */
router.get("/jobs/:jobId", asyncWrapper(getJobStatus));

/**
 * GET /jobs/:jobId/result
 * Wait for job completion and get result
 * Query: timeout?: number (ms, default: 60000)
 */
router.get("/jobs/:jobId/result", asyncWrapper(getJobResult));

/**
 * DELETE /jobs/:jobId
 * Cancel a job
 */
router.delete("/jobs/:jobId", asyncWrapper(cancelJob));

/**
 * GET /queue/stats
 * Get queue statistics
 */
router.get("/queue/stats", asyncWrapper(getQueueStats));

/**
 * GET /metrics
 * Get monitoring metrics
 * Query: hours?: number (default: 1)
 */
router.get("/metrics", asyncWrapper(getMetrics));

/**
 * GET /health
 * Get service health status
 */
router.get("/health", asyncWrapper(getHealth));

/**
 * GET /alerts
 * Get recent alerts
 * Query: limit?: number (default: 50)
 */
router.get("/alerts", asyncWrapper(getAlerts));

/**
 * GET /proxies/stats
 * Get proxy statistics
 */
router.get("/proxies/stats", asyncWrapper(getProxyStats));

/**
 * POST /proxies/refresh
 * Refresh proxies from providers
 */
router.post("/proxies/refresh", asyncWrapper(refreshProxies));

export default router;
