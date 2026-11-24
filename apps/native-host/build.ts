import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/host.ts')],
  outfile: path.join(distDir, 'host.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});

fs.chmodSync(path.join(distDir, 'host.js'), 0o755);

const manifestTemplate = {
  name: 'com.websession2api.host',
  description: 'WebSession2API Local Native Messaging Host',
  path: '<ABSOLUTE_PATH_TO_HOST_LAUNCHER>',
  type: 'stdio',
  allowed_origins: ['chrome-extension://<YOUR_CHROME_EXTENSION_ID>/'],
};

fs.writeFileSync(
  path.join(distDir, 'com.websession2api.host.json'),
  JSON.stringify(manifestTemplate, null, 2),
  'utf8'
);

console.log('[WebSession2API Native Host] Built bundle and manifest template to', distDir);
