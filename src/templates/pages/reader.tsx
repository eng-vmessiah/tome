/**
 * Unified chapter reader page (ADR-0002)
 * Uses SPA-style navigation with click-based pagination.
 */
import { ReaderLayout } from "../layout";
import type { ChapterContent } from "../../types";
import type { ReaderSettings } from "../../config";
import { DEFAULT_READER_SETTINGS } from "../../config";
import type { Source } from "../../services/source-registry";
import {
  ReaderHeader,
  TapZones,
  PageIndicator,
  ReaderNav,
  SettingsModal,
  ProgressBar,
  ModeSelector,
  ScrollSmoothSelector,
} from "../reader-components";

/**
 * Chapter reader page - paginated for e-ink (SPA-style navigation)
 */
export function ReaderPage({
  chapter,
  source,
  fictionRef,
  settings = DEFAULT_READER_SETTINGS,
  initialPage = 1,
  trackProgress = false,
}: {
  chapter: ChapterContent;
  source: Source;
  fictionRef: string;
  settings?: ReaderSettings;
  initialPage?: number;
  trackProgress?: boolean;
}): JSX.Element {
  const prevRef = chapter.prevRef || "";
  const nextRef = chapter.nextRef || "";
  const readingWidth = settings.readingWidth || 650;
  const fontSizeStyle = `font-size: ${settings.font}px; line-height: ${settings.lineHeight || 1.6}; max-width: ${readingWidth}px;`;
  const indexHref = `/read/${source.name}/${fictionRef}`;
  const navLinks = [
    { href: "/", label: "Home" },
    ...source.navLinks,
  ];

  return (
    <ReaderLayout title={chapter.title} settings={settings} initialPage={initialPage}>
      <ProgressBar />
      <ReaderHeader
        title={chapter.title}
        subtitle={
          chapter.fictionTitle ? (
            <a href={indexHref} class="fiction-link" safe>
              {chapter.fictionTitle}
            </a>
          ) : undefined
        }
        navLinks={navLinks}
      />

      <div
        class="reader-wrapper"
        data-source={source.name}
        data-fiction-ref={fictionRef}
        data-chapter-ref={chapter.ref ?? ""}
        data-track-progress={trackProgress ? "1" : undefined}
      >
        <TapZones />
        <div class="reader-content" style={fontSizeStyle}>
          {chapter.content as "safe"}
        </div>
      </div>

      <PageIndicator />

      <ReaderNav
        indexLabel="Index"
        indexHref={indexHref}
        prevAttrs={{
          "data-ref": prevRef || "",
          disabled: !prevRef,
        }}
        nextAttrs={{
          "data-ref": nextRef || "",
          disabled: !nextRef,
        }}
      />

      <SettingsModal
        fontSizeDisplay={settings.font + "px"}
        lineHeightDisplay={(settings.lineHeight || 1.6).toFixed(1)}
        dark={settings.dark}
        theme={settings.theme}
        isKindle={settings.isKindle}
        readingWidth={settings.readingWidth || 650}
      >
        <ModeSelector mode={settings.mode ?? "paged"} />
        <ScrollSmoothSelector />
      </SettingsModal>
    </ReaderLayout>
  );
}
