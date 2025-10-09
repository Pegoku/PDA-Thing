const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const valoresPath = path.resolve(__dirname, 'valores.txt');
const publicDir = path.resolve(__dirname, 'public');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.webmanifest':
      return 'application/manifest+json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function tryServeStatic(pathname, res) {
  try {
    // Prevent path traversal
    const safePath = path.normalize(path.join(publicDir, pathname));
    if (!safePath.startsWith(publicDir)) throw new Error('Invalid path');

    let filePath = safePath;
    const stat = await fs.promises.stat(filePath).catch(() => null);

    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const data = await fs.promises.readFile(filePath);
    const contentType = getContentType(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
    return true;
  } catch (_) {
    return false;
  }
}

function sanitizeCode(input) {
  // Ensure it's a string, strip newlines and pipes to keep the line format stable
  return String(input || '')
    .replace(/[\r\n]+/g, ' ') // remove newlines
    .replace(/\|/g, '_') // avoid breaking the delimiter format
    .trim();
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  // Serve UI at root
  if (req.method === 'GET' && pathname === '/') {
    const served = await tryServeStatic('/index.html', res);
    if (served) return;
    // Fallback: brief message
    return sendJson(res, 200, {
      ok: true,
      message: 'Use /addItem?code=ITEM&qtty=QTTY to append to valores.txt',
    });
  }

  // Health endpoint (JSON)
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/addItem') {
    const codeRaw = query.code;
    const qttyRaw = query.qtty;

    const code = sanitizeCode(codeRaw);
    const qttyNum = Number(qttyRaw);

    if (!code) {
      return sendJson(res, 400, { ok: false, error: 'Missing or empty "code" parameter' });
    }
    if (!Number.isFinite(qttyNum)) {
      return sendJson(res, 400, { ok: false, error: 'Missing or invalid "qtty" parameter' });
    }

    const line = `${code}|${qttyNum}\n`;
    console.log(`Appending to valores.txt: ${line.trim()}`);

    try {
      await fs.promises.appendFile(valoresPath, line, 'utf8');
      return sendJson(res, 200, { ok: true, written: line.trim() });
    } catch (err) {
      console.error('Failed to append to valores.txt:', err);
      return sendJson(res, 500, { ok: false, error: 'Failed to write to valores.txt' });
    }
  }

  // Try serving static assets (e.g., /styles.css, /app.js)
  if (req.method === 'GET') {
    const served = await tryServeStatic(pathname, res);
    if (served) return;
  }

  // Not found
  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
