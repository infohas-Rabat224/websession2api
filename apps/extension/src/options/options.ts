declare const chrome: { runtime: { id: string } };

const el = document.getElementById('options-ext-id');
if (el && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  el.textContent = chrome.runtime.id;
}
