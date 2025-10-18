import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  entry: {
    cli: 'cli.ts',
    index: 'index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'node18',
  platform: 'node',
  shims: true,
  treeshake: true,
  minify: false,
  skipNodeModulesBundle: true,
  external: ['ts-morph'],
  async onSuccess() {
    // Add shebang to CLI file
    const cliPath = join('dist', 'cli.js');
    const content = readFileSync(cliPath, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
    }
  },
});
