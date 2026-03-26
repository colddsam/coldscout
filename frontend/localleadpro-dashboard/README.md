# 🖥️ Cold Scout Admin Dashboard
> Also known internally as LocalLeadPro

<p align="center">
  <img src="https://img.shields.io/badge/React-18-black.svg?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5-black.svg?style=for-the-badge&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-black.svg?style=for-the-badge&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-5-black.svg?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

The **Cold Scout Dashboard** operates as the centralized, high-performance command center for the overarching AI-driven lead generation infrastructure. Engineered with a premium glassmorphic visual language, it bridges the gap between raw data acquisition and meaningful operational outreach by providing an uncompromising real-time tracking interface.

---

## ✨ Architectural Features

- **🔐 Enterprise Authentication**: JWT-based identity verification, persistent session tracking, and rigorous route protection protocols.
- **📊 Real-time Monitoring**: Provides live analytical observation of pipeline latency, campaign velocity, and throughput constraints.
- **🕵️ Lead State Management**: Tracks strict progression models of acquired targets with integrated AI qualification scoring heuristics.
- **⚙️ Integrated Scheduling Control**: Administrative access to override autonomous background processes (Discovery, Scraping, Execution).
- **🛠️ Pipeline Actuation**: Granular manual triggers to force execution of isolated stages asynchronously.
- **📥 Centralized Inbox Parsing**: Real-time evaluation of inbound communications, automatically categorizing intent vectors (Positive, Negative, Out-of-Office).
- **🎨 Premium Component System**: Strictly adheres to the monochromatic, high-contrast, professional visual identity of the Cold Scout brand utilizing Tailwind CSS.

---

## 🏗️ Technical Architecture & Local Proxy

In development environments, security and Cross-Origin Resource Sharing (CORS) are strictly maintained via an isolated Development Proxy Server.

- **Execution Context**: `server/index.ts`
- **Utility**: Facilitates bridging from the Vite frontend to the FastAPI primary node.
- **Security Paradigm**: Prohibits exposure of the primary `API_KEY` to the client browser by enforcing server-side header injection.
- **CORS Mediation**: Securely processes cross-origin authorization tokens (JWT) to permit API integration without triggering browser security halts.

---

## 📂 Internal Directory Structure

```text
frontend/localleadpro-dashboard/
├── server/           # Development Proxy Server Sandbox (Node.js + TS)
├── src/
│   ├── components/   # Atomic, reusable UI elements governed by the brand system
│   ├── hooks/        # Asynchronous state management and API interfacing logic
│   ├── lib/          # Foundational utilities, client generators, definitions
│   ├── pages/        # Route declarations and overarching view controllers
│   ├── App.tsx       # Primary routing tree architecture
│   └── main.tsx      # System initialization incorporating React Query contexts
├── .env              # Isolated environment variable storage
└── vite.config.ts    # Bundler and transpilation directives
```

---

## 🚀 Environment Initialization

### 1. Package Verification
Ensure compliance with Node.js version >= 18.

```bash
# Resolve and map all required dependencies
npm install
```

### 2. Parameter Configuration
Initialize an isolated `.env` context specifically within the `frontend/localleadpro-dashboard` subsystem:

```env
# Target API resolution endpoint
API_BASE_URL=http://localhost:8000

# Proxy authorization token (injected server-side)
API_KEY=your_secret_api_key_here

# Local Development resolution endpoints
VITE_PROXY_URL=http://localhost:3000
VITE_API_KEY=your_secret_api_key_here
```

### 3. Server Execution
Engage the proxy and the Vite server simultaneously:

```bash
npm run dev
```

---

## 🚢 Production Compilation

Generate a highly optimized, minified bundle conforming to the highest performance standards:

```bash
npm run build
```

The compiled `dist/` artifacts are strictly static and highly portable to any enterprise-grade edge distribution network (e.g., Vercel, AWS S3, Cloudflare Pages). Production rollout assumes the `VITE_PROXY_URL` parameter maps dynamically to the highly-available FastAPI backend endpoint, disregarding the local proxy.
