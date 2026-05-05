import * as React from 'react';
import { Switch, Route, Router as WouterRouter, Redirect, useParams } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/ui/app-shell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const navItems = [
  { label: 'Today', href: '/today' },
  { label: 'Dispatch', href: '/dispatch' },
  { label: 'Scorpion', href: '/scorpion' },
  { label: 'Trophies', href: '/trophy' },
  { label: 'Ops', href: '/ops' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Bots', href: '/bots' },
  { label: 'Email', href: '/email' },
  { label: 'Telegram', href: '/telegram' },
  { label: 'Finance', href: '/finance' },
  { label: 'Streams', href: '/revenue-streams' },
  { label: 'Activity (Log)', href: '/activity' },
  { label: 'Vision', href: '/vision' },
  { label: 'Projects', href: '/projects' },
  { label: 'Marco', href: '/marco' },
  { label: 'Claude', href: '/claude' },
  { label: 'Ruby', href: '/ruby' },
  { label: 'Marvin', href: '/marvin' },
  { label: 'Iceman', href: '/iceman' },
];

// Eagerly import all page modules; vite supports this glob pattern.
const pageModules = import.meta.glob('./app/**/page.tsx', { eager: true }) as Record<
  string,
  { default: React.ComponentType<any> }
>;

type RouteEntry = { path: string; Component: React.ComponentType<any>; paramKeys: string[] };

function buildRoutes(): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const [file, mod] of Object.entries(pageModules)) {
    // ./app/foo/bar/page.tsx → /foo/bar
    let p = file.replace(/^\.\/app/, '').replace(/\/page\.tsx$/, '');
    if (p === '') p = '/';
    const paramKeys: string[] = [];
    // Convert [param] → :param for wouter
    p = p.replace(/\[([^\]]+)\]/g, (_, name) => {
      paramKeys.push(name);
      return ':' + name;
    });
    entries.push({ path: p, Component: mod.default, paramKeys });
  }
  // Sort: more specific (more segments / fewer params) first
  entries.sort((a, b) => {
    const sa = a.path.split('/').length;
    const sb = b.path.split('/').length;
    if (sa !== sb) return sb - sa;
    const pa = (a.path.match(/:/g) || []).length;
    const pb = (b.path.match(/:/g) || []).length;
    return pa - pb;
  });
  return entries;
}

const ROUTES = buildRoutes();

function ParamWrapper({ Component, paramKeys }: { Component: React.ComponentType<any>; paramKeys: string[] }) {
  const params = useParams() as Record<string, string>;
  React.useEffect(() => {
    // Expose params for shimmed useParams in next/navigation
    (window as any).__nextParams = params;
    return () => {
      (window as any).__nextParams = {};
    };
  }, [params]);
  // Pass as Next.js-style { params }
  return <Component params={params} searchParams={{}} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/today" />
      </Route>
      {ROUTES.filter((r) => r.path !== '/').map((r) => (
        <Route key={r.path} path={r.path}>
          <ParamWrapper Component={r.Component} paramKeys={r.paramKeys} />
        </Route>
      ))}
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function NotFound() {
  return (
    <div style={{ padding: 24, fontFamily: 'IBM Plex Mono, monospace' }}>
      <h1>404 — page not found</h1>
      <p style={{ opacity: 0.7 }}>Available routes:</p>
      <ul>
        {ROUTES.map((r) => (
          <li key={r.path}>
            <code>{r.path}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppShell items={navItems}>
          <Router />
        </AppShell>
      </WouterRouter>
    </QueryClientProvider>
  );
}
