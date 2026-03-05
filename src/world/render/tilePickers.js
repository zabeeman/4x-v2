function pointerToWorld(pointer, camera) {
  if (!pointer || !camera) return { x: 0, y: 0 };
  if (typeof camera.getWorldPoint === 'function') {
    return camera.getWorldPoint(pointer.x, pointer.y);
  }
  if (typeof pointer.positionToCamera === 'function') {
    return pointer.positionToCamera(camera);
  }
  return { x: pointer.worldX ?? pointer.x ?? 0, y: pointer.worldY ?? pointer.y ?? 0 };
}

export function createTilePickerTopDown(opts) {
  const { tileSize } = opts;

  function pick(pointer, camera) {
    const w = pointerToWorld(pointer, camera);
    return {
      gx: Math.floor(w.x / tileSize),
      gy: Math.floor(w.y / tileSize),
      valid: true,
      worldX: w.x,
      worldY: w.y,
      gxFloat: w.x / tileSize,
      gyFloat: w.y / tileSize,
    };
  }

  function gridToWorld(gx, gy) {
    return {
      x: (gx + 0.5) * tileSize,
      y: (gy + 0.5) * tileSize,
    };
  }

  function drawHighlight(graphics, gx, gy, style = {}) {
    if (!graphics) return;
    const c = gridToWorld(gx, gy);
    const alpha = style.fillAlpha ?? 0.22;
    const lineAlpha = style.lineAlpha ?? 0.55;
    graphics.fillStyle(style.fillColor ?? 0x06d6a0, alpha);
    graphics.lineStyle(style.lineWidth ?? 2, style.lineColor ?? 0x06d6a0, lineAlpha);
    graphics.fillRect(c.x - tileSize * 0.5, c.y - tileSize * 0.5, tileSize, tileSize);
    graphics.strokeRect(c.x - tileSize * 0.5, c.y - tileSize * 0.5, tileSize, tileSize);
  }

  return { pick, gridToWorld, drawHighlight };
}

export function createTilePickerIso(opts) {
  const { tileSize, tileW = tileSize * 2, tileH = tileW / 2 } = opts;
  const halfW = tileW / 2;
  const halfH = tileH / 2;

  function computeOrigin(camera) {
    const worldCX = camera.scrollX + camera.width * 0.5;
    const worldCY = camera.scrollY + camera.height * 0.5;
    const gx = worldCX / tileSize;
    const gy = worldCY / tileSize;
    return {
      x: worldCX - (gx - gy) * halfW,
      y: worldCY - (gx + gy) * halfH,
    };
  }

  function gridToWorld(gx, gy, camera) {
    const origin = computeOrigin(camera);
    return {
      x: origin.x + (gx - gy) * halfW,
      y: origin.y + (gx + gy) * halfH,
    };
  }

  function pick(pointer, camera) {
    const w = pointerToWorld(pointer, camera);
    const origin = computeOrigin(camera);

    const dx = w.x - origin.x;
    const dy = w.y - origin.y;

    const gxFloat = (dx / halfW + dy / halfH) / 2;
    const gyFloat = (dy / halfH - dx / halfW) / 2;

    let gx = Math.floor(gxFloat);
    let gy = Math.floor(gyFloat);

    const top = gridToWorld(gx, gy, camera);
    const centerX = top.x;
    const centerY = top.y + halfH;

    const nx = (w.x - centerX) / halfW;
    const ny = (w.y - centerY) / halfH;

    if (Math.abs(nx) + Math.abs(ny) > 1) {
      if (nx > 0 && ny < 0) {
        gy -= 1;
      } else if (nx < 0 && ny < 0) {
        gx -= 1;
      } else if (nx > 0 && ny > 0) {
        gx += 1;
      } else if (nx < 0 && ny > 0) {
        gy += 1;
      }
    }

    return { gx, gy, valid: true, worldX: w.x, worldY: w.y, gxFloat, gyFloat, nx, ny };
  }

  function drawHighlight(graphics, gx, gy, camera, style = {}) {
    if (!graphics) return;
    const top = gridToWorld(gx, gy, camera);
    const right = { x: top.x + halfW, y: top.y + halfH };
    const bottom = { x: top.x, y: top.y + tileH };
    const left = { x: top.x - halfW, y: top.y + halfH };

    const alpha = style.fillAlpha ?? 0.22;
    const lineAlpha = style.lineAlpha ?? 0.55;
    graphics.fillStyle(style.fillColor ?? 0x06d6a0, alpha);
    graphics.lineStyle(style.lineWidth ?? 2, style.lineColor ?? 0x06d6a0, lineAlpha);
    graphics.beginPath();
    graphics.moveTo(top.x, top.y);
    graphics.lineTo(right.x, right.y);
    graphics.lineTo(bottom.x, bottom.y);
    graphics.lineTo(left.x, left.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  return { pick, gridToWorld: (gx, gy, camera) => gridToWorld(gx, gy, camera), drawHighlight, tileW, tileH, halfW, halfH };
}
