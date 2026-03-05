export function createViewModeController(scene, opts = {}) {
  const camera = scene.cameras.main;

  const tileSize = Number.isFinite(opts.tileSize) ? opts.tileSize : 32;
  const chunkSize = Number.isFinite(opts.chunkSize) ? opts.chunkSize : 64;

  const tileW = Number.isFinite(opts.tileW) ? opts.tileW : tileSize * 2;
  const tileH = Number.isFinite(opts.tileH) ? opts.tileH : tileW / 2;
  const halfW = tileW / 2;
  const halfH = tileH / 2;

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

  function worldToView(x, y) {
    if (mode !== 'isometric') return { x, y };
    const gx = x / tileSize;
    const gy = y / tileSize;
    return gridToScreen(gx, gy);
  }

  function viewToWorld(x, y) {
    if (mode !== 'isometric') return { x, y };
    const g = screenToGrid(x, y);
    return { x: g.x * tileSize, y: g.y * tileSize };
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

    if (scene.textures.exists(isoKey)) scene.textures.remove(isoKey);
    const isoTex = scene.textures.createCanvas(isoKey, isoW, isoH);
    const ctx = isoTex.getContext();
    ctx.imageSmoothingEnabled = false;
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

  function applyTopdown(obj, base) {
    if (base.textureKey && obj.texture?.key !== base.textureKey && scene.textures.exists(base.textureKey)) {
      obj.setTexture(base.textureKey);
    }
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
    if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth);
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
      return;
    }

    const p = worldToView(base.x, base.y);
    if (typeof obj.setPosition === 'function') obj.setPosition(p.x, p.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * 0.92);
    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth + (p.y * 1e-4));
  }

  function applyObjectTransform(obj) {
    if (!obj || !obj.active) return;
    remember(obj);
    const base = baseState.get(obj);
    if (!base) return;

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
    update,
  };
}
