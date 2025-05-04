// renderer.js
/* ========================================================================
   ModNinja – renderer
   ========================================================================
   Handles all UI logic running in the BrowserWindow.
   ===================================================================== */
   window.addEventListener('DOMContentLoaded', () => {

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────
  
    const $ = sel => document.querySelector(sel);
  
    // create or return a DIV with a given id & optional class
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
  
    // prettify game IDs → “Fallout 4” etc.
    const fmtName = id => id
      .replace(/ \(custom\)/, '')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .replace(/[_\-]+/g, ' ')
      .trim();
  
    // format bytes → human-readable KB / MB / GB
    const human = bytes => {
      const units = ['B','KB','MB','GB','TB'];
      let i = 0;
      while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
      }
      return `${bytes.toFixed(1)} ${units[i]}`;
    };
  
    // ──────────────────────────────────────────────────────────────────────
    // Mini file-tree builder
    // ──────────────────────────────────────────────────────────────────────
  
    function buildFileTree(paths) {
      const root = { name: '', type: 'dir', children: [] };
  
      paths.forEach(rel => {
        const parts = rel.split(/[/\\]/);
        let node = root;
        parts.forEach((part, idx) => {
          const isDir = idx < parts.length - 1;
          let child = node.children.find(c => c.name === part);
          if (!child) {
            child = { name: part, type: isDir ? 'dir' : 'file', children: [] };
            node.children.push(child);
          } else if (isDir && child.type === 'file') {
            child.type = 'dir';
          }
          node = child;
        });
      });
  
      function render(nodes) {
        let html = '<ul class="tree">';
        nodes
          .sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'dir' ? -1 : 1;
          })
          .forEach(n => {
            const icon = n.type === 'dir' ? 'folder.png' : 'file.png';
            const caret = n.type === 'dir'
              ? '<span class="caret"></span>'
              : '<span class="caret-spacer"></span>';
            html += `
              <li data-type="${n.type}" class="${n.type === 'dir' ? 'collapsed' : ''}">
                <span class="row">
                  ${caret}
                  <img class="icon" src="assets/${icon}" alt="">
                  <span class="label">${n.name}</span>
                </span>
            `;
            if (n.children.length) html += render(n.children);
            html += '</li>';
          });
        html += '</ul>';
        return html;
      }
      return render(root.children);
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Inject simpler tree CSS (no connector lines)
    // ──────────────────────────────────────────────────────────────────────
  
    if (!document.getElementById('treeStyles')) {
      const style = document.createElement('style');
      style.id = 'treeStyles';
      style.textContent = `
        .tree, .tree ul {
          list-style: none;
          margin: 0;
          padding-left: 18px; /* indent for caret */
        }
        .tree li {
          margin: 2px 0;
        }
        .tree .row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 4px;
          border-radius: 4px;
          cursor: pointer;
          transition: background .15s;
        }
        .tree .row:hover {
          background: rgba(255,255,255,0.06);
        }
        .tree .icon {
          width: 16px;
          height: 16px;
        }
        .tree .caret {
          width: 14px;
          text-align: center;
          font-size: 9px;
          user-select: none;
        }
        .tree .caret::before {
          content: "\\25B6"; /* ▶ */
        }
        .tree li.expanded > .row > .caret::before {
          content: "\\25BC"; /* ▼ */
        }
        .tree .caret-spacer {
          width: 14px;
          display: inline-block;
        }
        .tree li.collapsed > ul {
          display: none;
        }
      `;
      document.head.appendChild(style);
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Mandatory DOM elements
    // ──────────────────────────────────────────────────────────────────────
  
    const scanBackdrop     = ensureDiv('scanBackdrop',     'modal-backdrop');
    const aboutBackdrop    = ensureDiv('aboutBackdrop',    'modal-backdrop');
    const dialogBackdrop   = ensureDiv('dialogBackdrop',   'modal-backdrop');
    const lightboxBackdrop = ensureDiv('lightboxBackdrop','modal-backdrop');
    const ctxModMenu       = ensureDiv('modContextMenu',   'context-menu');
    const ctxGameMenu      = ensureDiv('gameContextMenu',  'context-menu');
    const tooltip          = ensureDiv('toolbarTooltip',   'toolbar-tooltip');
  
    if (!dialogBackdrop.innerHTML.trim()) {
      dialogBackdrop.innerHTML = `
        <div class="modal dialog-modal">
          <div class="modal-header">
            <h3 id="dialogTitle">Title</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body"><div id="dialogMessage"></div></div>
          <div class="modal-footer">
            <button id="dialogCancel" class="cancel">Cancel</button>
            <button id="dialogOk" class="confirm">OK</button>
          </div>
        </div>`;
    }
  
    if (!lightboxBackdrop.innerHTML.trim()) {
      lightboxBackdrop.innerHTML = `
        <div class="modal lightbox-modal">
          <div class="modal-header">
            <h3>Preview</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <img id="lightboxImg" src="" alt="Screenshot">
          </div>
          <div class="modal-footer">
            <button id="lightboxClose" class="cancel">Close</button>
          </div>
        </div>`;
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Core DOM references
    // ──────────────────────────────────────────────────────────────────────
  
    const gameUL        = $('#gameList');
    const modUL         = $('#modList');
    const details       = $('#details');
    const scanTitle     = $('#scanTitle');
    const scanProg      = $('#scanProg');
    const scanText      = $('#scanText');
    const scanClose     = $('#scanClose');
    const aboutClose    = $('#aboutClose');
    const dialogTitle   = $('#dialogTitle');
    const dialogMsg     = $('#dialogMessage');
    const dialogOk      = $('#dialogOk');
    const dialogCancel  = $('#dialogCancel');
    const lightboxImg   = $('#lightboxImg');
    const lightboxClose = $('#lightboxClose');
    const gameSearch    = $('#gameSearch');
    const btnFilter     = $('#btnFilterGames');
    const btnToggle     = $('#btnToggleView');
    const statusGameV   = $('#statusGame .value');
    const statusFileV   = $('#statusFile .value');
    const statusSizeV   = $('#statusSizeMod .value');
    const statusDateV   = $('#statusModDate .value');
    const statusTotalV  = $('#statusTotalSize .value');
    const statusCountV  = $('#statusCount .value');
  
    if (!gameUL || !modUL || !details) {
      console.error('Critical UI elements missing – aborting renderer.');
      return;
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // State variables
    // ──────────────────────────────────────────────────────────────────────
  
    let games         = [];
    let mods          = [];
    let currentDir    = null;
    let currentGameId = '';
    let detailsSeq    = 0;             
    const modCache    = new Map();
    const api         = window.api;
  
    // ──────────────────────────────────────────────────────────────────────
    // Dialog helpers
    // ──────────────────────────────────────────────────────────────────────
  
    function showMessage(msg, title = 'Message') {
      dialogTitle.textContent = title;
      dialogMsg.textContent   = msg;
      dialogCancel.style.display = 'none';
      dialogOk.textContent    = 'OK';
      dialogBackdrop.classList.add('active');
      return new Promise(res => {
        const close = () => {
          dialogBackdrop.classList.remove('active');
          dialogOk.removeEventListener('click', close);
          res();
        };
        dialogOk.addEventListener('click', close);
      });
    }
  
    function showConfirm(msg, title = 'Confirm') {
      dialogTitle.textContent = title;
      dialogMsg.textContent   = msg;
      dialogCancel.style.display = '';
      dialogOk.textContent    = 'Yes';
      dialogBackdrop.classList.add('active');
      return new Promise(res => {
        const yes = () => { cleanup(); res(true); };
        const no  = () => { cleanup(); res(false); };
        function cleanup() {
          dialogBackdrop.classList.remove('active');
          dialogOk.removeEventListener('click', yes);
          dialogCancel.removeEventListener('click', no);
        }
        dialogOk.addEventListener('click', yes);
        dialogCancel.addEventListener('click', no);
      });
    }
  
    // close dialogs/lightbox on × or backdrop click
    dialogBackdrop.querySelector('.modal-close')
      .addEventListener('click', () => dialogBackdrop.classList.remove('active'));
    dialogBackdrop.addEventListener('click', e => {
      if (e.target === dialogBackdrop) dialogBackdrop.classList.remove('active');
    });
    lightboxBackdrop.querySelector('.modal-close')
      .addEventListener('click', () => lightboxBackdrop.classList.remove('active'));
    lightboxBackdrop.addEventListener('click', e => {
      if (e.target === lightboxBackdrop) lightboxBackdrop.classList.remove('active');
    });
    lightboxClose.addEventListener('click', () => lightboxBackdrop.classList.remove('active'));
  
    // ──────────────────────────────────────────────────────────────────────
    // Toolbar actions & tooltips
    // ──────────────────────────────────────────────────────────────────────
  
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
        const term = (gameSearch?.value || '').trim().toLowerCase();
        gameUL.querySelectorAll('li').forEach(li => {
          const t = li.querySelector('.title').textContent.toLowerCase();
          li.style.display = t.includes(term) ? '' : 'none';
        });
      },
      toggleView:  ()        => gameUL.classList.toggle('list-view')
    };
  
    document.querySelectorAll('#toolbar button').forEach(btn => {
      btn.addEventListener('click', () => actions[btn.dataset.cmd]?.());
      const tip = btn.dataset.tooltip;
      if (!tip) return;
      btn.addEventListener('mouseenter', () => {
        tooltip.textContent = tip;
        tooltip.classList.add('active');
        const r = btn.getBoundingClientRect();
        const x = Math.max(4, Math.min(
          r.left + (r.width - tooltip.offsetWidth) / 2,
          window.innerWidth - tooltip.offsetWidth - 4
        ));
        const y = Math.max(4, Math.min(
          r.bottom + 8,
          window.innerHeight - tooltip.offsetHeight - 4
        ));
        tooltip.style.left = `${x}px`;
        tooltip.style.top  = `${y}px`;
      });
      btn.addEventListener('mouseleave', () => tooltip.classList.remove('active'));
    });
  
    gameSearch?.addEventListener('input', () => actions.filterGames());
    btnFilter?.addEventListener('click',   () => actions.filterGames());
    btnToggle?.addEventListener('click',   () => actions.toggleView());
    aboutClose?.addEventListener('click',  () => aboutBackdrop.classList.remove('active'));
  
    // ──────────────────────────────────────────────────────────────────────
    // Games list initialization
    // ──────────────────────────────────────────────────────────────────────
  
    async function init(selectId = null) {
      games = await api.listGames();
      gameUL.textContent = '';
  
      for (const g of games) {
        const li = document.createElement('li');
        li.dataset.id = g.id;
        li.innerHTML = `
          <div class="thumb"></div>
          <div class="title">${fmtName(g.id)}</div>
        `;
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
  
    // ──────────────────────────────────────────────────────────────────────
    // Game context-menu
    // ──────────────────────────────────────────────────────────────────────
  
    function showGameContextMenu(x, y, game) {
      ctxGameMenu.innerHTML = `
        <div class="context-menu-item" data-action="openMods">Open Mods Folder</div>
        <div class="context-menu-item" data-action="openVortex">Open Vortex Folder</div>
        <div class="context-menu-item danger" data-action="deleteMods">Delete All Mods</div>
      `;
      ctxGameMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.onclick = async () => {
          const act = item.dataset.action;
          if (act === 'openMods') api.openPath(game.modsDir);
          if (act === 'openVortex') api.openPath(
            game.modsDir.replace(/\\/g,'/').replace(/\/mods$/,'')
          );
          if (act === 'deleteMods') {
            const ok = await showConfirm(
              `Delete ALL mods for “${fmtName(game.id)}”?`
            );
            if (ok) { await api.deleteMods(game.modsDir); init(game.id); }
          }
          ctxGameMenu.style.display = 'none';
        };
      });
      ctxGameMenu.style.left = `${x}px`;
      ctxGameMenu.style.top  = `${y}px`;
      ctxGameMenu.style.display = 'block';
    }
  
    document.addEventListener('click', e => {
      if (!ctxGameMenu.contains(e.target))
        ctxGameMenu.style.display = 'none';
    });
  
    // ──────────────────────────────────────────────────────────────────────
    // Show game → list mods & stats
    // ──────────────────────────────────────────────────────────────────────
  
    async function showGame(g) {
      if (!g) { await showMessage('Select a game first.'); return; }
  
      currentDir    = g.modsDir;
      currentGameId = g.id;
      statusGameV.textContent = fmtName(g.id);
  
      gameUL.querySelectorAll('li').forEach(li =>
        li.classList.toggle('active', li.dataset.id === g.id)
      );
  
      mods = modCache.get(g.id) || await api.listMods(currentDir);
      modCache.set(g.id, mods);
  
      statusCountV.textContent = mods.length.toString();
      if (!mods.length) { await showMessage('No mods found.'); return; }
  
      statusTotalV.classList.add('spinner');
      statusTotalV.textContent = '';
      renderModList();
  
      const stats = await api.dirStats(currentDir);
      statusTotalV.classList.remove('spinner');
      statusTotalV.textContent = human(stats.size);
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Render mod list
    // ──────────────────────────────────────────────────────────────────────
  
    function renderModList() {
      modUL.textContent = '';
      const frag = document.createDocumentFragment();
      mods.forEach(m => {
        const li = document.createElement('li');
        li.textContent = m;
        li.addEventListener('click', () => showDetails(m));
        li.addEventListener('dblclick', () => api.openPath(`${currentDir}\\${m}`));
        li.addEventListener('contextmenu', e => {
          e.preventDefault();
          showModContextMenu(e.pageX, e.pageY, m);
        });
        frag.append(li);
      });
      modUL.append(frag);
      modUL.firstElementChild && modUL.firstElementChild.click();
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Mod context-menu (with “View on Nexus”)
    // ──────────────────────────────────────────────────────────────────────
  
    function showModContextMenu(x, y, modName) {
      const idMatch  = modName.match(/-(\d+)(?:-|$)/);
      const modId    = idMatch ? idMatch[1] : null;
      const nexusUrl = (modId && currentGameId)
        ? `https://www.nexusmods.com/${currentGameId}/mods/${modId}`
        : null;
  
      ctxModMenu.innerHTML = `
        <div class="context-menu-item" data-action="openMod">Open Mod Folder</div>
        <div class="context-menu-item" data-action="openGame">Open Game Mods Folder</div>
        <div class="context-menu-item" data-action="copyPath">Copy Mod Path</div>
        ${nexusUrl ? '<div class="context-menu-item" data-action="openNexus">View on Nexus</div>' : ''}
        <div class="context-menu-item" data-action="refresh">Refresh Mods List</div>
      `;
      ctxModMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.onclick = () => {
          const act = item.dataset.action;
          if (act === 'openMod') api.openPath(`${currentDir}\\${modName}`);
          if (act === 'openGame') api.openPath(currentDir);
          if (act === 'copyPath') navigator.clipboard.writeText(`${currentDir}\\${modName}`);
          if (act === 'openNexus' && nexusUrl) api.openExternal(nexusUrl);
          if (act === 'refresh') showGame({
            id: gameUL.querySelector('.active').dataset.id,
            modsDir: currentDir
          });
          ctxModMenu.style.display = 'none';
        };
      });
      ctxModMenu.style.left = `${x}px`;
      ctxModMenu.style.top  = `${y}px`;
      ctxModMenu.style.display = 'block';
    }
  
    document.addEventListener('click', e => {
      if (!ctxModMenu.contains(e.target))
        ctxModMenu.style.display = 'none';
    });
  
    // ──────────────────────────────────────────────────────────────────────
    // Show details (with mini file-tree)
    // ──────────────────────────────────────────────────────────────────────
  
    async function showDetails(name) {
      if (!name) return;
  
      const seq = ++detailsSeq;
  
      statusFileV.textContent = name;
      modUL.querySelectorAll('li').forEach(li =>
        li.classList.toggle('active', li.textContent === name)
      );
  
      const [info, readme, shots, tree] = await Promise.all([
        api.modInfo(currentDir, name),
        api.modReadme(currentDir, name),
        api.modScreenshots(currentDir, name),
        api.modTree(currentDir, name)
      ]);
      if (seq !== detailsSeq) return;
  
      statusSizeV.textContent = human(info.size);
      statusDateV.textContent = new Date(info.mtime).toLocaleString();
  
      const idMatch  = name.match(/-(\d+)(?:-|$)/);
      const nexusUrl = idMatch && currentGameId
        ? `https://www.nexusmods.com/${currentGameId}/mods/${idMatch[1]}`
        : null;
  
      let html = `
        <h2>${name}</h2>
        <p><b>Path:</b> <code>${info.full}</code></p>
      `;
      if (nexusUrl) {
        html += `
          <p>
            <button class="mod-url-btn" data-url="${nexusUrl}">
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
  
      if (readme) {
        html += `
          <h3 style="margin-top:16px;color:var(--accent)">${readme.filename}</h3>
          <div class="readme">${api.markdownToHtml(readme.content)}</div>
        `;
      }
  
      if (shots.length) {
        html += `
          <h3 style="margin-top:16px;color:var(--accent)">Screenshots</h3>
          <div class="screenshots">
        `;
        shots.forEach(sp => {
          const url = 'file:///' + sp.replace(/\\/g,'/');
          html += `<img src="${url}" class="screenshot">`;
        });
        html += `</div>`;
      }
  
      if (tree.length) {
        html += `
          <h3 style="margin-top:16px;color:var(--accent)">Contents</h3>
          <div id="miniTree">${buildFileTree(tree)}</div>
        `;
      }
  
      details.innerHTML = html;
  
      details.querySelectorAll('.mod-url-btn').forEach(btn =>
        btn.addEventListener('click', () => api.openExternal(btn.dataset.url))
      );
  
      details.querySelectorAll('img.screenshot').forEach(img =>
        img.addEventListener('click', () => {
          lightboxImg.src = img.src;
          lightboxBackdrop.classList.add('active');
        })
      );
  
      const miniTree = details.querySelector('#miniTree');
      if (miniTree) {
        miniTree.addEventListener('click', e => {
          const row = e.target.closest('.row');
          if (!row) return;
          const li = row.parentElement;
          li.classList.toggle('collapsed');
          li.classList.toggle('expanded');
        });
      }
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Scan mods dialog
    // ──────────────────────────────────────────────────────────────────────
  
    async function scanMods() {
      if (!currentDir) { await showMessage('Select a game first.'); return; }
      const list = mods.length ? mods : await api.listMods(currentDir);
      if (!list.length) { await showMessage('No mods.'); return; }
  
      scanBackdrop.classList.add('active');
      scanTitle.textContent = 'Scanning Mods…';
      scanText.textContent  = '';
      scanProg.max   = list.length;
      scanProg.value = 0;
      scanClose.disabled = true;
  
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
  
    // ──────────────────────────────────────────────────────────────────────
    // Save / load mod order, export lists
    // ──────────────────────────────────────────────────────────────────────
  
    async function saveOrder() {
      if (!currentDir) return;
      await api.saveOrder(currentDir, mods);
      await showMessage('Order saved.');
    }
  
    async function loadOrder() {
      if (!currentDir) return;
      const ord = await api.loadOrder(currentDir);
      if (!ord) { await showMessage('No saved order found.'); return; }
      mods.sort((a, b) => ord.indexOf(a) - ord.indexOf(b));
      renderModList();
    }
  
    function exportList(fmt) {
      if (!mods.length) return;
      api.exportMods(mods, fmt).then(async fn => {
        if (fn) await showMessage(`Exported → ${fn}`);
      });
    }
  
    // ──────────────────────────────────────────────────────────────────────
    // Boot
    // ──────────────────────────────────────────────────────────────────────
  
    init();
  
  });
  