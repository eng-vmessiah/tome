/**
 * Source registry
 *
 * Sources register themselves here (see src/sources.ts for the registration
 * list). The registry owns:
 *   - the Source contract (ADR-0001) — capabilities, core trio, capability ops
 *   - per-user enable flags (absorbed from the deleted src/services/sources.ts)
 *
 * getSource(userId, name) returns null when the source is unknown OR disabled
 * for that user, so routes never repeat isSourceEnabled checks.
 */
import { Database } from "bun:sqlite";
import { DB_PATH } from "../config";
import type {
  Fiction,
  FollowedFiction,
  HistoryEntry,
  ChapterContent,
  LibraryEntry,
  ToplistType,
} from "../types";
import type { ReaderSettings } from "../config";

// ============ Types ============

export interface SourceCapabilities {
  search: boolean;
  follows: boolean;
  history: boolean;
  toplists: boolean;
  readLater: boolean;
  bookmarks: boolean;
  library: boolean;
  credentials: boolean;
}

export interface CredentialField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  textarea?: boolean;
}

export interface SourceNavLink {
  href: string;
  label: string;
}

export interface SourceRouteContext {
  req: Request;
  path: string;
  url: URL;
  settings: ReaderSettings;
  userId: string;
  isAdmin: boolean;
}

/**
 * Escape hatch for pages/APIs core doesn't model (ADR-0001). Matched BEFORE
 * the generic source routes so a source can claim exact paths (e.g. EPUB's
 * reader and delete routes).
 */
export interface SourceExtraRoute {
  match(path: string, method: string): string[] | null;
  handle(
    params: string[],
    ctx: SourceRouteContext
  ): Response | null | Promise<Response | null>;
}

export interface SourceAutoLogin {
  enabled: boolean;
  refresh(userId: string): Promise<boolean>;
}

export interface Source {
  /** Machine name; appears in URLs (/read/:source/...). */
  name: string;
  displayName: string;
  description?: string;
  capabilities: SourceCapabilities;
  /** Nav entries shown when the source is enabled (rendered by the header). */
  navLinks: SourceNavLink[];
  /** Toplist definitions when capabilities.toplists is set. */
  toplists?: ToplistType[];
  /** Extra actions shown on the library page (e.g. "Upload EPUB"). */
  libraryActions?: SourceNavLink[];
  /**
   * Preferred reader mode for image-first sources (e.g. comics): when the
   * user saved no explicit mode and the device is a phone, the route starts
   * in this mode instead of paged. Never overrides an explicit choice.
   */
  defaultMode?: "paged" | "scrolled";

  // Core trio (optional: a source without them only serves extraRoutes,
  // e.g. EPUB whose reader is a source-specific page)
  search?(query: string, userId?: string): Promise<Fiction[]>;
  getFiction?(ref: string, userId?: string): Promise<Fiction | null>;
  getChapter?(
    ref: string,
    chapterRef: string,
    userId?: string
  ): Promise<ChapterContent | null>;

  // Capability operations (only meaningful when the matching flag is set)
  getFollows?(userId: string): Promise<FollowedFiction[]>;
  getHistory?(userId: string): Promise<HistoryEntry[]>;
  getReadLater?(userId: string): Promise<Fiction[]>;
  getToplist?(toplist: ToplistType, userId?: string, ttl?: number): Promise<Fiction[]>;
  getToplistCached?(toplist: ToplistType): Fiction[] | null;
  setBookmark?(
    userId: string,
    fictionRef: string,
    type: string,
    mark: boolean,
    csrf: string
  ): Promise<{ success: boolean; error?: string }>;
  getLibrary?(userId: string): Promise<LibraryEntry[]>;
  isInLibrary?(userId: string, ref: string): boolean;
  addToLibrary?(userId: string, ref: string): Promise<void>;
  removeFromLibrary?(userId: string, ref: string): void;
  updateProgress?(
    userId: string,
    fictionRef: string,
    chapterRef: string,
    body?: unknown
  ): Promise<unknown> | unknown;
  canUpload?: boolean;
  upload?(
    userId: string,
    buffer: Buffer,
    filename: string
  ): Promise<{ success: boolean; error?: string }>;

  // Credentials (capabilities.credentials)
  credentialFields?: CredentialField[];
  saveCredentials?(
    userId: string,
    values: Record<string, string>
  ): Promise<{ success: boolean; error?: string; warning?: string }>;
  clearCredentials?(userId: string): Promise<void> | void;
  hasSession?(userId: string): boolean;
  autoLogin?: SourceAutoLogin;

  // Escape hatch for source-specific pages/APIs
  extraRoutes?: SourceExtraRoute[];
}

// ============ Registry state ============

const registeredSources: Source[] = [];

export function registerSource(source: Source): void {
  if (registeredSources.some((s) => s.name === source.name)) {
    throw new Error(`Source "${source.name}" already registered`);
  }
  registeredSources.push(source);
}

/** All registered sources, in registration order. */
export function getAllSources(): Source[] {
  return [...registeredSources];
}

/** Registered source by name, regardless of per-user state. */
export function getSourceByName(name: string): Source | null {
  return registeredSources.find((s) => s.name === name) || null;
}

// ============ Per-user enable flags (absorbed from sources.ts) ============

function getDb(): Database {
  return new Database(DB_PATH);
}

export function isSourceEnabled(userId: string, name: string): boolean {
  const db = getDb();
  try {
    const row = db
      .query(`SELECT enabled FROM user_sources WHERE userId = ? AND source = ?`)
      .get(userId, name) as { enabled: number } | null;
    return row?.enabled === 1;
  } finally {
    db.close();
  }
}

export function setSourceEnabled(userId: string, name: string, enabled: boolean): void {
  const db = getDb();
  try {
    db.run(
      `INSERT INTO user_sources (userId, source, enabled)
       VALUES (?, ?, ?)
       ON CONFLICT(userId, source) DO UPDATE SET enabled = excluded.enabled`,
      [userId, name, enabled ? 1 : 0]
    );
  } finally {
    db.close();
  }
}

/** Sources enabled for the user, in registration order. */
export function getEnabledSources(userId: string): Source[] {
  return registeredSources.filter((s) => isSourceEnabled(userId, s.name));
}

/**
 * Resolve a source for a request. Returns null when the name is unknown OR
 * the user disabled the source — routes treat null as 404.
 *
 * The returned source patches stale chapter nav: chapter rows cache their
 * prev/next for 30 days, so a cached "latest chapter" keeps nextRef=null
 * after a new chapter releases. Fiction rows refresh hourly, so when a
 * chapter claims an edge (null prev/next) its nav is reconciled against the
 * fiction's chapter list (usually a cheap cache hit). Only fills null refs —
 * never overwrites real nav — and degrades to the chapter as-is on failure.
 */
export function getSource(userId: string, name: string): Source | null {
  const source = getSourceByName(name);
  if (!source) return null;
  if (!isSourceEnabled(userId, name)) return null;
  if (!source.getChapter || !source.getFiction) return source;
  const getChapter = source.getChapter.bind(source);
  return {
    ...source,
    getChapter: (ref, chapterRef, uid) =>
      getChapter(ref, chapterRef, uid).then((chapter) =>
        chapter ? patchEdgeNav(source, uid ?? userId, ref, chapterRef, chapter) : chapter
      ),
  };
}

async function patchEdgeNav(
  source: Source,
  userId: string,
  fictionRef: string,
  chapterRef: string,
  chapter: ChapterContent
): Promise<ChapterContent> {
  if (chapter.prevRef && chapter.nextRef) return chapter;
  let chapters: Fiction["chapters"];
  try {
    chapters = (await source.getFiction!(fictionRef, userId))?.chapters;
  } catch {
    return chapter;
  }
  if (!chapters?.length) return chapter;
  const keys = new Set(
    [chapterRef, chapter.ref, String(chapter.id), chapter.chapterSlug].filter(Boolean) as string[]
  );
  const idx = chapters.findIndex((c) => keys.has(String(c.id)) || (c.slug != null && keys.has(c.slug)));
  if (idx < 0) return chapter;
  // Stay in the same ref space the URL used (numeric id vs slug).
  const bySlug = chapters[idx].slug != null && keys.has(chapters[idx].slug as string);
  const refOf = (c: { id: number; slug?: string }) => (bySlug && c.slug ? c.slug : String(c.id));
  if (!chapter.prevRef && idx > 0) chapter.prevRef = refOf(chapters[idx - 1]);
  if (!chapter.nextRef && idx < chapters.length - 1) chapter.nextRef = refOf(chapters[idx + 1]);
  return chapter;
}

/** First enabled source with the given capability, or null. */
export function getSourceWithCapability(
  userId: string,
  capability: keyof SourceCapabilities
): Source | null {
  return getEnabledSources(userId).find((s) => s.capabilities[capability]) || null;
}

/** Enabled sources with the given capability, in registration order. */
export function getSourcesWithCapability(
  userId: string,
  capability: keyof SourceCapabilities
): Source[] {
  return getEnabledSources(userId).filter((s) => s.capabilities[capability]);
}
