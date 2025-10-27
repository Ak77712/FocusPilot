// background.js
// Service worker: monitors tab activity, idle state, and records focus data locally.
// Data model stored in chrome.storage.local:
// { sessions: [ {start, end, focusedTimeMs, distractionCount, meta...} ], current: {...} }

const DEFAULT_CONFIG = {
  idleThresholdSeconds: 60, // consider idle after 60s
  distractionSwitchThreshold: 3, // tabs switches within window considered distraction
  productiveDomains: ["github.com", "wikipedia.org", "stackoverflow.com"], // sample whitelist
  reminderCooldownMs: 60 * 1000 // don't remind more than once per minute
};

let config = DEFAULT_CONFIG;
let state = {
  currentTabId: null,
  currentWindowId: null,
  currentUrl: null,
  lastFocusTimestamp: Date.now(),
  lastReminderTimestamp: 0,
  quickSwitchCount: 0
};

const DISTRACTION_DOMAINS = [
  "facebook.com", "twitter.com", "instagram.com", "youtube.com", "reddit.com", "tiktok.com", "netflix.com", "discord.com", "pinterest.com", "roblox.com", "primevideo.com"
];

// Utility to store and read
async function save(key, value) {
  const payload = {};
  payload[key] = value;
  await chrome.storage.local.set(payload);
}
async function read(key) {
  const r = await chrome.storage.local.get(key);
  return r[key];
}

// Initialize storage
(async function init() {
  const stored = await read("sessions");
  if (!stored) await save("sessions", []);
  const storedConfig = await read("config");
  if (storedConfig) config = Object.assign(config, storedConfig);
})();

// Helpers
function isProductiveUrl(url) {
  try {
    const u = new URL(url);
    return config.productiveDomains.some(d => u.hostname.includes(d));
  } catch (e) {
    return false;
  }
}

function isDistractionUrl(url) {
  try {
    const u = new URL(url);
    // Only count as distraction if not productive and matches blacklist
    if (config.productiveDomains.some(d => u.hostname.includes(d))) return false;
    return DISTRACTION_DOMAINS.some(d => u.hostname.includes(d));
  } catch (e) {
    return false;
  }
}

function now() { return Date.now(); }

async function recordFocusEvent(deltaMs, wasProductive) {
  // Append to sessions array as a small record (aggregation done in popup)
  const sessions = (await read("sessions")) || [];
  sessions.push({
    timestamp: now(),
    durationMs: deltaMs,
    productive: !!wasProductive
  });
  await save("sessions", sessions);
}

// Debug logging
function logDebug(...args) {
  console.log('[FocusPilot]', ...args);
}

// Robust reminder sender: try messaging the content script, otherwise inject a small inline reminder
async function sendReminderToTab(tabId, reason, score) {
  try {
    // Ensure we only show reminders on known distraction sites. Fetch the tab URL and check.
    try {
      const t = await chrome.tabs.get(tabId);
      const url = t?.url || '';
      if (!isDistractionUrl(url)) {
        logDebug('sendReminderToTab: suppressed reminder because tab is not a distraction site', tabId, url);
        return false;
      }
    } catch (getErr) {
      // If we can't get the tab info, proceed with best-effort (will likely fail on injection)
      logDebug('sendReminderToTab: could not get tab info, proceeding with caution', getErr?.message || getErr);
    }
    await chrome.tabs.sendMessage(tabId, { type: "SHOW_REMINDER", payload: { reason, score } });
    logDebug('SHOW_REMINDER sent to tab', tabId);
    return true;
  } catch (err) {
    logDebug('sendMessage failed, will attempt injection:', err?.message || err, 'tabId:', tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (r, s) => {
          try {
            // Remove old if present
            const existing = document.getElementById('focuspilot-inline-reminder');
            if (existing) existing.remove();
            const div = document.createElement('div');
            div.id = 'focuspilot-inline-reminder';
            div.style.position = 'fixed';
            div.style.bottom = '32px';
            div.style.right = '32px';
            div.style.zIndex = '2147483647';
            div.style.backdropFilter = 'blur(16px) saturate(180%)';
            div.style.background = 'rgba(255,255,255,0.18)';
            div.style.border = '2px solid rgba(230,126,34,0.18)';
            div.style.padding = '18px 22px';
            div.style.borderRadius = '18px';
            div.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
            div.style.fontSize = '15px';
            div.style.color = '#111';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '12px';
            div.style.maxWidth = '360px';
            div.innerHTML = `<div style="flex:1"><b style='color:#e67e22'>FocusPilot</b><div style='font-size:14px;margin-top:6px;'>${r}</div></div><button id='fp-inline-close' style='margin-left:12px;padding:6px 10px;border-radius:8px;background:#e67e22;color:white;border:none;cursor:pointer;'>OK</button>`;
            document.body.appendChild(div);
            document.getElementById('fp-inline-close').onclick = () => div.remove();
            setTimeout(() => { if (div && div.parentNode) div.remove(); }, 30000);
          } catch (e) {
            // can't manipulate page
          }
        },
        args: [
          reason === 'distraction-site' ? "You're on a distracting site. Refocus!" : (reason === 'distraction' ? 'Rapid tab switching detected. Take a breath.' : 'Stay focused!'),
          score || 0
        ]
      });
      logDebug('Injected inline reminder into tab', tabId);
      return true;
    } catch (e2) {
      logDebug('Injection failed:', e2?.message || e2, 'tabId:', tabId);
      return false;
    }
  }
}

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  const url = tab?.url || null;
  const prev = { ...state };

  // update quick switch detection
  if (prev.currentTabId !== null && prev.currentTabId !== activeInfo.tabId) {
    state.quickSwitchCount = (state.quickSwitchCount || 0) + 1;
  }

  // record focused time for previous tab
  const nowTs = now();
  const delta = nowTs - state.lastFocusTimestamp;
  if (delta > 0 && prev.currentUrl) {
    const productive = isProductiveUrl(prev.currentUrl);
    await recordFocusEvent(delta, productive);
  }

  state.currentTabId = activeInfo.tabId;
  state.currentWindowId = activeInfo.windowId;
  state.currentUrl = url;
  state.lastFocusTimestamp = nowTs;

  // Instant nudge for distraction site
  if (isDistractionUrl(url)) {
    logDebug('Distraction detected on tab activation:', url);
    try {
      await sendReminderToTab(activeInfo.tabId, 'distraction-site', 99);
      state.lastReminderTimestamp = nowTs;
      state.quickSwitchCount = 0;
    } catch (e) {
      logDebug("Show reminder failed (both messaging & injection):", e?.message || e, 'tabId:', activeInfo.tabId, 'error:', e);
    }
  }
});

// Track tab updates (navigations)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    // user navigated in the active tab
    const nowTs = now();
    const delta = nowTs - state.lastFocusTimestamp;
    if (delta > 0 && state.currentUrl) {
      const productive = isProductiveUrl(state.currentUrl);
      await recordFocusEvent(delta, productive);
    }
    state.currentUrl = changeInfo.url;
    state.lastFocusTimestamp = nowTs;
    // Instant nudge for distraction site
    if (isDistractionUrl(changeInfo.url)) {
      logDebug('Distraction detected on tab update:', changeInfo.url);
      try {
        await sendReminderToTab(tabId, 'distraction-site', 99);
        state.lastReminderTimestamp = nowTs;
        state.quickSwitchCount = 0;
      } catch (e) {
        logDebug("Show reminder failed (both messaging & injection):", e?.message || e, 'tabId:', tabId, 'error:', e);
      }
    }
  }
});

// Idle detection
chrome.idle.onStateChanged.addListener(async (newState) => {
  const idleStates = ["idle", "locked"];
  if (idleStates.includes(newState)) {
    // user became idle: close out current focus period
    const nowTs = now();
    const delta = nowTs - state.lastFocusTimestamp;
    if (delta > 0 && state.currentUrl) {
      const productive = isProductiveUrl(state.currentUrl);
      await recordFocusEvent(delta, productive);
    }
    state.lastFocusTimestamp = nowTs; // reset for when they return
  } else if (newState === "active") {
    // user returned; reset quickSwitchCount
    state.quickSwitchCount = 0;
    state.lastFocusTimestamp = now();
  }
});

// Regular alarm to assess distraction pattern and optionally remind
chrome.alarms.create("assessFocus", { periodInMinutes: 0.5 }); // every 30 seconds
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "assessFocus") return;

  const nowTs = now();
  // compute short-term metrics by reading recent sessions
  const sessions = (await read("sessions")) || [];
  // consider last 2 minutes of events
  const cutoff = nowTs - 2 * 60 * 1000;
  const recent = sessions.filter(s => s.timestamp >= cutoff);

  // simple heuristic: many short durations + many non-productive => distracted
  const shortEvents = recent.filter(s => s.durationMs < 30 * 1000).length;
  const nonProd = recent.filter(s => !s.productive).length;
  const distractionScore = shortEvents + nonProd;

  // If user recently switched tabs many times, that is also a signal
  const quickSwitchSignal = state.quickSwitchCount >= config.distractionSwitchThreshold ? 1 : 0;

  const score = distractionScore + quickSwitchSignal;

  // should we remind the user?
  const timeSinceLastReminder = nowTs - (state.lastReminderTimestamp || 0);
  const shouldRemind = score >= 3 && timeSinceLastReminder > config.reminderCooldownMs;

  if (shouldRemind && state.currentTabId !== null) {
    // check productive nature—if already productive, maybe don't remind
    const productive = state.currentUrl ? isProductiveUrl(state.currentUrl) : false;
    if (!productive) {
      logDebug('Distraction pattern detected, sending reminder to tab', state.currentTabId);
      try {
        await sendReminderToTab(state.currentTabId, 'distraction', score);
        state.lastReminderTimestamp = nowTs;
        state.quickSwitchCount = 0; // reset
      } catch (e) {
        logDebug("Show reminder failed (both messaging & injection):", e?.message || e, 'tabId:', state.currentTabId, 'error:', e);
      }
    }
  }
});

// Expose a simple runtime message API for popup/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_STATS") {
    (async () => {
      const sessions = (await read("sessions")) || [];
      // aggregate last 24 hours
      const since = now() - 24 * 60 * 60 * 1000;
      const relevant = sessions.filter(s => s.timestamp >= since);
      const totalFocusedMs = relevant.reduce((acc, s) => acc + (s.productive ? s.durationMs : 0), 0);
      const distractionCount = relevant.filter(s => !s.productive).length;
      sendResponse({ totalFocusedMs, distractionCount, samples: relevant.length });
    })();
    // Return true to indicate we'll send an async response
    return true;
  }

  if (message?.type === "RESET_DATA") {
    (async () => {
      await save("sessions", []);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "OPEN_POPUP") {
    // Open the popup programmatically (if possible)
    chrome.action.openPopup();
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "OPEN_OPTIONS") {
    // Open the options page, optionally with a tab
    if (message.tab === "sites") {
      chrome.runtime.openOptionsPage();
      // Optionally, pass tab info via storage for options.js to read
      chrome.storage.local.set({ optionsTab: "sites" });
    } else {
      chrome.runtime.openOptionsPage();
    }
    sendResponse({ ok: true });
    return true;
  }
});
