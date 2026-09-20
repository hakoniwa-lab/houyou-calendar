/*
 * 計算の検証。本体の js をそのまま読み込んで確かめる(ロジックはここに写さない)。
 *   node test/verify.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Map, Set, Infinity });
for (const f of ["astro.js", "koyomi.js", "holiday.js", "houyou.js", "tetsuzuki.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);

let fail = 0, pass = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`NG ${label}\n   got  ${g}\n   want ${w}`);
}
const ymd = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
const str = (info) => `${info.y}-${String(info.m).padStart(2, "0")}-${String(info.d).padStart(2, "0")}`;
const sched = (date, opts = {}) => run(`buildSchedule(${JSON.stringify({ ...ymd(date), ...opts })})`);
const find = (s, key) => s.items.find(it => it.key === key);

/* 1. 日の通し番号 ⇄ 年月日、曜日(Date と突き合わせ) 1900〜2100年の全日 */
{
  const r = run(`(() => {
    let bad = 0, n = 0;
    for (let y = 1900; y <= 2100; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= daysInMonth(y, m); d++) {
      const idx = jdn(y, m, d); const b = ymdOf(idx); n++;
      if (b.y !== y || b.m !== m || b.d !== d) bad++;
      if ((idx + 1) % 7 !== new Date(y, m - 1, d).getDay()) bad++;
    }
    return { bad, n };
  })()`);
  eq(`往復と曜日 ${r.n}日`, r.bad, 0);
}

/* 2. 忌日の数え方 */
{
  const s = sched("2026-01-10");
  eq("初七日", str(find(s, "7").info), "2026-01-16");
  eq("五七日", str(find(s, "35").info), "2026-02-13");
  eq("四十九日", str(find(s, "49").info), "2026-02-27");
  eq("百箇日", str(find(s, "100").info), "2026-04-19");
  const k = sched("2026-01-10", { kansai: true });
  eq("関西式 初七日", str(find(k, "7").info), "2026-01-15");
  eq("関西式 四十九日", str(find(k, "49").info), "2026-02-26");
  eq("関西式でも百箇日は動かさない", str(find(k, "100").info), "2026-04-19");
  // 小さなお葬式の例: 1月1日が命日なら49日目は2月18日、関西は2月17日
  eq("元日の四十九日", str(find(sched("2026-01-01"), "49").info), "2026-02-18");
  eq("元日の四十九日(関西)", str(find(sched("2026-01-01", { kansai: true }), "49").info), "2026-02-17");
}

/* 3. 年忌 */
{
  const s = sched("2025-09-19");
  eq("一周忌", str(find(s, "n1").info), "2026-09-19");
  eq("三回忌", str(find(s, "n3").info), "2027-09-19");
  eq("七回忌", str(find(s, "n7").info), "2031-09-19");
  eq("三十三回忌", str(find(s, "n33").info), "2057-09-19");
  eq("五十回忌", str(find(s, "n50").info), "2074-09-19");
  const leap = sched("2024-02-29");
  eq("2/29 → 一周忌は2/28", [str(find(leap, "n1").info), find(leap, "n1").leapAdjusted], ["2025-02-28", true]);
  eq("2/29 → 七回忌(2030)も2/28", str(find(leap, "n7").info), "2030-02-28");
  eq("2/29 → 十三回忌(2036はうるう年)", [str(find(leap, "n13").info), find(leap, "n13").leapAdjusted], ["2036-02-29", false]);
  const order = s.items.map(it => it.idx);
  eq("日付順に並んでいる", order.every((v, i) => i === 0 || order[i - 1] <= v), true);
}

/* 4. 神式 */
{
  const s = sched("2025-09-19", { style: "shinto" });
  eq("翌日祭", str(find(s, "s2").info), "2025-09-20");
  eq("十日祭", str(find(s, "s10").info), "2025-09-28");
  eq("五十日祭", str(find(s, "s50").info), "2025-11-07");
  eq("三年祭は満3年", str(find(s, "t3").info), "2028-09-19");
  eq("神式に初盆は出さない", s.hatsubon, null);
  eq("神式に関西式は効かない", sched("2025-09-19", { style: "shinto", kansai: true }).input.kansai, false);
}

/* 5. 三月越し */
{
  eq("1/15没 → 四十九日3/4 → 三月越し", !!sched("2026-01-15").mitsukigoshi, true);
  eq("1/10没 → 四十九日2/27 → 該当しない", !!sched("2026-01-10").mitsukigoshi, false);
  eq("1/13没 → 四十九日3/2 → 三月越し", !!sched("2026-01-13").mitsukigoshi, true);
  eq("1/12没 → 四十九日3/1", str(find(sched("2026-01-12"), "49").info), "2026-03-01");
  eq("12/20没 → 年をまたいでも判定", !!sched("2025-12-20").mitsukigoshi, true);
  eq("三月越しなら五七日を目立たせる", !!find(sched("2026-01-15"), "35").highlight, true);
  eq("三月越しでなければ目立たせない", !!find(sched("2026-01-10"), "35").highlight, false);
  eq("五七日は次の法要やカレンダー登録には入れない", find(sched("2026-01-15"), "35").minor, true);
}

/* 6. 旧盆(旧暦7月13日)。公開されている2019〜2030年の日程と照合 */
{
  const want = { 2019: "08-13", 2020: "08-31", 2021: "08-20", 2022: "08-10", 2023: "08-28", 2024: "08-16",
    2025: "09-04", 2026: "08-25", 2027: "08-14", 2028: "09-01", 2029: "08-22", 2030: "08-11" };
  for (const [y, md] of Object.entries(want)) {
    const idx = run(`kyubonStart(${y})`);
    eq(`旧盆 ${y}`, str(run(`ymdOf(${idx})`)), `${y}-${md}`);
  }
}

/* 7. 初盆 */
{
  const hb = (date, opts) => { const h = sched(date, opts).hatsubon; return [h.year, h.reason, str(h.start)]; };
  eq("6/20没 → 四十九日8/7 → 同じ年", hb("2026-06-20"), [2026, "same", "2026-08-13"]);
  eq("6/30没 → 四十九日8/17 → 翌年", hb("2026-06-30"), [2027, "kichu", "2027-08-13"]);
  eq("6/26没 → 四十九日8/13(盆入り当日) → 翌年", hb("2026-06-26"), [2027, "kichu", "2027-08-13"]);
  eq("6/25没 → 四十九日8/12 → 同じ年", hb("2026-06-25"), [2026, "same", "2026-08-13"]);
  eq("9/1没 → その年のお盆は過ぎている", hb("2026-09-01"), [2027, "passed", "2027-08-13"]);
  eq("8/14没(お盆の最中) → 忌中", hb("2026-08-14"), [2027, "kichu", "2027-08-13"]);
  eq("7月盆 5/20没 → 四十九日7/7 → 同じ年", hb("2026-05-20", { bon: "jul" }), [2026, "same", "2026-07-13"]);
  eq("7月盆 5/30没 → 翌年", hb("2026-05-30", { bon: "jul" }), [2027, "kichu", "2027-07-13"]);
  eq("旧盆 2026 6/20没 → 四十九日8/7 → 旧盆8/25", hb("2026-06-20", { bon: "kyu" }), [2026, "same", "2026-08-25"]);
  eq("旧盆 2026 8/20没 → 旧盆は忌中 → 2027/8/14", hb("2026-08-20", { bon: "kyu" }), [2027, "kichu", "2027-08-14"]);
  eq("旧盆 2026 8/30没 → 旧盆は過ぎている", hb("2026-08-30", { bon: "kyu" }), [2027, "passed", "2027-08-14"]);
  eq("関西式は四十九日が1日早いので、盆入り前日に明ける", hb("2026-06-26", { kansai: true }), [2026, "same", "2026-08-13"]);
}

/* 8. 前倒しの候補(直前の休日) */
{
  const s = sched("2025-09-19");
  // 三回忌 2027-09-19 は日曜 → 候補なし
  eq("当日が日曜なら候補なし", [find(s, "n3").info.wdName, find(s, "n3").candidates.length], ["日", 0]);
  // 一周忌 2026-09-19 は土曜
  eq("当日が土曜", find(s, "n1").info.wdName, "土");
  // 七回忌 2031-09-19 は金曜。直前は 9/13(土)・9/14(日)・9/15(月・敬老の日) の3連休
  eq("金曜 → 直前の3連休まるごと", find(s, "n7").candidates.map(str), ["2031-09-13", "2031-09-14", "2031-09-15"]);
  eq("敬老の日", run(`holidayOf(2031, 9, 15)`), "敬老の日");
  // 2026-09-24(木) の直前: 9/19(土)〜9/23(水・秋分の日) の5連休
  const c = run(`restDaysBefore(jdn(2026, 9, 24)).map(i => i.m + "/" + i.d)`);
  eq("シルバーウィークは5日とも", c, ["9/19", "9/20", "9/21", "9/22", "9/23"]);
  // 2026-11-05(木) の直前: 11/3(火・文化の日)だけ → その前の週末 10/31・11/1 も足す
  const c2 = run(`restDaysBefore(jdn(2026, 11, 5)).map(i => i.m + "/" + i.d)`);
  eq("平日の祝日1日なら前の週末も", c2, ["10/31", "11/1", "11/3"]);
  // 月曜なら直前の土日
  const c3 = run(`restDaysBefore(jdn(2026, 10, 5)).map(i => i.m + "/" + i.d)`);
  eq("月曜 → 直前の土日", c3, ["10/3", "10/4"]);
}

/* 9. 六曜・和暦 */
{
  eq("2026-09-19 の六曜", run(`dayInfo(jdn(2026, 9, 19)).rokuyo`), "仏滅");
  eq("和暦 2019-04-30", run(`warekiOfDate(2019, 4, 30)`), "平成31年");
  eq("和暦 2019-05-01", run(`warekiOfDate(2019, 5, 1)`), "令和元年");
  eq("和暦 2026", run(`warekiOfYear(2026)`), ["令和8年"]);
  eq("和暦 2019", run(`warekiOfYear(2019)`), ["平成31年", "令和元年"]);
  eq("和暦 1989", run(`warekiOfYear(1989)`), ["昭和64年", "平成元年"]);
  eq("和暦 1926", run(`warekiOfYear(1926)`), ["大正15年", "昭和元年"]);
}

/* 10. 早見表 */
{
  const t = run(`nenkiOfYear(2027, "butsu")`).map(r => [r.name, r.deathYear]);
  eq("2027年の早見表", t, [["一周忌", 2026], ["三回忌", 2025], ["七回忌", 2021], ["十三回忌", 2015], ["十七回忌", 2011],
    ["二十三回忌", 2005], ["二十五回忌", 2003], ["二十七回忌", 2001], ["三十三回忌", 1995], ["五十回忌", 1978]]);
  const sh = run(`nenkiOfYear(2027, "shinto")`).map(r => [r.name, r.deathYear]);
  eq("2027年の式年祭", sh.slice(0, 3), [["一年祭", 2026], ["二年祭", 2025], ["三年祭", 2024]]);
}

/* 11. 次の法要 */
{
  const s = sched("2026-06-20");
  const today = run(`jdn(2026, 8, 1)`);
  const n = vm.runInContext(`nextEvent(${JSON.stringify(s)}, ${today})`, ctx);
  eq("8/1時点の次は四十九日(8/7)", [n.kind, n.item && n.item.name], ["item", "四十九日"]);
  const n2 = vm.runInContext(`nextEvent(${JSON.stringify(s)}, ${run(`jdn(2026, 8, 10)`)})`, ctx);
  eq("8/10時点の次は初盆", n2.kind, "bon");
}

/* 12. ペット版(pet/) */
{
  const p = sched("2026-01-10", { style: "pet" });
  eq("ペット 四十九日は人と同じ数え方", str(find(p, "49").info), "2026-02-27");
  eq("ペット 百箇日", str(find(p, "100").info), "2026-04-19");
  eq("ペット 年忌は十七回忌まで", p.items.filter(it => it.group === "nenki").map(it => it.name),
    ["一周忌", "三回忌", "七回忌", "十三回忌", "十七回忌"]);
  eq("ペット 十三回忌=満12年", str(find(p, "n13").info), "2038-01-10");
  eq("ペット 関西式", str(find(sched("2026-01-10", { style: "pet", kansai: true }), "49").info), "2026-02-26");
  eq("ペットは三月越しを出さない", sched("2026-01-20", { style: "pet" }).mitsukigoshi, null);
  eq("人は三月越しを出す(同じ命日)", sched("2026-01-20").mitsukigoshi !== null, true);
  const hbp = sched("2026-06-20", { style: "pet" }).hatsubon;
  eq("ペットの初盆も人と同じ決め方", [hbp.year, hbp.reason], [2026, "same"]);

  const mm = run(`monthlyMemorials(jdn(2026, 1, 31), 12)`);
  eq("月命日 31日没 → 2月は28日(月末)", [str(mm[0].info), mm[0].endOfMonth], ["2026-02-28", true]);
  eq("月命日 3月は31日", [str(mm[1].info), mm[1].endOfMonth], ["2026-03-31", false]);
  eq("月命日 12か月目は翌年の同じ日", str(mm[11].info), "2027-01-31");
  const mm2 = run(`monthlyMemorials(jdn(2027, 1, 30), 1)`);
  eq("月命日 うるう年でない2月は28日", str(mm2[0].info), "2027-02-28");
  eq("月命日 2028年2月は29日まである", str(run(`monthlyMemorials(jdn(2028, 1, 30), 1)`)[0].info), "2028-02-29");

  const h = run(`higanPeriod(2026, "spring")`);
  eq("2026 春のお彼岸 3/17〜3/23(中日=春分の日3/20)", [str(h.start), str(h.mid), str(h.end), h.mid.holiday], ["2026-03-17", "2026-03-20", "2026-03-23", "春分の日"]);
  const a = run(`higanPeriod(2026, "autumn")`);
  eq("2026 秋のお彼岸 9/20〜9/26(中日=秋分の日9/23)", [str(a.start), str(a.mid), str(a.end)], ["2026-09-20", "2026-09-23", "2026-09-26"]);
  const up = run(`upcomingHigan(jdn(2026, 9, 26), 2)`).map(x => str(x.mid));
  eq("9/26時点の次のお彼岸は秋(当日まで)→翌春", up, ["2026-09-23", "2027-03-21"]);
  const up2 = run(`upcomingHigan(jdn(2026, 9, 27), 2)`).map(x => str(x.mid));
  eq("9/27時点は翌春→翌秋", up2, ["2027-03-21", "2027-09-23"]);
}

/* 13. 死亡後の手続きの期限(tetsuzuki.js) */
{
  const T = (date, key) => {
    const s = run(`buildTetsuzuki(${JSON.stringify(ymd(date))})`);
    return s.items.find((it) => it.key === key);
  };
  /* 民法140条(初日不算入)・143条2項(応当日の前日に満了) */
  eq("相続放棄 1/10没 → 4/10", str(T("2026-01-10", "houki").info), "2026-04-10");
  eq("相続税 1/10没 → 11/10", str(T("2026-01-10", "souzokuzei").info), "2026-11-10");
  /* 応当日がない月は末日に満了(143条2項ただし書) */
  /* 起算日12/1の3か月後応当日(3/1)の前日=2/28(土)。家裁は閉庁なので翌開庁日の3/2(月) */
  eq("相続放棄 11/30没 → 2/28(土)なので3/2", [str(T("2025-11-30", "houki").info), T("2025-11-30", "houki").shifted], ["2026-03-02", true]);
  eq("ずらす前の満了日は2/28", str(run(`ymdOf(monthDeadline(jdn(2025, 11, 30), 3))`)), "2026-02-28");
  eq("相続放棄 1/31没 → 4/30", str(T("2026-01-31", "houki").info), "2026-04-30");
  eq("相続税 8/31没 → 6/30", str(T("2025-08-31", "souzokuzei").info), "2026-06-30");
  /* 戸籍法43条は初日算入。ほかの届出は初日不算入 */
  eq("死亡届 1/10没 → 1/16", str(T("2026-01-10", "shibo").info), "2026-01-16");
  eq("世帯主変更 1/10没 → 1/24", str(T("2026-01-10", "setai").info), "2026-01-24");
  eq("厚生年金の受給停止 → 10日後", str(T("2026-01-10", "nenkin-kosei").info), "2026-01-20");
  /* 国税・家裁の期限が閉庁日なら翌開庁日(国税通則法10条2項・施行令2条2項) */
  {
    const it = T("2026-02-10", "junkakutei");
    eq("準確定申告 2/10没 → 6/10(平日なのでずらさない)", [str(it.info), it.shifted], ["2026-06-10", false]);
  }
  {
    const it = T("2026-01-10", "junkakutei");
    eq("準確定申告 1/10没 → 5/10は日曜なので5/11", [str(it.info), it.shifted], ["2026-05-11", true]);
  }
  {
    const it = T("2026-03-10", "souzokuzei");
    eq("相続税 3/10没 → 2027/1/10は日曜・1/11は成人の日 → 1/12", [str(it.info), it.shifted], ["2027-01-12", true]);
  }
  /* 相続登記(不動産登記法76条の2)と義務化前の経過措置 */
  eq("相続登記 2026没 → 3年後", str(T("2026-01-10", "touki").info), "2029-01-10");
  {
    const it = T("2020-05-20", "touki");
    eq("義務化前の相続は2027-03-31まで", [str(it.info), it.keika], ["2027-03-31", true]);
  }
  /* 年・時効もの */
  eq("遺留分 1年", str(T("2026-01-10", "iryubun").info), "2027-01-10");
  eq("葬祭費 2年", str(T("2026-01-10", "sosaihi").info), "2028-01-10");
  eq("生命保険金 3年", str(T("2026-01-10", "seiho").info), "2029-01-10");
  eq("遺族年金 5年", str(T("2026-01-10", "izoku").info), "2031-01-10");
  /* 並びと件数 */
  {
    const s = run(`buildTetsuzuki(${JSON.stringify(ymd("2026-01-10"))})`);
    eq("17件", s.items.length, 17);
    eq("期限の早い順", s.items.map((it) => it.idx).every((v, i, a) => i === 0 || a[i - 1] <= v), true);
    eq("最初は死亡届", s.items[0].key, "shibo");
    const n = vm.runInContext(`nextTetsuzuki(${JSON.stringify(s)}, ${run(`jdn(2026, 5, 1)`)})`, ctx);
    eq("5/1時点の次は準確定申告(5/11)", n.key, "junkakutei");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
