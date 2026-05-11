import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'server/v2': 'src/server/v2.ts',
    'lib/v2/auth': 'src/lib/v2/auth.ts',
  },
  format: ['esm'],
  outDir: 'dist',
  sourcemap: false,
  dts: true,
  splitting: false,
  bundle: true,
  external: ['postgres', 'drizzle-orm'],
  esbuildOptions(options) {
    options.alias = { '@': './src' };
  },
});
