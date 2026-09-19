/*
 * 計算の検証。本体の js をそのまま読み込んで確かめる(ロジックはここに写さない)。
 *   node test/verify.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Map, Set, Infinity });
for (const f of ["astro.js", "koyomi.js", "holiday.js", "houyou.js"]) {
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
