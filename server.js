const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3000;
const execRoot = process.pkg ? path.dirname(process.execPath) : __dirname;
const valoresPath = path.resolve(execRoot, "valores.txt");
const publicDir = process.pkg
  ? path.resolve(execRoot, "public")
  : path.resolve(__dirname, "public");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

async function tryServeStatic(pathname, res) {
  try {
    // Normalize incoming pathname and strip leading slashes so path.join keeps publicDir as the base
    const relPath = String(pathname || "").replace(/^\/+/, "") || "index.html";
    const candidate = path.join(publicDir, relPath);
    const safePath = path.resolve(candidate);

    // Use path.relative to ensure the resolved path stays inside publicDir
    const relative = path.relative(publicDir, safePath);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid path");

    let filePath = safePath;
    const stat = await fs.promises.stat(filePath).catch(() => null);

    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const data = await fs.promises.readFile(filePath);
    const contentType = getContentType(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
    return true;
  } catch (_) {
    return false;
  }
}

function sanitizeCode(input) {
  // Ensure it's a string, strip newlines and pipes to keep the line format stable
  return String(input || "")
    .replace(/[\r\n]+/g, " ") // remove newlines
    .replace(/\|/g, "_") // avoid breaking the delimiter format
    .trim();
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  // Serve UI at root
  if (req.method === "GET" && pathname === "/") {
    const served = await tryServeStatic("/index.html", res);
    if (served) return;
    // Fallback: brief message
    return sendJson(res, 200, {
      ok: true,
      message:
        "Usa /addItem?code=ITEM&qtty=QTTY&date=DATE para agregar a valores.txt \n \
        Usa /getTime para obtener la hora del servidor",
    });
  }

  // Health endpoint (JSON)
  if (req.method === "GET" && pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  // Time endpoint (JSON)
  if (req.method === "GET" && pathname === "/getTime") {
    return sendJson(res, 200, { ok: true, serverTime: Date.now() });
  }

  // Add item endpoint (JSON)

  if (req.method === "GET" && pathname === "/addItem") {
    const codeRaw = query.code;
    const qttyRaw = query.qtty;
    const dateRaw = query.date;

    const code = sanitizeCode(codeRaw);
    const qttyNum = Number(qttyRaw);
    const dateNum = dateRaw ? Number(dateRaw) : Date.now();

    if (!code) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Falta el parámetro "code" o está vacío',
      });
    }
    if (!Number.isFinite(qttyNum)) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Falta el parámetro "qtty" o no es válido',
      });
    }

    if (!Number.isFinite(dateNum) || dateNum <= 0) {
      return sendJson(res, 400, {
        ok: false,
        error: 'El parámetro "date" no es válido',
      });
    }


    try {
      // Read current file contents (treat missing file as empty)
      const content = await fs.promises
        .readFile(valoresPath, "utf8")
        .catch((e) => {
          if (e && e.code === "ENOENT") return "";
          throw e;
        });

      const lines = content.trim() ? content.trim().split("\n") : [];
      if (lines.length) {
        const lastLine = lines[lines.length - 1] || "";
        const lastParts = lastLine.split("|");
        const lastDateNum = lastParts && lastParts.length >= 3 ? Number(lastParts[2]) : NaN;
        const now = Date.now();
        console.log(lastDateNum, now, now - lastDateNum);

        if (Number.isFinite(lastDateNum) && now - lastDateNum > 2000) {
          console.log(`Limpiando ${valoresPath}`);
          await fs.promises.truncate(valoresPath, 0);
          console.log("Archivo limpiado");
        }
      } else {
        // no lines -> nothing to compare; simply log
        console.log("valores.txt vacío o sin líneas previas");
      }
    } catch (e) {
      console.error("Error leyendo/limpiando valores.txt:", e);
    }

    const line = `${code}|${qttyNum}|${dateNum}\n`;
    console.log(`Agregando a valores.txt: ${line.trim()}`);

    try {
      await fs.promises.appendFile(valoresPath, line, "utf8");
      return sendJson(res, 200, { ok: true, written: line.trim() });
    } catch (err) {
      console.error("No se pudo agregar a valores.txt:", err);
      return sendJson(res, 500, {
        ok: false,
        error: "No se pudo escribir en valores.txt",
      });
    }
  }

  // Try serving static assets (e.g., /styles.css, /app.js)
  if (req.method === "GET") {
    const served = await tryServeStatic(pathname, res);
    if (served) return;
  }

  // Not found
  sendJson(res, 404, { ok: false, error: "No encontrado" });
});

server.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const endpoints = new Set();

  Object.values(nets).forEach((iface = []) => {
    iface.forEach((addr) => {
      if (!addr || addr.internal) return;
      if (addr.family === "IPv4") {
        endpoints.add(`http://${addr.address}:${PORT}`);
      } else if (addr.family === "IPv6") {
        endpoints.add(`http://[${addr.address}]:${PORT}`);
      }
    });
  });

  // Always include loopback and wildcard for clarity
  endpoints.add(`http://127.0.0.1:${PORT}`);
  endpoints.add(`http://0.0.0.0:${PORT}`);

  console.log("Servidor escuchando en:");
  Array.from(endpoints).forEach((url) => console.log(`  ${url}`));
});
