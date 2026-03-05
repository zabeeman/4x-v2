import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultInfiniteConfig } from '../src/world/infinite/infiniteConfig.js';
import { gridToScreen, screenToGrid, snapGrid } from '../src/world/render/isoProjector.js';
import { validatePlacement } from '../src/world/game/sim/placementValidator.js';
import { getChunkBounds, worldViewToChunkRange } from '../src/world/render/renderSpace.js';
import { createViewModeController } from '../src/world/render/viewModeController.js';

const cfg = { ...defaultInfiniteConfig, isoMode: true, isoTileW: 16, isoTileH: 8 };

test('iso roundtrip gridToScreen -> screenToGrid', () => {
  const points = [
    { gx: 0.5, gy: 0.5 },
    { gx: 10.25, gy: -4.75 },
    { gx: -31.125, gy: 54.5 },
  ];

  for (const p of points) {
    const s = gridToScreen(p.gx, p.gy, cfg);
    const g = screenToGrid(s.x, s.y, cfg);
    assert.ok(Math.abs(g.gx - p.gx) < 1e-9);
    assert.ok(Math.abs(g.gy - p.gy) < 1e-9);
  }
});

test('snapGrid maps points inside diamond to expected tile', () => {
  const tile = { tx: 12, ty: 7 };
  const probe = [
    { gx: 12.01, gy: 7.02 },
    { gx: 12.49, gy: 7.49 },
    { gx: 12.99, gy: 7.01 },
  ];

  for (const p of probe) {
    const s = gridToScreen(p.gx, p.gy, cfg);
    const g = screenToGrid(s.x, s.y, cfg);
    const snap = snapGrid(g.gx, g.gy);
    assert.equal(snap.ix, tile.tx);
    assert.equal(snap.iy, tile.ty);
  }
});

test('build validation sanity: outside zone denied, inside zone allowed', () => {
  const def = {
    id: 'TEST_BUILDING',
    placementRules: {
      allowedSurfaces: null,
      forbiddenSurfaces: null,
      mustBeInsideBuildZone: true,
      canBeOutsideBuildZone: false,
      maxDistanceToBuildZone: 0,
      requiresResourceNode: null,
      requiresCoast: false,
      limit: { perCity: null, perPlayer: null },
    },
  };

  const zoneRadius = 8;
  const ctx = {
    seed: 1,
    infiniteCfg: defaultInfiniteConfig,
    state: { buildings: [] },
    data: { balance: {} },
    canAfford: () => true,
    distanceToBuildZone: (tx, ty) => Math.max(0, Math.hypot(tx, ty) - zoneRadius),
    nearestCity: () => ({ id: 'spawn' }),
    getBuildZoneOwner: (tx, ty) => ((tx * tx + ty * ty) <= zoneRadius * zoneRadius ? 'spawn' : null),
  };

  const inside = validatePlacement(def, 2, 1, ctx);
  assert.equal(inside.ok, true);

  const outside = validatePlacement(def, 50, 50, ctx);
  assert.equal(outside.ok, false);
  assert.equal(outside.reasons[0].code, 'NOT_IN_BUILD_ZONE');
});


test('renderSpace chunk bounds are stable for adjacent chunks in iso', () => {
  const b0 = getChunkBounds(0, 0, 64, cfg);
  const b1 = getChunkBounds(1, 0, 64, cfg);
  assert.ok(Number.isFinite(b0.x) && Number.isFinite(b0.w));
  assert.ok(Number.isFinite(b1.x) && Number.isFinite(b1.w));
  assert.ok(b0.w > 0 && b1.w > 0);
});

test('renderSpace world view to chunk range returns valid order in iso', () => {
  const range = worldViewToChunkRange({ x: -300, y: -200, width: 800, height: 600 }, cfg, 64, 1);
  assert.ok(range.minCX <= range.maxCX);
  assert.ok(range.minCY <= range.maxCY);
});


test('viewModeController toggles projection and refreshes visual modules', () => {
  const cfg = { ...defaultInfiniteConfig, isoMode: false };
  const calls = [];
  const mk = (name, fn = null) => ({
    refreshProjection: () => calls.push(`${name}:refresh`),
    invalidate: () => calls.push(`${name}:invalidate`),
    setFocus: fn ?? (() => {}),
    centerOn: fn ?? (() => {}),
  });

  const camera = { centerOn: (x, y) => calls.push(`camera:center:${x.toFixed(2)},${y.toFixed(2)}`) };
  const cameraCtl = { setFocus: (x, y) => calls.push(`cameraCtl:focus:${x.toFixed(2)},${y.toFixed(2)}`) };

  const ctl = createViewModeController(cfg, {
    chunkMgr: mk('chunk'),
    fog: mk('fog'),
    overlays: mk('overlay'),
    build: mk('build'),
    units: mk('units'),
    routeRenderer: mk('route'),
    camera,
    cameraCtl,
  });

  const changed = ctl.toggle({ anchorTile: { tx: 10, ty: 4 } });
  assert.equal(changed, true);
  assert.equal(cfg.isoMode, true);
  assert.equal(ctl.getMode(), 'iso');
  assert.ok(calls.includes('chunk:refresh'));
  assert.ok(calls.includes('fog:refresh'));
  assert.ok(calls.includes('overlay:refresh'));
  assert.ok(calls.includes('build:refresh'));
  assert.ok(calls.includes('units:refresh'));
  assert.ok(calls.includes('route:invalidate'));
  assert.ok(calls.some((c) => c.startsWith('camera:center:')));
  assert.ok(calls.some((c) => c.startsWith('cameraCtl:focus:')));
});
