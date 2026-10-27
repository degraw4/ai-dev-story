import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
const allowed = name => ['index.html', 'styles.css'].includes(name) || ['src/', 'assets/', 'design-preview/'].some(prefix => name.startsWith(prefix));

export function createPreviewServer() {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const name = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (!allowed(name) || name.split('/').some(part => part.startsWith('.')) || name.includes('\\')) { response.writeHead(404); response.end(); return; }
      const path = await realpath(resolve(root, name));
      const within = relative(root, path);
      if (within.startsWith('..' + sep) || !allowed(within.split(sep).join('/')) || !(await stat(path)).isFile()) { response.writeHead(404); response.end(); return; }
      const data = await readFile(path);
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': data.length });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404); response.end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const server = createPreviewServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`AI Dev Story: http://127.0.0.1:${port}`));
  const close = () => server.close();
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
