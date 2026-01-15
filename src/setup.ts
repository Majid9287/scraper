import { getAppConfig } from "./config";
import {
  redisService,
  proxyService,
  sessionService,
  queueService,
  monitoringService,
  scrapeService,
  setMonitoringService,
} from "./services";
import app from "./app";
import { IScrapeJobData, IScrapeResponse } from "./interfaces";

/**
 * Setup graceful shutdown handlers
 */
const setupGracefulShutdown = (server: any): void => {
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      try {
        // Shutdown services in order
        await queueService.shutdown();
        await sessionService.shutdown();
        await monitoringService.shutdown();
        proxyService.shutdown();
        await redisService.disconnect();
        
        console.log("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        console.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
};

/**
 * Job processor for queue service
 */
const jobProcessor = async (job: any): Promise<IScrapeResponse> => {
  const data = job.data as IScrapeJobData;
  
  console.log(`[Worker] Processing job ${data.jobId} for URL: ${data.url}`);
  
  const result = await scrapeService.scrapeUrl({
    url: data.url,
    flags: data.flags,
    timeout: data.timeout,
    requestsPerSecond: data.requestsPerSecond,
  });

  return result;
};

/**
 * Start the server
 */
export const startServer = async (): Promise<void> => {
  try {
    const config = getAppConfig();

    // Connect to Redis
    await redisService.connect();
    console.log("✓ Redis connected successfully");

    // Initialize proxy service
    await proxyService.initialize();
    console.log("✓ ProxyService initialized successfully");

    // Initialize session service
    await sessionService.initialize();
    console.log("✓ SessionService initialized successfully");

    // Initialize monitoring service
    await monitoringService.initialize();
    
    // Wire monitoring service to playwright scraper
    setMonitoringService(monitoringService);
    console.log("✓ MonitoringService initialized successfully");

    // Initialize queue service if enabled
    if (config.queue.enabled) {
      await queueService.initialize(jobProcessor);
      console.log("✓ QueueService initialized successfully");
    } else {
      console.log("○ QueueService disabled");
    }

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`\n🚀 Server running on port ${config.port}`);
      console.log(`   Environment: ${config.nodeEnv}`);
      console.log(`   API Version: ${config.apiVersion}`);
      console.log(`\n📡 Endpoints:`);
      console.log(`   POST /api/scrape - Scrape a URL`);
      console.log(`   GET  /api/health - Health check`);
      console.log(`   GET  /api/metrics - Monitoring metrics`);
      console.log(`   GET  /api/alerts - Recent alerts`);
      console.log(`   GET  /api/proxies/stats - Proxy statistics`);
      console.log(`   POST /api/proxies/refresh - Refresh proxies`);
      if (config.queue.enabled) {
        console.log(`   GET  /api/jobs/:jobId - Job status`);
        console.log(`   GET  /api/jobs/:jobId/result - Job result`);
        console.log(`   DELETE /api/jobs/:jobId - Cancel job`);
        console.log(`   GET  /api/queue/stats - Queue statistics`);
      }
      console.log(`\n✨ Ready to scrape!`);
    });

    setupGracefulShutdown(server);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Auto-start if this is the main module
startServer();

if (require.main === module) {
  startServer();
}
