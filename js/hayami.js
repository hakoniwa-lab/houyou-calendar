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
