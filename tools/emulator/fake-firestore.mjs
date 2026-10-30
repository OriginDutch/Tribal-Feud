/**
 * A tiny stand-in for the Firestore emulator (the real one is a Java download this machine can't
 * fetch): the REST calls the game uses, in memory, NO security rules. For local browser tests only;
 * the CI runs the real emulator with the real rules.  node tools/emulator/fake-firestore.mjs [port]
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8080);
const docs = new Map(); // path -> { name, fields, createTime, updateTime }
const PREFIX = /^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents/;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  const m = PREFIX.exec(url.pathname);
  if (!m) return send(res, 404, { error: { message: 'no' } });
  const project = m[1];
  const rest = decodeURIComponent(url.pathname.slice(m[0].length));
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && rest === ':commit') {
      const { writes } = JSON.parse(body);
      const now = new Date().toISOString();
      const staged = new Map(docs);
      for (const w of writes) {
        if (w.delete) { staged.delete(w.delete.split('/documents/')[1]); continue; }
        const path = w.update.name.split('/documents/')[1];
        const exists = staged.has(path);
        if (w.currentDocument && w.currentDocument.exists !== exists) return send(res, w.currentDocument.exists ? 404 : 409, { error: { message: 'precondition' } });
        const fields = { ...w.update.fields };
        for (const t of w.updateTransforms ?? []) fields[t.fieldPath] = { timestampValue: now };
        staged.set(path, { name: w.update.name, fields, createTime: exists ? staged.get(path).createTime : now, updateTime: now });
      }
      docs.clear();
      for (const [k, v] of staged) docs.set(k, v);
      return send(res, 200, { commitTime: now });
    }
    const path = rest.replace(/^\//, '');
    const segments = path.split('/').length;
    if (req.method === 'GET' && segments % 2 === 0) return docs.has(path) ? send(res, 200, docs.get(path)) : send(res, 404, { error: { message: 'not found' } });
    if (req.method === 'GET') {
      const documents = [...docs.entries()].filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')).map(([, v]) => v);
      return send(res, 200, documents.length ? { documents } : {});
    }
    send(res, 400, { error: { message: `not supported: ${req.method} ${project} ${rest}` } });
  });
}).listen(port, '127.0.0.1', () => console.log(`fake firestore on ${port}`));
