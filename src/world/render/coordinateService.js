export function createCoordinateService(scene, opts = {}) {
  const camera = scene?.cameras?.main;
  const tileSize = Number.isFinite(opts.tileSize) ? opts.tileSize : 32;
  const tileW = Number.isFinite(opts.tileW) ? opts.tileW : tileSize * 2;
  const tileH = Number.isFinite(opts.tileH) ? opts.tileH : tileW / 2;
  const halfW = tileW / 2;
  const halfH = tileH / 2;

  function computeIsoOrigin() {
    const worldCX = (camera?.scrollX ?? 0) + (camera?.width ?? 0) * 0.5;
    const worldCY = (camera?.scrollY ?? 0) + (camera?.height ?? 0) * 0.5;
    const gx = worldCX / tileSize;
    const gy = worldCY / tileSize;
    return {
      x: worldCX - (gx - gy) * halfW,
      y: worldCY - (gx + gy) * halfH,
    };
  }

  function screenToWorld(px, py) {
    if (camera?.getWorldPoint) return camera.getWorldPoint(px, py);
    return { x: px, y: py };
  }

  function worldToTile(wx, wy) {
    return {
      tx: Math.floor(wx / tileSize),
      ty: Math.floor(wy / tileSize),
    };
  }

  function tileToWorldAnchor(tx, ty) {
    return {
      wx: (tx + 0.5) * tileSize,
      wy: (ty + 0.5) * tileSize,
    };
  }

  function tileToIsoScreen(tx, ty) {
    const origin = computeIsoOrigin();
    const gx = tx + 0.5;
    const gy = ty + 0.5;
    return {
      sx: origin.x + (gx - gy) * halfW,
      sy: origin.y + (gx + gy) * halfH,
    };
  }

  function worldToIsoScreen(wx, wy) {
    const origin = computeIsoOrigin();
    const gx = wx / tileSize;
    const gy = wy / tileSize;
    return {
      sx: origin.x + (gx - gy) * halfW,
      sy: origin.y + (gx + gy) * halfH,
    };
  }

  function isoScreenToWorld(sx, sy) {
    const origin = computeIsoOrigin();
    const dx = sx - origin.x;
    const dy = sy - origin.y;
    return {
      wx: ((dx / halfW + dy / halfH) / 2) * tileSize,
      wy: ((dy / halfH - dx / halfW) / 2) * tileSize,
    };
  }

  return {
    tileSize,
    tileW,
    tileH,
    halfW,
    halfH,
    screenToWorld,
    worldToTile,
    tileToWorldAnchor,
    tileToIsoScreen,
    worldToIsoScreen,
    isoScreenToWorld,
  };
}
