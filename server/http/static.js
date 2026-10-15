import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
export async function serveStatic(req, res, root, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded === '/') decoded = '/index.html';
  if (!/^\/(index\.html|manifest\.json|(?:src|css|assets)\/[^\0]+)$/.test(decoded) || decoded.split('/').some(part => part.startsWith('.'))) return false;
  try {
    const file = await realpath(path.resolve(root, `.${decoded}`));
    const allowedRoot = decoded.split('/')[1];
    if (['src', 'css', 'assets'].includes(allowedRoot) && !file.startsWith(path.join(root, allowedRoot) + path.sep)) return false;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body); return true;
  } catch { return false; }
}
