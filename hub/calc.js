/**
 * 安定度計算引擎與荷重表反算
 * 公式移植自「安定度/安定度計算.html」（已對照 Excel 驗證之版本），單位：cm、kg。
 *
 * 前方安定度：SF = (Wp + Wa + Wo) / (Wp + Wa) ≧ 1.15
 *   Wo = Ko − (Wa − Wh)，Ko = [(Ws+Wf)·Lw/2 − Wh·Lw/2 − Wr·d·cosθ] / (r − Lw/2)
 * 令 SF = 1.15 反解吊升荷重上限：
 *   Wa_max = (Ko + Wh − 0.15·Wp) / 1.15
 */
const Calc = (() => {
  const num = (x) => { if (x === '' || x == null) return NaN; const n = Number(String(x).replace(/,/g, '')); return isFinite(n) ? n : NaN; };
  const rad = (d) => d * Math.PI / 180;
  const SF_FRONT = 1.15;

  /* ---------- 伸臂引擎（同安定度計算.html engine()） ---------- */
  function boomEngine(lengths, segW, cylW) {
    const numSeg = lengths.length, numCyl = cylW.length;
    const calcLen = lengths.map((v, i) => i === 0 ? v : v - lengths[i - 1]);
    const sumSegW = segW.reduce((a, b) => a + b, 0), sumCylW = cylW.reduce((a, b) => a + b, 0);
    const Wr = sumSegW + sumCylW;
    function ratio(c, D) { const base = c <= numCyl ? (c > D ? 0 : 1) : (D - numCyl) / (numSeg - numCyl); return base <= 0 ? 0 : base; }
    function cumFor(D) { const cum = []; let s = 0; for (let j = 1; j <= numSeg; j++) { s += calcLen[j - 1] * ratio(j, D); cum[j] = s; } cum[numSeg + 1] = cum[numSeg]; return cum; }
    function d_of(D) {
      if (D < 1 || D > numSeg) return NaN; const cum = cumFor(D); let n = 0;
      for (let j = 1; j <= numSeg; j++) n += (cum[j] - calcLen[j - 1] / 2) * segW[j - 1];
      for (let j = 1; j <= numCyl; j++) n += ((cum[j] - calcLen[j - 1] + cum[j + 1]) / 2) * cylW[j - 1];
      return n / Wr;
    }
    function equiv(D) {
      if (D < 1 || D > numSeg) return NaN; const cum = cumFor(D), dD = d_of(D); let wp1 = 0, wp2 = 0;
      for (let j = 1; j <= numSeg; j++) { const end = cum[j], start = cum[j] - calcLen[j - 1];
        const oh = end >= dD ? (start > dD ? end - start : end - dD) : 0; wp1 += oh / calcLen[j - 1] * segW[j - 1]; }
      for (let j = 1; j <= numCyl; j++) { const start = cum[j] - calcLen[j - 1], end = cum[j + 1];
        const oh = end >= dD ? (start > dD ? end - start : end - dD) : 0; wp2 += (end - start) ? oh / (end - start) * cylW[j - 1] : 0; }
      return wp1 + wp2; // kg
    }
    return { numSeg, numCyl, calcLen, Wr, d_of, equiv };
  }

  /* ---------- 伸臂重量推估（無原廠資料時） ----------
   *   Wr ≈ 23 × √(原吊升荷重 t) × 全伸長度 m（例：2.95t、12.5m → 約 494 kg）
   * 各節重量 ∝ 節長 × 0.85^(節次)，油壓缸約佔 8%。 */
  function estimateBoom(stagesCm, origCapT, numCyl) {
    const n = stagesCm.length; if (!n) return { segW: [], cylW: [], Wr: 0 };
    const Lmax = stagesCm[n - 1] / 100;
    const cap = isFinite(origCapT) && origCapT > 0 ? origCapT : 2.9;
    const Wr = 23 * Math.sqrt(cap) * Lmax;
    const nc = Math.max(0, Math.min(isFinite(numCyl) ? numCyl : Math.floor(n / 2), n));
    const calcLen = stagesCm.map((v, i) => i === 0 ? v : v - stagesCm[i - 1]);
    const raw = calcLen.map((l, i) => Math.max(l, 1) * Math.pow(0.85, i));
    const rs = raw.reduce((a, b) => a + b, 0);
    const segShare = nc ? 0.92 : 1;
    const segW = raw.map(r => Math.round(Wr * segShare * r / rs));
    const cw = Array.from({ length: nc }, (_, i) => 1 - 0.2 * i).map(x => Math.max(x, 0.3));
    const cs = cw.reduce((a, b) => a + b, 0) || 1;
    const cylW = cw.map(x => Math.round(Wr * (1 - segShare) * x / cs));
    return { segW, cylW, Wr: segW.reduce((a, b) => a + b, 0) + cylW.reduce((a, b) => a + b, 0), numCyl: nc };
  }

  /* ---------- 單點安定度上限 ---------- */
  function stabLimit(P, B, Lcm, rcm) {
    const D = P.lengths.indexOf(Lcm) + 1;
    if (D < 1) return { Wa: NaN, err: '伸臂長度不在節段清單內' };
    if (rcm > Lcm + 1e-6) return { Wa: NaN, err: '作業半徑大於伸臂長度' };
    const d = B.d_of(D), Wp = B.equiv(D) / 1000; // t
    const theta = Math.acos(Math.min(rcm / Lcm, 1));
    const dcos = d * Math.cos(theta);
    const G = P.Lw;
    if (rcm <= G / 2) return { Wa: Infinity, norisk: true, d, Wp, theta };
    const Ecol = P.Ws + P.Wf;
    const Ko = (Ecol * G / 2 - P.Wh * (G / 2) - B.Wr * dcos) / (rcm - G / 2) / 1000; // t
    // Ko < 0（半徑在撐座外）：伸臂自重力矩已大於車體穩定力矩，空載即翻倒 → 不可作業
    if (Ko < 0) return { Wa: 0, Ko, unstable: true, d, Wp, theta };
    const Wa = Math.max(0, (Ko + P.Wh / 1000 - (SF_FRONT - 1) * Wp) / SF_FRONT * 1000); // kg
    return { Wa, Ko, d, Wp, theta };
  }

  /* SF 正算（驗證用） */
  function sfAt(P, B, Lcm, rcm, WaKg) {
    const s = stabLimit(P, B, Lcm, rcm);
    if (s.norisk) return Infinity;
    const Wo = s.Ko - (WaKg - P.Wh) / 1000;
    return (Wo + s.Wp + WaKg / 1000) / (s.Wp + WaKg / 1000);
  }

  /* ---------- 解析荷重表儲存格文字 ---------- */
  function parseCell(t) {
    const s = String(t == null ? '' : t).trim();
    if (!s) return { blank: true };
    if (/^[\/／╱\\×xX—-]+$/.test(s)) return { slash: true };
    const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    const r = s.match(/\(\s*([\d.]+)\s*m?\s*\)/i);
    if (!m) return { blank: true };
    return { val: Number(m[0]), rOverride: r ? Number(r[1]) : null };
  }

  /* ---------- 原吊升荷重（kg）：銘牌值，或由原廠荷重表最大值反推 ---------- */
  function origCapacityKg(c) {
    const t = num(c.crane.orig_capacity_t);
    if (t > 0) return t * 1000;
    if (c.hasChart && c.origChart && c.origChart.cells) {
      let mx = 0; c.origChart.cells.forEach(row => (row || []).forEach(x => { const p = parseCell(x); if (p.val > mx) mx = p.val; }));
      if (mx > 0) return mx;
    }
    return NaN;
  }

  /* ---------- 安定度參數之預設／推估值（使用者未填時採用，並標示來源） ---------- */
  const STAB_LABEL = { Wb: '起重機總重量 Wb', Wf: '腳架、立柱重量 Wf', Wh: '吊具組重量 Wh', thetaM: '伸臂最大起伏角 θm', B1: '前輪距 B1', B2: '後輪距 B2',
    S: '前輪中心至旋轉中心距離 S', h1: '車台重心高度 h1', h2: '腳架、立柱重心高度 h2', h3: '吊具組重心高度 h3', h4: '伸臂重心高度 h4' };
  function defaults(c) {
    const d = {};
    const r1 = (x) => Math.round(x * 10) / 10;
    const ew = num(c.vehicle.empty_weight_kg); if (ew > 0) d.Wb = { v: ew, src: 'S2-2 車籍資料空重', kind: '帶入' };
    const lengths = (c.boom.stages_m || []).map(num).filter(x => x > 0).map(m => Math.round(m * 10000) / 100);
    if (lengths.length) {
      const bw = boomWeights(c, lengths);
      const tot = bw.segW.reduce((a, b) => a + b, 0) + bw.cylW.reduce((a, b) => a + b, 0);
      if (tot > 0) d.Wf = { v: Math.round(tot), src: '等於伸臂總重', kind: '推估' };
    }
    const capKg = origCapacityKg(c);
    if (capKg > 0) d.Wh = { v: Math.max(10, Math.round(capKg * 0.01 / 10) * 10), src: '原吊升荷重 ' + capKg + ' kg 之 1%（四捨五入至 10 kg）', kind: '推估' };
    d.thetaM = { v: 76, src: '預設值', kind: '預設' };
    const ft = num(c.vehicle.front_track_cm); if (ft > 0) d.B1 = { v: ft, src: 'S2-2 車籍資料前輪距', kind: '帶入' };
    const rt = num(c.vehicle.rear_track_cm); if (rt > 0) d.B2 = { v: rt, src: 'S2-2 車籍資料後輪距', kind: '帶入' };
    d.S = { v: 110, src: '預設值', kind: '預設' };
    const h = num(c.vehicle.height_cm);
    if (h > 0) {
      d.h1 = { v: r1(h / 3), src: '車高 ' + h + ' cm × 1/3', kind: '推估' };
      d.h2 = { v: r1(h / 2), src: '車高 ' + h + ' cm × 1/2', kind: '推估' };
      d.h3 = { v: r1(h - 50), src: '車高 ' + h + ' cm − 50', kind: '推估' };
      d.h4 = { v: r1(h - 15), src: '車高 ' + h + ' cm − 15', kind: '推估' };
    }
    return d;
  }
  /* 實際採用值：使用者有填用使用者值，否則用預設／推估值 */
  function effective(c) {
    const d = defaults(c), vals = {}, used = [];
    for (const k of Object.keys(STAB_LABEL)) {
      const u = num((c.stab || {})[k]);
      if (isFinite(u)) vals[k] = u;
      else if (d[k]) { vals[k] = d[k].v; used.push({ key: k, label: STAB_LABEL[k], v: d[k].v, src: d[k].src, kind: d[k].kind }); }
      else vals[k] = NaN;
    }
    return { vals, used, defaults: d };
  }

  /* ---------- 收集參數 ---------- */
  function collect(c) {
    const warn = [], miss = [];
    const stagesM = (c.boom.stages_m || []).map(num).filter(x => isFinite(x) && x > 0);
    const lengths = stagesM.map(m => Math.round(m * 100 * 100) / 100);
    const cap = (num(c.platform.weight_kg) + num(c.platform.payload_kg)) * 2;
    const E = effective(c), V = E.vals;
    const P = {
      Wb: V.Wb, Wf: V.Wf, Wh: V.Wh, B1: V.B1, B2: V.B2, H: num(c.vehicle.wheelbase_cm),
      Lw: num(c.stab.Lw), thetaM: V.thetaM, S: V.S, h1: V.h1, h2: V.h2, h3: V.h3, h4: V.h4, lengths, _used: E.used
    };
    const need = { Wb: '起重機總重量 Wb', Wh: '吊具組重量 Wh', Lw: '外伸撐座全伸寬度 Lw', thetaM: '伸臂最大起伏角 θm' };
    for (const [k, label] of Object.entries(need)) if (!isFinite(P[k])) miss.push(label);
    if (!lengths.length) miss.push('伸臂各段伸出長度');
    if (!isFinite(cap) || cap <= 0) miss.push('搭乘設備重量與載重');
    for (let i = 1; i < lengths.length; i++) if (lengths[i] <= lengths[i - 1]) warn.push('伸臂長度必須由短到長遞增（第 ' + (i + 1) + ' 段）。');
    return { P, cap, lengths, stagesM, miss, warn };
  }

  function boomWeights(c, lengths) {
    const origCap = num(c.crane.orig_capacity_t);
    const nc = num(c.boom.numCyl);
    if (c.boom.weightMode === 'manual') {
      const segW = lengths.map((_, i) => num((c.boom.segW || [])[i]) || 0);
      const cylW = (c.boom.cylW || []).map(num).filter(x => isFinite(x) && x > 0);
      return { segW, cylW, est: false };
    }
    const capUsed = origCapacityKg(c) / 1000;
    const e = estimateBoom(lengths, capUsed, nc);
    return { segW: e.segW, cylW: e.cylW, est: true, numCyl: e.numCyl, capUsed };
  }

  /* ---------- 主流程：反算新荷重表 ---------- */
  function compute(c) {
    const { P, cap, lengths, stagesM, miss, warn } = collect(c);
    if (miss.length) return { ok: false, miss, warn };
    const bw = boomWeights(c, lengths);
    // 額定荷重 = (搭乘設備重量＋載重)×2；吊升荷重（荷重表數值，含吊具）上限 = 額定荷重＋吊具組重量 Wh
    const ratedCap = Math.floor(cap / 10) * 10;
    const capRound = Math.floor((cap + (isFinite(P.Wh) ? P.Wh : 0)) / 10) * 10;
    const origCapKg = num(c.crane.orig_capacity_t) * 1000;
    const hasChart = c.hasChart && c.origChart && c.origChart.booms && c.origChart.booms.length;

    // 建立網格
    let booms = stagesM.slice(), radii = [], orig = null;
    if (hasChart) {
      booms = c.origChart.booms.map(num);
      radii = c.origChart.radii.map(num);
      orig = c.origChart.cells;
      const bad = booms.filter(b => !stagesM.some(s => Math.abs(s - b) < 0.005));
      if (bad.length) return { ok: false, miss: ['原廠荷重表伸臂長度（' + bad.join('、') + ' m）與「伸臂各段伸出長度」不一致，請於步驟 2 確認'], warn };
    } else {
      const Lmax = stagesM[stagesM.length - 1];
      for (let r = 1; r <= Math.ceil(Lmax - 1e-9); r++) radii.push(r);
    }

    function build(scale) {
      const B = boomEngine(lengths, bw.segW.map(w => w * scale), bw.cylW.map(w => w * scale));
      const Ws = P.Wb - P.Wf - B.Wr - P.Wh;
      const PP = Object.assign({}, P, { Ws });
      return { B, PP };
    }

    // 有原廠表：比對遠端（最大半徑）格之原廠值與安定度上限，作為輸入值合理性檢查
    const scale = 1; let fitInfo = null;
    if (hasChart) {
      const { B, PP } = build(1); const pts = [];
      booms.forEach((L, ci) => {
        for (let ri = radii.length - 1; ri >= 0; ri--) {
          const pc = parseCell((orig[ri] || [])[ci]);
          if (pc.val > 0) {
            const Lc = lengths.reduce((a, b) => Math.abs(b - L * 100) < Math.abs(a - L * 100) ? b : a, lengths[0]);
            const st = stabLimit(PP, B, Lc, (pc.rOverride || radii[ri]) * 100);
            pts.push({ L, r: pc.rOverride || radii[ri], orig: pc.val, stab: st.Wa, ratio: st.Wa / pc.val }); break;
          }
        }
      });
      const fin = pts.filter(p => isFinite(p.ratio));
      const minRatio = fin.length ? Math.min(...fin.map(p => p.ratio)) : NaN;
      fitInfo = { points: pts, minRatio, origCapUsed: bw.capUsed };
      if (minRatio < 0.6) warn.push('原廠荷重表最遠半徑處之數值遠高於本系統安定度計算值（比值 ' + minRatio.toFixed(2) + '），請確認總重量、撐座寬度、伸臂長度等輸入值是否正確。');
    }
    const { B, PP } = build(scale);
    if (!(PP.Ws > 0)) return { ok: false, miss: ['車台重量 Ws = Wb − Wf − Wr − Wh 為負值，請檢查總重量 / 腳架重量 / 伸臂重量'], warn };

    const cosT = Math.cos(rad(P.thetaM));
    const cells = radii.map(() => booms.map(() => null));
    const lcmOf = (Lm) => lengths.reduce((a, b) => Math.abs(b - Lm * 100) < Math.abs(a - Lm * 100) ? b : a, lengths[0]);
    booms.forEach((Lm, ci) => {
      const Lcm = lcmOf(Lm);
      const rmin = Lm * cosT;
      let prev = Infinity;
      radii.forEach((r, ri) => {
        let text = '', isSlash = false, val = null, gov = null, rUse = r, note = '';
        if (hasChart) {
          const pc = parseCell((orig[ri] || [])[ci]);
          if (pc.slash) { cells[ri][ci] = { text: '', isSlash: true }; return; }
          if (pc.blank) { cells[ri][ci] = { text: '', isSlash: false }; return; }
          rUse = pc.rOverride || r;
          if (pc.rOverride) note = '(' + pc.rOverride + 'm)';
          const st = stabLimit(PP, B, Lcm, rUse * 100);
          const cand = [['cap', capRound], ['stab', st.Wa], ['orig', pc.val]].filter(x => isFinite(x[1]));
          cand.sort((a, b) => a[1] - b[1]);
          val = cand[0][1]; gov = cand[0][0];
          cells[ri][ci] = { origVal: pc.val, stab: st.Wa };
        } else {
          if (r < rmin - 1e-9) { cells[ri][ci] = { text: '', isSlash: true }; return; }
          if (r > Lm + 1e-9) {
            if (r - 1 < Lm - 1e-9) { rUse = Lm; note = '(' + Lm + 'm)'; }
            else { cells[ri][ci] = { text: '', isSlash: false }; return; }
          }
          const st = stabLimit(PP, B, Lcm, rUse * 100);
          const cand = [['cap', capRound], ['stab', st.Wa]];
          if (isFinite(origCapKg) && origCapKg > 0) cand.push(['orig', origCapKg]);
          const ok = cand.filter(x => isFinite(x[1])).sort((a, b) => a[1] - b[1]);
          val = ok[0][1]; gov = ok[0][0];
          cells[ri][ci] = { stab: st.Wa };
        }
        val = Math.max(0, Math.floor(val / 10) * 10);
        if (val > prev) { val = prev; gov = 'mono'; }
        prev = val;
        Object.assign(cells[ri][ci], { text: (val > 0 ? String(val) : '—') + (note ? '\n' + note : ''), isSlash, val, gov, r: rUse });
      });
    });

    // 不可作業格（空載即翻倒或允許荷重為 0）
    let unstableCount = 0;
    cells.forEach(row => row.forEach(x => { if (x && !x.isSlash && x.text && x.val === 0) unstableCount++; }));

    // 最終吊升荷重 = 新荷重表最大值（不超過 額定荷重 (搭乘設備+載重)×2 ＋ 吊具重量）
    let maxVal = 0;
    cells.forEach(row => row.forEach(x => { if (x && x.val > maxVal) maxVal = x.val; }));
    const liftT = Math.floor(maxVal / 10) / 100;
    if (maxVal < capRound) warn.push('安定度不足：新荷重表最大值 ' + maxVal + ' kg 小於 吊升荷重上限 ' + capRound + ' kg（額定荷重 (搭乘設備+載重)×2 = ' + ratedCap + ' kg ＋ 吊具 ' + P.Wh + ' kg）。');

    // 後方 / 左右安定度
    const d1 = B.d_of(1), L1p = lengths[0], Bavg = (P.B1 + P.B2) / 2;
    const checks = {};
    if (isFinite(P.B1)) {
      const L1 = ((PP.Ws + P.Wf) * P.B1 / 2 + B.Wr * (d1 * cosT + P.B1 / 2) + P.Wh * (L1p * cosT + P.B1 / 2)) / P.Wb;
      checks.rear1 = { label: '後方安定度（伸臂與行駛方向直角）L1/B1', value: L1 / P.B1, limit: 0.15 };
    }
    if (isFinite(P.H) && isFinite(P.S) && isFinite(Bavg)) {
      const L2 = (PP.Ws * P.H / 3 + P.Wf * P.S + B.Wr * (d1 * cosT + P.S) + P.Wh * (L1p * cosT + P.S)) / P.Wb;
      checks.rear2 = { label: '後方安定度（伸臂與行駛方向一致）L2/B', value: L2 / Bavg, limit: 0.15 };
    }
    if ([P.h1, P.h2, P.h3, P.h4].every(isFinite) && isFinite(Bavg)) {
      const hp = (PP.Ws * P.h1 + P.Wf * P.h2 + P.Wh * P.h3 + B.Wr * P.h4) / (PP.Ws + P.Wf + P.Wh + B.Wr);
      checks.side = { label: '左右安定度（傾斜 30°）L′×√3/h′', value: (Bavg / 2) * Math.sqrt(3) / hp, limit: 1, hp };
    }
    for (const k of Object.keys(checks)) checks[k].ok = checks[k].value >= checks[k].limit;
    if (!checks.rear1 || !checks.rear2 || !checks.side) warn.push('後方/左右安定度資料不完整（需輪距、軸距、前輪至旋轉中心距離、各重心高度），尚無法完成全部檢核。');

    // 驗證：逐格 SF
    let minSF = Infinity;
    booms.forEach((Lm, ci) => radii.forEach((r, ri) => { const x = cells[ri][ci]; if (x && x.val > 0) {
      const sf = sfAt(PP, B, lcmOf(Lm), x.r * 100, x.val); x.L = lcmOf(Lm); x.sf = sf; if (sf < minSF) minSF = sf; } }));

    return {
      ok: true, warn, cap: ratedCap, liftCap: capRound, liftT, maxVal, booms, radii, cells, scale, fitInfo, minSF, defaultsUsed: P._used, unstableCount,
      boom: { lengths, segW: bw.segW.map(w => Math.round(w * scale)), cylW: bw.cylW.map(w => Math.round(w * scale)), Wr: Math.round(B.Wr), est: bw.est },
      params: Object.assign({}, P, { Ws: Math.round(PP.Ws) }), checks, computedAt: new Date().toISOString()
    };
  }

  return { compute, defaults, effective, origCapacityKg, STAB_LABEL, estimateBoom, boomEngine, parseCell, num };
})();
