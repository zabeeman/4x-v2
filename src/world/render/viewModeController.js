const ISO_ANGLE_DEG = 45;

export function createViewModeController(scene, opts = {}) {
  const isoScaleY = Number.isFinite(opts.isoYScale) ? opts.isoYScale : 0.5;

  const baseState = new WeakMap();
  let mode = 'topdown';

  function isTerrainLike(obj) {
    const key = obj?.texture?.key ?? '';
    return key.startsWith('chunk_') || key.startsWith('wave_');
  }

  function remember(obj) {
    if (!obj || !obj.active) return;
    if (baseState.has(obj)) return;

    baseState.set(obj, {
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      rotation: obj.rotation ?? 0,
      angle: obj.angle ?? 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      originX: obj.originX ?? 0.5,
      originY: obj.originY ?? 0.5,
    });
  }

  function applyTopdown(obj, base) {
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);
    if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
    if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
    if (typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
  }

  function applyIsometric(obj, base) {
    if (typeof obj.setPosition === 'function') obj.setPosition(base.x, base.y);

    if (typeof obj.setScale === 'function') {
      obj.setScale(base.scaleX, base.scaleY * isoScaleY);
    }

    if (isTerrainLike(obj)) {
      if (typeof obj.setAngle === 'function') obj.setAngle(base.angle + ISO_ANGLE_DEG);
    } else {
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
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

  function setMode(nextMode) {
    const normalized = nextMode === 'isometric' ? 'isometric' : 'topdown';
    if (normalized === mode) return;

    // snapshot current top-down state before entering isometric
    if (normalized === 'isometric') {
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
        });
      }
    }

    mode = normalized;
    applyAll();
  }

  function update() {
    if (mode !== 'isometric') return;
    for (const obj of scene.children.list) {
      if (!obj?.active) continue;
      if (!baseState.has(obj)) {
        remember(obj);
        applyObjectTransform(obj);
      }
    }
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
      return { x, y };
    },
    viewToWorld(x, y) {
      return { x, y };
    },
    update,
  };
}
