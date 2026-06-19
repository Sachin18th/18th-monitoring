"use client";

import React, { useState } from "react";
import {
  Server,
  Database,
  Boxes,
  Terminal,
  KeyRound,
  Rocket,
  CheckCircle2,
  Copy,
  Check,
  Cpu,
  Globe,
  Container,
} from "lucide-react";

/**
 * Requirements & Demo Deployment page.
 * Self-contained reference rendered in the dashboard UI.
 * Source of truth mirrors /REQUIREMENTS.md at the repo root.
 */

type Dep = { name: string; version: string };

const PREREQS: { icon: React.ReactNode; label: string; version: string; note: string }[] = [
  { icon: <Cpu className="h-4 w-4" />, label: "Node.js", version: "20.19.x (LTS)", note: "matches dev env v20.19.5" },
  { icon: <Terminal className="h-4 w-4" />, label: "npm", version: "10.x", note: "workspaces support required" },
  { icon: <Database className="h-4 w-4" />, label: "PostgreSQL", version: "14+", note: "primary datastore (Prisma)" },
  { icon: <Container className="h-4 w-4" />, label: "Docker + Compose", version: "optional", note: "only for infra/docker-compose*" },
];

const WORKSPACES: { name: string; type: string; purpose: string }[] = [
  { name: "apps/api", type: "Fastify 4 + TS", purpose: "Backend REST API, ingest, tracker script" },
  { name: "apps/dashboard", type: "Next.js + React 19", purpose: "Frontend dashboard UI" },
  { name: "apps/synthetic-agent", type: "Node + Playwright", purpose: "Synthetic monitoring (cron)" },
  { name: "packages/db", type: "Prisma 5 + Postgres", purpose: "Schema, migrations, seeders" },
  { name: "packages/ui", type: "tsup (React)", purpose: "Shared design-system components" },
  { name: "packages/rum-sdk / tracker", type: "tsup (browser IIFE)", purpose: "Frontend telemetry / storefront tracker" },
];

const DEP_GROUPS: { title: string; deps: Dep[] }[] = [
  {
    title: "apps/api",
    deps: [
      { name: "fastify", version: "^4" },
      { name: "@fastify/cors", version: "^10" },
      { name: "@prisma/client", version: "^5.22" },
      { name: "pino", version: "^9" },
      { name: "zod", version: "^3" },
      { name: "dotenv", version: "^16" },
    ],
  },
  {
    title: "apps/dashboard",
    deps: [
      { name: "next", version: "latest" },
      { name: "react / react-dom", version: "19" },
      { name: "recharts", version: "^3" },
      { name: "axios", version: "^1" },
      { name: "lucide-react", version: "^1.8" },
      { name: "tailwindcss", version: "^4" },
      { name: "papaparse / xlsx", version: "^5 / ^0.18" },
      { name: "zod", version: "^4" },
    ],
  },
  {
    title: "packages/db",
    deps: [
      { name: "prisma", version: "^5.22" },
      { name: "@prisma/client", version: "^5.22" },
      { name: "pg", version: "^8.11" },
      { name: "tsup", version: "^8" },
    ],
  },
  {
    title: "apps/synthetic-agent",
    deps: [
      { name: "playwright", version: "^1.43" },
      { name: "node-cron", version: "^3" },
      { name: "undici", version: "^6" },
    ],
  },
];

const ENV_FILES: { file: string; body: string }[] = [
  {
    file: "apps/api/.env",
    body: `PORT=4000
NODE_ENV=production
JWT_SECRET=<64+ char random string>
JWT_EXPIRES_IN=8h
DATABASE_URL=postgresql://user:password@localhost:5432/kpi_monitoring
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10`,
  },
  {
    file: "apps/dashboard/.env.local",
    body: `# Point to the demo host's public API URL
NEXT_PUBLIC_API_URL=http://localhost:4000`,
  },
  {
    file: "packages/db/.env",
    body: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/KPI?schema=public"`,
  },
];

const DEPLOY_STEPS = `# 0. Prereqs: Node 20.19.x, npm 10.x, PostgreSQL 14+ running

# 1. Install (installs all workspaces)
npm install

# 2. Configure env files (copy + edit each)
cp apps/api/.env.example       apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp packages/db/.env.example    packages/db/.env

# 3. Database
npm run db:generate       --prefix packages/db
npm run db:migrate:deploy --prefix packages/db
npm run seed:auth         --prefix packages/db   # optional demo users

# 4. Build everything
npm run build

# 5a. Dev / quick demo
npm run dev

# 5b. Production-style start
npm run start --prefix apps/api        # :4000
npm run start --prefix apps/dashboard  # :3000`;

const CHECKLIST = [
  "Node 20.19.x + npm 10.x + PostgreSQL 14+ installed",
  "npm install completed at repo root",
  "All three .env files created & filled (DB URL + JWT_SECRET)",
  "Database created; db:migrate:deploy ran successfully",
  "seed:auth ran so you can log in (optional)",
  "npm run build succeeds",
  "API reachable on :4000, dashboard on :3000",
  "NEXT_PUBLIC_API_URL points to the demo host's public address",
  "Firewall/security group allows ports 3000 (and 4000)",
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="relative group">
      <button
        onClick={copy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-2 py-1 text-xs text-slate-200 opacity-0 transition group-hover:opacity-100 hover:bg-slate-600"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
        <span className="text-indigo-500">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function RequirementsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-indigo-500">
            <Rocket className="h-6 w-6" />
            <span className="text-sm font-medium uppercase tracking-wide">Demo Deployment</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Requirements &amp; Go-Live Guide
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Everything needed to run the KPI Monitoring Platform on a fresh demo host.
          </p>
        </header>

        {/* Prerequisites */}
        <Section icon={<Server className="h-5 w-5" />} title="System Prerequisites">
          <div className="grid gap-3 sm:grid-cols-2">
            {PREREQS.map((p) => (
              <div
                key={p.label}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <span className="mt-0.5 text-indigo-500">{p.icon}</span>
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {p.label} <span className="text-indigo-500">{p.version}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.note}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Kafka &amp; ClickHouse appear in <code>docker-compose.prod.yml</code> as part of the full
            production architecture — they are <strong>not required for a demo</strong>. PostgreSQL alone
            runs the dashboard + API.
          </p>
        </Section>

        {/* Workspaces */}
        <Section icon={<Boxes className="h-5 w-5" />} title="Monorepo Workspaces">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-4 font-medium">Workspace</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {WORKSPACES.map((w) => (
                  <tr key={w.name} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-2 pr-4 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {w.name}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{w.type}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{w.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Dependencies */}
        <Section icon={<Boxes className="h-5 w-5" />} title="Key Libraries">
          <div className="grid gap-4 sm:grid-cols-2">
            {DEP_GROUPS.map((g) => (
              <div key={g.title} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {g.title}
                </h3>
                <ul className="space-y-1">
                  {g.deps.map((d) => (
                    <li key={d.name} className="flex justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{d.name}</span>
                      <span className="font-mono text-slate-400">{d.version}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            A single <code>npm install</code> at the repo root installs all workspace dependencies.
          </p>
        </Section>

        {/* Env */}
        <Section icon={<KeyRound className="h-5 w-5" />} title="Environment Variables">
          <div className="space-y-4">
            {ENV_FILES.map((e) => (
              <div key={e.file}>
                <div className="mb-1 flex items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  <Globe className="h-3 w-3" />
                  {e.file}
                </div>
                <CodeBlock code={e.body} />
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Keep <code>DATABASE_URL</code> consistent between <code>apps/api/.env</code> and{" "}
            <code>packages/db/.env</code>. Never commit <code>.env</code> files.
          </p>
        </Section>

        {/* Deploy */}
        <Section icon={<Terminal className="h-5 w-5" />} title="Demo Deployment — Steps">
          <CodeBlock code={DEPLOY_STEPS} />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Ports: API → <span className="font-mono">4000</span>, Dashboard →{" "}
            <span className="font-mono">3000</span>. Open{" "}
            <span className="font-mono">http://&lt;demo-host&gt;:3000</span>.
          </p>
        </Section>

        {/* Checklist */}
        <Section icon={<CheckCircle2 className="h-5 w-5" />} title="Go-Live Checklist">
          <ul className="space-y-2">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <footer className="pb-10 text-center text-xs text-slate-400">
          Mirrors <code>/REQUIREMENTS.md</code> at the repo root.
        </footer>
      </div>
    </div>
  );
}
