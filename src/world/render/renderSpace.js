import { gridToScreen, screenToGrid } from './isoProjector.js';

export function tileToWorldCenter(tx, ty, cfg) {
  return gridToScreen(tx + 0.5, ty + 0.5, cfg);
}

export function tileDiamond(tx, ty, cfg) {
  return {
    a: gridToScreen(tx, ty, cfg),
    b: gridToScreen(tx + 1, ty, cfg),
    c: gridToScreen(tx + 1, ty + 1, cfg),
    d: gridToScreen(tx, ty + 1, cfg),
  };
}

export function drawTilePath(ctx, poly, offsetX = 0, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(poly.a.x - offsetX, poly.a.y - offsetY);
  ctx.lineTo(poly.b.x - offsetX, poly.b.y - offsetY);
  ctx.lineTo(poly.c.x - offsetX, poly.c.y - offsetY);
  ctx.lineTo(poly.d.x - offsetX, poly.d.y - offsetY);
  ctx.closePath();
}

export function getChunkBounds(cx, cy, chunkSize, cfg, pad = 2) {
  const tileSize = cfg.tileSize;
  const chunkPx = chunkSize * tileSize;
  if (!cfg.isoMode) {
    return { x: cx * chunkPx, y: cy * chunkPx, w: chunkPx, h: chunkPx };
  }

  const startGX = cx * chunkSize;
  const startGY = cy * chunkSize;
  const corners = [
    gridToScreen(startGX, startGY, cfg),
    gridToScreen(startGX + chunkSize, startGY, cfg),
    gridToScreen(startGX, startGY + chunkSize, cfg),
    gridToScreen(startGX + chunkSize, startGY + chunkSize, cfg),
  ];

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);

  const minX = Math.floor(Math.min(...xs) - pad);
  const minY = Math.floor(Math.min(...ys) - pad);
  const maxX = Math.ceil(Math.max(...xs) + pad);
  const maxY = Math.ceil(Math.max(...ys) + pad);

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function worldViewToChunkRange(worldView, cfg, chunkSize, marginChunks = 1) {
  const tileSize = cfg.tileSize;
  const chunkPx = chunkSize * tileSize;

  if (!cfg.isoMode) {
    return {
      minCX: Math.floor(worldView.x / chunkPx) - marginChunks,
      maxCX: Math.floor((worldView.x + worldView.width) / chunkPx) + marginChunks,
      minCY: Math.floor(worldView.y / chunkPx) - marginChunks,
      maxCY: Math.floor((worldView.y + worldView.height) / chunkPx) + marginChunks,
    };
  }

  const corners = [
    screenToGrid(worldView.x, worldView.y, cfg),
    screenToGrid(worldView.x + worldView.width, worldView.y, cfg),
    screenToGrid(worldView.x, worldView.y + worldView.height, cfg),
    screenToGrid(worldView.x + worldView.width, worldView.y + worldView.height, cfg),
  ];

  const gxs = corners.map((c) => c.gx);
  const gys = corners.map((c) => c.gy);

  const minGX = Math.floor(Math.min(...gxs)) - marginChunks * chunkSize;
  const maxGX = Math.ceil(Math.max(...gxs)) + marginChunks * chunkSize;
  const minGY = Math.floor(Math.min(...gys)) - marginChunks * chunkSize;
  const maxGY = Math.ceil(Math.max(...gys)) + marginChunks * chunkSize;

  return {
    minCX: Math.floor(minGX / chunkSize),
    maxCX: Math.floor(maxGX / chunkSize),
    minCY: Math.floor(minGY / chunkSize),
    maxCY: Math.floor(maxGY / chunkSize),
  };
}
