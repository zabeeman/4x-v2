// src/world/game/ui/uiManager.js
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

    this.buildButtons = [];

    this.presetSelect = null;
    this.recoBtn = null;
    this.doctrineWrap = null;

    // overlays
    this.chkDistrict = null;
    this.chkInfluence = null;
    this.chkBuildRadius = null;

    // demolish
    this.btnDemolish = null;
    this.demolishActive = false;

    // cheats
    this.chkInfinite = null;

    // trade route UI
    this.routeLandBtn = null;
    this.routeWaterBtn = null;
    this.routeCancelBtn = null;
    this.routeStatus = null;

    this.routeListWrap = null;

    // building help
    this.buildInfoTitle = null;
    this.buildInfoText = null;

    // placement hint overlay
    this.chkPlacement = null;
  }

  create() {
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
  width: 380px;
  white-space: pre;
  font-size: ${this.gameCfg.ui.fontSize ?? "14px"};
  line-height: 1.25;
}
#ui-build {
  position: fixed;
  left: ${(this.gameCfg.ui.padding ?? 10)}px;
  bottom: ${(this.gameCfg.ui.padding ?? 10)}px;
  width: 560px;
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
.ui-row { display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap: wrap; }
.ui-select { flex: 1; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.2); color:#fff; }
.ui-mini { font-size: 12px; opacity: 0.85; margin-top: 8px; }
.ui-doctrines { margin-top: 10px; display:flex; flex-direction:column; gap:6px; }
.ui-doctrines .group { display:flex; flex-wrap:wrap; gap:6px; }
.ui-pill { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 10px; cursor:pointer; font-size: 12px; }
.ui-pill.selected { background: rgba(42,157,143,0.95); }
.ui-pill.locked { opacity: 0.35; cursor:not-allowed; }
.ui-check { display:flex; gap:6px; align-items:center; font-size: 12px; opacity: 0.9; }
.ui-check input { transform: translateY(1px); }
.ui-status { font-size: 12px; opacity: 0.9; margin-top: 6px; }
      `;
      document.head.appendChild(style);
    }

    this.root = document.getElementById("ui-root");
    if (!this.root) {
      this.root = el("div", "", document.body);
      this.root.id = "ui-root";
    }

    const player = el("div", "ui-panel", this.root);
    player.id = "ui-player";
    this.playerText = el("div", "", player);

    const build = el("div", "ui-panel", this.root);
    build.id = "ui-build";

    const title = el("div", "title", build);
    title.textContent = "Стройка";

    this.buildGrid = el("div", "grid", build);

    // Building help
    const helpTitle = el('div', 'ui-mini', build);
    helpTitle.textContent = 'Справка по зданию:';
    this.buildInfoTitle = el('div', 'ui-status', build);
    this.buildInfoTitle.style.fontWeight = '600';
    this.buildInfoText = el('div', 'ui-status', build);
    this.buildInfoText.style.whiteSpace = 'pre-wrap';
    this.buildInfoText.style.opacity = '0.9';

    // Preset row
    const row = el('div', 'ui-row', build);
    const lbl = el('div', 'ui-mini', row);
    lbl.textContent = 'Пресет:';

    this.presetSelect = el('select', 'ui-select', row);

    this.recoBtn = el('button', 'ui-btn', row);
    this.recoBtn.textContent = 'Рекомендовать';

    // Overlays
    const ovTitle = el('div', 'ui-mini', build);
    ovTitle.textContent = 'Оверлеи:';

    const ovRow = el('div', 'ui-row', build);
    const dWrap = el('label', 'ui-check', ovRow);
    this.chkDistrict = el('input', '', dWrap);
    this.chkDistrict.type = 'checkbox';
    this.chkDistrict.checked = true;
    el('span', '', dWrap).textContent = 'Границы районов';

    const iWrap = el('label', 'ui-check', ovRow);
    this.chkInfluence = el('input', '', iWrap);
    this.chkInfluence.type = 'checkbox';
    this.chkInfluence.checked = true;
    el('span', '', iWrap).textContent = 'Влияние';

    const brWrap = el('label', 'ui-check', ovRow);
    this.chkBuildRadius = el('input', '', brWrap);
    this.chkBuildRadius.type = 'checkbox';
    this.chkBuildRadius.checked = true;
    el('span', '', brWrap).textContent = 'Зона застройки';

    const pWrap = el('label', 'ui-check', ovRow);
    this.chkPlacement = el('input', '', pWrap);
    this.chkPlacement.type = 'checkbox';
    this.chkPlacement.checked = true;
    el('span', '', pWrap).textContent = 'Размещение';

    // Demolish + cheats
    const extraTitle = el('div', 'ui-mini', build);
    extraTitle.textContent = 'Инструменты:';

    const extraRow = el('div', 'ui-row', build);
    this.btnDemolish = el('button', 'ui-btn', extraRow);
    this.btnDemolish.textContent = 'Снос: выкл';

    const infWrap = el('label', 'ui-check', extraRow);
    this.chkInfinite = el('input', '', infWrap);
    this.chkInfinite.type = 'checkbox';
    this.chkInfinite.checked = false;
    el('span', '', infWrap).textContent = '∞ ресурсы';

    // Trade routes
    const tTitle = el('div', 'ui-mini', build);
    tTitle.textContent = 'Торговые маршруты (клик по хабам):';

    const trRow = el('div', 'ui-row', build);
    this.routeLandBtn = el('button', 'ui-btn', trRow);
    this.routeLandBtn.textContent = 'Маршрут по земле';

    this.routeWaterBtn = el('button', 'ui-btn', trRow);
    this.routeWaterBtn.textContent = 'Маршрут по воде';

    this.routeCancelBtn = el('button', 'ui-btn', trRow);
    this.routeCancelBtn.textContent = 'Отмена';

    this.routeStatus = el('div', 'ui-status', build);
    this.routeStatus.textContent = '';

    this.routeListWrap = el('div', 'ui-status', build);
    this.routeListWrap.style.marginTop = '8px';

    // Doctrines
    const dTitle = el('div', 'ui-mini', build);
    dTitle.textContent = 'Доктрины:';
    this.doctrineWrap = el('div', 'ui-doctrines', build);
  }

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

  setPresetOptions(presets, onChange) {
    if (!this.presetSelect) return;
    this.presetSelect.innerHTML = '';
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name ?? p.id;
      this.presetSelect.appendChild(opt);
    }
    this.presetSelect.onchange = () => onChange(this.presetSelect.value);
  }

  setRecommendHandler(fn) {
    if (!this.recoBtn) return;
    this.recoBtn.onclick = fn;
  }

  setOverlayToggleHandler(fn) {
    const fire = () => fn({
      showDistrict: this.chkDistrict.checked,
      showInfluence: this.chkInfluence.checked,
      showBuildArea: this.chkBuildRadius.checked,
      showPlacement: this.chkPlacement ? this.chkPlacement.checked : false,
    });
    if (this.chkDistrict) this.chkDistrict.onchange = fire;
    if (this.chkInfluence) this.chkInfluence.onchange = fire;
    if (this.chkBuildRadius) this.chkBuildRadius.onchange = fire;
    if (this.chkPlacement) this.chkPlacement.onchange = fire;
  }

  setDemolishToggleHandler(fn) {
    if (!this.btnDemolish) return;
    this.btnDemolish.onclick = () => {
      this.setDemolishActive(!this.demolishActive);
      fn(this.demolishActive);
    };
  }

  setDemolishActive(active) {
    this.demolishActive = !!active;
    if (this.btnDemolish) {
      this.btnDemolish.textContent = this.demolishActive ? 'Снос: вкл' : 'Снос: выкл';
    }
  }

  setInfiniteResourcesHandler(fn) {
    if (!this.chkInfinite) return;
    this.chkInfinite.onchange = () => fn(this.chkInfinite.checked);
  }

  setTradeRouteHandlers({ onLand, onWater, onCancel }) {
    if (this.routeLandBtn) this.routeLandBtn.onclick = onLand;
    if (this.routeWaterBtn) this.routeWaterBtn.onclick = onWater;
    if (this.routeCancelBtn) this.routeCancelBtn.onclick = onCancel;
  }

  setTradeStatus(text) {
    if (!this.routeStatus) return;
    this.routeStatus.textContent = text ?? '';
  }

  renderRoutes(routes, cities, onDeleteManual) {
    if (!this.routeListWrap) return;

    const manual = (routes ?? []).filter(r => r.kind === 'manual');
    if (manual.length === 0) {
      this.routeListWrap.innerHTML = '<span style="opacity:0.75">Ручных маршрутов нет</span>';
      return;
    }

    const cityName = (id) => {
      const c = (cities ?? []).find(x => x.id === id);
      return c ? (c.hub?.typeId === 'house_1' ? 'Дом-1' : 'Хаб') : id;
    };

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '6px';

    for (const r of manual) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';

      const label = document.createElement('div');
      label.style.flex = '1';
      label.style.opacity = '0.9';
      label.textContent = `${r.mode === 'water' ? 'вода' : 'земля'}: ${cityName(r.aCityId)} → ${cityName(r.bCityId)}  (+${(r.goldPerMin ?? 0).toFixed(2)}/min)`;

      const del = document.createElement('button');
      del.className = 'ui-btn';
      del.textContent = 'Удалить';
      del.style.padding = '6px 10px';
      del.style.fontSize = '12px';
      del.onclick = () => onDeleteManual?.(r.id);

      row.appendChild(label);
      row.appendChild(del);
      wrap.appendChild(row);
    }

    this.routeListWrap.innerHTML = '';
    this.routeListWrap.appendChild(wrap);
  }

  renderDoctrines(groups, selectedIds, canPickFn, onPick) {
    if (!this.doctrineWrap) return;
    this.doctrineWrap.innerHTML = '';

    for (const [groupId, docs] of groups.entries()) {
      const groupRow = el('div', 'group', this.doctrineWrap);
      for (const d of docs) {
        const pill = el('div', 'ui-pill', groupRow);
        pill.textContent = d.name ?? d.id;

        const selected = selectedIds.includes(d.id);
        if (selected) pill.classList.add('selected');

        const canPick = canPickFn(d.id);
        if (!canPick && !selected) pill.classList.add('locked');

        pill.onclick = () => {
          if (!canPick && !selected) return;
          onPick(d.id);
        };
      }
    }
  }
  setBuildingInfo(def) {
    if (!this.buildInfoTitle || !this.buildInfoText) return;
    if (!def) {
      this.buildInfoTitle.textContent = '';
      this.buildInfoText.textContent = '';
      return;
    }

    this.buildInfoTitle.textContent = def.name ?? def.id;

    // Prefer explicit description, otherwise auto-generate from stats/cost/upkeep/extract
    const lines = [];
    if (def.desc) lines.push(def.desc);

    const cost = def.cost ?? {};
    const costParts = Object.entries(cost).filter(([,v]) => v>0).map(([k,v]) => `${k}:${v}`);
    if (costParts.length) lines.push(`Стоимость: ${costParts.join('  ')}`);

    const up = def.upkeep ?? {};
    if (typeof up.goldPerMin === 'number' && up.goldPerMin>0) lines.push(`Содержание: -${up.goldPerMin.toFixed(2)} зол/мин`);

    if (typeof def.buildAreaRadiusTiles === 'number' && def.buildAreaRadiusTiles>0) {
      lines.push(`Зона застройки: +${def.buildAreaRadiusTiles} тайлов вокруг здания`);
    }

    if (def.extract) {
      lines.push(`Добыча: ${def.extract.resource} +${def.extract.basePerMin}/мин (при наличии узла)`);
      if (def.placeRules?.allowOutsideBuildAreaWithinTiles) {
        lines.push(`Можно ставить вне зоны застройки, но не дальше ${def.placeRules.allowOutsideBuildAreaWithinTiles} тайлов от неё`);
      }
    }

    if (def.mods && def.mods.length) {
      const map = {
        GoldPerMinPct: 'Золото/мин',
        HappinessPct: 'Довольство',
        ResearchPerMinPct: 'Исследования/мин',
        ResourceYieldPct: 'Добыча ресурсов',
        BuildSpeedPct: 'Скорость строительства',
        TrainSpeedPct: 'Обучение войск',
        TradeShipSpeedPct: 'Скорость судов',
        TradeRadiusPct: 'Радиус торговли',
        CostCoeffPct: 'Стоимость',
        LandPowerPct: 'Сила сухопутных',
        NavalPowerPct: 'Сила флота',
        DiplomacyPct: 'Дипломатия',
        ScienceLevelPct: 'Уровень науки',
        TradeSlots: 'Слоты торговли',
        PopCap: 'Население',
        Influence: 'Влияние',
        Stability: 'Стабильность',
        Corruption: 'Коррупция',
        WarWeariness: 'Усталость от войны',
      };
      lines.push('Эффекты:');
      for (const m of def.mods) {
        const nm = map[m.stat] ?? m.stat;
        if (m.type === 'AddFlat') {
          const sign = m.value >= 0 ? '+' : '';
          lines.push(`  ${sign}${m.value} ${nm}`);
        } else {
          const pct = (m.value*100);
          const sign = pct >= 0 ? '+' : '';
          lines.push(`  ${sign}${pct.toFixed(1)}% ${nm}`);
        }
      }
    }

    this.buildInfoText.textContent = lines.join('\n');
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
