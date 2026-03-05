export function createViewModeController(scene, opts = {}) {
  const camera = scene.cameras.main;

  const isoScaleY = Number.isFinite(opts.isoScaleY) ? opts.isoScaleY : 0.56;
  const isoAngleDeg = Number.isFinite(opts.isoAngleDeg) ? opts.isoAngleDeg : -45;
  const isoZoomMul = Number.isFinite(opts.isoZoomMul) ? opts.isoZoomMul : 0.92;

  const baseScale = new WeakMap();
  let mode = 'topdown';
  let topdownZoom = camera.zoom;

  function remember(obj) {
    if (!obj || !obj.active || typeof obj.setScale !== 'function') return;
    if (!baseScale.has(obj)) baseScale.set(obj, { x: obj.scaleX ?? 1, y: obj.scaleY ?? 1 });
  }

  function applyObjectTransform(obj) {
    if (!obj || !obj.active || typeof obj.setScale !== 'function') return;
    remember(obj);
    const base = baseScale.get(obj);
    if (!base) return;

    if (mode === 'isometric') obj.setScale(base.x, base.y * isoScaleY);
    else obj.setScale(base.x, base.y);
  }

  function applyAll() {
    for (const obj of scene.children.list) applyObjectTransform(obj);
  }

  function setMode(nextMode) {
    const normalized = nextMode === 'isometric' ? 'isometric' : 'topdown';
    if (normalized === mode) return;

    if (normalized === 'isometric') {
      topdownZoom = camera.zoom;
      mode = 'isometric';
      camera.setAngle(isoAngleDeg);
      camera.setZoom(topdownZoom * isoZoomMul);
    } else {
      mode = 'topdown';
      camera.setAngle(0);
      camera.setZoom(topdownZoom);
    }

    applyAll();
  }

  function update() {
    if (mode !== 'isometric') return;
    for (const obj of scene.children.list) {
      if (!obj?.active || typeof obj.setScale !== 'function') continue;
      if (!baseScale.has(obj)) {
        baseScale.set(obj, { x: obj.scaleX ?? 1, y: obj.scaleY ?? 1 });
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
    update,
  };
}
