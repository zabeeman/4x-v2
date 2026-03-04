import { sampleHM } from '../../infinite/terrainSampler.js';
import { getNodeResourceAt } from './resourceSystem.js';

const COAST_SURFACES = new Set(['beach', 'coast_cliff', 'shallow_water']);

export function getSurfaceAt(seed, tx, ty, infiniteCfg) {
  return sampleHM(seed, tx, ty, infiniteCfg).surface;
}

export function isCoastAt(seed, tx, ty, infiniteCfg) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  return s.coast >= 0.5 || COAST_SURFACES.has(s.surface);
}

export function getResourceNodeAt(seed, tx, ty, infiniteCfg, balance) {
  return getNodeResourceAt(seed, tx, ty, infiniteCfg, balance);
}
