// src/world/game/uiManager.js
// DOM-based UI overlay (not affected by camera zoom).

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export class UIManager {
  constructor(scene, _infiniteCfg, gameCfg) {
    this.scene = scene;
    this.gameCfg = gameCfg;

    this.root = null;
    this.playerText = null;

    this.buildButtons = []; // { id, btn }
  }

  create() {
    // Inject styles once
    if (!document.getElementById("ui-style")) {
      const style = document.createElement("style");
      style.id = "ui-style";
      style.textContent = `
#ui-root {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  font-family: ${this.gameCfg.ui.fontFamily ?? "monospace"};
}
.ui-panel {
  pointer-events: auto;
  background: rgba(0,0,0,${this.gameCfg.ui.panelAlpha ?? 0.55});
  color: #fff;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 8px 26px rgba(0,0,0,0.35);
}
#ui-player {
  position: fixed;
  left: ${(this.gameCfg.ui.padding ?? 10)}px;
  top: ${(this.gameCfg.ui.padding ?? 10)}px;
  width: 320px;
  white-space: pre;
  font-size: ${this.gameCfg.ui.fontSize ?? "14px"};
  line-height: 1.25;
}
#ui-build {
  position: fixed;
  left: ${(this.gameCfg.ui.padding ?? 10)}px;
  bottom: ${(this.gameCfg.ui.padding ?? 10)}px;
  width: 420px;
}
#ui-build .title {
  font-size: ${this.gameCfg.ui.fontSize ?? "14px"};
  margin-bottom: 8px;
  opacity: 0.9;
}
#ui-build .grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ui-btn {
  pointer-events: auto;
  background: rgba(29,53,87,0.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: ${this.gameCfg.ui.fontSize ?? "14px"};
}
.ui-btn:hover { filter: brightness(1.08); }
.ui-btn.selected { background: rgba(42,157,143,0.95); }
.ui-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
      `;
      document.head.appendChild(style);
    }

    // Root
    this.root = document.getElementById("ui-root");
    if (!this.root) {
      this.root = el("div", "", document.body);
      this.root.id = "ui-root";
    }

    // Player panel
    const player = el("div", "ui-panel", this.root);
    player.id = "ui-player";
    this.playerText = el("div", "", player);
    this.playerText.textContent = "";

    // Build panel
    const build = el("div", "ui-panel", this.root);
    build.id = "ui-build";

    const title = el("div", "title", build);
    title.textContent = "Стройка";

    this.buildGrid = el("div", "grid", build);
  }

  // If pointer event target is inside UI, we treat it as UI hit.
  isPointerOverUI(pointer) {
    const t = pointer?.event?.target;
    if (!t) return false;
    return !!(t.closest && t.closest("#ui-root"));
  }

  setPlayerText(lines) {
    if (!this.playerText) return;
    this.playerText.textContent = lines.join("\n");
  }

  buildButtonsFromCatalogue(catalogue, onPick) {
    // clear
    if (this.buildGrid) this.buildGrid.innerHTML = "";
    this.buildButtons.length = 0;

    for (const t of catalogue) {
      const btn = document.createElement("button");
      btn.className = "ui-btn";
      btn.textContent = t.name;
      btn.type = "button";
      btn.addEventListener("click", () => onPick(t.id));
      this.buildGrid.appendChild(btn);

      this.buildButtons.push({ id: t.id, btn });
    }
  }

  highlightSelectedBuilding(id) {
    for (const b of this.buildButtons) {
      if (b.id === id) b.btn.classList.add("selected");
      else b.btn.classList.remove("selected");
    }
  }

  setBuildingEnabled(id, enabled) {
    const b = this.buildButtons.find(x => x.id === id);
    if (!b) return;
    b.btn.disabled = !enabled;
  }

  destroy() {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
  }
}
