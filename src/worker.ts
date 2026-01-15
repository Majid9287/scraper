import { getAppConfig } from "./config";
import { redisService, proxyService, queueService, monitoringService, scrapeService } from "./services";
import { IScrapeJobData, IScrapeResponse } from "./interfaces";

/**
 * Worker process for distributed queue processing
 * Run multiple instances for horizontal scaling
 */

/**
 * Job processor for queue service
 */
const jobProcessor = async (job: any): Promise<IScrapeResponse> => {
  const data = job.data as IScrapeJobData;
  
  console.log(`[Worker] Processing job ${data.jobId} for URL: ${data.url}`);
  
  try {
    const result = await scrapeService.scrapeUrl({
      url: data.url,
      flags: data.flags,
      timeout: data.timeout,
      requestsPerSecond: data.requestsPerSecond,
    });

    console.log(`[Worker] Job ${data.jobId} completed: ${result.success ? "success" : "failed"}`);
    return result;
  } catch (error: any) {
    console.error(`[Worker] Job ${data.jobId} error: ${error.message}`);
    throw error;
  }
};

/**
 * Setup graceful shutdown handlers
 */
const setupGracefulShutdown = (): void => {
  const gracefulShutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}. Starting graceful shutdown...`);

    try {
      await queueService.shutdown();
      await monitoringService.shutdown();
      proxyService.shutdown();
      await redisService.disconnect();
      
      console.log("[Worker] Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("[Worker] Error during graceful shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
};

/**
 * Start the worker
 */
const startWorker = async (): Promise<void> => {
  try {
    const config = getAppConfig();

    console.log("[Worker] Starting scraper worker...");

    // Connect to Redis
    await redisService.connect();
    console.log("[Worker] ✓ Redis connected");

    // Initialize proxy service
    await proxyService.initialize();
    console.log("[Worker] ✓ ProxyService initialized");

    // Initialize monitoring service
    await monitoringService.initialize();
    console.log("[Worker] ✓ MonitoringService initialized");

    // Initialize queue service with job processor
    if (!config.queue.enabled) {
      console.error("[Worker] Queue service is not enabled. Set QUEUE_ENABLED=true");
      process.exit(1);
    }

    await queueService.initialize(jobProcessor);
    console.log("[Worker] ✓ QueueService initialized");

    console.log(`\n🔧 Worker running with concurrency: ${config.queue.concurrency}`);
    console.log("[Worker] Waiting for jobs...\n");

    setupGracefulShutdown();
  } catch (error) {
    console.error("[Worker] Failed to start:", error);
    process.exit(1);
  }
};

// Start the worker
startWorker();
