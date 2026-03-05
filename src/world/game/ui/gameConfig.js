// src/world/game/ui/gameConfig.js
// Central table for ALL gameplay-related constants (tweak here, not in code).
export const gameConfig = {
  // Spawn
  spawn: {
    safeDistanceTilesDefault: 200,
    safeDistanceTilesMin: 200,
    safeDistanceTilesMax: 1000,
    safeDistanceStep: 50,

    // How hard we try to find a valid spawn
    attempts: 4000,
    // We search within this range around (0,0) for now. You can expand later.
    searchRadiusTiles: 1200,

    // Land constraints for spawn
    disallowSurfaces: new Set(["deep_water", "shallow_water"]),
    disallowCliffs: true,
    maxSlope: 0.72,
  },

  // Fog of war (distance to active zone)
  fog: {
    enabled: true,
    // Distance rings from active zone:
    //   0..fullInfoRadiusTiles       -> full info
    //   full..terrainInfoRadiusTiles -> terrain-only
    //   > terrainInfoRadiusTiles     -> hidden
    fullInfoRadiusTiles: 100,
    terrainInfoRadiusTiles: 300,

    // Fog rendering chunks in tiles (keep equal to terrain chunk size for alignment)
    fogChunkTiles: null, // if null -> will use infiniteConfig.chunkSize
    fogAlpha: 0.78, // opacity of fully hidden tiles
    terrainOnlyAlpha: 0.45, // opacity where only terrain is known
    maxFogRedrawPerFrame: 2, // throttling
    depth: 900, // render depth above terrain
  },

  // Camera (world)
  camera: {
    // Start closer to the spawn
    initialZoom: 2.6,
    zoomMin: 0.6,
    zoomMax: 4.0,
    zoomStep: 0.001,
    panSpeed: 18,
  },

  // Units
  units: {
    // pixels per second: tilesPerSecond * tileSize
    tilesPerSecond: 5.5,
    selectionRadiusTiles: 0.7,
    // passability rules
    disallowSurfaces: new Set(["deep_water", "shallow_water", "coast_cliff"]),
    maxSlope: 0.78,

    // pathfinding limits
    aStarMaxNodes: 7000,
    aStarMarginTiles: 26,
    aStarMaxDistanceTiles: 260, // beyond this -> try straight-line + local detours
  },

  // Building
  building: {
    // First building placement radius around spawn
    firstBuildRadiusTiles: 10,
    // Each building gives build area at least this many tiles
    minBuildAreaRadiusTiles: 5,
    // slope constraint
    maxSlope: 0.78,
    disallowSurfaces: new Set(["deep_water", "shallow_water", "coast_cliff"]),
  },


  features: {
    enableLegacyPresets: false,
  },
  // UI
  ui: {
    depth: 2000,
    padding: 10,
    panelAlpha: 0.55,
    fontFamily: "monospace",
    fontSize: "14px",
  },

  // Building catalogue (palette)
  buildings: [
    {
      id: "house_1",
      name: "Дом-1",
      // footprint in tiles (square). Keep 1 for now.
      size: 1,
      // area unlocked for further building
      buildAreaRadiusTiles: 8, // >= minBuildAreaRadiusTiles enforced
      // fog reveal radius (if you want per-building; otherwise use fog.buildingRevealRadiusTiles)
      fogRevealRadiusTiles: 35,
      // gating: must be first building
      isStarter: true,
      cost: { wood: 0, stone: 0, food: 0 },
    },
    {
      id: "house_2",
      name: "Дом-2",
      size: 1,
      buildAreaRadiusTiles: 6,
      fogRevealRadiusTiles: 35,
      isStarter: false,
      cost: { wood: 50, stone: 10, food: 0 },
    },
    {
      id: "workshop",
      name: "Мастерская",
      size: 1,
      buildAreaRadiusTiles: 5,
      fogRevealRadiusTiles: 35,
      isStarter: false,
      cost: { wood: 80, stone: 20, food: 0 },
    },
  ],
};
