import { gridToScreen } from './isoProjector.js';

export function createViewModeController(cfg, deps = {}) {
  const state = {
    cfg,
    chunkMgr: deps.chunkMgr,
    fog: deps.fog,
    overlays: deps.overlays,
    build: deps.build,
    units: deps.units,
    routeRenderer: deps.routeRenderer,
    cameraCtl: deps.cameraCtl,
    camera: deps.camera,
  };

  function syncCamera(anchorTile = null) {
    if (!state.camera) return;
    if (!anchorTile) return;
    const p = gridToScreen(anchorTile.tx + 0.5, anchorTile.ty + 0.5, state.cfg);
    state.camera.centerOn(p.x, p.y);
    state.cameraCtl?.setFocus?.(p.x, p.y);
  }

  function apply(mode, opts = {}) {
    const nextIso = mode === 'iso';
    if (!!state.cfg.isoMode === nextIso) return false;

    const anchor = opts.anchorTile ?? null;
    state.cfg.isoMode = nextIso;

    state.chunkMgr?.refreshProjection?.();
    state.fog?.refreshProjection?.();
    state.overlays?.refreshProjection?.();
    state.build?.refreshProjection?.();
    state.units?.refreshProjection?.();
    state.routeRenderer?.invalidate?.();

    syncCamera(anchor);
    return true;
  }

  function toggle(opts = {}) {
    return apply(state.cfg.isoMode ? 'topdown' : 'iso', opts);
  }

  function getMode() {
    return state.cfg.isoMode ? 'iso' : 'topdown';
  }

  return { apply, toggle, getMode };
}
