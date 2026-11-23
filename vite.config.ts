/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` makes the GitHub Pages site. `vite build --mode single` makes one self-contained HTML
// file (scripts, styles, fonts and the simulation worker inlined) that runs from disk with no network;
// scripts/offline.mjs then publishes it as dist/offline.html.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: single ? './' : '/monte-carlo-balancing/',
    // A classic (IIFE) worker: Chrome refuses module workers from blob URLs on pages opened from disk.
    worker: { format: 'iife' },
    plugins: single ? [viteSingleFile()] : [],
    build: single ? { outDir: 'dist-single', emptyOutDir: true } : {},
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 60_000,
    },
  };
});
