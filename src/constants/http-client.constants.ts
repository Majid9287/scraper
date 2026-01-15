/**
 * HTTP Client constants
 */

// Redirect settings
export const DEFAULT_MAX_REDIRECTS = 5;

// User Agents - Random selection for anti-detection
export const USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  // Chrome on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  // Firefox on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  // Safari on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

// Default User Agent
export const DEFAULT_USER_AGENT = USER_AGENTS[0];

// HTTP Headers - Standard browser headers
export const DEFAULT_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
} as const;

// Status codes
export const SUCCESS_STATUS_RANGE = { min: 200, max: 399 } as const;

// Viewport sizes for randomization
export const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1440 },
];

// Timezone offsets for randomization
export const TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Denver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
];

// WebGL vendors for fingerprint spoofing
export const WEBGL_VENDORS = [
  "Google Inc. (NVIDIA)",
  "Google Inc. (Intel)",
  "Google Inc. (AMD)",
];

// WebGL renderers for fingerprint spoofing
export const WEBGL_RENDERERS = [
  "ANGLE (NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel(R) Iris(R) Plus Graphics Direct3D11 vs_5_0 ps_5_0)",
];

// Languages for randomization
export const LANGUAGES = [
  ["en-US", "en"],
  ["en-GB", "en"],
  ["en-US", "en", "es"],
  ["en-US", "en", "fr"],
];

// Platform info for fingerprint
export const PLATFORMS = ["Win32", "MacIntel", "Linux x86_64"];

// Blocked resource types for performance
export const BLOCKED_RESOURCE_TYPES = [
  "image",
  "media",
  "font",
  "stylesheet",
  "texttrack",
  "object",
  "beacon",
  "csp_report",
  "imageset",
];

// Common tracking domains to block
export const BLOCKED_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "facebook.net",
  "doubleclick.net",
  "adservice.google.com",
  "analytics.google.com",
  "connect.facebook.net",
  "pixel.facebook.com",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
  "amplitude.com",
  "optimizely.com",
  "crazyegg.com",
  "mouseflow.com",
  "fullstory.com",
];

