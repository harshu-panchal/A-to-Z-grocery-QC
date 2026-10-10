/**
 * Metrics Routes
 * 
 * Provides Prometheus-compatible metrics endpoint for monitoring.
 * 
 * @module routes/metricsRoutes
 */

import crypto from 'crypto';
import express from 'express';
import { getMetrics } from '../services/metrics.js';

const router = express.Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * 
 * Authentication: `Authorization: Bearer <METRICS_TOKEN>` when METRICS_TOKEN
 * is set. In production without METRICS_TOKEN the endpoint is disabled (404),
 * since route/latency stats reveal the API surface.
 * 
 * Response: Prometheus text exposition format
 * Content-Type: text/plain
 * 
 * Example:
 * # HELP http_requests_total Total HTTP requests
 * # TYPE http_requests_total counter
 * http_requests_total{method="GET",path="/api/orders",status="200"} 1523
 */
function metricsAccessAllowed(req) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/', (req, res) => {
  if (!metricsAccessAllowed(req)) {
    return res.status(404).send('Not found');
  }
  try {
    const metricsOutput = getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsOutput);
  } catch (error) {
    console.error('[Metrics] Failed to generate metrics:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

export default router;
