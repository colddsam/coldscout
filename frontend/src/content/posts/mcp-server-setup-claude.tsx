import { Link } from 'react-router-dom';
import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'mcp-server-setup-ai-agents-claude',
  kind: 'guide',
  title: 'MCP Server Setup: Connecting Claude and GPT Agents to Cold Scout',
  description:
    'Quickstart for using Cold Scout as an MCP (Model Context Protocol) server so Claude Desktop, Claude Code, and other AI agents can call lead generation endpoints.',
  publishedAt: '2026-05-04',
  updatedAt: '2026-05-08',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'AI Agents',
  isOutline: true,
  keywords: [
    'MCP server',
    'Model Context Protocol',
    'Claude MCP server',
    'AI agent lead generation',
    'GPT lead generation tool',
    'Cold Scout MCP',
  ],
  wordCount: 600,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        The <strong>Model Context Protocol (MCP)</strong> is the open standard for
        letting AI agents call external tools. Cold Scout ships as an MCP server out
        of the box, so any MCP-aware client — Claude Desktop, Claude Code, Cursor,
        Cline, Continue — can ask the agent to discover, qualify, and draft cold
        emails directly.
      </p>

      <h2>What you can do with the integration</h2>
      <ul>
        <li>"Find 50 dental clinics in Mumbai with 4.5+ star ratings."</li>
        <li>"Qualify those leads against this ICP and return the top 10."</li>
        <li>"Draft a cold email to lead #42, referencing their about page."</li>
        <li>"Run the daily pipeline and report what changed."</li>
      </ul>

      <h2>Quick setup (Pro plan)</h2>
      <ol>
        <li>
          Sign up for <Link to="/pricing">Cold Scout Pro</Link> — the MCP server is
          included.
        </li>
        <li>
          Generate an API key from the dashboard's Settings → MCP page.
        </li>
        <li>
          Add the server to your client's MCP config. For Claude Desktop, that's
          <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>.
        </li>
        <li>
          Restart the client. The Cold Scout tools appear in the agent's tool list.
        </li>
      </ol>

      <h2>Self-host setup (OSS)</h2>
      <p>
        The OSS package exposes the same MCP server at
        <code>http://localhost:8000/mcp</code> by default. Point your client there
        with no auth for local-only setups, or terminate the public endpoint behind
        an authenticating reverse proxy for shared use.
      </p>

      <h2>Available tools</h2>
      <p>
        The server exposes the same primitives the dashboard uses internally:
        <code>search_places</code>, <code>qualify_lead</code>,
        <code>generate_email</code>, <code>send_email</code>, plus pipeline-level
        wrappers like <code>run_discovery</code> and <code>run_qualification</code>.
      </p>

      <h2>This guide is a stub</h2>
      <p>
        Full configuration examples, the JSON schema for each tool, and security
        recommendations for exposing the MCP server publicly are coming soon. In the
        meantime, the canonical reference is the <code>/docs#mcp</code> section of
        our <Link to="/docs">technical documentation</Link>.
      </p>
    </ArticleLayout>
  );
}
