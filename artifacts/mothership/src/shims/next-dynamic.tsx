import * as React from 'react';

interface DynamicOptions {
  ssr?: boolean;
  loading?: React.ComponentType<any>;
}

export default function dynamic<P = {}>(
  importer: () => Promise<{ default: React.ComponentType<P> } | React.ComponentType<P>>,
  opts: DynamicOptions = {},
) {
  const Lazy = React.lazy(async () => {
    const mod = await importer();
    if (mod && typeof mod === 'object' && 'default' in (mod as any)) return mod as any;
    return { default: mod as any };
  });
  const Loading = opts.loading;
  return function DynamicComponent(props: P) {
    return (
      <React.Suspense fallback={Loading ? <Loading /> : null}>
        {/* @ts-ignore */}
        <Lazy {...props} />
      </React.Suspense>
    );
  };
}
