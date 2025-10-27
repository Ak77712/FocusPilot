document.addEventListener('DOMContentLoaded', async () => {
  chrome.storage.local.get('config', (data) => {
    const cfg = data.config || {};
    document.getElementById('domains').value = (cfg.productiveDomains || []).join(', ');
    document.getElementById('switchThreshold').value = cfg.distractionSwitchThreshold || 3;
    document.getElementById('cooldown').value = cfg.reminderCooldownMs || 60000;
  });
  document.getElementById('saveBtn').onclick = () => {
    const domains = document.getElementById('domains').value.split(',').map(s => s.trim()).filter(Boolean);
    const switchThreshold = parseInt(document.getElementById('switchThreshold').value, 10);
    const cooldown = parseInt(document.getElementById('cooldown').value, 10);
    chrome.storage.local.set({ config: { productiveDomains: domains, distractionSwitchThreshold: switchThreshold, reminderCooldownMs: cooldown } }, () => {
      document.getElementById('status').textContent = 'Saved!';
      setTimeout(() => document.getElementById('status').textContent = '', 1500);
    });
  };
});
