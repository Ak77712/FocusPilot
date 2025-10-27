// Focus timer logic
let focusTimer = null;
let timerEnd = null;
function startFocusTimer(minutes) {
  timerEnd = Date.now() + minutes * 60 * 1000;
  chrome.storage.local.set({ focusTimerEnd: timerEnd });
  updateFocusTimerDisplay();
  if (focusTimer) clearInterval(focusTimer);
  focusTimer = setInterval(() => {
    updateFocusTimerDisplay();
    if (Date.now() >= timerEnd) {
      clearInterval(focusTimer);
      timerEnd = null;
      chrome.storage.local.remove('focusTimerEnd');
      updateFocusTimerDisplay();
    }
  }, 1000);
}
function updateFocusTimerDisplay() {
  const display = document.getElementById('focusTimerDisplay');
  if (!timerEnd) {
    display.textContent = '';
    display.style.display = 'none';
    return;
  }
  display.style.display = 'block';
  const msLeft = timerEnd - Date.now();
  if (msLeft <= 0) {
    display.textContent = 'Done!';
    setTimeout(() => { display.style.display = 'none'; }, 4000);
    return;
  }
  const m = Math.floor(msLeft / 60000);
  const s = Math.floor((msLeft % 60000) / 1000);
  display.textContent = `${m}:${String(s).padStart(2, "0")}`;
}
// On popup open, restore timer if present
document.addEventListener('DOMContentLoaded', async () => {
  // Restore timer if present
  chrome.storage.local.get('focusTimerEnd', (data) => {
    if (data.focusTimerEnd) {
      timerEnd = data.focusTimerEnd;
      updateFocusTimerDisplay();
      if (focusTimer) clearInterval(focusTimer);
      focusTimer = setInterval(() => {
        updateFocusTimerDisplay();
        if (Date.now() >= timerEnd) {
          clearInterval(focusTimer);
          timerEnd = null;
          chrome.storage.local.remove('focusTimerEnd');
          updateFocusTimerDisplay();
        }
      }, 1000);
    }
  });

  // Start timer button
  document.getElementById('startFocusBtn').onclick = () => {
    const minutes = Math.max(1, parseInt(document.getElementById('focusMinutes').value, 10) || 25);
    startFocusTimer(minutes);
  };

  // Dashboard stats
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (res) => {
    console.log('[FocusPilot] Dashboard stats:', res);
    if (chrome.runtime.lastError || !res) {
      document.getElementById('focusedTime').textContent = 'Focused: N/A';
      document.getElementById('distractionCount').textContent = 'Distractions: N/A';
      document.getElementById('samples').textContent = 'Samples: N/A';
      document.getElementById('lastNudge').textContent = 'Last nudge: N/A';
      document.getElementById('chart').innerHTML = '';
      return;
    }
    document.getElementById('focusedTime').textContent = `Focused: ${Math.round((res.totalFocusedMs||0)/60000)} min`;
    document.getElementById('distractionCount').textContent = `Distractions: ${res.distractionCount ?? 'N/A'}`;
    document.getElementById('samples').textContent = `Samples: ${res.samples ?? 'N/A'}`;
    chrome.storage.local.get('lastReminderTimestamp', (data) => {
      const ts = data.lastReminderTimestamp;
      document.getElementById('lastNudge').textContent = ts ? `Last nudge: ${new Date(ts).toLocaleTimeString()}` : 'Last nudge: N/A';
    });
    // Simple chart: show distraction/focus ratio
    const total = (res.samples||0);
    const distractions = (res.distractionCount||0);
    const focused = total - distractions;
    let chartHtml = '';
    if (total > 0) {
      chartHtml = `<div style='height:100%;width:${(focused/total)*100}%;background:#27ae60;float:left;transition:width 0.5s;'></div>` +
                  `<div style='height:100%;width:${(distractions/total)*100}%;background:#e67e22;float:left;transition:width 0.5s;'></div>`;
    }
    document.getElementById('chart').innerHTML = chartHtml;
  });

  // Reset stats button
  document.getElementById('resetBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: 'RESET_DATA' }, (res) => {
      window.location.reload();
    });
  };
});
