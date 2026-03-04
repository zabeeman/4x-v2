// src/world/game/sim/resourceSystem.js
import { sampleHM } from '../../infinite/terrainSampler.js';
import { dist2, hash2i } from './utils.js';

// Determine which raw resource a tile can yield based on geography.
// Note: surfaces available from terrainSampler: shallow_water, deep_water, beach, coast_cliff, snow, rock, swamp, forest, desert, land
export function getNodeResourceAt(seed, tx, ty, infiniteCfg, _balance) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  const surf = s.surface;
  const h = hash2i(seed, tx, ty);

  if (surf === 'forest') return 'wood';

  // occasional wood on generic land (rare)
  if (surf === 'land') return (h % 22 === 0) ? 'wood' : null;

  // glass: sand/desert
  if (surf === 'desert' || surf === 'beach') return (h % 3 === 0) ? 'glass' : null;

  // powder: swamp
  if (surf === 'swamp') return (h % 3 === 0) ? 'powder' : null;

  // rocks: metal or marble
  if (surf === 'rock' || surf === 'coast_cliff') {
    return (h % 4 === 0) ? 'marble' : 'metal';
  }

  // snow: a bit of metal (optional)
  if (surf === 'snow') return (h % 6 === 0) ? 'metal' : null;

  return null;
}

export function canPlaceExtractorNear(state, tx, ty, resourceId, minDistTiles) {
  const r2 = minDistTiles * minDistTiles;
  for (const b of state.buildings) {
    if (!b.extract) continue;
    if (b.extract.resource !== resourceId) continue;
    if (dist2(tx, ty, b.tx, b.ty) <= r2) return false;
  }
  return true;
}
