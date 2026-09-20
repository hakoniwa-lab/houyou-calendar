/*
 * 死亡後の手続きの期限を、命日(相続の開始を知った日)から計算する。
 * 日付は houyou.js と同じ「日の通し番号」で扱う。DOMには触れない。
 *
 * 期間の数え方(条文で確認したもの):
 *   民法140条    期間の初日は算入しない(原則)
 *   民法143条2項 応当日の前日に満了。最後の月に応当する日がないときはその月の末日に満了
 *   戸籍法43条   戸籍の届出期間は「届出事件発生の日」から起算する(初日を算入する)
 *   戸籍法86条   死亡届は死亡の事実を知った日から7日以内(国外は3か月以内)
 *   住民基本台帳法25条 世帯変更届は変更があった日から14日以内
 *   民法915条    相続の放棄・限定承認は自己のために相続の開始があったことを知った時から3か月以内
 *   所得税法125条 準確定申告は知った日の翌日から4月を経過した日の前日まで
 *   相続税法27条  相続税の申告は知った日の翌日から10月以内
 *   不動産登記法76条の2 相続登記は取得を知った日から3年以内
 *     (令和6年4月1日より前に相続を知った分は、令和9年3月31日まで = 法務省の案内)
 *   民法1048条   遺留分侵害額請求は知った時から1年(相続開始から10年)
 *   健康保険法193条・国民年金法102条4項 給付を受ける権利は2年、年金は5年(国民年金法102条1項)
 *   保険法95条    保険給付の請求権は3年
 *   国税通則法10条2項・同施行令2条2項 国税の期限が土日祝・12/29〜31に当たるときは翌開庁日
 *
 * 「知った日」は死亡した日と違うことがある(民法915条・所得税法125条・相続税法27条はどれも
 * 「知った日」が起算点)。このツールは命日=知った日として計算する。
 */

/* 行政機関・裁判所・税務署の閉庁日。土日・祝日・年末年始(12/29〜1/3) */
function isClosedDay(idx) {
  const info = dayInfo(idx);
  if (info.wd === 0 || info.wd === 6 || info.holiday) return true;
  if (info.m === 12 && info.d >= 29) return true;
  if (info.m === 1 && info.d <= 3) return true;
  return false;
}

/* 期限が閉庁日なら翌開庁日にずらす */
function nextOpenDay(idx) {
  let d = idx;
  for (let i = 0; i < 10 && isClosedDay(d); i++) d++;
  return d;
}

/* 年月を足した日付。応当する日がない月は「日なし」を返す(民法143条2項ただし書の判定に使う) */
function addMonthsRaw(y, m, d, months) {
  const t = m - 1 + months;
  const ny = y + Math.floor(t / 12);
  const nm = (((t % 12) + 12) % 12) + 1;
  const last = daysInMonth(ny, nm);
  return { y: ny, m: nm, d: Math.min(d, last), missing: d > last };
}

/*
 * 民法の数え方で「◯か月以内」の満了日を出す。
 * 起算日は翌日(初日不算入)。応当日があればその前日、なければその月の末日。
 */
function monthDeadline(deathIdx, months) {
  const s = ymdOf(deathIdx + 1);
  const a = addMonthsRaw(s.y, s.m, s.d, months);
  if (a.missing) return jdn(a.y, a.m, a.d);       // その月の末日に満了
  return jdn(a.y, a.m, a.d) - 1;                   // 応当日の前日に満了
}

/* 「◯年以内」も同じ数え方(年=12か月) */
function yearDeadline(deathIdx, years) {
  return monthDeadline(deathIdx, years * 12);
}

/* 「◯日以内」。戸籍の届出だけは初日を算入する(戸籍法43条) */
function dayDeadline(deathIdx, days, countFirstDay) {
  return countFirstDay ? deathIdx + days - 1 : deathIdx + days;
}

const SOUZOKU_TOUKI_KEIKA = { y: 2027, m: 3, d: 31 };   // 令和9年3月31日
const SOUZOKU_TOUKI_START = { y: 2024, m: 4, d: 1 };    // 令和6年4月1日(相続登記の義務化)

/*
 * 手続きの一覧。
 *   kind    "day" 日数 / "month" 月数 / "year" 年数
 *   first   true なら初日を算入する(戸籍の届出)
 *   shift   true なら期限が閉庁日のとき翌開庁日にずらす
 *   group   表示のまとまり
 */
const TETSUZUKI = [
  { key: "shibo", group: "yakusho", name: "死亡届", kind: "day", n: 7, first: true, shift: false,
    where: "市区町村の窓口", law: "戸籍法86条・43条",
    note: "死亡の事実を知った日を1日目として7日以内。窓口は時間外・休日も受け付けます。火葬許可の申請も同時に行うのが一般的です。" },
  { key: "nenkin-kosei", group: "yakusho", name: "年金の受給停止(厚生年金)", kind: "day", n: 10, first: false, shift: false,
    where: "年金事務所・街角の年金相談センター", law: "日本年金機構の案内",
    note: "日本年金機構にマイナンバーが収録されている方は、原則として死亡届の提出は不要です。未支給年金の請求は別に必要です。" },
  { key: "setai", group: "yakusho", name: "世帯主の変更届", kind: "day", n: 14, first: false, shift: false,
    where: "市区町村の窓口", law: "住民基本台帳法25条",
    note: "亡くなった方が世帯主で、残る世帯員が2人以上いる場合に必要です。1人だけになるときは届出が要りません。" },
  { key: "nenkin-kokumin", group: "yakusho", name: "年金の受給停止(国民年金)", kind: "day", n: 14, first: false, shift: false,
    where: "市区町村の窓口・年金事務所", law: "日本年金機構の案内",
    note: "こちらもマイナンバーが収録されていれば原則不要です。" },
  { key: "kokuho", group: "yakusho", name: "国民健康保険・後期高齢者医療の資格喪失", kind: "day", n: 14, first: false, shift: false,
    where: "市区町村の窓口", law: "国民健康保険法施行規則ほか",
    note: "保険証の返却が必要です。葬祭費の請求も同じ窓口でできることが多いです。" },
  { key: "kaigo", group: "yakusho", name: "介護保険の資格喪失", kind: "day", n: 14, first: false, shift: false,
    where: "市区町村の窓口", law: "介護保険法施行規則ほか",
    note: "介護保険被保険者証の返却が必要です。" },

  { key: "houki", group: "souzoku", name: "相続放棄・限定承認", kind: "month", n: 3, shift: true,
    where: "亡くなった方の住所地の家庭裁判所", law: "民法915条",
    note: "借金を引き継がないための手続きです。期限は家庭裁判所に申し立てて伸ばせる場合があります。財産の内容が分からないうちに遺産を処分すると、相続したものとみなされることがあります。" },
  { key: "junkakutei", group: "souzoku", name: "準確定申告", kind: "month", n: 4, shift: true,
    where: "亡くなった方の住所地の税務署", law: "所得税法125条",
    note: "亡くなった年の1月1日から死亡日までの所得を申告します。給与や年金だけで源泉徴収が済んでいる場合など、申告が要らないこともあります。医療費控除などで還付になることもあります。" },
  { key: "souzokuzei", group: "souzoku", name: "相続税の申告・納付", kind: "month", n: 10, shift: true,
    where: "亡くなった方の住所地の税務署", law: "相続税法27条",
    note: "遺産が基礎控除(3,000万円＋600万円×法定相続人の数)を超えるときに必要です。配偶者の税額軽減や小規模宅地等の特例は、申告して初めて使えます。" },

  { key: "iryubun", group: "seikyu", name: "遺留分侵害額の請求", kind: "year", n: 1, shift: false,
    where: "相手方へ(内容証明郵便など)", law: "民法1048条",
    note: "遺言などで最低限の取り分を侵害されたときの請求です。相続の開始と侵害を知った時から1年で時効になります(相続開始から10年でも消滅)。" },
  { key: "touki", group: "seikyu", name: "相続登記(不動産の名義変更)", kind: "year", n: 3, shift: false,
    where: "法務局", law: "不動産登記法76条の2",
    note: "2024年4月1日から義務になりました。正当な理由なく放置すると10万円以下の過料の対象です。すぐに分けられないときは「相続人申告登記」で義務を果たせます。" },

  { key: "sosaihi", group: "jiko", name: "葬祭費・埋葬料の請求", kind: "year", n: 2, shift: false,
    where: "市区町村の窓口(国保)・健康保険組合", law: "健康保険法193条ほか",
    note: "国民健康保険は葬祭費(自治体によって3万〜7万円程度)、健康保険は埋葬料(5万円)が目安です。葬儀の翌日から2年で時効になります。" },
  { key: "kogaku", group: "jiko", name: "高額療養費の請求", kind: "year", n: 2, shift: false,
    where: "市区町村の窓口・健康保険組合", law: "健康保険法193条ほか",
    note: "亡くなる前の医療費が自己負担の上限を超えていた分を、相続人が受け取れます。診療を受けた月の翌月1日から2年です。" },
  { key: "ichijikin", group: "jiko", name: "死亡一時金(国民年金)", kind: "year", n: 2, shift: false,
    where: "市区町村の窓口・年金事務所", law: "国民年金法102条4項",
    note: "国民年金の保険料を3年以上納めた方が、年金を受けずに亡くなったときの一時金です。遺族基礎年金を受けられる場合は選択になります。" },
  { key: "seiho", group: "jiko", name: "生命保険金の請求", kind: "year", n: 3, shift: false,
    where: "保険会社", law: "保険法95条",
    note: "請求できる時から3年で時効です。約款で期間を長くしている会社もあるので、過ぎていても問い合わせてみてください。" },
  { key: "mishikyu", group: "jiko", name: "未支給年金の請求", kind: "year", n: 5, shift: false,
    where: "年金事務所・市区町村の窓口", law: "国民年金法102条1項ほか",
    note: "亡くなった月の分までの年金は、生計を同じくしていた遺族が受け取れます。受給停止の手続きと同時に請求するのが一般的です。" },
  { key: "izoku", group: "jiko", name: "遺族年金の請求", kind: "year", n: 5, shift: false,
    where: "年金事務所・市区町村の窓口", law: "国民年金法102条1項ほか",
    note: "遺族基礎年金・遺族厚生年金など。要件はそれぞれ違うので、年金事務所で確認してください。" },
];

const TETSUZUKI_GROUPS = {
  yakusho: { title: "まず役所へ(7日〜14日)", lead: "亡くなった直後にする届出です。葬儀社が代行してくれることもあります。" },
  souzoku: { title: "相続の期限(3か月・4か月・10か月)", lead: "期限を過ぎると選べなくなるもの、加算税がかかるものです。" },
  seikyu: { title: "1年・3年のうちに", lead: "請求しないと権利が消えるもの、しないと過料の対象になるものです。" },
  jiko: { title: "もらえるお金の時効(2年〜5年)", lead: "こちらから請求しないと受け取れません。期限内でも早めに。" },
};

/* 期限日を出す。戻り値は日の通し番号 */
function deadlineIdx(item, deathIdx) {
  if (item.kind === "day") return dayDeadline(deathIdx, item.n, !!item.first);
  if (item.kind === "month") return monthDeadline(deathIdx, item.n);
  return yearDeadline(deathIdx, item.n);
}

/*
 * input: { y, m, d }(命日=相続の開始を知った日)
 * 戻り値: { death, items[] }。items は期限の早い順で、info(曜日・祝日)と shifted(閉庁日でずらしたか)付き
 */
function buildTetsuzuki(input) {
  const deathIdx = jdn(input.y, input.m, input.d);
  const items = TETSUZUKI.map((def) => {
    let idx = deadlineIdx(def, deathIdx);
    let shifted = false;
    let keika = false;

    // 相続登記は、義務化(2024-04-01)より前に相続を知った分の期限が2027-03-31
    if (def.key === "touki" && deathIdx < jdn(SOUZOKU_TOUKI_START.y, SOUZOKU_TOUKI_START.m, SOUZOKU_TOUKI_START.d)) {
      idx = jdn(SOUZOKU_TOUKI_KEIKA.y, SOUZOKU_TOUKI_KEIKA.m, SOUZOKU_TOUKI_KEIKA.d);
      keika = true;
    }
    if (def.shift && isClosedDay(idx)) {
      idx = nextOpenDay(idx);
      shifted = true;
    }
    return { ...def, idx, info: dayInfo(idx), shifted, keika };
  });
  items.sort((a, b) => a.idx - b.idx || TETSUZUKI.indexOf(a) - TETSUZUKI.indexOf(b));
  return { input, death: dayInfo(deathIdx), items };
}

/* 今日以降でいちばん近い期限。なければ null */
function nextTetsuzuki(schedule, todayIdx) {
  return schedule.items.find((it) => it.idx >= todayIdx) || null;
}
