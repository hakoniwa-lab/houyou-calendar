/*
 * 静的な表を書き出す。年が変わったら流し直す。
 *   node scripts/build.js          … 今年と来年
 *   node scripts/build.js 2027     … 2027年と2028年
 *
 * - index.html の <!-- BUILD:kyubon --> 〜 <!-- /BUILD:kyubon --> に旧盆の表(5年分)
 * - scripts/hayami.template.html から hayami/index.html を生成
 * - scripts/kyubon.template.html から guide/kyubon-okinawa/index.html を生成(年の範囲は固定)
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

/* 書き出しは中身を作りきってから。空や極端に小さい結果は書かない */
function writeSafe(file, content, minBytes) {
  if (Buffer.byteLength(content, "utf8") < minBytes) throw new Error(`${file}: 出力が小さすぎます`);
  fs.writeFileSync(file, content, "utf8");
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
    ["何回忌かを西暦で計算する方法は？",
      `三回忌から先は「法要を営む年 − 亡くなった年 + 1」が回忌の数です。${Y1 - 6}年に亡くなった方なら、${Y1} − ${Y1 - 6} + 1 = 7で、${Y1}年が七回忌です。一周忌だけは例外で、亡くなった翌年に営みます。`],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
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
    Y27_RANGE: range(k27), Y28_RANGE: range(k28),
    TABLE_MAIN, TABLE_PAST, TABLE_SHIFT, TABLE_HATSUBON,
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

/* ---- 喪中の範囲 ---- */
{
  const faq = [
    ["兄弟の配偶者(義兄・義姉)が亡くなったら喪中ですか？",
      "親等でいえば2親等ですが、血族ではなく姻族です。喪中に含めるかどうかは説明が分かれていて、どちらが正しいという法律はありません。同居していたか、付き合いの深さで決めている家が多いです。"],
    ["叔父・叔母が亡くなったら喪中ですか？",
      "おじ・おばは3親等の血族です。喪中の目安は2親等までとされることが多いため、一般には喪中としないことが多い範囲にあたります。ただし同居していた場合など、喪に服す家もあります。"],
    ["喪中でも初詣に行っていいですか？",
      "神社本庁は、忌の期間は神社の参拝を控え、50日を過ぎれば原則として参拝を再開して差し支えないとしています。控えるのは忌であって、忌が明けていれば喪中でも参拝はできるという整理になります。地域に慣例がある場合はその慣例が優先します。"],
    ["忌中と喪中は何が違いますか？",
      "神社本庁は、忌は故人の祭りに専念する期間、服(喪)は故人への哀悼の気持ちを表す期間としています。慣例がなければ五十日祭までが忌、一年祭(1周忌)までが服とするのが一般的です。忌中は神社参拝を控えるとされますが、喪中は年賀状を辞退する範囲の話になります。"],
    ["配偶者の父母や祖父母は喪中の範囲ですか？",
      "配偶者の父母は1親等の姻族、配偶者の祖父母と配偶者の兄弟姉妹は2親等の姻族です。いずれも民法上の親族にあたります。一般に2親等までを喪中とするため、含めるのが一般的です。"],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
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
