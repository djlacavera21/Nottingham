import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']],
  ...['calendar', 'closure', 'international', 'paper-broker', 'demo'].map(name => [`/src/${name}.js`, [`src/${name}.js`, 'text/javascript; charset=utf-8']]),
]);
export function makeServer() {
  return createServer(async (request, response) => {
    const headers = {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end(); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/health') {
      response.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', mode: 'paper', liveTrading: false })); return;
    }
    const file = publicFiles.get(pathname);
    if (!file) { response.writeHead(404, headers).end('Not found'); return; }
    try {
      const content = await readFile(path.join(root, file[0]));
      response.writeHead(200, { ...headers, 'Content-Type': file[1] });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { response.writeHead(500, headers).end('Unable to serve application.'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  makeServer().listen(port, host, () => console.log(`Nottingham paper workspace: http://${host}:${port}`));
}
