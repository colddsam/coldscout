/**
 * Documentation Page.
 *
 * Comprehensive, interactive documentation covering system architecture,
 * setup guides, API key acquisition, environment configuration,
 * deployment steps, and production architecture for the Cold Scout platform.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, ChevronRight, ExternalLink,
  Search, Zap, Mail, BarChart2, Target, Shield,
  BookOpen, Code2, Server, Database, Cloud, Terminal,
  Key, Bell, Clock, Palette, Settings, Globe,
  Cpu, GitBranch, Box, Layers
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';

/* ═══════════════ SVG Decorations ═══════════════ */

function GridBackground() {
  return <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />;
}

/* ═══════════════ Shared Navbar ═══════════════ */

function DocsNavbar() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="6" fill="#000" />
            <path d="M8 14L12 10L16 14L12 18Z" fill="#A4DBD9" />
            <path d="M12 14L16 10L20 14L16 18Z" fill="#fff" fillOpacity="0.6" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">
            Cold <span className="text-secondary font-normal">Scout</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/#features" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">Features</Link>
          <Link to="/docs" className="hidden md:inline text-sm text-black font-medium border-b border-black pb-0.5">Docs</Link>
          <Link to="/#pricing" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">Pricing</Link>
          <Link
            to={isAuthenticated ? '/overview' : '/login'}
            className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            {isAuthenticated ? 'Dashboard' : 'Sign In'} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════ Collapsible Section ═══════════════ */

function CollapsibleSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden transition-all duration-300 hover:shadow-vercel">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 bg-white hover:bg-accents-1 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-black">{title}</span>
        <ChevronDown className={`w-4 h-4 text-secondary transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`transition-all duration-300 overflow-hidden ${open ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 border-t border-gray-100">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Code Block ═══════════════ */

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{language}</span>
      </div>
      <pre className="bg-[#1a1a1a] text-gray-300 text-[13px] leading-relaxed p-4 rounded-md overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ═══════════════ SECTION: Hero ═══════════════ */

function HeroSection() {
  const stats = [
    { value: '42', label: 'Environment Variables' },
    { value: '9', label: 'Integrations' },
    { value: '5', label: 'Pipeline Stages' },
    { value: '24/7', label: 'Automation' },
  ];

  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      <GridBackground />
      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 border border-gray-200 rounded-full px-4 py-1.5 mb-8 bg-white shadow-minimal animate-fade-in">
          <BookOpen className="w-3.5 h-3.5 text-coldscout-teal" />
          <span className="text-xs font-medium text-secondary">Documentation</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-black leading-[0.95] mb-6 animate-fade-in-up">
          Platform<br />
          <span className="text-gradient">Documentation</span>
        </h1>

        <p className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-12 animate-fade-in-up delay-200">
          Everything you need to set up, configure, and deploy your
          AI-powered lead generation system.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 animate-fade-in-up delay-300">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 border border-gray-200 rounded-lg px-5 py-3 bg-white shadow-minimal">
              <span className="text-xl font-bold tracking-tighter text-black">{stat.value}</span>
              <span className="text-[11px] uppercase tracking-widest text-subtle">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Table of Contents ═══════════════ */

function TableOfContents() {
  const sections = [
    { id: 'architecture', label: 'System Architecture', icon: Layers },
    { id: 'pipeline', label: 'Automation Pipeline', icon: Zap },
    { id: 'tech-stack', label: 'Technology Stack', icon: Cpu },
    { id: 'setup', label: 'Local Setup Guide', icon: Terminal },
    { id: 'api-keys', label: 'API Keys & Services', icon: Key },
    { id: 'env-vars', label: 'Environment Variables', icon: Settings },
    { id: 'deployment', label: 'Production Deployment', icon: Cloud },
    { id: 'prod-arch', label: 'Production Architecture', icon: Globe },
  ];

  return (
    <section className="py-12 bg-accents-1">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-4 text-center">On This Page</p>
        <div className="flex flex-wrap justify-center gap-3">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-2 border border-gray-200 rounded-md px-4 py-2 bg-white text-sm text-secondary hover:text-black hover:border-black hover:shadow-vercel transition-all duration-200"
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Architecture ═══════════════ */

function ArchitectureSection() {
  return (
    <section id="architecture" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">System Architecture</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">The platform orchestrates an asynchronous pipeline with robust state management across three deployment layers.</p>
        </div>

        {/* SVG Architecture Diagram */}
        <div className="border border-gray-200 rounded-xl p-8 bg-accents-1 overflow-x-auto">
          <svg viewBox="0 0 900 400" className="w-full max-w-4xl mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Frontend Layer */}
            <rect x="20" y="30" width="180" height="60" rx="8" fill="#fff" stroke="#eaeaea" strokeWidth="1.5" />
            <text x="110" y="55" textAnchor="middle" className="text-[11px] font-semibold" fill="#000">Admin Dashboard</text>
            <text x="110" y="72" textAnchor="middle" className="text-[10px]" fill="#666">React + Vite + Tailwind</text>

            {/* Arrow to API */}
            <line x1="200" y1="60" x2="280" y2="60" stroke="#d4d4d4" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <text x="240" y="52" textAnchor="middle" className="text-[9px]" fill="#999">REST API</text>

            {/* Backend Layer */}
            <rect x="280" y="30" width="160" height="60" rx="8" fill="#000" stroke="#000" strokeWidth="1.5" />
            <text x="360" y="55" textAnchor="middle" className="text-[11px] font-semibold" fill="#fff">FastAPI Server</text>
            <text x="360" y="72" textAnchor="middle" className="text-[10px]" fill="#A4DBD9">Python 3.11+</text>

            {/* Arrow to DB */}
            <line x1="440" y1="60" x2="520" y2="60" stroke="#d4d4d4" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Database */}
            <rect x="520" y="30" width="160" height="60" rx="8" fill="#fff" stroke="#eaeaea" strokeWidth="1.5" />
            <text x="600" y="55" textAnchor="middle" className="text-[11px] font-semibold" fill="#000">PostgreSQL</text>
            <text x="600" y="72" textAnchor="middle" className="text-[10px]" fill="#666">Supabase Managed</text>

            {/* Arrow down from FastAPI to Scheduler */}
            <line x1="360" y1="90" x2="360" y2="140" stroke="#d4d4d4" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Scheduler */}
            <rect x="280" y="140" width="160" height="50" rx="8" fill="#fff" stroke="#A4DBD9" strokeWidth="1.5" />
            <text x="360" y="162" textAnchor="middle" className="text-[11px] font-semibold" fill="#000">APScheduler</text>
            <text x="360" y="178" textAnchor="middle" className="text-[9px]" fill="#666">Cron Trigger</text>

            {/* Pipeline steps */}
            <line x1="360" y1="190" x2="360" y2="230" stroke="#A4DBD9" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            {/* Pipeline boxes */}
            {[
              { x: 50, label: 'Google Places', sub: 'Discovery' },
              { x: 230, label: 'Playwright', sub: 'Web Scraping' },
              { x: 410, label: 'Groq / Llama 3', sub: 'AI Qualification' },
              { x: 590, label: 'Groq AI', sub: 'Email Generation' },
              { x: 750, label: 'Brevo SMTP', sub: 'Outreach' },
            ].map((step, i) => (
              <g key={step.label}>
                <rect x={step.x} y="230" width="150" height="50" rx="6" fill="#fff" stroke="#eaeaea" strokeWidth="1" />
                <text x={step.x + 75} y="252" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">{step.label}</text>
                <text x={step.x + 75} y="268" textAnchor="middle" className="text-[9px]" fill="#666">{step.sub}</text>
                {i < 4 && (
                  <line x1={step.x + 150} y1="255" x2={step.x + 180} y2="255" stroke="#d4d4d4" strokeWidth="1" markerEnd="url(#arrow)" />
                )}
              </g>
            ))}

            {/* Connector from scheduler to first pipeline step */}
            <path d="M 360 230 L 360 215 L 125 215 L 125 230" stroke="#A4DBD9" strokeWidth="1.5" fill="none" markerEnd="url(#arrowTeal)" />

            {/* Telegram alert branch */}
            <line x1="825" y1="280" x2="825" y2="340" stroke="#d4d4d4" strokeWidth="1" markerEnd="url(#arrow)" />
            <rect x="750" y="340" width="150" height="40" rx="6" fill="#fff" stroke="#eaeaea" strokeWidth="1" />
            <text x="825" y="365" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">Telegram Alerts</text>

            {/* Arrow markers */}
            <defs>
              <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#d4d4d4" />
              </marker>
              <marker id="arrowTeal" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#A4DBD9" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Pipeline Flow ═══════════════ */

function PipelineSection() {
  const stages = [
    { num: '01', title: 'Discovery', desc: 'Google Places API scrapes local businesses matching your target industry and location parameters.', icon: Search },
    { num: '02', title: 'Qualification', desc: 'Groq Llama 3 analyzes scraped website data against your Ideal Customer Profile (ICP).', icon: Target },
    { num: '03', title: 'Personalization', desc: 'AI generates hyper-personalized email copy analyzing prospect pain points and value propositions.', icon: Zap },
    { num: '04', title: 'Outreach', desc: 'Brevo SMTP delivers emails with configurable intervals, rate limiting, and domain verification.', icon: Mail },
    { num: '05', title: 'Reporting', desc: 'Daily Telegram alerts on system health, lead counts, qualification rates, and campaign metrics.', icon: BarChart2 },
  ];

  return (
    <section id="pipeline" className="py-24 bg-accents-1">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Pipeline</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Automation Pipeline</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">Five automated stages execute daily, managed by APScheduler with configurable IST scheduling.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {stages.map((stage, i) => (
            <div key={stage.num} className="relative">
              {i < stages.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-4 z-10">
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              )}
              <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-vercel transition-all duration-300 h-full">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl font-bold text-accents-3 tracking-tighter">{stage.num}</span>
                  <stage.icon className="w-4 h-4 text-coldscout-teal" />
                </div>
                <h3 className="text-sm font-semibold text-black mb-2">{stage.title}</h3>
                <p className="text-xs text-secondary leading-relaxed">{stage.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Tech Stack ═══════════════ */

function TechStackSection() {
  const techs = [
    { name: 'Python 3.11+', desc: 'Core backend runtime', color: '#3776AB' },
    { name: 'FastAPI', desc: 'Async REST API framework', color: '#009688' },
    { name: 'React 18', desc: 'Frontend UI library', color: '#61DAFB' },
    { name: 'Vite 5', desc: 'Next-gen build tool', color: '#646CFF' },
    { name: 'TailwindCSS', desc: 'Utility-first styling', color: '#38B2AC' },
    { name: 'PostgreSQL', desc: 'Relational database', color: '#336791' },
    { name: 'Docker', desc: 'Container deployment', color: '#2496ED' },
    { name: 'TypeScript', desc: 'Type-safe frontend', color: '#3178C6' },
  ];

  return (
    <section id="tech-stack" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Stack</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Built With</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {techs.map((tech) => (
            <div key={tech.name} className="group border border-gray-200 rounded-lg p-5 bg-white hover:border-black hover:shadow-vercel transition-all duration-300 text-center">
              <div
                className="w-10 h-10 rounded-md mx-auto mb-3 flex items-center justify-center border border-gray-200 group-hover:border-black transition-colors"
                style={{ backgroundColor: `${tech.color}15` }}
              >
                <Box className="w-5 h-5" style={{ color: tech.color }} />
              </div>
              <h3 className="text-sm font-semibold text-black">{tech.name}</h3>
              <p className="text-[11px] text-secondary mt-1">{tech.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Local Setup ═══════════════ */

function SetupSection() {
  return (
    <section id="setup" className="py-24 bg-accents-1">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Setup</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Local Development Setup</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">Follow these steps meticulously to run the complete system locally.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backend Setup */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-md bg-black flex items-center justify-center">
                <Server className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-black">Backend Setup (FastAPI)</h3>
            </div>

            <div className="space-y-4">
              <CollapsibleSection title="1. Clone the Repository" defaultOpen>
                <CodeBlock code={`git clone https://github.com/colddsam/AI-LEAD-GENERATION.git\ncd "AI LEAD GENERATION"`} />
              </CollapsibleSection>

              <CollapsibleSection title="2. Create Python Virtual Environment">
                <CodeBlock code={`python -m venv venv\n\n# Windows:\nvenv\\Scripts\\activate\n\n# macOS/Linux:\nsource venv/bin/activate`} />
              </CollapsibleSection>

              <CollapsibleSection title="3. Install Dependencies">
                <CodeBlock code={`pip install -r requirements.txt\nplaywright install chromium`} />
              </CollapsibleSection>

              <CollapsibleSection title="4. Initialize Database & Seed Admin">
                <div className="mb-3">
                  <p className="text-xs text-secondary mb-2">Ensure your <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">.env</code> file is configured first.</p>
                </div>
                <CodeBlock code={`python scripts/create_tables.py\npython scripts/seed_admin.py`} />
                <div className="mt-3 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
                  <p className="text-[11px] text-teal-800">💡 Save the generated admin credentials to log into the dashboard.</p>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="5. Start Development Server">
                <CodeBlock code={`uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`} />
                <p className="text-xs text-secondary mt-2">API available at: <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer" className="text-coldscout-teal-dark hover:underline">http://localhost:8000/docs</a></p>
              </CollapsibleSection>
            </div>
          </div>

          {/* Frontend Setup */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-md bg-black flex items-center justify-center">
                <Code2 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-black">Frontend Setup (React Dashboard)</h3>
            </div>

            <div className="space-y-4">
              <CollapsibleSection title="1. Navigate to Frontend" defaultOpen>
                <CodeBlock code={`cd frontend/localleadpro-dashboard`} />
              </CollapsibleSection>

              <CollapsibleSection title="2. Install Node Modules">
                <CodeBlock code={`npm install`} />
                <p className="text-xs text-secondary mt-2">Requires Node.js 18+</p>
              </CollapsibleSection>

              <CollapsibleSection title="3. Configure Environment">
                <p className="text-xs text-secondary mb-2">Create a <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">.env</code> file:</p>
                <CodeBlock code={`# Backend API Location\nAPI_BASE_URL=http://localhost:8000\n\n# API Key (injected by proxy)\nAPI_KEY=your_secret_api_key_here\n\n# Frontend Proxy Access\nVITE_PROXY_URL=http://localhost:3000\nVITE_API_KEY=your_secret_api_key_here`} language="env" />
              </CollapsibleSection>

              <CollapsibleSection title="4. Start Development Server">
                <CodeBlock code={`# Starts proxy on :3000 and Vite on :5173\nnpm run dev`} />
                <p className="text-xs text-secondary mt-2">Dashboard available at: <a href="http://localhost:5173" target="_blank" rel="noopener noreferrer" className="text-coldscout-teal-dark hover:underline">http://localhost:5173</a></p>
              </CollapsibleSection>

              <CollapsibleSection title="5. Build for Production">
                <CodeBlock code={`npm run build`} />
                <p className="text-xs text-secondary mt-2">The <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">dist/</code> output can be deployed to Vercel, Netlify, or AWS S3.</p>
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: API Keys ═══════════════ */

function ApiKeysSection() {
  const services = [
    {
      name: 'Groq AI',
      desc: 'Llama 3 for lead qualification & email generation',
      envKey: 'GROQ_API_KEY',
      url: 'https://console.groq.com/keys',
      steps: ['Sign up at Groq Cloud', 'Navigate to API Keys', 'Create API Key', 'Copy key (starts with gsk_)'],
      color: '#F55036',
    },
    {
      name: 'Google Places',
      desc: 'Local business discovery engine',
      envKey: 'GOOGLE_PLACES_API_KEY',
      url: 'https://console.cloud.google.com/',
      steps: ['Create GCP Project', 'Enable Places API', 'Create Credentials → API Key', '$200/mo free credit included'],
      color: '#4285F4',
    },
    {
      name: 'Supabase',
      desc: 'Managed PostgreSQL database',
      envKey: 'DATABASE_URL',
      url: 'https://supabase.com/',
      steps: ['Create free tier project', 'Settings → Database → Copy URI', 'Add +asyncpg to URI', 'Copy URL & Anon Key from API settings'],
      color: '#3ECF8E',
    },
    {
      name: 'Brevo SMTP',
      desc: 'Transactional email outreach',
      envKey: 'BREVO_SMTP_PASSWORD',
      url: 'https://www.brevo.com/',
      steps: ['Sign up free', 'Profile → SMTP & API tab', 'Generate new SMTP key', 'Verify sender domain/email'],
      color: '#0B996E',
    },
    {
      name: 'Gmail IMAP',
      desc: 'Inbound reply tracking',
      envKey: 'IMAP_PASSWORD',
      url: 'https://myaccount.google.com/',
      steps: ['Enable 2-Step Verification', 'Search "App Passwords"', 'Create app: "ColdScout"', 'Copy 16-char code'],
      color: '#EA4335',
    },
    {
      name: 'Telegram Bot',
      desc: 'Real-time system alerts',
      envKey: 'TELEGRAM_BOT_TOKEN',
      url: 'https://t.me/BotFather',
      steps: ['Message @BotFather → /newbot', 'Set name & username', 'Copy API Token', 'Get Chat ID from @userinfobot'],
      color: '#0088CC',
    },
    {
      name: 'Cron-Job.org',
      desc: 'Keep-alive pings & scheduling',
      envKey: 'CRON_JOB_API_KEY',
      url: 'https://cron-job.org/',
      steps: ['Create free account', 'Settings → API Keys', 'Generate new key', 'Run setup_cronjob.py script'],
      color: '#FF6B35',
    },
    {
      name: 'GitHub Actions',
      desc: 'CI/CD pipeline automation',
      envKey: 'RENDER_DEPLOY_HOOK',
      url: 'https://github.com/',
      steps: ['Repo → Settings → Secrets', 'Add all env vars as secrets', 'Get Render Deploy Hook URL', 'Push to main triggers deploy'],
      color: '#333',
    },
    {
      name: 'Core Secrets',
      desc: 'Session encryption & API security',
      envKey: 'APP_SECRET_KEY',
      url: '',
      steps: ['Run generate_secrets.py', 'Auto-generates secure hex strings', 'Appends to .env file', 'Generates APP_SECRET_KEY, API_KEY, SALT'],
      color: '#000',
    },
  ];

  return (
    <section id="api-keys" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Integrations</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">API Keys & Services</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">All integrations are available on free tiers. Follow each guide to collect your keys.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((svc) => (
            <div key={svc.name} className="group border border-gray-200 rounded-lg p-5 bg-white hover:border-black hover:shadow-vercel transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${svc.color}15` }}>
                    <Key className="w-4 h-4" style={{ color: svc.color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-black">{svc.name}</h3>
                    <p className="text-[10px] text-secondary">{svc.desc}</p>
                  </div>
                </div>
                {svc.url && (
                  <a href={svc.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-black transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <div className="mb-3">
                <code className="text-[10px] font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{svc.envKey}</code>
              </div>

              {/* Step flow */}
              <div className="space-y-2">
                {svc.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-[8px] font-semibold text-secondary group-hover:border-black group-hover:text-black transition-colors">
                        {i + 1}
                      </div>
                    </div>
                    <p className="text-[11px] text-secondary leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Environment Variables ═══════════════ */

function EnvVarsSection() {
  const categories = [
    {
      name: 'Security', icon: Shield,
      vars: [
        { key: 'APP_ENV', desc: 'production or development' },
        { key: 'APP_SECRET_KEY', desc: 'Hex string for session salt' },
        { key: 'API_KEY', desc: 'Public access key for API' },
        { key: 'SECURITY_SALT', desc: 'Random string for hashing' },
        { key: 'BACKEND_CORS_ORIGINS', desc: 'Comma-separated allowed domains' },
        { key: 'APP_URL', desc: 'Your Render Service URL' },
        { key: 'IMAGE_BASE_URL', desc: 'CDN link for branding assets' },
        { key: 'VITE_API_KEY', desc: '(Frontend) Must match Backend API_KEY' },
      ]
    },
    {
      name: 'Database', icon: Database,
      vars: [
        { key: 'DATABASE_URL', desc: 'Supabase URI (postgresql+asyncpg://…)' },
        { key: 'SUPABASE_URL', desc: 'Your Supabase project URL' },
        { key: 'SUPABASE_ANON_KEY', desc: 'Your Supabase anon/public key' },
        { key: 'REDIS_URL', desc: '(Optional) Upstash Redis Link' },
      ]
    },
    {
      name: 'AI Brain', icon: Cpu,
      vars: [
        { key: 'GROQ_API_KEY', desc: 'Groq Llama 3 key' },
        { key: 'GROQ_MODEL', desc: 'Default: llama-3.1-8b-instant' },
        { key: 'GOOGLE_PLACES_API_KEY', desc: 'Google Maps API key' },
      ]
    },
    {
      name: 'Outreach', icon: Mail,
      vars: [
        { key: 'BREVO_SMTP_HOST', desc: 'smtp-relay.brevo.com' },
        { key: 'BREVO_SMTP_PORT', desc: '587' },
        { key: 'BREVO_SMTP_USER', desc: 'Your Brevo login email' },
        { key: 'BREVO_SMTP_PASSWORD', desc: 'Your Brevo SMTP key' },
        { key: 'FROM_EMAIL', desc: 'Verified sender address' },
        { key: 'FROM_NAME', desc: 'Display name in inbox' },
        { key: 'REPLY_TO_EMAIL', desc: 'Direct client reply address' },
      ]
    },
    {
      name: 'Tracking', icon: Search,
      vars: [
        { key: 'IMAP_HOST', desc: 'imap.gmail.com' },
        { key: 'IMAP_USER', desc: 'Your Gmail address' },
        { key: 'IMAP_PASSWORD', desc: '16-char App Password' },
      ]
    },
    {
      name: 'Alerts', icon: Bell,
      vars: [
        { key: 'ADMIN_EMAIL', desc: 'Dashboard login email' },
        { key: 'TELEGRAM_BOT_TOKEN', desc: 'Token from @BotFather' },
        { key: 'TELEGRAM_CHAT_ID', desc: 'User ID from @userinfobot' },
        { key: 'WHATSAPP_NUMBER', desc: 'Contact for WhatsApp alerts' },
        { key: 'CALLMEBOT_API_KEY', desc: 'CallMeBot integration key' },
      ]
    },
    {
      name: 'Automation', icon: GitBranch,
      vars: [
        { key: 'PRODUCTION_STATUS', desc: 'RUN to enable pipeline' },
        { key: 'CRON_JOB_API_KEY', desc: 'cron-job.org portal key' },
        { key: 'RENDER_DEPLOY_HOOK', desc: 'Auto-deployment URL' },
      ]
    },
    {
      name: 'Scheduling', icon: Clock,
      vars: [
        { key: 'DISCOVERY_HOUR', desc: 'IST Hour for search (0-23)' },
        { key: 'QUALIFICATION_HOUR', desc: 'IST Hour for qualification' },
        { key: 'PERSONALIZATION_HOUR', desc: 'IST Hour for personalization' },
        { key: 'OUTREACH_HOUR', desc: 'IST Hour for email sending' },
        { key: 'REPORT_HOUR', desc: 'IST Hour for daily report' },
        { key: 'REPORT_MINUTE', desc: 'Minute for daily report' },
        { key: 'EMAIL_SEND_INTERVAL_SECONDS', desc: 'Delay between emails' },
      ]
    },
    {
      name: 'Branding', icon: Palette,
      vars: [
        { key: 'VITE_SITE_NAME', desc: '(Frontend) Custom brand title' },
        { key: 'BOOKING_LINK', desc: 'Meeting URL (Calendly)' },
        { key: 'SENDER_ADDRESS', desc: 'Physical address for footer' },
      ]
    },
  ];

  const [expandedCat, setExpandedCat] = useState<string | null>('Security');

  return (
    <section id="env-vars" className="py-24 bg-accents-1">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Configuration</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Environment Variables</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">42 tokens required for full functionality. All must be mirrored across Render and Vercel.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category sidebar */}
          <div className="space-y-2">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setExpandedCat(expandedCat === cat.name ? null : cat.name)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                  expandedCat === cat.name
                    ? 'bg-black text-white shadow-vercel'
                    : 'bg-white border border-gray-200 text-black hover:border-black'
                }`}
              >
                <cat.icon className={`w-4 h-4 ${expandedCat === cat.name ? 'text-coldscout-teal' : 'text-secondary'}`} />
                <span className="text-sm font-medium">{cat.name}</span>
                <span className={`ml-auto text-[10px] ${expandedCat === cat.name ? 'text-gray-400' : 'text-subtle'}`}>{cat.vars.length}</span>
              </button>
            ))}
          </div>

          {/* Variable table */}
          <div className="lg:col-span-2">
            {expandedCat ? (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 bg-accents-1">
                  <div className="grid grid-cols-2 gap-4">
                    <span className="text-[10px] uppercase tracking-widest text-subtle font-semibold">Variable</span>
                    <span className="text-[10px] uppercase tracking-widest text-subtle font-semibold">Description</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {categories.find(c => c.name === expandedCat)?.vars.map((v) => (
                    <div key={v.key} className="grid grid-cols-2 gap-4 px-5 py-3 hover:bg-accents-1 transition-colors">
                      <code className="text-[12px] font-mono text-black font-medium">{v.key}</code>
                      <span className="text-[12px] text-secondary">{v.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-secondary text-sm">
                Select a category to view variables
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Deployment ═══════════════ */

function DeploymentSection() {
  const steps = [
    {
      step: 'Step 1',
      title: 'Database — Supabase',
      icon: Database,
      color: '#3ECF8E',
      items: [
        'Create a project on Supabase.com (Free Tier)',
        'Go to Project Settings → Database',
        'Copy the URI connection string',
        'CRITICAL: Change postgresql:// to postgresql+asyncpg://',
        'Go to Settings → API for SUPABASE_URL and SUPABASE_ANON_KEY',
      ],
      url: 'https://supabase.com/',
    },
    {
      step: 'Step 2',
      title: 'Backend — Render',
      icon: Cloud,
      color: '#46E3B7',
      items: [
        'New → Web Service → Connect GitHub repo',
        'Select Docker as environment',
        'Mirror all environment variables from Master Reference',
        'Deploy — copy the live URL for frontend config',
        'Enable Deploy Hook for CI/CD integration',
      ],
      url: 'https://render.com/',
    },
    {
      step: 'Step 3',
      title: 'Frontend — Vercel',
      icon: Globe,
      color: '#000',
      items: [
        'New → Project → Connect GitHub repo',
        'Set Root Directory: frontend/localleadpro-dashboard',
        'Add VITE_PROXY_URL (your Render backend URL)',
        'Add VITE_API_KEY (matching backend API_KEY)',
        'Add VITE_SITE_NAME (your desired brand name)',
        'Deploy — your dashboard is live!',
      ],
      url: 'https://vercel.com/',
    },
  ];

  return (
    <section id="deployment" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Deployment</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Production Deployment</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">Three services, three steps. Your system running 24/7 in the cloud.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 left-full w-6 z-10 -translate-y-1/2">
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              )}
              <div className="border border-gray-200 rounded-xl p-6 bg-white hover:shadow-vercel transition-all duration-300 h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                    <s.icon className="w-5 h-5" style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-subtle font-semibold">{s.step}</p>
                    <h3 className="text-sm font-semibold text-black">{s.title}</h3>
                  </div>
                </div>

                <ol className="space-y-2.5 mb-5">
                  {s.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-[9px] font-semibold text-secondary mt-0.5">
                        {j + 1}
                      </span>
                      <span className="text-[12px] text-secondary leading-snug">{item}</span>
                    </li>
                  ))}
                </ol>

                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-black hover:text-coldscout-teal-dark transition-colors"
                >
                  Visit {s.title.split('—')[1]?.trim()} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ SECTION: Production Architecture ═══════════════ */

function ProdArchitectureSection() {
  return (
    <section id="prod-arch" className="py-24 bg-accents-1">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Production</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Cross-Platform Architecture</h2>
          <p className="text-secondary mt-3 max-w-lg mx-auto">Decentralized architecture ensuring high availability and performance.</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-8 bg-white overflow-x-auto">
          <svg viewBox="0 0 800 280" className="w-full max-w-3xl mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* User */}
            <circle cx="80" cy="140" r="30" fill="#fafafa" stroke="#eaeaea" strokeWidth="1.5" />
            <text x="80" y="136" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">👤</text>
            <text x="80" y="150" textAnchor="middle" className="text-[8px]" fill="#666">User</text>

            {/* Arrow to Vercel */}
            <line x1="110" y1="140" x2="190" y2="140" stroke="#d4d4d4" strokeWidth="1.5" markerEnd="url(#arrowProd)" />

            {/* Vercel */}
            <rect x="190" y="110" width="140" height="60" rx="8" fill="#000" stroke="#000" strokeWidth="1.5" />
            <text x="260" y="136" textAnchor="middle" className="text-[11px] font-semibold" fill="#fff">Vercel Frontend</text>
            <text x="260" y="152" textAnchor="middle" className="text-[9px]" fill="#A4DBD9">React + Vite</text>

            {/* Arrow to Render */}
            <line x1="330" y1="140" x2="420" y2="140" stroke="#d4d4d4" strokeWidth="1.5" markerEnd="url(#arrowProd)" />
            <text x="375" y="130" textAnchor="middle" className="text-[8px]" fill="#999">X-API-Key</text>
            <text x="375" y="140" textAnchor="middle" className="text-[8px]" fill="#999">Header</text>

            {/* Render */}
            <rect x="420" y="110" width="140" height="60" rx="8" fill="#fff" stroke="#eaeaea" strokeWidth="1.5" />
            <text x="490" y="136" textAnchor="middle" className="text-[11px] font-semibold" fill="#000">Render API</text>
            <text x="490" y="152" textAnchor="middle" className="text-[9px]" fill="#666">FastAPI + Docker</text>

            {/* Branch arrows */}
            {/* To Supabase */}
            <line x1="560" y1="125" x2="650" y2="70" stroke="#d4d4d4" strokeWidth="1" markerEnd="url(#arrowProd)" />
            <rect x="650" y="45" width="120" height="50" rx="6" fill="#fff" stroke="#3ECF8E" strokeWidth="1" />
            <text x="710" y="67" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">Supabase</text>
            <text x="710" y="82" textAnchor="middle" className="text-[9px]" fill="#666">PostgreSQL</text>

            {/* To Groq */}
            <line x1="560" y1="140" x2="650" y2="140" stroke="#d4d4d4" strokeWidth="1" markerEnd="url(#arrowProd)" />
            <rect x="650" y="115" width="120" height="50" rx="6" fill="#fff" stroke="#F55036" strokeWidth="1" />
            <text x="710" y="137" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">Groq AI</text>
            <text x="710" y="152" textAnchor="middle" className="text-[9px]" fill="#666">Llama 3</text>

            {/* To Brevo */}
            <line x1="560" y1="155" x2="650" y2="210" stroke="#d4d4d4" strokeWidth="1" markerEnd="url(#arrowProd)" />
            <rect x="650" y="185" width="120" height="50" rx="6" fill="#fff" stroke="#0B996E" strokeWidth="1" />
            <text x="710" y="207" textAnchor="middle" className="text-[10px] font-semibold" fill="#000">Brevo</text>
            <text x="710" y="222" textAnchor="middle" className="text-[9px]" fill="#666">SMTP</text>

            <defs>
              <marker id="arrowProd" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#d4d4d4" />
              </marker>
            </defs>
          </svg>
        </div>

        {/* No Proxy Note */}
        <div className="mt-6 bg-teal-50 border border-teal-200 rounded-lg px-5 py-4 max-w-3xl mx-auto">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-teal-900 mb-1">No Proxy Needed in Production</p>
              <p className="text-xs text-teal-700 leading-relaxed">
                In production, the React app communicates directly with the Render API.
                The <code className="font-mono bg-teal-100 px-1 rounded text-[11px]">server/index.ts</code> proxy is only for local development to bypass browser CORS constraints.
                Simply point <code className="font-mono bg-teal-100 px-1 rounded text-[11px]">VITE_PROXY_URL</code> to your Render URL.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ Footer ═══════════════ */

function DocsFooter() {
  return (
    <footer className="border-t border-gray-200 py-12 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="6" fill="#000" />
              <path d="M8 14L12 10L16 14L12 18Z" fill="#A4DBD9" />
              <path d="M12 14L16 10L20 14L16 18Z" fill="#fff" fillOpacity="0.6" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">Cold Scout</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xs text-secondary hover:text-black transition-colors">Home</Link>
            <Link to="/#features" className="text-xs text-secondary hover:text-black transition-colors">Features</Link>
            <Link to="/docs" className="text-xs text-black font-medium">Docs</Link>
            <a href="https://github.com/colddsam/AI-LEAD-GENERATION" target="_blank" rel="noopener noreferrer" className="text-xs text-secondary hover:text-black transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-subtle">
            &copy; {new Date().getFullYear()} Cold Scout. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════ Main Documentation Page ═══════════════ */

const LD_BREADCRUMB_DOCS = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://coldscout.colddsam.com/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Documentation',
      item: 'https://coldscout.colddsam.com/docs',
    },
  ],
};

export default function Documentation() {
  useSEO({
    title: 'Documentation — Cold Scout AI Lead Generation',
    description:
      'Full setup guide for Cold Scout: system architecture, API keys, environment variables, deployment to Render & Vercel, and production configuration.',
    canonical: 'https://coldscout.colddsam.com/docs',
    keywords:
      'Cold Scout documentation, AI lead generation setup, FastAPI deployment, Vercel deployment, Render deployment, Supabase database, Groq API, Google Places API',
  });

  return (
    <div className="bg-white text-black font-sans antialiased">
      <JsonLd data={LD_BREADCRUMB_DOCS} id="breadcrumb-docs" />
      <DocsNavbar />
      <HeroSection />
      <TableOfContents />
      <ArchitectureSection />
      <PipelineSection />
      <TechStackSection />
      <SetupSection />
      <ApiKeysSection />
      <EnvVarsSection />
      <DeploymentSection />
      <ProdArchitectureSection />
      <DocsFooter />
    </div>
  );
}
