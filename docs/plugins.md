# Writing a Tome plugin

A Tome plugin is an npm package loaded at startup via `TOME_PLUGINS`. Two kinds of plugins exist:

- **Source** — feeds `/read/:source/...` with fiction content (search, chapters, libraries, credentials).
- **Feature** — contributes routes, WebSocket paths, background jobs, and DB migrations (remote control is the reference feature).

The fastest way to start is to clone the example repo and adapt it:

```bash
git clone https://github.com/nmessias/tome-source-example
```

## Anatomy of a package

```
tome-source-example/
  package.json        # name, exports → src/index.ts, deps: linkedom (if scraping), tome
  tsconfig.json       # moduleResolution: bundler; types: ["bun-types"]
  src/
    index.ts          # exports { source, feature }
    source.ts         # the Source implementation
    scraper.ts        # whatever fetching/parsing your source needs
    migrations.ts     # optional: CREATE TABLE statements
```

`package.json` must:

- `"name"` — the machine name used in `TOME_PLUGINS` (doesn't have to match the source name).
- `"type": "module"`, `"main"`/`"exports"` pointing at `src/index.ts` (Bun runs TypeScript directly; no build step).
- depend on `tome` (types + shared runtime: cache, config, registries) — `"tome": "github:nmessias/tome"` until it's published, then `"tome": "^1.5.0"`.
- depend on `linkedom` if you parse HTML.

`src/index.ts` exports a `source` and/or a `feature`:

```ts
import type { Feature, Source } from "tome";
import { source } from "./source";

const feature: Feature = { name: "example", migrations: undefined };
export { source, feature };
```

## The Source contract

Import `Source` from `"tome"`. A source must provide:

| Field | Meaning |
|---|---|
| `name` | Machine name, appears in URLs (`/read/<name>/...`). Lowercase, URL-safe. |
| `displayName` | Human name shown in nav/settings. |
| `capabilities` | Which capability ops are implemented (see below). |
| `navLinks` | Header links shown when the source is enabled. |
| `defaultMode` | `"scrolled"` for image-first sources (comics): phones with no saved mode start scrolled. Omit for text (paged). |

### Core trio

```ts
search?(query: string, userId?: string): Promise<Fiction[]>;
getFiction?(ref: string, userId?: string): Promise<Fiction | null>;
getChapter?(ref: string, chapterRef: string, userId?: string): Promise<ChapterContent | null>;
```

- **Refs are opaque strings.** Your source owns their format; they appear verbatim in URLs (`/read/<name>/<fictionRef>/<chapterRef>`). The `Fiction.slug ?? String(fiction.id)` convention is a suggestion, not a requirement.
- Return `null` for "not found" — the route renders a 404.
- `ChapterContent` carries navigation: set `prevRef`/`nextRef` (opaque chapter refs) and `fictionRef` — the unified reader uses them for prev/next links. If your scraper produces absolute URLs, extract the refs yourself (see the royalroad plugin's `normalizeChapter`).

### Capability operations

Only implement what your source can do, and set the matching flag. Routes for a capability your source doesn't declare return 404.

| Capability | Operation | Route |
|---|---|---|
| `search` | `search` | `/read/:source/search` |
| `follows` | `getFollows(userId)` | `/read/:source/follows` |
| `history` | `getHistory(userId)` | `/read/:source/history` |
| `readLater` | `getReadLater(userId)` | `/read/:source/read-later` |
| `toplists` | `getToplist(toplist, userId, ttl?)`, optional `getToplistCached(toplist)`, `toplists: ToplistType[]` | `/read/:source/toplists[/:slug]` |
| `bookmarks` | `setBookmark(userId, fictionRef, type, mark, csrf)` | POST `/read/:source/:fictionRef/bookmark` |
| `library` | `getLibrary(userId) → LibraryEntry[]`, `addToLibrary`, `removeFromLibrary`, optional `isInLibrary`, `updateProgress` | `/read/:source/library`, POST `/read/:source/:fictionRef/library` |
| `credentials` | `credentialFields: CredentialField[]`, `saveCredentials`, `clearCredentials`, `hasSession`, optional `autoLogin` | Settings page renders the form from `credentialFields` |

`Fiction.isInLibrary` (set by `getFiction`) renders the add/remove button on the fiction page; `Fiction.continueChapterId`/`continueChapterSlug`/`continueChapterLabel` drive the Continue button.

### Progress tracking

The unified reader POSTs `/api/read/:source/:fictionRef/:chapterRef` when the page has `data-track-progress` (true when you implement `updateProgress`). Your `updateProgress(userId, fictionRef, chapterRef, body)` decides what that means: mark-as-read (royalroad re-fetches the chapter authenticated), update a local progress table (freewebnovel), or save a CFI (epub).

### Extra routes (escape hatch)

If core doesn't model a page your source needs (e.g. EPUB's reader), claim exact paths with `extraRoutes`:

```ts
extraRoutes: [{
  match(path, method) { /* return params array or null */ },
  handle(params, ctx) { /* return Response or null to fall through */ },
}]
```

They are matched before the generic source routes, for every enabled source.

## The Feature contract

```ts
interface Feature {
  name: string;
  pageRoutes?(ctx): Promise<Response | null>;
  apiRoutes?(ctx): Promise<Response | null>;
  wsPaths?: { match(path, url); upgrade(req, server, params); open?; message?; close? }[];
  migrations?(db: Database): void;
  start?(): void | Promise<void>;   // background work on boot
  stop?(): void | Promise<void>;    // shutdown hook
}
```

Return `null` from a route handler to fall through to the next route. See `src/features/remote/` in core for the reference feature (routes + WS + sessions).

## Migrations

Core runs `runMigrations()` at startup and calls every registered feature's `migrations(db)` after the core tables exist. Create your tables with `CREATE TABLE IF NOT EXISTS`. The DB handle is `bun:sqlite`; the path is `DB_PATH` from `"tome"`.

## Environment and credentials

Read your own env vars (`process.env.X`) — do not add them to core's `.env.example`. If your source needs per-user secrets (cookies, tokens), store them via the credentials tables (`user_source_credentials` — see the royalroad plugin's `credentials.ts`) and expose a form through `credentialFields`.

## Testing against core types

```bash
bun install          # installs tome (types) + deps
bun run typecheck    # tsc --noEmit against the Source/Feature contracts
```

To smoke-test against a running instance:

```bash
bun add /path/to/your-plugin        # or the git URL
echo 'TOME_PLUGINS=your-plugin-name' >> .env
bun run dev
```

Then: open `/read/<name>` (source home), `/read/<name>/search`, settings → enable the source, and walk a fiction → chapter → prev/next. Boundary cases reviewers will check: source disabled → 404; unknown source name → 404; capability route on a source without the capability → 404; `getFiction`/`getChapter` returning null → 404.

## Publishing checklist

1. `package.json`: name, description, repository, license (MIT), keywords (`tome`, `source`).
2. README with install + config env vars.
3. LICENSE file.
4. `bun run typecheck` passes.
5. Smoke test against a local Tome instance (above).
6. Publish: `npm publish` (or `bun publish`). Each plugin repo ships a GitHub Action (`.github/workflows/publish.yml`) that runs typecheck + tests and publishes on `v*` tags — add the `NPM_TOKEN` secret to the repo, then `git tag v1.0.0 && git push --tags`.

After publishing, tell users:

```bash
bun add your-plugin
TOME_PLUGINS=your-plugin
```

## Reference plugins

- [tome-source-royalroad](https://github.com/nmessias/tome-source-royalroad) — full capability surface, credentials + auto-login, Playwright fallback, feature with background jobs and migrations.
- [tome-source-freewebnovel](https://github.com/nmessias/tome-source-freewebnovel) — stateless HTTP scraping + local library feature.
- [tome-source-example](https://github.com/nmessias/tome-source-example) — trivial static source, minimal copy-paste start.
- Core's `src/sources/epub.ts` — the reference adapter that lives in core.
