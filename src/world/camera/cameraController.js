// src/world/camera/cameraController.js
// Free camera controller with zoom centered on the LAST ACTIVE selection (tile/building/object).
// - Wheel zoom uses window listener so it still works with DOM UI overlay.
// - Focus is updated on left-click on the world (canvas). You can also call controller.setFocus(x,y).
// - Zoom does NOT affect DOM UI (UI should be outside Phaser canvas, e.g. #ui-root overlay).

export function createFreeCameraController(scene, opts = {}) {
  const cfg = {
    panSpeed: opts.panSpeed ?? 12,
    zoomMin: opts.zoomMin ?? 0.5,
    zoomMax: opts.zoomMax ?? 3.0,
    zoomStep: opts.zoomStep ?? 0.001,
    dragButtons: opts.dragButtons ?? "rightOrMiddle", // "left" | "rightOrMiddle"

    // If set (in world units), focus point will be snapped to the center of this grid.
    // Recommended: gridSize = cfg.tileSize
    gridSize: opts.gridSize ?? null,

    // DOM overlay root selector (so wheel over UI won't zoom)
    uiRootSelector: opts.uiRootSelector ?? "#ui-root",
    zoomIgnoresUI: opts.zoomIgnoresUI ?? true,

    // If true, we keep focus at the CENTER on zoom (as requested).
    zoomCentersOnFocus: true,
  };

  const cam = scene.cameras.main;
  const keyboard = scene.input.keyboard;
  const keys = keyboard
    ? keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      })
    : null;

  if (scene.input.mouse) scene.input.mouse.disableContextMenu();

  let viewMapper = null;

  // -------- focus handling --------
  /** @type {{x:number,y:number}|null} */
  let focus = null;

  function snapToGrid(x, y) {
    const g = cfg.gridSize;
    if (!g || !Number.isFinite(g) || g <= 0) return { x, y };
    const tx = Math.floor(x / g);
    const ty = Math.floor(y / g);
    return { x: (tx + 0.5) * g, y: (ty + 0.5) * g };
  }

  function ensureFocus() {
    if (focus) return focus;
    // default to current camera center in world coords
    const cx = cam.midPoint ? cam.midPoint.x : cam.worldView.centerX;
    const cy = cam.midPoint ? cam.midPoint.y : cam.worldView.centerY;
    focus = snapToGrid(cx, cy);
    return focus;
  }

  function setFocus(x, y) {
    focus = snapToGrid(x, y);
  }

  function mapViewDeltaToWorld(dx, dy) {
    if (!viewMapper?.viewDeltaToWorldDelta) return { x: dx, y: dy };
    return viewMapper.viewDeltaToWorldDelta(dx, dy);
  }

  function clearFocus() {
    focus = null;
  }

  // Update focus on world left-click (canvas). This naturally matches "last active tile/object".
  scene.input.on("pointerdown", (pointer) => {
    if (!pointer.leftButtonDown()) return;
    const p = pointer.positionToCamera(cam);
    setFocus(p.x, p.y);
  });

  // -------- drag-to-pan --------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  scene.input.on("pointerdown", (pointer) => {
    const ok =
      (cfg.dragButtons === "left" && pointer.leftButtonDown()) ||
      (cfg.dragButtons === "rightOrMiddle" && (pointer.rightButtonDown() || pointer.middleButtonDown()));
    if (!ok) return;

    dragging = true;
    lastX = pointer.x;
    lastY = pointer.y;
  });

  scene.input.on("pointermove", (pointer) => {
    if (!dragging) return;

    const dx = pointer.x - lastX;
    const dy = pointer.y - lastY;

    const wd = mapViewDeltaToWorld(dx / cam.zoom, dy / cam.zoom);
    cam.scrollX -= wd.x;
    cam.scrollY -= wd.y;

    lastX = pointer.x;
    lastY = pointer.y;
  });

  scene.input.on("pointerup", () => {
    dragging = false;
  });

  // -------- wheel zoom (window-level; centers on focus) --------
  const canvas = scene.game.canvas;

  function isWheelOverUI(e) {
    if (!cfg.zoomIgnoresUI) return false;
    if (!cfg.uiRootSelector) return false;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t || !t.closest) return false;
    return !!t.closest(cfg.uiRootSelector);
  }

  function isOverCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  }

  function onWheel(e) {
    // If wheel is not over canvas — ignore (don't block page scroll).
    if (!isOverCanvas(e)) return;

    // If wheel is over UI overlay — ignore (allow UI scroll).
    if (isWheelOverUI(e)) return;

    e.preventDefault();

    const dy = e.deltaY;

    const newZoom = Phaser.Math.Clamp(cam.zoom - dy * cfg.zoomStep, cfg.zoomMin, cfg.zoomMax);
    if (newZoom === cam.zoom) return;

    // Keep view centered on focus (last selection)
    const f = ensureFocus();

    cam.setZoom(newZoom);

    if (cfg.zoomCentersOnFocus) {
      cam.centerOn(f.x, f.y);
    }
  }

  // important: passive=false to allow preventDefault
  window.addEventListener("wheel", onWheel, { passive: false });

  // cleanup on scene shutdown
  scene.events.once("shutdown", () => {
    window.removeEventListener("wheel", onWheel);
  });

  return {
    update() {
      if (!keys) return;

      const ae = document.activeElement;
      const typingInUi =
        !!ae &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
      if (typingInUi) return;

      let mx = 0;
      let my = 0;

      if (keys.left.isDown) mx -= 1;
      if (keys.right.isDown) mx += 1;
      if (keys.up.isDown) my -= 1;
      if (keys.down.isDown) my += 1;

      if (mx === 0 && my === 0) return;

      const len = Math.hypot(mx, my) || 1;
      const speed = cfg.panSpeed / cam.zoom;
      const sdx = (mx / len) * speed;
      const sdy = (my / len) * speed;
      const wd = mapViewDeltaToWorld(sdx, sdy);
      cam.scrollX += wd.x;
      cam.scrollY += wd.y;
    },
    setFocus,
    clearFocus,
    getFocus() {
      return focus ? { ...focus } : null;
    },
    setViewMapper(mapper) {
      viewMapper = mapper ?? null;
    },
  };
}
