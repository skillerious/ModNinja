// renderer.js
window.addEventListener('DOMContentLoaded', () => {
  const $ = q => document.querySelector(q);

  // Helper: ensure certain overlay/context-menu elements exist,
  // creating them if missing.
  function ensureDiv(id, className) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      if (className) el.className = className;
      document.body.appendChild(el);
    }
    return el;
  }

  /* ─── Ensure key overlays / menus exist ───────────────────────────────── */
  const scanBackdrop     = ensureDiv('scanBackdrop',    'modal-backdrop');
  const aboutBackdrop    = ensureDiv('aboutBackdrop',   'modal-backdrop');
  const dialogBackdrop   = ensureDiv('dialogBackdrop',  'modal-backdrop');
  const lightboxBackdrop = ensureDiv('lightboxBackdrop','modal-backdrop');
  const ctxModMenu       = ensureDiv('modContextMenu',  'context-menu');
  const ctxGameMenu      = ensureDiv('gameContextMenu', 'context-menu');
  const tooltip          = ensureDiv('toolbarTooltip',  'toolbar-tooltip');

  /* ─── Inject generic dialog markup into dialogBackdrop ───────────────── */
  if (!dialogBackdrop.innerHTML.trim()) {
    dialogBackdrop.innerHTML = `
      <div class="modal dialog-modal">
        <div class="modal-header">
          <h3 id="dialogTitle">Title</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div id="dialogMessage"></div>
        </div>
        <div class="modal-footer">
          <button id="dialogCancel" class="cancel">Cancel</button>
          <button id="dialogOk" class="confirm">OK</button>
        </div>
      </div>
    `;
  }

  /* ─── Inject lightbox markup into lightboxBackdrop ───────────────────── */
  if (!lightboxBackdrop.innerHTML.trim()) {
    lightboxBackdrop.innerHTML = `
      <div class="modal lightbox-modal">
        <div class="modal-header">
          <h3>Preview</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <img id="lightboxImg" src="" alt="Screenshot">
        </div>
        <div class="modal-footer">
          <button id="lightboxClose" class="cancel">Close</button>
        </div>
      </div>
    `;
  }

  /* ─── DOM refs ────────────────────────────────────────────────────── */
  const gameUL         = $('#gameList');
  const modUL          = $('#modList');
  const details        = $('#details');
  const scanTitle      = $('#scanTitle');
  const scanProg       = $('#scanProg');
  const scanText       = $('#scanText');
  const scanClose      = $('#scanClose');
  const aboutClose     = $('#aboutClose');
  const dialogTitle    = $('#dialogTitle');
  const dialogMsg      = $('#dialogMessage');
  const dialogOk       = $('#dialogOk');
  const dialogCancel   = $('#dialogCancel');
  const lightboxImg    = $('#lightboxImg');
  const lightboxClose  = $('#lightboxClose');
  const gameSearch     = $('#gameSearch');
  const btnFilter      = $('#btnFilterGames');
  const btnToggle      = $('#btnToggleView');
  const statusGameV    = $('#statusGame .value');
  const statusFileV    = $('#statusFile .value');
  const statusSizeV    = $('#statusSizeMod .value');
  const statusDateV    = $('#statusModDate .value');
  const statusTotalV   = $('#statusTotalSize .value');
  const statusCountV   = $('#statusCount .value');

  if (!gameUL || !modUL || !details) {
    console.error('Missing core UI elements.');
    return;
  }

  let games = [], mods = [], currentDir = null, currentGameId = '';
  const modCache = new Map();

  /* ─── Custom message & confirm dialogs ───────────────────────────── */
  function showMessage(msg, title = '') {
    dialogTitle.textContent    = title;
    dialogMsg.textContent      = msg;
    dialogCancel.style.display = 'none';
    dialogOk.textContent       = 'OK';
    dialogBackdrop.classList.add('active');
    return new Promise(res => {
      const onOk = () => {
        dialogBackdrop.classList.remove('active');
        dialogOk.removeEventListener('click', onOk);
        res();
      };
      dialogOk.addEventListener('click', onOk);
    });
  }

  function showConfirm(msg, title = 'Confirm') {
    dialogTitle.textContent    = title;
    dialogMsg.textContent      = msg;
    dialogCancel.style.display = '';
    dialogOk.textContent       = 'Yes';
    dialogBackdrop.classList.add('active');
    return new Promise(res => {
      const onYes = () => { cleanup(); res(true); };
      const onNo  = () => { cleanup(); res(false); };
      const cleanup = () => {
        dialogBackdrop.classList.remove('active');
        dialogOk.removeEventListener('click', onYes);
        dialogCancel.removeEventListener('click', onNo);
      };
      dialogOk.addEventListener('click', onYes);
      dialogCancel.addEventListener('click', onNo);
    });
  }

  // Close dialogs via × and backdrop click
  dialogBackdrop.querySelector('.modal-close')
    .addEventListener('click', () => dialogBackdrop.classList.remove('active'));
  dialogBackdrop.addEventListener('click', e => {
    if (e.target === dialogBackdrop)
      dialogBackdrop.classList.remove('active');
  });

  /* ─── Lightbox close handlers ───────────────────────────────────── */
  lightboxClose.addEventListener('click', () => lightboxBackdrop.classList.remove('active'));
  lightboxBackdrop.querySelector('.modal-close')
    .addEventListener('click', () => lightboxBackdrop.classList.remove('active'));
  lightboxBackdrop.addEventListener('click', e => {
    if (e.target === lightboxBackdrop)
      lightboxBackdrop.classList.remove('active');
  });

  /* ─── Hide overlays ────────────────────────────────────────────────── */
  scanBackdrop.classList.remove('active');
  aboutBackdrop.classList.remove('active');
  dialogBackdrop.classList.remove('active');
  lightboxBackdrop.classList.remove('active');
  ctxModMenu.style.display  = 'none';
  ctxGameMenu.style.display = 'none';
  tooltip.classList.remove('active');

  /* ─── Toolbar actions/tooltips ────────────────────────────────────── */
  const actions = {
    refresh:     ()        => init(),
    scan:        ()        => scanMods(),
    locate:      async ()  => { const r = await api.chooseFolder(); if (r) init(r.id); },
    openDir:     ()        => currentDir && api.openPath(currentDir),
    exportTxt:   ()        => exportList('txt'),
    exportJson:  ()        => exportList('json'),
    exportCsv:   ()        => exportList('csv'),
    saveOrder:   ()        => saveOrder(),
    loadOrder:   ()        => loadOrder(),
    theme:       ()        => document.body.classList.toggle('light'),
    settings:    ()        => api.openSettings(),
    about:       ()        => aboutBackdrop.classList.add('active'),
    filterGames: ()        => {
      const term = gameSearch?.value.trim().toLowerCase() || '';
      gameUL.querySelectorAll('li').forEach(li => {
        const title = li.querySelector('.title').textContent.toLowerCase();
        li.style.display = title.includes(term) ? '' : 'none';
      });
    },
    toggleView:  ()        => gameUL.classList.toggle('list-view')
  };

  document.querySelectorAll('#toolbar button').forEach(btn => {
    btn.addEventListener('click', () => actions[btn.dataset.cmd]?.());
    const tip = btn.dataset.tooltip;
    if (!tip) return;
    btn.addEventListener('mouseover', () => {
      tooltip.textContent = tip;
      tooltip.classList.add('active');
      const r = btn.getBoundingClientRect();
      let x = r.left + (r.width - tooltip.offsetWidth) / 2;
      let y = r.bottom + 8;
      x = Math.max(4, Math.min(x, window.innerWidth - tooltip.offsetWidth - 4));
      y = Math.max(4, Math.min(y, window.innerHeight - tooltip.offsetHeight - 4));
      tooltip.style.left = `${x}px`;
      tooltip.style.top  = `${y}px`;
    });
    btn.addEventListener('mouseout', () => tooltip.classList.remove('active'));
  });

  gameSearch?.addEventListener('input', () => actions.filterGames());
  btnFilter?.addEventListener('click',   () => actions.filterGames());
  btnToggle?.addEventListener('click',   () => actions.toggleView());
  aboutClose?.addEventListener('click',  () => aboutBackdrop.classList.remove('active'));

  /* ─── Helpers ─────────────────────────────────────────────────────── */
  const fmtName = id => id.replace(/ \(custom\)/,'')
    .replace(/([A-Za-z])(\d)/g,'$1 $2')
    .replace(/(\d)([A-Za-z])/g,'$1 $2')
    .replace(/[_\-]+/g,' ').trim();
  const human = n => {
    const u = ['B','KB','MB','GB','TB']; let i=0;
    while(n>=1024 && i<u.length-1){ n/=1024; i++; }
    return n.toFixed(1)+' '+u[i];
  };

  /* ─── Init games list ─────────────────────────────────────────────── */
  async function init(selectId = null) {
    games = await api.listGames();
    gameUL.textContent = '';
    for (const g of games) {
      const li = document.createElement('li');
      li.dataset.id = g.id;
      li.innerHTML = `<div class="thumb"></div><div class="title">${fmtName(g.id)}</div>`;
      li.addEventListener('click', () => showGame(g));
      li.addEventListener('contextmenu', e => {
        e.preventDefault();
        showGameContextMenu(e.pageX, e.pageY, g);
      });
      api.getCover(g.id).then(url => {
        if (!url) return;
        li.classList.add('has-cover');
        li.style.backgroundImage = `url("${url}")`;
        li.querySelector('.thumb').style.backgroundImage = `url("${url}")`;
      });
      gameUL.append(li);
    }
    const first = selectId
      ? gameUL.querySelector(`li[data-id="${selectId}"]`)
      : gameUL.firstElementChild;
    first && first.click();
  }

  /* ─── Context menu for games ─────────────────────────────────────── */
  function showGameContextMenu(x, y, game) {
    ctxGameMenu.innerHTML = `
      <div class="context-menu-item"   data-action="openMods">Open Mods Folder</div>
      <div class="context-menu-item"   data-action="openVortex">Open Vortex Folder</div>
      <div class="context-menu-item danger" data-action="deleteMods">Delete All Mods</div>
    `;
    Array.from(ctxGameMenu.children).forEach(item => {
      item.onclick = async () => {
        const act = item.dataset.action;
        if (act === 'openMods') {
          api.openPath(game.modsDir);
        } else if (act === 'openVortex') {
          api.openPath(game.modsDir.replace(/\\/g,'/').replace(/\/mods$/, ''));
        } else if (act === 'deleteMods') {
          const ok = await showConfirm(`Delete ALL mods for "${fmtName(game.id)}"?`);
          if (ok) {
            await api.deleteMods(game.modsDir);
            init(game.id);
          }
        }
        hideGameContextMenu();
      };
    });
    ctxGameMenu.style.left    = `${x}px`;
    ctxGameMenu.style.top     = `${y}px`;
    ctxGameMenu.style.display = 'block';
  }
  function hideGameContextMenu() {
    ctxGameMenu.style.display = 'none';
  }
  document.addEventListener('click', e => {
    if (!ctxGameMenu.contains(e.target)) hideGameContextMenu();
  });

  /* ─── Show mods & stats ───────────────────────────────────────────── */
  async function showGame(g) {
    if (!g) { await showMessage('Select a game first.'); return; }
    currentDir    = g.modsDir;
    currentGameId = g.id;
    if (statusGameV) statusGameV.textContent = fmtName(g.id);

    gameUL.querySelectorAll('li').forEach(li =>
      li.classList.toggle('active', li.dataset.id === g.id)
    );

    if (modCache.has(g.id)) {
      mods = modCache.get(g.id);
    } else {
      mods = await api.listMods(currentDir);
      modCache.set(g.id, mods);
    }

    if (statusCountV) statusCountV.textContent = mods.length;
    if (!mods.length) { await showMessage('No mods.'); return; }

    if (statusTotalV) {
      statusTotalV.classList.add('spinner');
      statusTotalV.textContent = '';
    }
    renderModList();
    const stats = await api.dirStats(currentDir);
    if (statusTotalV) {
      statusTotalV.classList.remove('spinner');
      statusTotalV.textContent = human(stats.size);
    }
  }

  /* ─── Render mod list ─────────────────────────────────────────────── */
  function renderModList() {
    modUL.textContent = '';
    const frag = document.createDocumentFragment();
    for (const m of mods) {
      const li = document.createElement('li');
      li.textContent = m;
      li.addEventListener('click', () => showDetails(m));
      li.addEventListener('dblclick', () => api.openPath(`${currentDir}\\${m}`));
      li.addEventListener('contextmenu', e => {
        e.preventDefault();
        showModContextMenu(e.pageX, e.pageY, m);
      });
      frag.append(li);
    }
    modUL.append(frag);
    modUL.firstElementChild && modUL.firstElementChild.click();
  }

  /* ─── Context menu for mods ───────────────────────────────────────── */
  function showModContextMenu(x, y, modName) {
    ctxModMenu.innerHTML = `
      <div class="context-menu-item" data-action="openMod">Open Mod Folder</div>
      <div class="context-menu-item" data-action="openGame">Open Game Mods Folder</div>
      <div class="context-menu-item" data-action="copyPath">Copy Mod Path</div>
      <div class="context-menu-item" data-action="refresh">Refresh Mods List</div>
    `;
    Array.from(ctxModMenu.children).forEach(item => {
      item.onclick = () => {
        const act = item.dataset.action;
        if (act === 'openMod')  api.openPath(`${currentDir}\\${modName}`);
        if (act === 'openGame') api.openPath(currentDir);
        if (act === 'copyPath') navigator.clipboard.writeText(`${currentDir}\\${modName}`);
        if (act === 'refresh')  showGame({ id: gameUL.querySelector('.active').dataset.id, modsDir: currentDir });
        hideModContextMenu();
      };
    });
    ctxModMenu.style.left    = `${x}px`;
    ctxModMenu.style.top     = `${y}px`;
    ctxModMenu.style.display = 'block';
  }
  function hideModContextMenu() {
    ctxModMenu.style.display = 'none';
  }
  document.addEventListener('click', e => {
    if (!ctxModMenu.contains(e.target)) hideModContextMenu();
  });

  /* ─── Show mod details + readme + screenshots ─────────────────────── */
  async function showDetails(name) {
    if (!name) return;
    if (statusFileV) statusFileV.textContent = name;
    modUL.querySelectorAll('li').forEach(li =>
      li.classList.toggle('active', li.textContent === name)
    );
    const info = await api.modInfo(currentDir, name);
    if (statusSizeV) statusSizeV.textContent = human(info.size);
    if (statusDateV) statusDateV.textContent = new Date(info.mtime).toLocaleString();

    // Extract Nexus mod ID from folder name
    const match = name.match(/-(\d+)(?:-|$)/);
    const modId = match ? match[1] : null;
    const nexusUrl = modId && currentGameId
      ? `https://www.nexusmods.com/${currentGameId}/mods/${modId}`
      : null;

    // Build HTML
    let html = `
      <h2>${name}</h2>
      <p><b>Path:</b> <code>${info.full}</code></p>
    `;
    // Insert Nexus link button
    if (nexusUrl) {
      html += `
        <p>
          <button type="button"
                  class="mod-url-btn"
                  data-url="${nexusUrl}">
            View on Nexus
          </button>
        </p>
      `;
    }

    html += `
      <ul>
        <li><b>Created:</b>  ${new Date(info.ctime).toLocaleString()}</li>
        <li><b>Modified:</b> ${new Date(info.mtime).toLocaleString()}</li>
        <li><b>Accessed:</b> ${new Date(info.atime).toLocaleString()}</li>
        <li><b>Size:</b>     ${human(info.size)}</li>
        <li><b>Files:</b>    ${info.files}</li>
        <li><b>Folders:</b>  ${info.folders}</li>
      </ul>
    `;

    const rd = await api.modReadme(currentDir, name);
    if (rd) {
      html += `
        <h3 style="margin-top:16px;color:var(--accent)">${rd.filename}</h3>
        <div class="readme">${api.markdownToHtml(rd.content)}</div>
      `;
    }

    const shots = await api.modScreenshots(currentDir, name);
    if (shots.length) {
      html += `
        <h3 style="margin-top:16px;color:var(--accent)">Screenshots</h3>
        <div class="screenshots">
      `;
      for (const sp of shots) {
        const url = 'file:///' + sp.replace(/\\/g, '/');
        html += `<img src="${url}" class="screenshot">`;
      }
      html += `</div>`;
    }

    details.innerHTML = html;

    // ─── New: Nexus URL button hookup ───────────────────────────────
    details
      .querySelectorAll('.mod-url-btn')
      .forEach(btn =>
        btn.addEventListener('click', () =>
          api.openExternal(btn.dataset.url)
        )
      );

    // ─── Screenshot lightbox hookup ─────────────────────────────────
    const grid = details.querySelector('.screenshots');
    if (grid) {
      grid.querySelectorAll('img.screenshot').forEach(img => {
        img.addEventListener('click', () => {
          lightboxImg.src = img.src;
          lightboxBackdrop.classList.add('active');
          lightboxImg.onload = () => {
            let w = lightboxImg.naturalWidth;
            let h = lightboxImg.naturalHeight;
            const maxW = window.innerWidth * 0.9;
            const maxH = window.innerHeight * 0.9;
            const ratio = Math.min(maxW / w, maxH / h, 1);
            w *= ratio;
            h *= ratio;
            const box = lightboxBackdrop.querySelector('.lightbox-modal');
            box.style.width  = `${w}px`;
            box.style.height = `${h + 80}px`;
          };
        });
      });
    }
  }

  /* ─── Scan mods ───────────────────────────────────────────────────── */
  async function scanMods() {
    if (!currentDir) { await showMessage('Select a game first.'); return; }
    const list = mods.length ? mods : await api.listMods(currentDir);
    if (!list.length) { await showMessage('No mods.'); return; }

    scanBackdrop.classList.add('active');
    scanTitle.textContent = 'Scanning Mods…';
    scanText.textContent  = '';
    scanProg.value        = 0;
    scanProg.max          = list.length;
    scanClose.disabled    = true;

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      try {
        const info = await api.modInfo(currentDir, m);
        scanText.textContent += `${m}: ${human(info.size)} (${info.files} files)\n`;
      } catch {
        scanText.textContent += `${m}: error\n`;
      }
      scanText.scrollTop = scanText.scrollHeight;
      scanProg.value = i + 1;
      await new Promise(r => setTimeout(r, 1));
    }
    scanClose.disabled = false;
  }
  scanClose.addEventListener('click', () => {
    scanBackdrop.classList.remove('active');
    scanText.textContent = '';
  });

  /* ─── Save/load order & export ───────────────────────────────────── */
  async function saveOrder() {
    if (!currentDir) return;
    await api.saveOrder(currentDir, mods);
    await showMessage('Order saved.');
  }
  async function loadOrder() {
    if (!currentDir) return;
    const ord = await api.loadOrder(currentDir);
    if (!ord) { await showMessage('No saved order.'); return; }
    mods.sort((a, b) => ord.indexOf(a) - ord.indexOf(b));
    renderModList();
  }
  function exportList(fmt) {
    if (!mods.length) return;
    api.exportMods(mods, fmt).then(async fn => {
      if (fn) await showMessage(`Exported → ${fn}`);
    });
  }

  /* ─── Start ───────────────────────────────────────────────────────── */
  init();
});
