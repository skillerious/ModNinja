/* ==========================================================================
   ModNinja – Electron main process main.js
   Copyright (C) 2025  Robin Doak <
   ========================================================================== */
   const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
   const path      = require('path');
   const fs        = require('fs').promises;
   const fsSync    = require('fs');
   const fg        = require('fast-glob');
   const Store     = require('electron-store').default;
   const fetch     = (...args) => import('node-fetch').then(m => m.default(...args));
   
   const IGDB_CLIENT_ID     = 'v6bvo79wgrmjiqoiykrcrrdd0plbz7';
   const IGDB_CLIENT_SECRET = '66o3lss3cxe74bz97t6zuk1kajqtws';
   const ORDER_FILE         = '.modninja-order.json';
   
   const store = new Store();
   
   /* ──────────────────────────────────────────────────────────────────────────
      Helpers
      ──────────────────────────────────────────────────────────────────────── */
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
   
     try {
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
     } catch (err) {
       console.warn('[IGDB] token fetch failed – offline?', err);
       return '';
     }
   }
   
   /**
    * Retrieve a cover image for a game ID, preferring:
    *  1) manual override in covers/<rawId>.(jpg|png)
    *  2) previously indexed cached image via coverIndex
    *  3) IGDB API lookup + cache
    */
   async function igdbCoverURL(rawId) {
     const cacheDir   = path.join(app.getPath('userData'), 'covers');
     await fs.mkdir(cacheDir, { recursive: true });
     const coverIndex = store.get('coverIndex', {});
   
     // 1) Manual override
     for (const ext of ['.jpg', '.png']) {
       const manual = path.join(cacheDir, rawId + ext);
       try {
         await fs.access(manual);
         return `file:///${manual.replace(/\\/g, '/')}`;
       } catch {}
     }
   
     // 2) Indexed cached cover
     if (coverIndex[rawId]) {
       const cached = path.join(cacheDir, coverIndex[rawId] + '.jpg');
       try {
         await fs.access(cached);
         return `file:///${cached.replace(/\\/g, '/')}`;
       } catch {}
     }
   
     // 3) Need IGDB lookup
     const token = await igdbToken();
     if (!token) return null;  // offline, no token
   
     const formatted   = fmt(rawId);
     const searchTerms = formatted === rawId ? [formatted] : [formatted, rawId];
     let pick = null;
   
     for (const term of searchTerms) {
       try {
         const res = await fetch('https://api.igdb.com/v4/games', {
           method: 'POST',
           headers: {
             'Client-ID':     IGDB_CLIENT_ID,
             'Authorization': `Bearer ${token}`,
             'Content-Type':  'text/plain'
           },
           body: `fields cover.image_id,name; search "${term}"; limit 5;`
         });
         const arr = await res.json().catch(() => []);
         if (!Array.isArray(arr) || !arr.length) continue;
         pick = arr.find(g => g.name?.toLowerCase() === term.toLowerCase() && g.cover)
                || arr.find(g => g.cover) || null;
         if (pick) break;
       } catch (err) {
         console.warn('[IGDB] search failed', err);
         return null;
       }
     }
   
     if (!pick?.cover?.image_id) return null;
   
     const imageId = pick.cover.image_id;
     const filePath = path.join(cacheDir, imageId + '.jpg');
   
     // cached?
     try {
       await fs.access(filePath);
     } catch {
       // download & cache
       try {
         const url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
         const imgRes = await fetch(url);
         if (!imgRes.ok) throw new Error('HTTP ' + imgRes.status);
         const buf = Buffer.from(await imgRes.arrayBuffer());
         await fs.writeFile(filePath, buf);
       } catch (err) {
         console.warn('[IGDB] cover download failed', err);
         return null;
       }
     }
   
     // record for offline indexing
     coverIndex[rawId] = imageId;
     store.set('coverIndex', coverIndex);
   
     return `file:///${filePath.replace(/\\/g, '/')}`;
   }
   
   /* ──────────────────────────────────────────────────────────────────────────
      Discover Vortex roots on drives A:–Z:
      ──────────────────────────────────────────────────────────────────────── */
   function vortexRoots() {
     const roots       = [];
     const appData     = process.env.APPDATA;
     const localApp    = process.env.LOCALAPPDATA;
     const candidates  = [appData, localApp].filter(Boolean);
   
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
         } catch {}
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
           const subs    = await fs.readdir(modsDir, { withFileTypes: true }).catch(() => []);
           if (!subs.some(s => s.isDirectory())) continue;
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
   
   /* ──────────────────────────────────────────────────────────────────────────
      Electron window
      ──────────────────────────────────────────────────────────────────────── */
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
   
   /* ──────────────────────────────────────────────────────────────────────────
      IPC handlers
      ──────────────────────────────────────────────────────────────────────── */
   ipcMain.handle('games:list',        ()               => discoverGames());
   ipcMain.handle('cover:get',         (_e, id)         => igdbCoverURL(id));
   ipcMain.handle('mods:list',         (_e, dir)        => listMods(dir));
   ipcMain.handle('mods:stats',        (_e, dir)        => dirStats(dir));
   ipcMain.handle('mod:info',          async (_e, dir, name) => {
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
   ipcMain.handle('open:path',         (_e, p)          => shell.openPath(p));
   ipcMain.handle('order:save',        async (_e, dir, list) => {
     await fs.writeFile(path.join(dir, ORDER_FILE), JSON.stringify(list));
     return true;
   });
   ipcMain.handle('order:load',        async (_e, dir)   => {
     try { return JSON.parse(await fs.readFile(path.join(dir, ORDER_FILE), 'utf8')); }
     catch { return null; }
   });
   ipcMain.handle('export:list',       async (_e, mods, fmt) => {
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
   ipcMain.handle('choose:folder',     async ()          => {
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
   ipcMain.handle('open:settings',     ()                => {
     const sw = new BrowserWindow({
       width: 800,
       height: 650,
       parent: win,
       modal: true,
       show: false,
       frame: false,                       // NEW → no native title-bar
        titleBarStyle: 'hiddenInset',       // tidy macOS / Windows edge
       backgroundColor: '#161616',
       autoHideMenuBar: true,
       webPreferences: {
         contextIsolation: true,
         preload: path.join(__dirname, 'preload.js')
       }
     });
     sw.loadFile('settings.html');
     sw.once('ready-to-show', () => sw.show());
   });
   ipcMain.handle('mod:getReadme',      async (_e, dir, name) => {
     const modPath    = path.join(dir, name);
     const candidates = ['README.md','README.txt','INSTALL.txt','CHANGELOG.txt'];
     for (const file of candidates) {
       try {
         const content = await fs.readFile(path.join(modPath, file), 'utf8');
         return { filename: file, content };
       } catch {}
     }
     return null;
   });
   ipcMain.handle('mod:getScreenshots', async (_e, dir, name) => {
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
   ipcMain.handle('settings:load',      ()                => store.get('settings', {}));
   ipcMain.handle('settings:save',      async (_e, s)      => { store.set('settings', s); return true; });
   ipcMain.handle('open-external',      (_e, url)         => shell.openExternal(url));
   
   /* ─── NEW: Mini file-tree support ───────────────────────────────────────── */
   const MAX_TREE_ENTRIES = 800;
   ipcMain.handle('mod:listTree', async (_e, dir, name) => {
     try {
       const root  = path.join(dir, name);
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
   