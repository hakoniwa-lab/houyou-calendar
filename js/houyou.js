/*
 * 法要の日程を命日から計算する。
 *
 * 日付はすべて「日の通し番号」(ユリウス日番号、astro.js の jdn)で扱う。
 * Date オブジェクトを通さないので、時差やタイムゾーンで1日ずれることがない。
 *
 * 数え方の約束(画面の解説にも同じことを書いている):
 *   忌日(七日ごと)  命日を1日目として数える。初七日=命日+6日、四十九日=命日+48日
 *                  「関西式」は命日の前日を1日目とする(=七日ごとの法要がすべて1日早い)
 *   百箇日         命日を1日目として100日目(=命日+99日)。関西式でも動かさない
 *   年忌           一周忌だけ満1年、三回忌からは「回忌の数−1」年後の祥月命日
 *   神式の霊祭     亡くなった日を1日目として10日ごと。翌日祭は2日目
 *   神式の式年祭   満◯年(三年祭=満3年)。仏式の三回忌(満2年)とは1年ずれる
 *   2月29日        うるう年でない年の祥月命日は2月28日にする
 *
 * 依存: astro.js(jdn)、koyomi.js(rokuyo, lunarDate)、holiday.js(holidayOf)
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/* ---------- 日の通し番号 ---------- */

/* 日の通し番号 → グレゴリオ暦の年月日(Richards のアルゴリズム) */
function ymdOf(idx) {
  const f = idx + 1401 + Math.floor((Math.floor((4 * idx + 274277) / 146097) * 3) / 4) - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const d = Math.floor((h % 153) / 5) + 1;
  const m = ((Math.floor(h / 153) + 2) % 12) + 1;
  const y = Math.floor(e / 1461) - 4716 + Math.floor((12 + 2 - m) / 12);
  return { y, m, d };
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/* その日の曜日・六曜・祝日。同じ日を何度も引くのでキャッシュする */
const _dayInfoCache = new Map();

function dayInfo(idx) {
  if (_dayInfoCache.has(idx)) return _dayInfoCache.get(idx);
  const { y, m, d } = ymdOf(idx);
  const wd = (idx + 1) % 7;                 // 0=日 … 6=土
  const r = rokuyo(y, m, d);
  const holiday = holidayOf(y, m, d);
  const info = {
    idx, y, m, d, wd,
    wdName: WEEKDAYS[wd],
    rokuyo: r ? r.name : null,
    holiday,
    isRest: wd === 0 || wd === 6 || !!holiday,
  };
  _dayInfoCache.set(idx, info);
  return info;
}

/*
 * その日より前で、いちばん近い「休みのかたまり」(土日・祝日が続く日)を日付の早い順で返す。
 * 法要は「当日が平日なら、直前の休日に前倒しする」のが一般的なので、その候補。
 * 3連休なら3日とも入る。平日の祝日が1日だけのときは、その前の週末も足す。
 */
function restDaysBefore(idx, maxBack = 14) {
  const runs = [];
  let cur = null;
  for (let k = 1; k <= maxBack; k++) {
    const info = dayInfo(idx - k);
    if (info.isRest) {
      if (!cur) { cur = []; runs.push(cur); }
      cur.push(info);
    } else if (cur) {
      cur = null;
      if (runs[0].length >= 2 || runs.length >= 2) break;
    }
  }
  const picked = runs.length && runs[0].length === 1 ? runs.slice(0, 2) : runs.slice(0, 1);
  return picked.flat().sort((a, b) => a.idx - b.idx);
}

/* ---------- 和暦 ---------- */

const ERAS = [
  { name: "令和", y: 2019, m: 5, d: 1 },
  { name: "平成", y: 1989, m: 1, d: 8 },
  { name: "昭和", y: 1926, m: 12, d: 25 },
  { name: "大正", y: 1912, m: 7, d: 30 },
];

function _eraLabel(era, y) {
  const n = y - era.y + 1;
  return era.name + (n === 1 ? "元" : n) + "年";
}

/* その日の和暦(例: 令和8年) */
function warekiOfDate(y, m, d) {
  const idx = jdn(y, m, d);
  for (const era of ERAS) {
    if (idx >= jdn(era.y, era.m, era.d)) return _eraLabel(era, y);
  }
  return "";
}

/* その年に使われた和暦をすべて(改元の年は2つ。例: 平成31年・令和元年) */
function warekiOfYear(y) {
  const out = [];
  for (const era of [...ERAS].reverse()) {
    const endY = era === ERAS[0] ? Infinity : ERAS[ERAS.indexOf(era) - 1].y;
    if (y >= era.y && y <= endY) out.push(_eraLabel(era, y));
  }
  return out;
}

/* ---------- 法要の定義 ---------- */

/* 忌日法要(仏式)。day は命日を1日目としたときの日数 */
const CHUIN = [
  { key: "7", name: "初七日", yomi: "しょなのか", day: 7,
    note: "葬儀の日に繰り上げて、葬儀とあわせて行うことが多い法要です。" },
  { key: "14", name: "二七日", yomi: "ふたなのか", day: 14, minor: true },
  { key: "21", name: "三七日", yomi: "みなのか", day: 21, minor: true },
  { key: "28", name: "四七日", yomi: "よなのか", day: 28, minor: true },
  { key: "35", name: "五七日", yomi: "いつなのか", day: 35, alias: "三十五日", minor: true,
    note: "この日を忌明けとする地域やお寺もあります。" },
  { key: "42", name: "六七日", yomi: "むなのか", day: 42, minor: true },
  { key: "49", name: "四十九日", yomi: "しじゅうくにち", day: 49, alias: "七七日・満中陰",
    note: "忌明けの法要です。納骨をこの日にあわせることもよくあります。" },
];

const HYAKKANICHI = {
  key: "100", name: "百箇日", yomi: "ひゃっかにち", day: 100, alias: "卒哭忌",
  note: "泣くことをやめる日とされ、身内だけで行うことが多い法要です。",
};

/* 年忌法要(仏式)。years は命日から何年後の祥月命日か */
const NENKI = [
  { key: "n1", name: "一周忌", yomi: "いっしゅうき", years: 1,
    note: "満1年。年忌法要のなかでいちばん大切にされる法要です。" },
  { key: "n3", name: "三回忌", yomi: "さんかいき", years: 2,
    note: "満2年。亡くなった日を1回目と数えるので、2年後が3回目の忌日になります。" },
  { key: "n7", name: "七回忌", yomi: "ななかいき", years: 6 },
  { key: "n13", name: "十三回忌", yomi: "じゅうさんかいき", years: 12 },
  { key: "n17", name: "十七回忌", yomi: "じゅうななかいき", years: 16 },
  { key: "n23", name: "二十三回忌", yomi: "にじゅうさんかいき", years: 22 },
  { key: "n25", name: "二十五回忌", yomi: "にじゅうごかいき", years: 24, minor: true,
    note: "二十三回忌と二十七回忌の代わりに、この回だけを行う宗派・地域があります。" },
  { key: "n27", name: "二十七回忌", yomi: "にじゅうななかいき", years: 26 },
  { key: "n33", name: "三十三回忌", yomi: "さんじゅうさんかいき", years: 32,
    note: "ここで弔い上げ(年忌法要の締めくくり)とすることが多い回です。" },
  { key: "n50", name: "五十回忌", yomi: "ごじゅうかいき", years: 49,
    note: "三十三回忌で締めくくらない場合は、ここを弔い上げとすることが多い回です。" },
];

/* 神式の霊祭。day は亡くなった日を1日目としたときの日数 */
const REISAI = [
  { key: "s2", name: "翌日祭", yomi: "よくじつさい", day: 2, minor: true,
    note: "葬儀の翌日に行う祭儀です。" },
  { key: "s10", name: "十日祭", yomi: "とおかさい", day: 10,
    note: "葬儀の日にあわせて行う場合もあります。" },
  { key: "s20", name: "二十日祭", yomi: "はつかさい", day: 20, minor: true },
  { key: "s30", name: "三十日祭", yomi: "みそかさい", day: 30, minor: true },
  { key: "s40", name: "四十日祭", yomi: "よそかさい", day: 40, minor: true },
  { key: "s50", name: "五十日祭", yomi: "ごじゅうにちさい", day: 50,
    note: "忌明けの祭儀です。仏式の四十九日にあたります。" },
  { key: "s100", name: "百日祭", yomi: "ひゃくにちさい", day: 100 },
];

/* 神式の式年祭。years は満年数 */
const SHIKINEN = [
  { key: "t1", name: "一年祭", yomi: "いちねんさい", years: 1 },
  { key: "t2", name: "二年祭", yomi: "にねんさい", years: 2, minor: true,
    note: "行わない家や地域もあります。" },
  { key: "t3", name: "三年祭", yomi: "さんねんさい", years: 3,
    note: "満3年。仏式の三回忌(満2年)とは1年ずれます。" },
  { key: "t5", name: "五年祭", yomi: "ごねんさい", years: 5 },
  { key: "t10", name: "十年祭", yomi: "じゅうねんさい", years: 10 },
  { key: "t20", name: "二十年祭", yomi: "にじゅうねんさい", years: 20 },
  { key: "t30", name: "三十年祭", yomi: "さんじゅうねんさい", years: 30 },
  { key: "t40", name: "四十年祭", yomi: "よんじゅうねんさい", years: 40 },
  { key: "t50", name: "五十年祭", yomi: "ごじゅうねんさい", years: 50 },
];

/*
 * ペットの供養(pet/)。決まった作法はなく、人の法要の数え方を借りて節目を迎える家庭が多い。
 * 年忌は三回忌・七回忌・十三回忌あたりで区切ることが多いとされるので、犬猫の寿命に近い十七回忌まで出す。
 */
const PET_CHUIN = [
  { key: "7", name: "初七日", yomi: "しょなのか", day: 7,
    note: "最初の節目です。火葬やお見送りのあと、落ち着いて手を合わせる日にする家庭が多いようです。" },
  { key: "14", name: "二七日", yomi: "ふたなのか", day: 14, minor: true },
  { key: "21", name: "三七日", yomi: "みなのか", day: 21, minor: true },
  { key: "28", name: "四七日", yomi: "よなのか", day: 28, minor: true },
  { key: "35", name: "五七日", yomi: "いつなのか", day: 35, alias: "三十五日", minor: true },
  { key: "42", name: "六七日", yomi: "むなのか", day: 42, minor: true },
  { key: "49", name: "四十九日", yomi: "しじゅうくにち", day: 49, alias: "七七日",
    note: "納骨の目安とされる日です。自宅に置いておくか、霊園に納めるかを決める区切りにもなります。" },
];

const PET_HYAKKANICHI = {
  key: "100", name: "百箇日", yomi: "ひゃっかにち", day: 100,
  note: "悲しみに区切りをつける日とされます。家族だけで静かに手を合わせることが多い節目です。",
};

const PET_NENKI = [
  { key: "n1", name: "一周忌", yomi: "いっしゅうき", years: 1,
    note: "満1年。霊園の合同法要や個別法要を申し込むなら、早めに予定を確かめておくと安心です。" },
  { key: "n3", name: "三回忌", yomi: "さんかいき", years: 2,
    note: "満2年。人の法要と同じく、亡くなった日を1回目と数えるので2年後です。" },
  { key: "n7", name: "七回忌", yomi: "ななかいき", years: 6 },
  { key: "n13", name: "十三回忌", yomi: "じゅうさんかいき", years: 12,
    note: "ここで区切り(弔い上げ)とすることが多い回です。" },
  { key: "n17", name: "十七回忌", yomi: "じゅうななかいき", years: 16, minor: true },
];

/* 月命日。n か月目の、命日と同じ日付。その日がない月(31日など)は月末にする */
function monthlyMemorials(deathIdx, count) {
  const death = ymdOf(deathIdx);
  const out = [];
  for (let n = 1; n <= count; n++) {
    const t = death.m - 1 + n;
    const y = death.y + Math.floor(t / 12);
    const m = (t % 12) + 1;
    const d = Math.min(death.d, daysInMonth(y, m));
    const idx = jdn(y, m, d);
    out.push({ n, idx, info: dayInfo(idx), endOfMonth: d !== death.d });
  }
  return out;
}

/* お彼岸。春分の日・秋分の日を中日とする前後3日の7日間(霊園の合同供養祭が多い時期) */
function higanPeriod(year, season) {
  const mid = season === "spring" ? termDay(year, 3, 0) : termDay(year, 9, 180);
  return { year, season, start: dayInfo(mid - 3), mid: dayInfo(mid), end: dayInfo(mid + 3) };
}

/* その日以降に終わるお彼岸を、近い順に count 個 */
function upcomingHigan(fromIdx, count) {
  const out = [];
  for (let y = ymdOf(fromIdx).y; out.length < count; y++) {
    for (const season of ["spring", "autumn"]) {
      const p = higanPeriod(y, season);
      if (p.end.idx >= fromIdx && out.length < count) out.push(p);
    }
  }
  return out;
}

/* ---------- お盆 ---------- */

const BON_TYPES = {
  aug: { label: "8月盆(月遅れ盆)", short: "8月" },
  jul: { label: "7月盆", short: "7月" },
  kyu: { label: "旧盆(旧暦7月)", short: "旧盆" },
};

/* 旧暦7月13日(沖縄などの旧盆の初日=ウンケー)。新暦では8月上旬〜9月上旬 */
const _kyubonCache = new Map();

function kyubonStart(year) {
  if (_kyubonCache.has(year)) return _kyubonCache.get(year);
  let found = null;
  for (let idx = jdn(year, 7, 15); idx <= jdn(year, 9, 20); idx++) {
    const { y, m, d } = ymdOf(idx);
    const l = lunarDate(y, m, d);
    if (l && l.num === 7 && !l.leap && l.day === 13) { found = idx; break; }
  }
  _kyubonCache.set(year, found);
  return found;
}

/* その年のお盆の期間(日の通し番号)。7月盆・8月盆は13日〜16日、旧盆は旧暦13日〜15日 */
function bonPeriod(year, bon) {
  if (bon === "jul") return { start: jdn(year, 7, 13), end: jdn(year, 7, 16) };
  if (bon === "kyu") {
    const s = kyubonStart(year);
    return s === null ? null : { start: s, end: s + 2 };
  }
  return { start: jdn(year, 8, 13), end: jdn(year, 8, 16) };
}

/*
 * 初盆(新盆)。四十九日(忌明け)を過ぎてから初めて迎えるお盆。
 * 四十九日がお盆の初日より前に来ればその年、そうでなければ翌年。
 * reason: "same"=その年 / "kichu"=その年のお盆が忌中にあたる / "passed"=その年のお盆は亡くなる前に終わっている
 */
function computeHatsubon(deathIdx, kiakeIdx, bon) {
  const deathY = ymdOf(deathIdx).y;
  const first = bonPeriod(deathY, bon);
  let year = deathY;
  let reason = "same";
  if (!first || deathIdx > first.end) {
    year = deathY + 1;
    reason = "passed";
  } else if (kiakeIdx >= first.start) {
    year = deathY + 1;
    reason = "kichu";
  }
  const p = year === deathY ? first : bonPeriod(year, bon);
  if (!p) return null;
  return {
    year, reason, bon,
    start: dayInfo(p.start),
    end: dayInfo(p.end),
    gap: p.start - kiakeIdx,                 // 忌明けから盆入りまでの日数
    close: reason === "same" && p.start - kiakeIdx <= 14,
    skipped: reason === "kichu" ? { start: dayInfo(first.start), end: dayInfo(first.end) } : null,
  };
}

/* ---------- 日程表 ---------- */

/* 祥月命日。2月29日に亡くなった場合、うるう年でない年は2月28日 */
function anniversary(death, years) {
  const y = death.y + years;
  let d = death.d;
  let leapAdjusted = false;
  if (death.m === 2 && death.d === 29 && !isLeapYear(y)) { d = 28; leapAdjusted = true; }
  return { idx: jdn(y, death.m, d), leapAdjusted };
}

/*
 * input: { y, m, d, style: "butsu"|"shinto"|"pet", kansai: bool, bon: "aug"|"jul"|"kyu" }
 * 戻り値: { death, items[], kiake, mitsukigoshi, hatsubon }
 *   items は日付順。各要素に info(曜日・六曜・祝日)と candidates(前倒しの候補)が付く
 *   pet は仏式と同じ数え方で、節目の顔ぶれ(PET_*)だけが違う。三月越しは出さない
 */
function buildSchedule(input) {
  const style = input.style === "shinto" || input.style === "pet" ? input.style : "butsu";
  const kansai = style !== "shinto" && !!input.kansai;
  const bon = BON_TYPES[input.bon] ? input.bon : "aug";
  const deathIdx = jdn(input.y, input.m, input.d);
  const death = dayInfo(deathIdx);
  const items = [];

  const add = (def, group, idx, extra) => {
    items.push({
      key: def.key, group, name: def.name, yomi: def.yomi || "", alias: def.alias || "",
      note: def.note || "", minor: !!def.minor, days: def.day || null, years: def.years || null,
      idx, info: dayInfo(idx), leapAdjusted: false, ...extra,
    });
  };

  if (style === "shinto") {
    for (const r of REISAI) add(r, "reisai", deathIdx + r.day - 1);
    for (const s of SHIKINEN) {
      const a = anniversary(death, s.years);
      add(s, "shikinen", a.idx, { leapAdjusted: a.leapAdjusted });
    }
  } else {
    const pet = style === "pet";
    const shift = kansai ? 1 : 0;
    for (const c of pet ? PET_CHUIN : CHUIN) add(c, "chuin", deathIdx + c.day - 1 - shift);
    const hyakka = pet ? PET_HYAKKANICHI : HYAKKANICHI;
    add(hyakka, "chuin", deathIdx + hyakka.day - 1);
    for (const n of pet ? PET_NENKI : NENKI) {
      const a = anniversary(death, n.years);
      add(n, "nenki", a.idx, { leapAdjusted: a.leapAdjusted });
    }
  }

  for (const it of items) it.candidates = it.info.isRest ? [] : restDaysBefore(it.idx);

  const kiakeItem = items.find(it => it.key === (style === "shinto" ? "s50" : "49"));
  const kiake = kiakeItem.info;

  /*
   * 三月越し: 四十九日が、命日の月から数えて3つめの月に入る。
   * このときは五七日(三十五日)で忌明けとする地域があるので、一覧で五七日を目立たせる。
   * 月の半ば以降に亡くなればほぼ該当するので、「次の法要」やカレンダー登録は四十九日のまま
   */
  let mitsukigoshi = null;
  if (style === "butsu") {
    const span = (kiake.y * 12 + kiake.m) - (death.y * 12 + death.m);
    if (span >= 2) {
      const goshichi = items.find(it => it.key === "35");
      goshichi.highlight = true;
      mitsukigoshi = { goshichi };
    }
  }

  const hatsubon = style !== "shinto" ? computeHatsubon(deathIdx, kiake.idx, bon) : null;

  return { input: { ...input, style, kansai, bon }, death, items, kiake, mitsukigoshi, hatsubon };
}

/* 今日以降でいちばん近い法要(初盆を含む)。なければ null */
function nextEvent(schedule, todayIdx) {
  const cands = schedule.items.filter(it => !it.minor && it.idx >= todayIdx)
    .map(it => ({ kind: "item", item: it, idx: it.idx }));
  const hb = schedule.hatsubon;
  if (hb && hb.end.idx >= todayIdx) cands.push({ kind: "bon", bon: hb, idx: hb.start.idx });
  cands.sort((a, b) => a.idx - b.idx);
  return cands[0] || null;
}

/* ---------- 年忌早見表 ---------- */

/* year 年に営む年忌(式年祭)と、その対象になる没年 */
function nenkiOfYear(year, style) {
  const defs = style === "shinto" ? SHIKINEN : NENKI;
  return defs.map(def => ({
    key: def.key, name: def.name, yomi: def.yomi, years: def.years, minor: !!def.minor,
    deathYear: year - def.years,
    wareki: warekiOfYear(year - def.years),
  }));
}

/* ---------- 表示用の書式 ---------- */

function fmtDate(info) {
  return `${info.y}年${info.m}月${info.d}日(${info.wdName})`;
}

function fmtShort(info) {
  return `${info.m}/${info.d}(${info.wdName})`;
}

function fmtMd(info) {
  return `${info.m}月${info.d}日(${info.wdName})`;
}

/*
 * 表のHTML。画面(hayami.js)と静的ページの生成(scripts/build.js)の両方がこれを使うので、
 * 書き出した表と画面で選んだ表の中身が食い違わない。
 */
function nenkiTableHtml(year, style) {
  const head = style === "shinto" ? "式年祭" : "回忌";
  const rows = nenkiOfYear(year, style).map((r) =>
    `<tr${r.minor ? ' class="is-minor"' : ""}><th>${r.name}</th><td class="num">${r.deathYear}年</td>` +
    `<td>${r.wareki.join("・")}</td><td class="num">満${r.years}年</td></tr>`).join("");
  return `<table class="spec"><thead><tr><th>${head}</th><th>亡くなった年</th><th>和暦</th><th>経過</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

/* 旧盆(ウンケー・ナカビ・ウークイ)の表 */
function kyubonTableHtml(fromYear, count) {
  const rows = [];
  for (let y = fromYear; y < fromYear + count; y++) {
    const s = kyubonStart(y);
    if (s === null) continue;
    const [a, b, c] = [dayInfo(s), dayInfo(s + 1), dayInfo(s + 2)];
    rows.push(`<tr><th>${y}年</th><td class="num">${fmtMd(a)}</td><td class="num">${fmtMd(b)}</td><td class="num">${fmtMd(c)}</td></tr>`);
  }
  return `<table class="spec"><thead><tr><th>年</th><th>ウンケー(迎え)</th><th>ナカビ</th><th>ウークイ(送り)</th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table>`;
}
