/*
 * 静的な表を書き出す。年が変わったら流し直す。
 *   node scripts/build.js          … 今年と来年
 *   node scripts/build.js 2027     … 2027年と2028年
 *
 * - index.html の <!-- BUILD:kyubon --> 〜 <!-- /BUILD:kyubon --> に旧盆の表(5年分)
 * - scripts/hayami.template.html から hayami/index.html を生成
 *
 * 表の中身は本体の js/houyou.js(nenkiTableHtml / kyubonTableHtml)がそのまま作る。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = vm.createContext({ console, Math, Map, Set, Infinity });
for (const f of ["astro.js", "koyomi.js", "holiday.js", "houyou.js"]) {
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
    ["一周忌と三回忌のあいだが1年しかないのはなぜですか？",
      "一周忌は満1年、三回忌は満2年に営むためです。亡くなった日を1回目の忌日と数えるので、2年後の命日が3回目の忌日にあたります。三回忌から先は、回忌の数から1を引いた年に営みます。"],
  ];
  const faqJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
  const faqHtml = faq.map(([q, a]) =>
    `      <details class="faq-item">\n        <summary>${q}</summary>\n        <p>${a}</p>\n      </details>`).join("\n");

  const vars = {
    Y1: String(Y1), Y2: String(Y2), W1: wareki(Y1), W2: wareki(Y2),
    Y1_M2: String(Y1 - 2), Y1_M6: String(Y1 - 6),
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
