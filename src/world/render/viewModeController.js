const DEG_45 = Math.PI / 4;

export function createViewModeController(scene, opts = {}) {
  const camera = scene.cameras.main;

  const isoYScale = Number.isFinite(opts.isoYScale) ? opts.isoYScale : 0.5;
  const worldScale = Number.isFinite(opts.worldScale) ? opts.worldScale : 1;

  const baseState = new WeakMap();
  let mode = 'topdown';

  function worldToIso(x, y) {
    return {
      x: (x - y) * worldScale,
      y: (x + y) * isoYScale * worldScale,
    };
  }

  function isoToWorld(x, y) {
    const sx = x / worldScale;
    const sy = y / (isoYScale * worldScale);
    return {
      x: (sx + sy) * 0.5,
      y: (sy - sx) * 0.5,
    };
  }

  function remember(obj) {
    if (!obj || !obj.active) return;
    if (!baseState.has(obj)) {
      baseState.set(obj, {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        rotation: obj.rotation ?? 0,
        scaleX: obj.scaleX ?? 1,
        scaleY: obj.scaleY ?? 1,
        originX: obj.originX ?? 0.5,
        originY: obj.originY ?? 0.5,
      });
    }
  }

  function refreshBasePosition(obj, base) {
    if (mode !== 'isometric') {
      base.x = obj.x ?? base.x;
      base.y = obj.y ?? base.y;
      base.rotation = obj.rotation ?? base.rotation;
      base.scaleX = obj.scaleX ?? base.scaleX;
      base.scaleY = obj.scaleY ?? base.scaleY;
      return;
    }

    // In isometric mode, gameplay systems may still write logical world coords.
    // We detect this by checking if current object position differs from last projected position.
    const projected = worldToIso(base.x, base.y);
    const dx = Math.abs((obj.x ?? 0) - projected.x);
    const dy = Math.abs((obj.y ?? 0) - projected.y);
    if (dx > 0.001 || dy > 0.001) {
      base.x = obj.x ?? base.x;
      base.y = obj.y ?? base.y;
    }
  }

  function isTerrainLike(obj) {
    const key = obj?.texture?.key ?? '';
    return key.startsWith('chunk_') || key.startsWith('wave_') || key.startsWith('fog_') || key.startsWith('overlay_');
  }

  function applyObjectTransform(obj) {
    if (!obj || !obj.active || typeof obj.setPosition !== 'function') return;

    remember(obj);
    const base = baseState.get(obj);
    if (!base) return;

    refreshBasePosition(obj, base);

    if (mode === 'isometric') {
      const iso = worldToIso(base.x, base.y);
      obj.setPosition(iso.x, iso.y);

      if (typeof obj.setRotation === 'function' && typeof obj.setScale === 'function') {
        if (isTerrainLike(obj)) {
          obj.setRotation(base.rotation + DEG_45);
          obj.setScale(base.scaleX, base.scaleY * isoYScale);
          if (typeof obj.setOrigin === 'function') obj.setOrigin(0, 0);
        } else {
          obj.setRotation(base.rotation);
          obj.setScale(base.scaleX, base.scaleY * isoYScale);
        }
      }
    } else {
      obj.setPosition(base.x, base.y);
      if (typeof obj.setRotation === 'function') obj.setRotation(base.rotation);
      if (typeof obj.setScale === 'function') obj.setScale(base.scaleX, base.scaleY);
      if (isTerrainLike(obj) && typeof obj.setOrigin === 'function') obj.setOrigin(base.originX, base.originY);
    }
  }

  function applyAll() {
    for (const obj of scene.children.list) applyObjectTransform(obj);
  }

  function setMode(nextMode) {
    const normalized = nextMode === 'isometric' ? 'isometric' : 'topdown';
    if (normalized === mode) return;
    mode = normalized;
    camera.setAngle(0);
    applyAll();
  }

  function update() {
    if (mode !== 'isometric') return;
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
      return mode === 'isometric' ? worldToIso(x, y) : { x, y };
    },
    viewToWorld(x, y) {
      return mode === 'isometric' ? isoToWorld(x, y) : { x, y };
    },
    update,
  };
}
