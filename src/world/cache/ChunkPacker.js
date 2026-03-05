const TILE_COUNT = 64 * 64;
const HEADER_SIZE = 4;
const FLAG_HAS_COLOR = 1;

function ensureType(arr, Type, name) {
  if (!(arr instanceof Type) || arr.length !== TILE_COUNT) {
    throw new Error(`Invalid ${name}; expected ${Type.name} length ${TILE_COUNT}`);
  }
}

async function maybeCompress(rawBytes) {
  if (typeof CompressionStream === "undefined") return rawBytes.buffer;
  const stream = new Blob([rawBytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

async function maybeDecompress(payload) {
  const bytes = payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(await payload.arrayBuffer());
  if (typeof DecompressionStream === "undefined") return bytes;

  // gzip magic: 1f 8b
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export async function packChunkStatic(data) {
  ensureType(data.height, Uint16Array, "height");
  ensureType(data.terrain, Uint8Array, "terrain");
  ensureType(data.resource, Uint8Array, "resource");
  ensureType(data.geo, Uint8Array, "geo");

  const hasColor = data.color instanceof Uint32Array && data.color.length === TILE_COUNT;
  const dataSize =
    HEADER_SIZE +
    data.height.byteLength +
    data.terrain.byteLength +
    data.resource.byteLength +
    data.geo.byteLength +
    (hasColor ? data.color.byteLength : 0);

  const raw = new Uint8Array(dataSize);
  const dv = new DataView(raw.buffer);
  dv.setUint32(0, hasColor ? FLAG_HAS_COLOR : 0, true);

  let offset = HEADER_SIZE;
  raw.set(new Uint8Array(data.height.buffer, data.height.byteOffset, data.height.byteLength), offset);
  offset += data.height.byteLength;
  raw.set(new Uint8Array(data.terrain.buffer, data.terrain.byteOffset, data.terrain.byteLength), offset);
  offset += data.terrain.byteLength;
  raw.set(new Uint8Array(data.resource.buffer, data.resource.byteOffset, data.resource.byteLength), offset);
  offset += data.resource.byteLength;
  raw.set(new Uint8Array(data.geo.buffer, data.geo.byteOffset, data.geo.byteLength), offset);
  offset += data.geo.byteLength;

  if (hasColor) raw.set(new Uint8Array(data.color.buffer, data.color.byteOffset, data.color.byteLength), offset);
  return maybeCompress(raw);
}

export async function unpackChunkStatic(payload) {
  const raw = await maybeDecompress(payload);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const flags = dv.getUint32(0, true);
  const hasColor = (flags & FLAG_HAS_COLOR) !== 0;

  let offset = HEADER_SIZE;
  const height = new Uint16Array(TILE_COUNT);
  const terrain = new Uint8Array(TILE_COUNT);
  const resource = new Uint8Array(TILE_COUNT);
  const geo = new Uint8Array(TILE_COUNT);

  height.set(new Uint16Array(raw.buffer.slice(raw.byteOffset + offset, raw.byteOffset + offset + height.byteLength)));
  offset += height.byteLength;
  terrain.set(new Uint8Array(raw.buffer.slice(raw.byteOffset + offset, raw.byteOffset + offset + terrain.byteLength)));
  offset += terrain.byteLength;
  resource.set(new Uint8Array(raw.buffer.slice(raw.byteOffset + offset, raw.byteOffset + offset + resource.byteLength)));
  offset += resource.byteLength;
  geo.set(new Uint8Array(raw.buffer.slice(raw.byteOffset + offset, raw.byteOffset + offset + geo.byteLength)));
  offset += geo.byteLength;

  let color;
  if (hasColor) {
    color = new Uint32Array(TILE_COUNT);
    color.set(new Uint32Array(raw.buffer.slice(raw.byteOffset + offset, raw.byteOffset + offset + color.byteLength)));
  }

  return { height, terrain, resource, geo, color };
}
