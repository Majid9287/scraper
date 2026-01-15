import { getAppConfig } from "../config";
import { redisService } from "./redis.service";

/**
 * Metric data interface
 */
export interface IMetric {
  name: string;
  value: number;
  tags: Record<string, any>;
  timestamp: number;
}

/**
 * Aggregated metrics interface
 */
export interface IAggregatedMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  captchasSolved: number;
  proxiesUsed: number;
  browserScrapes: number;
  httpScrapes: number;
  queueSize: number;
  activeWorkers: number;
}

/**
 * Alert interface
 */
export interface IAlert {
  type: "error_rate" | "response_time" | "queue_size" | "proxy_failure" | "captcha_failure";
  message: string;
  severity: "warning" | "critical";
  timestamp: number;
  data?: any;
}

/**
 * Monitoring service for tracking scraper performance and health
 */
export class MonitoringService {
  private readonly config = getAppConfig();
  private readonly METRICS_PREFIX = "metrics:";
  private readonly ALERTS_KEY = "alerts:active";
  private metricsBuffer: IMetric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private alertCallbacks: Array<(alert: IAlert) => void> = [];

  /**
   * Initialize monitoring service
   */
  async initialize(): Promise<void> {
    if (!this.config.monitoring.enabled) {
      console.log("[MonitoringService] Monitoring disabled");
      return;
    }

    // Start metrics flush interval
    this.startFlushInterval();
    console.log("[MonitoringService] Initialized");
  }

  /**
   * Start metrics flush interval
   */
  private startFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(async () => {
      await this.flushMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Stop flush interval
   */
  stopFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, tags: Record<string, any> = {}): void {
    if (!this.config.monitoring.enabled) {
      return;
    }

    const metric: IMetric = {
      name,
      value,
      tags,
      timestamp: Date.now(),
    };

    this.metricsBuffer.push(metric);

    // Check for alerts based on metric
    this.checkAlerts(metric);
  }

  /**
   * Record response time
   */
  recordResponseTime(responseTime: number, tags: Record<string, any> = {}): void {
    this.recordMetric("response_time", responseTime, tags);
  }

  /**
   * Record success
   */
  recordSuccess(tags: Record<string, any> = {}): void {
    this.recordMetric("scrape_success", 1, tags);
  }

  /**
   * Record failure
   */
  recordFailure(error: string, tags: Record<string, any> = {}): void {
    this.recordMetric("scrape_failure", 1, { ...tags, error });
  }

  /**
   * Record CAPTCHA solved
   */
  recordCaptchaSolved(solveTime: number, tags: Record<string, any> = {}): void {
    this.recordMetric("captcha_solved", 1, { ...tags, solveTime });
  }

  /**
   * Record proxy used
   */
  recordProxyUsed(proxy: string, success: boolean, tags: Record<string, any> = {}): void {
    this.recordMetric("proxy_used", success ? 1 : 0, { ...tags, proxy, success });
  }

  /**
   * Flush metrics to Redis
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      const now = Date.now();
      const hourKey = Math.floor(now / 3600000); // Group by hour

      for (const metric of metrics) {
        const key = `${this.METRICS_PREFIX}${metric.name}:${hourKey}`;
        
        // Store metric in Redis list
        const existingData = await redisService.get(key);
        const metricsArray = existingData ? JSON.parse(existingData) : [];
        metricsArray.push(metric);

        // Keep only last 1000 metrics per key
        if (metricsArray.length > 1000) {
          metricsArray.shift();
        }

        await redisService.set(key, JSON.stringify(metricsArray), 86400); // 24 hour TTL
      }
    } catch (error: any) {
      console.error(`[MonitoringService] Failed to flush metrics: ${error.message}`);
      // Add back to buffer
      this.metricsBuffer.unshift(...metrics);
    }
  }

  /**
   * Check if metric triggers an alert
   */
  private async checkAlerts(metric: IMetric): Promise<void> {
    const thresholds = this.config.monitoring.alertThresholds;

    // Check response time
    if (metric.name === "response_time" && metric.value > thresholds.responseTime) {
      await this.createAlert({
        type: "response_time",
        message: `Response time ${metric.value}ms exceeds threshold ${thresholds.responseTime}ms`,
        severity: metric.value > thresholds.responseTime * 2 ? "critical" : "warning",
        timestamp: Date.now(),
        data: metric,
      });
    }

    // Check error rate (calculated from recent metrics)
    if (metric.name === "scrape_failure") {
      const errorRate = await this.calculateErrorRate();
      if (errorRate > thresholds.errorRate) {
        await this.createAlert({
          type: "error_rate",
          message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.errorRate * 100).toFixed(1)}%`,
          severity: errorRate > thresholds.errorRate * 2 ? "critical" : "warning",
          timestamp: Date.now(),
          data: { errorRate },
        });
      }
    }
  }

  /**
   * Create an alert
   */
  private async createAlert(alert: IAlert): Promise<void> {
    console.warn(`[MonitoringService] ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);

    try {
      // Store alert in Redis
      const existingAlerts = await redisService.get(this.ALERTS_KEY);
      const alerts = existingAlerts ? JSON.parse(existingAlerts) : [];
      alerts.push(alert);

      // Keep only last 100 alerts
      if (alerts.length > 100) {
        alerts.shift();
      }

      await redisService.set(this.ALERTS_KEY, JSON.stringify(alerts), 86400);

      // Call registered alert callbacks
      for (const callback of this.alertCallbacks) {
        try {
          callback(alert);
        } catch (e) {
          // Ignore callback errors
        }
      }
    } catch (error: any) {
      console.error(`[MonitoringService] Failed to create alert: ${error.message}`);
    }
  }

  /**
   * Calculate error rate from recent metrics
   */
  private async calculateErrorRate(): Promise<number> {
    try {
      const now = Date.now();
      const hourKey = Math.floor(now / 3600000);

      const successKey = `${this.METRICS_PREFIX}scrape_success:${hourKey}`;
      const failureKey = `${this.METRICS_PREFIX}scrape_failure:${hourKey}`;

      const [successData, failureData] = await Promise.all([
        redisService.get(successKey),
        redisService.get(failureKey),
      ]);

      const successes = successData ? JSON.parse(successData).length : 0;
      const failures = failureData ? JSON.parse(failureData).length : 0;
      const total = successes + failures;

      if (total === 0) {
        return 0;
      }

      return failures / total;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getAggregatedMetrics(hours: number = 1): Promise<IAggregatedMetrics> {
    const now = Date.now();
    const metrics: IAggregatedMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      captchasSolved: 0,
      proxiesUsed: 0,
      browserScrapes: 0,
      httpScrapes: 0,
      queueSize: 0,
      activeWorkers: 0,
    };

    try {
      const responseTimes: number[] = [];
      const proxiesSet = new Set<string>();

      for (let i = 0; i < hours; i++) {
        const hourKey = Math.floor((now - i * 3600000) / 3600000);

        // Get success metrics
        const successData = await redisService.get(`${this.METRICS_PREFIX}scrape_success:${hourKey}`);
        if (successData) {
          const successes = JSON.parse(successData);
          metrics.successfulRequests += successes.length;
          successes.forEach((m: IMetric) => {
            if (m.tags.browser) {
              metrics.browserScrapes++;
            } else {
              metrics.httpScrapes++;
            }
          });
        }

        // Get failure metrics
        const failureData = await redisService.get(`${this.METRICS_PREFIX}scrape_failure:${hourKey}`);
        if (failureData) {
          const failures = JSON.parse(failureData);
          metrics.failedRequests += failures.length;
        }

        // Get response time metrics
        const responseTimeData = await redisService.get(`${this.METRICS_PREFIX}response_time:${hourKey}`);
        if (responseTimeData) {
          const times = JSON.parse(responseTimeData);
          times.forEach((m: IMetric) => {
            responseTimes.push(m.value);
            metrics.minResponseTime = Math.min(metrics.minResponseTime, m.value);
            metrics.maxResponseTime = Math.max(metrics.maxResponseTime, m.value);
          });
        }

        // Get captcha metrics
        const captchaData = await redisService.get(`${this.METRICS_PREFIX}captcha_solved:${hourKey}`);
        if (captchaData) {
          const captchas = JSON.parse(captchaData);
          metrics.captchasSolved += captchas.length;
        }

        // Get proxy metrics
        const proxyData = await redisService.get(`${this.METRICS_PREFIX}proxy_used:${hourKey}`);
        if (proxyData) {
          const proxies = JSON.parse(proxyData);
          proxies.forEach((m: IMetric) => {
            if (m.tags.proxy) {
              proxiesSet.add(m.tags.proxy);
            }
          });
        }
      }

      metrics.totalRequests = metrics.successfulRequests + metrics.failedRequests;
      metrics.successRate = metrics.totalRequests > 0
        ? metrics.successfulRequests / metrics.totalRequests
        : 0;
      metrics.averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;
      metrics.proxiesUsed = proxiesSet.size;

      if (metrics.minResponseTime === Infinity) {
        metrics.minResponseTime = 0;
      }
    } catch (error: any) {
      console.error(`[MonitoringService] Failed to get aggregated metrics: ${error.message}`);
    }

    return metrics;
  }

  /**
   * Get recent alerts
   */
  async getAlerts(limit: number = 50): Promise<IAlert[]> {
    try {
      const alertsData = await redisService.get(this.ALERTS_KEY);
      if (!alertsData) {
        return [];
      }

      const alerts = JSON.parse(alertsData) as IAlert[];
      return alerts.slice(-limit).reverse();
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear alerts
   */
  async clearAlerts(): Promise<void> {
    await redisService.del(this.ALERTS_KEY);
    console.log("[MonitoringService] Alerts cleared");
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: IAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    details: Record<string, any>;
  }> {
    const metrics = await this.getAggregatedMetrics(1);
    const alerts = await this.getAlerts(10);
    const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    
    if (criticalAlerts > 0 || metrics.successRate < 0.5) {
      status = "unhealthy";
    } else if (metrics.successRate < 0.8 || alerts.length > 5) {
      status = "degraded";
    }

    return {
      status,
      details: {
        successRate: metrics.successRate,
        averageResponseTime: metrics.averageResponseTime,
        recentAlerts: alerts.length,
        criticalAlerts,
        totalRequests: metrics.totalRequests,
      },
    };
  }

  /**
   * Shutdown monitoring service
   */
  async shutdown(): Promise<void> {
    this.stopFlushInterval();
    await this.flushMetrics();
    console.log("[MonitoringService] Shutdown complete");
  }
}

export const monitoringService = new MonitoringService();
export default monitoringService;
