/**
 * HTTP server utilities and helpers
 */
import { DEFAULT_READER_SETTINGS, type ReaderSettings, type ThemeName } from "./config";

// ============ Response Helpers ============

/**
 * gzip text/json responses when the client advertises support. Prose HTML/JSON
 * is ~70-75% compressible — the ~95KB chapter page becomes ~25-30KB — and the
 * Kindle's WebKit negotiates gzip fine. Binary bodies (images, fonts) are
 * skipped. Spinning at handleRequest covers html/json/serveStatic in one place.
 *
 * Deliberately crash-proof: this is a pure optimization, so any failure (a
 * locked/stream body, an odd content-type) must degrade to the untouched
 * response, never take the server down.
 */
export async function compressIfPossible(req: Request, res: Response): Promise<Response> {
  try {
    const type = res.headers.get("content-type") || "";
    // Only compress text-ish payloads; leave images/fonts/audio/video alone.
    if (/^(image|font|audio|video)\//.test(type)) return res;
    if (res.body === null) return res; // redirects & co.

    res.headers.set("Vary", "Accept-Encoding");
    if (!/\bgzip\b/.test(req.headers.get("accept-encoding") || "")) return res;
    if (res.headers.has("Content-Encoding")) return res;

    // Read the body directly — never re-wrap res.body into a new Response or
    // the stream is handed to the reader already locked and Bun throws
    // "ReadableStream is locked". Always hand back a fresh Response so the
    // original (possibly consumed) one is never returned.
    const bytes = await res.arrayBuffer();
    const gz = Bun.gzipSync(bytes);
    const headers = new Headers(res.headers);
    headers.set("Vary", "Accept-Encoding");
    if (gz.length < bytes.byteLength) {
      headers.set("Content-Encoding", "gzip");
      return new Response(gz, { status: res.status, headers });
    }
    return new Response(bytes, { status: res.status, headers });
  } catch {
    // Optimization only — never let compression take down the server.
    return res;
  }
}


/**
 * Create HTML response from JSX element or string
 */
export function html(content: JSX.Element, status: number = 200): Response {
  // JSX.Element is string | Promise<string> in @kitajs/html
  // For our sync components, it's always a string
  return new Response(content as string, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Create JSON response
 */
export function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create redirect response
 */
export function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

// ============ Request Helpers ============

/**
 * Parse form data from POST body
 */export async function parseFormData(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  }
  
  return {};
}

/**
 * Parse reader settings from cookie
 */
export function parseReaderSettings(cookieHeader: string | null): ReaderSettings {
  if (!cookieHeader) return DEFAULT_READER_SETTINGS;
  
  const match = cookieHeader.match(/reader_settings=([^;]+)/);
  if (!match) return DEFAULT_READER_SETTINGS;
  
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    const theme: ThemeName = parsed.theme || (parsed.dark ? 'dark' : 'light');
    return {
      dark: theme === 'dark',
      theme,
      font: typeof parsed.font === "number" ? parsed.font : 18,
      lineHeight: parsed.lineHeight,
      readingWidth: parsed.readingWidth,
      // Absent mode stays undefined so the route can apply a device default
      // (scrolled on phones, paged on e-ink) instead of forcing paged.
      mode: parsed.mode === 'scrolled' ? 'scrolled' : parsed.mode === 'paged' ? 'paged' : undefined,
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

// ============ Static File Serving ============

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Serve static files from public directory
 * Returns null if file not found
 */
export async function serveStatic(path: string): Promise<Response | null> {
  // Remove /public prefix if present
  const filePath = path.startsWith("/public/") ? path.slice(7) : path;
  const fullPath = `./public${filePath}`;
  
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }

  // Get MIME type
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  // Long cache for fonts and assets
  const cacheControl = ext === ".ttf" || ext === ".woff" || ext === ".woff2"
    ? "public, max-age=31536000" // 1 year
    : "public, max-age=86400";   // 1 day

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}

// (Legacy URL_PATTERNS and matchPath were removed in Phase 1 — routes match
// their own unified /read/:source/... patterns inline.)
