import axios from "axios";
import { getAppConfig } from "../config";

/**
 * 2Captcha API response types
 */
interface TwoCaptchaResponse {
  status: number;
  request: string;
  error_text?: string;
}

/**
 * Anti-Captcha API response types
 */
interface AntiCaptchaSubmitResponse {
  errorId: number;
  errorDescription?: string;
  taskId?: number;
}

interface AntiCaptchaResultResponse {
  errorId: number;
  errorDescription?: string;
  status: string;
  solution?: {
    gRecaptchaResponse?: string;
    token?: string;
  };
  cost?: number;
}

/**
 * CapMonster API response types (same as Anti-Captcha)
 */
type CapMonsterSubmitResponse = AntiCaptchaSubmitResponse;
type CapMonsterResultResponse = AntiCaptchaResultResponse;

/**
 * CAPTCHA types supported by the service
 */
export type CaptchaType = "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "funcaptcha" | "turnstile" | "image";

/**
 * CAPTCHA solve request
 */
export interface ICaptchaSolveRequest {
  type: CaptchaType;
  siteKey: string;
  pageUrl: string;
  action?: string; // For reCAPTCHA v3
  minScore?: number; // For reCAPTCHA v3
  proxy?: string;
  userAgent?: string;
  invisible?: boolean;
  data?: any; // Additional data for specific CAPTCHA types
}

/**
 * CAPTCHA solve response
 */
export interface ICaptchaSolveResponse {
  success: boolean;
  solution?: string;
  error?: string;
  cost?: number;
  solveTime?: number;
}

/**
 * CAPTCHA provider interface
 */
interface ICaptchaProvider {
  submitCaptcha(request: ICaptchaSolveRequest): Promise<string>;
  getCaptchaResult(taskId: string): Promise<ICaptchaSolveResponse>;
}

/**
 * 2Captcha provider implementation
 */
class TwoCaptchaProvider implements ICaptchaProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "http://2captcha.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async submitCaptcha(request: ICaptchaSolveRequest): Promise<string> {
    const params: any = {
      key: this.apiKey,
      json: 1,
      pageurl: request.pageUrl,
    };

    switch (request.type) {
      case "recaptcha_v2":
        params.method = "userrecaptcha";
        params.googlekey = request.siteKey;
        if (request.invisible) {
          params.invisible = 1;
        }
        break;
      case "recaptcha_v3":
        params.method = "userrecaptcha";
        params.googlekey = request.siteKey;
        params.version = "v3";
        params.action = request.action || "verify";
        params.min_score = request.minScore || 0.3;
        break;
      case "hcaptcha":
        params.method = "hcaptcha";
        params.sitekey = request.siteKey;
        break;
      case "turnstile":
        params.method = "turnstile";
        params.sitekey = request.siteKey;
        break;
      default:
        throw new Error(`Unsupported CAPTCHA type: ${request.type}`);
    }

    if (request.proxy) {
      params.proxy = request.proxy;
      params.proxytype = "HTTP";
    }

    if (request.userAgent) {
      params.userAgent = request.userAgent;
    }

    const response = await axios.post<TwoCaptchaResponse>(`${this.baseUrl}/in.php`, null, { params });

    if (response.data.status !== 1) {
      throw new Error(`2Captcha submit error: ${response.data.error_text || response.data.request}`);
    }

    return response.data.request;
  }

  async getCaptchaResult(taskId: string): Promise<ICaptchaSolveResponse> {
    const response = await axios.get<TwoCaptchaResponse>(`${this.baseUrl}/res.php`, {
      params: {
        key: this.apiKey,
        action: "get",
        id: taskId,
        json: 1,
      },
    });

    if (response.data.status === 1) {
      return {
        success: true,
        solution: response.data.request,
      };
    }

    if (response.data.request === "CAPCHA_NOT_READY") {
      return {
        success: false,
        error: "CAPTCHA_NOT_READY",
      };
    }

    return {
      success: false,
      error: response.data.error_text || response.data.request,
    };
  }
}

/**
 * Anti-Captcha provider implementation
 */
class AntiCaptchaProvider implements ICaptchaProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.anti-captcha.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async submitCaptcha(request: ICaptchaSolveRequest): Promise<string> {
    let task: any = {
      websiteURL: request.pageUrl,
      websiteKey: request.siteKey,
    };

    switch (request.type) {
      case "recaptcha_v2":
        task.type = request.proxy ? "RecaptchaV2Task" : "RecaptchaV2TaskProxyless";
        if (request.invisible) {
          task.isInvisible = true;
        }
        break;
      case "recaptcha_v3":
        task.type = request.proxy ? "RecaptchaV3Task" : "RecaptchaV3TaskProxyless";
        task.pageAction = request.action || "verify";
        task.minScore = request.minScore || 0.3;
        break;
      case "hcaptcha":
        task.type = request.proxy ? "HCaptchaTask" : "HCaptchaTaskProxyless";
        break;
      case "turnstile":
        task.type = request.proxy ? "TurnstileTask" : "TurnstileTaskProxyless";
        break;
      default:
        throw new Error(`Unsupported CAPTCHA type: ${request.type}`);
    }

    if (request.proxy) {
      const proxyParts = request.proxy.split(":");
      task.proxyType = "http";
      task.proxyAddress = proxyParts[0];
      task.proxyPort = parseInt(proxyParts[1], 10);
    }

    if (request.userAgent) {
      task.userAgent = request.userAgent;
    }

    const response = await axios.post<AntiCaptchaSubmitResponse>(`${this.baseUrl}/createTask`, {
      clientKey: this.apiKey,
      task,
    });

    if (response.data.errorId !== 0) {
      throw new Error(`Anti-Captcha submit error: ${response.data.errorDescription}`);
    }

    return response.data.taskId!.toString();
  }

  async getCaptchaResult(taskId: string): Promise<ICaptchaSolveResponse> {
    const response = await axios.post<AntiCaptchaResultResponse>(`${this.baseUrl}/getTaskResult`, {
      clientKey: this.apiKey,
      taskId: parseInt(taskId, 10),
    });

    if (response.data.errorId !== 0) {
      return {
        success: false,
        error: response.data.errorDescription,
      };
    }

    if (response.data.status === "ready") {
      return {
        success: true,
        solution: response.data.solution?.gRecaptchaResponse || response.data.solution?.token,
        cost: response.data.cost,
      };
    }

    return {
      success: false,
      error: "CAPTCHA_NOT_READY",
    };
  }
}

/**
 * CapMonster provider implementation
 */
class CapMonsterProvider implements ICaptchaProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.capmonster.cloud";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async submitCaptcha(request: ICaptchaSolveRequest): Promise<string> {
    let task: any = {
      websiteURL: request.pageUrl,
      websiteKey: request.siteKey,
    };

    switch (request.type) {
      case "recaptcha_v2":
        task.type = "NoCaptchaTaskProxyless";
        if (request.invisible) {
          task.isInvisible = true;
        }
        break;
      case "recaptcha_v3":
        task.type = "RecaptchaV3TaskProxyless";
        task.pageAction = request.action || "verify";
        task.minScore = request.minScore || 0.3;
        break;
      case "hcaptcha":
        task.type = "HCaptchaTaskProxyless";
        break;
      case "turnstile":
        task.type = "TurnstileTaskProxyless";
        break;
      default:
        throw new Error(`Unsupported CAPTCHA type: ${request.type}`);
    }

    if (request.userAgent) {
      task.userAgent = request.userAgent;
    }

    const response = await axios.post<CapMonsterSubmitResponse>(`${this.baseUrl}/createTask`, {
      clientKey: this.apiKey,
      task,
    });

    if (response.data.errorId !== 0) {
      throw new Error(`CapMonster submit error: ${response.data.errorDescription}`);
    }

    return response.data.taskId!.toString();
  }

  async getCaptchaResult(taskId: string): Promise<ICaptchaSolveResponse> {
    const response = await axios.post<CapMonsterResultResponse>(`${this.baseUrl}/getTaskResult`, {
      clientKey: this.apiKey,
      taskId: parseInt(taskId, 10),
    });

    if (response.data.errorId !== 0) {
      return {
        success: false,
        error: response.data.errorDescription,
      };
    }

    if (response.data.status === "ready") {
      return {
        success: true,
        solution: response.data.solution?.gRecaptchaResponse || response.data.solution?.token,
        cost: response.data.cost,
      };
    }

    return {
      success: false,
      error: "CAPTCHA_NOT_READY",
    };
  }
}

/**
 * CAPTCHA solving service
 * Supports multiple providers: 2Captcha, Anti-Captcha, CapMonster
 */
export class CaptchaService {
  private readonly config = getAppConfig();
  private provider: ICaptchaProvider | null = null;

  constructor() {
    this.initializeProvider();
  }

  /**
   * Initialize CAPTCHA provider based on configuration
   */
  private initializeProvider(): void {
    if (!this.config.captcha.enabled || !this.config.captcha.apiKey) {
      console.warn("[CaptchaService] CAPTCHA solving disabled or no API key configured");
      return;
    }

    switch (this.config.captcha.provider) {
      case "2captcha":
        this.provider = new TwoCaptchaProvider(this.config.captcha.apiKey);
        break;
      case "anticaptcha":
        this.provider = new AntiCaptchaProvider(this.config.captcha.apiKey);
        break;
      case "capmonster":
        this.provider = new CapMonsterProvider(this.config.captcha.apiKey);
        break;
      default:
        this.provider = new TwoCaptchaProvider(this.config.captcha.apiKey);
    }

    console.log(`[CaptchaService] Initialized with provider: ${this.config.captcha.provider}`);
  }

  /**
   * Check if CAPTCHA solving is enabled
   */
  isEnabled(): boolean {
    return this.provider !== null && this.config.captcha.enabled;
  }

  /**
   * Solve CAPTCHA
   */
  async solveCaptcha(request: ICaptchaSolveRequest): Promise<ICaptchaSolveResponse> {
    if (!this.provider) {
      return {
        success: false,
        error: "CAPTCHA solving is not enabled",
      };
    }

    const startTime = Date.now();
    console.log(`[CaptchaService] Solving ${request.type} CAPTCHA for ${request.pageUrl}`);

    try {
      // Submit CAPTCHA
      const taskId = await this.provider.submitCaptcha(request);
      console.log(`[CaptchaService] Task submitted: ${taskId}`);

      // Poll for result
      const timeout = this.config.captcha.timeout;
      const pollInterval = 5000; // 5 seconds
      let elapsed = 0;

      while (elapsed < timeout) {
        await this.sleep(pollInterval);
        elapsed += pollInterval;

        const result = await this.provider.getCaptchaResult(taskId);

        if (result.success) {
          const solveTime = Date.now() - startTime;
          console.log(`[CaptchaService] CAPTCHA solved in ${solveTime}ms`);
          return {
            ...result,
            solveTime,
          };
        }

        if (result.error && result.error !== "CAPTCHA_NOT_READY") {
          console.error(`[CaptchaService] CAPTCHA solve error: ${result.error}`);
          return result;
        }

        console.log(`[CaptchaService] Still solving... (${elapsed}ms / ${timeout}ms)`);
      }

      return {
        success: false,
        error: "CAPTCHA solving timeout",
        solveTime: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error(`[CaptchaService] Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        solveTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Solve reCAPTCHA v2
   */
  async solveRecaptchaV2(
    siteKey: string,
    pageUrl: string,
    options: { invisible?: boolean; proxy?: string; userAgent?: string } = {}
  ): Promise<ICaptchaSolveResponse> {
    return this.solveCaptcha({
      type: "recaptcha_v2",
      siteKey,
      pageUrl,
      ...options,
    });
  }

  /**
   * Solve reCAPTCHA v3
   */
  async solveRecaptchaV3(
    siteKey: string,
    pageUrl: string,
    options: { action?: string; minScore?: number; proxy?: string; userAgent?: string } = {}
  ): Promise<ICaptchaSolveResponse> {
    return this.solveCaptcha({
      type: "recaptcha_v3",
      siteKey,
      pageUrl,
      action: options.action || "verify",
      minScore: options.minScore || 0.3,
      ...options,
    });
  }

  /**
   * Solve hCaptcha
   */
  async solveHCaptcha(
    siteKey: string,
    pageUrl: string,
    options: { proxy?: string; userAgent?: string } = {}
  ): Promise<ICaptchaSolveResponse> {
    return this.solveCaptcha({
      type: "hcaptcha",
      siteKey,
      pageUrl,
      ...options,
    });
  }

  /**
   * Solve Cloudflare Turnstile
   */
  async solveTurnstile(
    siteKey: string,
    pageUrl: string,
    options: { proxy?: string; userAgent?: string } = {}
  ): Promise<ICaptchaSolveResponse> {
    return this.solveCaptcha({
      type: "turnstile",
      siteKey,
      pageUrl,
      ...options,
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const captchaService = new CaptchaService();
export default captchaService;
