// src/world/game/sim/tradeSystem.js
import { dist } from './utils.js';
import { estimateRouteSafety, estimateRouteSafetyFromPath } from './influenceSystem.js';

function normPair(aId, bId) {
  return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
}

function routeIncome(balance, aCity, bCity, distanceTiles, safety, mode = 'land') {
  const base = balance.trade?.baseGoldPerMin ?? 1.2;
  const speed = Math.min(aCity.stats?.pct?.TradeShipSpeedPct ?? 1, bCity.stats?.pct?.TradeShipSpeedPct ?? 1);

  // water a bit better by default
  const modeMul = (mode === 'water') ? (balance.trade?.waterIncomeMul ?? 1.08) : (balance.trade?.landIncomeMul ?? 1.0);

  const div = balance.trade?.distanceDiv ?? 50;
  return base * modeMul * safety * speed / (1 + distanceTiles / div);
}

export function recomputeTrade(state, balance) {
  const cities = state.cities.filter(c => c.hub);

  if (!state.trade) state.trade = { routes: [], manualRoutes: [], goldPerMin: 0 };
  if (!state.trade.manualRoutes) state.trade.manualRoutes = [];

  const autoEnabled = balance.trade?.autoEnabled ?? true;

  state.trade.routes = [];
  state.trade.goldPerMin = 0;

  if (cities.length < 2) return;

  const maxPerCity = balance.trade?.maxRoutesPerCity ?? 2;

  // city capacity by TradeSlots (flat)
  const cap = new Map();
  for (const c of cities) {
    const slots = Math.max(0, Math.floor((c.stats?.flat?.TradeSlots ?? 1)));
    cap.set(c.id, Math.min(maxPerCity, slots));
  }

  // manual routes first (consume capacity)
  const seen = new Set();
  const manual = [];
  for (const r of state.trade.manualRoutes) {
    const a = cities.find(x => x.id === r.aCityId);
    const b = cities.find(x => x.id === r.bCityId);
    if (!a || !b) continue;

    const pid = normPair(a.id, b.id) + `:${r.mode}`;
    if (seen.has(pid)) continue;

    if ((cap.get(a.id) ?? 0) <= 0) continue;
    if ((cap.get(b.id) ?? 0) <= 0) continue;

    // trade radius depends on both cities (use min)
    const ar = (a.stats?.pct?.TradeRadiusPct ?? 1) * (balance.trade?.baseRadiusTiles ?? 40);
    const br = (b.stats?.pct?.TradeRadiusPct ?? 1) * (balance.trade?.baseRadiusTiles ?? 40);
    const rmax = Math.min(ar, br);

    // distance from path length (if present) else euclid
    const distTiles = r.pathLenTiles ?? (r.path?.length ? (r.path.length - 1) : dist(a.hub.tx, a.hub.ty, b.hub.tx, b.hub.ty));
    if (distTiles > rmax) continue;

    cap.set(a.id, (cap.get(a.id) ?? 0) - 1);
    cap.set(b.id, (cap.get(b.id) ?? 0) - 1);

    // safety from path if exists
    let safety = r.safety;
    if (r.segments?.length) {
      // sample across all segments
      const combined = [];
      for (const seg of r.segments) {
        if (seg?.path?.length) combined.push(...seg.path);
      }
      safety = estimateRouteSafetyFromPath(state, combined);
    } else if (r.path?.length) {
      safety = estimateRouteSafetyFromPath(state, r.path);
    } else {
      safety = estimateRouteSafety(state, a, b);
    }

    const income = routeIncome(balance, a, b, distTiles, safety, r.mode);

    manual.push({
      id: r.id,
      kind: 'manual',
      mode: r.mode,
      aCityId: a.id,
      bCityId: b.id,
      dist: distTiles,
      safety,
      goldPerMin: income,
      segments: r.segments,
    });

    state.trade.goldPerMin += income;
    seen.add(pid);
  }

  state.trade.routes.push(...manual);

  if (!autoEnabled) return;

  // auto routes fill remaining capacity
  const pairs = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const a = cities[i], b = cities[j];
      const d = dist(a.hub.tx, a.hub.ty, b.hub.tx, b.hub.ty);
      pairs.push({ a, b, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);

  for (const p of pairs) {
    const a = p.a, b = p.b;
    if ((cap.get(a.id) ?? 0) <= 0) continue;
    if ((cap.get(b.id) ?? 0) <= 0) continue;

    // avoid duplicate with manual land route
    const pid = normPair(a.id, b.id) + ':land';
    if (seen.has(pid)) continue;

    const ar = (a.stats?.pct?.TradeRadiusPct ?? 1) * (balance.trade?.baseRadiusTiles ?? 40);
    const br = (b.stats?.pct?.TradeRadiusPct ?? 1) * (balance.trade?.baseRadiusTiles ?? 40);
    const rmax = Math.min(ar, br);
    if (p.d > rmax) continue;

    cap.set(a.id, (cap.get(a.id) ?? 0) - 1);
    cap.set(b.id, (cap.get(b.id) ?? 0) - 1);

    const safety = estimateRouteSafety(state, a, b);
    const income = routeIncome(balance, a, b, p.d, safety, 'land');

    state.trade.routes.push({
      id: `route_${a.id}_${b.id}`,
      kind: 'auto',
      mode: 'land',
      aCityId: a.id,
      bCityId: b.id,
      dist: p.d,
      safety,
      goldPerMin: income,
    });

    state.trade.goldPerMin += income;
  }
}
