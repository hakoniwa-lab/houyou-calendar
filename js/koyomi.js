/*
 * 旧暦(太陰太陽暦)と暦注。astro.js の天体計算と chart.js の干支を使う。
 *
 * 六曜は「旧暦の月＋日」で決まるので、旧暦そのものを出さないと計算できない。
 * 旧暦は朔(新月の瞬間)と中気(太陽黄経が30度の倍数になる瞬間)の両方から決まる。
 * どちらも astro.js で出せるので、暦を丸ごと組み立てている。
 *
 * ★ 暦注には流派差がある ★
 * 六曜・天赦日・寅の日などは計算方法がはっきりしているが、
 * 一粒万倍日・不成就日・三隣亡は採用する表が資料によって異なることがある。
 * このファイルで使った表は画面にも明記すること。
 */

/* ---------- 日の通し番号(日本時間) ---------- */

/* ユリウス日(UT) → その瞬間が属する日本時間の日の通し番号(JDN) */
function jstDayIndex(jdUt) {
  const p = jdToJstParts(jdUt);
  return jdn(p.y, p.m, p.d);
}

/* 日の通し番号 → その日の日本時間の真ん中あたりのユリウス日(UT) */
function jstDayMidUt(dayIdx) {
  // JDN d の日本時間は UT の [d-0.875, d+0.125] にあたる
  return dayIdx - 0.375;
}

/* ---------- 朔(新月) ---------- */

/*
 * jd の近くの朔(新月)の瞬間を返す。
 * 月と太陽の黄経差が0になる点をニュートン法で追い込む。
 * 月は太陽に対して1日あたり約12.19度進むので、ずれた角度をその値で割れば
 * 修正すべき日数になる。数回で収束する。
 */
const _newMoonCache = new Map();

function newMoonNear(jd) {
  // Meeus の平均朔の式で当たりをつける。k は朔の通し番号なのでキャッシュのキーになる
  const k = Math.round((jd - 2451550.09766) / 29.530588861);
  if (_newMoonCache.has(k)) return _newMoonCache.get(k);
  let t = 2451550.09766 + 29.530588861 * k;

  for (let i = 0; i < 30; i++) {
    let p = norm360(moonLongitude(ttFrom(t)) - sunLongitude(ttFrom(t)));
    if (p > 180) p -= 360;
    if (Math.abs(p) < 1e-7) break;
    t -= p / 12.190749;
  }
  _newMoonCache.set(k, t);
  return t;
}

/* その日を含む朔望月の朔日(JDN) */
function lunarMonthStart(dayIdx) {
  const mid = jstDayMidUt(dayIdx);
  let d = jstDayIndex(newMoonNear(mid));
  // newMoonNear は「最も近い」朔なので、先の朔を拾うことがある。その場合は1か月戻す
  if (d > dayIdx) d = jstDayIndex(newMoonNear(mid - 29.53));
  return d;
}

/* 次の朔日(JDN) */
function nextLunarMonthStart(startDay) {
  return jstDayIndex(newMoonNear(jstDayMidUt(startDay) + 29.53));
}

/* ---------- 中気 ---------- */

/*
 * その瞬間の太陽黄経が、どの30度区画にいるか(0〜11)。
 * 区画が変わった月に中気が入っている、という判定に使う。
 * 冬至(270度)は区画9の始まり。
 */
function chuArea(jdUt) {
  return Math.floor(norm360(sunLongitude(ttFrom(jdUt))) / 30);
}

/* 日の始まり(日本時間0時)のユリウス日(UT) */
function jstDayStartUt(dayIdx) {
  return dayIdx - 0.875;
}

/* ---------- 旧暦の月立て(天保暦の手順) ---------- */

/*
 * winterYear 年の冬至を含む朔望月を「十一月」として、
 * 翌年の冬至の前月までの朔望月に番号を振る。
 *
 * 手順:
 *   1. 冬至を含む朔望月が十一月
 *   2. 次の冬至を含む朔望月までに朔望月が13個あれば、その年に閏月がある
 *   3. 閏月は、十一月の次から見ていって最初に「中気を含まない月」
 *   4. 閏月は前の月と同じ番号になる(閏◯月)
 */
const _lunarTableCache = new Map();

function lunarMonthTable(winterYear) {
  if (_lunarTableCache.has(winterYear)) return _lunarTableCache.get(winterYear);
  const v = _lunarMonthTableRaw(winterYear);
  _lunarTableCache.set(winterYear, v);
  return v;
}

function _lunarMonthTableRaw(winterYear) {
  const wsDay = jstDayIndex(solarTermJd(winterYear, 12, 270));       // 冬至
  const wsNextDay = jstDayIndex(solarTermJd(winterYear + 1, 12, 270)); // 翌年の冬至

  const m11 = lunarMonthStart(wsDay);
  const m11Next = lunarMonthStart(wsNextDay);

  // 朔日を並べる
  const starts = [m11];
  let cur = m11;
  let guard = 0;
  while (cur < m11Next && guard++ < 20) {
    cur = nextLunarMonthStart(cur);
    starts.push(cur);
  }
  // starts の最後は翌年の十一月。その手前までが今回の対象
  const count = starts.length - 1; // 十一月から翌十一月の前月までの月数
  const hasLeap = count === 13;

  // 各月が中気を含むか
  const hasChu = [];
  for (let i = 0; i < count; i++) {
    const a = chuArea(jstDayStartUt(starts[i]));
    const b = chuArea(jstDayStartUt(starts[i + 1]));
    hasChu.push(a !== b);
  }

  // 番号を振る。十一月から始めて、閏月だけ番号を進めない
  const months = [];
  let num = 11;
  let leapUsed = false;
  for (let i = 0; i < count; i++) {
    let leap = false;
    if (hasLeap && !leapUsed && i > 0 && !hasChu[i]) {
      leap = true;
      leapUsed = true;
    }
    if (!leap && i > 0) num = num % 12 + 1;
    months.push({ start: starts[i], end: starts[i + 1] - 1, num, leap });
  }
  return months;
}

/*
 * 西暦の日付 → 旧暦。
 * 戻り値 { num: 月, day: 日, leap: 閏月か }
 */
function lunarDate(y, m, d) {
  const dayIdx = jdn(y, m, d);
  // その日が入る表を探す。冬至基準なので前年と当年の2つを見る
  for (const wy of [y, y - 1, y - 2]) {
    const table = lunarMonthTable(wy);
    for (const mo of table) {
      if (dayIdx >= mo.start && dayIdx <= mo.end) {
        return { num: mo.num, day: dayIdx - mo.start + 1, leap: mo.leap };
      }
    }
  }
  return null;
}

/* ---------- 六曜 ---------- */

const ROKUYO = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"];

const ROKUYO_TEXT = {
  大安: "何をするにも良いとされる日。六曜でいちばん良い日で、結婚式や開業に選ばれます。",
  赤口: "正午前後だけが吉で、それ以外は凶とされる日。祝い事には向かないとされます。",
  先勝: "先んずれば勝ち。午前が吉、午後は凶とされ、急ぐ用事に向くとされます。",
  友引: "友を引く日。祝い事には良く、葬儀は避けられます。正午だけは凶とされます。",
  先負: "先んずれば負け。午前は凶、午後は吉とされ、静かに待つのが良いとされます。",
  仏滅: "六曜でもっとも凶とされる日。ただし「一度終わって始まる日」と読む考え方もあります。",
};

/* 六曜は旧暦の「月＋日」を6で割った余りで決まる。閏月も同じ番号で数える */
function rokuyo(y, m, d) {
  const l = lunarDate(y, m, d);
  if (!l) return null;
  return { name: ROKUYO[(l.num + l.day) % 6], lunar: l };
}

/* ---------- 暦注(節月と日の干支から決まるもの) ---------- */

/*
 * 一粒万倍日。節切りの月ごとに、2つの十二支が当たる。
 * 一粒の籾が万倍になる日とされ、お金を出すこと・始めることに良いとされる。
 * ★この表は資料によって差があることがある★
 * キーは節月の十二支index(子0 丑1 寅2 …)、値は日の十二支index。
 */
const ICHIRYU = {
  2: [1, 6],   // 寅月: 丑・午
  3: [9, 2],   // 卯月: 酉・寅
  4: [0, 3],   // 辰月: 子・卯
  5: [3, 4],   // 巳月: 卯・辰
  6: [5, 6],   // 午月: 巳・午
  7: [9, 6],   // 未月: 酉・午
  8: [0, 7],   // 申月: 子・未
  9: [3, 8],   // 酉月: 卯・申
  10: [6, 9],  // 戌月: 午・酉
  11: [9, 10], // 亥月: 酉・戌
  0: [11, 0],  // 子月: 亥・子
  1: [3, 0],   // 丑月: 卯・子
};

/*
 * 天赦日。暦の上でもっとも良い日とされ、年に5〜6回しかない。
 * 季節ごとに決まった干支の日が当たる。
 *   春(寅卯辰月)=戊寅  夏(巳午未月)=甲午  秋(申酉戌月)=戊申  冬(亥子丑月)=甲子
 */
const TENSHA = {
  spring: { stem: 4, branch: 2 },  // 戊寅
  summer: { stem: 0, branch: 6 },  // 甲午
  autumn: { stem: 4, branch: 8 },  // 戊申
  winter: { stem: 0, branch: 0 },  // 甲子
};

function seasonOfMonthBranch(b) {
  if (b === 2 || b === 3 || b === 4) return "spring";  // 寅卯辰
  if (b === 5 || b === 6 || b === 7) return "summer";  // 巳午未
  if (b === 8 || b === 9 || b === 10) return "autumn"; // 申酉戌
  return "winter";                                     // 亥子丑
}

/*
 * 三隣亡。建築関係で避けられる凶日。節切りの月の十二支で決まる。
 *   寅巳申亥の月: 亥の日 / 卯午酉子の月: 寅の日 / 辰未戌丑の月: 午の日
 */
function sanrinboBranch(monthBranch) {
  if ([2, 5, 8, 11].includes(monthBranch)) return 11; // 亥
  if ([3, 6, 9, 0].includes(monthBranch)) return 2;   // 寅
  return 6;                                           // 午
}

/*
 * 不成就日。何を始めても成就しないとされる凶日。旧暦の月と日で決まる。
 * 1・7月:3,11,19,27 / 2・8月:2,10,18,26 / 3・9月:1,9,17,25
 * 4・10月:4,12,20,28 / 5・11月:5,13,21,29 / 6・12月:6,14,22,30
 */
const FUJOJU = {
  1: [3, 11, 19, 27], 7: [3, 11, 19, 27],
  2: [2, 10, 18, 26], 8: [2, 10, 18, 26],
  3: [1, 9, 17, 25], 9: [1, 9, 17, 25],
  4: [4, 12, 20, 28], 10: [4, 12, 20, 28],
  5: [5, 13, 21, 29], 11: [5, 13, 21, 29],
  6: [6, 14, 22, 30], 12: [6, 14, 22, 30],
};

/*
 * 十二直。節切りの月の十二支と同じ十二支の日が「建」で、そこから順に回る。
 * 六曜より古くから使われていた暦注。
 */
const JUNICHOKU = ["建", "除", "満", "平", "定", "執", "破", "危", "成", "納", "開", "閉"];

const JUNICHOKU_TEXT = {
  建: "万物を建て生じる日。神仏の祭祀や開店に良いとされます",
  除: "取り除く日。掃除や治療に良いとされます",
  満: "満ち足りる日。新築や移転、祝い事に良いとされます",
  平: "平らに成る日。旅行や結婚に良いとされます",
  定: "定まる日。開店や移転に良く、訴訟には向かないとされます",
  執: "執り行う日。祝い事や種まきに良いとされます",
  破: "破れる日。訴訟や談判には良いが、祝い事は避けるとされます",
  危: "危ぶむ日。何事も控えめにするのが良いとされます",
  成: "成し遂げる日。新しいことを始めるのに良いとされます",
  納: "納め入れる日。買い物や収穫に良いとされます",
  開: "開き通じる日。建築や結婚に良いとされます",
  閉: "閉じ塞がる日。金銭の収納や墓を建てるのに良いとされます",
};

/* ---------- 干支の表による吉日 ---------- */

/*
 * 天恩日。天の恩恵をすべての人が受ける日とされ、60干支のうち次の15日。
 *   甲子〜戊辰(0〜4)、己卯〜癸未(15〜19)、己酉〜癸丑(45〜49)
 * 2026-09-02(己卯)が天恩日、で公開暦と一致。
 */
function isTenOn(dayIndex) {
  return (dayIndex >= 0 && dayIndex <= 4) || (dayIndex >= 15 && dayIndex <= 19) || (dayIndex >= 45 && dayIndex <= 49);
}

/*
 * 母倉日。母が子を育てるように天が人を慈しむ日。節月の季節と日の十二支で決まる。
 *   春(寅卯月)=亥・子  夏(巳午月)=寅・卯  秋(申酉月)=辰・戌・丑・未  冬(亥子月)=申・酉
 *   土用の月(辰未戌丑月)=巳・午
 * 2026-09-03(庚辰)・06(癸未)・09(丙戌)が母倉日、で公開暦と一致。
 */
function isBoso(monthBranch, dayBranch) {
  if (monthBranch === 2 || monthBranch === 3) return dayBranch === 11 || dayBranch === 0;
  if (monthBranch === 5 || monthBranch === 6) return dayBranch === 2 || dayBranch === 3;
  if (monthBranch === 8 || monthBranch === 9) return [4, 10, 1, 7].includes(dayBranch);
  if (monthBranch === 11 || monthBranch === 0) return dayBranch === 8 || dayBranch === 9;
  return dayBranch === 5 || dayBranch === 6; // 辰・未・戌・丑月
}

/* ---------- 雑節(季節の節目。すべて太陽の位置か立春からの日数で決まる) ---------- */

/*
 * 太陽の黄経が lon になる日(JDN)。month は探す月の当たり(solarTermJd の窓)。
 */
function termDay(year, month, lon) {
  return jstDayIndex(solarTermJd(year, month, lon));
}

const _zassetsuCache = new Map();

/*
 * その年の雑節を一覧にする。戻り値は { name, start, end } (JDN)。期間ものは start〜end。
 *   節分     … 立春の前日
 *   彼岸     … 春分・秋分をまん中にした7日間
 *   八十八夜 … 立春を1日目として88日目
 *   入梅     … 太陽黄経80度
 *   半夏生   … 太陽黄経100度
 *   二百十日 … 立春を1日目として210日目
 *   土用     … 太陽黄経 297/27/117/207 度から、次の立春/立夏/立秋/立冬の前日まで
 */
function zassetsuOfYear(year) {
  if (_zassetsuCache.has(year)) return _zassetsuCache.get(year);
  const risshun = termDay(year, 2, 315);
  const rikka = termDay(year, 5, 45);
  const risshu = termDay(year, 8, 135);
  const ritto = termDay(year, 11, 225);
  const shunbun = termDay(year, 3, 0);
  const shubun = termDay(year, 9, 180);
  const list = [
    { name: "節分", start: risshun - 1, end: risshun - 1, text: "立春の前日。季節を分ける日で、豆まきで邪気を払います。" },
    { name: "冬の土用", start: termDay(year, 1, 297), end: risshun - 1, text: "立春前の約18日間。土を動かすこと(基礎工事・庭いじり)を避けるとされます。" },
    { name: "春の彼岸", start: shunbun - 3, end: shunbun + 3, text: "春分をまん中にした7日間。先祖を供養する期間です。" },
    { name: "春の土用", start: termDay(year, 4, 27), end: rikka - 1, text: "立夏前の約18日間。土を動かすことを避けるとされます。" },
    { name: "八十八夜", start: risshun + 87, end: risshun + 87, text: "立春から88日目。霜の心配が終わり、茶摘み・種まきの目安とされます。" },
    { name: "入梅", start: termDay(year, 6, 80), end: termDay(year, 6, 80), text: "暦の上での梅雨入り。太陽黄経80度の日です。" },
    { name: "半夏生", start: termDay(year, 7, 100), end: termDay(year, 7, 100), text: "夏至から11日目ごろ。田植えを終える目安とされます。" },
    { name: "夏の土用", start: termDay(year, 7, 117), end: risshu - 1, text: "立秋前の約18日間。「土用の丑の日」はこの期間の丑の日です。" },
    { name: "二百十日", start: risshun + 209, end: risshun + 209, text: "立春から210日目。台風が多い厄日とされます。" },
    { name: "秋の彼岸", start: shubun - 3, end: shubun + 3, text: "秋分をまん中にした7日間。先祖を供養する期間です。" },
    { name: "秋の土用", start: termDay(year, 10, 207), end: ritto - 1, text: "立冬前の約18日間。土を動かすことを避けるとされます。" },
  ];
  _zassetsuCache.set(year, list);
  return list;
}

/* その日に当たる雑節(複数ありうる)。年またぎの冬の土用は前年分も見る */
function zassetsuOf(y, dayIdx) {
  const out = [];
  for (const yy of [y - 1, y]) {
    for (const z of zassetsuOfYear(yy)) {
      if (dayIdx >= z.start && dayIdx <= z.end) {
        const span = z.end > z.start;
        out.push({ name: z.name, text: z.text, span, start: z.start, end: z.end });
      }
    }
  }
  return out;
}

/* ---------- 二十八宿 ---------- */

/*
 * 貞享暦(1685年)以降、日に対して28日周期で連続して巡る。曜日と同じで途切れない。
 * 起点は 1980年1月10日＝角。検算: 2026-09-01＝室、2026-09-02＝壁(calc-site と一致)、
 * 房・虚・昴・星が必ず日曜日に当たる(28＝4×7 なので曜日と固定対応する)。
 */
const SHUKU = ["角", "亢", "氐", "房", "心", "尾", "箕", "斗", "牛", "女", "虚", "危", "室", "壁",
  "奎", "婁", "胃", "昴", "畢", "觜", "参", "井", "鬼", "柳", "星", "張", "翼", "軫"];

const SHUKU_TEXT = {
  角: "万事に吉。衣類の新調・柱立て・結婚に良く、葬式は避けるとされます",
  亢: "衣類の仕立て・種まき・結納に吉。建築は凶とされます",
  氐: "結婚・開店・移転に吉。衣服の仕立ては凶とされます",
  房: "結婚・旅行・移転・開店・祭祀に吉。二十八宿の中でも良い日とされます",
  心: "祭祀・移転・旅行に吉。造作・婚礼は凶とされます",
  尾: "婚礼・開店・移転・造作に吉。衣類の仕立ては凶とされます",
  箕: "動土・池掘り・開店・造作に吉。婚礼・葬式は凶とされます",
  斗: "動土・造作・開店に吉。万事に良いとされる日",
  牛: "移転・旅行・金談・万事に吉とされる日",
  女: "稽古始めに吉。葬式・訴訟・婚礼は凶とされます",
  虚: "学問始めに吉。相談事・造作は凶とされます",
  危: "壁塗り・船の乗り始めに吉。衣類の仕立て・高所の作業は凶とされます",
  室: "祈願・婚礼・祝い事・造作に吉。二十八宿の中でも良い日とされます",
  壁: "開店・旅行・婚礼・造作・衣類の仕立てに吉とされる日",
  奎: "柱立て・棟上げ・旅行・開店に吉。婚礼・葬式は凶とされます",
  婁: "動土・造作・婚礼・契約に吉。二十八宿の中でも良い日とされます",
  胃: "公事・就職・婚礼に吉。私事は控えるとされます",
  昴: "神仏の祭祀・開店・祝い事に吉。増改築は凶とされます",
  畢: "神事・造作・婚礼・農耕に吉とされる日",
  觜: "稽古始め・入学・開店に吉。造作・衣類の仕立ては凶とされます",
  参: "仕入れ・納入・買い物・造作に吉とされる日",
  井: "神事・種まき・建築・開店に吉。衣類の仕立ては凶とされます",
  鬼: "万事に大吉。二十八宿でもっとも良い日(鬼宿日)。婚礼だけは凶とされます",
  柳: "物事を断つのに吉。婚礼・開店・造作は凶とされます",
  星: "乗馬始め・治療始めに吉。婚礼・葬式は凶とされます",
  張: "就職・見合い・婚礼・祝い事・神仏の祈願に吉とされる日",
  翼: "耕作始め・植え替え・種まきに吉。高所の作業・婚礼は凶とされます",
  軫: "地鎮祭・落成式・旅行・祭祀に吉。衣類の仕立ては凶とされます",
};

function shukuOf(dayIdx) {
  const base = jdn(1980, 1, 10);
  return SHUKU[((dayIdx - base) % 28 + 28) % 28];
}

/* ---------- 流派の設定 ---------- */

/*
 * 暦注は資料によって結果が違うことがある。その差の多くは「節入りの日の扱い」で、
 * 市販の暦の大半は節入りの日を丸一日「新しい月」として扱う(日切り)。
 * 四柱推命のように節入りの時刻で切ると(時刻切り)、節入りの日の一粒万倍日・
 * 三隣亡・十二直が1日分ずれる。2026年9月7日(白露)は日切りでは一粒万倍日、
 * 時刻切りでは違う、というのが実例。
 */
const KOYOMI_DEFAULTS = {
  sekkiByDay: true,   // true=日切り(暦の慣例) / false=時刻切り
  showShuku: false,   // 二十八宿を表示するか
};

let koyomiSettings = { ...KOYOMI_DEFAULTS };

function setKoyomiSettings(patch) {
  koyomiSettings = { ...koyomiSettings, ...patch };
}

/* その日の節月の十二支。日切りなら節入り日は丸一日新しい月として扱う */
function monthBranchOf(y, m, d) {
  if (!koyomiSettings.sekkiByDay) return solarMonthOf(y, m, d, 12, 0);
  // 日の終わり(23:59)で判定すれば、その日に節入りがあれば必ず新しい月になる
  return solarMonthOf(y, m, d, 23, 59);
}

/* ---------- まとめ ---------- */

/*
 * ある日の暦注を全部返す。
 * 節月は chart.js の solarMonthOf、日の干支は dayPillarIndex を使う。
 */
function dayKoyomi(y, m, d) {
  const dayIdx = jdn(y, m, d);
  const dIndex = dayPillarIndex(y, m, d);
  const dStem = dIndex % 10;
  const dBranch = dIndex % 12;

  const sm = monthBranchOf(y, m, d);
  const mBranch = sm.branch;

  const r = rokuyo(y, m, d);
  const lunar = r ? r.lunar : null;

  const good = [];
  const bad = [];

  // 一粒万倍日
  const ichiryu = (ICHIRYU[mBranch] || []).includes(dBranch);
  if (ichiryu) good.push("一粒万倍日");

  // 天赦日
  const ts = TENSHA[seasonOfMonthBranch(mBranch)];
  const tensha = ts.stem === dStem && ts.branch === dBranch;
  if (tensha) good.push("天赦日");

  // 寅の日・巳の日・甲子の日
  const tora = dBranch === 2;
  const mi = dBranch === 5;
  const tsuchinotoMi = mi && dStem === 5;      // 己巳(弁財天)
  const kinoeNe = dStem === 0 && dBranch === 0; // 甲子(大黒天)。60日に一度
  if (tora) good.push("寅の日");
  if (tsuchinotoMi) good.push("己巳の日");
  else if (mi) good.push("巳の日");
  if (kinoeNe) good.push("甲子の日");

  // 大安
  if (r && r.name === "大安") good.push("大安");

  // 天恩日・母倉日
  const tenOn = isTenOn(dIndex);
  const boso = isBoso(mBranch, dBranch);
  if (tenOn) good.push("天恩日");
  if (boso) good.push("母倉日");

  // 雑節(節分・彼岸・土用など)
  const zassetsu = zassetsuOf(y, dayIdx);
  // 夏の土用の丑の日
  const doyoUshi = zassetsu.some((z) => z.name === "夏の土用") && dBranch === 1;

  // 不成就日
  const fujoju = lunar && (FUJOJU[lunar.num] || []).includes(lunar.day);
  if (fujoju) bad.push("不成就日");

  // 三隣亡
  const sanrinbo = sanrinboBranch(mBranch) === dBranch;
  if (sanrinbo) bad.push("三隣亡");

  // 仏滅
  if (r && r.name === "仏滅") bad.push("仏滅");

  return {
    y, m, d, dayIdx,
    weekday: new Date(y, m - 1, d).getDay(),
    eto: KAN[dStem] + SHI[dBranch],
    stem: dStem,
    branch: dBranch,
    lunar,
    rokuyo: r ? r.name : null,
    junichoku: JUNICHOKU[((dBranch - mBranch) % 12 + 12) % 12],
    sekki: sm.sekki,
    shuku: shukuOf(dayIdx),
    zassetsu,
    doyoUshi,
    sekki24: sekki24On(y, dayIdx),
    senjitsu: senjitsuOf(y, dayIdx),
    events: eventsOf(y, m, d, dayIdx, lunar),
    flags: { ichiryu, tensha, tora, mi, tsuchinotoMi, kinoeNe, tenOn, boso, fujoju, sanrinbo },
    good,
    bad,
  };
}

/* 指定した月の全日を返す */
function monthKoyomi(y, m) {
  const last = new Date(y, m, 0).getDate();
  const phases = moonPhasesOfMonth(y, m);
  const out = [];
  for (let d = 1; d <= last; d++) {
    const k = dayKoyomi(y, m, d);
    k.moonPhaseName = phases.get(k.dayIdx) || null;
    out.push(k);
  }
  return out;
}

/* ================================================================
 * 二十四節気・選日・節句・月見・月相
 * ここから下はすべて「計算だけで出せるもの」。表を持っているのは
 * 一粒万倍日・不成就日・三隣亡だけで、他は干支か太陽・月の位置から決まる。
 * ================================================================ */

/* ---------- 日の干支(通し番号から) ---------- */

/* 日の通し番号(JDN) → 60干支の通し番号(0=甲子) */
function ganzhiOfDayIdx(dayIdx) {
  return ((dayIdx + 49) % 60 + 60) % 60;
}

/* startDay 以降で n 番目に、十干が stem になる日 */
function nthStemDay(startDay, stem, n) {
  let count = 0;
  for (let d = 0; d < 400; d++) {
    if (ganzhiOfDayIdx(startDay + d) % 10 === stem) {
      count += 1;
      if (count === n) return startDay + d;
    }
  }
  return null;
}

/* startDay 以降で n 番目に、十二支が branch になる日 */
function nthBranchDay(startDay, branch, n) {
  let count = 0;
  for (let d = 0; d < 400; d++) {
    if (ganzhiOfDayIdx(startDay + d) % 12 === branch) {
      count += 1;
      if (count === n) return startDay + d;
    }
  }
  return null;
}

/* centerDay にもっとも近い、十干が stem の日。同じ距離なら前の日を採る */
function nearestStemDay(centerDay, stem) {
  for (let dist = 0; dist <= 5; dist++) {
    if (ganzhiOfDayIdx(centerDay - dist) % 10 === stem) return centerDay - dist;
    if (ganzhiOfDayIdx(centerDay + dist) % 10 === stem) return centerDay + dist;
  }
  return null;
}

/* ---------- 二十四節気 ---------- */

/*
 * [名前, 太陽黄経, 来る月, 節/中]
 * 「節」は月の区切り(四柱推命の月替わり)、「中」は月の中心。
 * 旧暦の月番号は「中気を含むか」で決まるので、どちらも暦の骨格になる。
 */
const SEKKI24 = [
  ["小寒", 285, 1, "節"], ["大寒", 300, 1, "中"],
  ["立春", 315, 2, "節"], ["雨水", 330, 2, "中"],
  ["啓蟄", 345, 3, "節"], ["春分", 0, 3, "中"],
  ["清明", 15, 4, "節"], ["穀雨", 30, 4, "中"],
  ["立夏", 45, 5, "節"], ["小満", 60, 5, "中"],
  ["芒種", 75, 6, "節"], ["夏至", 90, 6, "中"],
  ["小暑", 105, 7, "節"], ["大暑", 120, 7, "中"],
  ["立秋", 135, 8, "節"], ["処暑", 150, 8, "中"],
  ["白露", 165, 9, "節"], ["秋分", 180, 9, "中"],
  ["寒露", 195, 10, "節"], ["霜降", 210, 10, "中"],
  ["立冬", 225, 11, "節"], ["小雪", 240, 11, "中"],
  ["大雪", 255, 12, "節"], ["冬至", 270, 12, "中"],
];

const SEKKI24_TEXT = {
  小寒: "寒の入り。ここから節分までが一年でいちばん寒い「寒の内」です。",
  大寒: "一年でもっとも寒さが厳しくなるころ。寒稽古や寒仕込みの時期です。",
  立春: "暦の上での春の始まり。九星や四柱推命ではこの日から新しい年になります。",
  雨水: "雪が雨に変わり、氷が解け出すころ。農作業の準備を始める目安とされます。",
  啓蟄: "土の中で冬ごもりしていた虫が、戸を開いて出てくるころ。",
  春分: "昼と夜の長さがほぼ同じになる日。この日をまん中に彼岸の7日間があります。",
  清明: "万物が清らかで生き生きとするころ。花が咲きそろい、空気が澄みます。",
  穀雨: "穀物をうるおす春の雨が降るころ。種まきの好機とされます。",
  立夏: "暦の上での夏の始まり。新緑がまぶしくなるころです。",
  小満: "草木が茂り、生き物が満ちてくるころ。麦の穂が実り始めます。",
  芒種: "芒(のぎ)のある穀物の種をまくころ。田植えの時期にあたります。",
  夏至: "一年でもっとも昼が長い日。ここから日が短くなっていきます。",
  小暑: "暑さが本格的になるころ。梅雨明けが近づきます。",
  大暑: "一年でもっとも暑さが厳しくなるころ。土用の丑の日もこのあたりです。",
  立秋: "暦の上での秋の始まり。これ以降の暑さを「残暑」と呼びます。",
  処暑: "暑さが収まるころ。朝晩に涼しさを感じ始めます。",
  白露: "草に白い露がつき始めるころ。秋の気配が濃くなります。",
  秋分: "昼と夜の長さがほぼ同じになる日。この日をまん中に彼岸の7日間があります。",
  寒露: "露が冷たく感じられるころ。秋が深まり、作物の収穫期です。",
  霜降: "霜が降り始めるころ。紅葉が里まで下りてきます。",
  立冬: "暦の上での冬の始まり。木枯らしが吹き始めます。",
  小雪: "わずかに雪が降り始めるころ。本格的な寒さの手前です。",
  大雪: "雪が本格的に降り積もるころ。冬支度を整える時期です。",
  冬至: "一年でもっとも昼が短い日。ゆず湯とかぼちゃの日として知られます。",
};

const _sekki24Cache = new Map();

/* その暦年に来る24の節気を、日付つきで返す */
function sekki24OfYear(year) {
  if (_sekki24Cache.has(year)) return _sekki24Cache.get(year);
  const list = SEKKI24.map(([name, lon, month, kind]) => {
    const jd = solarTermJd(year, month, lon);
    const p = jdToJstParts(jd);
    return { name, lon, kind, dayIdx: jdn(p.y, p.m, p.d), y: p.y, m: p.m, d: p.d, hh: p.hh, mi: p.mi };
  });
  _sekki24Cache.set(year, list);
  return list;
}

/* その日が二十四節気の当日なら、その節気を返す */
function sekki24On(y, dayIdx) {
  for (const yy of [y - 1, y, y + 1]) {
    for (const s of sekki24OfYear(yy)) if (s.dayIdx === dayIdx) return s;
  }
  return null;
}

/* ---------- 選日(せんじつ) ---------- */

/*
 * 60干支の並びだけで決まる暦注。表を覚える必要はなく、すべて位置で出せる。
 * 干支の通し番号: 0=甲子 … 59=癸亥
 */
const SENJITSU_TEXT = {
  八専: "壬子から癸亥までの12日のうち、干と支の五行が同じになる8日。天候が片寄り、物事も同じ方に偏るとされ、法事・嫁取り・造作を避ける習わしがあります。",
  "八専の間日": "八専の期間のうち、干と支の五行が食い違う4日。八専の障りがない日とされます。",
  十方暮: "甲申から癸巳までの10日間。十方(どの方角)も暮れて閉ざされるという意味で、旅行・縁談・相談事を避けるとされます。",
  天一天上: "癸巳から戊申までの16日間。方位の神である天一神が天に昇っている間で、どの方角へ動いてもさわりがないとされます。",
  大つち: "庚午から丙子までの7日間。土の神が休む期間とされ、土を動かすこと(基礎工事・井戸掘り・種まき)を避ける習わしがあります。",
  小つち: "戊寅から甲申までの7日間。大つちと同じく、土を動かすことを避けるとされます。",
  "つちの間日": "大つちと小つちの間にある丁丑の1日。土を動かしてもよいとされます。",
  庚申: "干支が庚申の日。60日に一度。体内の虫が天に罪を告げに行く夜とされ、寝ずに過ごす「庚申待ち」の風習がありました。",
  初伏: "夏至のあとの3番目の庚の日。三伏のひとつで、暑さが厳しく、種まき・旅行・縁談を避けるとされます。",
  中伏: "夏至のあとの4番目の庚の日。三伏のひとつです。",
  末伏: "立秋のあとの最初の庚の日。三伏のひとつで、これで夏の暑さが収まるとされます。",
  春社: "春分にもっとも近い戊の日。土地の神(社)を祀り、五穀豊穣を祈る日です。",
  秋社: "秋分にもっとも近い戊の日。収穫を土地の神に感謝する日です。",
  臘日: "冬至のあとの3番目の戌の日。年の暮れに神仏や祖先を祀る日とされてきました。",
};

/* その日の選日(干支の位置だけで決まるもの) */
function senjitsuByGanzhi(dayIdx) {
  const g = ganzhiOfDayIdx(dayIdx);
  const out = [];

  // 八専: 壬子(48)〜癸亥(59)。干と支の五行が一致する8日が八専、しない4日が間日
  if (g >= 48 && g <= 59) {
    const stemEl = Math.floor((g % 10) / 2);      // 十干の五行
    const branchEl = SHI_ELEMENT[g % 12];         // 十二支の五行
    if (stemEl === branchEl) out.push(g === 48 ? "八専" : "八専");
    else out.push("八専の間日");
  }
  // 十方暮: 甲申(20)〜癸巳(29)
  if (g >= 20 && g <= 29) out.push("十方暮");
  // 天一天上: 癸巳(29)〜戊申(44)
  if (g >= 29 && g <= 44) out.push("天一天上");
  // 大つち: 庚午(6)〜丙子(12) / 間日 丁丑(13) / 小つち: 戊寅(14)〜甲申(20)
  if (g >= 6 && g <= 12) out.push("大つち");
  else if (g === 13) out.push("つちの間日");
  else if (g >= 14 && g <= 20) out.push("小つち");
  // 庚申(56)
  if (g === 56) out.push("庚申");

  return out;
}

const _senjitsuYearCache = new Map();

/*
 * 年に数回しかない選日(三伏・社日・臘日)。節気を起点に干支を数えて出す。
 * 「夏至のあと」に夏至当日を含めるかは流儀があるが、ここでは当日を含める。
 */
function senjitsuOfYear(year) {
  if (_senjitsuYearCache.has(year)) return _senjitsuYearCache.get(year);
  const geshi = termDay(year, 6, 90);     // 夏至
  const risshu = termDay(year, 8, 135);   // 立秋
  const shunbun = termDay(year, 3, 0);    // 春分
  const shubun = termDay(year, 9, 180);   // 秋分
  const toji = termDay(year, 12, 270);    // 冬至

  const map = new Map();
  const put = (day, name) => {
    if (day === null) return;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(name);
  };
  put(nthStemDay(geshi, 6, 3), "初伏");    // 庚 = 十干の6
  put(nthStemDay(geshi, 6, 4), "中伏");
  put(nthStemDay(risshu, 6, 1), "末伏");
  put(nearestStemDay(shunbun, 4), "春社"); // 戊 = 十干の4
  put(nearestStemDay(shubun, 4), "秋社");
  put(nthBranchDay(toji, 10, 3), "臘日");  // 戌 = 十二支の10
  _senjitsuYearCache.set(year, map);
  return map;
}

function senjitsuOf(y, dayIdx) {
  const out = senjitsuByGanzhi(dayIdx);
  for (const yy of [y - 1, y]) {
    const m = senjitsuOfYear(yy);
    if (m.has(dayIdx)) out.push(...m.get(dayIdx));
  }
  return out;
}

/* ---------- 月の満ち欠け(朔・上弦・望・下弦) ---------- */

/*
 * 月と太陽の黄経差が target 度になる瞬間。0=新月 90=上弦 180=満月 270=下弦。
 * 差は1日に約12.19度進むので、ずれた角度をその値で割れば修正日数になる。
 */
function moonPhaseJd(jd, target) {
  let t = jd;
  for (let i = 0; i < 40; i++) {
    let p = norm360(moonLongitude(ttFrom(t)) - sunLongitude(ttFrom(t))) - target;
    if (p > 180) p -= 360;
    if (p < -180) p += 360;
    if (Math.abs(p) < 1e-7) break;
    t -= p / 12.190749;
  }
  return t;
}

const MOON_PHASES = [[0, "新月"], [90, "上弦"], [180, "満月"], [270, "下弦"]];

const MOON_PHASE_TEXT = {
  新月: "月と太陽が同じ方向に来る日。旧暦ではこの日が「1日」になります。",
  上弦: "右半分が光って見える半月。夕方に南の空へ昇ります。",
  満月: "月と太陽が向かい合う日。一晩じゅう見えます。",
  下弦: "左半分が光って見える半月。真夜中に昇り、明け方に南の空へ来ます。",
};

const _moonPhaseCache = new Map();

/* その月に起きる月相を { 日 → 名前 } で返す */
function moonPhasesOfMonth(y, m) {
  const key = y + "-" + m;
  if (_moonPhaseCache.has(key)) return _moonPhaseCache.get(key);
  const first = jdn(y, m, 1);
  const last = jdn(y, m, new Date(y, m, 0).getDate());
  const out = new Map();
  // 月の前後に余裕をもたせて、朔望月2回分を走査する
  for (let base = first - 32; base <= last + 32; base += 29.53) {
    for (const [deg, name] of MOON_PHASES) {
      const t = moonPhaseJd(jstDayMidUt(Math.round(base)) + deg / 360 * 29.53, deg);
      const di = jstDayIndex(t);
      if (di >= first && di <= last) out.set(di, name);
    }
  }
  _moonPhaseCache.set(key, out);
  return out;
}

/* ---------- 節句・年中行事(暦で決まるもの) ---------- */

const SEKKU = {
  "1-7": ["人日の節句", "七草がゆを食べて一年の無病息災を願う日。五節句のひとつです。"],
  "3-3": ["上巳の節句", "桃の節句・ひな祭り。女の子の健やかな成長を願う日です。"],
  "5-5": ["端午の節句", "こどもの日。菖蒲を飾り、男の子の成長を願ってきました。"],
  "7-7": ["七夕の節句", "笹に願いを書いた短冊を飾る日。五節句のひとつです。"],
  "9-9": ["重陽の節句", "菊の節句。菊を飾り長寿を願う日で、五節句の最後にあたります。"],
};

const EVENT_TEXT = {
  旧正月: "旧暦の1月1日。かつての元日で、いまも中華圏では春節として祝われます。",
  十五夜: "旧暦8月15日、中秋の名月。すすきと団子を供えて月を見る日です。",
  十三夜: "旧暦9月13日、後(のち)の月。十五夜だけ見るのは「片月見」として嫌われました。",
  十日夜: "旧暦10月10日。稲刈りを終えて田の神を送る行事で、月見の3回目にあたります。",
  初午: "2月最初の午の日。稲荷神社の祭りの日です。",
  二の午: "2月2番目の午の日。初午と同じく稲荷の縁日とされます。",
  二百二十日: "立春から220日目。二百十日とならぶ、台風に警戒する厄日です。",
};

/* その日の行事(節句・月見・初午など) */
function eventsOf(y, m, d, dayIdx, lunar) {
  const out = [];
  const sekku = SEKKU[m + "-" + d];
  if (sekku) out.push({ name: sekku[0], text: sekku[1] });

  if (lunar && !lunar.leap) {
    if (lunar.num === 1 && lunar.day === 1) out.push({ name: "旧正月", text: EVENT_TEXT.旧正月 });
    if (lunar.num === 8 && lunar.day === 15) out.push({ name: "十五夜", text: EVENT_TEXT.十五夜 });
    if (lunar.num === 9 && lunar.day === 13) out.push({ name: "十三夜", text: EVENT_TEXT.十三夜 });
    if (lunar.num === 10 && lunar.day === 10) out.push({ name: "十日夜", text: EVENT_TEXT.十日夜 });
  }

  if (m === 2) {
    const feb1 = jdn(y, 2, 1);
    if (dayIdx === nthBranchDay(feb1, 6, 1)) out.push({ name: "初午", text: EVENT_TEXT.初午 });
    if (dayIdx === nthBranchDay(feb1, 6, 2)) out.push({ name: "二の午", text: EVENT_TEXT.二の午 });
  }

  // 二百二十日(立春から220日目)
  for (const yy of [y - 1, y]) {
    if (dayIdx === termDay(yy, 2, 315) + 219) {
      out.push({ name: "二百二十日", text: EVENT_TEXT.二百二十日 });
    }
  }
  return out;
}
