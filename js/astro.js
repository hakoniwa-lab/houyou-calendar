/*
 * 天文計算。西洋占星術の天体位置と、四柱推命・九星が使う節入り(二十四節気)を出す。
 * DOM に依存しない純粋関数だけを置く。
 *
 * 精度の目安(この用途では十分):
 *   太陽 …… 約0.01度   (Meeus「Astronomical Algorithms」25章の简約式)
 *   月   …… 約0.02度   (同47章の主要26項)
 *   惑星 …… 10分角程度 (JPL の近似軌道要素 1800-2050年)
 * 星座の境目ちょうどに生まれた場合だけ、1つ隣に出る可能性がある。
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function norm360(x) {
  const v = x % 360;
  return v < 0 ? v + 360 : v;
}
function sinD(x) { return Math.sin(x * D2R); }
function cosD(x) { return Math.cos(x * D2R); }
function tanD(x) { return Math.tan(x * D2R); }

/* ---------- ユリウス日 ---------- */

/*
 * 暦日(グレゴリオ暦)→ユリウス日。時刻は日の端数として足す。
 * jdnAt() は「その日」を表す整数のユリウス日番号で、日柱の干支に使う。
 */
function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/* 日本時間(UTC+9)の年月日時分 → ユリウス日(UT基準の実数) */
function jdFromJst(y, m, d, hour, minute) {
  const h = (hour || 0) + (minute || 0) / 60 - 9; // JST→UT
  return jdn(y, m, d) - 0.5 + h / 24;
}

function centuries(jd) {
  return (jd - 2451545.0) / 36525;
}

/* ---------- ΔT(地球時 − 世界時) ---------- */

/*
 * 天体位置の式は地球時(TT)で書かれているが、暦の日時は世界時(UT)。
 * その差が ΔT で、いまは約70秒。節入りが「2月3日か4日か」の境目に来る年
 * (2021年の立春は 23:59)では、この70秒が日付を左右する。
 * 係数は NASA(Espenak/Meeus)の近似多項式。単位は秒。
 */
function deltaTSeconds(year) {
  let t;
  if (year < 1920) { t = year - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (year < 1941) { t = year - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
  if (year < 1961) { t = year - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (year < 1986) { t = year - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  t = year - 2000; return -20 + 32 * ((year - 1820) / 100) ** 2 - 0.5628 * (2150 - year);
}

/* 世界時のユリウス日 → 地球時のユリウス日 */
function ttFrom(jdUt) {
  const year = 2000 + (jdUt - 2451545.0) / 365.25;
  return jdUt + deltaTSeconds(year) / 86400;
}

/* ---------- 太陽の見かけの黄経 ---------- */

function sunLongitude(jd) {
  const T = centuries(jd);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinD(M)
    + (0.019993 - 0.000101 * T) * sinD(2 * M)
    + 0.000289 * sinD(3 * M);
  const trueLong = L0 + C;

  /*
   * 金星・木星・月による摂動。これを足さないと視黄経が 0.003度ほどずれ、
   * 節入りの時刻が3〜4分早く出る。立春が 23:58 のような年(2021年)では
   * 日付が1日ずれかねないので、この補正は省けない。
   */
  const pA = 351.52 + 22518.7541 * T;
  const pB = 253.14 + 45036.8864 * T;
  const pC = 157.23 + 32964.3577 * T;
  const pD = 297.85 + 445267.1142 * T;
  const pE = 252.08 + 20.190 * T;
  const perturb = 0.00134 * cosD(pA) + 0.00154 * cosD(pB) + 0.00200 * cosD(pC)
    + 0.00179 * sinD(pD) + 0.00178 * sinD(pE);

  const omega = 125.04 - 1934.136 * T;
  return norm360(trueLong + perturb - 0.00569 - 0.00478 * sinD(omega));
}

/* ---------- 月の黄経 ---------- */

/* Meeus 47章の周期項のうち、黄経に効く上位26項 */
const MOON_TERMS = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
];

function moonLongitude(jd) {
  const T = centuries(jd);
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sum = 0;
  for (const [cd, cm, cmp, cf, coef] of MOON_TERMS) {
    // 太陽の平均近点角 M を含む項は、地球の軌道離心率の変化で振幅が変わる
    const ecc = cm === 0 ? 1 : (Math.abs(cm) === 1 ? E : E * E);
    sum += coef * ecc * sinD(cd * D + cm * M + cmp * Mp + cf * F);
  }
  return norm360(Lp + sum / 1000000);
}

/* ---------- 惑星の黄経 ---------- */

/*
 * JPL「Approximate Positions of the Planets」の軌道要素(1800-2050年)。
 * 各行は [値, 100年あたりの変化] で、a(AU) e I(度) L(度) 近日点黄経(度) 昇交点黄経(度)。
 */
const PLANETS = {
  mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  venus: { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], i: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0] },
  mars: { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], i: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  saturn: { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
};

/* 太陽を中心とした黄道直交座標(AU) */
function heliocentric(name, T) {
  const p = PLANETS[name];
  const a = p.a[0] + p.a[1] * T;
  const e = p.e[0] + p.e[1] * T;
  const inc = p.i[0] + p.i[1] * T;
  const L = p.L[0] + p.L[1] * T;
  const peri = p.peri[0] + p.peri[1] * T;
  const node = p.node[0] + p.node[1] * T;

  const argPeri = peri - node;
  let M = ((L - peri + 180) % 360 + 360) % 360 - 180; // -180〜180度に寄せる

  // ケプラー方程式 M = E - e*sinE を反復で解く(eが小さいので数回で収束)
  const eDeg = R2D * e;
  let E = M + eDeg * sinD(M);
  for (let k = 0; k < 12; k++) {
    const dM = M - (E - eDeg * sinD(E));
    const dE = dM / (1 - e * cosD(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }

  // 軌道面上の位置 → 黄道座標へ回転
  const xv = a * (cosD(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sinD(E);
  const cw = cosD(argPeri), sw = sinD(argPeri);
  const cn = cosD(node), sn = sinD(node);
  const ci = cosD(inc), si = sinD(inc);
  return {
    x: (cw * cn - sw * sn * ci) * xv + (-sw * cn - cw * sn * ci) * yv,
    y: (cw * sn + sw * cn * ci) * xv + (-sw * sn + cw * cn * ci) * yv,
    z: (sw * si) * xv + (cw * si) * yv,
  };
}

/* 地球から見た黄経(度) */
function planetLongitude(name, jd) {
  const T = centuries(jd);
  const p = heliocentric(name, T);
  const e = heliocentric("earth", T);
  return norm360(Math.atan2(p.y - e.y, p.x - e.x) * R2D);
}

/* ---------- 二十四節気(節入り) ---------- */

/*
 * 太陽の黄経が target 度になる瞬間を二分法で求める。
 * 引数・戻り値ともユリウス日(UT)。天体位置の式には TT に直してから渡す。
 *
 * ★ 探す月を必ず指定すること ★
 * 黄経から月を逆算すると、小寒(285度)のように年をまたぐ節で「翌年の1月」を
 * 拾ってしまい、年柱が1年ずれる。節はどれも その月の3日〜9日ごろに来るので、
 * 月初の2日前から20日間だけを見る。
 */
/*
 * 計算結果の使い回し。カレンダーは1か月分で同じ年の節気を何百回も引くので、
 * キャッシュしないと画面が固まる。中身は年と目標黄経だけで決まるので安全に再利用できる。
 */
const _termCache = new Map();

function solarTermJd(year, month, target) {
  const key = year + "|" + month + "|" + target;
  if (_termCache.has(key)) return _termCache.get(key);
  const v = _solarTermJdRaw(year, month, target);
  _termCache.set(key, v);
  return v;
}

function _solarTermJdRaw(year, month, target) {
  let lo = jdFromJst(year, month, 1, 0, 0) - 2;
  let hi = lo + 20;

  const diff = (jd) => {
    let d = sunLongitude(ttFrom(jd)) - target;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };
  // 万一その窓に入っていなければ広げる(通常は起きない)
  let guard = 0;
  while (diff(lo) > 0 && guard++ < 20) lo -= 5;
  guard = 0;
  while (diff(hi) < 0 && guard++ < 20) hi += 5;

  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (diff(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/*
 * 四柱推命・九星が使う「節」12個。気(中気)は使わない。
 * [節の名前, 太陽黄経, 来る月, その節から始まる月の十二支index]
 * 十二支index: 子0 丑1 寅2 卯3 辰4 巳5 午6 未7 申8 酉9 戌10 亥11
 */
const SEKKI = [
  ["小寒", 285, 1, 1],   // 丑月
  ["立春", 315, 2, 2],   // 寅月 ← 年の変わり目
  ["啓蟄", 345, 3, 3],   // 卯月
  ["清明", 15, 4, 4],    // 辰月
  ["立夏", 45, 5, 5],    // 巳月
  ["芒種", 75, 6, 6],    // 午月
  ["小暑", 105, 7, 7],   // 未月
  ["立秋", 135, 8, 8],   // 申月
  ["白露", 165, 9, 9],   // 酉月
  ["寒露", 195, 10, 10], // 戌月
  ["立冬", 225, 11, 11], // 亥月
  ["大雪", 255, 12, 0],  // 子月
];

/* その暦年に実際に来る12の節を、日本時間の日付つきで返す(1月の小寒から順) */
const _sekkiCache = new Map();

function sekkiOfYear(year) {
  if (_sekkiCache.has(year)) return _sekkiCache.get(year);
  const v = _sekkiOfYearRaw(year);
  _sekkiCache.set(year, v);
  return v;
}

function _sekkiOfYearRaw(year) {
  return SEKKI.map(([name, lon, month, branch]) => {
    const jd = solarTermJd(year, month, lon);
    const jst = jdToJstParts(jd);
    return { name, lon, branch, jd, ...jst };
  });
}

/* 指定年の立春(ユリウス日 UT)。年柱・本命星の年の境目。 */
function risshunJd(year) {
  return solarTermJd(year, 2, 315);
}

/* ユリウス日(UT) → 日本時間の年月日時分 */
function jdToJstParts(jd) {
  const z = jd + 0.5 + 9 / 24; // JSTへ
  let day = Math.floor(z);
  let frac = z - day;
  let a = day;
  if (day >= 2299161) {
    const alpha = Math.floor((day - 1867216.25) / 36524.25);
    a = day + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dd = b - d - Math.floor(30.6001 * e);
  const mm = e < 14 ? e - 1 : e - 13;
  const yy = mm > 2 ? c - 4716 : c - 4715;
  const hours = frac * 24;
  const h = Math.floor(hours);
  const mi = Math.floor((hours - h) * 60);
  return { y: yy, m: mm, d: dd, hh: h, mi: mi };
}

/* ---------- アセンダント(上昇宮) ---------- */

/* グリニッジ平均恒星時(度) */
function gmst(jd) {
  const T = centuries(jd);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000);
}

/* 黄道傾斜角(度) */
function obliquity(jd) {
  const T = centuries(jd);
  return 23.4392911 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T;
}

/*
 * アセンダント(東の地平線と黄道が交わる点)の黄経。
 * lat: 北緯(度)、lon: 東経(度)。
 */
function ascendant(jd, lat, lon) {
  const ramc = norm360(gmst(jd) + lon);
  const eps = obliquity(jd);
  let asc = norm360(Math.atan2(
    cosD(ramc),
    -(sinD(ramc) * cosD(eps) + tanD(lat) * sinD(eps))
  ) * R2D);
  // アセンダントは MC より黄道順に0〜180度の範囲にある。外れていたら反対側。
  const mc = norm360(Math.atan2(sinD(ramc), cosD(ramc) * cosD(eps)) * R2D);
  if (norm360(asc - mc) > 180) asc = norm360(asc + 180);
  return { asc, mc, ramc };
}

/* ---------- 星座 ---------- */

/* 黄経(度) → 0=牡羊座 … 11=魚座 と、その星座の中での度数 */
function signOf(longitude) {
  const l = norm360(longitude);
  return { sign: Math.floor(l / 30), deg: l % 30 };
}
