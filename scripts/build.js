/*
 * 静的な表を書き出す。年が変わったら流し直す。
 *   node scripts/build.js          … 今年と来年
 *   node scripts/build.js 2027     … 2027年と2028年
 *
 * - index.html の <!-- BUILD:kyubon --> 〜 <!-- /BUILD:kyubon --> に旧盆の表(5年分)
 * - scripts/hayami.template.html から hayami/index.html を生成
 * - scripts/kyubon.template.html から guide/kyubon-okinawa/index.html を生成(年の範囲は固定)
 * - scripts/higan.template.html から guide/higan-hayami/index.html を生成(年の範囲は固定。毎年2月に OFFICIAL_TO を1つ進める)
 *
 * 表の中身は本体の js/houyou.js(nenkiTableHtml / kyubonTableHtml)がそのまま作る。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = vm.createContext({ console, Math, Map, Set, Infinity });
for (const f of ["astro.js", "koyomi.js", "holiday.js", "houyou.js", "shinzoku.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), ctx, { filename: f });
}
const call = (fn, ...args) => vm.runInContext(`${fn}(${args.map((a) => JSON.stringify(a)).join(",")})`, ctx);

const Y1 = Number(process.argv[2]) || new Date().getFullYear();
const Y2 = Y1 + 1;
const wareki = (y) => call("warekiOfYear", y).join("・");

/* HAKONIWA LAB 全ページ共通のツール一覧とパンくず。中身は ../site-nav/site-nav.html だけで管理している */
const SITE_NAV = path.join(root, "..", "site-nav", "site_nav.py");

/* 書き出しは中身を作りきってから。空や極端に小さい結果は書かない */
function writeSafe(file, content, minBytes) {
  if (Buffer.byteLength(content, "utf8") < minBytes) throw new Error(`${file}: 出力が小さすぎます`);
  fs.writeFileSync(file, content, "utf8");
  require("child_process").execFileSync("python", [SITE_NAV, file], { stdio: "inherit" });
  console.log(`wrote ${path.relative(root, file)} (${Buffer.byteLength(content, "utf8")} bytes)`);
}

/* ---- index.html の旧盆の表 ---- */
{
  const file = path.join(root, "index.html");
  const src = fs.readFileSync(file, "utf8");
  const re = /(<!-- BUILD:kyubon -->)[\s\S]*?(<!-- \/BUILD:kyubon -->)/;
  if (!re.test(src)) throw new Error("index.html に BUILD:kyubon の目印がありません");
  const table = call("kyubonTableHtml", Y1, 5);
  writeSafe(file, src.replace(re, `$1\n${table}\n$2`), src.length);
}

/* ---- 年忌早見表 ---- */
{
  const faq = [
    [`${Y1}年に三回忌を迎えるのは何年に亡くなった方ですか？`,
      `${Y1 - 2}年(${wareki(Y1 - 2)})に亡くなった方です。三回忌は亡くなってから満2年の祥月命日に営みます。`],
    [`${Y1}年に七回忌を迎えるのは何年に亡くなった方ですか？`,
      `${Y1 - 6}年(${wareki(Y1 - 6)})に亡くなった方です。七回忌は亡くなってから満6年の祥月命日に営みます。`],
    [`${Y2}年に十三回忌を迎えるのは何年に亡くなった方ですか？`,
      `${Y2 - 12}年(${wareki(Y2 - 12)})に亡くなった方です。十三回忌は亡くなってから満12年の祥月命日に営みます。`],
    [`${Y1}年に二十七回忌を迎えるのは何年に亡くなった方ですか？`,
      `${Y1 - 26}年(${wareki(Y1 - 26)})に亡くなった方です。二十七回忌は亡くなってから満26年の祥月命日に営みます。二十三回忌と二十七回忌の代わりに、二十五回忌だけを営む宗派・地域もあります。`],
    ["一周忌と三回忌のあいだが1年しかないのはなぜですか？",
      "一周忌は満1年、三回忌は満2年に営むためです。亡くなった日を1回目の忌日と数えるので、2年後の命日が3回目の忌日にあたります。三回忌から先は、回忌の数から1を引いた年に営みます。"],
    ["宗派によって年忌法要の年は違いますか？",
      "何年後に営むか(一周忌は満1年、三回忌から先は回忌の数から1を引いた年)は、宗派の公式の案内でも同じです。違うのはどの回を営むかで、浄土宗は二十三回忌と二十七回忌、真宗大谷派は二十五回忌を基本にしています。浄土真宗本願寺派の案内には二十三・二十五・二十七回忌が並んでいます。三十七回忌から先や、五十回忌のあとの扱いも宗派やお寺で違います。"],
    ["何回忌かを西暦で計算する方法は？",
      `三回忌から先は「法要を営む年 − 亡くなった年 + 1」が回忌の数です。${Y1 - 6}年に亡くなった方なら、${Y1} − ${Y1 - 6} + 1 = 7で、${Y1}年が七回忌です。一周忌だけは例外で、亡くなった翌年に営みます。`],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  /*
   * 宗派ごとに営む回(2026-11-24 に各宗派の公式の案内で確認)。年数(何年後か)はどの資料も同じで、違うのは営む回だけ。
   *   浄土宗   … 公式サイト「よくあるご質問」: 一周忌・三・七・十三・十七・二十三・二十七・三十三、五十回忌のあとは五十年ごと
   *   本願寺派 … 西本願寺の年忌法要ポスター(令和3年): 一周忌〜百回忌に二十三・二十五・二十七が並ぶ。百回忌以降は五十年ごと
   *   大谷派   … 東本願寺「葬儀・法事・お墓のこと」の表: 〈二十三〉二十五〈二十七〉〈三十七〉〈百〉は地域により。五十回忌以降は五十年ごと
   *   曹洞宗   … 宗務庁のサイトは計算フォームだけなので、曹洞宗の寺(大満寺)の年回早見表を例に。五十回忌までの表
   * ○=載っている / △=地域によって営む / —=載っていない
   */
  const SHUHA = [
    ["一周忌", 1, "○", "○", "○", "○"],
    ["三回忌", 2, "○", "○", "○", "○"],
    ["七回忌", 6, "○", "○", "○", "○"],
    ["十三回忌", 12, "○", "○", "○", "○"],
    ["十七回忌", 16, "○", "○", "○", "○"],
    ["二十三回忌", 22, "○", "○", "△", "○"],
    ["二十五回忌", 24, "—", "○", "○", "—"],
    ["二十七回忌", 26, "○", "○", "△", "○"],
    ["三十三回忌", 32, "○", "○", "○", "○"],
    ["三十七回忌", 36, "—", "—", "△", "○"],
    ["四十三回忌", 42, "—", "—", "—", "○"],
    ["四十七回忌", 46, "—", "—", "—", "○"],
    ["五十回忌", 49, "○", "○", "○", "○"],
    ["百回忌", 99, "○", "○", "△", "—"],   // 寺の例の表は五十回忌まで
  ];
  // 年数は本体の NENKI と同じであること(表にある回だけ)
  for (const [name, yrs] of SHUHA) {
    const def = vm.runInContext(`NENKI.find((n) => n.name === ${JSON.stringify(name)})`, ctx);
    if (def && def.years !== yrs) throw new Error(`宗派の表の年数が本体と違う: ${name}`);
  }
  const shuhaCell = (v) => `<td class="${v === "○" ? "is-yes" : v === "△" ? "is-maybe" : "is-no"}">${v}</td>`;
  const TABLE_SHUHA = `<table class="spec spec--shuha"><thead><tr><th>回忌</th><th>${Y1}年に<br>営む没年</th><th>浄土宗</th><th>本願寺派</th><th>大谷派</th><th>曹洞宗</th></tr></thead><tbody>` +
    SHUHA.map(([name, yrs, ...v]) => `<tr><th>${name}</th><td class="num">${Y1 - yrs}年</td>${v.map(shuhaCell).join("")}</tr>`).join("") +
    "</tbody></table>";

  const vars = {
    TABLE_SHUHA,
    Y1: String(Y1), Y2: String(Y2), W1: wareki(Y1), W2: wareki(Y2),
    Y1_M1: String(Y1 - 1), Y1_M2: String(Y1 - 2), Y1_M6: String(Y1 - 6), Y1_M19: String(Y1 - 19),
    W1_M6: wareki(Y1 - 6), W1_M19: wareki(Y1 - 19),
    TABLE_Y1: call("nenkiTableHtml", Y1, "butsu"),
    TABLE_Y2: call("nenkiTableHtml", Y2, "butsu"),
    TABLE_SHINTO_Y1: call("nenkiTableHtml", Y1, "shinto"),
    TABLE_SHINTO_Y2: call("nenkiTableHtml", Y2, "shinto"),
    FAQ_JSON: faqJson, FAQ_HTML: faqHtml,
  };
  const tpl = fs.readFileSync(path.join(__dirname, "hayami.template.html"), "utf8");
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`テンプレートの ${m} に値がありません`);
    return vars[k];
  });
  fs.mkdirSync(path.join(root, "hayami"), { recursive: true });
  writeSafe(path.join(root, "hayami", "index.html"), out, tpl.length);
}

/* ---- 旧盆の早見表の記事(guide/kyubon-okinawa/) ----
 * 年の範囲は固定(今年に合わせて動かさない)。表と年の一覧は本体の kyubonInfo から作る。
 * 本文に手で書いた日付(2033年8月7日など)は test/verify.js の15番で確かめている */
{
  const FROM = 2026, TO = 2040, PAST_FROM = 2019, HB_FROM = 2027;
  const info = (y) => call("kyubonInfo", y);
  const years = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const md = (i) => `${i.m}月${i.d}日(${i.wdName}${i.holiday ? "・" + i.holiday : ""})`;
  const cell = (i) => `<td class="num${i.isRest ? " is-rest" : ""}">${md(i)}</td>`;
  const yearTh = (y) => `<th>${y}年<small>${wareki(y)}</small></th>`;
  const joinJa = (arr) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join("・") + "・" + arr[arr.length - 1];
  const range = (k) => {
    const [a, , c] = k.days;
    const end = a.m === c.m ? `${c.d}日(${c.wdName})` : `${c.m}月${c.d}日(${c.wdName})`;
    return `${k.year}年は${a.m}月${a.d}日(${a.wdName})〜${end}`;
  };

  const head = (cols) => `<table class="spec"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  const mainRows = years(FROM, TO).map((y) => {
    const k = info(y);
    return `<tr>${yearTh(y)}${k.days.map(cell).join("")}${cell(k.tanabata)}</tr>`;
  });
  const TABLE_MAIN = head(["年", "ウンケー(迎え)", "ナカヌヒー", "ウークイ(送り)", "旧暦の七夕"]) + mainRows.join("") + "</tbody></table>";

  const pastRows = years(PAST_FROM, FROM - 1).map((y) => `<tr>${yearTh(y)}${info(y).days.map(cell).join("")}</tr>`);
  const TABLE_PAST = head(["年", "ウンケー", "ナカヌヒー", "ウークイ"]) + pastRows.join("") + "</tbody></table>";

  const shiftRows = years(FROM, TO).map((y) => {
    const k = info(y);
    const s = k.shift > 0 ? `${k.shift}日遅い` : `${-k.shift}日早い`;
    const why = k.leap ? `閏${k.leap.num}月(${k.leap.start.y}年${k.leap.start.m}月${k.leap.start.d}日〜)が入った` : "—";
    return `<tr${k.leap ? ' class="is-now"' : ""}><th>${y}年</th><td class="num">${k.days[0].m}月${k.days[0].d}日</td><td class="num">${s}</td><td>${why}</td></tr>`;
  });
  const TABLE_SHIFT = head(["年", "ウンケー", "前の年より", "理由"]) + shiftRows.join("") + "</tbody></table>";

  const hbRows = years(HB_FROM, TO).map((y) => {
    const k = info(y);
    return `<tr><th>${y}年</th><td class="num">${md(k.days[0])}</td><td class="num">${k.hatsubonLast.m}月${k.hatsubonLast.d}日までに亡くなった方</td></tr>`;
  });
  const TABLE_HATSUBON = head(["年", "ウンケー", "その年の旧盆が初盆になる命日"]) + hbRows.join("") + "</tbody></table>";

  // 1900〜2100年でいちばん早い・遅いウンケー
  let early = null, late = null;
  for (let y = 1900; y <= 2100; y++) {
    const a = info(y).days[0];
    const key = a.m * 100 + a.d;
    if (!early || key < early.key) early = { key, a };
    if (!late || key > late.key) late = { key, a };
  }
  const span = years(FROM, TO).map(info);
  const sept = span.filter((k) => k.days[0].m === 9).map((k) => `${k.year}年(9月${k.days[0].d}日)`);
  const rest2 = span.filter((k) => k.days.filter((i) => i.isRest).length >= 2).map((k) => `${k.year}`);
  const rest0 = span.filter((k) => k.days.every((i) => !i.isRest)).map((k) => `${k.year}`);
  const rest3 = span.filter((k) => k.days.every((i) => i.isRest));
  if (rest3.length) throw new Error("3日とも休日の年があります。本文を直してください");
  // 本土の8月盆(8/13〜16)と重なる年
  const overlap = span.map((k) => {
    const hit = k.days.filter((i) => i.m === 8 && i.d >= 13 && i.d <= 16);
    if (!hit.length) return null;
    if (hit.length === 3) return `${k.year}年(8月${hit[0].d}日〜${hit[2].d}日)`;
    const name = ["ウンケー", "ナカヌヒー", "ウークイ"][k.days.indexOf(hit[0])];
    return hit.length === 1 ? `${k.year}年(${name}が8月${hit[0].d}日)` : `${k.year}年(8月${hit[0].d}日〜${hit[hit.length - 1].d}日)`;
  }).filter(Boolean);

  const k27 = info(2027), k28 = info(2028), k26 = info(2026);

  /* 引数の年(Y1)の旧盆。タイトルと冒頭の欄はこの年に合わせて動く(検索は「2027年 沖縄 旧盆」の形が大半) */
  const kY = info(Y1), kN = info(Y2);
  const datesShort = (k) => {
    const [a, , c] = k.days;
    return a.m === c.m ? `${a.m}月${a.d}日〜${c.d}日` : `${a.m}月${a.d}日〜${c.m}月${c.d}日`;
  };
  const BON_NAMES = ["ウンケー", "ナカヌヒー", "ウークイ"];
  const TABLE_Y1 = head(["行事", "日付"]) +
    [["旧暦の七夕(お墓の掃除)", kY.tanabata], ...kY.days.map((d, i) => [`${BON_NAMES[i]}(${["お迎え", "中日", "お送り"][i]})`, d])]
      .map(([n, d]) => `<tr><th>${n}</th>${cell(d)}</tr>`).join("") + "</tbody></table>";
  const shiftJa = (k) => k.shift > 0 ? `${k.shift}日遅く` : `${-k.shift}日早く`;
  const restY = kY.days.map((d, i) => d.isRest ? `${BON_NAMES[i]}が${d.holiday ? d.holiday : d.wdName + "曜"}` : null).filter(Boolean);
  const hondoY = kY.days.filter((d) => d.m === 8 && d.d >= 13 && d.d <= 16).length;
  const Y1_NOTE = `${Y1}年の旧盆は前の年より${shiftJa(kY)}、` +
    (restY.length ? `${restY.join("、")}にあたります。` : "3日とも平日です。") +
    (hondoY === 3 ? "本土の8月盆(8月13日〜16日)と3日とも重なります。" : hondoY ? `本土の8月盆(8月13日〜16日)と${hondoY}日重なります。` : "") +
    `次の${range(kN)}です` + (kN.leap ? `(閏${kN.leap.num}月が入るので、${shiftJa(kN)}なります)。` : "。");
  const faq = [
    ["2027年の旧盆はいつですか？",
      `${range(k27)}です。ウンケーが${md(k27.days[0])}、ナカヌヒーが${md(k27.days[1])}、ウークイが${md(k27.days[2])}です。お墓の掃除をする旧暦の七夕は${md(k27.tanabata)}です。`],
    ["2028年の旧盆はいつですか？",
      `${range(k28)}です。2028年は閏月(閏5月)が入るため、2027年より18日遅く、9月にずれ込みます。`],
    ["2026年の旧盆はいつでしたか？",
      `${range(k26)}でした。`],
    ["旧盆の日付が毎年変わるのはなぜですか？",
      "旧盆は旧暦の7月13日〜15日だからです。旧暦の1年(12か月)は約354日で新暦より11日ほど短く、旧盆は毎年11日ほど早まります。2〜3年に1度、閏月が入って1年が13か月になると、18〜19日遅くなります。"],
    ["旧盆が9月になるのはいつですか？",
      `${FROM}〜${TO}年では、ウンケーが9月になるのは${joinJa(sept)}です。旧暦の7月は処暑(8月23日ごろ)を含む月なので、ウンケーは8月上旬から9月上旬のあいだに収まります。`],
    ["旧暦の七夕(お墓の掃除)はいつですか？",
      `旧暦7月7日で、ウンケーの6日前です。2027年は${md(k27.tanabata)}、2028年は${md(k28.tanabata)}です。`],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
    FROM: String(FROM), TO: String(TO), COUNT: String(TO - FROM + 1), HB_FROM: String(HB_FROM),
    PAST_FROM: String(PAST_FROM), PAST_TO: String(FROM - 1),
    Y1: String(Y1), W1: wareki(Y1), Y1_DATES: datesShort(kY), YR1: range(kY), YR2: range(kN), Y1_NOTE,
    TABLE_MAIN, TABLE_PAST, TABLE_SHIFT, TABLE_HATSUBON, TABLE_Y1,
    EARLIEST: `${early.a.m}月${early.a.d}日(${early.a.y}年)`, LATEST: `${late.a.m}月${late.a.d}日(${late.a.y}年)`,
    SEPT_YEARS: joinJa(sept),
    REST2_YEARS: joinJa(rest2) + "年", REST0_YEARS: joinJa(rest0) + "年",
    OVERLAP_TEXT: joinJa(overlap),
    FAQ_JSON: faqJson, FAQ_HTML: faqHtml,
  };
  const tpl = fs.readFileSync(path.join(__dirname, "kyubon.template.html"), "utf8");
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`テンプレートの ${m} に値がありません`);
    return vars[k];
  });
  fs.mkdirSync(path.join(root, "guide", "kyubon-okinawa"), { recursive: true });
  writeSafe(path.join(root, "guide", "kyubon-okinawa", "index.html"), out, tpl.length);
}

/* ---- 沖縄の十六日祭とシーミーの記事(guide/okinawa-juurokunichi-shiimii/) ----
 * 表の範囲は固定、冒頭の年は build.js の引数(Y1)で動く。日付は本体の okinawaSpringInfo から作る。
 * 十六日祭の既知の日付・清明の日付・中国の暦でずれる年は test/verify.js で確かめている */
{
  const FROM = 2026, TO = 2040;
  const O = (y) => call("okinawaSpringInfo", y);
  const years = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const md = (i) => `${i.m}月${i.d}日(${i.wdName}${i.holiday ? "・" + i.holiday : ""})`;
  const mdShort = (i) => `${i.m}月${i.d}日`;
  const cell = (i) => `<td class="num${i.isRest ? " is-rest" : ""}">${md(i)}</td>`;
  const yearTh = (y) => `<th>${y}年<small>${wareki(y)}</small></th>`;
  const head = (cols) => `<table class="spec spec--wrap"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  const joinJa = (arr) => arr.join("・");
  const period = (o) => `${md(o.seimei)}〜${md(o.seimeiEnd)}`;
  const restList = (o) => joinJa(o.rest.map((i) => `${i.m}/${i.d}(${i.wdName}${i.holiday ? "・祝" : ""})`));

  const o1 = O(Y1), o2 = O(Y2);
  const J1 = md(o1.juroku), J2 = md(o2.juroku), S1 = period(o1);
  const TABLE_Y1 = head(["行事", "日付"]) +
    `<tr><th>旧正月(旧暦1月1日)</th>${cell(o1.kyushogatsu)}</tr>` +
    `<tr><th>十六日祭(旧暦1月16日)</th>${cell(o1.juroku)}</tr>` +
    `<tr><th>シーミーの期間の始まり(清明)</th>${cell(o1.seimei)}</tr>` +
    `<tr><th>シーミーの期間の終わり(穀雨の前日)</th>${cell(o1.seimeiEnd)}</tr>` +
    `<tr><th>期間中の土日祝</th><td>${restList(o1)}</td></tr>` +
    "</tbody></table>";
  const Y1_NOTE = `${Y1}年の十六日祭は${o1.juroku.isRest ? "休日" : "平日"}(${o1.juroku.wdName}曜${o1.juroku.holiday ? "・" + o1.juroku.holiday : ""})です。` +
    `次の${Y2}年は、十六日祭が${J2}、シーミーを行う清明の期間が${period(o2)}です。`;

  const headPlain = (cols) => `<table class="spec"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  const TABLE_MAIN = headPlain(["年", "十六日祭", "シーミーの期間", "旧正月"]) +
    years(FROM, TO).map((y) => {
      const o = O(y);
      return `<tr>${yearTh(y)}${cell(o.juroku)}<td class="num">${mdShort(o.seimei)}〜${mdShort(o.seimeiEnd)}</td>${cell(o.kyushogatsu)}</tr>`;
    }).join("") + "</tbody></table>";

  const TABLE_REST = head(["年", "清明の期間", "期間中の土日祝"]) +
    years(Y1, Y1 + 4).map((y) => {
      const o = O(y);
      return `<tr>${yearTh(y)}<td>${mdShort(o.seimei)}〜${mdShort(o.seimeiEnd)}</td><td>${restList(o)}</td></tr>`;
    }).join("") + "</tbody></table>";

  // 日本の旧暦と中国の農暦で旧正月がずれる年(2000〜2060年)。本文は「この2年だけ」と書いているので数が変わったら止める
  const cnYears = years(2000, 2060).filter((y) => O(y).cnEarlier);
  if (cnYears.join() !== "2027,2028") throw new Error(`中国の暦でずれる年が想定と違う: ${cnYears}`);
  const CN_YEARS = cnYears.map((y) => `${y}年`).join("と");
  const CN_DETAIL = cnYears.map((y) => {
    const o = O(y);
    return `${y}年の旧正月の新月は、日本時間の${o.kyushogatsu.m}月${o.kyushogatsu.d}日${o.newMoon.hh}時${o.newMoon.mi}分です。`;
  }).join("");

  // 十六日祭がいちばん早い年・遅い年(表の範囲)
  const js = years(FROM, TO).map((y) => O(y).juroku);
  const earliest = js.reduce((a, b) => (b.m * 100 + b.d < a.m * 100 + a.d ? b : a));
  const latest = js.reduce((a, b) => (b.m * 100 + b.d > a.m * 100 + a.d ? b : a));

  const faq = [
    [`${Y1}年の十六日祭(ジュールクニチー)はいつですか？`,
      `${J1}です。旧暦の1月16日にあたります。${Y2}年は${J2}です。`],
    [`${Y1}年のシーミー(清明祭)はいつですか？`,
      `シーミーを行う清明の期間は${S1}です。この期間のうち、親族が集まれる日を選んで行います。期間中の土日祝は${restList(o1)}です。`],
    ["十六日祭とシーミーは、どちらをするのですか？",
      "地域で分かれます。シーミー(清明祭)は沖縄本島の中南部や伊是名島・伊平屋島・慶良間諸島で行い、清明祭をしない本島北部・久米島・宮古・八重山・奄美などでは、十六日祭か旧暦の七夕が先祖をまつる行事になります。家や親族によって両方行うこともあります。"],
    ["十六日祭の日付が毎年変わるのはなぜですか？",
      `旧暦の1月16日なので、新暦では毎年日付が動きます。${FROM}〜${TO}年では、いちばん早いのが${mdShort(earliest)}(${earliest.y}年)、いちばん遅いのが${mdShort(latest)}(${latest.y}年)です。シーミーの期間は太陽の位置で決まる清明から始まるので、毎年4月4日か5日からでほとんど動きません。`],
    [`${Y1}年の旧正月はいつですか？`,
      `日本の旧暦では${md(o1.kyushogatsu)}です。` + (o1.cnEarlier
        ? `新月が日本時間の${o1.newMoon.hh}時${o1.newMoon.mi}分なので、北京時間で数える中国の春節は1日早い${mdShort(call("dayInfo", o1.kyushogatsu.idx - 1))}になります。沖縄の行事は日本の旧暦で数えます。`
        : "")],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
    FROM: String(FROM), TO: String(TO), Y1: String(Y1), Y2: String(Y2), W1: wareki(Y1),
    J1, S1, TABLE_Y1, Y1_NOTE, TABLE_MAIN, TABLE_REST, CN_YEARS, CN_DETAIL,
    FAQ_JSON: faqJson, FAQ_HTML: faqHtml,
  };
  const tpl = fs.readFileSync(path.join(__dirname, "okinawa-spring.template.html"), "utf8");
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`テンプレートの ${m} に値がありません`);
    return vars[k];
  });
  fs.mkdirSync(path.join(root, "guide", "okinawa-juurokunichi-shiimii"), { recursive: true });
  writeSafe(path.join(root, "guide", "okinawa-juurokunichi-shiimii", "index.html"), out, tpl.length);
}

/* ---- お彼岸の早見表の記事(guide/higan-hayami/) ----
 * 年の範囲は固定。OFFICIAL_TO は「官報で正式に決まった最後の年」。
 * 毎年2月の官報で翌年分が決まるので、そのたびに1つ進めて流し直す(本文の「予想」の印が動く) */
{
  const FROM = 2026, TO = 2040, OFFICIAL_TO = 2027;
  const years = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i);
  const H = (y, s) => call("higanPeriod", y, s);
  const run = (idx) => call("restRun", idx);
  const md = (i) => `${i.m}月${i.d}日(${i.wdName}${i.holiday ? "・" + i.holiday : ""})`;
  const cell = (i) => `<td class="num${i.isRest ? " is-rest" : ""}">${md(i)}</td>`;
  const joinJa = (arr) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join("・") + "・" + arr[arr.length - 1];
  const yearTh = (y) => `<th>${y}年<small>${wareki(y)}${y > OFFICIAL_TO ? "・予想" : ""}</small></th>`;
  const runText = (p) => {
    const r = run(p.mid.idx);
    if (!r || r.days < 2) return "中日だけ休み";
    return `${r.days}連休(${r.start.m}/${r.start.d}〜${r.end.m}/${r.end.d})`;
  };
  const table = (season) => {
    const rows = years.map((y) => {
      const p = H(y, season);
      return `<tr>${yearTh(y)}${cell(p.start)}${cell(p.mid)}${cell(p.end)}<td>${runText(p)}</td></tr>`;
    });
    return `<table class="spec"><thead><tr><th>年</th><th>彼岸入り</th><th>中日(${season === "spring" ? "春分の日" : "秋分の日"})</th><th>彼岸明け</th><th>中日を含む休み</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  };
  const range = (p, label) => `${p.year}年の${label}は${p.start.m}月${p.start.d}日(${p.start.wdName})〜${p.end.m}月${p.end.d}日(${p.end.wdName})`;

  const silver = years.filter((y) => { const r = run(H(y, "autumn").mid.idx); return r && r.days >= 5; })
    .map((y) => { const r = run(H(y, "autumn").mid.idx); return `${y}年(${r.start.m}/${r.start.d}〜${r.end.m}/${r.end.d})`; });
  const sat = (season) => years.filter((y) => H(y, season).mid.wd === 6).map((y) => `${y}年`);
  const sept22 = years.filter((y) => H(y, "autumn").mid.d === 22).map((y) => `${y}年`);
  const mar21 = years.filter((y) => H(y, "spring").mid.d === 21).map((y) => `${y}年`);
  if (years.some((y) => H(y, "autumn").mid.d === 22 && !(y % 4 === 0))) throw new Error("うるう年以外の9月22日があります。本文を直してください");

  const s27 = H(2027, "spring"), a27 = H(2027, "autumn"), s28 = H(2028, "spring"), a28 = H(2028, "autumn");
  const faq = [
    ["2027年のお彼岸はいつですか？",
      `春のお彼岸は${s27.start.m}月${s27.start.d}日(${s27.start.wdName})〜${s27.end.m}月${s27.end.d}日(${s27.end.wdName})で、中日の春分の日は${md(s27.mid)}です。秋のお彼岸は${a27.start.m}月${a27.start.d}日(${a27.start.wdName})〜${a27.end.m}月${a27.end.d}日(${a27.end.wdName})で、中日の秋分の日は${md(a27.mid)}です。`],
    ["2028年のお彼岸はいつですか？",
      `春のお彼岸は${s28.start.m}月${s28.start.d}日(${s28.start.wdName})〜${s28.end.m}月${s28.end.d}日(${s28.end.wdName})、秋のお彼岸は${a28.start.m}月${a28.start.d}日(${a28.start.wdName})〜${a28.end.m}月${a28.end.d}日(${a28.end.wdName})です。2028年の春分の日・秋分の日は2027年2月の官報で正式に決まるため、現時点では計算による予想です(国立天文台の予想と同じ日付です)。`],
    ["彼岸入り・中日・彼岸明けとは何ですか？",
      "お彼岸は春分の日・秋分の日を中日として、その前後3日ずつを合わせた7日間です。7日間の初日を彼岸入り、真ん中の春分の日・秋分の日を中日、最終日を彼岸明けと呼びます。"],
    ["春分の日・秋分の日はいつ決まりますか？",
      "前の年の2月1日の官報に載る「暦要項」で正式に決まります。2月1日が官報の出ない日なら、その翌日以降です。それより先の年の日付は、太陽の動きを計算した予想です。"],
    ["秋のお彼岸が5連休になるのはいつですか？",
      `${FROM}〜${TO}年では${joinJa(silver)}です。敬老の日と秋分の日のあいだの1日が国民の休日になり、土曜日から5連休になります。`],
    ["お彼岸にやってはいけないことはありますか？",
      "仏教の行事として禁じられていることはありません。結婚式や引っ越し、納車などを避けるという話もありますが、決まりではなく、お墓参りや法要の時間を取りにくくなることを気にする人がいる、という程度です。気になる場合は家族や菩提寺に相談してください。"],
    ["秋分の日が9月22日になるのはいつですか？",
      `${FROM}〜${TO}年では${joinJa(sept22)}で、いずれもうるう年です。国立天文台の予想では、2044年からはうるう年の翌年にも9月22日になる年が出てきます。`],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
    FROM: String(FROM), TO: String(TO), COUNT: String(TO - FROM + 1),
    OFFICIAL_TO: String(OFFICIAL_TO), NEXT: String(OFFICIAL_TO + 1),
    Y27_SPRING: range(s27, "春のお彼岸"), Y27_AUTUMN: `秋のお彼岸は${a27.start.m}月${a27.start.d}日(${a27.start.wdName})〜${a27.end.m}月${a27.end.d}日(${a27.end.wdName})`,
    TABLE_SPRING: table("spring"), TABLE_AUTUMN: table("autumn"),
    SILVER_YEARS: joinJa(silver), SPRING_SAT: joinJa(sat("spring")), AUTUMN_SAT: joinJa(sat("autumn")),
    SEPT22_YEARS: joinJa(sept22), MAR21_YEARS: joinJa(mar21),
    FAQ_JSON: faqJson, FAQ_HTML: faqHtml,
  };
  const tpl = fs.readFileSync(path.join(__dirname, "higan.template.html"), "utf8");
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`テンプレートの ${m} に値がありません`);
    return vars[k];
  });
  fs.mkdirSync(path.join(root, "guide", "higan-hayami"), { recursive: true });
  writeSafe(path.join(root, "guide", "higan-hayami", "index.html"), out, tpl.length);
}

/* ---- 喪中の範囲 ---- */
{
  const faq = [
    ["兄弟の配偶者(義兄・義姉)が亡くなったら喪中ですか？",
      "親等でいえば2親等ですが、血族ではなく姻族です。喪中に含めるかどうかは説明が分かれていて、「2親等まで」を物差しにする説明では含まれ、明治の服忌令の表を目安にする説明では含まれません。どちらが正しいという法律はありません。同居していたか、付き合いの深さで決めている家が多いです。"],
    ["叔父・叔母が亡くなったら喪中ですか？",
      "おじ・おばは3親等の血族です。喪中の目安は2親等までとされることが多いため、一般には喪中としないことが多い範囲にあたります。ただし同居していた場合など、喪に服す家もあります。"],
    ["喪中でも初詣に行っていいですか？",
      "神社本庁は、忌の期間は神社の参拝を控え、50日を過ぎれば原則として参拝を再開して差し支えないとしています。控えるのは忌であって、忌が明けていれば喪中でも参拝はできるという整理になります。地域に慣例がある場合はその慣例が優先します。"],
    ["忌中と喪中は何が違いますか？",
      "神社本庁は、忌は故人の祭りに専念する期間、服(喪)は故人への哀悼の気持ちを表す期間としています。慣例がなければ五十日祭までが忌、一年祭(1周忌)までが服とするのが一般的です。忌中は神社参拝を控えるとされますが、喪中は年賀状を辞退する範囲の話になります。"],
    ["火葬場やお骨上げには誰まで行きますか？",
      "法律で決まった範囲はありません。喪主や遺族が声をかけた身内が同行するのが一般的で、それ以外の参列者は出棺のときに見送ります。お骨上げは喪主から、故人と縁の近い順に行うことが多いものの、地域や火葬場によってやり方が違います。迷ったら喪主か葬儀社に確かめてください。続柄の近さを確かめるなら、このページの親等の計算が目安になります。"],
    ["妊娠中にお葬式に参列してもいいですか？",
      "参列してはいけないという決まりはありません。地域によっては、お腹に鏡を入れる・赤い布を巻くといった言い伝えがありますが、由来ははっきりしていません。長時間の立ち仕事や火葬場への移動は体の負担になるので、体調を最優先に、無理なら通夜だけ・焼香だけにする、喪主に事情を伝えて控える、といった選び方でかまいません。"],
    ["配偶者の父母や祖父母は喪中の範囲ですか？",
      "配偶者の父母は1親等の姻族、配偶者の祖父母と配偶者の兄弟姉妹は2親等の姻族です。いずれも民法上の親族にあたります。「2親等まで」とする説明では含まれますが、配偶者側の祖父母は同居していなければ喪中はがきを出さないのが一般的とする印刷会社もあり、2親等の姻族は扱いが分かれます。"],
    ["別居していた祖父母が亡くなったら喪中ですか？",
      "祖父母は血族の2親等で、同居していたかどうかで親等は変わりません。「2親等まで」の目安では喪中に含まれます。ただ、喪中の範囲は法律で決まったものではなく、2親等でも別世帯なら喪中はがきを送らない場合がある、と説明する印刷サービスもあります。故人との付き合いの深さで決めてかまいません。"],
    ["夫の兄弟の妻(相嫁)や妻の姉妹の夫(相婿)は親族ですか？",
      "民法上の親族ではありません。民法725条で親族になる姻族は「配偶者の血族」と「血族の配偶者」のことで、配偶者の兄弟姉妹の、さらに配偶者はどちらにも当たらないためです。親等もありません。「義兄弟の配偶者も2親等」とする説明がありますが、民法の数え方とは違います。付き合いが深ければ、喪に服すかどうかは気持ちで決めてかまいません。"],
    ["嫁(息子の妻)の親が亡くなったら喪中ですか？",
      "子の配偶者(嫁・婿)は姻族の1親等ですが、その父母は民法上の親族ではありません。一般には喪中としない続柄です。なお「嫁の親」が妻の父母のことなら、配偶者の父母なので姻族の1親等で、喪中に含めるのが一般的です。"],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
    N_REL: String(vm.runInContext("SHINZOKU.length", ctx)),
    TABLE_SHINZOKU: call("shinzokuTableHtml"),
    FAQ_JSON: faqJson, FAQ_HTML: faqHtml,
  };
  const tpl = fs.readFileSync(path.join(__dirname, "mochu.template.html"), "utf8");
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`テンプレートの ${m} に値がありません`);
    return vars[k];
  });
  fs.mkdirSync(path.join(root, "mochu"), { recursive: true });
  writeSafe(path.join(root, "mochu", "index.html"), out, tpl.length);
}
