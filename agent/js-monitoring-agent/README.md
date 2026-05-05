# JS Monitoring Agent

A lightweight, non-blocking telemetry collector for browser-side observability.

## 1. Overview

The JS Monitoring Agent is a vanilla JavaScript library designed to be embedded in e-commerce storefronts. It captures performance metrics, JavaScript errors, and user session activity, batching them efficiently before transmitting to the Ingestion API.

## 2. Responsibilities

- **Metrics Collection**: Capture Core Web Vitals and custom performance timings.
- **Error Tracking**: Listen for unhandled exceptions and promise rejections.
- **Session Management**: Track unique user sessions via anonymous UUIDs.
- **Efficient Transport**: Batch events in a local queue and send them in bursts to minimize network overhead.
- **Dynamic Policy**: Fetch remote configuration to enable/disable specific collectors based on site needs.

## 3. How It Fits in Architecture

- **Entry Point**: It is the primary data source for the entire platform.
- **Downstream Dependency**: Sends data to **apps/api** (`/api/v1/i/browser`).
- **Data Flow Interaction**:
  1. Initialize -> Fetch Config from API.
  2. Capture Event -> Push to Internal Buffer.
  3. Flush Buffer -> POST Batch to API.

## 4. Key Components

- **`src/collectors/`**:
  - `performance.ts`: Captures Navigation Timing and Web Vitals.
  - `errors.ts`: Global error listeners.
  - `user.ts`: Page view and session tracking.
- **`src/core/`**: 
  - `session.ts`: Manages the lifecycle of anonymous user IDs.
  - `config.ts`: Interface for remote configuration resolution.
- **`src/queue/`**: 
  - `buffer.ts`: In-memory storage for events before they are sent.
- **`src/transport/`**: 
  - `sender.ts`: Logic for HTTP POST with retry capabilities.

## 5. Integration Guide

To embed the agent in your site, include the following script tag:

```html
<script src="http://api.monitor.yoursite.com/agent.js"></script>
```

Alternatively, initialize manually:
```javascript
import { Tracker } from '@kpi/agent';

Tracker.init({
  siteId: 'store_001',
  endpoint: 'http://localhost:4000/api/v1/i/browser'
});
```

## 6. Data Handling

- **Collected Data**: Page URLs, Loading Metrics (ms), Error Messages, Stack Traces.
- **Privacy**: No PII (Personally Identifiable Information) is collected by default. session IDs are randomized and not linked to individual identities.

## 7. Configuration

The agent is "remote-first". It fetches its behavior from:
`GET http://localhost:4000/api/v1/config/:siteId`

Key settings resolved:
- `samplingRate`: Percentage of sessions to track.
- `errorTrackingEnabled`: Boolean toggle.

## 8. Local Development

To build the agent:
```bash
npm run build --workspace=@kpi/agent
```
The compiled script is copied to `apps/dashboard/public/agent.js` for easy serving.

## 9. Future Improvements

- **Resource Timing**: Tracking the load time of individual assets (images, scripts).
- **DOM Stability**: Capturing Cumulative Layout Shift (CLS) for visual stability monitoring.
- **Brotli Compression**: Compress payloads before sending to save user bandwidth.
- **Offline Support**: Use `localStorage` to persist events across page navigation or network loss.
