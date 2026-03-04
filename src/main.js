import { Start } from "./scenes/Start.js";

function parseRenderType() {
  const q = new URLSearchParams(window.location.search);
  const v = (q.get("renderer") ?? "").toLowerCase();
  if (v === "canvas") return Phaser.CANVAS;
  if (v === "webgl") return Phaser.WEBGL;
  return Phaser.AUTO;
}

function parseRenderScale() {
  const q = new URLSearchParams(window.location.search);
  const raw = Number(q.get("renderScale"));
  if (!Number.isFinite(raw)) return 1;
  return Phaser.Math.Clamp(raw, 0.5, 1);
}

const renderScale = parseRenderScale();

new Phaser.Game({
  type: parseRenderType(),
  backgroundColor: "#0b0f14",
  pixelArt: true,
  resolution: Math.max(0.5, (window.devicePixelRatio || 1) * renderScale),

  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  scene: [Start],
});
