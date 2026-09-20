/*
 * 死亡後の手続き期限カレンダー(tetsuzuki/)の画面。計算は tetsuzuki.js。
 * 入力は端末の localStorage にだけ保存する(法要日程カレンダーとは別のキー)。
 */

const TZ_STORAGE_KEY = "houyou-calendar:tetsuzuki";
const TZ_SITE_URL = "https://hakoniwalab.com/houyou-calendar/tetsuzuki/";
const TZ_MIN_YEAR = 1990;

const $t = (id) => document.getElementById(id);

const tzForm = $t("form");
const tzYear = $t("year"), tzMonth = $t("month"), tzDay = $t("day");
const tzPreview = $t("date-preview");
const tzName = $t("name");
const tzError = $t("form-error");
const tzResult = $t("result");
const tzStatus = $t("action-status");

let tzCurrent = null;

function tzEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function tzToday() {
  const t = new Date();
  return jdn(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function tzValidDate(y, m, d) {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    && y >= TZ_MIN_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/* ---------- フォーム ---------- */

function tzFillDays(keep) {
  const n = daysInMonth(Number(tzYear.value), Number(tzMonth.value));
  tzDay.innerHTML = "";
  for (let d = 1; d <= n; d++) tzDay.add(new Option(`${d}日`, String(d)));
  tzDay.value = String(Math.min(keep || 1, n));
}

function tzUpdatePreview() {
  const y = Number(tzYear.value), m = Number(tzMonth.value), d = Number(tzDay.value);
  tzPreview.textContent = `${fmtDate(dayInfo(jdn(y, m, d)))}・${warekiOfDate(y, m, d)}`;
}

function tzInitForm() {
  const t = new Date();
  for (let y = t.getFullYear(); y >= TZ_MIN_YEAR; y--) tzYear.add(new Option(`${y}年`, String(y)));
  for (let m = 1; m <= 12; m++) tzMonth.add(new Option(`${m}月`, String(m)));
  tzYear.value = String(t.getFullYear());
  tzMonth.value = String(t.getMonth() + 1);
  tzFillDays(t.getDate());
  tzUpdatePreview();
  tzYear.addEventListener("change", () => { tzFillDays(Number(tzDay.value)); tzUpdatePreview(); });
  tzMonth.addEventListener("change", () => { tzFillDays(Number(tzDay.value)); tzUpdatePreview(); });
  tzDay.addEventListener("change", tzUpdatePreview);
}

function tzLoadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(TZ_STORAGE_KEY) || "null");
    return v && tzValidDate(v.y, v.m, v.d) ? v : null;
  } catch (e) {
    return null;
  }
}

function tzSave(v) {
  try { localStorage.setItem(TZ_STORAGE_KEY, JSON.stringify(v)); } catch (e) { /* 保存できなくても動く */ }
}

/* ---------- 描画 ---------- */

function tzRowHtml(it, today) {
  const past = it.idx < today;
  const isToday = it.idx === today;
  const left = isToday ? '<span class="badge badge--accent">今日まで</span>'
    : past ? '<span class="badge badge--done">期限を過ぎています</span>'
    : `<span class="hy-row__left">あと${(it.idx - today).toLocaleString()}日</span>`;
  const tags = [];
  if (it.info.holiday) tags.push(`<span class="badge badge--holiday">${tzEsc(it.info.holiday)}</span>`);
  const notes = [];
  if (it.shifted) notes.push("本来の期限が閉庁日にあたるため、翌開庁日にしています。");
  if (it.keika) notes.push("義務化(2024年4月1日)より前の相続なので、期限は2027年3月31日です。");
  if (it.note) notes.push(it.note);

  return `<div class="hy-row${past ? " is-past" : ""}">
    <div class="hy-row__head">
      <p class="hy-row__name">${tzEsc(it.name)}<span class="hy-row__yomi">${tzEsc(it.where)}</span></p>
      <p class="hy-row__date">${fmtDate(it.info)}</p>
    </div>
    <div class="hy-row__tags">${tags.join("")}${left}<span class="tz-law">${tzEsc(it.law)}</span></div>
    ${notes.map((n) => `<p class="hy-row__note">${tzEsc(n)}</p>`).join("")}
  </div>`;
}

function tzSubject(v) {
  return v.name ? `${v.name}の` : "";
}

function tzRender(v) {
  const s = buildTetsuzuki(v);
  const today = tzToday();
  tzCurrent = { v, s };

  const next = nextTetsuzuki(s, today);
  const meta = `<p class="next-meta">
      <span>命日 ${fmtDate(s.death)}・${warekiOfDate(s.death.y, s.death.m, s.death.d)}</span>
      <span>期限は「相続の開始を知った日」から数えています</span>
    </p>`;
  $t("next-card").innerHTML = next
    ? `<p class="result-headline__label">${tzEsc(tzSubject(v))}次の期限</p>
       <p class="result-headline__value">${tzEsc(next.name)}</p>
       <p class="next-date">${fmtDate(next.info)}</p>
       <p class="result-headline__sub">${next.idx === today ? "今日までです" : `あと${(next.idx - today).toLocaleString()}日`}・${tzEsc(next.where)}</p>
       ${meta}`
    : `<p class="result-headline__label">${tzEsc(tzSubject(v))}手続きの期限</p>
       <p class="next-date">一覧にある期限はすべて過ぎています</p>${meta}`;

  for (const [key, g] of Object.entries(TETSUZUKI_GROUPS)) {
    const items = s.items.filter((it) => it.group === key);
    const rows = items.map((it) => tzRowHtml(it, today)).join("");
    const allPast = items.every((it) => it.idx < today);
    $t(`card-${key}`).innerHTML = `<h2 class="card__title card__title--list">${tzEsc(g.title)}</h2>
      <p class="card__lead">${tzEsc(g.lead)}</p>
      ${allPast
        ? `<details class="hy-fold"><summary>${tzEsc(g.title)}(すべて期限を過ぎています)</summary><div class="hy-list">${rows}</div></details>`
        : `<div class="hy-list">${rows}</div>`}`;
  }

  tzResult.hidden = false;
  tzStatus.textContent = "";
}

/* ---------- カレンダー登録・共有 ---------- */

function tzUpcoming(s, today) {
  return s.items.filter((it) => it.idx >= today);
}

function tzBuildIcs(v, s) {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const deathKey = icsDate(s.death.idx);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HAKONIWA LAB//tetsuzuki-calendar//JA",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(tzSubject(v) + "手続きの期限")}`,
  ];
  for (const it of tzUpcoming(s, tzToday())) {
    const title = `${tzSubject(v)}${it.name}の期限`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:tetsuzuki-${deathKey}-${it.key}@hakoniwalab.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(it.idx)}`,
      `DTEND;VALUE=DATE:${icsDate(it.idx + 1)}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape([it.where, it.law, TZ_SITE_URL].join("\n"))}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(title + "(" + it.where + ")")}`,
      `TRIGGER:${it.kind === "day" ? "-P1D" : "-P14D"}`, "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function tzShareText(v, s) {
  const today = tzToday();
  const lines = [`【死亡後の手続きの期限】${v.name ? v.name + "(" : ""}命日 ${fmtDate(s.death)}${v.name ? ")" : ""}`];
  const up = tzUpcoming(s, today).slice(0, 10);
  if (!up.length) lines.push("一覧にある期限はすべて過ぎています");
  for (const it of up) lines.push(`・${it.name} ${fmtDate(it.info)}(${it.where})`);
  lines.push("", `死亡後の手続き期限カレンダー ${TZ_SITE_URL}`);
  return lines.join("\n");
}

/* ---------- イベント ---------- */

tzForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = {
    y: Number(tzYear.value), m: Number(tzMonth.value), d: Number(tzDay.value),
    name: tzName.value.trim().slice(0, 20),
  };
  if (!tzValidDate(v.y, v.m, v.d)) {
    tzError.textContent = "日付を選び直してください。";
    tzError.hidden = false;
    return;
  }
  if (jdn(v.y, v.m, v.d) > tzToday()) {
    tzError.textContent = "命日が今日より先の日付になっています。";
    tzError.hidden = false;
    return;
  }
  tzError.hidden = true;
  tzSave(v);
  tzRender(v);
  tzResult.scrollIntoView({ behavior: "smooth", block: "start" });
});

$t("btn-ics").addEventListener("click", () => {
  if (!tzCurrent) return;
  const n = tzUpcoming(tzCurrent.s, tzToday()).length;
  if (!n) { tzStatus.textContent = "これから先の期限がないため、登録するものがありません"; return; }
  const blob = new Blob([tzBuildIcs(tzCurrent.v, tzCurrent.s)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tetsuzuki-calendar.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  tzStatus.textContent = `${n}件の期限をカレンダー用ファイル(.ics)にしました`;
});

$t("btn-share").addEventListener("click", async () => {
  if (!tzCurrent) return;
  const text = tzShareText(tzCurrent.v, tzCurrent.s);
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
    tzStatus.textContent = "期限の一覧をコピーしました。LINEやメールに貼り付けて送れます";
  } catch (err) {
    tzStatus.textContent = "コピーできませんでした";
  }
});

$t("btn-print").addEventListener("click", () => window.print());

window.addEventListener("beforeprint", () => {
  document.querySelectorAll(".hy-fold").forEach((d) => { d.dataset.wasOpen = d.open ? "1" : ""; d.open = true; });
});
window.addEventListener("afterprint", () => {
  document.querySelectorAll(".hy-fold").forEach((d) => { d.open = d.dataset.wasOpen === "1"; });
});

$t("btn-edit").addEventListener("click", () => {
  $t("form-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- 起動 ---------- */

tzInitForm();
const tzSaved = tzLoadSaved();
if (tzSaved) {
  tzYear.value = String(tzSaved.y);
  tzMonth.value = String(tzSaved.m);
  tzFillDays(tzSaved.d);
  tzName.value = tzSaved.name || "";
  tzUpdatePreview();
  tzRender(tzSaved);
}
