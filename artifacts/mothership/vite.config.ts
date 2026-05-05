import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const DEFAULT_PORT = 5000;
const rawPort = process.env.PORT ?? String(DEFAULT_PORT);
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: [
      // Next.js shims (use exact regex match so subpaths don't smear)
      { find: /^next\/link$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-link.tsx") },
      { find: /^next\/image$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-image.tsx") },
      { find: /^next\/navigation$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-navigation.ts") },
      { find: /^next\/headers$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-headers.ts") },
      { find: /^next\/server$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-server.ts") },
      { find: /^next\/dynamic$/, replacement: path.resolve(import.meta.dirname, "src/shims/next-dynamic.tsx") },
      // Vercel Workflow SDK shims (server-only)
      { find: /^workflow$/, replacement: path.resolve(import.meta.dirname, "src/shims/workflow.ts") },
      { find: /^@workflow\/ai\/agent$/, replacement: path.resolve(import.meta.dirname, "src/shims/workflow-ai-agent.ts") },
      // Supabase shim — original used it server-side
      { find: /^@supabase\/supabase-js$/, replacement: path.resolve(import.meta.dirname, "src/shims/supabase.ts") },
      // Server-only DB libs replaced with no-op proxies (regex catches all subpaths)
      { find: /^drizzle-orm(\/.*)?$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^postgres$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^pg$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^nodemailer$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^imapflow$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^googleapis$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^plaid$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      { find: /^react-plaid-link$/, replacement: path.resolve(import.meta.dirname, "src/shims/noop-module.ts") },
      // node:crypto used by services for randomUUID — provide browser shim
      { find: /^node:crypto$/, replacement: path.resolve(import.meta.dirname, "src/shims/node-crypto.ts") },
      // Project paths (must come last so regex above match first)
      { find: "@assets", replacement: path.resolve(import.meta.dirname, "..", "..", "attached_assets") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: false },
  },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});
