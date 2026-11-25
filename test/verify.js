/*
 * 計算の検証。本体の js をそのまま読み込んで確かめる(ロジックはここに写さない)。
 *   node test/verify.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = vm.createContext({ console, Math, Map, Set, Infinity });
for (const f of ["astro.js", "koyomi.js", "holiday.js", "houyou.js", "tetsuzuki.js", "shinzoku.js"]) {
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

/* ---------- 親等(民法726条) ---------- */
{
  const J = (k) => run(`judgeShinzoku(${JSON.stringify(k)})`);
  const LBL = { blood: "血族", in: "姻族", spouse: "配偶者", none: "親族でない" };
  const chk = (k, kind, deg, kinzoku) => {
    const r = J(k);
    // 続柄そのものが消えていても読める形で落とす
    const got = r ? [LBL[r.kind], r.degree, r.isKinzoku] : "続柄が見つからない";
    eq(`親等 ${k}`, got, [kind, deg, kinzoku]);
  };
  /* 期待値は民法の数え方から独立に立てたもの。本体の計算結果を写さない */
  chk("spouse", "配偶者", null, true);
  chk("chichi", "血族", 1, true);   chk("sofubo", "血族", 2, true);   chk("sosofubo", "血族", 3, true);
  chk("ko", "血族", 1, true);       chk("mago", "血族", 2, true);     chk("himago", "血族", 3, true);
  chk("kyodai", "血族", 2, true);   chk("oigi", "血族", 3, true);     chk("oji", "血族", 3, true);
  chk("itoko", "血族", 4, true);    chk("ooji", "血族", 4, true);     chk("itokonoko", "血族", 5, true);
  chk("hatoko", "血族", 6, true);
  chk("yofubo", "血族", 1, true);   chk("yoshi", "血族", 1, true);
  chk("h_chichi", "姻族", 1, true); chk("h_sofubo", "姻族", 2, true); chk("h_kyodai", "姻族", 2, true);
  chk("h_oji", "姻族", 3, true);    chk("h_oigi", "姻族", 3, true);
  chk("s_ko", "姻族", 1, true);     chk("s_kyodai", "姻族", 2, true); chk("s_mago", "姻族", 2, true);
  chk("s_oji", "姻族", 3, true);    chk("s_oigi", "姻族", 3, true);
  /* 民法725条3号の姻族は「配偶者の血族」「血族の配偶者」。配偶者の兄弟の配偶者(相嫁・相婿)は
     どちらでもないので親族ではなく、親等もない(「義兄弟の配偶者も2親等」とする説明への検算) */
  chk("aiyome", "親族でない", null, false);
  /* 子の配偶者の父母は「血族の配偶者の血族」。これも姻族の形ではない */
  chk("s_ko_oya", "親族でない", null, false);
  /* 配偶者のいとこは姻族4親等。姻族は3親等内までが親族なので外れる(民法725条3号の境界) */
  chk("h_itoko", "姻族", 4, false);
  eq("姻族4親等は喪中の範囲に含めない側", J("h_itoko").mochuLevel, "rare");
  eq("相嫁・相婿は喪中の範囲に含めない側", J("aiyome").mochuLevel, "rare");
  eq("相嫁・相婿の一覧表は親等を「-」に", run("shinzokuTableHtml()").includes("<th>配偶者の兄弟・姉妹の配偶者(相嫁・相婿)</th><td>どちらでもない</td><td class=\"num\">-</td>"), true);

  /* 一覧に載せた続柄に検算漏れがないこと */
  const keys = run("SHINZOKU.map(d=>d.key)");
  const tested = ["spouse", "chichi", "sofubo", "sosofubo", "ko", "mago", "himago", "kyodai", "oigi",
    "oji", "itoko", "ooji", "itokonoko", "hatoko", "yofubo", "yoshi", "h_chichi", "h_sofubo",
    "h_kyodai", "h_oji", "h_oigi", "h_itoko", "s_ko", "s_kyodai", "s_mago", "s_oji", "s_oigi", "aiyome", "s_ko_oya"];
  eq("検算漏れなし", keys.filter((k) => !tested.includes(k)), []);

  /* 民法725条の境界: 血族は六親等内、姻族は三親等内が親族 */
  eq("血族6親等は親族", J("hatoko").isKinzoku, true);
  eq("姻族3親等は親族", J("h_oji").isKinzoku, true);
  eq("姻族4親等は親族でない", J("h_itoko").isKinzoku, false);

  /* 一覧表に全続柄が載る(見出し行があるので行数でなく名前で確かめる) */
  {
    const html = run("shinzokuTableHtml()");
    const names = run("SHINZOKU.map(d=>d.name)");
    eq("一覧表に載らない続柄", names.filter((n) => !html.includes(`<th>${n}</th>`)), []);
    eq("一覧表の本体行数", (html.match(/<tr><th>/g) || []).length - 1, keys.length); // -1 は thead
  }
}

/* 14. 早見表の逆引き(亡くなった年から) */
{
  const pick = (d, style) => run(`nenkiOfDeathYear(${d}, "${style}")`).map(r => [r.name, r.year]);
  eq("2021年没", pick(2021, "butsu"), [["一周忌", 2022], ["三回忌", 2023], ["七回忌", 2027], ["十三回忌", 2033],
    ["十七回忌", 2037], ["二十三回忌", 2043], ["二十五回忌", 2045], ["二十七回忌", 2047], ["三十三回忌", 2053], ["五十回忌", 2070]]);
  eq("2025年没の式年祭(先頭3つ)", pick(2025, "shinto").slice(0, 3), [["一年祭", 2026], ["二年祭", 2027], ["三年祭", 2028]]);
  /* 記事に書いた例: 2008年没は2027年に法要がない(計算すると二十回忌) */
  eq("2008年没は2027年に法要なし", pick(2008, "butsu").filter(([, y]) => y === 2027), []);
  eq("2019年没の和暦は令和にまたがる", run(`nenkiOfDeathYear(2019, "butsu")[0].wareki`), ["令和2年"]);

  /* 早見表(年→没年)と逆引き(没年→年)が、1950〜2030年没の全組み合わせで食い違わない */
  const bad = run(`(() => {
    let bad = 0;
    for (const style of ["butsu", "shinto"]) for (let d = 1950; d <= 2030; d++) {
      for (const r of nenkiOfDeathYear(d, style)) {
        const back = nenkiOfYear(r.year, style).find(x => x.key === r.key);
        if (!back || back.deathYear !== d) bad++;
      }
    }
    return bad;
  })()`);
  eq("早見表と逆引きの往復", bad, 0);

  /* 今年にあたる回だけ強調され、列の表記が正しい */
  const html = run(`nenkiByDeathYearHtml(2025, "butsu", 2026)`);
  eq("今年の行は一周忌だけ", (html.match(/class="is-now"/g) || []).length, 1);
  eq("今年の行の中身", /<tr class="is-now"><th>一周忌<\/th><td class="num">2026年<\/td><td>令和8年<\/td><td class="num">今年<\/td><\/tr>/.test(html), true);
  eq("翌年は1年後", html.includes("<th>三回忌</th><td class=\"num\">2027年</td><td>令和9年</td><td class=\"num\">1年後</td>"), true);
  eq("過去は年前", run(`nenkiByDeathYearHtml(2015, "butsu", 2026)`).includes("<th>三回忌</th><td class=\"num\">2017年</td><td>平成29年</td><td class=\"num\">9年前</td>"), true);
}

/* 15. 旧盆の早見表の記事(guide/kyubon-okinawa/)。本文に手で書いた事実と、外部の旧暦表との照合 */
{
  const k = (y) => run(`kyubonInfo(${y})`);
  const s = (i) => str(i);
  /* 香港天文台の旧暦換算表で旧暦7月1日にあたる日(2031〜2060年)。ウンケーはその12日後。
     2051年だけは新月が日本時間0時03分で、香港の時間では前の日になるので、日本の計算は1日遅い */
  const hko = { 2031: "08-18", 2032: "08-06", 2033: "07-26", 2034: "08-14", 2035: "08-04", 2036: "08-22", 2037: "08-11",
    2038: "08-01", 2039: "08-20", 2040: "08-08", 2041: "07-28", 2042: "08-16", 2043: "08-05", 2044: "07-25", 2045: "08-13",
    2046: "08-02", 2047: "08-21", 2048: "08-10", 2049: "07-30", 2050: "08-17", 2051: "08-06", 2052: "07-26", 2053: "08-14",
    2054: "08-04", 2055: "08-23", 2056: "08-11", 2057: "07-31", 2058: "08-19", 2059: "08-08", 2060: "07-27" };
  for (const [y, md] of Object.entries(hko)) {
    const [m, d] = md.split("-").map(Number);
    const want = run(`jdn(${y},${m},${d})`) + 12 + (y === "2051" ? 1 : 0);
    eq(`旧盆 ${y}(香港天文台)`, run(`kyubonStart(${y})`), want);
  }
  /* 本文の日付 */
  eq("2033年が最も早い8/7", s(k(2033).days[0]), "2033-08-07");
  eq("2036年が最も遅い9/3", s(k(2036).days[0]), "2036-09-03");
  eq("2033/8/7と2036/9/3は27日違い", run(`jdn(2036,9,3) - jdn(2036,8,7)`), 27);
  eq("2031年はウークイが9/1", s(k(2031).days[2]), "2031-09-01");
  eq("2027年", k(2027).days.map(s), ["2027-08-14", "2027-08-15", "2027-08-16"]);
  eq("2028年", k(2028).days.map(s), ["2028-09-01", "2028-09-02", "2028-09-03"]);
  /* 旧暦の七夕はウンケーの6日前で、旧暦7月7日 */
  for (let y = 2026; y <= 2040; y++) {
    const t = k(y).tanabata;
    eq(`${y} 旧七夕`, run(`lunarDate(${t.y},${t.m},${t.d})`), { num: 7, day: 7, leap: false });
  }
  /* 前の年より: 閏月が入った年は18〜19日遅く、それ以外は10〜12日早い */
  const leaps = {};
  for (let y = 2026; y <= 2040; y++) {
    const x = k(y);
    if (x.leap) { leaps[y] = `閏${x.leap.num}月 ${s(x.leap.start)}`; eq(`${y} 遅くなる`, x.shift >= 18 && x.shift <= 19, true); }
    else eq(`${y} 早まる`, x.shift >= -12 && x.shift <= -10, true);
  }
  eq("閏月の年", leaps, { 2028: "閏5月 2028-06-23", 2031: "閏3月 2031-04-22", 2034: "閏11月 2033-12-22",
    2036: "閏6月 2036-07-23", 2039: "閏5月 2039-06-22" });
  /* 旧暦2033年問題: 2033/7/26が7月1日、2034/3/20が2月1日(国立天文台の3案で共通の部分) */
  eq("2033/7/26は旧7月1日", run(`lunarDate(2033,7,26)`), { num: 7, day: 1, leap: false });
  eq("2034/3/20は旧2月1日", run(`lunarDate(2034,3,20)`), { num: 2, day: 1, leap: false });
  /* 初盆の境目は初盆の記事(2026〜2030年)と同じ */
  eq("初盆の境目", [2026, 2027, 2028, 2029, 2030].map((y) => s(k(y).hatsubonLast)),
    ["2026-07-07", "2027-06-26", "2028-07-14", "2029-07-04", "2030-06-23"])
}

/* 16. お彼岸の早見表の記事(guide/higan-hayami/)。国立天文台の「2020〜2050年の春分日・秋分日」の予想と照合 */
{
  const naoj = "0320 0922 0320 0923 0321 0923 0321 0923 0320 0922 0320 0923 0320 0923 0321 0923 0320 0922 0320 0923 " +
    "0320 0923 0321 0923 0320 0922 0320 0923 0320 0923 0321 0923 0320 0922 0320 0923 0320 0923 0321 0923 " +
    "0320 0922 0320 0923 0320 0923 0321 0923 0320 0922 0320 0922 0320 0923 0321 0923 0320 0922 0320 0922 0320 0923";
  const v = naoj.split(" ");
  for (let y = 2020; y <= 2050; y++) {
    const sp = run(`higanPeriod(${y}, "spring").mid`), au = run(`higanPeriod(${y}, "autumn").mid`);
    const md = (i) => String(i.m).padStart(2, "0") + String(i.d).padStart(2, "0");
    eq(`春分日 ${y}(国立天文台)`, md(sp), v[(y - 2020) * 2]);
    eq(`秋分日 ${y}(国立天文台)`, md(au), v[(y - 2020) * 2 + 1]);
  }
  /* 7日間で、中日の3日前が彼岸入り */
  const p27 = run(`higanPeriod(2027, "spring")`);
  eq("2027春", [str(p27.start), str(p27.mid), str(p27.end)], ["2027-03-18", "2027-03-21", "2027-03-24"]);
  /* 休日の連なり: 2026秋と2032秋は5連休(国民の休日)、2027春は振替休日で3連休、平日の祝日だけなら1日 */
  const r = (y, m, d) => { const x = run(`restRun(jdn(${y},${m},${d}))`); return x ? [str(x.start), x.days] : null; };
  eq("2026秋 5連休", r(2026, 9, 23), ["2026-09-19", 5]);
  eq("2032秋 5連休", r(2032, 9, 22), ["2032-09-18", 5]);
  eq("2037秋 5連休", r(2037, 9, 23), ["2037-09-19", 5]);
  eq("2027春 振替で3連休", r(2027, 3, 21), ["2027-03-20", 3]);
  eq("2029春 火曜だけ", r(2029, 3, 20), ["2029-03-20", 1]);
  eq("平日は null", r(2027, 3, 18), null);
}

/* 17. 記事に書いた曜日と六曜の数字(四十九日の前倒し・法事と友引) */
{
  const res = run(`(() => {
    let wdRule = 0, sameWd = 0, kansai = 0, hyakka = 0, n = 0;
    const same = { n1: 0, n3: 0, n7: 0 }, keep = { n1: 0, n3: 0, n7: 0 };
    let tomo = 0, any = 0, n1Near = 0;
    const ROK = ["先勝", "友引", "先負", "仏滅", "大安", "赤口"];
    for (let idx = jdn(2026, 1, 1); idx <= jdn(2026, 12, 31); idx++) {
      const { y, m, d } = ymdOf(idx);
      const s = buildSchedule({ y, m, d });
      const k = buildSchedule({ y, m, d, kansai: true });
      const w = s.death.wd;
      const it = (key) => s.items.find((x) => x.key === key);
      n++;
      if (it("49").info.wd === (w + 6) % 7) wdRule++;
      if (["7", "14", "21", "28", "35", "42", "49"].every((key) => it(key).info.wd === (w + 6) % 7)) sameWd++;
      if (k.items.find((x) => x.key === "49").info.wd === (w + 5) % 7) kansai++;
      if (it("100").info.wd === (w + 1) % 7) hyakka++;
      const r0 = s.death.rokuyo;
      if (r0 === "友引") tomo++;
      for (const key of ["n1", "n3", "n7"]) {
        if (it(key).info.rokuyo === r0) same[key]++;
        if (r0 === "友引" && it(key).info.rokuyo === "友引") keep[key]++;
      }
      if (["n1", "n3", "n7"].some((key) => it(key).info.rokuyo === "友引")) any++;
      const sh = (ROK.indexOf(it("n1").info.rokuyo) - ROK.indexOf(r0) + 6) % 6;
      if (sh === 0 || sh === 5 || sh === 4) n1Near++;
    }
    return { n, wdRule, sameWd, kansai, hyakka, same, keep, tomo, any, n1Near };
  })()`);
  eq("四十九日は命日の前日の曜日(365日)", res.wdRule, 365);
  eq("七日ごとの法要はすべて同じ曜日(365日)", res.sameWd, 365);
  eq("関西式の四十九日は命日の2日前の曜日", res.kansai, 365);
  eq("百箇日は命日の翌日の曜日", res.hyakka, 365);
  eq("命日と同じ六曜(一周忌・三回忌・七回忌)", res.same, { n1: 120, n3: 62, n7: 117 });
  eq("2026年の友引は61日", res.tomo, 61);
  eq("命日が友引で、その回忌も友引", res.keep, { n1: 21, n3: 10, n7: 20 });
  eq("どれかの回忌が友引", res.any, 152);
  eq("一周忌は同じか1〜2つ前の六曜", res.n1Near, 354);
}

/* 18. 複数の方をまとめて見る(familyEvents・overlapYears) */
{
  const fam = (list, from, to) => run(`(() => {
    const list = ${JSON.stringify(list)};
    const people = list.map(([id, date, opts]) => {
      const [y, m, d] = date.split("-").map(Number);
      return { id, schedule: buildSchedule({ y, m, d, ...(opts || {}) }) };
    });
    const [fy, fm, fd] = "${from}".split("-").map(Number);
    const [ty, tm, td] = "${to}".split("-").map(Number);
    const ev = familyEvents(people, jdn(fy, fm, fd), jdn(ty, tm, td));
    const key = (e) => e.kind === "bon" ? "bon" : e.item.key;
    const s = (idx) => { const o = ymdOf(idx); return o.y + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0"); };
    return {
      events: ev.map((e) => e.id + ":" + key(e) + ":" + s(e.idx)),
      overlaps: overlapYears(ev).map((o) => ({ year: o.year, who: o.events.map((e) => e.id + ":" + key(e)), canCombine: o.canCombine })),
    };
  })()`);

  // 母 2021/3/5 没(七回忌 2027/3/5)、祖父 2015/11/20 没(十三回忌 2027/11/20)、
  // 父 2026/8/1 没(四十九日 9/18 はお盆後 → 初盆は翌年、百箇日 11/8、一周忌 2027/8/1)
  const r = fam([["母", "2021-03-05"], ["祖父", "2015-11-20"], ["父", "2026-08-01"]], "2026-10-10", "2027-12-31");
  eq("全員の予定を日付順に", r.events, [
    "父:100:2026-11-08", "母:n7:2027-03-05", "父:n1:2027-08-01", "父:bon:2027-08-13", "祖父:n13:2027-11-20",
  ]);
  eq("同じ年の年忌(七回忌以降が2人いれば併修の候補)", r.overlaps, [
    { year: 2027, who: ["母:n7", "父:n1", "祖父:n13"], canCombine: true },
  ]);

  // 一周忌と三回忌だけの重なりは、併修の候補にしない
  const r2 = fam([["母", "2025-05-01"], ["父", "2026-08-01"]], "2026-10-10", "2027-12-31");
  eq("一周忌と三回忌の重なり", r2.overlaps, [{ year: 2027, who: ["母:n3", "父:n1"], canCombine: false }]);

  // 神式の三年祭(満3年)と仏式の七回忌。重なりは知らせるが、仏式が1人なので併修の候補ではない
  const r3 = fam([["祖母", "2024-06-01", { style: "shinto" }], ["母", "2021-03-05"]], "2026-10-10", "2027-12-31");
  eq("神式と仏式の重なり", r3.overlaps, [{ year: 2027, who: ["母:n7", "祖母:t3"], canCombine: false }]);

  // 期間の両端は含む。1人だけなら重なりにならない
  const r4 = fam([["母", "2021-03-05"]], "2027-03-05", "2027-03-05");
  eq("期間の端の日も入る", r4.events, ["母:n7:2027-03-05"]);
  eq("1人だけなら重なりはない", r4.overlaps, []);
  const r5 = fam([["母", "2021-03-05"], ["祖父", "2015-11-20"]], "2026-10-10", "2027-11-19");
  eq("期間の外の年忌は重なりに数えない", r5.overlaps, []);

  // お盆の期間中は、初日が過ぎていても初盆を出す
  const r6 = fam([["父", "2026-05-01"]], "2026-08-15", "2026-08-31");
  eq("お盆の途中から見ても初盆が出る", r6.events, ["父:bon:2026-08-13"]);
}

/* 喪中の続柄別の記事(guide/mochu-*): 表の親等・親族かの欄が判定ツールと食い違わないこと。
   記事の表は手で書いているので、data-rel の続柄ごとに本体の judgeShinzoku と突き合わせる */
{
  const dir = path.join(__dirname, "..", "guide");
  const pages = fs.readdirSync(dir).filter((d) => d.startsWith("mochu-") && !["mochu-hagaki-itsumade", "mochu-hatsumoude"].includes(d));
  eq("続柄別の記事が3本ある", pages.sort(), ["mochu-giri-kyodai", "mochu-haigusha-sofubo", "mochu-itoko-oji"]);
  for (const d of pages) {
    const html = fs.readFileSync(path.join(dir, d, "index.html"), "utf8");
    const rows = [...html.matchAll(/<tr data-rel="(\w+)">([\s\S]*?)<\/tr>/g)];
    eq(`${d} に続柄の表がある`, rows.length > 0, true);
    for (const [, key, row] of rows) {
      const j = run(`judgeShinzoku(${JSON.stringify(key)})`);
      if (!j) { eq(`${d} ${key}`, "続柄が見つからない", key); continue; }
      const kin = j.isKinzoku ? "親族にあたる" : "親族にあたらない";
      eq(`${d} ${key} の親等と親族か`, [row.includes(`<td>${j.degreeText}</td>`), row.includes(`<td>${kin}</td>`), row.includes(`?rel=${key}`)], [true, true, true]);
    }
    /* よくある質問の本文と構造化データが同じ数 */
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    eq(`${d} FAQの数`, ld.mainEntity.length, (html.match(/<details class="faq-item">/g) || []).length);
  }
}

/* 沖縄の十六日祭・シーミー(okinawaSpringInfo)。期待値は本体の外の資料から */
{
  const O = (y) => run(`okinawaSpringInfo(${y})`);
  const md = (x) => `${x.m}/${x.d}`;
  /* 十六日祭(旧暦1月16日): 沖縄の行事カレンダー(あじまぁ沖縄・やえやまなび等)の日付 */
  eq("十六日祭 2025", md(O(2025).juroku), "2/13");
  eq("十六日祭 2026", md(O(2026).juroku), "3/4");
  eq("十六日祭 2027", md(O(2027).juroku), "2/22");
  eq("十六日祭は旧正月の15日後", O(2027).juroku.idx - O(2027).kyushogatsu.idx, 15);
  /* 清明の日付(日本): Wikipedia「清明」の表(国立天文台 暦要項による)の日本の列、2024〜2040年 */
  const SEIMEI = { 2024: "4/4", 2025: "4/4", 2026: "4/5", 2027: "4/5", 2028: "4/4", 2029: "4/4", 2030: "4/5", 2031: "4/5",
    2032: "4/4", 2033: "4/4", 2034: "4/5", 2035: "4/5", 2036: "4/4", 2037: "4/4", 2038: "4/5", 2039: "4/5", 2040: "4/4" };
  eq("清明 2024〜2040", Object.keys(SEIMEI).filter((y) => md(O(Number(y)).seimei) !== SEIMEI[y]), []);
  /* 清明の期間は穀雨の前日まで。2027年は4/5〜4/19、土日は4/10・11・17・18 */
  eq("清明の期間の終わり 2027", md(O(2027).seimeiEnd), "4/19");
  eq("清明の期間の土日祝 2027", O(2027).rest.map(md), ["4/10", "4/11", "4/17", "4/18"]);
  /* 旧正月の朔が日本時間0時台(北京時間では前日)になるのは2000〜2060年で2027・2028年だけ。
     2027年は日本時間0時56分(旅行サイトの解説と同じ) */
  const cn = []; for (let y = 2000; y <= 2060; y++) if (O(y).cnEarlier) cn.push(y);
  eq("中国の暦で旧正月が1日早い年", cn, [2027, 2028]);
  eq("2027年の旧正月の朔", O(2027).newMoon, { hh: 0, mi: 56 });
  /* 旧暦2033年問題: 本体は閏11月の案(暦Wikiの案1)。2033/12/22が閏11月、2034/2/19が1月 → 十六日祭は3/6。
     閏1月の案(案3)なら1/20が1月で十六日祭は2/4になる(本文の注記) */
  eq("2033/12/22は閏11月", run("lunarDate(2033, 12, 22)"), { num: 11, day: 1, leap: true });
  eq("十六日祭 2034(閏11月の案)", md(O(2034).juroku), "3/6");
}

/* 四十九日の早見表(guide/shijukunichi-hayami/): 全行の四十九日と百箇日を、本体を通さず Date の足し算で確かめる */
{
  const html = fs.readFileSync(path.join(__dirname, "..", "guide", "shijukunichi-hayami", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<details class="month-49" id="m(\d+)-(\d+)">([\s\S]*?)<\/details>/g)];
  eq("四十九日の早見表は24か月分", blocks.length, 24);
  const bad = [];
  let rows = 0;
  for (const [, ys, ms, body] of blocks) {
    const y = Number(ys), m = Number(ms);
    const trs = [...body.matchAll(/<tr><th>(\d+)月(\d+)日\([^)]*\)(?:<small>([^<]*)<\/small>)?<\/th><td class="num[^"]*">(?:(\d+)年)?(\d+)月(\d+)日\([^)]*\)<\/td><td>[^<]*<\/td><td class="num">(\d+)\/(\d+)\(/g)];
    const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (trs.length !== nd) bad.push(`${y}-${m} 行数${trs.length}`);
    for (const t of trs) {
      rows++;
      const d = Number(t[2]);
      const base = Date.UTC(y, m - 1, d);
      const d49 = new Date(base + 48 * 86400000), d100 = new Date(base + 99 * 86400000);
      const y49 = t[4] ? Number(t[4]) : y;
      if (y49 !== d49.getUTCFullYear() || Number(t[5]) !== d49.getUTCMonth() + 1 || Number(t[6]) !== d49.getUTCDate()) bad.push(`${y}-${m}-${d} 49`);
      if (Number(t[7]) !== d100.getUTCMonth() + 1 || Number(t[8]) !== d100.getUTCDate()) bad.push(`${y}-${m}-${d} 100`);
      // 三月越し: 四十九日が命日の月から数えて3つめ以降の月(※の有無)
      const span = (d49.getUTCFullYear() * 12 + d49.getUTCMonth()) - (y * 12 + m - 1);
      if ((span >= 2) !== !!t[3]) bad.push(`${y}-${m}-${d} 三月越し`);
    }
  }
  eq("四十九日の早見表の行数", rows, 730);
  eq("四十九日・百箇日・三月越しが Date の計算と食い違う行", bad.slice(0, 5), []);
}

/* 喪中・忌中の初詣(guide/mochu-hatsumoude/): 五十日(命日+49)と参拝の目安(命日+50)を Date の足し算で確かめる */
{
  const html = fs.readFileSync(path.join(__dirname, "..", "guide", "mochu-hatsumoude", "index.html"), "utf8");
  const plus = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
  // 元日・三が日・松の内・1/15 に忌が明けている最後の命日(本文の表)
  const marks = [...html.matchAll(/<td>(\d+)年(\d+)月(\d+)日\([^)]*\)までに亡くなった方<\/td>/g)].map((m) => plus(+m[1], +m[2], +m[3], 50).join("-"));
  const NY = Number(html.match(/<title>[^<]*?(\d{4})年の元日/)[1]);
  eq("初詣の区切り(命日+50日が 1/1・1/3・1/7・1/15)", marks, [`${NY}-1-1`, `${NY}-1-3`, `${NY}-1-7`, `${NY}-1-15`]);
  const rows = [...html.matchAll(/<tr><th>(\d+)月(\d+)日\([^)]*\)<\/th><td class="num">(?:(\d+)年)?(\d+)月(\d+)日\([^)]*\)<\/td><td class="num[^"]*">(?:(\d+)年)?(\d+)月(\d+)日\([^)]*\)<\/td><\/tr>/g)];
  eq("初詣の早見表は11・12月の61行", rows.length, 61);
  const bad = rows.filter((r) => {
    const y = NY - 1;
    const f = plus(y, +r[1], +r[2], 49), o = plus(y, +r[1], +r[2], 50);
    return [r[3] ? +r[3] : y, +r[4], +r[5]].join("-") !== f.join("-") || [r[6] ? +r[6] : y, +r[7], +r[8]].join("-") !== o.join("-");
  }).map((r) => `${r[1]}/${r[2]}`);
  eq("初詣の早見表の五十日・目安が Date の計算と食い違う行", bad, []);
}

/* 一周忌はいつ？(guide/isshuki-itsu/): 祥月命日の曜日と前倒しの候補を、本体を通さず Date で確かめる */
{
  const html = fs.readFileSync(path.join(__dirname, "..", "guide", "isshuki-itsu", "index.html"), "utf8");
  const WD = "日月火水木金土";
  const blocks = [...html.matchAll(/<details class="month-49" id="m(\d+)-(\d+)">([\s\S]*?)<\/details>/g)];
  eq("一周忌の早見表は13か月分", blocks.length, 13);
  const bad = [];
  let rows = 0;
  for (const [, ys, ms, body] of blocks) {
    const y = Number(ys), m = Number(ms);
    const trs = [...body.matchAll(/<tr><th(?: class="is-rest")?>(\d+)月(\d+)日\(([日月火水木金土])(・祝)?\)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
    const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (trs.length !== nd) bad.push(`${y}-${m} 行数${trs.length}`);
    for (const t of trs) {
      rows++;
      const d = Number(t[2]);
      const base = Date.UTC(y, m - 1, d);
      const wd = new Date(base).getUTCDay();
      if (WD[wd] !== t[3]) { bad.push(`${y}-${m}-${d} 曜日`); continue; }
      const rest = wd === 0 || wd === 6 || !!t[4];
      if (rest) { if (t[6] !== "当日が休日") bad.push(`${y}-${m}-${d} 休日なのに候補`); continue; }
      const cands = [...t[6].matchAll(/(\d+)\/(\d+)\(([日月火水木金土])(・祝)?\)/g)].map((c) => {
        const cm = Number(c[1]), cy = cm > m ? y - 1 : y;            // 1月の行の候補は前の年の12月のことがある
        const cb = Date.UTC(cy, cm - 1, Number(c[2]));
        return { back: (base - cb) / 86400000, wdOk: WD[new Date(cb).getUTCDay()] === c[3], rest: c[3] === "土" || c[3] === "日" || !!c[4] };
      });
      if (!cands.length || cands.some((c) => !c.wdOk || !c.rest || c.back < 1 || c.back > 7)) { bad.push(`${y}-${m}-${d} 候補`); continue; }
      // いちばん近い候補と祥月命日のあいだに土日が無い(直前の休みを取りこぼしていない)
      const near = Math.min(...cands.map((c) => c.back));
      for (let k = 1; k < near; k++) {
        const w = new Date(base - k * 86400000).getUTCDay();
        if (w === 0 || w === 6) { bad.push(`${y}-${m}-${d} 直前の土日を飛ばした`); break; }
      }
    }
  }
  eq("一周忌の早見表の行数(2026年12月〜2027年12月)", rows, 396);
  eq("一周忌の早見表の曜日・前倒しの候補が Date の計算と食い違う行", bad.slice(0, 5), []);
  // 年末年始: 12月29日より前の、いちばん近い土日
  const nm = [...html.matchAll(/<tr><th>(\d+)年12月29日〜\d+年1月3日<\/th><td>12月(\d+)日\(土\)・12月(\d+)日\(日\)<\/td><\/tr>/g)];
  eq("年末年始の直前の土日は2行", nm.length, 2);
  const nmBad = nm.filter((t) => {
    const y = Number(t[1]);
    let k = Date.UTC(y, 11, 28);
    while (new Date(k).getUTCDay() !== 0) k -= 86400000;      // 12/28 以前で最初の日曜
    const sun = new Date(k).getUTCDate();
    return Number(t[3]) !== sun || Number(t[2]) !== sun - 1;
  }).map((t) => t[1]);
  eq("年末年始の直前の土日が Date の計算と食い違う年", nmBad, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
