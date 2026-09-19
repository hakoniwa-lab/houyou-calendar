/*
 * 日本の国民の祝日。表を持たず、祝日法の規則から毎年計算する。
 *
 *   固定日         … 元日・建国記念の日・憲法記念日 など
 *   第n月曜        … 成人の日・海の日・敬老の日・スポーツの日(ハッピーマンデー制度)
 *   天文計算       … 春分の日・秋分の日。太陽の黄経が0度/180度になる日(日本時間)
 *   振替休日       … 祝日が日曜なら、その後のいちばん近い平日を休日に(1973年4月12日から)
 *   国民の休日     … 祝日と祝日に挟まれた平日を休日に(1985年12月27日から)
 *
 * 法改正で名前や日付が何度も変わっているので、年ごとの条件で分岐している。
 * 検証: 内閣府が公開している「国民の祝日」CSV(1955年〜2027年、1,067件)と全件一致。
 *
 * 春分の日・秋分の日は、実際には前年2月1日の官報で正式に決まる。
 * この計算は国立天文台の暦要項と同じ方法なので結果は一致するが、遠い将来の分は「予定」になる。
 *
 * astro.js(jdn) と koyomi.js(termDay) に依存する。
 */

/* 1年分の祝日。Map(日番号 → 名前) */
const _holidayCache = new Map();

function _nthMonday(y, m, n) {
  const wd1 = new Date(y, m - 1, 1).getDay();           // 0=日
  const firstMonday = 1 + ((8 - wd1) % 7);
  return firstMonday + (n - 1) * 7;
}

function holidaysOfYear(y) {
  if (_holidayCache.has(y)) return _holidayCache.get(y);
  const map = new Map();
  if (y < 1949) { _holidayCache.set(y, map); return map; }

  const add = (m, d, name) => map.set(jdn(y, m, d), name);

  /* ---- 国民の祝日 ---- */
  add(1, 1, "元日");
  add(1, y >= 2000 ? _nthMonday(y, 1, 2) : 15, "成人の日");
  if (y >= 1967) add(2, 11, "建国記念の日");
  if (y >= 2020) add(2, 23, "天皇誕生日");

  const shunbun = termDay(y, 3, 0);
  map.set(shunbun, "春分の日");

  if (y <= 1988) add(4, 29, "天皇誕生日");
  else if (y <= 2006) add(4, 29, "みどりの日");
  else add(4, 29, "昭和の日");

  add(5, 3, "憲法記念日");
  if (y >= 2007) add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");

  if (y === 2020) add(7, 23, "海の日");
  else if (y === 2021) add(7, 22, "海の日");
  else if (y >= 2003) add(7, _nthMonday(y, 7, 3), "海の日");
  else if (y >= 1996) add(7, 20, "海の日");

  if (y === 2020) add(8, 10, "山の日");
  else if (y === 2021) add(8, 8, "山の日");
  else if (y >= 2016) add(8, 11, "山の日");

  if (y >= 2003) add(9, _nthMonday(y, 9, 3), "敬老の日");
  else if (y >= 1966) add(9, 15, "敬老の日");

  const shubun = termDay(y, 9, 180);
  map.set(shubun, "秋分の日");

  if (y === 2020) add(7, 24, "スポーツの日");
  else if (y === 2021) add(7, 23, "スポーツの日");
  else if (y >= 2020) add(10, _nthMonday(y, 10, 2), "スポーツの日");
  else if (y >= 2000) add(10, _nthMonday(y, 10, 2), "体育の日");
  else if (y >= 1966) add(10, 10, "体育の日");

  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");
  if (y >= 1989 && y <= 2018) add(12, 23, "天皇誕生日");

  /* 一度きりの祝日(皇室の行事) */
  if (y === 1959) add(4, 10, "皇太子明仁親王の結婚の儀");
  if (y === 1989) add(2, 24, "昭和天皇の大喪の礼");
  if (y === 1990) add(11, 12, "即位礼正殿の儀");
  if (y === 1993) add(6, 9, "皇太子徳仁親王の結婚の儀");
  if (y === 2019) {
    add(5, 1, "天皇の即位の日");
    add(10, 22, "即位礼正殿の儀の行われる日");
  }

  /* ここまでが「国民の祝日」。振替休日と国民の休日の判定はこれだけを見る */
  const shukujitsu = new Set(map.keys());

  /* ---- 振替休日 ---- */
  const firstFurikae = jdn(1973, 4, 12);
  const newRule = jdn(2007, 1, 1);
  for (const day of [...shukujitsu].sort((a, b) => a - b)) {
    if (day < firstFurikae) continue;
    const wd = (day + 1) % 7;                            // jdn % 7: 0=月 … 6=日 → +1 で 0=日
    if (wd !== 0) continue;
    if (day < newRule) {
      // 旧規定: 翌日(月曜)が祝日でなければ、その日だけ
      if (!shukujitsu.has(day + 1)) map.set(day + 1, "振替休日");
    } else {
      // 新規定: その後でいちばん近い「国民の祝日でない日」
      let t = day + 1;
      while (shukujitsu.has(t)) t++;
      map.set(t, "振替休日");
    }
  }

  /* ---- 国民の休日(祝日に挟まれた日) ---- */
  const firstKokumin = jdn(1985, 12, 27);
  for (const day of shukujitsu) {
    const mid = day + 1;
    if (mid < firstKokumin) continue;
    if (!shukujitsu.has(mid + 1)) continue;             // 翌々日も祝日か
    if (shukujitsu.has(mid)) continue;                  // 挟まれた日が祝日なら対象外
    if (map.has(mid)) continue;                          // 振替休日なら対象外
    const wd = (mid + 1) % 7;
    if (mid < newRule && wd === 0) continue;             // 旧規定は日曜を除く
    map.set(mid, "国民の休日");
  }

  /* 年をまたいで作ってしまった分(12月末の振替など)は、その年の表からは落とす */
  const start = jdn(y, 1, 1), end = jdn(y, 12, 31);
  for (const k of [...map.keys()]) if (k < start || k > end) map.delete(k);

  _holidayCache.set(y, map);
  return map;
}

function holidayOf(y, m, d) {
  return holidaysOfYear(y).get(jdn(y, m, d)) || null;
}

/* 祝日の説明。短く一言 */
const HOLIDAY_TEXT = {
  元日: "年のはじめを祝う日。",
  成人の日: "大人になったことを自覚し、みずから生き抜こうとする青年を祝う日。2000年から1月の第2月曜日。",
  建国記念の日: "建国をしのび、国を愛する心を養う日。",
  天皇誕生日: "天皇の誕生日を祝う日。",
  春分の日: "自然をたたえ、生物をいつくしむ日。太陽が春分点を通る日で、毎年の天文計算で決まります。",
  昭和の日: "激動の日々を経て復興を遂げた昭和の時代を顧み、国の将来に思いをいたす日。",
  憲法記念日: "日本国憲法の施行を記念し、国の成長を期する日。",
  みどりの日: "自然に親しむとともにその恩恵に感謝し、豊かな心をはぐくむ日。",
  こどもの日: "こどもの人格を重んじ、こどもの幸福をはかるとともに、母に感謝する日。",
  海の日: "海の恩恵に感謝するとともに、海洋国日本の繁栄を願う日。2003年から7月の第3月曜日。",
  山の日: "山に親しむ機会を得て、山の恩恵に感謝する日。2016年から。",
  敬老の日: "多年にわたり社会につくしてきた老人を敬愛し、長寿を祝う日。2003年から9月の第3月曜日。",
  秋分の日: "祖先をうやまい、なくなった人々をしのぶ日。太陽が秋分点を通る日で、毎年の天文計算で決まります。",
  スポーツの日: "スポーツを楽しみ、他者を尊重する精神を培うとともに、健康で活力ある社会の実現を願う日。2020年から。",
  体育の日: "スポーツにしたしみ、健康な心身をつちかう日。2019年まで。",
  文化の日: "自由と平和を愛し、文化をすすめる日。",
  勤労感謝の日: "勤労をたっとび、生産を祝い、国民たがいに感謝しあう日。",
  振替休日: "祝日が日曜日に重なったときの代わりの休日。",
  国民の休日: "前日と翌日がどちらも祝日のときに、間に挟まれて休日になる日。",
};
