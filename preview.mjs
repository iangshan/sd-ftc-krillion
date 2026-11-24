import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.argv[2] ?? 8783);
const types = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  png: 'image/png',
  woff2: 'font/woff2',
};
const publicFiles = new Set([
  'index.html',
  'styles.css',
  'results.css',
  'admin.mjs',
  'app.mjs',
  'config.mjs',
  'core.mjs',
  'round-stats.mjs',
  'results.mjs',
  'sample.mjs',
  'scene.mjs',
  'store.mjs',
  'ui.mjs',
  'assets/pixelify-sans-latin.woff2',
  'assets/shop-floor-pixel.png',
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Use a port from 1 through 65535.');
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const pathname = request.url?.split('?')[0];
  const file = pathname === '/' ? 'index.html' : pathname?.slice(1);
  if (!pathname?.startsWith('/') || !publicFiles.has(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  try {
    const content = await readFile(new URL(file, import.meta.url));
    const type = types[file.split('.').at(-1)];
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Could not load the preview file');
  }
});

server.on('error', error => {
  console.error(`Could not start the preview on port ${port}. ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => console.log(`Local preview at http://${host}:${port}/`));

