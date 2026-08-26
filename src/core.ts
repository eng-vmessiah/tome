/**
 * Tome library entry — what plugins (TOME_PLUGINS packages) import from "tome".
 *
 * Exposes the Source/Feature contracts plus the shared runtime pieces plugins
 * need (cache, config, registries). Kept dependency-free so plugin installs
 * don't drag in the app's deps.
 */
// Config
export {
  PORT,
  TOME_PLUGINS,
  AUTH_USERNAME,
  AUTH_PASSWORD,
  AUTH_ENABLED,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  CACHE_TTL,
  ITEMS_PER_PAGE,
  CHAPTERS_PER_PAGE,
  DB_PATH,
  DEFAULT_READER_SETTINGS,
  APP_VERSION,
} from "./config";
export type {
  ThemeName,
  ReaderSettings,
} from "./config";

// Cache (shared by sources for scraping caches)
export {
  getCache,
  setCache,
  deleteCache,
  isCached,
  clearCache,
  clearExpiredCache,
  clearCacheByType,
  getImageCache,
  setImageCache,
  clearImageCache,
  getCacheStats,
} from "./services/cache";
export type { CacheStats } from "./services/cache";

// Source registry
export {
  registerSource,
  getAllSources,
  getSourceByName,
  isSourceEnabled,
  setSourceEnabled,
  getEnabledSources,
  getSource,
  getSourceWithCapability,
  getSourcesWithCapability,
} from "./services/source-registry";
export type {
  Source,
  SourceCapabilities,
  CredentialField,
  SourceNavLink,
  SourceRouteContext,
  SourceExtraRoute,
  SourceAutoLogin,
} from "./services/source-registry";

// Feature registry
export {
  registerFeature,
  getFeatures,
  getFeatureIndex,
} from "./services/feature-registry";
export type {
  Feature,
  FeatureRouteContext,
  FeatureWsData,
  FeatureWsPath,
} from "./services/feature-registry";

// Domain types
export type {
  Cookie,
  CacheEntry,
  Fiction,
  FictionStats,
  Chapter,
  ChapterContent,
  FollowedFiction,
  HistoryEntry,
  ToplistType,
  LibraryEntry,
} from "./types";
