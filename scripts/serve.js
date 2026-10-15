import http from 'node:http';
import { serveStatic } from '../server/http/static.js';
const root = process.cwd();
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!await serveStatic(req, res, root, pathname)) { res.writeHead(404); res.end('Not found'); }
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Hunter: http://127.0.0.1:${port}`));
