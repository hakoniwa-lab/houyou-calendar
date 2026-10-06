/*
 * 年忌早見表の「ほかの年を調べる」。表の中身は houyou.js の nenkiTableHtml。
 */
(function () {
  const selYear = document.getElementById("pick-year");
  const selStyle = document.getElementById("pick-style");
  const out = document.getElementById("pick-table");
  const ty = new Date().getFullYear();

  for (let y = ty + 30; y >= 1990; y--) {
    selYear.add(new Option(`${y}年(${warekiOfYear(y).join("・")})`, String(y)));
  }
  selYear.value = String(ty + 2);

  function draw() {
    out.innerHTML = nenkiTableHtml(Number(selYear.value), selStyle.value);
  }
  selYear.addEventListener("change", draw);
  selStyle.addEventListener("change", draw);
  draw();
})();

/*
 * 「亡くなった年から調べる」(逆引き)。表の中身は houyou.js の nenkiByDeathYearHtml。
 */
(function () {
  const selYear = document.getElementById("death-year");
  const selStyle = document.getElementById("death-style");
  const out = document.getElementById("death-table");
  if (!selYear) return;
  const ty = new Date().getFullYear();

  for (let y = ty; y >= ty - 60; y--) {
    selYear.add(new Option(`${y}年(${warekiOfYear(y).join("・")})に亡くなった方`, String(y)));
  }
  selYear.value = String(ty - 1);

  function draw() {
    out.innerHTML = nenkiByDeathYearHtml(Number(selYear.value), selStyle.value, ty);
  }
  selYear.addEventListener("change", draw);
  selStyle.addEventListener("change", draw);
  draw();
})();
