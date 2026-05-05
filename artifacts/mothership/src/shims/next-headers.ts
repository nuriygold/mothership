// Client-side stubs for next/headers — these only exist in server contexts in Next.
export function cookies() {
  const get = (name: string) => {
    if (typeof document === 'undefined') return undefined;
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? { name, value: decodeURIComponent(m[1]) } : undefined;
  };
  return {
    get,
    getAll: () => [],
    has: (name: string) => Boolean(get(name)),
    set: () => {},
    delete: () => {},
  };
}

export function headers() {
  return {
    get: (_: string) => null,
    has: (_: string) => false,
    forEach: () => {},
    entries: () => [].values(),
    keys: () => [].values(),
    values: () => [].values(),
  };
}

export function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}
