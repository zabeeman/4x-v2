const CHUNK_SIZE = 64;
const TILE_COUNT = CHUNK_SIZE * CHUNK_SIZE;

function terrainToColor(code) {
  switch (code) {
    case 0: return 0xff0b1d3a;
    case 1: return 0xff1e4b7a;
    case 2: return 0xffd8c38a;
    case 3: return 0xff5f5f5f;
    case 5: return 0xff245a2b;
    case 6: return 0xff2b4a3a;
    case 7: return 0xffcdb37a;
    case 8: return 0xff767676;
    case 9: return 0xffe7eef2;
    case 4:
    default: return 0xff3f7a3e;
  }
}

export class ChunkRenderer {
  renderStaticToTexture(chunkStatic) {
    const canvas = document.createElement("canvas");
    canvas.width = CHUNK_SIZE;
    canvas.height = CHUNK_SIZE;

    const ctx = canvas.getContext("2d", { alpha: false });
    const image = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
    const pixels = new Uint32Array(image.data.buffer);

    const colors = chunkStatic.color;
    for (let i = 0; i < TILE_COUNT; i++) {
      pixels[i] = colors?.[i] ?? terrainToColor(chunkStatic.terrain[i]);
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  applyDynamicOverlay(staticCanvas, overlay) {
    if (!overlay) return staticCanvas;
    const ctx = staticCanvas.getContext("2d");
    ctx.save();
    ctx.globalAlpha = overlay.alpha ?? 0.5;
    if (overlay.image) ctx.drawImage(overlay.image, 0, 0);
    ctx.restore();
    return staticCanvas;
  }
}
