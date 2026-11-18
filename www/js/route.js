/* ===== 换乘规划：直达优先 → 最少换乘（1次/2次），复用项目原有算法 ===== */

function rideMinutes(d, fromOrder, toOrder) {
  let meters = 0;
  for (let i = fromOrder - 1; i < toOrder - 1; i++) meters += d.segs[i] || 500;
  if (!meters) meters = (toOrder - fromOrder) * 500;
  return Math.max(1, Math.round(meters / 240 + (toOrder - fromOrder) * 0.35));
}
function makeLeg(d, fromOrder, toOrder) {
  return {
    line: d.line, key: d.key, dir: d,
    from: stopName(d.stops[fromOrder - 1]), to: stopName(d.stops[toOrder - 1]),
    label: dirLabel(d), stops: toOrder - fromOrder,
    minutes: rideMinutes(d, fromOrder, toOrder)
  };
}
function buildPlan(legs) {
  const transfers = Math.max(0, legs.length - 1);
  const ride = legs.reduce((s, l) => s + l.minutes, 0);
  const total = ride + transfers * 5;
  return { legs, transfers, total, ride, arrive: nowMinute() + total, key: legs.map(l => l.line + l.key + l.from + l.to).join('>') };
}
function dedupePlans(list) {
  const map = new Map();
  list.forEach(p => {
    const old = map.get(p.key);
    if (!old || p.total < old.total) map.set(p.key, p);
  });
  return [...map.values()].sort((a, b) => a.transfers - b.transfers || a.total - b.total);
}
function findDirectPlans(from, to) {
  const out = [];
  const fe = SIDX.byName.get(from) || [], te = SIDX.byName.get(to) || [];
  fe.forEach(a => te.forEach(b => {
    if (a.dir === b.dir && b.order > a.order) out.push(buildPlan([makeLeg(a.dir, a.order, b.order)]));
  }));
  return dedupePlans(out).slice(0, 8);
}
function endReachMap(to) {
  const map = new Map(), best = new Map();
  (SIDX.byName.get(to) || []).forEach(t => {
    const d = t.dir;
    for (let o = 1; o < t.order; o++) {
      if (!map.has(d.rid)) map.set(d.rid, new Map());
      const m = rideMinutes(d, o, t.order);
      const old = map.get(d.rid).get(o);
      if (!old || m < old.minutes) map.get(d.rid).set(o, { entry: t, minutes: m });
    }
  });
  map.forEach((orders, rid) => orders.forEach((v, order) => {
    const name = stopName(SIDX.dirs[rid].stops[order - 1]);
    const old = best.get(name);
    if (!old || v.minutes < old.minutes) best.set(name, { entry: v.entry, boardOrder: order, minutes: v.minutes });
  }));
  return { map, best };
}
function findTransferPlans(from, to, reach) {
  const out = [];
  (SIDX.byName.get(from) || []).forEach(a => {
    const d = a.dir;
    for (let order = a.order + 1; order <= d.stops.length; order++) {
      const transfer = stopName(d.stops[order - 1]);
      if (transfer === to) continue;
      (SIDX.byName.get(transfer) || []).forEach(b => {
        if (b.dir === d) return;
        const next = (reach.map.get(b.dir.rid) || new Map()).get(b.order);
        if (next) out.push(buildPlan([makeLeg(d, a.order, order), makeLeg(b.dir, b.order, next.entry.order)]));
      });
    }
  });
  return dedupePlans(out).slice(0, 8);
}
function findTwoTransferPlans(from, to, reach) {
  const out = [];
  (SIDX.byName.get(from) || []).forEach(a => {
    const d1 = a.dir;
    for (let o1 = a.order + 1; o1 <= d1.stops.length; o1++) {
      const t1 = stopName(d1.stops[o1 - 1]);
      if (t1 === to) continue;
      (SIDX.byName.get(t1) || []).forEach(b => {
        if (b.dir === d1) return;
        const d2 = b.dir;
        for (let o2 = b.order + 1; o2 <= d2.stops.length; o2++) {
          const t2 = stopName(d2.stops[o2 - 1]);
          if (t2 === from || t2 === to || t2 === t1) continue;
          const c = reach.best.get(t2);
          if (!c || c.entry.dir === d2) continue;
          out.push(buildPlan([
            makeLeg(d1, a.order, o1), makeLeg(d2, b.order, o2),
            makeLeg(c.entry.dir, c.boardOrder, c.entry.order)
          ]));
          if (out.length > 200) return;
        }
      });
      if (out.length > 200) return;
    }
  });
  return dedupePlans(out).slice(0, 8);
}
function planRoute(from, to) {
  if (!from || !to || from === to) return [];
  const reach = endReachMap(to);
  let plans = findDirectPlans(from, to);
  if (!plans.length) plans = findTransferPlans(from, to, reach);
  if (!plans.length) plans = findTwoTransferPlans(from, to, reach);
  return plans.slice(0, 6);
}
