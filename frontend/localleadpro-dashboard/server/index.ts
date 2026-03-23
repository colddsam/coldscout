/**
 * Local Development Proxy Server
 * 
 * Facilitates a CORS-compliant bridge between the frontend and the backend API.
 * 
 * Key Functions:
 * - Injects the system API Key into all proxied requests.
 * - Forwards Authorization headers for authenticated sessions.
 * - Provides detailed request logging for debugging integration issues.
 */
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environmental configuration
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();

/** Proxy listener port */
const PORT = process.env.PORT || 3001;
/** Target backend API endpoint */
const API_BASE_URL = process.env.API_BASE_URL;
/** Global secret key for administrative tasks */
const API_KEY = process.env.API_KEY;

// Ensure required environment variables are present
if (!API_BASE_URL || !API_KEY) {
  console.error('❌ Configuration Error: Missing API_BASE_URL or API_KEY in .env.local');
  process.exit(1);
}

// Enable CORS for authorized development origins
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'] }));

// Configure Proxy Middleware
// Routes all requests matching /api to the remote backend service.
// This bypasses browser CORS restrictions during local development.
app.use(createProxyMiddleware({
  target: API_BASE_URL,
  changeOrigin: true,
  pathFilter: '/api',
  on: {
    proxyReq: (proxyReq, req) => {
      // Inject global API Key into outbound requests
      proxyReq.setHeader('X-API-Key', API_KEY);
      
      // Forward Authorization header (JWT Bearer tokens)
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        proxyReq.setHeader('Authorization', authHeader);
      }
      
      // Log outbound proxy request
      console.log(`[PROXY] ${req.method} ${req.url} | Auth: ${authHeader ? 'Bearer ...' + (authHeader as string).slice(-8) : 'NONE'}`);
    },
    proxyRes: (proxyRes, req) => {
      // Log inbound proxy response
      console.log(`[PROXY] ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
    },
    error: (err, req, res) => {
      // Handle and log proxy-level errors
      console.error(`[PROXY ERROR] ${req.method} ${req.url}: ${err.message}`);
      (res as express.Response).status(502).json({ detail: 'Proxy error: ' + err.message });
    },
  },
}));

// Start the proxy listener
const server = app.listen(PORT, () => console.log(`✅ Proxy running on http://localhost:${PORT}`));

// Error handling for the server listener
server.on('error', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Network Error: Port ${PORT} is already in use.`);
    console.error(`   Another process is using this port. Please terminate it or select a different port.\n`);
  } else {
    console.error(`\n❌ Server instance error:`, err.message);
  }
  process.exit(1);
});

// Process-level event handlers
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception Error:', err.message);
  process.exit(1);
});
