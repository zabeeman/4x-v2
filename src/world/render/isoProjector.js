export function resolveIsoConfig(cfg = {}) {
  const tileW = cfg.isoTileW ?? cfg.tileSize * 2;
  const tileH = cfg.isoTileH ?? cfg.tileSize;
  return {
    isoMode: !!cfg.isoMode,
    tileW,
    tileH,
    originX: cfg.isoOriginX ?? 0,
    originY: cfg.isoOriginY ?? 0,
  };
}

export function gridToScreen(gx, gy, cfg = {}) {
  const p = resolveIsoConfig(cfg);
  if (!p.isoMode) {
    const tile = cfg.tileSize ?? p.tileH;
    return { x: gx * tile, y: gy * tile };
  }
  return {
    x: (gx - gy) * (p.tileW / 2) + p.originX,
    y: (gx + gy) * (p.tileH / 2) + p.originY,
  };
}

export function screenToGrid(x, y, cfg = {}) {
  const p = resolveIsoConfig(cfg);
  if (!p.isoMode) {
    const tile = cfg.tileSize ?? p.tileH;
    return { gx: x / tile, gy: y / tile };
  }
  const sx = x - p.originX;
  const sy = y - p.originY;
  return {
    gx: (sy / p.tileH) + (sx / p.tileW),
    gy: (sy / p.tileH) - (sx / p.tileW),
  };
}

export function snapGrid(gx, gy) {
  return { ix: Math.floor(gx), iy: Math.floor(gy) };
}
