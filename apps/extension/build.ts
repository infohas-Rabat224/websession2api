import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, 'background'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'content'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'popup'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'options'), { recursive: true });

await esbuild.build({
  entryPoints: {
    'background/service-worker': path.join(__dirname, 'src/background/service-worker.ts'),
    'content/index': path.join(__dirname, 'src/content/index.ts'),
    'popup/popup': path.join(__dirname, 'src/popup/popup.ts'),
    'options/options': path.join(__dirname, 'src/options/options.ts'),
  },
  outdir: distDir,
  bundle: true,
  format: 'esm',
  target: ['chrome120'],
  sourcemap: true,
  minify: false,
});

fs.copyFileSync(path.join(__dirname, 'manifest.json'), path.join(distDir, 'manifest.json'));
fs.copyFileSync(path.join(__dirname, 'src/popup/popup.html'), path.join(distDir, 'popup/popup.html'));
fs.copyFileSync(path.join(__dirname, 'src/options/options.html'), path.join(distDir, 'options/options.html'));

console.log('[WebSession2API Extension] Built Manifest V3 bundle to', distDir);
