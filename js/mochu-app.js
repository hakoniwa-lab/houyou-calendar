/*
 * 喪中・忌中の判定(mochu/)の画面。親等の計算は shinzoku.js、日付は houyou.js。
 *
 * 出す順番は「根拠の強い順」にする。
 *   1 親等(民法726条)          法律
 *   2 民法上の親族か(民法725条) 法律
 *   3 喪中の目安                慣行。言い切らない
 *   4 忌明けの日付              計算
 *   5 神社はどうか              神社本庁「服忌について」の記述
 *   6 今年の年賀状              計算と慣行
 *
 * 忌中・喪中の期間や範囲を定めた法律は現在ない。3以降は法律ではないと画面にも書く。
 */

const MC_MIN_YEAR = 1950;
const $m = (id) => document.getElementById(id);

const mcForm = $m("form");
const mcRel = $m("rel");
const mcStyle = $m("style");
const mcUse = $m("use-date");
const mcDateRow = $m("date-row");
const mcYear = $m("year"), mcMonth = $m("month"), mcDay = $m("day");
const mcResult = $m("result");

function mcEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function mcToday() {
  const t = new Date();
  return jdn(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/* ---------- フォーム ---------- */

function mcFillDays(keep) {
  const n = daysInMonth(Number(mcYear.value), Number(mcMonth.value));
  mcDay.innerHTML = "";
  for (let d = 1; d <= n; d++) mcDay.add(new Option(`${d}日`, String(d)));
  mcDay.value = String(Math.min(keep || 1, n));
}

function mcInitForm() {
  // 続柄はグループごとに optgroup へ
  let og = null, curGroup = null;
  for (const def of SHINZOKU) {
    const g = def.group || "";
    if (g !== curGroup) {
      og = g ? document.createElement("optgroup") : null;
      if (og) { og.label = g; mcRel.appendChild(og); }
      curGroup = g;
    }
    const o = new Option(def.name, def.key);
    (og || mcRel).appendChild(o);
  }
  mcRel.value = "s_kyodai"; // 説明が最も割れる続柄を初期値にしておく

  const t = new Date();
  for (let y = t.getFullYear(); y >= MC_MIN_YEAR; y--) mcYear.add(new Option(`${y}年`, String(y)));
  for (let mo = 1; mo <= 12; mo++) mcMonth.add(new Option(`${mo}月`, String(mo)));
  mcYear.value = String(t.getFullYear());
  mcMonth.value = String(t.getMonth() + 1);
  mcFillDays(t.getDate());

  mcYear.addEventListener("change", () => mcFillDays(Number(mcDay.value)));
  mcMonth.addEventListener("change", () => mcFillDays(Number(mcDay.value)));
  mcUse.addEventListener("change", () => {
    mcDateRow.hidden = !mcUse.checked;
  });
  mcDateRow.hidden = !mcUse.checked;
}

/* ---------- 結果 ---------- */

const MC_LEVEL_CLASS = { yes: "is-yes", split: "is-split", rare: "is-rare" };

function mcCardShinzoku(j) {
  const kin = j.isKinzoku
    ? "民法上の<strong>親族にあたります</strong>"
    : "民法上の<strong>親族にはあたりません</strong>";
  const extra = j.kind === "in"
    ? "<p class=\"note\">親等の数字が血族と同じでも、<strong>血族ではなく姻族</strong>です。ここを取り違えた説明がよく見られます。</p>"
    : "";
  const own = j.def.note ? `<p class="note">${j.def.note}</p>` : "";
  return `<div class="card">
    <h2>親等</h2>
    <p class="big">${mcEsc(j.def.name)} は <strong>${j.degreeText}</strong></p>
    <p>${kin}。</p>
    ${extra}${own}
    <p class="src">根拠: 民法725条(親族の範囲)・民法726条(親等の計算)。
    親等は世代数を数えて定め、傍系は共通の祖先までさかのぼって下る世代数で数えます。</p>
  </div>`;
}

function mcCardMochu(j) {
  const note = j.def.mochuNote ? `<p class="note">${j.def.mochuNote}</p>` : "";
  const split = j.mochuLevel === "split"
    ? `<p>この続柄は、同じ「2親等」でも<strong>血族か姻族かで扱いを変える家・変えない家</strong>があり、
       葬儀社や印刷会社の説明も分かれています。同居していたか、付き合いの深さで決めている家が多いです。</p>`
    : "";
  return `<div class="card ${MC_LEVEL_CLASS[j.mochuLevel]}">
    <h2>喪中の目安</h2>
    <p class="big">${j.mochuText}</p>
    ${note}${split}
    <p class="src"><strong>ここは法律ではありません。</strong>
    現在、忌中・喪中の期間や範囲を定めた法律はありません。上は世間で一般的とされる目安です。</p>
  </div>`;
}

function mcCardDates(j, deathIdx, style) {
  const death = dayInfo(deathIdx);
  const kiakeIdx = style === "shinto" ? deathIdx + 49 : deathIdx + 48;
  const kiakeName = style === "shinto" ? "五十日祭" : "四十九日";
  const ichinen = anniversary(death, 1);
  const ichinenName = style === "shinto" ? "一年祭" : "一周忌";
  const jinjaIdx = deathIdx + 49; // 神社本庁は「五十日」を目安にしている
  const jinjaRow = style === "shinto" ? "" :
    `<tr><th>神社参拝の目安(五十日)</th><td>${fmtDate(dayInfo(jinjaIdx))}</td></tr>`;
  return `<div class="card">
    <h2>日付</h2>
    <div class="table-scroll"><table class="spec"><tbody>
      <tr><th>命日</th><td>${fmtDate(death)}</td></tr>
      <tr><th>忌明け(${kiakeName})</th><td>${fmtDate(dayInfo(kiakeIdx))}</td></tr>
      ${jinjaRow}
      <tr><th>${ichinenName}</th><td>${fmtDate(dayInfo(ichinen.idx))}</td></tr>
    </tbody></table></div>
    <p class="src">忌日は命日を1日目として数えます(四十九日=命日+48日、五十日祭=命日+49日)。
    仏式の忌明けは四十九日ですが、<strong>神社参拝について神社本庁は「五十日」を目安</strong>としているため、
    1日ずれます。日付だけを出しています。</p>
  </div>`;
}

function mcCardJinja(style) {
  return `<div class="card">
    <h2>その間、神社はどうか</h2>
    <p>神社本庁は「服忌」について、<strong>忌の期間は神社の参拝や家庭でのおまつりも控える</strong>、
    やむを得ない場合は<strong>お祓いを受けてから参拝する</strong>のがよい、と説明しています。
    そして<strong>50日を過ぎれば原則として参拝を再開して差し支えない</strong>としています。</p>
    <p class="big">つまり、控えるのは<strong>忌</strong>であって、<strong>忌が明けていれば喪中でも参拝はできる</strong>という整理です。</p>
    <p>「喪中だから初詣はだめ」と言われることがありますが、上の説明に沿えば、
    忌が明けているかどうかで判断することになります。</p>
    <p class="note">神社本庁は「地域に慣例がある場合、その慣例に従うのが適切」とも書いています。
    土地やお社の考え方が優先します。</p>
    <p class="src">出典: 神社本庁「服忌について」
    <a href="https://www.jinjahoncho.or.jp/omairi/bukki/" target="_blank" rel="noopener">jinjahoncho.or.jp/omairi/bukki/</a>
    (2026年9月確認)。忌は五十日祭まで、服は一年祭までを一般的とする記述です。</p>
  </div>`;
}

function mcCardNenga(j, deathIdx) {
  const thisYear = new Date().getFullYear();
  const dy = ymdOf(deathIdx).y;
  let body;
  if (j.mochuLevel === "rare") {
    body = `<p class="big">一般には、喪中はがきを出す範囲には含めないことが多い続柄です。</p>
      <p>出すかどうかは、同居していたか、付き合いの深さで決めている家が多いです。</p>`;
  } else if (dy === thisYear) {
    body = `<p class="big">${thisYear}年に亡くなられているので、<strong>今年の年末に喪中はがきを出す対象</strong>になります。</p>
      <p>${thisYear + 1}年の年賀状を辞退するお知らせです。相手が年賀状の準備を始める前、
      <strong>11月から12月上旬まで</strong>に届くように出すのが一般的です。</p>`;
  } else if (dy === thisYear - 1) {
    body = `<p class="big">${dy}年に亡くなられているので、喪中はがきは<strong>前の年末に出す分</strong>にあたります。</p>
      <p>年末に亡くなって間に合わなかった場合は、松が明けてから<strong>寒中見舞い</strong>で知らせる方法があります。</p>`;
  } else {
    body = `<p class="big">${dy}年に亡くなられているので、今年の喪中はがきの対象にはあたりません。</p>`;
  }
  return `<div class="card">
    <h2>今年の年賀状</h2>
    ${body}
    <p class="src">喪中はがきを出す時期や範囲を定めた決まりはありません。慣行です。</p>
  </div>`;
}

function mcRender() {
  const j = judgeShinzoku(mcRel.value);
  if (!j) return;
  const style = mcStyle.value === "shinto" ? "shinto" : "butsu";
  const useDate = mcUse.checked;
  const y = Number(mcYear.value), mo = Number(mcMonth.value), d = Number(mcDay.value);
  const ok = useDate && Number.isInteger(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
  const deathIdx = ok ? jdn(y, mo, d) : null;

  const html = [
    mcCardShinzoku(j),
    mcCardMochu(j),
    ok ? mcCardDates(j, deathIdx, style) : "",
    mcCardJinja(style),
    ok ? mcCardNenga(j, deathIdx) : "",
  ].join("");
  mcResult.innerHTML = html;
  mcResult.hidden = false;
}

mcInitForm();
mcForm.addEventListener("submit", (e) => { e.preventDefault(); mcRender(); });
mcRel.addEventListener("change", mcRender);
mcStyle.addEventListener("change", mcRender);
mcRender();
