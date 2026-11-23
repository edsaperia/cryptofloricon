#!/usr/bin/env node
'use strict';
/*
 * Serves the built site locally the way GitHub Pages would: optionally under
 * a sub-path, "/2244" redirected to "/2244/", and 404.html (with status 404)
 * for anything missing. Node's standard library only.
 *
 *   node scripts/serve.js [port] [prefix]      e.g. node scripts/serve.js 8080 /cryptofloricon/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 8080);
const prefix = ('/' + (process.argv[3] || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const root = path.resolve(__dirname, '..', 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

function send(res, status, file, method) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  if (method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const notFound = () => send(res, 404, path.join(root, '404.html'), req.method);
  if (!url.startsWith(prefix)) return notFound();
  const file = path.join(root, url.slice(prefix.length));
  if (!file.startsWith(root)) return notFound();
  fs.stat(file, (err, st) => {
    if (err) return notFound();
    if (st.isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/' }); return res.end(); }
      const index = path.join(file, 'index.html');
      return fs.existsSync(index) ? send(res, 200, index, req.method) : notFound();
    }
    send(res, 200, file, req.method);
  });
}).listen(port, () => console.log(`Serving site/ at http://localhost:${port}${prefix}`));
