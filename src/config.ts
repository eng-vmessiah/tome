/**
 * Application configuration
 * Environment variables take precedence over defaults
 */

// Server configuration
export const PORT = parseInt(process.env.PORT || "3000", 10);

// Plugins (Phase 3): comma-separated npm package names loaded at startup.
// Each package exports a `source` (Source) and/or `feature` (Feature).
export const TOME_PLUGINS = (process.env.TOME_PLUGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Authentication (for production deployment)
export const AUTH_USERNAME = process.env.AUTH_USERNAME || "";
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
export const AUTH_ENABLED = !!(AUTH_USERNAME && AUTH_PASSWORD);
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "";

// Public base URL for auth callbacks/invite links (set behind a reverse proxy).
// When unset, Better Auth derives the origin from the incoming request, which
// breaks callback/invite URLs behind a proxy (see BETTER_AUTH_URL).
export const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "";

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  DEFAULT: 5 * 60,               // 5 minutes (generic cache)
  FOLLOWS: 20 * 60,              // 20 minutes
  TOPLIST: 6 * 60 * 60,          // 6 hours
  FICTION: 60 * 60,              // 1 hour
  CHAPTER: 30 * 24 * 60 * 60,    // 30 days
  IMAGE: 30 * 24 * 60 * 60,      // 30 days
} as const;

// Pagination
export const ITEMS_PER_PAGE = 100;
export const CHAPTERS_PER_PAGE = 20;

// Database
export const DB_PATH = "./data/sessions.db";

// Reader settings
export type ThemeName = 'light' | 'dark' | 'sepia';
export type ReaderMode = 'paged' | 'scrolled';

export interface ReaderSettings {
  dark: boolean;
  theme?: ThemeName;
  font: number;
  lineHeight?: number;
  readingWidth?: number;
  isKindle?: boolean;
  mode?: ReaderMode;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  dark: false,
  theme: 'light',
  font: 18,
  lineHeight: 1.6,
  readingWidth: 650,
  isKindle: false,
  // mode intentionally absent: the route applies a device default
  // (scrolled on phones, paged on e-ink) when the user saved none.
};

// App version for cache busting
export const APP_VERSION = "1.5.8-dev";
