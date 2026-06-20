import * as esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcClient = path.join(__dirname, 'src/client');
const distClient = path.join(__dirname, 'dist/client');

await fs.mkdir(distClient, { recursive: true });

// Copy static assets
const files = ['index.html', 'styles.css', 'logo.svg'];
await Promise.all(files.map(f =>
  fs.copyFile(path.join(srcClient, f), path.join(distClient, f))
));

// Bundle JS
await esbuild.build({
  entryPoints: [path.join(srcClient, 'main.ts')],
  bundle: true,
  outfile: path.join(distClient, 'main.js'),
  format: 'iife',
  globalName: 'app',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('Client build complete');
