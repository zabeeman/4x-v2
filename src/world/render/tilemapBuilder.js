export function createBlankTilemap(scene, w, h, tileSize, tilesetKey) {
  const map = scene.make.tilemap({
    tileWidth: tileSize,
    tileHeight: tileSize,
    width: w,
    height: h,
  });

  const tileset = map.addTilesetImage(tilesetKey, tilesetKey, tileSize, tileSize);
  const layer = map.createBlankLayer("Ground", tileset, 0, 0);

  return { map, tileset, layer };
}