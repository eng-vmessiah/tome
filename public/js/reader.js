/**
 * Reader for Kindle e-ink — Phase 1: unified /read/:source/... scheme (ADR-0002).
 * One navigation format for every source; source identity comes from the
 * wrapper's data attributes, never from URL forks.
 * ES5 compatible, optimized for e-ink performance
 */
(function() {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================

  var S = {
    // DOM elements (cached on init)
    els: {},
    // Pagination
    page: 0,
    totalPages: 1,
    totalPagesStr: ' / 1',
    stepSize: 0,
    // UI visibility
    uiVisible: false,
    resizeTimeout: null,
    urlTimeout: null,
    // Font settings
    fontSizes: [14, 16, 18, 20, 22, 24, 28, 32],
    fontIndex: 2,
    // Line height settings
    lineHeights: [1.2, 1.4, 1.6, 1.8, 2.0, 2.4],
    lineHeightIndex: 2,
    // Desktop mode
    isDesktop: false,
    // View mode: 'paged' (column-flip) or 'scrolled' (continuous)
    mode: 'paged',
    // SPA navigation (unified scheme)
    cache: {},
    source: null,       // source machine name from the wrapper's data-source
    fictionRef: null,   // fiction ref as it appears in /read/:source/:fictionRef
    chapterRef: null,   // current chapter ref
    trackProgress: false,
    // E-ink refresh (prevents ghosting)
  };

  // ============================================================
  // STORAGE
  // ============================================================

  function setCookie(name, value) {
    var d = new Date();
    d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/';
  }

  function saveSettings() {
    var theme = 'light';
    if (document.body.classList.contains('dark-mode')) theme = 'dark';
    else if (document.body.classList.contains('sepia-mode')) theme = 'sepia';
    
    var settings = JSON.stringify({
      font: S.fontSizes[S.fontIndex],
      lineHeight: S.lineHeights[S.lineHeightIndex],
      dark: theme === 'dark',
      theme: theme,
      readingWidth: S.widths[S.widthIndex],
      mode: S.mode
    });
    setCookie('reader_settings', settings);
    try {
      localStorage.setItem('readerFontSize', S.fontSizes[S.fontIndex]);
    } catch (e) {}
  }

  // ============================================================
  // UI VISIBILITY
  // ============================================================

  function setUI(visible) {
    if (visible === S.uiVisible) return;
    S.uiVisible = visible;
    
    if (visible) {
      S.els.header.classList.add('visible');
      S.els.footer.classList.add('visible');
    } else {
      S.els.header.classList.remove('visible');
      S.els.footer.classList.remove('visible');
    }
  }

  function toggleUI() {
    setUI(!S.uiVisible);
  }

  // ============================================================
  // FONT SIZE
  // ============================================================

  function detectFontSize() {
    var style = S.els.content.style.fontSize;
    if (style) {
      var size = parseInt(style, 10);
      for (var i = 0; i < S.fontSizes.length; i++) {
        if (S.fontSizes[i] === size) {
          S.fontIndex = i;
          return;
        }
      }
    }
    var lh = S.els.content.style.lineHeight;
    if (lh) {
      var lhVal = parseFloat(lh);
      for (var i = 0; i < S.lineHeights.length; i++) {
        if (S.lineHeights[i] === lhVal) {
          S.lineHeightIndex = i;
          break;
        }
      }
    }
  }

  function applyFontSize() {
    S.els.content.style.fontSize = S.fontSizes[S.fontIndex] + 'px';
    
    var display = document.querySelector('.font-size-display');
    if (display) display.textContent = S.fontSizes[S.fontIndex] + 'px';
    
    saveSettings();
    
    setTimeout(function() {
      updatePages();
      goToPage(0);
    }, 100);
  }

  function changeFontSize(delta) {
    var newIndex = S.fontIndex + delta;
    if (newIndex >= 0 && newIndex < S.fontSizes.length) {
      S.fontIndex = newIndex;
      applyFontSize();
    }
  }

  // ============================================================
  // SETTINGS MODAL
  // ============================================================

  function openModal(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    S.els.modal.classList.add('open');
  }

  function closeModal() {
    S.els.modal.classList.remove('open');
  }

  // ============================================================
  // DESKTOP MODE
  // ============================================================

  function checkDesktop() {
    return window.innerWidth >= 768;
  }

  function updateDesktopProgress() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    var bar = document.querySelector('.progress-bar');
    if (bar) bar.style.width = Math.min(progress, 100) + '%';
  }

  function updateProgressBar() {
    if (S.isDesktop) {
      updateDesktopProgress();
      return;
    }
    var bar = document.querySelector('.progress-bar');
    if (bar && S.totalPages > 0) {
      bar.style.width = ((S.page + 1) / S.totalPages * 100) + '%';
    }
  }

  // ============================================================
  // LINE HEIGHT
  // ============================================================

  function applyLineHeight() {
    var height = S.lineHeights[S.lineHeightIndex];
    S.els.content.style.lineHeight = '' + height;
    var display = document.querySelector('.line-height-display');
    if (display) display.textContent = height.toFixed(1);
    saveSettings();
    if (!S.isDesktop) {
      setTimeout(function() {
        updatePages();
        goToPage(0);
      }, 100);
    }
  }

  function changeLineHeight(delta) {
    var newIndex = S.lineHeightIndex + delta;
    if (newIndex >= 0 && newIndex < S.lineHeights.length) {
      S.lineHeightIndex = newIndex;
      applyLineHeight();
    }
  }

  // ============================================================
  // THEME
  // ============================================================

  function setTheme(theme) {
    document.body.classList.remove('dark-mode', 'sepia-mode');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else if (theme === 'sepia') {
      document.body.classList.add('sepia-mode');
    }
    var btns = document.querySelectorAll('.theme-btn[data-theme]');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].getAttribute('data-theme');
      btns[i].classList.toggle('active', t === theme);
    }
    saveSettings();
  }

  // ============================================================
  // READING WIDTH
  // ============================================================

  S.widths = [480, 520, 560, 600, 650, 700, 750, 800, 900, 1000, 1200];
  S.widthIndex = 4; // default 650px

  function applyReadingWidth() {
    var width = S.widths[S.widthIndex];
    S.els.content.style.maxWidth = width + 'px';
    var display = document.querySelector('.width-display');
    if (display) display.textContent = width + 'px';
    saveSettings();
  }

  function changeReadingWidth(delta) {
    var newIndex = S.widthIndex + delta;
    if (newIndex >= 0 && newIndex < S.widths.length) {
      S.widthIndex = newIndex;
      applyReadingWidth();
    }
  }

  function detectReadingWidth() {
    var maxWidth = parseInt(S.els.content.style.maxWidth, 10);
    if (maxWidth) {
      for (var i = 0; i < S.widths.length; i++) {
        if (S.widths[i] === maxWidth) {
          S.widthIndex = i;
          return;
        }
      }
      // Find closest match
      var closest = 0;
      var minDiff = Math.abs(S.widths[0] - maxWidth);
      for (var i = 1; i < S.widths.length; i++) {
        var diff = Math.abs(S.widths[i] - maxWidth);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      }
      S.widthIndex = closest;
    }
  }

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================

  function handleKeyboard(e) {
    if (S.els.modal && S.els.modal.classList.contains('open')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (S.isDesktop || S.mode === 'scrolled') {
      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          var prevRef = S.els.navPrev && S.els.navPrev.getAttribute('data-ref');
          if (prevRef) navigateToChapter(prevRef, true);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          var nextRef = S.els.navNext && S.els.navNext.getAttribute('data-ref');
          if (nextRef) navigateToChapter(nextRef, false);
          break;
        }
        case 'ArrowDown':
          e.preventDefault();
          window.scrollBy({ top: 60, behavior: 'instant' });
          break;
        case 'ArrowUp':
          e.preventDefault();
          window.scrollBy({ top: -60, behavior: 'instant' });
          break;
        case ' ':
        case 'PageDown':
          e.preventDefault();
          scrollScreen(1);
          break;
        case 'PageUp':
          e.preventDefault();
          scrollScreen(-1);
          break;
        case 'Home':
          e.preventDefault();
          window.scrollTo(0, 0);
          break;
        case 'End':
          e.preventDefault();
          window.scrollTo(0, document.documentElement.scrollHeight);
          break;
      }
    } else {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          nextPage();
          break;
      }
    }
  }

  // ============================================================
  // VIEW MODE (paginated vs scrolled)
  // ============================================================

  function detectMode() {
    S.mode = document.body.classList.contains('scrolled-mode') ? 'scrolled' : 'paged';
  }

  function applyMode() {
    var scrolled = S.mode === 'scrolled';
    document.body.classList.toggle('scrolled-mode', scrolled);
    if (scrolled) {
      // Drop the paged-geometry pin so the scrolled CSS rules take over
      var style = S.els.content.style;
      style.width = '';
      style.columnWidth = '';
      style.columnGap = '';
      S.els.content.classList.add('ready');
      updateDesktopProgress();
    } else {
      updatePages();
      goToPage(S.page);
    }
    var btns = document.querySelectorAll('.mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === S.mode);
    }
    // Scroll-feel pills: selection + visibility follow the mode
    syncScrollFeel();
    saveSettings();
  }

  function changeMode(mode) {
    if (mode === S.mode) return;
    S.mode = mode;
    applyMode();
  }

  // ============================================================
  // SMOOTH SCROLL (watch / keyboard in scrolled mode)
  // ============================================================
  // Distance: fraction of a screen; motion persisted per device via
  // localStorage 'tome_scroll_smooth': off (instant) | smooth (default) | glide.
  // NOTE: these live at IIFE scope because applyMode()/init() both use them.
  function scrollSmoothness() {
    var s = 'smooth';
    try { s = localStorage.getItem('tome_scroll_smooth') || 'smooth'; } catch (e) { s = 'smooth'; }
    if (s === 'suave') s = 'smooth'; // legacy value from the first release
    if (s === 'vivo') s = 'glide';
    return s;
  }

  function stepFromPrefs() {
    var s = scrollSmoothness();
    if (s === 'glide') return window.innerHeight * 1.15;
    if (s === 'off') return window.innerHeight * 0.85;
    return window.innerHeight * 0.8;
  }

  function getScrollY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function raf(fn) {
    if (window.requestAnimationFrame) { requestAnimationFrame(fn); }
    else { setTimeout(function() { fn(Date.now()); }, 16); }
  }

  var scrollAnimSeq = 0;
  function scrollAnim(targetY, ms) {
    var seq = ++scrollAnimSeq;
    var startY = getScrollY();
    var delta = targetY - startY;
    if (Math.abs(delta) < 2) return;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var ease = function(t) { // cubic in-out
      return (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };
    var frame = function(now) {
      if (seq !== scrollAnimSeq) return; // superseded by a newer target
      var t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, Math.round(startY + delta * ease(t)));
      if (t < 1) raf(frame);
    };
    raf(frame);
  }

  function maxScrollY() {
    return Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
  }

  /** Fine scroll (bezel/drag): feed a pixel accumulator, glide continuously.
   *  Exponential smoothing (~20%/frame) instead of a per-message eased
   *  animation: batched messages extend the accumulator while it drains, so
   *  start/stop is silky and never restarts mid-flight. The gentler drain
   *  (~0.35s to empty) bridges gaps between bezel batches — a micropausa
   *  in the rub no longer halts the page. */
  var byAccum = 0;
  var byActive = false;
  var byCarry = 0; // fractional px remainder (compositor snaps sub-pixel targets)
  function scrollByPx(px) {
    if (!px) return;
    scrollAnimSeq++; // any eased animation yields to the glide
    byAccum += px;
    if (byAccum > 1600) byAccum = 1600; else if (byAccum < -1600) byAccum = -1600;
    if (!byActive) { byActive = true; raf(byFrame); }
  }
  function byFrame() {
    var max = maxScrollY();
    var y = getScrollY();
    // drain the accumulator all the way down (stop at <0.5px, not <4): at ~0.2
    // per frame that coasts ~0.42s — longer than the watch's batched flushes,
    // so consecutive batches overlap and the rub never dead-stops mid-motion.
    if (Math.abs(byAccum) < 0.5) { byAccum = 0; byActive = false; return; }
    var step = byAccum * 0.20;
    if (step > 120) step = 120; else if (step < -120) step = -120;
    byCarry += step;
    var move = byCarry > 0 ? Math.floor(byCarry) : Math.ceil(byCarry);
    if (move === 0) { raf(byFrame); return; } // accumulate toward a whole pixel
    byCarry -= move;
    var target = y + move;
    if (target < 0) target = 0; else if (target > max) target = max;
    window.scrollTo(0, target);
    byAccum -= (target - y);
    if ((target <= 0 && byAccum < 0) || (target >= max && byAccum > 0)) byAccum = 0;
    if (byActive) raf(byFrame);
  }
  function stopByGlide() { byAccum = 0; byActive = false; byCarry = 0; }

  function scrollScreen(dir) {
    stopByGlide();
    var s = scrollSmoothness();
    var step = stepFromPrefs();
    if (s === 'off') {
      window.scrollTo(0, getScrollY() + dir * step);
      return;
    }
    var ms = (s === 'glide') ? 420 : 260;
    scrollAnim(getScrollY() + dir * step, ms);
  }

  // ES5-safe ancestor lookup (no .closest for old Kindle browsers)
  function closestSettingsRow(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('settings-row')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function setScrollSmooth(v) {
    try { localStorage.setItem('tome_scroll_smooth', v); } catch (e) {}
    var all = document.querySelectorAll('.smooth-btn');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('active', all[i].getAttribute('data-smooth') === v);
    }
    saveSettings();
  }

  function syncScrollFeel() {
    var cur = scrollSmoothness();
    var scrolled = document.body.classList.contains('scrolled-mode');
    var btns = document.querySelectorAll('.smooth-btn');
    var row = btns.length ? closestSettingsRow(btns[0]) : null;
    if (row) row.style.display = scrolled ? '' : 'none';
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-smooth') === cur);
    }
  }

  // ============================================================
  // PAGINATION
  // ============================================================

  function updatePages() {
    if (S.isDesktop || S.mode === 'scrolled') {
      updateDesktopProgress();
      return;
    }
    var columnWidth = S.els.content.offsetWidth;
    var columnGap = window.innerWidth * 0.05;
    S.stepSize = columnWidth + columnGap;

    // Pin the multicol geometry to the exact px values we paginate by. If left
    // as vw (95vw/5vw), the used columns are fractional (e.g. 729.6px on a
    // 768px viewport) while offsetWidth rounds to 730 — scrollLeft then drifts
    // a fraction of a px per page turn and the next column creeps in on the
    // right edge after ~15 pages.
    var style = S.els.content.style;
    style.width = columnWidth + 'px';
    style.columnWidth = columnWidth + 'px';
    style.columnGap = columnGap + 'px';
    
    var scrollW = S.els.content.scrollWidth;
    S.totalPages = Math.max(1, Math.round(scrollW / S.stepSize));
    S.totalPagesStr = ' / ' + S.totalPages;
    S.lastGeomW = window.innerWidth;
    
    updateIndicator();
    updateProgressBar();
  }

  function updateIndicator() {
    S.els.indicator.textContent = (S.page + 1) + S.totalPagesStr;
    updateProgressBar();
  }

  function scheduleUrlUpdate() {
    if (S.urlTimeout) clearTimeout(S.urlTimeout);
    S.urlTimeout = setTimeout(updateUrl, 500);
  }

  function updateUrl() {
    if (window.history && window.history.replaceState && S.chapterRef) {
      var newUrl = chapterUrl(S.chapterRef);
      if (S.page > 0) newUrl += '?p=' + (S.page + 1);
      try {
        window.history.replaceState({ source: S.source, fictionRef: S.fictionRef, chapterRef: S.chapterRef, page: S.page }, '', newUrl);
      } catch (e) {}
    }
  }

  /** Unified chapter URL: /read/:source/:fictionRef/:chapterRef */
  function chapterUrl(chapterRef) {
    return '/read/' + encodeURIComponent(S.source) + '/' + encodeURIComponent(S.fictionRef) + '/' + encodeURIComponent(chapterRef);
  }

  /** Unified chapter API URL: /api/read/:source/:fictionRef/:chapterRef */
  function chapterApiUrl(chapterRef) {
    return '/api/read/' + encodeURIComponent(S.source) + '/' + encodeURIComponent(S.fictionRef) + '/' + encodeURIComponent(chapterRef);
  }

  function goToPage(page) {
    if (page < 0) page = 0;
    if (page >= S.totalPages) page = S.totalPages - 1;
    goToPageFast(page);
  }

  function goToPageFast(page) {
    S.page = page;
    S.els.content.scrollLeft = page * S.stepSize;
    updateIndicator();
    scheduleUrlUpdate();
  }

  // ============================================================
  // E-INK REFRESH
  // ============================================================

  function triggerEinkRefresh(callback) {
    // The black-flash clear is an e-ink-only trick; on LCD it is just a
    // 300ms flicker, so skip it unless the server flagged a Kindle UA.
    if (!document.body.classList.contains('kindle')) {
      if (callback) callback();
      return;
    }
    // Flash screen black briefly to clear e-ink ghosting
    document.body.style.backgroundColor = '#000';
    setTimeout(function() {
      document.body.style.backgroundColor = '#fff';
      
      // Stabilization delay: give e-ink time to complete refresh cycle 
      // before rendering new content to prevent light font weights
      setTimeout(function() {
        // Clear the inline bg so the active theme class (dark/sepia) wins again.
        // Leaving #fff here overrides body[.dark-mode]'s #121212/#000 and shows
        // grey letters on white after a chapter turn.
        document.body.style.backgroundColor = '';
        if (callback) callback();
      }, 100);
    }, 100);
  }

  function nextPage() {
    if (S.mode === 'scrolled') {
      window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'instant' });
      return;
    }
    if (S.page < S.totalPages - 1) {
      goToPageFast(S.page + 1);
    } else {
      // At last page, go to next chapter if available
      var nextRef = S.els.navNext && S.els.navNext.getAttribute('data-ref');
      if (nextRef) {
        triggerEinkRefresh(function() {
          navigateToChapter(nextRef, false);
        });
      } else {
        setUI(true);
      }
    }
  }

  function prevPage() {
    if (S.mode === 'scrolled') {
      window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'instant' });
      return;
    }
    if (S.page > 0) {
      goToPageFast(S.page - 1);
    } else {
      // At first page, go to prev chapter (last page) if available
      var prevRef = S.els.navPrev && S.els.navPrev.getAttribute('data-ref');
      if (prevRef) {
        triggerEinkRefresh(function() {
          navigateToChapter(prevRef, true);
        });
      } else {
        setUI(true);
      }
    }
  }

  function getInitialPage() {
    var match = window.location.search.match(/[?&]p=(\d+)/);
    if (match) return Math.max(0, parseInt(match[1], 10) - 1);
    return 0;
  }

  // ============================================================
  // SPA NAVIGATION (unified scheme)
  // ============================================================

  // Bounded SPA chapter cache. Every visited chapter's full HTML used to be
  // held forever (fetchChapter stores, never evicts), and preloadChapters adds
  // prev+next on every chapter — on a long read that is MBs of raw strings
  // piling up in RAM on the Kindle's small heap, which is exactly what turns
  // page flips progressively slower (leak). The SPA only ever renders the
  // current chapter plus its prev/next, so keep a tiny LRU window; anything
  // evicted just falls back to a full page load (navigateToChapter already
  // does that for any ref not in cache).
  var CACHE_LIMIT = 5;
  var CACHE_ORDER = [];

  function rememberChapter(ref, data) {
    S.cache[ref] = data;
    var i = CACHE_ORDER.indexOf(ref);
    if (i !== -1) CACHE_ORDER.splice(i, 1);
    CACHE_ORDER.push(ref);
    while (CACHE_ORDER.length > CACHE_LIMIT) {
      var oldest = CACHE_ORDER.shift();
      delete S.cache[oldest];
    }
  }

  function touchChapter(ref) {
    var i = CACHE_ORDER.indexOf(ref);
    if (i !== -1) {
      CACHE_ORDER.splice(i, 1);
      CACHE_ORDER.push(ref);
    }
  }

  function fetchChapter(chapterRef, callback) {
    if (S.cache[chapterRef]) {
      touchChapter(chapterRef);
      callback(S.cache[chapterRef]);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', chapterApiUrl(chapterRef), true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          rememberChapter(chapterRef, data);
          callback(data);
        } catch (e) {
          callback(null);
        }
      }
    };
    xhr.send();
  }

  // Preload only the NEXT chapter, and only after first paint (see renderChapter
  // / init). Fetching prev too doubles the payload (~190KB) on every chapter nav
  // for a chapter that's normally already sitting in the LRU after a forward
  // flip — and the very first load was racing the 150-column layout with it.
  function preloadChapters() {
    var nextRef = S.els.navNext && S.els.navNext.getAttribute('data-ref');
    if (nextRef && !S.cache[nextRef]) fetchChapter(nextRef, function() {});
  }

  function updateNavButtons(prevRef, nextRef) {
    if (S.els.navPrev) {
      S.els.navPrev.disabled = !prevRef;
      S.els.navPrev.setAttribute('data-ref', prevRef || '');
    }
    if (S.els.navNext) {
      S.els.navNext.disabled = !nextRef;
      S.els.navNext.setAttribute('data-ref', nextRef || '');
    }
  }

  /** Fire-and-forget progress report (mark read / update local progress). */
  function reportProgress(chapterRef) {
    if (!S.trackProgress) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', chapterApiUrl(chapterRef), true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ chapter: chapterRef }));
  }

  function renderChapter(chapter, goToLastPage) {
    // Hide the content until the new chapter is laid out — without this the
    // partially-laid-out multicol block (old geometry, new content) is visible
    // during the swap and the Kindle repaints the whole fragment 2-3 times.
    S.els.content.classList.remove('ready');

    S.els.content.innerHTML = chapter.content;
    
    if (S.els.titleEl) S.els.titleEl.textContent = chapter.title;
    document.title = chapter.title + ' - Tome';
    
    S.chapterRef = chapter.ref || S.chapterRef;
    
    updateNavButtons(chapter.prevRef, chapter.nextRef);
    
    S.page = 0;
    if (S.isDesktop || S.mode === 'scrolled') {
      window.scrollTo(0, 0);
    } else {
      S.els.content.scrollLeft = 0;
    }
    
    setTimeout(function() {
      updatePages();
      if (!S.isDesktop && goToLastPage && S.totalPages > 1) {
        goToPage(S.totalPages - 1);
      }
      S.els.content.classList.add('ready');
      preloadChapters();
    }, 100);
  }

  function navigateToChapter(chapterRef, goToLastPage) {
    var chapter = S.cache[chapterRef];
    
    if (!chapter) {
      // Not cached — full page load
      window.location.href = chapterUrl(chapterRef);
      return;
    }
    
    reportProgress(chapterRef);
    
    // Render chapter
    renderChapter(chapter, goToLastPage);
    
    // Update URL with replaceState. Chapter content is re-rendered in place and
    // page position is replaceState'd on every turn, so pushState per chapter
    // only piles up an unbounded history stack (N back-presses to leave the
    // book) that can keep stale render trees alive on a small heap.
    if (window.history && window.history.replaceState) {
      try {
        window.history.replaceState({ source: S.source, fictionRef: S.fictionRef, chapterRef: S.chapterRef, page: 0 }, '', chapterUrl(S.chapterRef));
      } catch (e) {}
    }
  }

  function onPopState(e) {
    if (!e.state) return;
    
    var chapterRef = e.state.chapterRef;
    var page = e.state.page || 0;
    
    if (!chapterRef) return;
    
    var chapter = S.cache[chapterRef];
    if (chapter) {
      renderChapter(chapter, false);
      if (page > 0) {
        setTimeout(function() { goToPage(page); }, 150);
      }
    } else {
      var url = chapterUrl(chapterRef);
      if (page > 0) url += '?p=' + (page + 1);
      window.location.href = url;
    }
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function cacheElements() {
    var els = S.els;
    
    els.content = document.querySelector('.reader-content');
    els.indicator = document.querySelector('.page-indicator');
    els.header = document.querySelector('.reader-header');
    els.footer = document.querySelector('.nav-fixed');
    els.wrapper = document.querySelector('.reader-wrapper');
    els.titleEl = document.querySelector('.chapter-title');
    els.navPrev = document.querySelector('.nav-prev');
    els.navNext = document.querySelector('.nav-next');
    els.modal = document.querySelector('.settings-modal');
    
    // Get current source/refs from the wrapper (unified data attributes)
    if (els.wrapper) {
      S.source = els.wrapper.getAttribute('data-source') || null;
      S.fictionRef = els.wrapper.getAttribute('data-fiction-ref') || null;
      S.chapterRef = els.wrapper.getAttribute('data-chapter-ref') || null;
      S.trackProgress = els.wrapper.getAttribute('data-track-progress') === '1';
    }
    
    // Fallback: detect from unified URL if data attributes weren't set
    if (!S.source || !S.fictionRef) {
      var urlMatch = window.location.pathname.match(/^\/read\/([\w-]+)\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        S.source = urlMatch[1];
        S.fictionRef = urlMatch[2];
        S.chapterRef = S.chapterRef || urlMatch[3];
      }
    }
  }

  function onScroll() {
    if (!S.isDesktop && S.mode !== 'scrolled') return;
    updateDesktopProgress();
  }

  function attachHandlers() {
    var tapTop = document.querySelector('.tap-zone-top');
    var tapBottom = document.querySelector('.tap-zone-bottom');
    if (tapTop) tapTop.onclick = toggleUI;
    if (tapBottom) tapBottom.onclick = toggleUI;
    
    var clickLeft = document.querySelector('.click-zone-left');
    var clickRight = document.querySelector('.click-zone-right');
    if (clickLeft) clickLeft.onclick = prevPage;
    if (clickRight) clickRight.onclick = nextPage;
    
    var settingsBtn = document.querySelector('.settings-btn');
    var settingsClose = document.querySelector('.settings-close');
    
    if (settingsBtn) settingsBtn.onclick = openModal;
    if (settingsClose) settingsClose.onclick = closeModal;
    
    if (S.els.modal) {
      S.els.modal.onclick = function(e) {
        if (e.target === S.els.modal) closeModal();
      };
    }
    
    var fontDecrease = document.querySelector('.font-decrease');
    var fontIncrease = document.querySelector('.font-increase');
    if (fontDecrease) fontDecrease.onclick = function() { changeFontSize(-1); };
    if (fontIncrease) fontIncrease.onclick = function() { changeFontSize(1); };
    
    var lineDecrease = document.querySelector('.line-decrease');
    var lineIncrease = document.querySelector('.line-increase');
    if (lineDecrease) lineDecrease.onclick = function() { changeLineHeight(-1); };
    if (lineIncrease) lineIncrease.onclick = function() { changeLineHeight(1); };
    
    var themeBtns = document.querySelectorAll('.theme-btn[data-theme]');
    for (var i = 0; i < themeBtns.length; i++) {
      (function(btn) {
        btn.onclick = function() {
          setTheme(btn.getAttribute('data-theme'));
        };
      })(themeBtns[i]);
    }
    
    var modeBtns = document.querySelectorAll('.mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      (function(btn) {
        btn.onclick = function() {
          changeMode(btn.getAttribute('data-mode'));
        };
      })(modeBtns[i]);
    }

    var smoothBtns = document.querySelectorAll('.smooth-btn');
    for (var i = 0; i < smoothBtns.length; i++) {
      (function(btn) {
        btn.onclick = function() {
          setScrollSmooth(btn.getAttribute('data-smooth'));
        };
      })(smoothBtns[i]);
    }
    syncScrollFeel();
    
    var widthDecrease = document.querySelector('.width-decrease');
    var widthIncrease = document.querySelector('.width-increase');
    if (widthDecrease) widthDecrease.onclick = function() { changeReadingWidth(-1); };
    if (widthIncrease) widthIncrease.onclick = function() { changeReadingWidth(1); };
    
    
    document.onkeydown = handleKeyboard;
    
    if (S.els.footer) {
      S.els.footer.onclick = function(e) {
        var target = e.target;
        while (target && target.tagName !== 'BUTTON' && target !== S.els.footer) {
          target = target.parentNode;
        }
        if (!target || target.tagName !== 'BUTTON') return;
        
        var ref = target.getAttribute('data-ref');
        if (!ref) return;
        
        var goToLast = target.className.indexOf('nav-prev') !== -1;
        navigateToChapter(ref, goToLast);
      };
    }
    
    window.onpopstate = onPopState;
    
    window.onresize = function() {
      if (S.resizeTimeout) clearTimeout(S.resizeTimeout);
      S.resizeTimeout = setTimeout(function() {
        var wasDesktop = S.isDesktop;
        S.isDesktop = checkDesktop();
        if (S.isDesktop !== wasDesktop) {
          if (S.isDesktop) {
            setUI(false);
          } else {
            updatePages();
            goToPage(0);
          }
        } else if (!S.isDesktop && window.innerWidth !== S.lastGeomW) {
          // Re-paginate only on a real width change (innerWidth drives columnGap).
          // Height-only shifts (toolbar/keyboard chrome) don't change the 150-column
          // layout — re-fragmenting for them is the most expensive no-op the page runs.
          updatePages();
          goToPage(S.page);
        }
        if (S.isDesktop) updateDesktopProgress();
      }, 150);
    };
    
    // One named scroll handler for desktop/scrolled progress tracking; it no-ops
    // in paged mode. Registered once — applyMode must not add more.
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init() {
    cacheElements();
    detectFontSize();
    detectReadingWidth();
    
    S.isDesktop = checkDesktop();
    detectMode();
    
    attachHandlers();
    
    var display = document.querySelector('.font-size-display');
    if (display) display.textContent = S.fontSizes[S.fontIndex] + 'px';
    
    var lhDisplay = document.querySelector('.line-height-display');
    if (lhDisplay) lhDisplay.textContent = S.lineHeights[S.lineHeightIndex].toFixed(1);
    
    var widthDisplay = document.querySelector('.width-display');
    if (widthDisplay) widthDisplay.textContent = S.widths[S.widthIndex] + 'px';
    
    if (S.isDesktop) {
      S.els.content.classList.add('ready');
      updateDesktopProgress();
      preloadChapters();
      return;
    }
    
    if (S.mode === 'scrolled') {
      S.els.content.classList.add('ready');
      updateDesktopProgress();
    }
    
    updatePages();
    var initialPage = window.__INITIAL_PAGE__ ? window.__INITIAL_PAGE__ - 1 : getInitialPage();
    if (initialPage > 0) {
      goToPage(initialPage);
    }
    
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          S.els.content.classList.add('ready');
          preloadChapters();
        });
      });
    } else {
      setTimeout(function() {
        S.els.content.classList.add('ready');
        preloadChapters();
      }, 50);
    }
    

    // WATCH REMOTE (tome-feature-watch) — this page holds a reader WS so the
    // watch companion's POSTed actions reach it. Token from localStorage
    // (stored by /watch/pair after the QR ceremony, or typed in settings).
    // Pair-once: the token persists across tabs/restarts; the server keeps
    // the session in sqlite with sliding expiry. Unpair burns both ends.
    var WATCH_KEY = 'tome_watch_token';
    var watchWs = null;
    function getWatchToken() { try { return localStorage.getItem(WATCH_KEY); } catch (e) { return null; } }
    function setWatchStatus(t) { var el = document.getElementById('watch-status'); if (el) el.textContent = t; }
    function showWatchIcon(show) { var icon = document.getElementById('remote-icon'); if (icon) icon.style.display = show ? 'inline' : 'none'; }

    // Hands-free reading: watch-driven scrolls and page-turns are not touch
    // events, so Android never resets its screen-timeout on them and the
    // screen dims mid-read. While a watch is paired and this page is visible,
    // hold a Screen Wake Lock so the screen stays on. No-op where the API is
    // unavailable (old browsers, insecure origins — needs https or localhost).
    var wakeLock = null;
    function syncWakeLock() {
      var want = !!getWatchToken() && document.visibilityState === 'visible';
      if (want && !wakeLock && navigator.wakeLock && navigator.wakeLock.request) {
        try {
          navigator.wakeLock.request('screen').then(function(lock) {
            if (!getWatchToken()) { try { lock.release(); } catch (e) {} return; } // unpaired while acquiring
            wakeLock = lock;
            lock.addEventListener('release', function() { wakeLock = null; });
          }).catch(function() {});
        } catch (e) {}
      } else if (!want && wakeLock) {
        try { wakeLock.release(); } catch (e) {}
        wakeLock = null;
      }
    }
    // Auto-scroll ("scroll infinito"): continuous reading scroll, toggled by
    // the watch. Stops at chapter end, on any other watch action, or on user
    // touch/wheel/visibility change.
    var autoScrollOn = false;
    var autoScrollLast = 0;
    var autoScrollCarry = 0; // fractional px remainder (see frame fn)
    var AUTO_SCROLL_SPEED = 95; // px/s — default = watch speed 50 (= old 90 pace)
    function autoScrollFrame(now) {
      if (!autoScrollOn) return;
      var dt = autoScrollLast ? Math.min(100, now - autoScrollLast) : 16;
      autoScrollLast = now;
      var max = maxScrollY();
      var y = getScrollY();
      if (y >= max - 4) { stopAutoScroll(); return; } // fim do capítulo
      // accumulate fractional pixels: at slow paces a sub-pixel scrollTo target
      // gets snapped by the compositor (0.16px/frame => 0), so keep the
      // remainder and emit it as whole pixels (also fixes round-up inflation).
      autoScrollCarry += AUTO_SCROLL_SPEED * dt / 1000;
      var move = Math.floor(autoScrollCarry);
      if (move >= 1) {
        autoScrollCarry -= move;
        window.scrollTo(0, Math.min(max, y + move));
      }
      raf(autoScrollFrame);
    }
    /** speed: watch-side 0..100 (50 = default ≈ 95px/s; 0 ≈ 10, 100 ≈ 180) */
    function startAutoScroll(speed) {
      if (autoScrollOn) return;
      stopByGlide();
      var s = (typeof speed === 'number' && isFinite(speed)) ? Math.max(0, Math.min(100, speed)) : 50;
      AUTO_SCROLL_SPEED = 10 + s * 1.7;
      autoScrollOn = true;
      autoScrollLast = 0;
      autoScrollCarry = 0;
      scrollAnimSeq++; // cancel any running animation
      raf(autoScrollFrame);
    }
    function stopAutoScroll() {
      autoScrollOn = false;
    }
    function routeWatchAction(a, px, speed) {
      if (a !== 'autoscroll') stopAutoScroll(); // manual input wins
      var scrolled = document.body.classList.contains('scrolled-mode');
      if (scrolled) {
        if (a === 'autoscroll') { if (autoScrollOn) stopAutoScroll(); else startAutoScroll(speed); return; }
        if (a === 'scroll-by') { scrollByPx(px); return; }
        // 'next/prev' mean advance/back — in continuous mode that is down/up.
        if (a === 'scroll-down' || a === 'next') { scrollScreen(1); return; }
        if (a === 'scroll-up' || a === 'prev')   { scrollScreen(-1); return; }
      }
      if (a === 'next' || a === 'scroll-down') nextPage();
      else if (a === 'prev' || a === 'scroll-up') prevPage();
    }
    // user interaction stops the auto-scroll
    document.addEventListener('touchstart', stopAutoScroll, { passive: true });
    document.addEventListener('mousedown', stopAutoScroll);
    document.addEventListener('wheel', stopAutoScroll, { passive: true });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState !== 'visible') stopAutoScroll();
    });
    function updateWatchUI() {
      var form = document.getElementById('watch-pair');
      var pairBtn = document.getElementById('watch-pair-btn');
      var unpairBtn = document.getElementById('watch-unpair-btn');
      var connected = !!(watchWs && watchWs.readyState === WebSocket.OPEN);
      var stored = !!getWatchToken();
      if (pairBtn) pairBtn.style.display = (!connected && !stored) ? '' : 'none';
      if (unpairBtn) unpairBtn.style.display = (connected || stored) ? '' : 'none';
      // The pair form is revealed by the Pair button and starts hidden —
      // never force it open (that made "Pair" look like it did nothing,
      // or the opposite: click toggled it back off).
      if (form && (connected || stored)) form.style.display = 'none';
      var input = document.getElementById('watch-token-input');
      if (input && stored && !input.value) input.value = getWatchToken();
    }
    function connectWatch(token) {
      if (watchWs) { try { watchWs.close(); } catch (e) {} watchWs = null; }
      if (!token) return;
      var scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      try {
        watchWs = new WebSocket(scheme + '://' + window.location.host + '/ws/watch/' + encodeURIComponent(token) + '?role=reader');
      } catch (e) { setWatchStatus('Connection failed'); updateWatchUI(); return; }
      watchWs.onopen = function() { setWatchStatus('Watch connected'); showWatchIcon(true); updateWatchUI(); };
      watchWs.onmessage = function(e) { try { var d = JSON.parse(e.data); if (d && d.action) routeWatchAction(d.action, d.px, d.speed); } catch (err) {} };
      watchWs.onclose = function() { watchWs = null; showWatchIcon(false); setWatchStatus('Watch disconnected'); updateWatchUI(); };
    }
    function pairWatch() {
      var input = document.getElementById('watch-token-input');
      var token = input ? input.value.replace(/[^a-z0-9]/gi, '').toLowerCase() : '';
      if (!token) { setWatchStatus('Enter the code from your watch'); return; }
      try { localStorage.setItem(WATCH_KEY, token); } catch (e) {}
      setWatchStatus('Connecting...');
      connectWatch(token);
      syncWakeLock();
    }
    function unpairWatch() {
      var token = getWatchToken();
      if (watchWs) { try { watchWs.close(); } catch (e) {} watchWs = null; }
      try { localStorage.removeItem(WATCH_KEY); } catch (e) {}
      if (token) {
        // Fire-and-forget server revoke (logged-in owner or bearer both work).
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('DELETE', '/api/watch/' + encodeURIComponent(token), true);
          xhr.send();
        } catch (e) {}
      }
      showWatchIcon(false);
      setWatchStatus('');
      updateWatchUI();
      syncWakeLock();
    }

    TomeRemote.init({
      indicator: function() { return S.els.indicator; },
      nextPage: nextPage,
      prevPage: prevPage
    });

    var watchPairBtn = document.getElementById('watch-pair-btn');
    if (watchPairBtn) watchPairBtn.onclick = function() {
      var f = document.getElementById('watch-pair');
      if (f) {
        var show = f.style.display === 'none' || !f.style.display;
        f.style.display = show ? 'block' : 'none';
        if (show) {
          var inp = document.getElementById('watch-token-input');
          if (inp) { try { inp.focus(); } catch (e) {} }
        }
      }
    };
    var watchConnectBtn = document.getElementById('watch-connect-btn');
    if (watchConnectBtn) watchConnectBtn.onclick = pairWatch;
    var watchUnpairBtn = document.getElementById('watch-unpair-btn');
    if (watchUnpairBtn) watchUnpairBtn.onclick = unpairWatch;
    var savedWatch = getWatchToken();
    if (savedWatch) { setWatchStatus('Reconnecting watch...'); connectWatch(savedWatch); }
    updateWatchUI();
    syncWakeLock();
    document.addEventListener('visibilitychange', syncWakeLock);
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
