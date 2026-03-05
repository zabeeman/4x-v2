const ISO_ANGLE_RAD = Math.PI / 4;

export function createViewModeController(scene, opts = {}) {
  const camera = scene.cameras.main;

  const isoScaleY = Number.isFinite(opts.isoYScale) ? opts.isoYScale : 0.5;
  const cos = Math.cos(ISO_ANGLE_RAD);
  const sin = Math.sin(ISO_ANGLE_RAD);

  const baseState = new WeakMap();
  let mode = 'topdown';
  let originX = 0;
  let originY = 0;

  function isTerrainLike(obj) {
    const key = obj?.texture?.key ?? '';
    return key.startsWith('chunk_')
      || key.startsWith('wave_')
      || key.startsWith('fog_')
      || key.startsWith('overlay_');
  }

  function projectWorld(x, y) {
    const rx = x * cos - y * sin;
    const ry = (x * sin + y * cos) * isoScaleY;
    return { x: originX + rx, y: originY + ry };
  }

  function unprojectView(x, y) {
    const dx = x - originX;
    const dy = (y - originY) / isoScaleY;
    return {
      x: dx * cos + dy * sin,
      y: dy * cos - dx * sin,
    };
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
    });
  }

  function applyTopdown(obj, base) {
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
    if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    if (typeof obj.setDepth === 'function') obj.setDepth(base.depth);
  }

  function applyIsometric(obj, base) {
    const p = projectWorld(base.x, base.y);
    if (typeof obj.setPosition === 'function') obj.setPosition(p.x, p.y);

    if (isTerrainLike(obj)) {
      if (typeof obj.setAngle === 'function') obj.setAngle(base.angle + 45);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * isoScaleY);
      if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    } else {
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY * isoScaleY);
    }

    if (typeof obj.setDepth === 'function') {
      const sortBias = (base.x + base.y) * 1e-4;
      obj.setDepth(base.depth + sortBias);
    }
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
      });
    }
  }

  function syncOriginByCameraCenter() {
    const cx = camera.scrollX + camera.width * 0.5;
    const cy = camera.scrollY + camera.height * 0.5;
    const rx = cx * cos - cy * sin;
    const ry = (cx * sin + cy * cos) * isoScaleY;
    originX = cx - rx;
    originY = cy - ry;
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
    worldToView(x, y) {
      return mode === 'isometric' ? projectWorld(x, y) : { x, y };
    },
    viewToWorld(x, y) {
      return mode === 'isometric' ? unprojectView(x, y) : { x, y };
    },
    update,
  };
}
