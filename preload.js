const { contextBridge, ipcRenderer } = require('electron');

// Dynamically import 'marked' if available, otherwise fall back silently
let marked = null;
(async () => {
  try {
    const m = await import('marked');
    marked = m.default || m.marked || m;
  } catch {
    // marked not installed → fallback will be used
  }
})();

contextBridge.exposeInMainWorld('api', {
  // Core IPC
  listGames:        ()            => ipcRenderer.invoke('games:list'),
  getCover:         id            => ipcRenderer.invoke('cover:get', id),
  listMods:         dir           => ipcRenderer.invoke('mods:list', dir),
  dirStats:         dir           => ipcRenderer.invoke('mods:stats', dir),
  modInfo:          (d,n)         => ipcRenderer.invoke('mod:info', d, n),
  modReadme:        (d,n)         => ipcRenderer.invoke('mod:getReadme', d, n),
  modScreenshots:   (d,n)         => ipcRenderer.invoke('mod:getScreenshots', d, n),
  openPath:         p             => ipcRenderer.invoke('open:path', p),
  saveOrder:        (d,l)         => ipcRenderer.invoke('order:save', d, l),
  loadOrder:        d             => ipcRenderer.invoke('order:load', d),
  exportMods:       (m,fmt)       => ipcRenderer.invoke('export:list', m, fmt),
  chooseFolder:     ()            => ipcRenderer.invoke('choose:folder'),
  openSettings:     ()            => ipcRenderer.invoke('open:settings'),
  deleteMods:       dir           => ipcRenderer.invoke('games:deleteMods', dir),

  // External URL
  openExternal:     url           => ipcRenderer.invoke('open-external', url),

  // Markdown support
  markdownToHtml:   text          => {
    if (marked) {
      return typeof marked.parse === 'function'
        ? marked.parse(text)
        : (marked.parseInline ? marked.parseInline(text) : marked(text));
    }
    const escaped = text
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
    return `<pre style="white-space:pre-wrap;margin:0;">${escaped}</pre>`;
  },

  // Settings
  loadSettings:     ()            => ipcRenderer.invoke('settings:load'),
  saveSettings:     settings      => ipcRenderer.invoke('settings:save', settings)
});
