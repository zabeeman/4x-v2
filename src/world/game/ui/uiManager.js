// src/world/game/ui/uiManager.js
// DOM-based UI overlay (not affected by camera zoom).

import { localizePlacementReason } from '../sim/reasonCodes.js';
import { CATEGORIES as BUILDING_CATEGORIES } from '../sim/categories.js';

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

const CATEGORY_ORDER = [...BUILDING_CATEGORIES];

export class UIManager {
  constructor(scene, _infiniteCfg, gameCfg) {
    this.scene = scene;
    this.gameCfg = gameCfg;

    this.root = null;
    this.playerText = null;

    this.buildButtons = [];
    this.buildingsById = new Map();
    this.buildingsByCategory = new Map();
    this.categoryButtons = [];
    this.currentCategory = null;
    this.onPickBuilding = null;
    this.enabledById = new Map();
    this.selectedBuildingId = null;
    this.recommendedBuildingIds = new Set();
    this.recommendationHintText = '';
    this.buildRecommendBanner = null;

    this.recoBtn = null;
    this.screenBuildBtn = null;
    this.screenDoctrineBtn = null;
    this.buildScreenWrap = null;
    this.doctrineScreenWrap = null;
    this.doctrineWrap = null;
    this.doctrinePresetSelect = null;
    this.doctrineStatus = null;
    this.currentScreen = 'build';
    this.doctrineCategory = 'economy';
    this.doctrineFocusId = null;

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
    this.buildReasonText = null;
    this.buildTabRow = null;
    this.buildGrid = null;

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
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}
#ui-build .tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
.ui-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.ui-card-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.ui-card-name {
  font-weight: 600;
}
.ui-card-meta {
  font-size: 12px;
  opacity: 0.9;
}
.ui-card-effects,
.ui-card-req,
.ui-reasons {
  font-size: 12px;
  opacity: 0.9;
  white-space: pre-wrap;
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
.ui-card.recommended { border-color: rgba(74,222,128,0.9); box-shadow: inset 0 0 0 1px rgba(74,222,128,0.65); }
.ui-reco-banner { font-size: 12px; opacity: 0.95; color: #b7f7c6; margin: 6px 0; }
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
.ui-pill.unavailable { border-color: rgba(255,196,0,0.8); }
.ui-pill.forbidden { border-color: rgba(255,90,90,0.85); }
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
    title.textContent = "Управление";

    const screenRow = el('div', 'ui-row', build);
    this.screenBuildBtn = el('button', 'ui-btn selected', screenRow);
    this.screenBuildBtn.textContent = 'Каталог зданий';
    this.screenDoctrineBtn = el('button', 'ui-btn', screenRow);
    this.screenDoctrineBtn.textContent = 'Доктрины';

    this.buildScreenWrap = el('div', '', build);
    this.doctrineScreenWrap = el('div', '', build);
    this.doctrineScreenWrap.style.display = 'none';

    this.buildTabRow = el('div', 'tabs', this.buildScreenWrap);
    this.buildRecommendBanner = el('div', 'ui-reco-banner', this.buildScreenWrap);

    this.buildGrid = el("div", "grid", this.buildScreenWrap);
    this.buildGrid.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest("[data-building-id]");
      if (!btn) return;
      const buildingId = btn.getAttribute("data-building-id");
      if (!buildingId) return;
      this.setSelectedBuilding(buildingId);
      this.onPickBuilding?.(buildingId);
    });

    // Building help
    const helpTitle = el('div', 'ui-mini', this.buildScreenWrap);
    helpTitle.textContent = 'Справка по зданию:';
    this.buildInfoTitle = el('div', 'ui-status', this.buildScreenWrap);
    this.buildInfoTitle.style.fontWeight = '600';
    this.buildInfoText = el('div', 'ui-status', this.buildScreenWrap);
    this.buildInfoText.style.whiteSpace = 'pre-wrap';
    this.buildInfoText.style.opacity = '0.9';

    const reasonTitle = el('div', 'ui-mini', this.buildScreenWrap);
    reasonTitle.textContent = 'Причина недоступности (по наведению):';
    this.buildReasonText = el('div', 'ui-reasons', this.buildScreenWrap);
    this.buildReasonText.textContent = '—';

    const row = el('div', 'ui-row', this.buildScreenWrap);
    this.recoBtn = el('button', 'ui-btn', row);
    this.recoBtn.textContent = 'Рекомендовать по доктринам';

    // Overlays
    const ovTitle = el('div', 'ui-mini', this.buildScreenWrap);
    ovTitle.textContent = 'Оверлеи:';

    const ovRow = el('div', 'ui-row', this.buildScreenWrap);
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
    const extraTitle = el('div', 'ui-mini', this.buildScreenWrap);
    extraTitle.textContent = 'Инструменты:';

    const extraRow = el('div', 'ui-row', this.buildScreenWrap);
    this.btnDemolish = el('button', 'ui-btn', extraRow);
    this.btnDemolish.textContent = 'Снос: выкл';

    const infWrap = el('label', 'ui-check', extraRow);
    this.chkInfinite = el('input', '', infWrap);
    this.chkInfinite.type = 'checkbox';
    this.chkInfinite.checked = false;
    el('span', '', infWrap).textContent = '∞ ресурсы';

    // Trade routes
    const tTitle = el('div', 'ui-mini', this.buildScreenWrap);
    tTitle.textContent = 'Торговые маршруты (клик по хабам):';

    const trRow = el('div', 'ui-row', this.buildScreenWrap);
    this.routeLandBtn = el('button', 'ui-btn', trRow);
    this.routeLandBtn.textContent = 'Маршрут по земле';

    this.routeWaterBtn = el('button', 'ui-btn', trRow);
    this.routeWaterBtn.textContent = 'Маршрут по воде';

    this.routeCancelBtn = el('button', 'ui-btn', trRow);
    this.routeCancelBtn.textContent = 'Отмена';

    this.routeStatus = el('div', 'ui-status', this.buildScreenWrap);
    this.routeStatus.textContent = '';

    this.routeListWrap = el('div', 'ui-status', this.buildScreenWrap);
    this.routeListWrap.style.marginTop = '8px';

    // Doctrines screen
    const dTitle = el('div', 'ui-mini', this.doctrineScreenWrap);
    dTitle.textContent = 'Доктрины и реформы:';

    const presetRow = el('div', 'ui-row', this.doctrineScreenWrap);
    const pl = el('div', 'ui-mini', presetRow);
    pl.textContent = 'Готовый билд:';
    this.doctrinePresetSelect = el('select', 'ui-select', presetRow);

    this.doctrineStatus = el('div', 'ui-status', this.doctrineScreenWrap);
    this.doctrineWrap = el('div', 'ui-doctrines', this.doctrineScreenWrap);

    this.screenBuildBtn.onclick = () => this.setScreen('build');
    this.screenDoctrineBtn.onclick = () => this.setScreen('doctrine');
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
    this.onPickBuilding = onPick;
    this.buildingsById = new Map((catalogue ?? []).map((x) => [x.id, x]));
    this.buildingsByCategory.clear();

    for (const b of (catalogue ?? [])) {
      const cat = b.category ?? this._inferCategory(b);
      if (!this.buildingsByCategory.has(cat)) this.buildingsByCategory.set(cat, []);
      this.buildingsByCategory.get(cat).push(b);
      if (!this.enabledById.has(b.id)) this.enabledById.set(b.id, true);
    }

    for (const [cat, items] of this.buildingsByCategory.entries()) {
      items.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), 'ru'));
      this.buildingsByCategory.set(cat, items);
    }

    const firstCategory = CATEGORY_ORDER.find((c) => (this.buildingsByCategory.get(c)?.length ?? 0) > 0) ?? CATEGORY_ORDER[0];
    if (!this.currentCategory || !this.buildingsByCategory.has(this.currentCategory)) {
      this.currentCategory = firstCategory;
    }

    const allDefs = catalogue ?? [];

    this._renderCategoryTabs();
    this._renderBuildingCards();
  }

  _renderCategoryTabs() {
    if (!this.buildTabRow) return;
    this.buildTabRow.innerHTML = '';
    this.categoryButtons.length = 0;

    for (const category of CATEGORY_ORDER) {
      const btn = el('button', 'ui-btn', this.buildTabRow);
      btn.type = 'button';
      btn.textContent = this._prettyCategory(category);
      btn.style.padding = '6px 8px';
      btn.style.fontSize = '12px';
      btn.onclick = () => this.setCategory(category);
      btn.disabled = !this.buildingsByCategory.has(category);
      this.categoryButtons.push({ category, btn });
    }

    this._syncCategoryTabs();
  }

  _syncCategoryTabs() {
    for (const c of this.categoryButtons) {
      if (c.category === this.currentCategory) c.btn.classList.add('selected');
      else c.btn.classList.remove('selected');
    }
  }

  _renderBuildingCards() {
    if (this.buildGrid) this.buildGrid.innerHTML = '';
    this.buildButtons.length = 0;

    const list = this.buildingsByCategory.get(this.currentCategory) ?? [];
    for (const t of list) {
      const btn = document.createElement('button');
      btn.className = 'ui-btn ui-card';
      btn.type = "button";
      btn.setAttribute("data-building-id", t.id);

      const top = el('div', 'ui-card-top', btn);
      el('div', 'ui-card-name', top).textContent = t.name ?? t.id;
      const infoBtn = el('button', 'ui-btn', top);
      infoBtn.type = 'button';
      infoBtn.textContent = 'i';
      infoBtn.style.padding = '2px 8px';
      infoBtn.style.fontSize = '12px';
      infoBtn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.setBuildInfo(t);
      };

      el('div', 'ui-card-meta', btn).textContent = this._buildCostText(t);
      el('div', 'ui-card-meta', btn).textContent = this._buildUpkeepText(t);
      el('div', 'ui-card-meta', btn).textContent = this._buildBuildTimeText(t);
      el('div', 'ui-card-effects', btn).textContent = `Эффект: ${this._summarizeEffects(t)}`;
      el('div', 'ui-card-req', btn).textContent = `Требования: ${this._summarizeRequirements(t)}`;

      if (this.recommendedBuildingIds.has(t.id)) {
        btn.classList.add('recommended');
        el('div', 'ui-card-meta', btn).textContent = 'Рекомендовано доктринами';
      }

      btn.disabled = !this.enabledById.get(t.id);

      this.buildGrid.appendChild(btn);
      this.buildButtons.push({ id: t.id, btn });
    }

    this.highlightSelectedBuilding(this.selectedBuildingId);
  }

  _prettyCategory(category) {
    return String(category ?? 'Другое');
  }

  _inferCategory(def) {
    if (!def) return CATEGORY_ORDER[0] ?? 'Управление';
    if (def.category) return def.category;
    return CATEGORY_ORDER[0] ?? 'Управление';
  }

  _buildCostText(def) {
    const icon = { gold: '🪙', wood: '🪵', metal: '⛓️', marble: '🧱', glass: '🔷', powder: '💥', research: '📘' };
    const parts = Object.entries(def?.buildCost ?? def?.cost ?? {})
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${icon[k] ?? '•'} ${k}:${v}`);
    return `Стоимость: ${parts.join('  ') || 'бесплатно'}`;
  }

  _buildUpkeepText(def) {
    if (def?.upkeepPerMin) {
      const parts = Object.entries(def.upkeepPerMin)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${k}:${v}`);
      return `Содержание: ${parts.join('  ') || 'нет'}`;
    }

    const up = def?.upkeep ?? {};
    if (typeof up.goldPerMin === 'number' && up.goldPerMin > 0) {
      return `Содержание: gold:${up.goldPerMin.toFixed(2)}/мин`;
    }
    return 'Содержание: нет';
  }

  _buildBuildTimeText(def) {
    const t = def?.buildTimeSec ?? def?.buildTime ?? def?.economy?.buildTimePreset ?? null;
    return `Время: ${t ?? '—'}`;
  }

  _summarizeEffects(def) {
    const effects = def?.effects ?? [];
    if (effects.length > 0) {
      return effects
        .slice(0, 2)
        .map((e) => `${e.type}${e.resource ? `(${e.resource})` : ''} ${e.mode ?? ''} ${e.value ?? ''}`.trim())
        .join('; ');
    }

    const mods = def?.mods ?? [];
    if (mods.length > 0) {
      return mods
        .slice(0, 2)
        .map((m) => `${m.stat}: ${m.type === 'AddFlat' ? m.value : `${(m.value * 100).toFixed(1)}%`}`)
        .join('; ');
    }

    if (def?.extract?.resource) return `Добыча ${def.extract.resource}: +${def.extract.basePerMin ?? 0}/мин`;
    return '—';
  }

  _summarizeRequirements(def) {
    const req = [];
    const pr = def?.placementRules ?? def?.placeRules ?? {};
    if (pr.allowedSurfaces?.length) req.push(`surface: ${pr.allowedSurfaces.join('/')}`);
    if (pr.mustBeInsideBuildZone) req.push('zone: внутри зоны');
    if (pr.canBeOutsideBuildZone) req.push(`distance ≤ ${pr.maxDistanceToBuildZone ?? 0}`);
    if (pr.allowOutsideBuildAreaWithinTiles) req.push(`distance ≤ ${pr.allowOutsideBuildAreaWithinTiles}`);
    if (pr.requiresResourceNode?.type || def?.extract?.resource) req.push(`node: ${(pr.requiresResourceNode?.type ?? def.extract?.resource)}`);
    if (pr.requiresCoast) req.push('coast');
    if (pr.limit?.perCity) req.push(`limits city:${pr.limit.perCity}`);
    if (pr.limit?.perPlayer) req.push(`limits player:${pr.limit.perPlayer}`);
    return req.join('; ') || 'нет';
  }

  setDoctrineRecommendations({ ids, hintText } = {}) {
    this.recommendedBuildingIds = new Set(ids ?? []);
    this.recommendationHintText = hintText ?? '';
    if (this.buildRecommendBanner) {
      this.buildRecommendBanner.textContent = this.recommendationHintText || '';
    }
    this._renderBuildingCards();
  }

  setCategory(category) {
    if (!CATEGORY_ORDER.includes(category)) return;
    this.currentCategory = category;
    this._syncCategoryTabs();
    this._renderBuildingCards();
  }

  setSelectedBuilding(buildingId) {
    this.selectedBuildingId = buildingId;
    const def = buildingId ? this.buildingsById.get(buildingId) : null;
    const category = def ? (def.category ?? this._inferCategory(def)) : null;
    if (category && category !== this.currentCategory) this.setCategory(category);
    this.highlightSelectedBuilding(buildingId);
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

  setScreen(screen) {
    this.currentScreen = screen === 'doctrine' ? 'doctrine' : 'build';
    if (this.buildScreenWrap) this.buildScreenWrap.style.display = this.currentScreen === 'build' ? '' : 'none';
    if (this.doctrineScreenWrap) this.doctrineScreenWrap.style.display = this.currentScreen === 'doctrine' ? '' : 'none';
    if (this.screenBuildBtn) this.screenBuildBtn.classList.toggle('selected', this.currentScreen === 'build');
    if (this.screenDoctrineBtn) this.screenDoctrineBtn.classList.toggle('selected', this.currentScreen === 'doctrine');
  }

  setDoctrineHandlers({ onToggle, onApplyPreset, onFinalizeStart, onBeginPlanning, onCancelPlanning, onResetDraft, onProposeReform, onConfirmReform }) {
    this._onDoctrineToggle = onToggle;
    this._onDoctrineApplyPreset = onApplyPreset;
    this._onDoctrineFinalizeStart = onFinalizeStart;
    this._onDoctrineBeginPlanning = onBeginPlanning;
    this._onDoctrineCancelPlanning = onCancelPlanning;
    this._onDoctrineResetDraft = onResetDraft;
    this._onDoctrineProposeReform = onProposeReform;
    this._onDoctrineConfirmReform = onConfirmReform;
  }

  _renderDoctrineEffects(doc) {
    const fx = doc?.effects ?? doc?.mods ?? [];
    if (!fx.length) return '—';
    return fx.map((m) => {
      const v = m.type === 'AddFlat' ? `${m.value >= 0 ? '+' : ''}${m.value}` : `${((m.value ?? 0) * 100 >= 0 ? '+' : '')}${((m.value ?? 0) * 100).toFixed(1)}%`;
      return `${v} ${m.stat}`;
    }).join('; ');
  }

  renderDoctrineScreen(state) {
    if (!this.doctrineWrap) return;
    this.doctrineWrap.innerHTML = '';

    const groups = new Map(state.groups ?? []);
    const categories = state.categoryOrder ?? Array.from(groups.keys());
    if (!categories.includes(this.doctrineCategory)) this.doctrineCategory = categories[0] ?? 'economy';

    if (this.doctrinePresetSelect) {
      this.doctrinePresetSelect.innerHTML = '';
      const custom = document.createElement('option');
      custom.value = 'custom';
      custom.textContent = 'Кастом';
      this.doctrinePresetSelect.appendChild(custom);
      for (const p of (state.presets ?? [])) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nameRu ?? p.id;
        this.doctrinePresetSelect.appendChild(opt);
      }
      this.doctrinePresetSelect.value = state.presetId ?? 'custom';
      this.doctrinePresetSelect.onchange = () => this._onDoctrineApplyPreset?.(this.doctrinePresetSelect.value);
    }

    const top = el('div', 'ui-status', this.doctrineWrap);
    top.textContent = `Очки: осталось ${state.points?.remaining ?? 0} / всего ${state.points?.budget ?? 0}`;

    const tabRow = el('div', 'ui-row', this.doctrineWrap);
    for (const c of categories) {
      const btn = el('button', `ui-btn ${c === this.doctrineCategory ? 'selected' : ''}`, tabRow);
      btn.textContent = c;
      btn.style.padding = '4px 8px';
      btn.onclick = () => {
        this.doctrineCategory = c;
        this.renderDoctrineScreen(state);
      };
    }

    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gridTemplateColumns = '1.1fr 0.9fr';
    body.style.gap = '8px';
    body.style.marginTop = '6px';
    this.doctrineWrap.appendChild(body);

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '6px';
    body.appendChild(left);

    const right = document.createElement('div');
    right.className = 'ui-status';
    right.style.whiteSpace = 'pre-wrap';
    right.style.border = '1px solid rgba(255,255,255,0.2)';
    right.style.borderRadius = '8px';
    right.style.padding = '8px';
    body.appendChild(right);

    const docs = groups.get(this.doctrineCategory) ?? [];
    if (!this.doctrineFocusId || !docs.find((d) => d.id === this.doctrineFocusId)) this.doctrineFocusId = docs[0]?.id ?? null;

    for (const d of docs) {
      const card = el('button', 'ui-btn ui-card', left);
      card.type = 'button';
      const selected = (state.selectedIds ?? []).includes(d.id);
      if (selected) card.classList.add('selected');
      if (d.id === this.doctrineFocusId) card.style.outline = '2px solid rgba(255,255,255,0.5)';
      const av = state.availability?.(d.id) ?? { ok: true, status: 'available' };
      if (!av.ok && !selected) card.classList.add('locked');
      if (av.status === 'unavailable') card.classList.add('unavailable');
      if (av.status === 'forbidden') card.classList.add('forbidden');

      el('div', 'ui-card-name', card).textContent = `${d.ui?.nameRu ?? d.id} (${d.costPoints ?? 0} очк.)`;
      el('div', 'ui-card-meta', card).textContent = d.ui?.shortRu ?? d.balanceClass ?? '—';
      el('div', 'ui-card-effects', card).textContent = `+/-: ${this._renderDoctrineEffects(d)}`;
      card.onclick = () => {
        this.doctrineFocusId = d.id;
        this.renderDoctrineScreen(state);
      };

      const tBtn = el('button', 'ui-btn', card);
      tBtn.type = 'button';
      tBtn.style.marginTop = '6px';
      tBtn.textContent = selected ? 'Убрать' : 'Выбрать';
      tBtn.disabled = !av.ok && !selected;
      tBtn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._onDoctrineToggle?.(d.id);
      };
    }

    const focus = docs.find((d) => d.id === this.doctrineFocusId) ?? null;
    if (focus) {
      right.textContent = [
        focus.ui?.nameRu ?? focus.id,
        focus.ui?.descriptionRu ?? '—',
        `Эффекты: ${this._renderDoctrineEffects(focus)}`,
        `Конфликты: ${(focus.exclusiveGroups ?? []).join(', ') || '—'}`,
        `Требования: ${(focus.requires ?? []).join(', ') || '—'}`,
        `Запреты: ${(focus.forbids ?? []).join(', ') || '—'}`,
      ].join('
');
    } else {
      right.textContent = 'Нет доктрин в категории';
    }

    if (this.doctrineStatus) {
      this.doctrineStatus.innerHTML = '';
      const lines = [];
      if (state.phase === 'initial') lines.push('Режим старта: настрой набор и нажми «Применить».');
      if (state.phase === 'locked') lines.push('В партии изменение набора через режим планирования реформы.');
      if (state.phase === 'planning') lines.push('План реформы: собери будущий набор и нажми «Предложить реформу».');
      if (state.phase === 'reform') lines.push(`Реформа активна до хода ${state.reformProject?.endTurn ?? '—'}.`);
      if ((state.cooldownTurnsLeft ?? 0) > 0) lines.push(`КД реформы: ${state.cooldownTurnsLeft} ходов.`);
      if (state.reformProject?.state === 'PROPOSED') {
        const p = state.reformProject;
        lines.push(`Смета: ${p.durationTurns} ходов; changedPoints=${p.changedPoints}; cost gold:${p.cost?.gold ?? 0} wood:${p.cost?.wood ?? 0} metal:${p.cost?.metal ?? 0} marble:${p.cost?.marble ?? 0} glass:${p.cost?.glass ?? 0} powder:${p.cost?.powder ?? 0}`);
        if ((p.extremeCount ?? 0) > 0) lines.push('⚠ Экстремальные доктрины: возможен дисбаланс.');
      }
      const msg = document.createElement('div');
      msg.textContent = lines.join(' ');
      this.doctrineStatus.appendChild(msg);

      const actions = document.createElement('div');
      actions.className = 'ui-row';
      const btnApply = document.createElement('button');
      btnApply.className = 'ui-btn';
      btnApply.textContent = 'Применить (старт)';
      btnApply.disabled = state.phase !== 'initial';
      btnApply.onclick = () => this._onDoctrineFinalizeStart?.();
      actions.appendChild(btnApply);

      const btnPlan = document.createElement('button');
      btnPlan.className = 'ui-btn';
      btnPlan.textContent = 'План реформы';
      btnPlan.disabled = state.phase !== 'locked' || (state.cooldownTurnsLeft ?? 0) > 0;
      btnPlan.title = (state.cooldownTurnsLeft ?? 0) > 0 ? 'Реформа на кулдауне' : '';
      btnPlan.onclick = () => this._onDoctrineBeginPlanning?.();
      actions.appendChild(btnPlan);

      const btnPropose = document.createElement('button');
      btnPropose.className = 'ui-btn';
      btnPropose.textContent = 'Предложить реформу';
      btnPropose.disabled = state.phase !== 'planning';
      btnPropose.onclick = () => this._onDoctrineProposeReform?.();
      actions.appendChild(btnPropose);

      const btnConfirm = document.createElement('button');
      btnConfirm.className = 'ui-btn';
      btnConfirm.textContent = 'Подтвердить реформу';
      btnConfirm.disabled = !state.canConfirmReform;
      btnConfirm.onclick = () => this._onDoctrineConfirmReform?.();
      actions.appendChild(btnConfirm);

      const btnReset = document.createElement('button');
      btnReset.className = 'ui-btn';
      btnReset.textContent = 'Сброс';
      btnReset.disabled = !['initial', 'planning'].includes(state.phase);
      btnReset.onclick = () => this._onDoctrineResetDraft?.();
      actions.appendChild(btnReset);

      const btnCancel = document.createElement('button');
      btnCancel.className = 'ui-btn';
      btnCancel.textContent = 'Отменить план';
      btnCancel.disabled = state.phase !== 'planning';
      btnCancel.onclick = () => this._onDoctrineCancelPlanning?.();
      actions.appendChild(btnCancel);

      this.doctrineStatus.appendChild(actions);
    }
  }
  setBuildInfo(def) {
    if (!this.buildInfoTitle || !this.buildInfoText) return;
    if (!def) {
      this.buildInfoTitle.textContent = '';
      this.buildInfoText.textContent = '';
      return;
    }

    this.buildInfoTitle.textContent = def.name ?? def.id;

    // Prefer explicit description, otherwise auto-generate from stats/cost/upkeep/extract
    const lines = [];
    if (def.descriptionLong) lines.push(def.descriptionLong);
    else if (def.ui?.descriptionRu) lines.push(def.ui.descriptionRu);
    else if (def.desc) lines.push(def.desc);

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

  setBuildingInfo(def) {
    this.setBuildInfo(def);
  }

  setPlacementStatus({ ok, affordabilityOk, reasonsText, reasons } = {}) {
    if (!this.buildReasonText) return;

    const lines = [];
    if (ok && affordabilityOk) {
      lines.push('Можно строить.');
    } else if (ok && !affordabilityOk) {
      lines.push('Недостаточно ресурсов.');
    }

    if (typeof reasonsText === 'string' && reasonsText.trim()) {
      lines.push(reasonsText.trim());
    } else if (Array.isArray(reasons) && reasons.length) {
      for (const r of reasons) {
        lines.push(this._humanizeReason(r));
      }
    }

    this.buildReasonText.textContent = lines.join('\n') || '—';
  }

  _humanizeReason(reason) {
    if (!reason) return 'Причина неизвестна';
    const base = localizePlacementReason(reason, 'ru') || reason.code || 'Причина неизвестна';
    const d = reason.data ?? {};
    if (reason.code === 'FORBIDDEN_SURFACE' && d.surface) return `${base}: ${d.surface}`;
    if (reason.code === 'TOO_FAR_FROM_BUILD_ZONE') return `${base}: ${Math.ceil(d.dist ?? 0)} > ${Math.ceil(d.max ?? 0)} тайлов`;
    if (reason.code === 'NEEDS_RESOURCE_NODE' && d.type) return `${base}: ${d.type}`;
    if ((reason.code === 'LIMIT_REACHED_CITY' || reason.code === 'LIMIT_REACHED_PLAYER') && d.limit) return `${base} (${d.limit})`;
    return base;
  }



  highlightSelectedBuilding(id) {
    for (const b of this.buildButtons) {
      if (b.id === id) b.btn.classList.add("selected");
      else b.btn.classList.remove("selected");
    }
  }

  setBuildingEnabled(id, enabled) {
    this.enabledById.set(id, !!enabled);
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
