// Next.js config wrapped with `withWorkflow` so the Vercel Workflow / WDK SWC
// plugin is registered for `'use workflow'` and `'use step'` directives, and
// the SDK's internal `/api/workflow` endpoint is mounted automatically.
//
// In production this connects to the Workflow runtime via Vercel infrastructure.
// In local dev the SDK no-ops gracefully if `npx workflow dev` is not running,
// and our runtime adapter (`lib/ops/runtime.ts`) catches that and degrades the
// dispatch endpoint without breaking the UI.
import { withWorkflow } from 'workflow/next';

/** @type {import('next').NextConfig} */
const baseConfig = {
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ['undici'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@workflow/world-local', 'undici'],
};

export default withWorkflow(baseConfig);
