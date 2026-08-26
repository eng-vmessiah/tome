import type { ReaderSettings } from "../../config";
import type { EpubBook } from "./service";
import { DEFAULT_READER_SETTINGS, APP_VERSION } from "../../config";
import {
  TapZones,
  PageIndicator,
  ReaderNav,
  SettingsModal,
} from "../../templates/reader-components";

export function EpubReaderPage({
  book,
  settings = DEFAULT_READER_SETTINGS,
}: {
  book: EpubBook;
  settings?: ReaderSettings;
}): JSX.Element {
  const bodyClass = settings.dark ? "dark-mode" : "";
  const kindleClass = settings.isKindle ? "kindle" : "";
  const themeBodyClass = [bodyClass, kindleClass].filter(Boolean).join(" ");
  const fontSizeStyle = `font-size: ${settings.font}px;`;
  const lineHeight = settings.lineHeight || 1.6;
  const activeTheme = settings.theme || (settings.dark ? 'dark' : 'light');

  return (
    <>
      {"<!DOCTYPE html>"}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title safe>{book.title} - Tome</title>
          <link rel="stylesheet" href={`/public/css/epub-reader.css?v=${APP_VERSION}`} />
          <link rel="icon" type="image/x-icon" href="/public/favicon.ico" />
          <link rel="icon" type="image/png" sizes="16x16" href="/public/favicon-16x16.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32x32.png" />
          <link rel="apple-touch-icon" href="/public/apple-touch-icon.png" />
        </head>
        <body class={themeBodyClass || undefined}>
          <header class="epub-header">
            <div class="header-left">
              <span class="remote-icon" id="remote-icon" style="display: none;">Remote</span>
              <a href="/read/epub/library" class="back-btn">← Library</a>
              <h1 class="book-title" safe>{book.title}</h1>
              {book.author && <span class="book-author" safe>{book.author as string}</span>}
            </div>
            <div class="header-right">
              <span class="progress-display">{book.progress}%</span>
              <button class="settings-btn">Aa</button>
            </div>
          </header>

          <div 
            class="epub-wrapper"
            data-book-id={book.id}
            data-cfi={book.cfi || ""}
            data-progress={book.progress}
            data-line-height={lineHeight}
          >
            <TapZones />
            <div id="epub-container" class="epub-container" style={fontSizeStyle}></div>
            <div class="epub-loading">Loading...</div>
          </div>

          <PageIndicator dynamic />

          <ReaderNav
            prevLabel="← Prev"
            nextLabel="Next →"
            indexLabel="Library"
            indexHref="/read/epub/library"
            prevAttrs={{ disabled: true }}
            nextAttrs={{ disabled: true }}
          />

          <SettingsModal fontSizeDisplay={settings.font + "px"}>
            <div class="settings-row">
              <label>Line Spacing</label>
              <div class="line-controls">
                <button class="line-decrease">-</button>
                <span class="line-height-display" safe>{lineHeight.toFixed(1)}</span>
                <button class="line-increase">+</button>
              </div>
            </div>
            <div class="settings-row">
              <label>Theme</label>
              <div class="theme-controls">
                <button class={"theme-btn theme-light" + (activeTheme === "light" ? " active" : "")} data-theme="light">Light</button>
                <button class={"theme-btn theme-dark" + (activeTheme === "dark" ? " active" : "")} data-theme="dark">Dark</button>
                {!settings.isKindle && (
                  <button class={"theme-btn theme-sepia" + (activeTheme === "sepia" ? " active" : "")} data-theme="sepia">Sepia</button>
                )}
              </div>
            </div>
          </SettingsModal>

          <div class="delete-modal">
            <div class="delete-panel">
              <h2>Delete Book?</h2>
              <p>Are you sure you want to remove this book from your library?</p>
              <div class="delete-actions">
                <button class="btn btn-outline delete-cancel">Cancel</button>
                <form method="POST" action={`/read/epub/${book.id}/delete`} style="display: inline;">
                  <button type="submit" class="btn delete-confirm">Delete</button>
                </form>
              </div>
            </div>
          </div>

          <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"></script>
          <script src={`/public/js/remote-client.js?v=${APP_VERSION}`}></script>
          <script src={`/public/js/epub-reader.js?v=${APP_VERSION}`}></script>
        </body>
      </html>
    </>
  );
}
