function floorDiv(n, d) {
  return Math.floor(n / d);
}

export function mod(n, d) {
  return n - floorDiv(n, d) * d;
}

export function gridToIso(gx, gy, tileW, tileH) {
  const halfW = tileW * 0.5;
  const halfH = tileH * 0.5;
  return {
    x: (gx - gy) * halfW,
    y: (gx + gy) * halfH,
  };
}

export function isoToGrid(worldX, worldY, tileW, tileH) {
  const halfW = tileW * 0.5;
  const halfH = tileH * 0.5;
  return {
    gx: (worldX / halfW + worldY / halfH) * 0.5,
    gy: (worldY / halfH - worldX / halfW) * 0.5,
  };
}

