# Industry-Level Web Scraper v2.0

A production-grade Node.js Express TypeScript web scraping API with advanced anti-detection, browser automation, distributed processing, and enterprise monitoring capabilities.

## 🚀 What's New in v2.0

### Phase 1: Playwright Browser Scraping
- **Headless Browser Automation** - Full Chromium browser for JavaScript-rendered content
- **Stealth Mode** - Anti-detection scripts to bypass bot detection
- **Fingerprint Randomization** - Random user agents, viewports, timezones
- **Request Interception** - Block ads, trackers, and unnecessary resources

### Phase 2: Residential Proxy Support
- **Multi-Provider Support** - Bright Data, Smartproxy, Oxylabs integration
- **Datacenter Proxies** - High-speed static IP pools
- **Health Monitoring** - Automatic proxy validation and rotation
- **Geographic Targeting** - Country-specific proxy selection

### Phase 3: CAPTCHA Solving
- **2Captcha Integration** - Human-powered CAPTCHA solving
- **Anti-Captcha Support** - Automated CAPTCHA bypass
- **CapMonster Cloud** - Fast, scalable CAPTCHA solving
- **Multi-Type Support** - reCAPTCHA v2/v3, hCaptcha, Turnstile

### Phase 4: Distributed Queue System
- **BullMQ Integration** - Reliable job queue with Redis
- **Priority Queuing** - Urgent requests processed first
- **Worker Scaling** - Horizontal scaling with multiple workers
- **Job Persistence** - Jobs survive restarts

### Phase 5: Monitoring & Advanced Rate Limiting
- **Real-time Metrics** - Success rates, response times, queue depth
- **Alerting System** - Configurable thresholds and notifications
- **Adaptive Rate Limiting** - Automatic throttling based on target response
- **Health Checks** - Comprehensive system health monitoring

## Key Features

- ✅ **Playwright Browser Scraping** with stealth mode
- ✅ **Residential + Datacenter Proxies** with health monitoring
- ✅ **CAPTCHA Solving** (2Captcha, Anti-Captcha, CapMonster)
- ✅ **Distributed Queue** with BullMQ and Redis
- ✅ **Advanced Rate Limiting** with adaptive throttling
- ✅ **Real-time Monitoring** with metrics and alerts
- ✅ **Session Management** with cookie persistence
- ✅ **Feature Flags** for granular control
- ✅ **Docker Support** for development and production
- ✅ **TypeScript Strict Mode** with proper type safety

## Quick Start

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Redis

### Setup

```bash
# Clone and install dependencies
npm install

# Start with Docker (recommended)
npm run docker:dev

# Or run locally
npm run dev
```

### API Usage

#### Basic Scrape (HTTP Mode)
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

#### Browser Scrape (JavaScript Rendering)
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "flags": {
      "renderJs": true,
      "stealth": true,
      "blockAds": true
    }
  }'
```

#### Scrape with Residential Proxy
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://protected-site.com",
    "flags": {
      "renderJs": true,
      "residential": true,
      "stealth": true
    }
  }'
```

#### Async Scrape (Queue Mode)
```bash
# Add job to queue
curl -X POST http://localhost:3000/api/scrape/async \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "flags": {"renderJs": true}
  }'

# Check job status
curl http://localhost:3000/api/scrape/jobs/{jobId}
```

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `renderJs` | `false` | Use Playwright browser for JavaScript rendering |
| `stealth` | `true` | Enable anti-detection measures |
| `residential` | `false` | Use residential proxies |
| `datacenter` | `false` | Use datacenter proxies |
| `bypass` | `true` | Enable bot bypass techniques |
| `solveCaptcha` | `false` | Enable CAPTCHA solving |
| `blockAds` | `true` | Block ads and trackers |
| `blockImages` | `false` | Block image loading |
| `blockCss` | `false` | Block CSS loading |
| `persistSession` | `false` | Save cookies between requests |
| `screenshot` | `false` | Capture page screenshot |
| `pdf` | `false` | Generate PDF of page |
| `waitForSelector` | `null` | Wait for CSS selector before scraping |
| `priority` | `5` | Job priority (1-10, lower = higher priority) |

## API Endpoints

### Scraping
- `POST /api/scrape` - Synchronous scrape
- `POST /api/scrape/async` - Add to queue (async)
- `POST /api/scrape/bulk` - Bulk scrape multiple URLs
- `GET /api/scrape/jobs/:id` - Get job status
- `GET /api/scrape/jobs/:id/result` - Get job result

### Queue Management
- `GET /api/scrape/queue/stats` - Queue statistics
- `POST /api/scrape/queue/pause` - Pause processing
- `POST /api/scrape/queue/resume` - Resume processing
- `POST /api/scrape/queue/clean` - Clean completed jobs

### Monitoring
- `GET /api/scrape/metrics` - Get metrics
- `GET /api/scrape/health` - Health check
- `GET /api/scrape/alerts` - Active alerts

### Proxies
- `GET /api/scrape/proxies` - List available proxies
- `POST /api/scrape/proxies/refresh` - Refresh proxy list

## Environment Variables

See [.env.example](.env.example) for all available configuration options.

Key variables:
```bash
# Browser
BROWSER_HEADLESS=true
DEFAULT_VIEWPORT_WIDTH=1920
DEFAULT_VIEWPORT_HEIGHT=1080

# Proxies
DEFAULT_PROXY_PROVIDER=free  # free, residential, datacenter
RESIDENTIAL_PROXY_API_KEY=your_api_key

# CAPTCHA
CAPTCHA_ENABLED=false
CAPTCHA_PROVIDER=2captcha  # 2captcha, anticaptcha, capmonster
CAPTCHA_API_KEY=your_api_key

# Queue
QUEUE_ENABLED=false
QUEUE_CONCURRENCY=5

# Monitoring
MONITORING_ENABLED=true
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Express Routes + Controllers               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Scrape    │ │  Playwright │ │     Queue Service       ││
│  │   Service   │ │   Scraper   │ │      (BullMQ)           ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Proxy     │ │   CAPTCHA   │ │    Monitoring           ││
│  │   Service   │ │   Service   │ │    Service              ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Session   │ │ Rate Limit  │ │   HTTP Client           ││
│  │   Service   │ │   Service   │ │   Service               ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Provider Layer                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │    Free     │ │ Residential │ │    Datacenter           ││
│  │   Proxies   │ │   Proxies   │ │    Proxies              ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure                            │
│  ┌─────────────────────────┐ ┌─────────────────────────────┐│
│  │         Redis           │ │       Worker Process        ││
│  │  (Cache, Queue, Rate)   │ │    (Distributed Jobs)       ││
│  └─────────────────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Docker Deployment

```bash
# Development
npm run docker:dev

# Production
npm run docker:prod

# View logs
npm run docker:logs
```

## Worker Scaling

```bash
# Run additional workers
npm run worker:dev

# Or via Docker Compose scale
docker-compose up --scale worker=5
```

## Response Examples

**Success Response (200):**
```json
{
  "status": "ok",
  "data": {
    "html": "<!DOCTYPE html>...",
    "headers": {
      "content-type": "text/html; charset=utf-8"
    },
    "metadata": {
      "responseTime": 1250,
      "proxyUsed": "residential:us",
      "browserUsed": true,
      "captchaSolved": false,
      "statusCode": 200
    }
  },
  "message": "Success",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

```json
{
  "status": "error",
  "data": null,
  "message": "All proxy attempts failed",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## Testing

```bash
# Run tests locally
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in Docker
npm run test:docker
```

## Tech Stack

- **Node.js 22** + **Express 5** + **TypeScript**
- **Playwright** - Headless browser automation
- **BullMQ** - Distributed job queue
- **Redis** - Caching, rate limiting, queue backend
- **Axios** - HTTP requests
- **Docker** - Containerization

## License

MIT
