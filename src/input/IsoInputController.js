import { isoToGrid } from '../math/isoMath.js';

export class IsoInputController {
  constructor(scene, { viewModeCtl, tileSize, tileW, tileH, onTileHover, onTileClick, onRawPointer } = {}) {
    this.scene = scene;
    this.viewModeCtl = viewModeCtl;
    this.tileSize = tileSize;
    this.tileW = tileW;
    this.tileH = tileH;
    this.onTileHover = onTileHover;
    this.onTileClick = onTileClick;
    this.onRawPointer = onRawPointer;

    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerDown = this._handlePointerDown.bind(this);

    this.scene.input.on('pointermove', this._handlePointerMove);
    this.scene.input.on('pointerdown', this._handlePointerDown);
  }

  _pointerToTile(pointer) {
    const cam = this.scene.cameras.main;
    const wp = pointer.positionToCamera(cam);
    const mode = this.viewModeCtl?.getMode?.() ?? 'topdown';

    if (mode === 'isometric') {
      const origin = this.viewModeCtl?.getIsoOrigin?.() ?? { x: 0, y: 0 };
      const g = isoToGrid(wp.x - origin.x, wp.y - origin.y, this.tileW, this.tileH);
      return { tx: Math.floor(g.gx), ty: Math.floor(g.gy), worldX: wp.x, worldY: wp.y, gxFloat: g.gx, gyFloat: g.gy };
    }

    const gx = wp.x / this.tileSize;
    const gy = wp.y / this.tileSize;
    return { tx: Math.floor(gx), ty: Math.floor(gy), worldX: wp.x, worldY: wp.y, gxFloat: gx, gyFloat: gy };
  }

  _handlePointerMove(pointer) {
    const pick = this._pointerToTile(pointer);
    if (this.onRawPointer) this.onRawPointer(pointer, pick);
    if (this.onTileHover) this.onTileHover(pick.tx, pick.ty, pointer, pick);
  }

  _handlePointerDown(pointer) {
    const pick = this._pointerToTile(pointer);
    if (this.onTileClick) this.onTileClick(pick.tx, pick.ty, pointer, pick);
  }

  destroy() {
    this.scene?.input?.off('pointermove', this._handlePointerMove);
    this.scene?.input?.off('pointerdown', this._handlePointerDown);
  }
}
