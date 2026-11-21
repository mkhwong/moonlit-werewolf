import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import obfuscator from 'rollup-plugin-obfuscator';

// Production builds scramble the game's own code (not React etc.), so a downloaded copy is very hard to
// read, edit or reuse. NO_OBFUSCATE=1 skips it for a quick local build.
const scramble = process.env.NO_OBFUSCATE
  ? null
  : {
      ...obfuscator({
        include: ['**/*.js', '**/*.ts', '**/*.tsx', '**/*.jsx'],
        exclude: ['node_modules/**'],
        options: {
          compact: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          splitStrings: false,
          controlFlowFlattening: false,   // big size / speed cost: off
          deadCodeInjection: false,
          selfDefending: false,
          transformObjectKeys: false,
          numbersToExpressions: false,
          simplify: true,
          unicodeEscapeSequence: false,
          sourceMap: false,
        },
      }),
      apply: 'build' as const,
      enforce: 'post' as const,   // after Vite has filled in import.meta.env etc.
    };

export default defineConfig({
  plugins: [react(), scramble],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    // HMR is disabled in AI Studio via DISABLE_HMR env var (file watching off during agent edits).
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
