/*
 * ペットの法要カレンダー(pet/)の設定と、ペット版だけにある欄(月命日・お彼岸・お供えの花)。
 * 画面の本体は app.js をそのまま使う。app.js より前に読み込むこと。
 * 計算は houyou.js(buildSchedule の style "pet"、monthlyMemorials、upcomingHigan)。
 */

/* A8.net ベルビーフルール(提携済み)の商品リンク。行き先はペット向けお供え花の一覧 */
const PET_FLOWER_URL = "https://px.a8.net/svt/ejp?a8mat=4BCFNH+BK69W2+3SJA+TR8TE&amp;a8ejpredirect=https%3A%2F%2Fbv-flower.com%2FSHOP%2F140938%2F153938%2Flist.html";
const PET_FLOWER_PIXEL = `<img border="0" width="1" height="1" src="https://www13.a8.net/0.gif?a8mat=4BCFNH+BK69W2+3SJA+TR8TE" alt="">`;

function petFlowerLink(lead) {
  return `<p class="bon-offer">${lead}<br>
  <a class="result-card__link result-card__link--offer" href="${PET_FLOWER_URL}" target="_blank" rel="nofollow sponsored noopener">ペット向けのお供え花(ベルビーフルール)<span class="badge badge--pr">PR</span></a>${PET_FLOWER_PIXEL}</p>`;
}

const PET_MONTHS = 11;   // 1年目の月命日。12か月目は一周忌と同じ日なので出さない

function renderMonthly(s, today) {
  const card = document.getElementById("card-monthly");
  const months = monthlyMemorials(s.death.idx, PET_MONTHS);
  const d = s.death.d;
  const rows = months.map((mm) => {
    const past = mm.idx < today;
    const isToday = mm.idx === today;
    const state = isToday ? '<span class="badge badge--accent">今日</span>'
      : past ? '<span class="badge badge--done">済</span>'
      : `<span class="hy-row__left">あと${(mm.idx - today).toLocaleString()}日</span>`;
    return `<li class="mm${past ? " is-past" : ""}"><span class="mm__n">${mm.n}か月</span>` +
      `<span class="mm__date">${fmtDate(mm.info)}${mm.endOfMonth ? "<small>月末</small>" : ""}</span>${state}</li>`;
  }).join("");
  const allPast = months.every((mm) => mm.idx < today);
  const list = `<ul class="mm-list">${rows}</ul>`;
  card.innerHTML = `<h2 class="card__title card__title--list">月命日(1年目)</h2>
    <p class="card__lead">毎月の、命日と同じ日付です。${d >= 29 ? `${d}日がない月は月末にしています。` : ""}12か月目は一周忌と重なります。</p>
    ${allPast ? `<details class="hy-fold"><summary>1年目の月命日(すべて済んでいます)</summary>${list}</details>` : list}
    ${petFlowerLink("月命日に飾るお花を探すなら")}`;
}

function renderHigan(today) {
  const card = document.getElementById("card-higan");
  const rows = upcomingHigan(today, 2).map((p) =>
    `<tr><th>${p.year}年 ${p.season === "spring" ? "春" : "秋"}</th><td class="num">${fmtMd(p.start)}〜${fmtMd(p.end)}</td>` +
    `<td class="num">${fmtMd(p.mid)}</td></tr>`).join("");
  card.innerHTML = `<h2 class="card__title card__title--list">次のお彼岸</h2>
    <p class="card__lead">ペット霊園の合同供養祭(慰霊祭)は、春と秋のお彼岸やお盆に開かれることが多い行事です。日程は霊園ごとに違うので、案内を確かめてください。</p>
    <div class="table-scroll"><table class="spec"><thead><tr><th>時期</th><th>期間</th><th>中日</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

window.HOUYOU_PAGE = {
  storageKey: "houyou-calendar:pet",
  siteUrl: "https://hakoniwalab.com/houyou-calendar/pet/",
  appName: "ペットの法要カレンダー",
  root: "../",
  word: "節目",
  minYear: 1990,
  bonOffer: petFlowerLink("初盆にお供えの花を用意するなら"),
  afterRender(s, v, today) {
    // 1年目は、次の節目のカードに次の月命日も添える
    const mm = monthlyMemorials(s.death.idx, PET_MONTHS).find((x) => x.idx >= today);
    if (mm) {
      const text = mm.idx === today ? `今日は${mm.n}か月の月命日です` : `次の月命日は ${fmtDate(mm.info)}(${mm.n}か月)`;
      document.getElementById("next-card").insertAdjacentHTML("beforeend", `<p class="next-cand">${text}</p>`);
    }
    renderMonthly(s, today);
    renderHigan(today);
  },
  extraEvents(s, today) {
    return monthlyMemorials(s.death.idx, PET_MONTHS)
      .filter((mm) => mm.idx >= today)
      .map((mm) => ({
        key: `m${mm.n}`, name: `${mm.n}か月の月命日`, start: mm.idx, end: mm.idx, alarm: "PT9H",
        alarmText: "今日は月命日です", desc: fmtDate(mm.info),
      }));
  },
};
