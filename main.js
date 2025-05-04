// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs').promises;
const fsSync = require('fs');                  // for existsSync/statSync in vortexRoots
const fg    = require('fast-glob');
const Store = require('electron-store').default;
const fetch = (...a) => import('node-fetch').then(m => m.default(...a));

const IGDB_CLIENT_ID     = 'v6bvo79wgrmjiqoiykrcrrdd0plbz7';
const IGDB_CLIENT_SECRET = '66o3lss3cxe74bz97t6zuk1kajqtws';
const ORDER_FILE         = '.modninja-order.json';

const store = new Store();

// ─── Helpers ────────────────────────────────────────────────────────────
const fmt = id => id
  .replace(/ \(custom\)/, '')
  .replace(/([A-Za-z])(\d)/g, '$1 $2')
  .replace(/(\d)([A-Za-z])/g, '$1 $2')
  .replace(/[_\-]+/g, ' ')
  .trim();

async function igdbToken() {
  const now = Math.floor(Date.now() / 1e3);
  const { token = '', exp = 0 } = store.get('igdbToken', {});
  if (exp > now + 60) return token;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     IGDB_CLIENT_ID,
      client_secret: IGDB_CLIENT_SECRET,
      grant_type:    'client_credentials'
    })
  });
  const j = await res.json();
  store.set('igdbToken', { token: j.access_token, exp: now + j.expires_in });
  return j.access_token;
}

/**
 * Retrieve a cover image for a game ID, caching it to disk.
 * Tries searching IGDB by a formatted name (e.g. "Fallout 4") first,
 * then falls back to the raw ID if no results. Caches under userData/covers.
 */
async function igdbCoverURL(rawId) {
  const token = await igdbToken();

  const formattedName = fmt(rawId);
  const searchTerms = [ formattedName ];
  if (formattedName !== rawId) searchTerms.push(rawId);

  let pick = null;
  for (const term of searchTerms) {
    const q = `fields cover.image_id,name; search "${term}"; limit 5;`;
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID':     IGDB_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'text/plain'
      },
      body: q
    });
    const arr = await res.json().catch(() => []);
    if (!Array.isArray(arr) || !arr.length) continue;
    pick = arr.find(g => g.name?.toLowerCase() === term.toLowerCase() && g.cover)
        || arr.find(g => g.cover)
        || null;
    if (pick) break;
  }

  if (!pick?.cover?.image_id) return null;
  const imageId = pick.cover.image_id;

  const cacheDir = path.join(app.getPath('userData'), 'covers');
  await fs.mkdir(cacheDir, { recursive: true });
  const filename = `${imageId}.jpg`;
  const filePath = path.join(cacheDir, filename);

  try {
    await fs.access(filePath);
    return `file:///${filePath.replace(/\\/g,'/')}`;
  } catch {
    const url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      console.warn(`IGDB cover download failed (${imgRes.status}) for ${imageId}`);
      return null;
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return `file:///${filePath.replace(/\\/g,'/')}`;
  }
}

/**
 * Discover Vortex installations on *any* drive letter A:–Z:.
 * It takes your current %APPDATA%/%LOCALAPPDATA%, computes the relative path
 * under that drive (e.g. "Users\Robin\AppData\Roaming\Vortex") and then
 * checks each drive letter for that same relative path.
 */
function vortexRoots() {
  const roots = [];
  const appData      = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const candidates   = [appData, localAppData].filter(Boolean);

  const relPaths = candidates.map(base => {
    const drive = path.parse(base).root;
    const rel   = path.relative(drive, base);
    return path.join(rel, 'Vortex');
  });

  for (let c = 65; c <= 90; c++) {
    const driveLetter = String.fromCharCode(c) + ':\\';
    for (const rel of relPaths) {
      const full = path.join(driveLetter, rel);
      try {
        if (fsSync.existsSync(full) && fsSync.statSync(full).isDirectory()) {
          roots.push(full);
        }
      } catch {
        // ignore inaccessible drives/paths
      }
    }
  }
  return roots;
}

async function discoverGames() {
  const out = [];
  for (const root of vortexRoots()) {
    try {
      for (const d of await fs.readdir(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const modsDir = path.join(root, d.name, 'mods');
        try {
          const subs = await fs.readdir(modsDir, { withFileTypes: true });
          if (!subs.some(s => s.isDirectory())) continue;
        } catch { continue; }
        out.push({ id: d.name, modsDir });
      }
    } catch {}
  }
  return [...out, ...store.get('customMods', [])];
}

async function listMods(dir) {
  return (await fs.readdir(dir, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

/**
 * Recursively count total size, file count, and folder count.
 */
async function dirStats(dir) {
  let size = 0, files = 0, folders = 0;
  for await (const rel of fg.stream(['**/*'], {
    cwd: dir,
    dot: true,
    onlyFiles: false
  })) {
    const st = await fs.stat(path.join(dir, rel));
    if (st.isDirectory()) folders++;
    else { files++; size += st.size; }
  }
  return { size, files, folders };
}

/* ────────────────────────────────────────────────────────────────────── */

let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400,
    height: 800,
    backgroundColor: '#161616',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.maximize();
  win.loadFile('index.html');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ─── IPC Handlers ───────────────────────────────────────────────────── */

ipcMain.handle('games:list',        ()            => discoverGames());
ipcMain.handle('cover:get',         (_e, id)      => igdbCoverURL(id));
ipcMain.handle('mods:list',         (_e, dir)     => listMods(dir));
ipcMain.handle('mods:stats',        (_e, dir)     => dirStats(dir));
ipcMain.handle('mod:info',          async (_e,dir,name) => {
  const full = path.join(dir, name);
  const st   = await fs.stat(full);
  return {
    full,
    ctime: st.birthtime,
    mtime: st.mtime,
    atime: st.atime,
    ...(await dirStats(full))
  };
});
ipcMain.handle('open:path',         (_e,p)        => shell.openPath(p));
ipcMain.handle('order:save',        async (_e,dir,list) => {
  await fs.writeFile(path.join(dir, ORDER_FILE), JSON.stringify(list));
  return true;
});
ipcMain.handle('order:load',        async (_e,dir) => {
  try { return JSON.parse(await fs.readFile(path.join(dir, ORDER_FILE), 'utf8')); }
  catch { return null; }
});
ipcMain.handle('export:list',       async (_e,mods,fmt) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `modlist.${fmt}`,
    filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }]
  });
  if (canceled || !filePath) return null;
  const data = fmt === 'txt'
    ? mods.join('\n')
    : fmt === 'json'
      ? JSON.stringify(mods, null, 2)
      : mods.map(m => `"${m}"`).join(',');
  await fs.writeFile(filePath, data, 'utf8');
  return path.basename(filePath);
});
ipcMain.handle('choose:folder',     async ()       => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  if (canceled || !filePaths[0]) return null;
  const modsDir = filePaths[0];
  const id      = path.basename(path.join(modsDir, '..')) + ' (custom)';
  const custom  = store.get('customMods', []);
  if (!custom.find(x => x.modsDir === modsDir)) {
    store.set('customMods', [...custom, { id, modsDir }]);
  }
  return { id, modsDir };
});
ipcMain.handle('open:settings',     ()             => {
  const sw = new BrowserWindow({
    width: 800,
    height: 400,
    parent: win,
    modal: true,
    show: false,
    backgroundColor: '#161616',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  sw.loadFile('settings.html');
  sw.once('ready-to-show', () => sw.show());
});
ipcMain.handle('mod:getReadme',      async (_e,dir,name) => {
  const modPath = path.join(dir, name);
  const candidates = ['README.md','README.txt','INSTALL.txt','CHANGELOG.txt'];
  for (const file of candidates) {
    try {
      const content = await fs.readFile(path.join(modPath, file), 'utf8');
      return { filename: file, content };
    } catch {}
  }
  return null;
});
ipcMain.handle('mod:getScreenshots', async (_e,dir,name) => {
  const shotsDir = path.join(dir, name, 'screenshots');
  try {
    const files = await fs.readdir(shotsDir);
    return files.filter(f => /\.(png|jpe?g|gif)$/i.test(f))
                .map(f => path.join(shotsDir, f));
  } catch {
    return [];
  }
});
ipcMain.handle('games:deleteMods',   async (_e, modsDir) => {
  await fs.rm(modsDir, { recursive: true, force: true });
  return true;
});
ipcMain.handle('settings:load',      async ()       => store.get('settings', {}));
ipcMain.handle('settings:save',      async (_e,s)   => { store.set('settings', s); return true; });
ipcMain.handle('open-external',      (_e, url)     => shell.openExternal(url));

/* ─── NEW: Mini file-tree support ───────────────────────────────────── */
const MAX_TREE_ENTRIES = 800;  // keep UI snappy
ipcMain.handle('mod:listTree', async (_e, dir, name) => {
  try {
    const root = path.join(dir, name);
    const paths = await fg(['**/*'], {
      cwd: root,
      dot: false,
      onlyFiles: false,
      followSymbolicLinks: false
    });
    return paths.slice(0, MAX_TREE_ENTRIES);
  } catch {
    return [];
  }
});
