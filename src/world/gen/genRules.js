export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function hash2D(seed, x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967296;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function valueNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2D(seed, x0, y0);
  const n10 = hash2D(seed, x1, y0);
  const n01 = hash2D(seed, x0, y1);
  const n11 = hash2D(seed, x1, y1);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

// fBm: 0..1
export function fbm(seed, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(seed + i * 1013, x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function neighbors8(x, y) {
  return [
    [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
    [x - 1, y],                 [x + 1, y],
    [x - 1, y + 1], [x, y + 1], [x + 1, y + 1],
  ];
}

export function inBounds(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function floodFill(mask, startX, startY, w, h, passableFn) {
  const q = [[startX, startY]];
  mask[startY][startX] = true;

  while (q.length) {
    const [x, y] = q.pop();
    for (const [nx, ny] of neighbors8(x, y)) {
      if (!inBounds(nx, ny, w, h)) continue;
      if (mask[ny][nx]) continue;
      if (!passableFn(nx, ny)) continue;
      mask[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
}

// Компоненты связности (8-связность)
export function getComponents(binary, w, h, targetValue) {
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const comps = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visited[y][x]) continue;
      if (binary[y][x] !== targetValue) continue;

      const cells = [];
      const stack = [[x, y]];
      visited[y][x] = true;

      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);

        for (const [nx, ny] of neighbors8(cx, cy)) {
          if (!inBounds(nx, ny, w, h)) continue;
          if (visited[ny][nx]) continue;
          if (binary[ny][nx] !== targetValue) continue;
          visited[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }

      comps.push(cells);
    }
  }

  return comps;
}