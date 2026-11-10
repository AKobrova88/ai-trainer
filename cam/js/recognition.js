'use strict';
/* Recognize movement patterns from the existing pose frames. A candidate needs a visible
   out-and-back cycle. Landmark geometry alone cannot identify the equipment or grip. */
const videoMovements = {
  db_curl: {name: 'сгибания рук на бицепс', related: ['bb_curl', 'hammer_curl', 'cable_curl', 'preacher_curl', 'incline_curl', 'concentration_curl', 'band_curl', 'pushdown']},
  rdl_db: {name: 'наклон с отведением таза, как в румынской тяге', related: ['rdl_bb', 'deadlift', 'sumo_deadlift', 'good_morning', 'single_leg_rdl']},
  bw_squat: {name: 'приседания', related: [...Object.keys(EX.squat), 'band_squat']},
  lateral_raise: {name: 'подъёмы рук в стороны', related: ['cable_lateral']},
  leg_ext: {name: 'разгибания ног', related: ['leg_press']}
};

function recognitionFrame(kp, t, joints) {
  const {sh, el, wr, hip, kn, an} = joints;
  const at = i => {
    const p = kp && kp[i];
    return p && p.score > .52 && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  };
  const hasWorld = p => p.world && p.world.score > .52 && [p.world.x, p.world.y, p.world.z].every(Number.isFinite);
  const bend = (...indices) => {
    const points = indices.map(at);
    if (!points.every(Boolean)) return NaN;
    return AT.angle(...(points.every(hasWorld) ? points : points.map(({x, y}) => ({x, y}))));
  };
  const delta = (i, j) => {
    const a = at(i), b = at(j);
    if (!a || !b) return null;
    const useWorld = [a, b].every(hasWorld);
    const from = useWorld ? a.world : a, to = useWorld ? b.world : b;
    return {y: to.y - from.y, length: Math.hypot(to.x - from.x, to.y - from.y, useWorld ? to.z - from.z : 0)};
  };
  const tilt = (i, j) => {
    const d = delta(i, j);
    return d && d.length ? Math.acos(clamp(d.y / d.length, -1, 1)) * 180 / Math.PI : NaN;
  };
  const forearm = delta(el, wr);
  const wristUp = forearm && forearm.length ? -forearm.y / forearm.length : NaN;
  return {t, elbow: bend(sh, el, wr), shoulder: bend(hip, sh, el), hip: bend(sh, hip, kn),
    knee: bend(hip, kn, an), trunk: tilt(sh, hip), thigh: tilt(hip, kn), wristUp};
}

function movementCycles(rows, resting, working) {
  let count = 0, phase = 0, streak = 0, started = 0, last = -Infinity;
  for (const row of rows) {
    if (row.t - last > .42) { phase = 0; streak = 0; }
    last = row.t;
    const matches = (phase === 1 ? working : resting)(row);
    streak = matches ? streak + 1 : 0;
    if (streak < 2) continue;
    streak = 0;
    if (phase === 0) started = row.t;
    if (phase === 2) {
      if (row.t - started >= .55) count++;
      started = row.t;
      phase = 1;
    } else phase++;
  }
  return count;
}

const visibleArm = r => [r.elbow, r.shoulder, r.trunk, r.wristUp].every(Number.isFinite);
const curlCycles = rows => movementCycles(rows.filter(visibleArm),
  r => r.elbow > 140 && r.shoulder < 52 && r.wristUp < -.50,
  r => r.elbow < 91 && r.shoulder < 52 && r.trunk < 55 && r.wristUp > .59);

function recognizeVideoExercise(frames) {
  const found = new Set();
  const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const side of Object.values(AT.SIDE)) {
    const rows = frames.map(([kp, t]) => recognitionFrame(kp, t, side));
    const arm = rows.filter(visibleArm);
    const torso = rows.filter(r => [r.hip, r.knee, r.trunk, r.thigh].every(Number.isFinite));
    const leg = rows.filter(r => Number.isFinite(r.knee) && r.thigh > 59 && r.thigh < 116);
    const enough = a => a.length >= Math.max(12, frames.length * .5);
    if (enough(arm) && median(arm.map(r => r.trunk)) < 46 && median(arm.map(r => r.shoulder)) < 44 && curlCycles(arm)) found.add('db_curl');
    if (enough(arm) && median(arm.map(r => r.trunk)) < 23 &&
        movementCycles(arm, r => r.shoulder < 25 && r.elbow > 135,
          r => r.shoulder > 65 && r.elbow > 146 && r.trunk < 30 && r.wristUp < .4)) {
      // At the top of a side raise the elbows move away from the torso in the body's frontal plane.
      const lateral = frames.filter(([kp]) => {
        if (!kp) return false;
        const projected = AT.projectWorld(kp, 'front');
        if (!projected) return false;
        const a = projected[side.sh], b = projected[side.el];
        return a.score > .55 && b.score > .55 && Math.abs(b.x - a.x) > 180 && Math.abs(b.y - a.y) < 180;
      });
      if (lateral.length >= 3) found.add('lateral_raise');
    }
    if (enough(torso)) {
      const standing = r => r.hip > 143 && r.knee > 144 && r.trunk < 31 && r.thigh < 39;
      if (movementCycles(torso, standing, r => r.knee < 112 && r.hip < 129 && r.thigh > 40 && r.trunk < 62)) found.add('bw_squat');
      if (movementCycles(torso, standing, r => r.hip < 123 && r.knee > 140 && r.trunk > 42 && r.thigh < 40)) found.add('rdl_db');
    }
    if (enough(leg) && movementCycles(leg, r => r.knee < 118, r => r.knee > 151)) found.add('leg_ext');
  }
  return found.size === 1 ? found.values().next().value : null;
}
