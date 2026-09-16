/**
 * Camera pinch control for the phone remote.
 * Lazy-loads MediaPipe Hand Landmarker on first tap; video never leaves the phone.
 * Pinch (thumb tip + index tip together) -> "next". Nothing else fires.
 * ES5-compatible classic script; the MediaPipe ESM bundle is dynamic-import()ed.
 */
(function (global) {
  'use strict';

  // ponytail: fixed thresholds, per-user tuning via TomeCamera.setThresholds if field data demands it
  var opts = { pinch: 0.07, release: 0.10, confirmMs: 160, cooldownMs: 900, intervalMs: 80 };
  var VISION_VER = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
  var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
  var THUMB_TIP = 4;
  var INDEX_TIP = 8;

  var landmarker = null;
  var loading = null;
  var running = false;
  var stream = null;
  var el = {};
  var deps = { send: null, isConnected: null };
  var pinched = false;
  var pinchSince = 0;
  var lastEmit = 0;
  var lastTick = 0;
  var lastVideoTime = -1;

  // Normalized x/y gap between thumb and index tips. Mirror-invariant.
  function pinchGap(landmarks) {
    var dx = landmarks[THUMB_TIP].x - landmarks[INDEX_TIP].x;
    var dy = landmarks[THUMB_TIP].y - landmarks[INDEX_TIP].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Pure pinch classifier — unit-tested via `bun public/js/remote-camera.js`.
  // Returns 'fire' once per pinch held shut for confirmMs (single-frame noise
  // dips never fire), 'released' on open past the release threshold
  // (hysteresis stops boundary flutter), else null.
  function classify(gap, isPinched, pinchForMs, sinceEmitMs, o) {
    o = o || opts;
    if (isPinched) return gap > o.release ? 'released' : null;
    if (gap < o.pinch && pinchForMs >= o.confirmMs && sinceEmitMs >= o.cooldownMs) return 'fire';
    return null;
  }

  function label(text) { if (el.label) el.label.textContent = text; }
  function active(on) {
    if (el.btn) { if (on) el.btn.classList.add('active'); else el.btn.classList.remove('active'); }
    if (el.video) { if (on) el.video.classList.add('on'); else el.video.classList.remove('on'); }
  }

  function loadLandmarker() {
    if (landmarker) return Promise.resolve(landmarker);
    if (loading) return loading;
    loading = import(VISION_VER + '/vision_bundle.mjs').then(function (m) {
      return m.FilesetResolver.forVisionTasks(VISION_VER + '/wasm').then(function (fileset) {
        function make(delegate) {
          return m.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
            runningMode: 'VIDEO', numHands: 1
          });
        }
        return make('GPU').catch(function () { return make('CPU'); }).then(function (h) {
          landmarker = h; return h;
        });
      });
    });
    return loading;
  }

  function onFrame() {
    if (!running) return;
    var now = performance.now();
    if (now - lastTick >= opts.intervalMs && el.video && el.video.readyState >= 2) {
      lastTick = now;
      if (el.video.currentTime !== lastVideoTime) {
        lastVideoTime = el.video.currentTime;
        var res;
        try { res = landmarker.detectForVideo(el.video, now); } catch (e) { res = null; }
        var pts = res && res.landmarks && res.landmarks[0];
        if (pts) {
          var gap = pinchGap(pts);
          if (gap < opts.pinch) { if (!pinchSince) pinchSince = now; }
          else pinchSince = 0;
          var r = classify(gap, pinched, pinchSince ? now - pinchSince : 0, now - lastEmit);
          if (r === 'fire') {
            if (deps.isConnected && !deps.isConnected()) { label('Not connected'); }
            else {
              pinched = true; pinchSince = 0; lastEmit = now; label('Next →');
              try { deps.send('next'); } catch (e) {}
            }
          } else if (r === 'released') {
            pinched = false; label('Pinch to turn');
          }
        } else pinchSince = 0;
      }
    }
    requestAnimationFrame(onFrame);
  }

  function start() {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { label('Needs HTTPS'); return; }
    label('Loading hand model…');
    loadLandmarker().then(function () {
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false
      });
    }).then(function (s) {
      stream = s;
      el.video.srcObject = s;
      return el.video.play();
    }).then(function () {
      running = true; pinched = false; pinchSince = 0; lastEmit = 0; lastTick = 0;
      active(true); label('Pinch to turn');
      document.addEventListener('visibilitychange', onHidden);
      requestAnimationFrame(onFrame);
    }).catch(function (e) {
      label(e && e.name === 'NotAllowedError' ? 'Camera denied' : 'Camera failed');
      stop();
    });
  }

  function onHidden() { if (document.hidden) stop(); }

  function stop() {
    running = false; pinched = false; pinchSince = 0;
    document.removeEventListener('visibilitychange', onHidden);
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
    if (el.video) { try { el.video.srcObject = null; } catch (e) {} }
    active(false);
    if (el.label && !/denied|failed|HTTPS/i.test(el.label.textContent)) label('Camera off');
  }

  function attach(o) {
    el.btn = o.btn; el.label = o.label; el.video = o.video;
    deps.send = o.send; deps.isConnected = o.isConnected;
    if (el.video) { try { el.video.setAttribute('playsinline', ''); el.video.playsInline = true; } catch (e) {} }
    if (el.btn) el.btn.onclick = function () { if (running) stop(); else start(); };
  }

  global.TomeCamera = {
    attach: attach, classify: classify, pinchGap: pinchGap,
    setThresholds: function (o) { for (var k in o) if (k in opts) opts[k] = o[k]; }
  };

  // Runnable check: `bun public/js/remote-camera.js` (no DOM needed).
  function assert(cond, msg) { if (!cond) throw new Error('selftest: ' + msg); }
  function selftest() {
    var o = { pinch: 0.07, release: 0.10, confirmMs: 160, cooldownMs: 900 };
    assert(classify(0.20, false, 0, 9999, o) === null, 'open hand ignored');
    assert(classify(0.05, false, 0, 9999, o) === null, 'fresh pinch touch does not fire yet');
    assert(classify(0.05, false, 200, 9999, o) === 'fire', 'held pinch fires');
    assert(classify(0.05, false, 200, 100, o) === null, 'cooldown suppresses double-fire');
    assert(classify(0.05, true, 9999, 9999, o) === null, 'held pinch does not repeat');
    assert(classify(0.08, false, 9999, 9999, o) === null, 'boundary gap ignored');
    assert(classify(0.15, true, 0, 9999, o) === 'released', 'opening past release resets');
    assert(classify(0.08, true, 0, 9999, o) === null, 'release hysteresis holds');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = global.TomeCamera;
  if (typeof process !== 'undefined' && process.argv && process.argv[1] &&
      process.argv[1].indexOf('remote-camera') !== -1) {
    selftest();
    if (process.stdout) process.stdout.write('remote-camera selftest ok\n');
  }
})(typeof window !== 'undefined' ? window : globalThis);
