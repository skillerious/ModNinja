// preload.js – bridging secure APIs into the renderer
const { contextBridge, ipcRenderer } = require('electron');

/* optional: markdown helper (lazy-loaded) */
let marked = null;
(async () => {
  try {
    const m = await import('marked');
    marked = m.default || m.marked || m;
  } catch { /* offline / not installed */ }
})();

/* one consolidated API object */
const api = {
  /* core */
  listGames      : ()            => ipcRenderer.invoke('games:list'),
  getCover       : id            => ipcRenderer.invoke('cover:get', id),
  listMods       : dir           => ipcRenderer.invoke('mods:list', dir),
  dirStats       : dir           => ipcRenderer.invoke('mods:stats', dir),
  modInfo        : (d, n)        => ipcRenderer.invoke('mod:info', d, n),
  modReadme      : (d, n)        => ipcRenderer.invoke('mod:getReadme', d, n),
  modScreenshots : (d, n)        => ipcRenderer.invoke('mod:getScreenshots', d, n),
  modTree        : (d, n)        => ipcRenderer.invoke('mod:listTree', d, n),

  openPath       : p             => ipcRenderer.invoke('open:path', p),
  openExternal   : url           => ipcRenderer.invoke('open-external', url),

  saveOrder      : (d, l)        => ipcRenderer.invoke('order:save', d, l),
  loadOrder      : d             => ipcRenderer.invoke('order:load', d),
  exportMods     : (m, fmt)      => ipcRenderer.invoke('export:list', m, fmt),

  chooseFolder   : ()            => ipcRenderer.invoke('choose:folder'),
  openSettings   : ()            => ipcRenderer.invoke('open:settings'),
  deleteMods     : dir           => ipcRenderer.invoke('games:deleteMods', dir),

  /* settings helpers */
  loadSettings   : ()            => ipcRenderer.invoke('settings:load'),
  saveSettings   : s             => ipcRenderer.invoke('settings:save',  s),
  clearCoverCache: ()            => ipcRenderer.invoke('covers:clear'),

  /* tiny MD → HTML helper */
  markdownToHtml : (text) => {
    if (marked) {
      return typeof marked.parse === 'function'
        ? marked.parse(text)
        : (marked.parseInline ? marked.parseInline(text) : marked(text));
    }
    return `<pre style="white-space:pre-wrap;margin:0;">${text
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')}</pre>`;
  }
};

contextBridge.exposeInMainWorld('api', api);
