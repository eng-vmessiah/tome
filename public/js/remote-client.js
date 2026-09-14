/**
 * Remote control client (Phase 2 — extracted from reader.js / epub-reader.js).
 * Shared by every reader: initialize with TomeRemote.init({ indicator, nextPage, prevPage }).
 * ES5 compatible, optimized for e-ink performance.
 */
(function(global) {
  'use strict';

  var REMOTE_STORAGE_KEY = 'tome_remote_token';
  var REMOTE_WS_URL_KEY = 'tome_remote_ws_url';

  var deps = {
    indicator: null,  // function() -> indicator element or null
    nextPage: null,   // function()
    prevPage: null    // function()
  };

  var ws = null;
  var token = null;
  var connected = false;

  function getStoredRemoteToken() {
    try {
      return sessionStorage.getItem(REMOTE_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function getStoredRemoteWsUrl() {
    try {
      return sessionStorage.getItem(REMOTE_WS_URL_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveRemoteSession(t, wsUrl) {
    try {
      sessionStorage.setItem(REMOTE_STORAGE_KEY, t);
      sessionStorage.setItem(REMOTE_WS_URL_KEY, wsUrl);
    } catch (e) {}
  }

  function clearRemoteSession() {
    try {
      sessionStorage.removeItem(REMOTE_STORAGE_KEY);
      sessionStorage.removeItem(REMOTE_WS_URL_KEY);
    } catch (e) {}
  }

  function showRemoteIcon(show) {
    var icon = document.getElementById('remote-icon');
    if (icon) {
      icon.style.display = show ? 'inline' : 'none';
    }
  }

  function updateRemoteStatus(text) {
    var status = document.getElementById('remote-status');
    if (status) status.textContent = text;
  }

  function updateRemoteUI() {
    var btn = document.getElementById('remote-btn');
    var disableBtn = document.getElementById('remote-disable-btn');
    var qrContainer = document.getElementById('remote-qr');
    var reconnectPrompt = document.getElementById('remote-reconnect');

    if (ws && ws.readyState === WebSocket.OPEN) {
      if (btn) btn.textContent = 'New QR';
      if (disableBtn) disableBtn.style.display = 'inline-block';
      if (reconnectPrompt) reconnectPrompt.style.display = 'none';
    } else if (token) {
      if (btn) btn.textContent = 'Enable';
      if (disableBtn) disableBtn.style.display = 'inline-block';
    } else {
      if (btn) btn.textContent = 'Enable';
      if (disableBtn) disableBtn.style.display = 'none';
      if (qrContainer) qrContainer.style.display = 'none';
      if (reconnectPrompt) reconnectPrompt.style.display = 'none';
    }

    showRemoteIcon(connected);
  }

  function showRemoteDisconnected() {
    connected = false;
    showRemoteIcon(false);

    var indicator = deps.indicator ? deps.indicator() : null;
    if (indicator) {
      var original = indicator.textContent;
      indicator.textContent = 'Remote disconnected';
      setTimeout(function() {
        indicator.textContent = original;
      }, 2000);
    }
  }

  function connectRemoteWs(wsUrl) {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      updateRemoteStatus('Connection failed');
      updateRemoteUI();
      return;
    }

    ws.onopen = function() {
      updateRemoteStatus('Connected - scan QR with phone');
      updateRemoteUI();
    };

    ws.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'controller_joined') {
          connected = true;
          showRemoteIcon(true);
          updateRemoteStatus('Phone connected!');
        } else if (data.type === 'controller_left') {
          connected = false;
          showRemoteIcon(false);
          updateRemoteStatus('Phone disconnected');
        } else if (data.action === 'next') {
          if (deps.nextPage) deps.nextPage();
        } else if (data.action === 'prev') {
          if (deps.prevPage) deps.prevPage();
        } else if (data.action === 'scroll-down') {
          if (deps.nextPage) deps.nextPage();
        } else if (data.action === 'scroll-up') {
          if (deps.prevPage) deps.prevPage();
        }
      } catch (err) {}
    };

    ws.onerror = function() {
      updateRemoteStatus('Connection error');
      updateRemoteUI();
    };

    ws.onclose = function() {
      if (connected) {
        showRemoteDisconnected();
      }
      ws = null;
      updateRemoteUI();
    };
  }

  function reconnectRemote() {
    var storedToken = getStoredRemoteToken();
    var storedWsUrl = getStoredRemoteWsUrl();

    if (!storedToken || !storedWsUrl) {
      clearRemoteSession();
      updateRemoteUI();
      return;
    }

    updateRemoteStatus('Reconnecting...');

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/remote/validate/' + storedToken, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data.valid) {
              token = storedToken;
              var qrImg = document.getElementById('remote-qr-img');
              if (qrImg) qrImg.src = '/api/remote/qr/' + storedToken;
              var qrContainer = document.getElementById('remote-qr');
              if (qrContainer) qrContainer.style.display = 'block';
              var reconnectPrompt = document.getElementById('remote-reconnect');
              if (reconnectPrompt) reconnectPrompt.style.display = 'none';
              connectRemoteWs(storedWsUrl);
              return;
            }
          } catch (e) {}
        }
        clearRemoteSession();
        token = null;
        updateRemoteStatus('Session expired');
        updateRemoteUI();
      }
    };
    xhr.send();
  }

  function disableRemote() {
    var t = token || getStoredRemoteToken();

    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }

    if (t) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/remote/invalidate/' + t, true);
      xhr.send();
    }

    token = null;
    connected = false;
    clearRemoteSession();

    var qrContainer = document.getElementById('remote-qr');
    if (qrContainer) qrContainer.style.display = 'none';
    var reconnectPrompt = document.getElementById('remote-reconnect');
    if (reconnectPrompt) reconnectPrompt.style.display = 'none';

    updateRemoteStatus('Remote disabled');
    updateRemoteUI();
  }

  function enableRemote() {
    var btn = document.getElementById('remote-btn');
    var qrContainer = document.getElementById('remote-qr');
    var qrImg = document.getElementById('remote-qr-img');

    if (!btn || !qrContainer || !qrImg) return;

    btn.textContent = 'Loading...';
    btn.disabled = true;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/remote/create', true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        btn.disabled = false;
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            token = data.token;
            var wsUrl = data.wsUrl + '?role=reader';
            saveRemoteSession(token, wsUrl);
            qrImg.src = data.qrUrl;
            qrContainer.style.display = 'block';
            var reconnectPrompt = document.getElementById('remote-reconnect');
            if (reconnectPrompt) reconnectPrompt.style.display = 'none';
            updateRemoteStatus('Waiting for connection...');
            connectRemoteWs(wsUrl);
            updateRemoteUI();
          } catch (e) {
            btn.textContent = 'Error';
          }
        } else {
          btn.textContent = 'Error';
        }
      }
    };
    xhr.send();
  }

  function checkSavedRemoteSession() {
    var storedToken = getStoredRemoteToken();
    if (!storedToken) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/remote/validate/' + storedToken, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data.valid) {
              token = storedToken;
              var reconnectPrompt = document.getElementById('remote-reconnect');
              if (reconnectPrompt) reconnectPrompt.style.display = 'block';
              updateRemoteUI();
              return;
            }
          } catch (e) {}
        }
        clearRemoteSession();
      }
    };
    xhr.send();
  }

  function attachHandlers() {
    var remoteBtn = document.getElementById('remote-btn');
    if (remoteBtn) remoteBtn.onclick = enableRemote;

    var remoteDisableBtn = document.getElementById('remote-disable-btn');
    if (remoteDisableBtn) remoteDisableBtn.onclick = disableRemote;

    var remoteReconnectBtn = document.getElementById('remote-reconnect-btn');
    if (remoteReconnectBtn) remoteReconnectBtn.onclick = reconnectRemote;
  }

  global.TomeRemote = {
    init: function(opts) {
      deps = opts || deps;
      attachHandlers();
      checkSavedRemoteSession();
    }
  };
})(window);
