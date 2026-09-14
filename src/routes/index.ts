/**
 * Routes index - main request router
 */
import { html, serveStatic, parseReaderSettings, redirect, parseFormData, compressIfPossible } from "../server";
import { handlePageRoute } from "./pages";
import { handleApiRoute } from "./api";
import { ErrorPage, LoginPage, InvitePage, InviteExpiredPage } from "../templates";
import { auth, getSession, AUTH_ENABLED } from "../lib/auth";
import type { ThemeName } from "../config";
import { getEnabledSources, getSourceByName } from "../services/source-registry";
import { getFeatures } from "../services/feature-registry";
import {
  getInvitationByToken,
  isInvitationValid,
  markInvitationUsed,
} from "../services/invitations";

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  "/health",
  "/login",
  "/api/auth",
  "/public",
  "/fonts",
  "/ws-test",
  "/api/ws-test",
  "/remote",
  "/api/remote",
  "/api/watch",
  "/invite",
  "/api/invitations/qr",
];

/**
 * Check if a path is public (doesn't require auth)
 */
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/** Post-login return target: same-origin path only (blocks //evil open redirects). */
function safeNext(value: string | null): string | undefined {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return undefined;
}

/**
 * Main request handler
 */
export async function handleRequest(req: Request): Promise<Response> {
  const response = await routeRequest(req);
  return compressIfPossible(req, response);
}

async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Health check endpoint (always public)
  if (path === "/health") {
    return new Response("OK", { status: 200 });
  }

  // Block direct signup - only allow via invite tokens
  if (path === "/api/auth/sign-up/email") {
    return new Response("Signup disabled. Use an invitation link.", { status: 403 });
  }

  // Handle Better Auth routes
  if (path.startsWith("/api/auth")) {
    return auth.handler(req);
  }

  // Handle login page
  if (path === "/login") {
    if (method === "GET") {
      const settings = { ...parseReaderSettings(req.headers.get("cookie")) };
      settings.isKindle = /Kindle|Silk/i.test(req.headers.get("user-agent") || "");
      const error = url.searchParams.get("error");
      const next = safeNext(url.searchParams.get("next"));
      return html(LoginPage({ settings, error: error || undefined, next }));
    }
    
    if (method === "POST") {
      return handleLoginPost(req);
    }
  }

  if (path === "/logout" && method === "POST") {
    return handleLogout(req);
  }

  const inviteMatch = path.match(/^\/invite\/([a-z0-9]+)$/);
  if (inviteMatch) {
    const token = inviteMatch[1];
    const settings = { ...parseReaderSettings(req.headers.get("cookie")) };
    settings.isKindle = /Kindle|Silk/i.test(req.headers.get("user-agent") || "");
    
    if (!isInvitationValid(token)) {
      return html(InviteExpiredPage({ settings }), 410);
    }
    
    const invitation = getInvitationByToken(token);
    if (!invitation) {
      return html(InviteExpiredPage({ settings }), 410);
    }
    
    if (method === "GET") {
      return html(InvitePage({ settings, token, email: invitation.email }));
    }
    
    if (method === "POST") {
      return handleInviteRegister(req, token, invitation.email);
    }
  }

  // Handle theme toggle
  if (path === "/settings/theme" && method === "POST") {
    return handleThemeToggle(req);
  }

  // Check session for protected routes
  type Session = { user: { id: string; role?: string | null } } | null;
  let session: Session = null;
  if (AUTH_ENABLED) {
    // Always identify the caller (public paths like /api/watch/* need the
    // user too — e.g. pair confirm binds token↔user); only the redirect
    // is limited to protected paths.
    session = await getSession(req) as Session;
    if (!session && !isPublicPath(path)) {
      const here = url.pathname + url.search;
      return redirect("/login?next=" + encodeURIComponent(here));
    }
  }

  const userId = session?.user?.id || "anonymous";
  const isAdmin = session?.user?.role === "admin";

  // Clone: parseReaderSettings may return the shared DEFAULT object — never
  // mutate it (a previous version leaked isKindle across requests this way).
  const settings = { ...parseReaderSettings(req.headers.get("cookie")) };
  const ua = req.headers.get("user-agent") || "";
  settings.isKindle = /Kindle|Silk/i.test(ua);
  // No explicit mode saved yet: a source built for images (e.g. comics)
  // starts phones in scrolled mode — paged multicol slices tall panels.
  // Text sources keep paged; an explicit choice always wins.
  if (!settings.mode) {
    const sourceMatch = path.match(/^\/(?:api\/)?read\/([a-z0-9-]+)/);
    const preferred = sourceMatch
      ? getSourceByName(sourceMatch[1])?.defaultMode
      : undefined;
    if (
      preferred === "scrolled" &&
      !settings.isKindle &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    ) {
      settings.mode = "scrolled";
    } else {
      settings.mode = "paged";
    }
  }

  console.log(`${method} ${path}`);

  try {
    // Serve static files from /public/*
    if (path.startsWith("/public/") && (method === "GET" || method === "HEAD")) {
      const response = await serveStatic(path);
      if (response) return response;
      return new Response("Not found", { status: 404 });
    }

    // Legacy font path support (redirect /fonts/* to /public/fonts/*)
    if (path.startsWith("/fonts/") && (method === "GET" || method === "HEAD")) {
      const fontFile = path.replace("/fonts/", "");
      const response = await serveStatic(`/fonts/${fontFile}`);
      if (response) return response;
      return new Response("Font not found", { status: 404 });
    }

    // Feature API routes (before source extraRoutes and core API)
    for (const feature of getFeatures()) {
      const res = feature.apiRoutes ? await feature.apiRoutes({ req, path, url, settings, userId, isAdmin }) : null;
      if (res) return res;
    }

    // Source extraRoutes (ADR-0001 escape hatch) — matched BEFORE the generic
    // source routes so a source can claim exact paths (e.g. EPUB's reader,
    // delete, file-download, and cover routes).
    for (const s of getEnabledSources(userId)) {
      for (const extra of s.extraRoutes || []) {
        const params = extra.match(path, method);
        if (!params) continue;
        const res = await extra.handle(params, { req, path, url, settings, userId, isAdmin });
        if (res) return res;
      }
    }

    // Try API routes
    const apiResponse = await handleApiRoute(req, path, userId, isAdmin);
    if (apiResponse) return apiResponse;

    // Feature page routes
    for (const feature of getFeatures()) {
      const res = feature.pageRoutes ? await feature.pageRoutes({ req, path, url, settings, userId, isAdmin }) : null;
      if (res) return res;
    }

    // Try page routes
    const pageResponse = await handlePageRoute(req, path, url, settings, userId, isAdmin);
    if (pageResponse) return pageResponse;

    // 404
    return html(
      ErrorPage({ title: "Not Found", message: "The page you're looking for doesn't exist.", settings }),
      404
    );
  } catch (error: any) {
    console.error("Unhandled error:", error);
    return html(
      ErrorPage({ title: "Server Error", message: "An unexpected error occurred. Please try again.", retryUrl: "/", settings }),
      500
    );
  }
}

/**
 * Handle login form POST
 * Since Kindle doesn't support JS, we handle form submission server-side
 */
async function handleLoginPost(req: Request): Promise<Response> {
  const formData = await req.formData();
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return redirect("/login?error=Username and password are required");
  }

  try {
    // Use Better Auth's sign-in endpoint with returnHeaders to get cookies
    const { headers: authHeaders, response: authResponse } = await auth.api.signInUsername({
      body: {
        username,
        password,
      },
      headers: req.headers,
      returnHeaders: true,
    });

    if (authResponse?.token) {
      // Create response with session cookie from Better Auth
      const next = safeNext(formData.get("next") as string | null);
      const redirectResponse = redirect(next || "/");
      
      // Forward the set-cookie header from Better Auth
      const setCookie = authHeaders.get("set-cookie");
      if (setCookie) {
        redirectResponse.headers.set("Set-Cookie", setCookie);
      }
      
      return redirectResponse;
    }

    return redirect("/login?error=Invalid credentials");
  } catch (error: any) {
    console.error("Login error:", error);
    const message = error?.message || "Login failed";
    return redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}

/**
 * Handle logout POST
 */
async function handleLogout(req: Request): Promise<Response> {
  try {
    // Call Better Auth's sign-out endpoint
    await auth.api.signOut({
      headers: req.headers,
    });
  } catch (error) {
    console.error("Logout error:", error);
  }

  // Clear the session cookie and redirect to login
  const response = redirect("/login");
  response.headers.set(
    "Set-Cookie",
    "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  return response;
}

/**
 * Handle theme toggle POST
 */
async function handleThemeToggle(req: Request): Promise<Response> {
  const formData = await req.formData();
  const theme = ((formData.get("theme") as string) || 'light') as ThemeName;
  
  const currentSettings = parseReaderSettings(req.headers.get("cookie"));
  const newSettings = { ...currentSettings, theme, dark: theme === 'dark' };
  
  const response = redirect("/settings");
  response.headers.set(
    "Set-Cookie",
    `reader_settings=${encodeURIComponent(JSON.stringify(newSettings))}; Path=/; SameSite=Lax; Max-Age=31536000`
  );
  return response;
}

async function handleInviteRegister(req: Request, token: string, email: string): Promise<Response> {
  const settings = parseReaderSettings(req.headers.get("cookie"));
  const form = await parseFormData(req);
  
  const username = form.username?.trim();
  const password = form.password;
  const confirmPassword = form.confirmPassword;
  
  if (!username || username.length < 3) {
    return html(InvitePage({ settings, token, email, error: "Username must be at least 3 characters" }));
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return html(InvitePage({ settings, token, email, error: "Username can only contain letters, numbers, underscores, and hyphens" }));
  }
  
  if (!password || password.length < 8) {
    return html(InvitePage({ settings, token, email, error: "Password must be at least 8 characters" }));
  }
  
  if (password !== confirmPassword) {
    return html(InvitePage({ settings, token, email, error: "Passwords do not match" }));
  }
  
  try {
    const response = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: username,
        username,
      },
    });
    
    if (response?.user) {
      markInvitationUsed(token, response.user.id);
      return html(InvitePage({ settings, token, email, success: true }));
    }
    
    return html(InvitePage({ settings, token, email, error: "Failed to create account" }));
  } catch (error: any) {
    console.error("Invite registration error:", error);
    const message = error?.message || error?.body?.message || "Registration failed";
    return html(InvitePage({ settings, token, email, error: message }));
  }
}
