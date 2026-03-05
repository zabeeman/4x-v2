import { createCoordinateService } from './coordinateService.js';

export function createViewModeController(scene, opts = {}) {
  const camera = scene.cameras.main;

  const tileSize = Number.isFinite(opts.tileSize) ? opts.tileSize : 32;
  const chunkSize = Number.isFinite(opts.chunkSize) ? opts.chunkSize : 64;

  const tileW = Number.isFinite(opts.tileW) ? opts.tileW : tileSize * 2;
  const tileH = Number.isFinite(opts.tileH) ? opts.tileH : tileW / 2;
  const halfW = tileW / 2;
  const halfH = tileH / 2;

  const coords = createCoordinateService(scene, { tileSize, tileW, tileH });

  const baseState = new WeakMap();
  const isoTextureCache = new Map();

  let mode = 'topdown';
  let originX = 0;
  let originY = 0;

  function isChunkTextureKey(key) {
    return /^(chunk|wave|fog|buildarea|place|district|influence)_-?\d+_-?\d+$/.test(key);
  }

  function isDynamicChunkTextureKey(key) {
    return /^(wave|fog|buildarea|place|district|influence)_/.test(key);
  }

  function parseChunkKey(key) {
    const m = key.match(/^([a-z]+)_(-?\d+)_(-?\d+)$/);
    if (!m) return null;
    return { kind: m[1], cx: Number(m[2]), cy: Number(m[3]) };
  }

  function gridToScreen(gx, gy) {
    return {
      x: originX + (gx - gy) * halfW,
      y: originY + (gx + gy) * halfH,
    };
  }

  function screenToGrid(sx, sy) {
    const dx = sx - originX;
    const dy = sy - originY;
    return {
      x: (dx / halfW + dy / halfH) / 2,
      y: (dy / halfH - dx / halfW) / 2,
    };
  }

  function viewDeltaToWorldDelta(dx, dy) {
    if (mode !== 'isometric') return { x: dx, y: dy };
    const dgx = (dx / halfW + dy / halfH) / 2;
    const dgy = (dy / halfH - dx / halfW) / 2;
    return { x: dgx * tileSize, y: dgy * tileSize };
  }

  function worldToView(x, y) {
    if (mode !== 'isometric') return { x, y };
    const iso = coords.worldToIsoScreen(x, y);
    return { x: iso.sx, y: iso.sy };
  }

  function viewToWorld(x, y) {
    if (mode !== 'isometric') return { x, y };
    const w = coords.isoScreenToWorld(x, y);
    return { x: w.wx, y: w.wy };
  }


  function screenToWorld(px, py) {
    const view = coords.screenToWorld(px, py);
    return viewToWorld(view.x, view.y);
  }

  function viewToTile(sx, sy) {
    const world = viewToWorld(sx, sy);
    return coords.worldToTile(world.x, world.y);
  }

  function tileToView(tx, ty) {
    if (mode !== 'isometric') {
      const anchor = coords.tileToWorldAnchor(tx, ty);
      return { x: anchor.wx, y: anchor.wy };
    }
    const iso = coords.tileToIsoScreen(tx, ty);
    return { x: iso.sx, y: iso.sy };
  }

  function remember(obj) {
    if (!obj || !obj.active || baseState.has(obj)) return;
    baseState.set(obj, {
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      rotation: obj.rotation ?? 0,
      angle: obj.angle ?? 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      originX: obj.originX ?? 0.5,
      originY: obj.originY ?? 0.5,
      depth: obj.depth ?? 0,
      textureKey: obj.texture?.key ?? null,
      appliedX: null,
      appliedY: null,
    });
  }

  function buildIsoChunkTexture(srcKey, forceRebuild = false) {
    const srcTex = scene.textures.get(srcKey);
    const srcImage = srcTex?.getSourceImage?.();
    if (!srcImage) return null;

    const cached = isoTextureCache.get(srcKey);
    const isoKey = cached?.isoKey ?? `iso_${srcKey}`;

    if (!forceRebuild && cached && scene.textures.exists(isoKey)) return isoKey;

    const isoW = chunkSize * tileW;
    const isoH = chunkSize * tileH;

    const isoTex = scene.textures.exists(isoKey)
      ? scene.textures.get(isoKey)
      : scene.textures.createCanvas(isoKey, isoW, isoH);
    const ctx = isoTex.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, isoW, isoH);

    const xOffset = (chunkSize - 1) * halfW;

    for (let sum = 0; sum <= (chunkSize - 1) * 2; sum++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const ly = sum - lx;
        if (ly < 0 || ly >= chunkSize) continue;

        const srcX = lx * tileSize;
        const srcY = ly * tileSize;
        const tx = (lx - ly) * halfW + xOffset;
        const ty = (lx + ly) * halfH;

        ctx.save();
        ctx.setTransform(1, 0.5, -1, 0.5, tx, ty);
        ctx.globalAlpha = 1;
        ctx.drawImage(srcImage, srcX, srcY, tileSize, tileSize, 0, 0, tileSize, tileSize);
        ctx.restore();
      }
    }

    isoTex.refresh();
    isoTextureCache.set(srcKey, { isoKey });
    return isoKey;
  }

  function chunkWorldToView(base, textureKey) {
    const parsed = parseChunkKey(textureKey);
    if (!parsed) return { x: base.x, y: base.y };

    const gx = parsed.cx * chunkSize;
    const gy = parsed.cy * chunkSize;
    const p = gridToScreen(gx, gy);
    const xOffset = (chunkSize - 1) * halfW;
    return { x: p.x - xOffset, y: p.y };
  }


  function refreshBaseFromObject(obj, base) {
    const tKey = base.textureKey ?? obj.texture?.key ?? '';
    if (isChunkTextureKey(tKey)) return;

    const ax = base.appliedX;
    const ay = base.appliedY;
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
      base.x = obj.x ?? base.x;
      base.y = obj.y ?? base.y;
      base.rotation = obj.rotation ?? base.rotation;
      base.scaleX = obj.scaleX ?? base.scaleX;
      base.scaleY = obj.scaleY ?? base.scaleY;
      return;
    }

    const movedByGame = Math.abs((obj.x ?? 0) - ax) > 0.001 || Math.abs((obj.y ?? 0) - ay) > 0.001;
    if (movedByGame) {
      base.x = obj.x ?? base.x;
      base.y = obj.y ?? base.y;
      base.rotation = obj.rotation ?? base.rotation;
      base.scaleX = obj.scaleX ?? base.scaleX;
      base.scaleY = obj.scaleY ?? base.scaleY;
    }
  }

  function applyTopdown(obj, base) {
    if (base.textureKey && obj.texture?.key !== base.textureKey && scene.textures.exists(base.textureKey)) {
      obj.setTexture(base.textureKey);
    }
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
    if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth);
    base.appliedX = obj.x ?? null;
    base.appliedY = obj.y ?? null;
  }

  function applyIsometric(obj, base) {
    const tKey = base.textureKey ?? obj.texture?.key ?? '';

    if (isChunkTextureKey(tKey)) {
      const isoKey = buildIsoChunkTexture(tKey, isDynamicChunkTextureKey(tKey));
      if (isoKey && obj.texture?.key !== isoKey) obj.setTexture(isoKey);
      const p = chunkWorldToView(base, tKey);
      if (typeof obj.setPosition === 'function') obj.setPosition(p.x, p.y);
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
      if (typeof obj.setOrigin === 'function') obj.setOrigin(0, 0);
      if (typeof obj.setDepth === 'function') obj.setDepth(base.depth + (p.y * 1e-4));
      base.appliedX = obj.x ?? null;
      base.appliedY = obj.y ?? null;
      return;
    }

    const p = worldToView(base.x, base.y);
    if (typeof obj.setPosition === 'function') obj.setPosition(p.x, p.y);

    const isTileDiamond = !!obj.getData?.('isoTileDiamond');
    if (isTileDiamond) {
      if (typeof obj.setAngle === 'function') obj.setAngle((base.angle ?? 0) + 45);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * 0.5);
    } else {
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * 0.92);
    }

    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth + (p.y * 1e-4));
    base.appliedX = obj.x ?? null;
    base.appliedY = obj.y ?? null;
  }

  function applyObjectTransform(obj) {
    if (!obj || !obj.active) return;
    remember(obj);
    const base = baseState.get(obj);
    if (!base) return;

    refreshBaseFromObject(obj, base);

    if (mode === 'isometric') applyIsometric(obj, base);
    else applyTopdown(obj, base);
  }

  function applyAll() {
    for (const obj of scene.children.list) applyObjectTransform(obj);
  }

  function captureTopdownSnapshot() {
    for (const obj of scene.children.list) {
      if (!obj?.active) continue;
      baseState.set(obj, {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        rotation: obj.rotation ?? 0,
        angle: obj.angle ?? 0,
        scaleX: obj.scaleX ?? 1,
        scaleY: obj.scaleY ?? 1,
        originX: obj.originX ?? 0.5,
        originY: obj.originY ?? 0.5,
        depth: obj.depth ?? 0,
        textureKey: obj.texture?.key ?? null,
      appliedX: null,
      appliedY: null,
      });
    }
  }

  function syncOriginByCameraCenter() {
    const worldCX = camera.scrollX + camera.width * 0.5;
    const worldCY = camera.scrollY + camera.height * 0.5;
    const gx = worldCX / tileSize;
    const gy = worldCY / tileSize;
    originX = worldCX - (gx - gy) * halfW;
    originY = worldCY - (gx + gy) * halfH;
  }

  function setMode(nextMode) {
    const normalized = nextMode === 'isometric' ? 'isometric' : 'topdown';
    if (normalized === mode) return;

    if (normalized === 'isometric') {
      captureTopdownSnapshot();
      syncOriginByCameraCenter();
    }

    mode = normalized;
    applyAll();
  }

  function update() {
    if (mode !== 'isometric') return;

    for (const obj of scene.children.list) {
      if (!obj?.active) continue;
      if (!baseState.has(obj)) remember(obj);
    }

    syncOriginByCameraCenter();
    applyAll();
  }

  return {
    setMode,
    toggleMode() {
      setMode(mode === 'topdown' ? 'isometric' : 'topdown');
      return mode;
    },
    getMode() {
      return mode;
    },
    worldToView,
    viewToWorld,
    viewToTile,
    tileToView,
    viewDeltaToWorldDelta,
    screenToWorld,
    worldToTile: coords.worldToTile,
    tileToWorldAnchor: coords.tileToWorldAnchor,
    tileToIsoScreen: coords.tileToIsoScreen,
    update,
  };
}
