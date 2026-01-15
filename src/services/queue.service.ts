import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { getAppConfig } from "../config";
import { IScrapeRequest, IScrapeResponse, IScrapeJobData, IScrapeJobResult, IScrapeFlags } from "../interfaces";

/**
 * Queue job status
 */
export type JobStatus = "waiting" | "active" | "completed" | "failed" | "delayed";

/**
 * Job info interface
 */
export interface IJobInfo {
  id: string;
  status: JobStatus;
  progress: number;
  data: IScrapeJobData;
  result?: IScrapeResponse;
  error?: string;
  createdAt: number;
  processedAt?: number;
  completedAt?: number;
  attempts: number;
}

/**
 * Queue statistics interface
 */
export interface IQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/**
 * Queue service for distributed scraping
 * Uses BullMQ for reliable job processing
 */
export class QueueService {
  private readonly config = getAppConfig();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueEvents: QueueEvents | null = null;
  private isInitialized: boolean = false;
  private jobProcessor: ((job: Job<IScrapeJobData>) => Promise<IScrapeResponse>) | null = null;

  /**
   * Initialize queue service
   */
  async initialize(
    processor: (job: Job<IScrapeJobData>) => Promise<IScrapeResponse>
  ): Promise<void> {
    if (!this.config.queue.enabled) {
      console.log("[QueueService] Queue disabled");
      return;
    }

    if (this.isInitialized) {
      console.log("[QueueService] Already initialized");
      return;
    }

    this.jobProcessor = processor;

    const redisConnection = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
    };

    // Create queue
    this.queue = new Queue("scraping-tasks", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: this.config.queue.retryAttempts,
        backoff: {
          type: "exponential",
          delay: this.config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });

    // Create worker
    this.worker = new Worker<IScrapeJobData, IScrapeResponse>(
      "scraping-tasks",
      async (job) => {
        console.log(`[QueueService] Processing job ${job.id}`);
        
        if (!this.jobProcessor) {
          throw new Error("Job processor not set");
        }

        try {
          const result = await this.jobProcessor(job);
          return result;
        } catch (error: any) {
          console.error(`[QueueService] Job ${job.id} failed: ${error.message}`);
          throw error;
        }
      },
      {
        connection: redisConnection,
        concurrency: this.config.queue.concurrency,
        limiter: {
          max: this.config.queue.maxJobsPerWorker,
          duration: 60000, // Per minute
        },
      }
    );

    // Setup event handlers
    this.worker.on("completed", (job, result) => {
      console.log(`[QueueService] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(`[QueueService] Job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on("error", (error) => {
      console.error(`[QueueService] Worker error: ${error.message}`);
    });

    // Create queue events for monitoring
    this.queueEvents = new QueueEvents("scraping-tasks", {
      connection: redisConnection,
    });

    this.isInitialized = true;
    console.log("[QueueService] Initialized with concurrency:", this.config.queue.concurrency);
  }

  /**
   * Add scrape job to queue
   */
  async addJob(request: IScrapeRequest, options: {
    priority?: number;
    delay?: number;
    jobId?: string;
  } = {}): Promise<string> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const jobId = options.jobId || uuidv4();
    const flags = request.flags || {};

    const jobData: IScrapeJobData = {
      url: request.url,
      flags: this.normalizeFlags(flags),
      timeout: request.timeout || this.config.scraping.timeout,
      requestsPerSecond: request.requestsPerSecond || this.config.scraping.requestsPerSecond,
      jobId,
      createdAt: Date.now(),
    };

    // Add random delay to avoid detection
    const randomDelay = Math.floor(Math.random() * 3000);
    const totalDelay = (options.delay || 0) + randomDelay;

    await this.queue.add("scrape", jobData, {
      jobId,
      priority: options.priority || flags.priority || 5,
      delay: totalDelay,
      // Note: timeout is handled by the worker's job.opts or jobData.timeout
    });

    console.log(`[QueueService] Job ${jobId} added to queue with delay ${totalDelay}ms`);
    return jobId;
  }

  /**
   * Add multiple jobs to queue
   */
  async addBulkJobs(requests: IScrapeRequest[], options: {
    priority?: number;
    delayBetween?: number;
  } = {}): Promise<string[]> {
    const jobIds: string[] = [];
    const delayBetween = options.delayBetween || 1000;

    for (let i = 0; i < requests.length; i++) {
      const delay = i * delayBetween;
      const jobId = await this.addJob(requests[i], {
        priority: options.priority,
        delay,
      });
      jobIds.push(jobId);
    }

    console.log(`[QueueService] Added ${jobIds.length} jobs to queue`);
    return jobIds;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<IJobInfo | null> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    
    return {
      id: job.id || jobId,
      status: state as JobStatus,
      progress: job.progress as number,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      completedAt: job.finishedOn,
      attempts: job.attemptsMade,
    };
  }

  /**
   * Wait for job completion
   */
  async waitForJob(jobId: string, timeout?: number): Promise<IScrapeResponse> {
    if (!this.queue || !this.queueEvents) {
      throw new Error("Queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const result = await job.waitUntilFinished(
      this.queueEvents,
      timeout || this.config.queue.jobTimeout
    );

    return result;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<IQueueStats> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    // Paused count can be determined by checking if queue is paused
    const paused = (await this.queue.isPaused()) ? waiting : 0;

    return { waiting, active, completed, failed, delayed, paused };
  }

  /**
   * Pause queue
   */
  async pause(): Promise<void> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    await this.queue.pause();
    console.log("[QueueService] Queue paused");
  }

  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    await this.queue.resume();
    console.log("[QueueService] Queue resumed");
  }

  /**
   * Clear completed jobs
   */
  async clearCompleted(): Promise<void> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    await this.queue.clean(0, 1000, "completed");
    console.log("[QueueService] Completed jobs cleared");
  }

  /**
   * Clear failed jobs
   */
  async clearFailed(): Promise<void> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    await this.queue.clean(0, 1000, "failed");
    console.log("[QueueService] Failed jobs cleared");
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(): Promise<number> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const failed = await this.queue.getFailed();
    let retriedCount = 0;

    for (const job of failed) {
      await job.retry();
      retriedCount++;
    }

    console.log(`[QueueService] Retried ${retriedCount} failed jobs`);
    return retriedCount;
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    console.log(`[QueueService] Job ${jobId} cancelled`);
    return true;
  }

  /**
   * Get waiting jobs
   */
  async getWaitingJobs(start: number = 0, end: number = 100): Promise<IJobInfo[]> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const jobs = await this.queue.getWaiting(start, end);
    return Promise.all(jobs.map((job) => this.jobToInfo(job)));
  }

  /**
   * Get active jobs
   */
  async getActiveJobs(start: number = 0, end: number = 100): Promise<IJobInfo[]> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const jobs = await this.queue.getActive(start, end);
    return Promise.all(jobs.map((job) => this.jobToInfo(job)));
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(start: number = 0, end: number = 100): Promise<IJobInfo[]> {
    if (!this.queue) {
      throw new Error("Queue not initialized");
    }

    const jobs = await this.queue.getFailed(start, end);
    return Promise.all(jobs.map((job) => this.jobToInfo(job)));
  }

  /**
   * Convert job to job info
   */
  private async jobToInfo(job: Job<IScrapeJobData>): Promise<IJobInfo> {
    const state = await job.getState();
    
    return {
      id: job.id || "",
      status: state as JobStatus,
      progress: job.progress as number,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      completedAt: job.finishedOn,
      attempts: job.attemptsMade,
    };
  }

  /**
   * Normalize flags with defaults
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
      retries: flags.retries ?? this.config.queue.retryAttempts,
      priority: flags.priority ?? 5,
    };
  }

  /**
   * Check if queue is enabled and initialized
   */
  isEnabled(): boolean {
    return this.config.queue.enabled && this.isInitialized;
  }

  /**
   * Shutdown queue service
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
    }
    if (this.queue) {
      await this.queue.close();
    }

    this.isInitialized = false;
    console.log("[QueueService] Shutdown complete");
  }
}

export const queueService = new QueueService();
export default queueService;
