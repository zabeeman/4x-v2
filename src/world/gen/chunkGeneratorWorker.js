import { defaultInfiniteConfig } from "../infinite/infiniteConfig.js";
import { sampleHM } from "../infinite/terrainSampler.js";
import { packChunkStatic } from "../cache/ChunkPacker.js";

const CHUNK_SIZE = 64;
const TILE_COUNT = CHUNK_SIZE * CHUNK_SIZE;

function terrainCode(surface) {
  switch (surface) {
    case "deep_water": return 0;
    case "shallow_water": return 1;
    case "beach": return 2;
    case "coast_cliff": return 3;
    case "land": return 4;
    case "forest": return 5;
    case "swamp": return 6;
    case "desert": return 7;
    case "rock": return 8;
    case "snow": return 9;
    default: return 255;
  }
}

function resourceCode(sample) {
  if (sample.surface === "forest") return 1;
  if (sample.surface === "rock") return 2;
  if (sample.surface === "swamp") return 3;
  if (sample.surface === "desert") return 4;
  return 0;
}

function geoBits(sample) {
  let bits = 0;
  if (sample.elev <= 0) bits |= 1 << 0; // water
  if (sample.surface === "beach") bits |= 1 << 1;
  if (sample.surface === "coast_cliff" || sample.surface === "rock") bits |= 1 << 2;
  if ((sample.slope ?? 0) > 0.62) bits |= 1 << 3;
  if (sample.surface === "forest") bits |= 1 << 4;
  return bits;
}

function hexToABGR(hex) {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const n = parseInt(h, 16) >>> 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function generateChunkStatic(seed, cx, cy) {
  const cfg = { ...defaultInfiniteConfig, chunkSize: CHUNK_SIZE };
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  const height = new Uint16Array(TILE_COUNT);
  const terrain = new Uint8Array(TILE_COUNT);
  const resource = new Uint8Array(TILE_COUNT);
  const geo = new Uint8Array(TILE_COUNT);
  const color = new Uint32Array(TILE_COUNT);

  let i = 0;
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++, i++) {
      const gx = startX + x;
      const gy = startY + y;
      const s = sampleHM(seed, gx, gy, cfg);
      height[i] = (s.elev + 10) * 256;
      terrain[i] = terrainCode(s.surface);
      resource[i] = resourceCode(s);
      geo[i] = geoBits(s);
      color[i] = hexToABGR(s.color);
    }
  }

  return { height, terrain, resource, geo, color };
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "GEN") return;

  const t0 = performance.now();
  const data = generateChunkStatic(msg.seed, msg.cx, msg.cy);
  const payload = await packChunkStatic(data);
  const t1 = performance.now();

  self.postMessage(
    {
      type: "GEN_DONE",
      key: msg.key,
      genVersion: msg.genVersion,
      payload,
      genMs: t1 - t0,
      cx: msg.cx,
      cy: msg.cy,
    },
    [payload]
  );
};
