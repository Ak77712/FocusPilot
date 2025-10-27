// content.js
// Injects a subtle overlay reminder when the background service worker requests it.
// FocusPilot Content Script
// Handles distraction popup and persistent timer overlay with liquid glass UI

(function () {

(function () {
  // create a single overlay element we can re-use
  let overlay = null;
  function ensureOverlay() {
     if (overlay) return overlay;
     // Create a new overlay element
    overlay = document.createElement("div");
    overlay.id = "focuspilot-overlay";
    overlay.style.position = "fixed";
    overlay.style.bottom = "32px";
    overlay.style.right = "32px";
    overlay.style.zIndex = 2147483647;
    overlay.style.maxWidth = "340px";
    overlay.style.padding = "0";
    overlay.style.borderRadius = "24px";
  // Set overlay styles
    overlay.style.boxShadow = "0 8px 32px rgba(0,0,0,0.18)";
    overlay.style.background = "rgba(255,255,255,0.18)";
    overlay.style.backdropFilter = "blur(24px)";
    overlay.style.border = "2px solid rgba(230,126,34,0.18)";
    overlay.style.color = "#111";
    overlay.style.fontFamily = "Inter, Roboto, system-ui, sans-serif";
    overlay.style.fontSize = "15px";
  // Set overlay display properties
    overlay.style.lineHeight = "1.2";
    overlay.style.display = "none";
    overlay.style.transition = "transform 400ms cubic-bezier(.68,-0.55,.27,1.55), opacity 400ms cubic-bezier(.68,-0.55,.27,1.55)";
    overlay.style.transform = "scale(0.98)";
    overlay.style.opacity = "0";
    overlay.innerHTML = `
      <div style="padding: 16px;">
        <div id="fp-text" style="font-weight: 500;"></div>
        // Overlay buttons for starting and snoozing
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <input id="fp-minutes" type="number" min="1" value="5" style="width: 60px; padding: 8px; border: 2px solid #e67e22; border-radius: 4px; font-size: 16px; text-align: center;">
          <button id="fp-start" style="flex: 1; padding: 8px; background: #e67e22; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">Start Session</button>
          <button id="fp-snooze" style="flex: 1; padding: 8px; background: #bbb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">Snooze</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#fp-start").addEventListener("click", () => {
      const minutes = Math.max(1, parseInt(overlay.querySelector("#fp-minutes").value, 10) || 5);
      startQuickSession(minutes);
      hideOverlay();
    });
    overlay.querySelector("#fp-snooze").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SNOOZE" }, () => {});
      hideOverlay();
    });
    return overlay;
  }

  // Function to show overlay with text
  function showOverlay(text) {
    const el = ensureOverlay();
    const txtEl = el.querySelector("#fp-text");
    if (text) txtEl.textContent = text;
    el.style.display = "block";
    requestAnimationFrame(() => {
      el.style.transform = "scale(1)";
      el.style.opacity = "1";
    });
    // auto-hide after 30s
    setTimeout(hideOverlay, 30000);
  }

  // Function to hide overlay
  function hideOverlay() {
    if (!overlay) return;
    overlay.style.transform = "scale(0.98)";
    overlay.style.opacity = "0";
    setTimeout(() => {
      if (overlay) overlay.style.display = "none";
    }, 400);
  }

  // Function to start a quick session
  function startQuickSession(minutes) {
    showTimerPopup(minutes);
    chrome.runtime.sendMessage({ type: "START_FOCUS_SESSION", payload: { minutes }});
  }

  // Show a timer overlay in the bottom right corner
    // Timer overlay logic removed. Timer is now managed in popup/dashboard only.

  // Customizable nudge messages
  const defaultNudges = [
    "Time to refocus!",
    "Let's get back on track.",
    "A gentle nudge to stay productive.",
    "Remember your goals!",
    "You can do this!",
    "Take a deep breath and refocus."
  ];
  // Function to get nudge message based on reason
  function getNudgeMessage(reason) {
    // Try to get user-defined messages from chrome.storage
    let msg = defaultNudges[Math.floor(Math.random() * defaultNudges.length)];
    if (reason === 'distraction-site') msg = "This site is known to be distracting!";
    if (window.fpCustomNudges && window.fpCustomNudges.length) {
      msg = window.fpCustomNudges[Math.floor(Math.random() * window.fpCustomNudges.length)];
    }
    return msg;
  }
  // Load custom nudges from storage
  chrome.storage.sync.get(['customNudges'], (data) => {
    if (Array.isArray(data.customNudges)) {
      window.fpCustomNudges = data.customNudges.filter(x => x && x.length > 0);
    }
  });

  // Function to play nudge sound
  function playNudgeSound() {
    const audio = document.createElement('audio');
    audio.src = 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b6b2b48.mp3'; // Free gentle notification sound
    audio.volume = 0.5;
    audio.play();
  }
  function vibrateNudge() {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }

  // Function to show reminder
  function showReminder(reason, score) {
    // Remove any existing popup
    const oldDiv = document.getElementById('focuspilot-reminder');
    if (oldDiv) {
      oldDiv.remove();
      console.log('[FocusPilot] Removed existing reminder popup');
    }
    const div = document.createElement('div');
    div.id = 'focuspilot-reminder';
    div.style.position = 'fixed';
    div.style.bottom = '32px';
    div.style.right = '32px';
    div.style.zIndex = '2147483647';
    div.style.backdropFilter = 'blur(16px)';
    div.style.background = 'rgba(255,255,255,0.35)';
    div.style.border = '2px solid #e2c96f';
    div.style.padding = '24px 28px';
    div.style.borderRadius = '22px';
    div.style.boxShadow = '0 8px 32px #0004';
    div.style.fontSize = '17px';
    div.style.maxWidth = '360px';
    div.style.transition = 'all 0.3s';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '18px';
    div.style.opacity = '0.98';
    const nudgeMsg = getNudgeMessage(reason);
    div.innerHTML = `<img src='https://img.icons8.com/fluency/48/000000/rocket.png' style='width:44px;height:44px;margin-right:10px;filter:drop-shadow(0 2px 8px #6c63ff88);'><div style='flex:1;'><b style='color:#e67e22;font-size:18px;text-shadow:0 1px 8px #fff8;'>FocusPilot</b><br><span style='font-size:16px;color:#222;text-shadow:0 1px 8px #fff8;'>${nudgeMsg}</span><br><small style='color:#888;'>(reason: ${reason}, score: ${score})</small><div style='margin-top:12px;'><button id='fp-ok' style='background:rgba(230,126,34,0.85);color:#fff;border:none;padding:8px 18px;border-radius:8px;margin-right:8px;cursor:pointer;font-size:15px;box-shadow:0 1px 8px #e67e2288;'>Okay</button><button id='fp-snooze' style='background:rgba(187,187,187,0.85);color:#fff;border:none;padding:8px 18px;border-radius:8px;margin-right:8px;cursor:pointer;font-size:15px;box-shadow:0 1px 8px #bbb8;'>Snooze 5m</button><button id='fp-reflect' style='background:rgba(108,99,255,0.85);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:15px;box-shadow:0 1px 8px #6c63ff88;'>Reflect</button></div></div>`;
    try {
      if (document.body) {
        document.body.appendChild(div);
        console.log('[FocusPilot] Reminder popup appended to body');
      } else {
        document.documentElement.appendChild(div);
        console.warn('[FocusPilot] document.body not available, appended to documentElement');
      }
      setTimeout(function() { div.style.opacity = '1'; }, 100);
      document.getElementById('fp-ok').onclick = function() { div.remove(); };
      document.getElementById('fp-snooze').onclick = function() {
        chrome.runtime.sendMessage({ type: 'SNOOZE', duration: 5 * 60 * 1000 });
        div.remove();
      };
      document.getElementById('fp-reflect').onclick = function() {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
        div.remove();
      };
      playNudgeSound();
      vibrateNudge();
      setTimeout(function() { if (div && div.parentNode) div.remove(); }, 30000);
    } catch (err) {
      console.error('[FocusPilot] Failed to show reminder popup:', err);
    }
  }

  // Listen for background requests
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "SHOW_REMINDER") {
      console.log('[FocusPilot] SHOW_REMINDER received:', msg);
      setTimeout(() => {
        showReminder(msg.payload?.reason || "distraction", msg.payload?.score ?? 0);
      }, 0);
      sendResponse({ ok: true });
    }
  });

  // Listen for messages from popup.js to start timer overlay
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg && msg.type === 'START_FOCUS_TIMER' && msg.minutes) {
      console.log('[FocusPilot] START_FOCUS_TIMER received:', msg);
        // Timer overlay logic removed. Timer is now managed in popup/dashboard only.
      sendResponse({ ok: true });
    }
  });

})();

})();
