import { useCallback, useMemo } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';

export function usePathname(): string {
  const [loc] = useLocation();
  return loc || '/';
}

export function useRouter() {
  const [, setLoc] = useLocation();
  return useMemo(
    () => ({
      push: (href: string) => setLoc(href),
      replace: (href: string) => setLoc(href, { replace: true }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => window.location.reload(),
      prefetch: () => {},
    }),
    [setLoc],
  );
}

export function useSearchParams(): URLSearchParams {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  // wouter exposes params via useRoute, but at this point we don't know the pattern.
  // Pages reading params will be wrapped by router; provide a global fallback via window.__nextParams.
  // @ts-ignore
  return (typeof window !== 'undefined' && window.__nextParams) || ({} as T);
}

export function redirect(href: string): never {
  if (typeof window !== 'undefined') {
    window.location.href = href;
  }
  throw new Error(`redirect: ${href}`);
}

export function notFound(): never {
  throw new Error('notFound');
}

export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
