/*
 * 続柄から親等を出す。表は持たず、民法の条文どおりに数える。
 *
 * 民法725条  親族とは ①六親等内の血族 ②配偶者 ③三親等内の姻族
 * 民法726条  親等は親族間の世代数を数えて定める。
 *            傍系は、その一人又はその配偶者から同一の祖先にさかのぼり、
 *            その祖先から他の一人に下るまでの世代数による。
 * 民法727条  養子と養親およびその血族は、養子縁組の日から血族と同一の親族関係を生ずる。
 * 民法728条  姻族関係は離婚によって終了する。死別の場合は、生存配偶者が
 *            終了させる意思を表示したときに終了する。
 *
 * 続柄は「自分から共通の祖先まで何代さかのぼり(up)、そこから何代下るか(down)」で表す。
 *   父母       up1 down0
 *   兄弟姉妹   up1 down1   (親という共通の祖先を経由)
 *   おじおば   up2 down1
 *   いとこ     up2 down2
 * これに2つの印を付ける。
 *   viaSpouse  自分の配偶者の血族 → 姻族(配偶者を自分と同じ位置に置いて数える)
 *   spouseOf   その血族の配偶者   → 姻族(その血族と同じ親等)
 *
 * 喪中・忌中の期間や範囲を定めた法律は、現在ない。
 * 喪中の範囲は慣行なので、この計算の結果とは分けて扱う。
 */

/* 親等と血族/姻族の別を返す。配偶者だけは親等を持たない(民法725条2号) */
function shinto1(rel) {
  if (rel.spouse) return { degree: null, kind: "spouse", isKinzoku: true };
  const degree = rel.up + rel.down;
  const kind = rel.viaSpouse || rel.spouseOf ? "in" : "blood";
  // 民法725条: 血族は六親等内、姻族は三親等内が「親族」
  const isKinzoku = kind === "blood" ? degree <= 6 : degree <= 3;
  return { degree, kind, isKinzoku };
}

const KIND_LABEL = { blood: "血族", in: "姻族", spouse: "配偶者" };

/* 親等の表示。配偶者は親等を持たないのでそう書く */
function degreeLabel(r) {
  if (r.kind === "spouse") return "配偶者(親等なし)";
  return KIND_LABEL[r.kind] + "の" + r.degree + "親等";
}

/*
 * 続柄の一覧。up/down は自分から見た世代数。
 * mochuNote に値があるものは、世間の説明が割れている続柄。
 */
const SHINZOKU = [
  { key: "spouse", name: "配偶者(夫・妻)", spouse: true, up: 0, down: 0 },

  { key: "chichi", name: "父・母", up: 1, down: 0, group: "自分の血族" },
  { key: "sofubo", name: "祖父・祖母", up: 2, down: 0, group: "自分の血族" },
  { key: "sosofubo", name: "曽祖父・曽祖母", up: 3, down: 0, group: "自分の血族" },
  { key: "ko", name: "子", up: 0, down: 1, group: "自分の血族" },
  { key: "mago", name: "孫", up: 0, down: 2, group: "自分の血族" },
  { key: "himago", name: "ひ孫", up: 0, down: 3, group: "自分の血族" },
  { key: "kyodai", name: "兄弟・姉妹", up: 1, down: 1, group: "自分の血族" },
  { key: "oigi", name: "甥・姪", up: 1, down: 2, group: "自分の血族" },
  { key: "oji", name: "おじ・おば(父母の兄弟姉妹)", up: 2, down: 1, group: "自分の血族" },
  { key: "itoko", name: "いとこ", up: 2, down: 2, group: "自分の血族" },
  { key: "ooji", name: "大おじ・大おば(祖父母の兄弟姉妹)", up: 3, down: 1, group: "自分の血族" },
  { key: "itokonoko", name: "いとこの子", up: 2, down: 3, group: "自分の血族" },
  { key: "hatoko", name: "はとこ(またいとこ)", up: 3, down: 3, group: "自分の血族" },

  { key: "yofubo", name: "養父・養母", up: 1, down: 0, group: "自分の血族",
    note: "民法727条により、養子縁組の日から実の血族と同じ親族関係になります。" },
  { key: "yoshi", name: "養子", up: 0, down: 1, group: "自分の血族",
    note: "民法727条により、養子縁組の日から実の血族と同じ親族関係になります。" },

  { key: "h_chichi", name: "配偶者の父・母(義父・義母)", viaSpouse: true, up: 1, down: 0,
    group: "配偶者の血族(姻族)" },
  { key: "h_sofubo", name: "配偶者の祖父・祖母", viaSpouse: true, up: 2, down: 0,
    group: "配偶者の血族(姻族)" },
  { key: "h_kyodai", name: "配偶者の兄弟・姉妹", viaSpouse: true, up: 1, down: 1,
    group: "配偶者の血族(姻族)",
    mochuNote: "喪中に含めるかどうか、説明が分かれる続柄です。" },
  { key: "h_oji", name: "配偶者のおじ・おば", viaSpouse: true, up: 2, down: 1,
    group: "配偶者の血族(姻族)" },
  { key: "h_oigi", name: "配偶者の甥・姪", viaSpouse: true, up: 1, down: 2,
    group: "配偶者の血族(姻族)" },

  { key: "s_ko", name: "子の配偶者(嫁・婿)", spouseOf: true, up: 0, down: 1,
    group: "血族の配偶者(姻族)" },
  { key: "s_kyodai", name: "兄弟・姉妹の配偶者(義兄・義姉・義弟・義妹)", spouseOf: true, up: 1, down: 1,
    group: "血族の配偶者(姻族)",
    mochuNote: "喪中に含めるかどうか、説明が最も割れる続柄です。親等は2ですが血族ではなく姻族です。" },
  { key: "s_mago", name: "孫の配偶者", spouseOf: true, up: 0, down: 2,
    group: "血族の配偶者(姻族)" },
  { key: "s_oji", name: "おじ・おばの配偶者", spouseOf: true, up: 2, down: 1,
    group: "血族の配偶者(姻族)" },
  { key: "s_oigi", name: "甥・姪の配偶者", spouseOf: true, up: 1, down: 2,
    group: "血族の配偶者(姻族)" },
];

/*
 * 喪中とされるかの目安。法律ではなく慣行なので、言い切らない。
 * 返り値の level は "yes"(一般に喪中) / "split"(説明が分かれる) / "rare"(一般には喪中としない)
 */
function mochuLevel(def, r) {
  if (r.kind === "spouse") return "yes";
  if (def.mochuNote) return "split";
  if (r.degree <= 1) return "yes";
  if (r.degree === 2) return r.kind === "blood" ? "yes" : "split";
  return "rare";
}

const MOCHU_TEXT = {
  yes: "一般に喪中とされます",
  split: "説明が分かれます",
  rare: "一般には喪中としないことが多い範囲です",
};

/* 1件ぶんの判定結果をまとめる */
function judgeShinzoku(key) {
  const def = SHINZOKU.find((d) => d.key === key);
  if (!def) return null;
  const r = shinto1(def);
  const level = mochuLevel(def, r);
  return {
    def, ...r,
    degreeText: degreeLabel(r),
    mochuLevel: level,
    mochuText: MOCHU_TEXT[level],
  };
}

/* 全続柄の一覧表。静的ページもこの関数から作るので、画面と表が食い違わない */
function shinzokuTableHtml() {
  let cur = null;
  const rows = SHINZOKU.map((def) => {
    const j = judgeShinzoku(def.key);
    const g = def.group || "";
    const head = g && g !== cur ? `<tr class="is-group"><th colspan="5">${g}</th></tr>` : "";
    cur = g || cur;
    const note = def.mochuNote || def.note || "";
    return head +
      `<tr><th>${def.name}</th>` +
      `<td>${KIND_LABEL[j.kind]}</td>` +
      `<td class="num">${j.kind === "spouse" ? "-" : j.degree + "親等"}</td>` +
      `<td>${j.isKinzoku ? "親族にあたる" : "親族にあたらない"}</td>` +
      `<td>${j.mochuText}${note ? "<br><small>" + note + "</small>" : ""}</td></tr>`;
  }).join("");
  return `<table class="spec"><thead><tr><th>続柄</th><th>血族・姻族</th><th>親等</th>` +
    `<th>民法上の親族か</th><th>喪中の目安(慣行)</th></tr></thead><tbody>${rows}</tbody></table>`;
}
