import { Start } from "./scenes/Start.js";

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: "#0b0f14",
  pixelArt: true,

  scale: {
    mode: Phaser.Scale.RESIZE,           // canvas под размер окна
    autoCenter: Phaser.Scale.CENTER_BOTH // на всякий
  },

  scene: [Start],
});