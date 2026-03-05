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
  const dynamicIsoRefreshMs = Number.isFinite(opts.dynamicIsoRefreshMs) ? Math.max(0, opts.dynamicIsoRefreshMs) : 180;

  const nearIsoChunkDistance = Number.isFinite(opts.nearIsoChunkDistance) ? Math.max(0, opts.nearIsoChunkDistance) : 5;
  const midIsoChunkDistance = Number.isFinite(opts.midIsoChunkDistance) ? Math.max(nearIsoChunkDistance, opts.midIsoChunkDistance) : 8;
  const maxIsoChunkDistance = Number.isFinite(opts.maxIsoChunkDistance) ? Math.max(midIsoChunkDistance, opts.maxIsoChunkDistance) : 11;

  const staticIsoTickMs = Number.isFinite(opts.staticIsoTickMs) ? Math.max(0, opts.staticIsoTickMs) : 200;
  const cameraMoveEpsilon = Number.isFinite(opts.cameraMoveEpsilon) ? Math.max(0, opts.cameraMoveEpsilon) : 0.5;

  let mode = 'topdown';
  let originX = 0;
  let originY = 0;

  let lastCameraSnapshot = null;
  let lastStaticTick = -Infinity;

  function isChunkTextureKey(key) {
    return /^(chunk|wave|fog|buildarea|place|district|influence)_-?\d+_-?\d+$/.test(key);
  }

  function isDynamicChunkTextureKey(key) {
    return /^(wave|fog)_/.test(key);
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
    const gx = x / tileSize;
    const gy = y / tileSize;
    return gridToScreen(gx, gy);
  }

  function viewToWorld(x, y) {
    if (mode !== 'isometric') return { x, y };
    const g = screenToGrid(x, y);
    return { x: g.x * tileSize, y: g.y * tileSize };
  }

  function viewToTile(sx, sy) {
    if (mode !== 'isometric') {
      return { tx: Math.floor(sx / tileSize), ty: Math.floor(sy / tileSize) };
    }
    const g = screenToGrid(sx, sy);
    return { tx: Math.floor(g.x), ty: Math.floor(g.y) };
  }

  function tileToView(tx, ty) {
    if (mode !== 'isometric') {
      return { x: (tx + 0.5) * tileSize, y: (ty + 0.5) * tileSize };
    }
    return gridToScreen(tx + 0.5, ty + 0.5);
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

  function getChunkDistanceToCamera(textureKey) {
    const parsed = parseChunkKey(textureKey);
    if (!parsed) return Infinity;

    const camCenterX = camera.scrollX + camera.width * 0.5;
    const camCenterY = camera.scrollY + camera.height * 0.5;
    const camGX = camCenterX / tileSize;
    const camGY = camCenterY / tileSize;

    const chunkCenterGX = parsed.cx * chunkSize + chunkSize * 0.5;
    const chunkCenterGY = parsed.cy * chunkSize + chunkSize * 0.5;

    const dx = chunkCenterGX - camGX;
    const dy = chunkCenterGY - camGY;
    return Math.hypot(dx, dy) / chunkSize;
  }

  function getIsoQualityByDistance(textureKey) {
    const parsed = parseChunkKey(textureKey);
    if (!parsed) return { tier: 'near', visible: true, lodStep: 1, dynamic: true };

    const dist = getChunkDistanceToCamera(textureKey);
    if (dist > maxIsoChunkDistance) return { tier: 'hidden', visible: false, lodStep: 1, dynamic: false };
    if (dist > midIsoChunkDistance) return { tier: 'far', visible: true, lodStep: 4, dynamic: false };
    if (dist > nearIsoChunkDistance) return { tier: 'mid', visible: true, lodStep: 2, dynamic: false };
    return { tier: 'near', visible: true, lodStep: 1, dynamic: true };
  }

  function buildIsoChunkTexture(srcKey, optsBuild = {}) {
    const forceRebuild = !!optsBuild.forceRebuild;
    const lodStep = Math.max(1, optsBuild.lodStep ?? 1);

    const srcTex = scene.textures.get(srcKey);
    const srcImage = srcTex?.getSourceImage?.();
    if (!srcImage) return null;

    const cacheKey = `${srcKey}@lod${lodStep}`;
    const cached = isoTextureCache.get(cacheKey);
    const isoKey = cached?.isoKey ?? `iso_${cacheKey}`;

    if (!forceRebuild && cached && scene.textures.exists(isoKey)) return isoKey;

    if (forceRebuild && cached && scene.textures.exists(isoKey)) {
      const now = scene.time.now;
      const elapsed = now - (cached.lastBuildAt ?? -Infinity);
      if (elapsed < dynamicIsoRefreshMs) return isoKey;
    }

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

    for (let sum = 0; sum <= (chunkSize - 1) * 2; sum += lodStep) {
      for (let lx = 0; lx < chunkSize; lx += lodStep) {
        const ly = sum - lx;
        if (ly < 0 || ly >= chunkSize) continue;

        const srcX = lx * tileSize;
        const srcY = ly * tileSize;
        const drawSize = tileSize * lodStep;
        const tx = (lx - ly) * halfW + xOffset;
        const ty = (lx + ly) * halfH;

        ctx.save();
        ctx.setTransform(1, 0.5, -1, 0.5, tx, ty);
        ctx.globalAlpha = 1;
        ctx.drawImage(srcImage, srcX, srcY, drawSize, drawSize, 0, 0, drawSize, drawSize);
        ctx.restore();
      }
    }

    isoTex.refresh();
    isoTextureCache.set(cacheKey, { isoKey, lastBuildAt: scene.time.now });
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
    if (typeof obj.setVisible === 'function') obj.setVisible(true);
    if (base.textureKey && obj.texture?.key !== base.textureKey && scene.textures.exists(base.textureKey)) {
      obj.setTexture(base.textureKey);
    }
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
    if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth);
  }

  function applyIsometric(obj, base, tickStatic = false) {
    const tKey = base.textureKey ?? obj.texture?.key ?? '';

    if (isChunkTextureKey(tKey)) {
      const q = getIsoQualityByDistance(tKey);
      if (typeof obj.setVisible === 'function') obj.setVisible(q.visible);
      if (!q.visible) return;

      const isDynamic = isDynamicChunkTextureKey(tKey);
      if (!q.dynamic && isDynamic) return;

      const isDirtyDynamic = isDynamic && q.dynamic;
      if (!tickStatic && !isDirtyDynamic) return;

      const isoKey = buildIsoChunkTexture(tKey, {
        forceRebuild: isDirtyDynamic,
        lodStep: q.lodStep,
      });
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

    const isTileDiamond = !!obj.getData?.('isoTileDiamond');
    if (isTileDiamond) {
      if (typeof obj.setAngle === 'function') obj.setAngle((base.angle ?? 0) + 45);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * 0.5);
    } else {
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * 0.92);
    }

    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth + (p.y * 1e-4));
  }

  function applyObjectTransform(obj, tickStatic = false) {
    if (!obj || !obj.active) return;
    remember(obj);
    const base = baseState.get(obj);
    if (!base) return;

    if (mode === 'isometric') applyIsometric(obj, base, tickStatic);
    else applyTopdown(obj, base);
  }

  function applyAll(tickStatic = false) {
    for (const obj of scene.children.list) applyObjectTransform(obj, tickStatic);
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

  function captureCameraSnapshot() {
    return {
      x: camera.scrollX,
      y: camera.scrollY,
      zoom: camera.zoom,
    };
  }

  function isCameraChanged(next) {
    if (!lastCameraSnapshot) return true;
    const moved = Math.abs(lastCameraSnapshot.x - next.x) > cameraMoveEpsilon
      || Math.abs(lastCameraSnapshot.y - next.y) > cameraMoveEpsilon;
    const zoomed = Math.abs(lastCameraSnapshot.zoom - next.zoom) > 1e-5;
    return moved || zoomed;
  }

  function setMode(nextMode) {
    const normalized = nextMode === 'isometric' ? 'isometric' : 'topdown';
    if (normalized === mode) return;

    if (normalized === 'isometric') {
      captureTopdownSnapshot();
      syncOriginByCameraCenter();
      lastCameraSnapshot = null;
      lastStaticTick = -Infinity;
    }

    mode = normalized;
    applyAll(true);
  }

  function update() {
    if (mode !== 'isometric') return;

    for (const obj of scene.children.list) {
      if (!obj?.active) continue;
      if (!baseState.has(obj)) remember(obj);
    }

    const camSnap = captureCameraSnapshot();
    const cameraChanged = isCameraChanged(camSnap);
    const now = scene.time.now;
    const tickStatic = cameraChanged || (now - lastStaticTick) >= staticIsoTickMs;

    if (!tickStatic) return;

    syncOriginByCameraCenter();
    applyAll(tickStatic);

    lastCameraSnapshot = camSnap;
    if (tickStatic) lastStaticTick = now;
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
    update,
  };
}
