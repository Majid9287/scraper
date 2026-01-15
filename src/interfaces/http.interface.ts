import { IProxy } from "./proxy.interface";

/**
 * HTTP response interface
 */
export interface IHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: string;
  responseTime: number;
  proxy: IProxy;
  protocol: string;
  finalUrl?: string;
  contentType?: string;
  contentLength?: number;
}

/**
 * HTTP request options
 */
export interface IHttpRequestOptions {
  timeout?: number;
  maxRedirects?: number;
  userAgent?: string;
  followRedirects?: boolean;
  headers?: Record<string, string>;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
}

/**
 * Browser context options for Playwright
 */
export interface IBrowserContextOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  colorScheme?: "light" | "dark" | "no-preference";
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
}

/**
 * Browser launch options
 */
export interface IBrowserLaunchOptions {
  headless?: boolean;
  slowMo?: number;
  args?: string[];
  ignoreDefaultArgs?: string[];
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

/**
 * Page navigation options
 */
export interface INavigationOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

/**
 * Screenshot options
 */
export interface IScreenshotOptions {
  fullPage?: boolean;
  type?: "png" | "jpeg";
  quality?: number;
  path?: string;
}

/**
 * PDF options
 */
export interface IPdfOptions {
  path?: string;
  format?: "A4" | "Letter" | "Legal";
  landscape?: boolean;
  printBackground?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}
