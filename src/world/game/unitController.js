// src/world/game/unitController.js
import { sampleHM } from "../infinite/terrainSampler.js";

function isLandSurface(surface) {
  return surface !== "shallow_water" && surface !== "deep_water";
}

export function createUnitController(scene, cfg, worldSeed, fog, discoveredSet) {
  const seed = worldSeed >>> 0;
  const tileSize = cfg.tileSize;

  let tx = 0;
  let ty = 0;

  // Simple unit placeholder
  const unit = scene.add.rectangle(0, 0, tileSize * 0.75, tileSize * 0.75, 0xffd24a)
    .setDepth(950);

  function tileToWorldCenter(tX, tY) {
    return { x: (tX + 0.5) * tileSize, y: (tY + 0.5) * tileSize };
  }

  function revealAt(tX, tY) {
    // store discovered tiles (circle radius 1)
    const r = 1;
    const rr = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > rr) continue;
        const k = `${tX + dx},${tY + dy}`;
        if (!discoveredSet.has(k)) {
          discoveredSet.add(k);
          fog.revealTile(tX + dx, tY + dy);
        }
      }
    }
  }

  function canStep(tX, tY) {
    const s = sampleHM(seed, tX, tY, cfg);
    if (!isLandSurface(s.surface)) return false;
    if (s.surface === "coast_cliff") return false;
    const maxSlope = cfg.unitMaxSlope ?? 0.86;
    if ((s.slope ?? 0) > maxSlope) return false;
    return true;
  }

  function setTile(tX, tY) {
    tx = tX | 0;
    ty = tY | 0;
    const p = tileToWorldCenter(tx, ty);
    unit.setPosition(p.x, p.y);
    revealAt(tx, ty);
  }

  function tryMove(dx, dy) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!canStep(nx, ny)) return false;
    setTile(nx, ny);
    return true;
  }

  // Input (tile-by-tile)
  const keys = scene.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
    up2: Phaser.Input.Keyboard.KeyCodes.UP,
    down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
    left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
  });

  const repeatMs = cfg.unitStepRepeatMs ?? 90;
  let lastStepAt = 0;

  function update() {
    const now = scene.time.now;
    if (now - lastStepAt < repeatMs) return;

    const dx = (keys.left.isDown || keys.left2.isDown) ? -1 : (keys.right.isDown || keys.right2.isDown) ? 1 : 0;
    const dy = (keys.up.isDown || keys.up2.isDown) ? -1 : (keys.down.isDown || keys.down2.isDown) ? 1 : 0;

    if (dx !== 0 || dy !== 0) {
      if (tryMove(dx, dy)) lastStepAt = now;
      else lastStepAt = now; // still throttle to avoid spam
    }
  }

  return {
    unit,
    setTile,
    update,
    getTile() { return { tx, ty }; },
  };
}
