/*
 * 法要日程カレンダーの画面。計算は houyou.js。
 *
 * 入力(命日・形式・呼び名など)は端末の localStorage にだけ保存し、
 * 次に開いたときにすぐ日程を出す。外部には何も送らない。
 */

const STORAGE_KEY = "houyou-calendar:input";
const SITE_URL = "https://hakoniwalab.com/houyou-calendar/";
const MIN_YEAR = 1926;

const $ = (id) => document.getElementById(id);

const form = $("form");
const selYear = $("year"), selMonth = $("month"), selDay = $("day");
const datePreview = $("date-preview");
const chkKansai = $("kansai"), selBon = $("bon"), inpName = $("name");
const fieldKansai = $("field-kansai"), fieldBon = $("field-bon");
const formError = $("form-error");
const resultSection = $("result");
const actionStatus = $("action-status");

let current = null;   // いま表示している { v, s }

/* 初盆欄の広告(A8.net ベルビーフルール、お供え花の一覧ページへの商品リンク)。初盆が済んだら出さない */
const BON_OFFER = `<p class="bon-offer">初盆にお供えの花を贈るなら<br>
  <a class="result-card__link result-card__link--offer" href="https://px.a8.net/svt/ejp?a8mat=4BCFNH+BK69W2+3SJA+TR8TE&amp;a8ejpredirect=https%3A%2F%2Fbv-flower.com%2FSHOP%2F140938%2Flist.html" target="_blank" rel="nofollow sponsored noopener">お供え用のプリザーブドフラワー(ベルビーフルール)<span class="badge badge--pr">PR</span></a><img border="0" width="1" height="1" src="https://www13.a8.net/0.gif?a8mat=4BCFNH+BK69W2+3SJA+TR8TE" alt=""></p>`;

/* ---------- 小物 ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* 今日(端末の時計の日付)。toISOString は UTC なので使わない */
function todayIdx() {
  const t = new Date();
  return jdn(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function styleValue() {
  const r = form.querySelector('input[name="style"]:checked');
  return r ? r.value : "butsu";
}

function readForm() {
  return {
    y: Number(selYear.value), m: Number(selMonth.value), d: Number(selDay.value),
    style: styleValue(),
    kansai: chkKansai.checked,
    bon: selBon.value,
    name: inpName.value.trim().slice(0, 20),
  };
}

function writeForm(v) {
  selYear.value = String(v.y);
  selMonth.value = String(v.m);
  fillDays(v.d);
  const r = form.querySelector(`input[name="style"][value="${v.style === "shinto" ? "shinto" : "butsu"}"]`);
  if (r) r.checked = true;
  chkKansai.checked = !!v.kansai;
  selBon.value = BON_TYPES[v.bon] ? v.bon : "aug";
  inpName.value = v.name || "";
  syncFields();
  updatePreview();
}

/* ---------- 保存 ---------- */

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !isValidDate(v.y, v.m, v.d)) return null;
    return v;
  } catch (e) {
    return null;
  }
}

function save(v) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch (e) { /* 保存できなくても動く */ }
}

function isValidDate(y, m, d) {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    && y >= MIN_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/* ---------- フォーム ---------- */

function initForm() {
  const t = new Date();
  const ty = t.getFullYear();
  for (let y = ty; y >= MIN_YEAR; y--) selYear.add(new Option(`${y}年`, String(y)));
  for (let m = 1; m <= 12; m++) selMonth.add(new Option(`${m}月`, String(m)));
  selYear.value = String(ty);
  selMonth.value = String(t.getMonth() + 1);
  fillDays(t.getDate());
  updatePreview();

  selYear.addEventListener("change", () => { fillDays(Number(selDay.value)); updatePreview(); });
  selMonth.addEventListener("change", () => { fillDays(Number(selDay.value)); updatePreview(); });
  selDay.addEventListener("change", updatePreview);
  form.querySelectorAll('input[name="style"]').forEach((r) => r.addEventListener("change", syncFields));
}

function fillDays(keep) {
  const n = daysInMonth(Number(selYear.value), Number(selMonth.value));
  selDay.innerHTML = "";
  for (let d = 1; d <= n; d++) selDay.add(new Option(`${d}日`, String(d)));
  selDay.value = String(Math.min(keep || 1, n));
}

function updatePreview() {
  const y = Number(selYear.value), m = Number(selMonth.value), d = Number(selDay.value);
  const info = dayInfo(jdn(y, m, d));
  datePreview.textContent = `${fmtDate(info)}・${warekiOfDate(y, m, d)}`;
}

/* 神式では関西式の数え方と初盆を使わない */
function syncFields() {
  const shinto = styleValue() === "shinto";
  fieldKansai.hidden = shinto;
  fieldBon.hidden = shinto;
}

/* ---------- 描画 ---------- */

function candHtml(it) {
  if (it.info.isRest) {
    return `<p class="hy-row__cand">当日が${it.info.holiday ? "祝日" : it.info.wdName + "曜日"}です</p>`;
  }
  if (!it.candidates.length) return "";
  const days = it.candidates.map((c) =>
    `${fmtShort(c)}<small>${esc(c.rokuyo || "")}${c.holiday ? "・" + esc(c.holiday) : ""}</small>`).join("、");
  return `<p class="hy-row__cand"><span>前倒しするなら</span>${days}</p>`;
}

function rowHtml(it, today) {
  const past = it.idx < today;
  const isToday = it.idx === today;
  const cls = ["hy-row", it.minor && !it.highlight ? "is-minor" : "", past ? "is-past" : "", isToday ? "is-today" : ""].join(" ").trim();
  const sub = [it.yomi, it.alias].filter(Boolean).join("・");

  const tags = [];
  if (it.info.rokuyo) tags.push(`<span class="badge badge--soft">${esc(it.info.rokuyo)}</span>`);
  if (it.info.holiday) tags.push(`<span class="badge badge--holiday">${esc(it.info.holiday)}</span>`);
  if (isToday) tags.push(`<span class="badge badge--accent">今日</span>`);
  else if (past) tags.push(`<span class="badge badge--done">済</span>`);
  else tags.push(`<span class="hy-row__left">あと${(it.idx - today).toLocaleString()}日</span>`);

  const notes = [];
  if (it.leapAdjusted) notes.push("命日が2月29日のため、うるう年でないこの年は2月28日にしています。");
  if (it.note && !past) notes.push(it.note);

  return `<div class="${cls}">
    <div class="hy-row__head">
      <p class="hy-row__name">${esc(it.name)}${sub ? `<span class="hy-row__yomi">${esc(sub)}</span>` : ""}</p>
      <p class="hy-row__date">${fmtDate(it.info)}</p>
    </div>
    <div class="hy-row__tags">${tags.join("")}</div>
    ${past || isToday ? "" : candHtml(it)}
    ${notes.map((n) => `<p class="hy-row__note">${esc(n)}</p>`).join("")}
  </div>`;
}

/* 全部済んでいる一覧はたたんで出す */
function listHtml(items, today, label) {
  const rows = items.map((it) => rowHtml(it, today)).join("");
  if (items.length && items.every((it) => it.idx < today)) {
    return `<details class="hy-fold"><summary>${esc(label)}(すべて済んでいます)</summary><div class="hy-list">${rows}</div></details>`;
  }
  return `<div class="hy-list">${rows}</div>`;
}

function subject(v) {
  return v.name ? `${v.name}の` : "";
}

function renderNext(s, v, today) {
  const ev = nextEvent(s, today);
  const d = s.death;
  const tsuki = d.d >= 29 ? `毎月${d.d}日(その日がない月は月末)` : `毎月${d.d}日`;
  const styleLabel = s.input.style === "shinto"
    ? "神式"
    : `仏式・${s.input.kansai ? "前日から数える" : "命日から数える"}・${BON_TYPES[s.input.bon].short}のお盆`;
  const meta = `<p class="next-meta">
      <span>命日 ${fmtDate(d)}・${warekiOfDate(d.y, d.m, d.d)}</span>
      <span>月命日 ${tsuki}</span>
      <span>${styleLabel}</span>
    </p>`;

  const word = s.input.style === "shinto" ? "霊祭" : "法要";
  if (!ev) {
    $("next-card").innerHTML = `<p class="result-headline__label">${esc(subject(v))}${word}の予定</p>
      <p class="next-date">一覧にある法要はすべて済んでいます</p>${meta}`;
    return;
  }

  let name, dateText, left, rokuyoText, cand = "";
  if (ev.kind === "bon") {
    const b = ev.bon;
    name = "初盆(新盆)";
    dateText = `${fmtDate(b.start)}〜${fmtShort(b.end)}`;
    left = b.start.idx <= today ? "いまお盆の期間です" : `あと${(b.start.idx - today).toLocaleString()}日`;
    rokuyoText = "";
  } else {
    const it = ev.item;
    name = it.name;
    dateText = fmtDate(it.info);
    left = it.idx === today ? "今日です" : `あと${(it.idx - today).toLocaleString()}日`;
    rokuyoText = [it.info.rokuyo, it.info.holiday].filter(Boolean).join("・");
    if (it.idx > today && !it.info.isRest && it.candidates.length) {
      cand = `<p class="next-cand">当日は平日です。前倒しするなら <strong>${it.candidates.map(fmtShort).join("・")}</strong><br><a href="guide/shijukunichi-maedaoshi/">何日前まで前倒しできる？</a></p>`;
    } else if (it.idx > today && it.info.isRest) {
      cand = `<p class="next-cand">当日が${it.info.holiday ? "祝日" : it.info.wdName + "曜日"}なので、その日に営めます</p>`;
    }
  }

  $("next-card").innerHTML = `<p class="result-headline__label">${esc(subject(v))}次の${word}</p>
    <p class="result-headline__value">${esc(name)}</p>
    <p class="next-date">${dateText}</p>
    <p class="result-headline__sub">${left}${rokuyoText ? "・" + esc(rokuyoText) : ""}</p>
    ${cand}${meta}`;
}

function renderBon(s, today) {
  const card = $("card-bon");
  const hb = s.hatsubon;
  if (!hb) { card.hidden = true; return; }
  card.hidden = false;
  const k = s.kiake;
  const texts = [];
  if (hb.reason === "same") {
    texts.push(`四十九日(${fmtShort(k)})がお盆の初日より前に明けるので、亡くなった年のお盆が初盆です。`);
    if (hb.close) texts.push(`ただし四十九日からお盆まで${hb.gap}日しかないため、準備の都合で翌年を初盆にすることもあります。菩提寺に相談してみてください。`);
  } else if (hb.reason === "kichu") {
    texts.push(`亡くなった年のお盆(${fmtShort(hb.skipped.start)}〜${fmtShort(hb.skipped.end)})は四十九日より前の忌中にあたるため、翌年のお盆が初盆です。`);
  } else {
    texts.push("亡くなった年のお盆はすでに過ぎていたため、翌年のお盆が初盆です。");
  }
  if (hb.bon === "kyu") texts.push("旧盆は旧暦の7月13日〜15日(ウンケー・ナカビ・ウークイ)で、新暦では毎年日付が変わります。");
  if (hb.bon === "jul") texts.push("7月にお盆を行う地域(東京の一部など)向けの日付です。");

  const done = hb.end.idx < today;
  card.innerHTML = `<h2 class="card__title card__title--list">初盆(新盆)</h2>
    <p class="card__lead">四十九日を過ぎてから、初めて迎えるお盆です。</p>
    <p class="bon-main"><strong>${hb.year}年</strong> ${fmtShort(hb.start)}〜${fmtShort(hb.end)}
      ${done ? '<span class="badge badge--done">済</span>' : ""}</p>
    ${texts.map((t) => `<p class="bon-text">${esc(t)}</p>`).join("")}
    <p class="bon-text"><a href="guide/hatsubon-itsu/">初盆の年の決め方と、境目になる命日の一覧 →</a></p>
    ${done ? "" : BON_OFFER}`;
}

function render(v) {
  const s = buildSchedule(v);
  const today = todayIdx();
  current = { v, s };

  renderNext(s, v, today);

  const early = s.items.filter((it) => it.group === "chuin" || it.group === "reisai");
  const late = s.items.filter((it) => it.group === "nenki" || it.group === "shikinen");
  const shinto = s.input.style === "shinto";

  $("chuin-title").textContent = shinto ? "五十日祭まで(霊祭)" : "四十九日まで(忌日法要)";
  $("chuin-lead").textContent = shinto
    ? "亡くなった日を1日目として、10日ごとに営みます。"
    : (s.input.kansai
      ? "命日の前日を1日目として数えています(関西の一部の数え方)。百箇日は命日から数えます。"
      : "命日を1日目として、7日ごとに数えています。");

  const notices = [];
  if (s.mitsukigoshi && s.kiake.idx >= today) {
    const g = s.mitsukigoshi.goshichi.info;
    notices.push(`<div class="notice"><strong>四十九日が3つの月にまたがります(三月越し)</strong>
      <p>「始終苦(しじゅうく)が身に付く(三月)」という語呂合わせから避ける地域があり、その場合は五七日(三十五日・${fmtShort(g)})で忌明けとすることがあります。経典に根拠はない言い伝えとされ、気にしないお寺も多くあります。</p></div>`);
  }
  $("notice-chuin").innerHTML = notices.join("");
  $("list-chuin").innerHTML = listHtml(early, today, shinto ? "五十日祭までの霊祭" : "四十九日までの法要");

  renderBon(s, today);

  $("nenki-title").textContent = shinto ? "式年祭" : "年忌法要";
  $("nenki-lead").textContent = shinto
    ? "満◯年の祥月命日に営みます。三年祭は満3年で、仏式の三回忌(満2年)とは1年ずれます。"
    : "一周忌だけが満1年、三回忌からは「回忌の数−1」年後の祥月命日です。";
  $("list-nenki").innerHTML = listHtml(late, today, shinto ? "式年祭" : "年忌法要");

  resultSection.hidden = false;
  actionStatus.textContent = "";
}

/* ---------- カレンダー登録(.ics) ---------- */

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/* 1行75オクテットで折り返す(RFC 5545)。文字の途中では切らない */
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = " " + ch; bytes = 1 + b; }
    else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n");
}

function icsDate(idx) {
  const { y, m, d } = ymdOf(idx);
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

function upcomingEvents(s, today) {
  const evs = s.items.filter((it) => !it.minor && it.idx >= today).map((it) => ({
    key: it.key, name: it.name, start: it.idx, end: it.idx,
    alarm: it.years ? "-P30D" : "-P7D",
    desc: [
      `${fmtDate(it.info)}${it.info.rokuyo ? " " + it.info.rokuyo : ""}${it.info.holiday ? " " + it.info.holiday : ""}`,
      !it.info.isRest && it.candidates.length ? `前倒しするなら: ${it.candidates.map(fmtShort).join("・")}` : "",
    ].filter(Boolean).join("\n"),
  }));
  const hb = s.hatsubon;
  if (hb && hb.end.idx >= today) {
    evs.push({ key: "bon", name: "初盆(新盆)", start: hb.start.idx, end: hb.end.idx, alarm: "-P30D",
      desc: `${fmtDate(hb.start)}〜${fmtShort(hb.end)}` });
  }
  return evs.sort((a, b) => a.start - b.start);
}

function buildIcs(v, s) {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const deathKey = icsDate(s.death.idx);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HAKONIWA LAB//houyou-calendar//JA",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(subject(v) + "法要の日程")}`,
  ];
  for (const e of upcomingEvents(s, todayIdx())) {
    const title = subject(v) + e.name;
    lines.push(
      "BEGIN:VEVENT",
      `UID:houyou-${deathKey}-${s.input.style}-${e.key}@hakoniwalab.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.end + 1)}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(e.desc + "\n" + SITE_URL)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(title + "の準備(お寺・会場への連絡の目安)")}`,
      `TRIGGER:${e.alarm}`, "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/* ---------- 家族に送る文面 ---------- */

function buildShareText(v, s) {
  const today = todayIdx();
  const lines = [`【法要の日程】${v.name ? v.name + "(" : ""}${fmtDate(s.death)}逝去${v.name ? ")" : ""}`];
  const evs = upcomingEvents(s, today).slice(0, 8);
  if (!evs.length) lines.push("一覧にある法要はすべて済んでいます");
  for (const e of evs) {
    const info = dayInfo(e.start);
    if (e.key === "bon") {
      lines.push(`・初盆 ${fmtDate(info)}〜${fmtShort(dayInfo(e.end))}`);
      continue;
    }
    const it = s.items.find((x) => x.key === e.key);
    const cand = !info.isRest && it.candidates.length ? ` → 前倒しなら ${it.candidates.map(fmtShort).join("・")}` : "";
    lines.push(`・${e.name} ${fmtDate(info)}${cand}`);
  }
  lines.push("", `法要日程カレンダー ${SITE_URL}`);
  return lines.join("\n");
}

/* ---------- イベント ---------- */

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = readForm();
  if (!isValidDate(v.y, v.m, v.d)) {
    formError.textContent = "日付を選び直してください。";
    formError.hidden = false;
    return;
  }
  if (jdn(v.y, v.m, v.d) > todayIdx()) {
    formError.textContent = "命日が今日より先の日付になっています。";
    formError.hidden = false;
    return;
  }
  formError.hidden = true;
  save(v);
  render(v);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btn-ics").addEventListener("click", () => {
  if (!current) return;
  const n = upcomingEvents(current.s, todayIdx()).length;
  if (!n) { actionStatus.textContent = "これから先の法要がないため、登録するものがありません"; return; }
  const blob = new Blob([buildIcs(current.v, current.s)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "houyou-calendar.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  actionStatus.textContent = `${n}件の予定をカレンダー用ファイル(.ics)にしました`;
});

$("btn-share").addEventListener("click", async () => {
  if (!current) return;
  const text = buildShareText(current.v, current.s);
  // 共有APIはクリック直後にしか呼べないので、ここで分岐する
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    actionStatus.textContent = "日程をコピーしました。LINEやメールに貼り付けて送れます";
  } catch (err) {
    actionStatus.textContent = "コピーできませんでした";
  }
});

$("btn-print").addEventListener("click", () => window.print());

/* 印刷のときは、たたんだ一覧も開いておく */
window.addEventListener("beforeprint", () => {
  document.querySelectorAll(".hy-fold").forEach((d) => { d.dataset.wasOpen = d.open ? "1" : ""; d.open = true; });
});
window.addEventListener("afterprint", () => {
  document.querySelectorAll(".hy-fold").forEach((d) => { d.open = d.dataset.wasOpen === "1"; });
});

$("btn-edit").addEventListener("click", () => {
  $("form-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- 起動 ---------- */

initForm();
syncFields();
const saved = loadSaved();
if (saved) {
  writeForm(saved);
  render(saved);
}
