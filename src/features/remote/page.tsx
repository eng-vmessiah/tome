export function RemotePage({
  token,
  wsUrl,
}: {
  token: string;
  wsUrl: string;
}): JSX.Element {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0" />
        <title>Remote Control - Tome</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #1a1a1a;
            color: #fff;
            touch-action: manipulation;
            -webkit-user-select: none;
            user-select: none;
          }
          .container {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .controls {
            flex: 1;
            display: flex;
          }
          .tap-zone {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            cursor: pointer;
            transition: background-color 0.1s;
          }
          .tap-zone:active {
            background-color: rgba(255, 255, 255, 0.2);
          }
          .tap-zone.disabled {
            opacity: 0.3;
            pointer-events: none;
          }
          .tap-left {
            background: #2d2d2d;
            border-right: 1px solid #444;
          }
          .tap-right {
            background: #2d2d2d;
          }
          .tap-left:active { background: #3d5a3d; }
          .tap-right:active { background: #3d5a3d; }
          .status-bar {
            padding: 16px;
            background: #111;
            border-top: 1px solid #333;
            text-align: center;
          }
          .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
          }
          .status-indicator.connected { background: #4caf50; }
          .status-indicator.disconnected { background: #f44336; }
          .status-indicator.connecting { background: #ff9800; }
          .status-text {
            font-size: 14px;
            color: #aaa;
          }
          .flash {
            animation: flash 0.15s ease-out;
          }
          @keyframes flash {
            0% { background-color: rgba(76, 175, 80, 0.5); }
            100% { background-color: transparent; }
          }
          .voice-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 12px 16px;
            background: #111;
            border-top: 1px solid #333;
          }
          .mic-btn {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: 2px solid #555;
            background: #2d2d2d;
            color: #aaa;
            font-size: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            -webkit-tap-highlight-color: transparent;
          }
          .mic-btn:active {
            transform: scale(0.95);
          }
          .mic-btn.listening {
            border-color: #4caf50;
            background: #1b3a1b;
            color: #4caf50;
            animation: pulse 1.5s infinite;
          }
          .mic-btn.unsupported {
            opacity: 0.3;
            pointer-events: none;
          }
          .mic-btn.disabled {
            opacity: 0.3;
            pointer-events: none;
          }
          .voice-label {
            font-size: 13px;
            color: #777;
            min-width: 120px;
          }
          .voice-heard {
            font-size: 13px;
            color: #4caf50;
            min-width: 80px;
            text-align: right;
            font-style: italic;
          }
          #cam-video {
            width: 72px;
            height: 54px;
            border-radius: 6px;
            background: #000;
            transform: scaleX(-1);
            display: none;
            object-fit: cover;
          }
          #cam-video.on { display: block; }
          #cam-btn.active {
            border-color: #4caf50;
            background: #1b3a1b;
            color: #4caf50;
          }
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
            50% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
          }
          .settings-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid #555;
            background: #2d2d2d;
            color: #aaa;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            -webkit-tap-highlight-color: transparent;
            flex-shrink: 0;
          }
          .settings-btn:active {
            transform: scale(0.95);
          }
          .voice-settings-panel {
            display: none;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: #1a1a1a;
            border-top: 1px solid #333;
          }
          .voice-settings-panel.open {
            display: flex;
          }
          .voice-settings-panel h3 {
            font-size: 14px;
            color: #ccc;
            font-weight: 600;
            margin-bottom: 4px;
          }
          .settings-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .settings-row label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .settings-row input,
          .settings-row select {
            background: #2d2d2d;
            border: 1px solid #444;
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            padding: 8px 10px;
            width: 100%;
            appearance: none;
            -webkit-appearance: none;
          }
          .settings-row input:focus,
          .settings-row select:focus {
            outline: none;
            border-color: #4caf50;
          }
          .settings-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
          }
          .settings-save-btn {
            padding: 8px 18px;
            background: #4caf50;
            border: none;
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          .settings-save-btn:active {
            opacity: 0.8;
          }
          .settings-hint {
            font-size: 11px;
            color: #555;
            line-height: 1.4;
          }
        `}</style>
      </head>
      <body>
        <div class="container">
          <div class="controls">
            <div class="tap-zone tap-left disabled" id="prev">
              <span>←</span>
            </div>
            <div class="tap-zone tap-right disabled" id="next">
              <span>→</span>
            </div>
          </div>
          <div class="voice-settings-panel" id="voice-settings-panel">
            <h3>Voice Control Settings</h3>
            <div class="settings-row">
              <label for="voice-lang">Language</label>
              <select id="voice-lang">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-AU">English (Australia)</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="es-ES">Spanish (Spain)</option>
                <option value="es-MX">Spanish (Mexico)</option>
                <option value="it-IT">Italian</option>
                <option value="pt-BR">Portuguese (Brazil)</option>
                <option value="pt-PT">Portuguese (Portugal)</option>
                <option value="nl-NL">Dutch</option>
                <option value="pl-PL">Polish</option>
                <option value="ru-RU">Russian</option>
                <option value="ja-JP">Japanese</option>
                <option value="ko-KR">Korean</option>
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="zh-TW">Chinese (Traditional)</option>
              </select>
            </div>
            <div class="settings-row">
              <label for="voice-next-words">Next words</label>
              <input type="text" id="voice-next-words" placeholder="next, forward" />
              <span class="settings-hint">Comma-separated words that trigger "next"</span>
            </div>
            <div class="settings-row">
              <label for="voice-prev-words">Previous words</label>
              <input type="text" id="voice-prev-words" placeholder="prev, previous, back" />
              <span class="settings-hint">Comma-separated words that trigger "previous"</span>
            </div>
            <div class="settings-actions">
              <button class="settings-save-btn" id="voice-settings-save">Save</button>
            </div>
          </div>
          <div class="voice-bar" id="voice-bar">
            <span class="voice-label" id="voice-label">Voice off</span>
            <button class="mic-btn" id="mic-btn" title="Toggle voice control">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <span class="voice-heard" id="voice-heard"></span>
            <button class="settings-btn" id="voice-settings-btn" title="Voice settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
          <div class="voice-bar" id="cam-bar">
            <span class="voice-label" id="cam-label">Camera off</span>
            <button class="mic-btn" id="cam-btn" title="Toggle camera control">📷</button>
            <video id="cam-video" muted autoplay></video>
          </div>
          <div class="status-bar">
            <span class="status-indicator connecting" id="indicator"></span>
            <span class="status-text" id="status">Connecting...</span>
          </div>
        </div>

        <script src="/public/js/remote-camera.js"></script>
        <script>{`
(function() {
  var wsUrl = '${wsUrl}';
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var indicator = document.getElementById('indicator');
  var statusText = document.getElementById('status');
  var ws = null;
  var connected = false;

  // Voice control elements
  var micBtn = document.getElementById('mic-btn');
  var voiceLabel = document.getElementById('voice-label');
  var voiceHeard = document.getElementById('voice-heard');
  var voiceSettingsBtn = document.getElementById('voice-settings-btn');
  var voiceSettingsPanel = document.getElementById('voice-settings-panel');
  var voiceLangSelect = document.getElementById('voice-lang');
  var voiceNextWordsInput = document.getElementById('voice-next-words');
  var voicePrevWordsInput = document.getElementById('voice-prev-words');
  var voiceSettingsSave = document.getElementById('voice-settings-save');

  // Voice control state
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var voiceActive = false;
  var lastActionTime = 0;
  var DEBOUNCE_MS = 800;
  var restartTimeout = null;

  // Voice settings (defaults)
  var voiceSettings = {
    lang: 'en-US',
    nextWords: ['next', 'forward'],
    prevWords: ['prev', 'previous', 'back']
  };

  // ============================================================
  // COOKIE HELPERS
  // ============================================================

  function readVoiceSettingsCookie() {
    var match = document.cookie.match(/(?:^|;\\s*)remote_voice_settings=([^;]+)/);
    if (!match) return;
    try {
      var parsed = JSON.parse(decodeURIComponent(match[1]));
      if (typeof parsed.lang === 'string' && parsed.lang) {
        voiceSettings.lang = parsed.lang;
      }
      if (Array.isArray(parsed.nextWords) && parsed.nextWords.length > 0) {
        voiceSettings.nextWords = parsed.nextWords;
      }
      if (Array.isArray(parsed.prevWords) && parsed.prevWords.length > 0) {
        voiceSettings.prevWords = parsed.prevWords;
      }
    } catch (e) {}
  }

  function saveVoiceSettingsCookie() {
    var value = encodeURIComponent(JSON.stringify(voiceSettings));
    document.cookie = 'remote_voice_settings=' + value + '; Path=/; SameSite=Lax; Max-Age=31536000';
  }

  function parseWords(str) {
    return str.split(',')
      .map(function(w) { return w.trim().toLowerCase(); })
      .filter(function(w) { return w.length > 0; });
  }

  // ============================================================
  // SETTINGS PANEL
  // ============================================================

  function populateSettingsPanel() {
    // Set language dropdown
    var options = voiceLangSelect.options;
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === voiceSettings.lang) {
        voiceLangSelect.selectedIndex = i;
        break;
      }
    }
    voiceNextWordsInput.value = voiceSettings.nextWords.join(', ');
    voicePrevWordsInput.value = voiceSettings.prevWords.join(', ');
  }

  function toggleSettingsPanel() {
    var isOpen = voiceSettingsPanel.classList.contains('open');
    if (isOpen) {
      voiceSettingsPanel.classList.remove('open');
    } else {
      populateSettingsPanel();
      voiceSettingsPanel.classList.add('open');
    }
  }

  voiceSettingsBtn.onclick = toggleSettingsPanel;

  voiceSettingsSave.onclick = function() {
    var newLang = voiceLangSelect.value;
    var newNext = parseWords(voiceNextWordsInput.value);
    var newPrev = parseWords(voicePrevWordsInput.value);

    if (newNext.length === 0) newNext = ['next', 'forward'];
    if (newPrev.length === 0) newPrev = ['prev', 'previous', 'back'];

    var langChanged = newLang !== voiceSettings.lang;
    voiceSettings.lang = newLang;
    voiceSettings.nextWords = newNext;
    voiceSettings.prevWords = newPrev;
    saveVoiceSettingsCookie();
    voiceSettingsPanel.classList.remove('open');

    // Restart recognition if active and language changed
    if (voiceActive && langChanged) {
      stopRecognition();
      startRecognition();
    }
  };

  // Load settings from cookie on startup
  readVoiceSettingsCookie();

  function setStatus(state, text) {
    indicator.className = 'status-indicator ' + state;
    statusText.textContent = text;
    
    var disabled = state !== 'connected';
    prevBtn.classList.toggle('disabled', disabled);
    nextBtn.classList.toggle('disabled', disabled);
    connected = !disabled;

    // Update mic button availability
    updateMicAvailability();
  }

  function flash(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function send(action) {
    if (!connected || !ws) return;
    try {
      ws.send(JSON.stringify({ action: action }));
      flash(action === 'prev' ? prevBtn : nextBtn);
    } catch (e) {}
  }

  function connect() {
    setStatus('connecting', 'Connecting...');
    
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      setStatus('disconnected', 'Connection failed');
      setTimeout(connect, 3000);
      return;
    }

    ws.onopen = function() {
      setStatus('connected', 'Connected');
    };

    ws.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'connected') {
          setStatus('connected', 'Connected');
        } else if (data.type === 'reader_connected') {
          setStatus('connected', 'Reader reconnected');
        } else if (data.type === 'reader_disconnected') {
          setStatus('connecting', 'Reader navigating...');
        }
      } catch (err) {}
    };

    ws.onerror = function() {
      setStatus('disconnected', 'Connection error');
    };

    ws.onclose = function() {
      setStatus('disconnected', 'Disconnected - Reconnecting...');
      ws = null;
      setTimeout(connect, 2000);
    };
  }

  prevBtn.onclick = function() { send('prev'); };
  nextBtn.onclick = function() { send('next'); };

  // ============================================================
  // VOICE CONTROL
  // ============================================================

  function updateMicAvailability() {
    if (!SpeechRecognition) {
      micBtn.classList.add('unsupported');
      voiceLabel.textContent = 'Not supported';
      return;
    }
    if (!connected) {
      micBtn.classList.add('disabled');
    } else {
      micBtn.classList.remove('disabled');
    }
  }

  function matchKeyword(transcript) {
    var text = transcript.toLowerCase().trim();
    // Word boundary check: split into words and check each
    var words = text.split(/\\s+/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (voiceSettings.nextWords.indexOf(w) !== -1) return 'next';
      if (voiceSettings.prevWords.indexOf(w) !== -1) return 'prev';
    }
    return null;
  }

  function handleResult(event) {
    var now = Date.now();
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var result = event.results[i];
      var transcript = result[0].transcript;
      var action = matchKeyword(transcript);

      if (action && (now - lastActionTime) > DEBOUNCE_MS) {
        lastActionTime = now;
        send(action);
        voiceHeard.textContent = '"' + action + '"';
        // Clear the heard text after a moment
        setTimeout(function() {
          voiceHeard.textContent = '';
        }, 1500);
        return;
      }
    }
  }

  function startRecognition() {
    if (!SpeechRecognition || recognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceSettings.lang;
    // Limit to improve speed on supported browsers
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult;

    recognition.onerror = function(event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceLabel.textContent = 'Mic denied';
        stopVoice();
        return;
      }
      if (event.error === 'no-speech') {
        // Normal — just means silence, recognition will restart
        return;
      }
      if (event.error === 'network') {
        voiceLabel.textContent = 'Network error';
        // Try to restart after a delay
        scheduleRestart(2000);
        return;
      }
      // For aborted or other errors, try to restart if still active
      if (voiceActive) {
        scheduleRestart(500);
      }
    };

    recognition.onend = function() {
      recognition = null;
      // Chrome stops after silence or after a while — auto-restart if toggle is on
      if (voiceActive && connected) {
        scheduleRestart(100);
      } else {
        micBtn.classList.remove('listening');
        voiceLabel.textContent = 'Voice off';
        voiceActive = false;
      }
    };

    try {
      recognition.start();
    } catch (e) {
      recognition = null;
      voiceLabel.textContent = 'Start failed';
      voiceActive = false;
      micBtn.classList.remove('listening');
    }
  }

  function scheduleRestart(delay) {
    if (restartTimeout) clearTimeout(restartTimeout);
    restartTimeout = setTimeout(function() {
      restartTimeout = null;
      if (voiceActive && connected) {
        startRecognition();
      }
    }, delay);
  }

  function stopRecognition() {
    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }
    if (recognition) {
      try { recognition.abort(); } catch (e) {}
      recognition = null;
    }
  }

  function startVoice() {
    voiceActive = true;
    micBtn.classList.add('listening');
    voiceLabel.textContent = 'Listening...';
    voiceHeard.textContent = '';
    startRecognition();
  }

  function stopVoice() {
    voiceActive = false;
    micBtn.classList.remove('listening');
    voiceLabel.textContent = 'Voice off';
    voiceHeard.textContent = '';
    stopRecognition();
  }

  function toggleVoice() {
    if (!SpeechRecognition || !connected) return;
    if (voiceActive) {
      stopVoice();
    } else {
      startVoice();
    }
  }

  micBtn.onclick = toggleVoice;

  // Camera swipe control (MediaPipe, lazy-loads on first tap)
  if (window.TomeCamera) {
    TomeCamera.attach({
      btn: document.getElementById('cam-btn'),
      label: document.getElementById('cam-label'),
      video: document.getElementById('cam-video'),
      send: send,
      isConnected: function() { return connected; }
    });
  }

  // Initial setup
  if (!SpeechRecognition) {
    micBtn.classList.add('unsupported');
    voiceLabel.textContent = 'Not supported';
  }

  connect();
})();
        `}</script>
      </body>
    </html>
  );
}
