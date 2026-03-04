import { PlacementReasonCode } from './reasonCodes.js';
import { getSurfaceAt, getResourceNodeAt, isCoastAt } from './geoQueries.js';

function normalizeRules(def) {
  if (def?.placementRules) {
    // Legacy extractor behavior: any non-water surface, up to 100 tiles from build zone,
    // and only on tiles with matching resource nodes.
    if (def.extract) {
      const r = def.placementRules;
      const forbidden = new Set(r.forbiddenSurfaces ?? []);
      forbidden.add('water');
      forbidden.add('shallow_water');
      forbidden.add('deep_water');
      return {
        ...r,
        mustBeInsideBuildZone: false,
        canBeOutsideBuildZone: true,
        maxDistanceToBuildZone: 100,
        allowedSurfaces: null,
        forbiddenSurfaces: Array.from(forbidden),
        requiresResourceNode: {
          ...(r.requiresResourceNode ?? {}),
          // For extractors always trust canonical extract resource id.
          type: String(def.extract.resource).toLowerCase(),
        },
      };
    }
    return def.placementRules;
  }

  const pr = def?.placeRules ?? {};
  const isExtractor = !!def?.extract;
  const forbiddenSurfaces = new Set();
  if (isExtractor) {
    forbiddenSurfaces.add('water');
    forbiddenSurfaces.add('shallow_water');
    forbiddenSurfaces.add('deep_water');
  }
  return {
    allowedSurfaces: (pr.allowAnySurface || isExtractor) ? null : (pr.allowedSurfaces ?? null),
    forbiddenSurfaces: forbiddenSurfaces.size > 0 ? Array.from(forbiddenSurfaces) : null,
    mustBeInsideBuildZone: isExtractor ? false : !(def?.isStarter || def?.isHub),
    canBeOutsideBuildZone: isExtractor ? true : typeof pr.allowOutsideBuildAreaWithinTiles === 'number',
    maxDistanceToBuildZone: isExtractor ? 100 : (pr.allowOutsideBuildAreaWithinTiles ?? 0),
    requiresResourceNode: def?.extract?.resource ? { type: String(def.extract.resource).toLowerCase() } : null,
    requiresCoast: false,
    limit: {
      perCity: null,
      perPlayer: null,
    },
  };
}

function buildFootprint(def, tx, ty) {
  const w = Math.max(1, def?.size?.w ?? 1);
  const h = Math.max(1, def?.size?.h ?? 1);
  const out = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) out.push({ tx: tx + dx, ty: ty + dy });
  }
  return out;
}

function fail(code, data, footprint, affordabilityOk = true, cityId = null) {
  return { ok: false, affordabilityOk, reasons: [{ code, ...(data ? { data } : {}) }], cityId, footprint };
}

export function validatePlacement(def, tx, ty, ctx) {
  const rules = normalizeRules(def);
  const footprint = buildFootprint(def, tx, ty);
  const occupied = new Set((ctx.state.buildings ?? []).map((b) => `${b.tx},${b.ty}`));
  const allowed = rules.allowedSurfaces ? new Set(rules.allowedSurfaces) : null;
  const forbidden = rules.forbiddenSurfaces ? new Set(rules.forbiddenSurfaces) : null;

  // 1) Surface check
  for (const t of footprint) {
    const surface = getSurfaceAt(ctx.seed, t.tx, t.ty, ctx.infiniteCfg);
    if (allowed && !allowed.has(surface)) return fail(PlacementReasonCode.FORBIDDEN_SURFACE, { surface }, footprint);
    if (forbidden && forbidden.has(surface)) return fail(PlacementReasonCode.FORBIDDEN_SURFACE, { surface }, footprint);
  }

  // 2) Footprint collision
  for (const t of footprint) {
    if (occupied.has(`${t.tx},${t.ty}`)) return fail(PlacementReasonCode.FOOTPRINT_OCCUPIED, null, footprint);
  }

  // Determine city owner from footprint if possible.
  const owners = new Set(footprint.map((t) => ctx.getBuildZoneOwner(t.tx, t.ty)).filter(Boolean));
  const cityIdFromZone = owners.size === 1 ? [...owners][0] : null;

  // 3) Zone rule
  if (rules.mustBeInsideBuildZone) {
    const allInside = footprint.every((t) => ctx.getBuildZoneOwner(t.tx, t.ty) === cityIdFromZone && !!cityIdFromZone);
    if (!allInside) return fail(PlacementReasonCode.NOT_IN_BUILD_ZONE, null, footprint);
  }

  let cityId = cityIdFromZone;

  // 4) Special buildings (outside zone distance + extra geo constraints)
  if (rules.canBeOutsideBuildZone) {
    const maxD = Number(rules.maxDistanceToBuildZone ?? 0);
    let maxDist = 0;
    for (const t of footprint) {
      const d = ctx.distanceToBuildZone(t.tx, t.ty);
      if (d > maxDist) maxDist = d;
    }
    if (maxDist > maxD) return fail(PlacementReasonCode.TOO_FAR_FROM_BUILD_ZONE, { max: maxD, dist: maxDist }, footprint);

    if (!cityId) {
      const nearest = ctx.nearestCity(tx, ty);
      cityId = nearest?.id ?? null;
    }
  }

  if (rules.requiresResourceNode?.type) {
    const want = String(rules.requiresResourceNode.type).toLowerCase();
    const okNode = footprint.some((t) => getResourceNodeAt(ctx.seed, t.tx, t.ty, ctx.infiniteCfg, ctx.data.balance) === want);
    if (!okNode) return fail(PlacementReasonCode.NEEDS_RESOURCE_NODE, { type: want }, footprint, true, cityId);
  }

  if (rules.requiresCoast) {
    const coastOk = footprint.some((t) => isCoastAt(ctx.seed, t.tx, t.ty, ctx.infiniteCfg));
    if (!coastOk) return fail(PlacementReasonCode.NEEDS_COAST, null, footprint, true, cityId);
  }

  // 5) Limits
  const perCityLimit = rules.limit?.perCity;
  if (cityId && perCityLimit && perCityLimit > 0) {
    const count = (ctx.state.buildings ?? []).filter((b) => b.cityId === cityId && b.typeId === def.id).length;
    if (count >= perCityLimit) return fail(PlacementReasonCode.LIMIT_REACHED_CITY, { limit: perCityLimit }, footprint, true, cityId);
  }

  const perPlayerLimit = rules.limit?.perPlayer;
  if (perPlayerLimit && perPlayerLimit > 0) {
    const count = (ctx.state.buildings ?? []).filter((b) => b.typeId === def.id).length;
    if (count >= perPlayerLimit) return fail(PlacementReasonCode.LIMIT_REACHED_PLAYER, { limit: perPlayerLimit }, footprint, true, cityId);
  }

  // 6) Affordability check (only after placement OK)
  const affordabilityOk = ctx.canAfford(def.id);

  return {
    ok: true,
    affordabilityOk,
    reasons: [],
    cityId,
    footprint,
  };
}
