// ルート作成の画面。元の Apps Script「dialog.html」(配達ルート作成ツール v5)をそのまま使う。
// 変えたのは、ポータル用の見出し(viewport・title)、シートを指していた文言、取引先の管理・配達履歴への移動ボタンだけ。
// サーバーの呼び出し(google.script.run)は ui/shim.ts が /apps/haisou/api に置き換える。
// 注意: この文字列の中では、バッククォートと「$」+「{」を使わない(String.raw のテンプレートのため)。
export const DIALOG_HTML = String.raw`<!DOCTYPE html>
<html>
<head>
<base target="_top">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>配達ルート作成 | LONG PORTAL</title>
<style>
  :root { --navy:#1F3A5F; --teal:#0E7C7B; --amber:#E8A33D; }
  * { box-sizing:border-box; font-family:'Noto Sans CJK JP','Yu Gothic UI',sans-serif; }
  body { margin:0; padding:16px; color:#222; font-size:14px; }
  h2 { color:var(--navy); margin:0 0 10px; font-size:18px; }
  .bar { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
         background:#f4f6f9; border:1px solid #d8dee8; border-radius:8px; padding:10px 14px; margin-bottom:12px; }
  .bar label { font-weight:bold; color:var(--navy); }
  .bar.saved { background:#eef5f5; border-color:#bcd7d6; }
  input[type=time], input[type=date] { font-size:15px; padding:4px 6px; }
  input[type=text] { font-size:14px; padding:4px 6px; }
  table { border-collapse:collapse; width:100%; }
  th, td { border:1px solid #c9d2de; padding:5px 8px; text-align:left; }
  th { background:var(--navy); color:#fff; font-weight:normal; white-space:nowrap; }
  tr.sel { background:#fdf3e0; }
  .kind2 td { color:#555; }
  .stay-in { width:52px; text-align:right; padding:2px 4px; }
  .detail-in { width:100%; padding:2px 4px; }
  select.yoken { padding:2px 4px; }
  .btn { background:var(--teal); color:#fff; border:none; border-radius:6px;
         padding:10px 22px; font-size:15px; cursor:pointer; }
  .btn.gray { background:#8a93a2; }
  .btn.amber { background:var(--amber); }
  .btn.small { padding:6px 14px; font-size:13px; }
  .btn:disabled { background:#bbb; cursor:default; }
  .foot { position:sticky; bottom:0; background:#fff; padding:10px 0 2px;
          border-top:2px solid var(--navy); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .group { background:#e8eef5; color:var(--navy); font-weight:bold; padding:4px 8px; }
  .gyo-bar { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
  .gyo-bar button { padding:5px 10px; border:1px solid var(--navy); background:#fff;
                    color:var(--navy); border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold; }
  .gyo-bar button.on { background:var(--navy); color:#fff; }
  /* AM/PMタブ */
  .shift-tabs { display:flex; gap:6px; margin-bottom:0; }
  .shift-tabs button { padding:9px 26px; border:1px solid var(--navy); border-bottom:none;
                        background:#e8eef5; color:var(--navy); border-radius:8px 8px 0 0;
                        cursor:pointer; font-weight:bold; font-size:14px; }
  .shift-tabs button.on { background:var(--navy); color:#fff; }
  .shift-panel { border:1px solid var(--navy); border-radius:0 8px 8px 8px; padding:12px; margin-bottom:16px; }
  .skip-row { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:bold; color:#a56a00; }
  .panel-body.skipped { opacity:0.4; pointer-events:none; }
  /* 結果画面 */
  .lunch-row td { background:#fff6e5; color:#a56a00; font-weight:bold; text-align:center; }
  .maplink { display:inline-block; margin:4px 8px 4px 0; }
  .head-print { display:flex; justify-content:space-between; align-items:flex-end;
                border-bottom:3px solid var(--navy); padding-bottom:6px; margin-bottom:8px; }
  .head-print .co { font-size:12px; color:#555; }
  .chk { display:inline-block; width:14px; height:14px; border:1.5px solid #444; vertical-align:middle; }
  .qr-note { font-size:12px; color:#555; margin-top:6px; }
  .shift-result-title { background:var(--navy); color:#fff; font-weight:bold; padding:5px 12px;
                         border-radius:4px; margin:14px 0 6px; font-size:13px; }
  .shift-result-title:first-child { margin-top:0; }
  /* 結果画面の編集バー */
  .edit-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
              background:#fdf3e0; border:1px dashed var(--amber); border-radius:8px;
              padding:8px 12px; margin:6px 0 10px; }
  .edit-bar select, .edit-bar input[type=text] { font-size:13px; padding:4px 6px; }
  .edit-btn { padding:2px 7px; margin:1px; cursor:pointer; }
  .del-btn { background:#c0504d; color:#fff; border:none; border-radius:4px; padding:3px 8px; margin:1px; cursor:pointer; }
  .del-btn:disabled { background:#bbb; }
  .col-jun   { width:5%; }
  .col-co    { width:13%; }
  .col-yoken { width:8%; }
  .col-seki  { width:5%; }
  .col-detail{ width:26%; }
  .col-sumi  { width:4%; }
  @media print {
    .noprint { display:none !important; }
    body.print-mode-delivery .print-hide { display:none !important; }
    body.print-mode-delivery .print-hide-row { display:none !important; }
    body { padding:0; font-size:10.5px; }
    body.print-mode-delivery { font-size:11px; }
    th, td { padding:3px 4px; }
    body.print-mode-delivery th, body.print-mode-delivery td { padding:4px 5px; }
    th { background:var(--navy) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .lunch-row td { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    a { color:#222; text-decoration:none; }
    .detail-edit { border:none !important; background:transparent !important; }
    .shift-result-title { margin:8px 0 4px; padding:3px 10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .head-print { margin-bottom:4px; padding-bottom:3px; }
    body.print-mode-delivery .col-jun   { width:5%; }
    body.print-mode-delivery .col-co    { width:18%; }
    body.print-mode-delivery .col-yoken { width:10%; }
    body.print-mode-delivery .col-seki  { width:5%; }
    body.print-mode-delivery .col-detail{ width:auto; }
    body.print-mode-delivery .col-sumi  { width:5%; }
    body.print-mode-delivery .chk { width:13px; height:13px; }
  }
  /* カレンダー */
  .cal-wrap { display:flex; gap:14px; align-items:flex-start; }
  .cal-box { flex:1.6; border:1px solid #c9d2de; border-radius:8px; padding:10px 12px; }
  .cal-side { flex:1; border:1px solid #c9d2de; border-radius:8px; padding:10px 12px; min-width:330px;
              max-height:calc(100vh - 150px); overflow:auto; }
  .cal-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .cal-head .ym { font-size:18px; font-weight:bold; color:var(--navy); min-width:130px; text-align:center; }
  .nav-btn { border:1px solid var(--navy); background:#fff; color:var(--navy); border-radius:6px;
             padding:4px 11px; font-weight:bold; cursor:pointer; }
  .cal-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:3px; }
  .cal-dow { text-align:center; font-weight:bold; color:#555; padding:3px 0; font-size:13px; }
  .cal-dow.sun { color:#c0504d; } .cal-dow.sat { color:#2a6fb0; }
  .cal-day { min-height:92px; border:1px solid #dde3ea; border-radius:5px; padding:3px 4px; cursor:pointer; background:#fff; overflow:hidden; }
  .cal-day:hover { background:#f6f9fc; }
  .cal-day.off { background:#f7f8fa; color:#bbb; }
  .cal-day.today { outline:2px solid var(--amber); }
  .cal-day.sel { background:#eaf5f4; border-color:var(--teal); outline:2px solid var(--teal); }
  .cal-day .dn { font-weight:bold; font-size:12px; }
  .cal-day.sun .dn { color:#c0504d; } .cal-day.sat .dn { color:#2a6fb0; }
  .cal-chip { display:flex; justify-content:space-between; gap:4px; font-size:11px; color:#fff; border-radius:4px;
              padding:1px 5px; margin-top:2px; white-space:nowrap; overflow:hidden; }
  .cal-chip .cnt { font-weight:bold; opacity:.95; }
  .cal-more { font-size:11px; color:var(--navy); font-weight:bold; margin-top:2px; }
  .cal-legend { font-size:12px; color:#555; margin-top:8px; display:flex; flex-wrap:wrap; gap:4px 12px; align-items:center; }
  .cal-legend .sw { display:inline-block; width:11px; height:11px; border-radius:2px; vertical-align:middle; margin-right:3px; }
  .rcard { border:1px solid #c9d2de; border-left:6px solid var(--teal); border-radius:6px; padding:8px 10px; margin-bottom:8px; }
  .rcard.picked { background:#fdf3e0; }
  .rcard .t { font-weight:bold; font-size:14px; }
  .rcard .s { color:#555; font-size:12px; margin:3px 0 6px; }
  .rcard .counts b { font-size:14px; color:var(--navy); }
  .cmp-bar { background:#fdf3e0; border:1px dashed var(--amber); border-radius:6px; padding:8px 10px; margin:6px 0 10px; font-size:12px; }
</style>
<style id="pageSizeStyle">@page { size: A4 landscape; margin: 10mm; }</style>
</head>
<body>

<!-- ========== 選択画面 ========== -->
<div id="pageSelect">
  <h2>配達先を選択</h2>

  <!-- 保存したルート表の呼び出し -->
  <div class="bar saved">
    <label>📂 保存したルート表</label>
    <select id="savedSelect" style="font-size:14px;padding:4px 6px;min-width:320px">
      <option value="">読み込み中...</option>
    </select>
    <button class="btn small" onclick="loadSavedRoute()">📂 呼出</button>
    <button class="btn small amber" onclick="openCalendar()">📅 カレンダーで選ぶ</button>
    <button class="btn small gray" onclick="deleteSavedRoute()">🗑 削除</button>
    <button class="btn small gray" onclick="refreshSavedList()" title="一覧を再読み込み">🔄</button>
    <span id="savedMsg" style="color:var(--teal);font-size:12px"></span>
  </div>

  <div class="bar saved">
    <label>🆚 2つを比較</label>
    <select id="savedSelect1" style="font-size:13px;padding:4px 6px;min-width:250px">
      <option value="">— 1つ目 —</option>
    </select>
    <span style="color:#777">と</span>
    <select id="savedSelect2" style="font-size:13px;padding:4px 6px;min-width:250px">
      <option value="">— 2つ目 —</option>
    </select>
    <button class="btn small" onclick="compareRoutes()">🆚 並べて表示</button>
    <span id="compareMsg" style="color:var(--teal);font-size:12px"></span>
  </div>

  <div class="bar">
    <label>配達日</label>
    <input type="date" id="deliveryDate">
    <label>配達者</label>
    <select id="driver" style="font-size:14px;padding:4px 6px;min-width:110px">
      <option value="">選択してください</option>
    </select>
    <span style="color:#777">※昼休み/休憩は自動で考慮されます</span>
  </div>

  <div class="shift-tabs">
    <button class="on" id="tabBtnAM" onclick="switchTab('AM')">☀ AM便</button>
    <button id="tabBtnPM" onclick="switchTab('PM')">🌙 PM便</button>
  </div>

  <div id="panelAM" class="shift-panel">
    <div class="skip-row">
      <input type="checkbox" id="skipAM" onchange="toggleSkip('AM')">
      <label for="skipAM" style="font-weight:bold">この便は配達なし（スキップ）</label>
    </div>
    <div class="panel-body" id="panelBodyAM">
      <div class="bar" style="margin-bottom:10px">
        <label>出発時刻</label><input type="time" id="startAM" value="09:00">
        <span>選択中: <b id="countAM">0</b> 件</span>
        <label style="font-weight:normal;color:#444">
          <input type="checkbox" id="avoidHighwaysAM" checked style="vertical-align:middle"> 🛣️ 高速道路を使わない
        </label>
      </div>
      <div class="gyo-bar">
        <button class="on" data-gyo="all" onclick="setGyo(this,'AM')">すべて</button>
        <button data-gyo="あ" onclick="setGyo(this,'AM')">ア行</button>
        <button data-gyo="か" onclick="setGyo(this,'AM')">カ行</button>
        <button data-gyo="さ" onclick="setGyo(this,'AM')">サ行</button>
        <button data-gyo="た" onclick="setGyo(this,'AM')">タ行</button>
        <button data-gyo="な" onclick="setGyo(this,'AM')">ナ行</button>
        <button data-gyo="は" onclick="setGyo(this,'AM')">ハ行</button>
        <button data-gyo="ま" onclick="setGyo(this,'AM')">マ行</button>
        <button data-gyo="や" onclick="setGyo(this,'AM')">ヤ行</button>
        <button data-gyo="ら" onclick="setGyo(this,'AM')">ラ行</button>
        <button data-gyo="わ" onclick="setGyo(this,'AM')">ワ行</button>
        <button data-gyo="英" onclick="setGyo(this,'AM')">英数</button>
        <button data-gyo="sel" onclick="setGyo(this,'AM')">✓選択中</button>
      </div>
      <div id="listAreaAM">読み込み中...</div>
      <div class="shift-result-title" style="margin-top:14px">選択済みの配達先（AM便）</div>
      <div id="selectedAreaAM"></div>
    </div>
  </div>

  <div id="panelPM" class="shift-panel" style="display:none">
    <div class="skip-row">
      <input type="checkbox" id="skipPM" onchange="toggleSkip('PM')">
      <label for="skipPM" style="font-weight:bold">この便は配達なし（スキップ）</label>
    </div>
    <div class="panel-body" id="panelBodyPM">
      <div class="bar" style="margin-bottom:10px">
        <label>出発時刻</label><input type="time" id="startPM" value="13:00">
        <span>選択中: <b id="countPM">0</b> 件</span>
        <label style="font-weight:normal;color:#444">
          <input type="checkbox" id="avoidHighwaysPM" checked style="vertical-align:middle"> 🛣️ 高速道路を使わない
        </label>
      </div>
      <div class="gyo-bar">
        <button class="on" data-gyo="all" onclick="setGyo(this,'PM')">すべて</button>
        <button data-gyo="あ" onclick="setGyo(this,'PM')">ア行</button>
        <button data-gyo="か" onclick="setGyo(this,'PM')">カ行</button>
        <button data-gyo="さ" onclick="setGyo(this,'PM')">サ行</button>
        <button data-gyo="た" onclick="setGyo(this,'PM')">タ行</button>
        <button data-gyo="な" onclick="setGyo(this,'PM')">ナ行</button>
        <button data-gyo="は" onclick="setGyo(this,'PM')">ハ行</button>
        <button data-gyo="ま" onclick="setGyo(this,'PM')">マ行</button>
        <button data-gyo="や" onclick="setGyo(this,'PM')">ヤ行</button>
        <button data-gyo="ら" onclick="setGyo(this,'PM')">ラ行</button>
        <button data-gyo="わ" onclick="setGyo(this,'PM')">ワ行</button>
        <button data-gyo="英" onclick="setGyo(this,'PM')">英数</button>
        <button data-gyo="sel" onclick="setGyo(this,'PM')">✓選択中</button>
      </div>
      <div id="listAreaPM">読み込み中...</div>
      <div class="shift-result-title" style="margin-top:14px">選択済みの配達先（PM便）</div>
      <div id="selectedAreaPM"></div>
    </div>
  </div>

  <div class="foot noprint">
    <button class="btn" id="btnCalc" onclick="calcBoth()">ルート計算 ▶（AM＋PM）</button>
    <label style="font-weight:bold;color:var(--navy)">
      <input type="checkbox" id="optimizeOnCalc" checked style="vertical-align:middle"> ⚡ 順番を自動で最適化する
    </label>
    <span style="color:#777;font-size:12px">（オフ＝選択済みリストの順番のまま計算）</span>
    <button class="btn gray" onclick="closeApp()">✖ 終了</button>
    <button class="btn small amber" onclick="if(!dirty||confirm('保存していない変更があります。移動してよろしいですか？'))location.href='/apps/haisou/clients'">🏢 取引先の管理</button>
    <button class="btn small gray" onclick="if(!dirty||confirm('保存していない変更があります。移動してよろしいですか？'))location.href='/apps/haisou/history'">📋 配達履歴</button>
  </div>
</div>

<!-- ========== 結果画面 ========== -->
<div id="pageResult" style="display:none">
  <div class="head-print">
    <div>
      <h2 style="margin:0">配達ルート表　<span id="rDate"></span>　配達者【<span id="rDriver"></span>】</h2>
      <div class="co">株式会社ロング　休憩：12:00-12:45／15:00-15:15／17:30-17:40</div>
      <div class="co" id="rGrandTotal" style="display:none;font-weight:bold;color:var(--navy)"></div>
    </div>
    <div class="co">発行: <span id="rNow"></span></div>
  </div>
  <div id="restoreNote" class="noprint" style="color:var(--teal);margin-bottom:4px;display:none"></div>
  <div id="optNoteAM" class="noprint" style="color:#a00; margin-bottom:4px; display:none"></div>
  <div id="optNotePM" class="noprint" style="color:#a00; margin-bottom:4px; display:none"></div>
  <div class="noprint" style="margin-bottom:8px">
    <button class="btn gray" id="btnReorder" onclick="toggleReorder()">✏ ルートを編集</button>
    <span id="editHint" style="color:#777;font-size:12px">※▲▼で並べ替え、×で削除、＋で配達先の追加ができます（時刻・距離は自動で再計算）</span>
    <span id="busyMsg" style="color:#a56a00;font-weight:bold;margin-left:8px"></span>
  </div>

  <div id="blockAM"></div>
  <div id="editAM"></div>
  <div id="rLinksAM" class="noprint" style="margin:6px 0"></div>
  <div id="blockPM"></div>
  <div id="editPM"></div>
  <div id="rLinksPM" class="noprint" style="margin:6px 0"></div>

  <div class="qr-note noprint">※ナビはスマホのGoogleマップでリンクを開いて使用してください。</div>
  <div class="foot noprint">
    <button class="btn gray" onclick="backToSelect()">◀ 戻る</button>
    <button class="btn amber" onclick="printFull()">🖨 印刷 / PDF保存</button>
    <button class="btn amber" onclick="printDelivery()">🚚 配達用印刷</button>
    <button class="btn" id="btnSaveRoute" onclick="saveRouteTable()">📌 ルート表を保存（上書き／別名）</button>
    <button class="btn" id="btnSave" onclick="save()">💾 配達履歴に保存</button>
    <button class="btn" id="btnMail" onclick="sendMail()">📧 配達者へ送信</button>
    <button class="btn gray" onclick="closeApp()">✖ 終了</button>
    <span id="saveMsg" style="color:var(--teal)"></span>
  </div>
</div>

<!-- ========== カレンダー画面（保存したルート表を日付で選ぶ） ========== -->
<div id="pageCalendar" style="display:none">
  <h2>📅 保存したルート表（カレンダー）</h2>
  <div class="cal-wrap">
    <div class="cal-box">
      <div class="cal-head">
        <button class="nav-btn" onclick="calMove(-1)" title="前の月">◀</button>
        <span class="ym" id="calYM"></span>
        <button class="nav-btn" onclick="calMove(1)" title="次の月">▶</button>
        <button class="nav-btn" onclick="calToday()">今日</button>
        <span style="margin-left:auto">配達者：
          <select id="calDriver" onchange="renderCalendar()" style="font-size:13px;padding:3px 6px">
            <option value="">全員</option>
          </select>
        </span>
      </div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-legend" id="calLegend"></div>
    </div>
    <div class="cal-side" id="calSide"></div>
  </div>
  <div class="foot noprint" style="margin-top:12px">
    <button class="btn gray" onclick="closeCalendar()">◀ 選択画面に戻る</button>
    <button class="btn gray small" onclick="refreshSavedList(renderCalendar)">🔄 読み込み直す</button>
    <span id="calMsg" style="color:var(--teal)"></span>
  </div>
</div>

<!-- ========== 比較画面（保存したルート表を2つ並べて表示） ========== -->
<div id="pageCompare" style="display:none">
  <div class="head-print">
    <h2 style="margin:0">🆚 ルート表の比較</h2>
    <div class="co">発行: <span id="cmpNow"></span></div>
  </div>
  <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div id="compareLeft" style="flex:1;min-width:340px"></div>
    <div id="compareRight" style="flex:1;min-width:340px"></div>
  </div>
  <div class="foot noprint" style="margin-top:14px">
    <button class="btn gray" onclick="backToSelectFromCompare()">◀ 選択画面に戻る</button>
    <button class="btn amber" onclick="printFull()">🖨 印刷 / PDF保存</button>
  </div>
</div>

<script>
let CLIENTS = [];
let RESULTS = { AM: null, PM: null };
let currentGyo = { AM: 'all', PM: 'all' };
let reorderMode = false;
let selectedStops = { AM: [], PM: [] };
let uidCounter = 1;
let companyDefaults = {};
let historyDetails = {};
let SAVED_LIST = [];
let DRIVERS = [];
let lastSavedName = '';
let loadedName = '';      // 呼び出し中（または最後に保存した）ルート表の名前
let busy = false;         // 再計算中フラグ
let dirty = false;        // 未保存の変更があるか

const YOKEN_OPTS = ['納品', '引取', '納品+引取', '持込', '持込+引取', 'その他'];

/* 既存取引先の読み仮名辞書（新規追加分は取引先の管理の「フリガナ」に入力してください） */
const KANA_DICT = {
  'アイデン':'あいでん','エムユー':'えむゆー','石浦ｽﾃﾝﾚｽ':'いしうら','有川製作所':'ありかわ',
  '石川製作所':'いしかわ','ｵﾔﾏ工業':'おやま','大窪鉄工':'おおくぼ','金沢スプリング':'かなざわ',
  '北村機器製作所':'きたむら','鶴盛工業':'つるもり','小林俊三工業所':'こばやし',
  '小松ﾊﾟﾜｰトロン':'こまつ','コマニー':'こまにー','熊野機工（皆晃）':'くまの','京町産業車輛':'きょうまち',
  'ｶﾖｳ':'かよう','三和ﾀｼﾞﾏ':'さんわ','澁谷工業':'しぶや','シンコー':'しんこー','住田鉄工所':'すみた',
  'ソディック':'そでぃっく','助国鉄工':'すけくに','ダイエー':'だいえー','大同工業':'だいどう',
  '大同テクノ':'だいどう','大和金属':'やまと','高井製作所':'たかい','多川製作所':'たがわ',
  '津田駒工業':'つだこま','鶴田製作所':'つるた','土肥研磨':'どひ','中村留':'なかむら',
  'ニデックマシンツール':'にでっく','大和塗装':'だいわ','ホクショー':'ほくしょー',
  '福井鉄工所':'ふくい','マエダ工業製作所':'まえだ','松本機械':'まつもと','ﾑﾗｷ工業':'むらき',
  '小野谷機工':'おのだに','ライブエイド':'らいぶえいど','ﾜｲﾃｯｸ':'わいてっく',
  '荒木製作所':'あらき','上野工業':'うえの','トキ工業':'とき','藤田工業':'ふじた'
};
const GYO_LABEL = { 'あ':'ア行','か':'カ行','さ':'サ行','た':'タ行','な':'ナ行',
                    'は':'ハ行','ま':'マ行','や':'ヤ行','ら':'ラ行','わ':'ワ行','英':'英数' };
const GYO_ORDER = ['あ','か','さ','た','な','は','ま','や','ら','わ','英'];

function gyoOf(c) {
  const kana = c.kana || KANA_DICT[c.name] || c.name;
  let ch = kana.normalize('NFKC').charAt(0);
  const code = ch.codePointAt(0);
  if (code >= 0x30A1 && code <= 0x30F6) ch = String.fromCodePoint(code - 0x60);
  const base = { 'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','っ':'つ','ゃ':'や','ゅ':'ゆ','ょ':'よ',
    'が':'か','ぎ':'き','ぐ':'く','げ':'け','ご':'こ','ざ':'さ','じ':'し','ず':'す','ぜ':'せ','ぞ':'そ',
    'だ':'た','ぢ':'ち','づ':'つ','で':'て','ど':'と','ば':'は','び':'ひ','ぶ':'ふ','べ':'へ','ぼ':'ほ',
    'ぱ':'は','ぴ':'ひ','ぷ':'ふ','ぺ':'へ','ぽ':'ほ' }[ch] || ch;
  const rows = { 'あ':'あいうえお','か':'かきくけこ','さ':'さしすせそ','た':'たちつてと',
    'な':'なにぬねの','は':'はひふへほ','ま':'まみむめも','や':'やゆよ','ら':'らりるれろ','わ':'わをん' };
  for (const g in rows) if (rows[g].includes(base)) return g;
  return '英';
}
function normKana(c) {
  const kana = c.kana || KANA_DICT[c.name] || c.name;
  return kana.normalize('NFKC').replace(/[\u30A1-\u30F6]/g, ch => String.fromCodePoint(ch.codePointAt(0) - 0x60));
}

/* 取引先を五十音順に並べた一覧（候補リスト・追加プルダウン共通） */
function sortedClients() {
  const idx = CLIENTS.map((c, i) => ({ c: c, i: i, gyo: gyoOf(c), key: normKana(c) }));
  idx.sort((a, b) => GYO_ORDER.indexOf(a.gyo) - GYO_ORDER.indexOf(b.gyo) ||
                     a.key.localeCompare(b.key, 'ja'));
  return idx;
}

/* 会社ごとの前回入力（会社名で記憶） */
function defOf(c) { return companyDefaults['n:' + c.name]; }

/* 保存データ等の配達先から取引先を探す（行番号と会社名が両方合うものを優先、次に会社名だけで探す）
   ※取引先の追加・削除で行番号がずれても、別の会社を拾わないようにするため */
function findClientIdx(s) {
  let idx = CLIENTS.findIndex(c => c.row === s.row && c.name === s.name);
  if (idx < 0) idx = CLIENTS.findIndex(c => c.name === s.name);
  return idx;
}

/* ---------- タブ切替 ---------- */
function switchTab(shift) {
  document.getElementById('tabBtnAM').classList.toggle('on', shift === 'AM');
  document.getElementById('tabBtnPM').classList.toggle('on', shift === 'PM');
  document.getElementById('panelAM').style.display = shift === 'AM' ? '' : 'none';
  document.getElementById('panelPM').style.display = shift === 'PM' ? '' : 'none';
}

function toggleSkip(shift) {
  const skipped = document.getElementById('skip' + shift).checked;
  document.getElementById('panelBody' + shift).classList.toggle('skipped', skipped);
}

/* ---------- 一覧描画（候補リスト：＋追加ボタン方式） ---------- */
function renderList(shift) {
  const idx = sortedClients();

  const kindTag = k => k === '2'
    ? ' <span style="font-size:11px;background:#8a93a2;color:#fff;border-radius:4px;padding:1px 5px">外注</span>'
    : '';

  let html = '<table><thead><tr><th style="width:96px">追加<br>' +
    '<button type="button" onclick="clearAll(\'' + shift + '\')" style="margin-top:4px;font-size:11px;' +
    'padding:3px 8px;border:1px solid #fff;background:transparent;color:#fff;' +
    'border-radius:4px;cursor:pointer;white-space:nowrap">全解除</button></th><th>会社名</th></tr></thead><tbody>';
  let lastGyo = '';
  idx.forEach(o => {
    if (o.gyo !== lastGyo) {
      html += '<tr class="gyo-head" data-gyo="' + o.gyo + '">' +
              '<td colspan="2" class="group">' + GYO_LABEL[o.gyo] + '</td></tr>';
      lastGyo = o.gyo;
    }
    const c = o.c, i = o.i;
    html += '<tr id="row-' + shift + '-' + i + '" class="kind' + c.kind + '">' +
      '<td style="text-align:center">' +
        '<button type="button" onclick="addStop(\'' + shift + '\',' + i + ')" ' +
          'style="background:var(--teal);color:#fff;border:none;border-radius:5px;' +
          'padding:5px 10px;cursor:pointer;font-weight:bold;white-space:nowrap">＋追加</button>' +
        '<div id="badge-' + shift + '-' + i + '" style="font-size:11px;color:var(--teal);margin-top:2px"></div>' +
      '</td>' +
      '<td><label style="cursor:default">' + esc(c.name) + '</label>' + kindTag(c.kind) +
      '<div style="font-size:11px;color:#888">' + esc(c.person) + '</div></td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('listArea' + shift).innerHTML = html;
  applyGyo(shift);
  refreshAllBadges(shift);
}

function setGyo(btn, shift) {
  currentGyo[shift] = btn.dataset.gyo;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  applyGyo(shift);
}

function applyGyo(shift) {
  const g = currentGyo[shift];
  CLIENTS.forEach((c, i) => {
    const row = document.getElementById('row-' + shift + '-' + i);
    if (!row) return;
    let show;
    if (g === 'all') show = true;
    else if (g === 'sel') show = selectedStops[shift].some(s => s.i === i);
    else show = gyoOf(c) === g;
    row.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('#listArea' + shift + ' .gyo-head').forEach(h => {
    if (g === 'all') h.style.display = '';
    else if (g === 'sel') h.style.display = 'none';
    else h.style.display = (h.dataset.gyo === g) ? '' : 'none';
  });
}

/* ---------- 選択済みリスト（同一会社の複数追加に対応） ---------- */
function addStop(shift, i) {
  const c = CLIENTS[i];
  const def = defOf(c);
  selectedStops[shift].push({
    uid: 'u' + (uidCounter++), i: i, row: c.row, name: c.name, person: c.person,
    address: c.address, tel: c.tel, kind: c.kind, latlng: c.latlng,
    yoken: (def && def.yoken) || '納品',
    detail: (def && def.detail) || '',
    stay: c.stay                       // 滞在時間はシートG列の値を初期値にする
  });
  renderSelected(shift);
  updateCount(shift);
  refreshBadge(shift, i);
}

function removeStop(shift, uid) {
  const removed = selectedStops[shift].find(s => s.uid === uid);
  selectedStops[shift] = selectedStops[shift].filter(s => s.uid !== uid);
  renderSelected(shift);
  updateCount(shift);
  if (removed) refreshBadge(shift, removed.i);
  if (currentGyo[shift] === 'sel') applyGyo(shift);
}

function updateSelStop(shift, uid, field, value) {
  const s = selectedStops[shift].find(x => x.uid === uid);
  if (!s) return;
  s[field] = field === 'stay' ? (Number(value) || 0) : value;
}

function appendDetail(shift, uid, selectEl) {
  const val = selectEl.value;
  if (!val) return;
  const input = document.getElementById('dt-' + shift + '-' + uid);
  const cur = input.value.trim();
  input.value = cur ? (cur + ' ' + val) : val;
  updateSelStop(shift, uid, 'detail', input.value);
  selectEl.value = '';
  input.focus();
}

function renderSelected(shift) {
  const list = selectedStops[shift];
  const el = document.getElementById('selectedArea' + shift);
  if (!list.length) {
    el.innerHTML = '<div style="color:#888;padding:8px 4px">まだ配達先が追加されていません</div>';
    return;
  }
  let html = '<table><thead><tr><th style="width:30px">#</th><th>会社名</th><th>要件</th>' +
    '<th style="width:32%">詳細（品番・メモ）</th><th>滞在(分)</th><th style="width:40px"></th></tr></thead><tbody>';
  list.forEach((s, idx) => {
    html += '<tr><td style="text-align:center">' + (idx + 1) + '</td>' +
      '<td><b>' + esc(s.name) + '</b><div style="font-size:11px;color:#888">' + esc(s.person) + '</div></td>' +
      '<td><select onchange="updateSelStop(\'' + shift + '\',\'' + s.uid + '\',\'yoken\',this.value)">' +
        YOKEN_OPTS.map(o => '<option' + (o === s.yoken ? ' selected' : '') + '>' + o + '</option>').join('') +
      '</select></td>' +
      '<td><div style="display:flex;gap:4px">' +
        '<input class="detail-in" type="text" id="dt-' + shift + '-' + s.uid + '" value="' + esc(s.detail) +
          '" placeholder="例: 2602708(1P) RFBOX" style="flex:1" ' +
          'onchange="updateSelStop(\'' + shift + '\',\'' + s.uid + '\',\'detail\',this.value)">' +
        '<select onchange="appendDetail(\'' + shift + '\',\'' + s.uid + '\',this)" ' +
          'style="font-size:12px;padding:2px 2px;max-width:78px">' +
          '<option value="">＋選択</option>' +
          '<optgroup label="枚数">' +
            Array.from({length:10}, (_, k) => k + 1).map(n => '<option value="' + n + 'P">' + n + 'P</option>').join('') +
          '</optgroup>' +
          '<optgroup label="箱数">' +
            Array.from({length:10}, (_, k) => k + 1).map(n => '<option value="' + n + '箱">' + n + '箱</option>').join('') +
          '</optgroup>' +
          '<option value="バラ積み">バラ積み</option>' +
        '</select>' +
        '<select onchange="appendDetail(\'' + shift + '\',\'' + s.uid + '\',this)" ' +
          'style="font-size:12px;padding:2px 2px;max-width:78px" title="この会社の過去の入力履歴から選択">' +
          '<option value="">＋選択2</option>' +
          (historyDetails[s.name] || []).map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('') +
        '</select>' +
      '</div></td>' +
      '<td><input class="stay-in" type="number" value="' + s.stay + '" min="0" ' +
        'onchange="updateSelStop(\'' + shift + '\',\'' + s.uid + '\',\'stay\',this.value)"></td>' +
      '<td style="text-align:center"><button type="button" onclick="removeStop(\'' + shift + '\',\'' + s.uid + '\')" ' +
        'style="background:#c0504d;color:#fff;border:none;border-radius:4px;padding:4px 9px;cursor:pointer">×</button></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function refreshBadge(shift, i) {
  const el = document.getElementById('badge-' + shift + '-' + i);
  if (!el) return;
  const cnt = selectedStops[shift].filter(s => s.i === i).length;
  el.textContent = cnt > 0 ? '追加済み ×' + cnt : '';
}

function refreshAllBadges(shift) {
  CLIENTS.forEach((_, i) => refreshBadge(shift, i));
}

function updateCount(shift) {
  document.getElementById('count' + shift).textContent = selectedStops[shift].length;
}

function clearAll(shift) {
  const removedIdxs = selectedStops[shift].map(s => s.i);
  selectedStops[shift] = [];
  renderSelected(shift);
  updateCount(shift);
  removedIdxs.forEach(i => refreshBadge(shift, i));
  if (currentGyo[shift] === 'sel') applyGyo(shift);
}

/* ---------- 初期読み込み ---------- */
google.script.run.withSuccessHandler(clients => {
  CLIENTS = clients;
  renderList('AM');
  renderList('PM');
  renderSelected('AM');
  renderSelected('PM');
}).withFailureHandler(e => {
  document.getElementById('listAreaAM').textContent = 'エラー: ' + e.message;
}).getClients();

google.script.run.withSuccessHandler(drivers => {
  DRIVERS = drivers.map(d => d.name);
  const sel = document.getElementById('driver');
  drivers.forEach(d => {
    const op = document.createElement('option');
    op.value = d.name;
    op.textContent = d.name;
    op.dataset.email = d.email;
    sel.appendChild(op);
  });
}).getDrivers();

google.script.run.withSuccessHandler(defaults => { companyDefaults = defaults || {}; }).getCompanyDefaults();
google.script.run.withSuccessHandler(hist => { historyDetails = hist || {}; }).getHistoryDetailsByCompany();

(function initDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  document.getElementById('deliveryDate').value = y + '-' + m + '-' + day;
})();

/* ==========================================================
 *  配達ルート表の保存・呼び出し
 * ========================================================== */

/* 保存一覧をプルダウンに読み込む */
function refreshSavedList(after) {
  const sel = document.getElementById('savedSelect');
  const selA = document.getElementById('savedSelect1');
  const selB = document.getElementById('savedSelect2');
  google.script.run
    .withSuccessHandler(list => {
      SAVED_LIST = list || [];
      if (!SAVED_LIST.length) {
        sel.innerHTML = '<option value="">— 保存されたルート表はありません —</option>';
        selA.innerHTML = '<option value="">— 1つ目 —</option>';
        selB.innerHTML = '<option value="">— 2つ目 —</option>';
        if (typeof after === 'function') after();
        return;
      }
      const optHtml = SAVED_LIST.map(o => {
        const info = [o.saved, 'AM' + o.am + '件・PM' + o.pm + '件'];
        if (o.driver) info.push(o.driver);
        return '<option value="' + esc(o.name) + '">' + esc(o.name) +
               '　［' + esc(info.join(' / ')) + '］</option>';
      }).join('');
      sel.innerHTML = '<option value="">— 呼び出すルート表を選択 —</option>' + optHtml;
      selA.innerHTML = '<option value="">— 1つ目 —</option>' + optHtml;
      selB.innerHTML = '<option value="">— 2つ目 —</option>' + optHtml;
      if (lastSavedName) sel.value = lastSavedName;
      if (typeof after === 'function') after();
    })
    .withFailureHandler(e => {
      sel.innerHTML = '<option value="">— 取得できませんでした —</option>';
      document.getElementById('savedMsg').textContent = '一覧取得エラー: ' + e.message;
    })
    .listRouteStates();
}
refreshSavedList();

/* 保存名の既定値（配達日＋配達者） */
function defaultSaveName() {
  const d = document.getElementById('deliveryDate').value || '';
  const dr = document.getElementById('driver').value || '';
  const parts = [];
  if (d) parts.push(d.replace(/-/g, '/'));
  if (dr) parts.push(dr);
  return parts.length ? parts.join(' ') : 'ルート表';
}

/* 保存に含める配達先データ（uidなど画面固有の値は除く） */
function stopForSave(s) {
  return { row: s.row, name: s.name, person: s.person, address: s.address, tel: s.tel,
           kind: s.kind, latlng: s.latlng, yoken: s.yoken, detail: s.detail, stay: s.stay };
}

/* 結果画面から呼ばれる：ルート表＋選択内容を丸ごと保存（上書き or 別名） */
function saveRouteTable() {
  if (busy) { alert('再計算中です。終わってから保存してください。'); return; }
  if (!RESULTS.AM && !RESULTS.PM) { alert('保存できるルート表がありません。'); return; }

  const def = loadedName || defaultSaveName();
  const guide = loadedName
    ? '・そのまま OK →「' + loadedName + '」に上書き保存\n・名前を変えて OK → 別名で新規保存'
    : '（同じ名前で保存すると上書きされます）';
  const input = prompt('保存名を入力してください。\n' + guide, def);
  if (input === null) return;
  const name = input.trim();
  if (!name) { alert('保存名を入力してください。'); return; }

  const exists = SAVED_LIST.some(o => o.name === name);
  if (exists && !confirm('「' + name + '」を上書き保存します。よろしいですか？')) return;

  // 結果画面の内容を選択済みリストへ反映してから保存する
  syncStopsFromResults('AM');
  syncStopsFromResults('PM');

  const payload = {
    v: 1,
    date: document.getElementById('deliveryDate').value,
    driver: document.getElementById('driver').value,
    avoidHighwaysAM: document.getElementById('avoidHighwaysAM').checked,
    avoidHighwaysPM: document.getElementById('avoidHighwaysPM').checked,
    startAM: document.getElementById('startAM').value,
    startPM: document.getElementById('startPM').value,
    skipAM: document.getElementById('skipAM').checked,
    skipPM: document.getElementById('skipPM').checked,
    stops: {
      AM: selectedStops.AM.map(stopForSave),
      PM: selectedStops.PM.map(stopForSave)
    },
    results: { AM: RESULTS.AM, PM: RESULTS.PM }
  };

  const btn = document.getElementById('btnSaveRoute');
  btn.disabled = true;
  google.script.run
    .withSuccessHandler(msg => {
      lastSavedName = name;
      loadedName = name;
      dirty = false;
      document.getElementById('saveMsg').textContent = '✔ ' + msg;
      updateRestoreNote();
      btn.disabled = false;
      refreshSavedList();
    })
    .withFailureHandler(e => { alert('保存エラー: ' + e.message); btn.disabled = false; })
    .saveRouteState(name, payload);
}

/* 選択画面から呼ばれる：保存したルート表を呼び出す */
function loadSavedRoute() {
  const name = document.getElementById('savedSelect').value;
  if (!name) { alert('呼び出すルート表を選択してください。'); return; }
  if (selectedStops.AM.length || selectedStops.PM.length) {
    if (!confirm('現在入力中の内容は上書きされます。よろしいですか？')) return;
  }
  document.getElementById('savedMsg').textContent = '呼び出し中...';
  google.script.run
    .withSuccessHandler(data => applySavedRoute(data, name))
    .withFailureHandler(e => {
      document.getElementById('savedMsg').textContent = '';
      alert('呼び出しエラー: ' + e.message);
    })
    .loadRouteState(name);
}

function applySavedRoute(data, name) {
  if (!data) { alert('保存データが空でした。'); return; }
  document.getElementById('pageCalendar').style.display = 'none';
  document.getElementById('pageCompare').style.display = 'none';
  document.getElementById('pageSelect').style.display = 'block';

  if (data.date) document.getElementById('deliveryDate').value = data.date;
  const dsel = document.getElementById('driver');
  if (data.driver && [...dsel.options].some(o => o.value === data.driver)) dsel.value = data.driver;
  // 高速回避は便ごと。旧形式（共通1つ）で保存されたデータも読めるようにする
  const legacyAvoid = (data.avoidHighways !== undefined) ? !!data.avoidHighways : true;
  document.getElementById('avoidHighwaysAM').checked =
    (data.avoidHighwaysAM !== undefined) ? !!data.avoidHighwaysAM : legacyAvoid;
  document.getElementById('avoidHighwaysPM').checked =
    (data.avoidHighwaysPM !== undefined) ? !!data.avoidHighwaysPM : legacyAvoid;
  if (data.startAM) document.getElementById('startAM').value = data.startAM;
  if (data.startPM) document.getElementById('startPM').value = data.startPM;
  document.getElementById('skipAM').checked = !!data.skipAM; toggleSkip('AM');
  document.getElementById('skipPM').checked = !!data.skipPM; toggleSkip('PM');

  // 選択済みリストを復元（取引先シートの行が動いていても会社名で拾い直す）
  ['AM', 'PM'].forEach(shift => {
    const arr = (data.stops && data.stops[shift]) || [];
    selectedStops[shift] = arr.map(s => {
      const idx = findClientIdx(s);
      return Object.assign({}, s, { uid: 'u' + (uidCounter++), i: idx, row: idx >= 0 ? CLIENTS[idx].row : s.row });
    });
    renderSelected(shift);
    updateCount(shift);
    refreshAllBadges(shift);
    if (currentGyo[shift] === 'sel') applyGyo(shift);
  });

  loadedName = name;
  lastSavedName = name;
  dirty = false;
  // 呼び出したルートは手で決めた順番を守るため、自動最適化をオフにしておく
  document.getElementById('optimizeOnCalc').checked = false;

  document.getElementById('savedMsg').textContent = '✔ 「' + name + '」を呼び出しました';

  // 計算済みのルート表があればそのまま結果画面を表示
  const res = data.results || {};
  if (res.AM || res.PM) {
    showResults({ AM: res.AM || null, PM: res.PM || null });
  } else {
    alert('選択内容を復元しました。「ルート計算」を押してルート表を作成してください。');
  }
}

/* 呼び出し中ルート表の案内表示 */
function updateRestoreNote() {
  const note = document.getElementById('restoreNote');
  if (!loadedName) { note.style.display = 'none'; return; }
  note.style.display = 'block';
  note.textContent = '📂 ルート表「' + loadedName + '」を表示中' +
    (dirty ? '　⚠ 未保存の変更があります（「📌 ルート表を保存」で上書き／別名保存）' : '') +
    '　※「✏ ルートを編集」で追加・削除・並べ替えができます';
}

function markDirty() {
  dirty = true;
  document.getElementById('saveMsg').textContent = '⚠ 変更があります（未保存）';
  updateRestoreNote();
}

/* 保存の削除 */
function deleteSavedRoute() {
  const name = document.getElementById('savedSelect').value;
  if (!name) { alert('削除するルート表を選択してください。'); return; }
  if (!confirm('「' + name + '」を削除します。よろしいですか？\n（この操作は元に戻せません）')) return;
  google.script.run
    .withSuccessHandler(msg => {
      if (lastSavedName === name) lastSavedName = '';
      if (loadedName === name) loadedName = '';
      document.getElementById('savedMsg').textContent = '✔ ' + msg;
      refreshSavedList();
    })
    .withFailureHandler(e => alert('削除エラー: ' + e.message))
    .deleteRouteState(name);
}

/* ==========================================================
 *  保存したルート表を2つ並べて比較表示
 * ========================================================== */
function compareRoutes() {
  const n1 = document.getElementById('savedSelect1').value;
  const n2 = document.getElementById('savedSelect2').value;
  if (!n1 || !n2) { alert('比較する2つのルート表を選択してください。'); return; }
  if (n1 === n2) { alert('異なる2つのルート表を選んでください。'); return; }

  const msg = document.getElementById('compareMsg');
  msg.textContent = '読み込み中...';
  google.script.run
    .withSuccessHandler(d1 => {
      google.script.run
        .withSuccessHandler(d2 => {
          msg.textContent = '';
          showCompare(n1, d1, n2, d2);
        })
        .withFailureHandler(e => { msg.textContent = ''; alert('読み込みエラー（' + n2 + '）: ' + e.message); })
        .loadRouteState(n2);
    })
    .withFailureHandler(e => { msg.textContent = ''; alert('読み込みエラー（' + n1 + '）: ' + e.message); })
    .loadRouteState(n1);
}

function renderCompareColumn(label, data) {
  let html = '<div style="border:1px solid var(--navy);border-radius:8px;padding:10px 12px">';
  html += '<div class="shift-result-title" style="margin-top:0">' + esc(label) + '</div>';
  html += '<div style="font-size:12px;color:#555;margin-bottom:8px">' +
    esc(data.date || '（日付未設定）') + '　配達者：' + esc(data.driver || '—') + '</div>';

  let any = false;
  ['AM', 'PM'].forEach(shift => {
    const r = data.results && data.results[shift];
    const stops = (data.stops && data.stops[shift]) || [];
    if (!stops.length && !r) return;
    any = true;
    const shiftLabel = shift === 'AM' ? 'AM便' : 'PM便';
    html += '<div style="font-weight:bold;color:var(--navy);margin:8px 0 4px">' + shiftLabel +
      (r ? '　｜　出発 ' + r.startTime + ' ／ 帰着予定 ' + r.backTime +
           '　｜　' + (r.totalKm != null ? r.totalKm + 'km' : '概算') + ' / ' + r.totalMin + '分'
         : '　（未計算）') + '</div>';
    html += '<table style="font-size:12px"><thead><tr>' +
      '<th style="width:26px">順</th><th>会社名</th><th style="width:60px">到着</th><th style="width:60px">出発</th>' +
      '</tr></thead><tbody>';
    const list = r ? r.schedule : stops.map((s, i) => ({ no: i + 1, name: s.name, arrive: '-', depart: '-' }));
    list.forEach(s => {
      html += '<tr><td style="text-align:center">' + s.no + '</td><td>' + esc(s.name) + '</td>' +
        '<td style="text-align:center">' + (s.arrive || '-') + '</td>' +
        '<td style="text-align:center">' + (s.depart || '-') + '</td></tr>';
    });
    html += '</tbody></table>';
  });
  if (!any) html += '<div style="color:#888">配達先が保存されていません</div>';

  if (data.results && data.results.AM && data.results.PM) {
    const bothKm = (data.results.AM.totalKm != null && data.results.PM.totalKm != null)
      ? Math.round((data.results.AM.totalKm + data.results.PM.totalKm) * 10) / 10 : null;
    const bothMin = data.results.AM.totalMin + data.results.PM.totalMin;
    html += '<div style="margin-top:8px;font-weight:bold;color:var(--navy)">AM＋PM合計　' +
      (bothKm != null ? bothKm + 'km' : '概算') + ' ／ ' + bothMin + '分</div>';
  }
  html += '</div>';
  return html;
}

function showCompare(name1, data1, name2, data2) {
  document.getElementById('compareLeft').innerHTML = renderCompareColumn(name1, data1);
  document.getElementById('compareRight').innerHTML = renderCompareColumn(name2, data2);
  document.getElementById('cmpNow').textContent = new Date().toLocaleString('ja-JP');
  compareFromCal = document.getElementById('pageCalendar').style.display !== 'none';
  document.getElementById('pageSelect').style.display = 'none';
  document.getElementById('pageResult').style.display = 'none';
  document.getElementById('pageCalendar').style.display = 'none';
  document.getElementById('pageCompare').style.display = 'block';
}

function backToSelectFromCompare() {
  document.getElementById('pageCompare').style.display = 'none';
  if (compareFromCal) { document.getElementById('pageCalendar').style.display = 'block'; return; }
  document.getElementById('pageSelect').style.display = 'block';
}

/* ==========================================================
 *  カレンダーで保存したルート表を選ぶ
 * ========================================================== */
let compareFromCal = false;
let calYear = 0, calMonth = 0;      // 表示中の年・月（月は0〜11）
let calSelKey = '';                 // 選んだ日 'yyyy-mm-dd'（日付なし一覧は 'nodate'）
let calPicked = [];                 // 比較に選んだ保存名
const CAL_COLORS = ['#0E7C7B', '#2a6fb0', '#8a5cb8', '#b07a1f', '#c0504d', '#3d8b3d', '#d06a9a', '#5f6b7a'];
const pad2 = n => String(n).padStart(2, '0');
const ymdKey = (y, m, d) => y + '-' + pad2(m + 1) + '-' + pad2(d);

/* 保存データの配達日（'2026-10-16' や '2026/10/16'）を 'yyyy-mm-dd' にそろえる */
function savedDateKey(o) {
  const m = String(o.date || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]) : '';
}
function driverColor(name) {
  const i = DRIVERS.indexOf(String(name || '').trim());
  return i >= 0 ? CAL_COLORS[i % CAL_COLORS.length] : '#8a93a2';
}
function calFiltered() {
  const dv = document.getElementById('calDriver').value;
  return SAVED_LIST.filter(o => !dv || String(o.driver).trim() === dv);
}

function openCalendar() {
  // 配達者の絞り込みプルダウン
  const dsel = document.getElementById('calDriver');
  const cur = dsel.value;
  dsel.innerHTML = '<option value="">全員</option>' + DRIVERS.map(n => '<option>' + esc(n) + '</option>').join('');
  dsel.value = cur;
  // 最初に表示する月：配達日の月
  const base = document.getElementById('deliveryDate').value || ymdKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [y, m] = base.split('-').map(Number);
  calYear = y; calMonth = m - 1;
  calSelKey = base;
  calPicked = [];
  document.getElementById('pageSelect').style.display = 'none';
  document.getElementById('pageCalendar').style.display = 'block';
  document.getElementById('calMsg').textContent = '読み込み中...';
  refreshSavedList(() => { document.getElementById('calMsg').textContent = ''; renderCalendar(); });
}
function closeCalendar() {
  document.getElementById('pageCalendar').style.display = 'none';
  document.getElementById('pageSelect').style.display = 'block';
}
function calMove(d) {
  calMonth += d;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function calToday() {
  const t = new Date();
  calYear = t.getFullYear(); calMonth = t.getMonth();
  calSelKey = ymdKey(calYear, calMonth, t.getDate());
  renderCalendar();
}
function calSelect(key) { calSelKey = key; renderCalendar(); }

function renderCalendar() {
  const list = calFiltered();
  const byDay = {};
  list.forEach(o => { const k = savedDateKey(o) || 'nodate'; (byDay[k] = byDay[k] || []).push(o); });
  // 同じ日の中は配達者の並び順 → 保存名の順
  Object.values(byDay).forEach(a => a.sort((x, y) =>
    (DRIVERS.indexOf(x.driver) - DRIVERS.indexOf(y.driver)) || String(x.name).localeCompare(String(y.name), 'ja')));

  document.getElementById('calYM').textContent = calYear + '年' + (calMonth + 1) + '月';
  const t = new Date();
  const todayKey = ymdKey(t.getFullYear(), t.getMonth(), t.getDate());
  const first = new Date(calYear, calMonth, 1);
  const start = new Date(calYear, calMonth, 1 - first.getDay());      // 日曜はじまり
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + lastDay) / 7);

  let h = ['日', '月', '火', '水', '木', '金', '土'].map((w, i) =>
    '<div class="cal-dow ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>').join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymdKey(d.getFullYear(), d.getMonth(), d.getDate());
    const items = byDay[key] || [];
    const cls = ['cal-day', d.getMonth() !== calMonth ? 'off' : '', key === todayKey ? 'today' : '',
                 key === calSelKey ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
    const seen = {};
    let chips = items.slice(0, 4).map(o => {
      const dn = String(o.driver || '').trim() || '配達者なし';
      seen[dn] = (seen[dn] || 0) + 1;
      const label = dn + (seen[dn] > 1 ? '②③④⑤'.charAt(seen[dn] - 2) : '');
      return '<div class="cal-chip" style="background:' + driverColor(o.driver) + '" title="' + esc(o.name) + '">' +
        '<span>' + esc(label) + '</span><span class="cnt">' + o.am + '/' + o.pm + '</span></div>';
    }).join('');
    if (items.length > 4) chips += '<div class="cal-more">＋' + (items.length - 4) + '件</div>';
    h += '<div class="' + cls + '" onclick="calSelect(\'' + key + '\')"><div class="dn">' + d.getDate() + '</div>' + chips + '</div>';
  }
  document.getElementById('calGrid').innerHTML = h;

  // 凡例
  const used = DRIVERS.filter(n => SAVED_LIST.some(o => String(o.driver).trim() === n));
  document.getElementById('calLegend').innerHTML = '配達者の色：' +
    used.map(n => '<span><span class="sw" style="background:' + driverColor(n) + '"></span>' + esc(n) + '</span>').join('') +
    '<span style="margin-left:auto">数字は <b>AM便の件数 / PM便の件数</b>（例：5/3）</span>';

  renderCalSide(byDay);
}

function renderCalSide(byDay) {
  const side = document.getElementById('calSide');
  let items, title;
  if (calSelKey === 'nodate') {
    items = byDay.nodate || [];
    title = '日付が入っていないルート表';
  } else {
    items = byDay[calSelKey] || [];
    const [y, m, d] = calSelKey.split('-').map(Number);
    const w = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
    title = m + '月' + d + '日(' + w + ') のルート表';
  }
  let h = '<div style="font-size:16px;font-weight:bold;color:var(--navy);margin-bottom:8px">' + esc(title) +
          '　<span style="color:var(--teal)">' + items.length + '件</span></div>';

  // 比較の選択状況
  h += '<div class="cmp-bar">';
  if (!calPicked.length) h += '「☑ 比較に選ぶ」で2件選ぶと、並べて見比べられます（別の日のものでも選べます）。';
  else {
    h += '比較に選択中：' + calPicked.map(n => '<b>' + esc(n) + '</b>').join(' と ') + '　';
    h += '<button class="btn small amber" ' + (calPicked.length === 2 ? '' : 'disabled') + ' onclick="calCompare()">🆚 並べて表示</button> ';
    h += '<button class="btn small gray" onclick="calPicked=[];renderCalendar()">選択を解除</button>';
  }
  h += '</div>';

  if (!items.length) {
    h += '<div style="color:#888;padding:10px 2px">この日に保存されたルート表はありません。</div>';
  }
  items.forEach(o => {
    const picked = calPicked.includes(o.name);
    h += '<div class="rcard' + (picked ? ' picked' : '') + '" style="border-left-color:' + driverColor(o.driver) + '">' +
      '<div class="t">' + esc(o.name) + '</div>' +
      '<div class="s">配達者：' + esc(o.driver || '—') +
        '　｜　<span class="counts">AM <b>' + o.am + '</b>件・PM <b>' + o.pm + '</b>件</span>' +
        '　｜　保存 ' + esc(o.saved) + '</div>' +
      '<button class="btn small" onclick="calLoad(this.dataset.n)" data-n="' + esc(o.name) + '">📂 呼出</button> ' +
      '<button class="btn small ' + (picked ? 'amber' : 'gray') + '" onclick="calPick(this.dataset.n)" data-n="' + esc(o.name) + '">' +
        (picked ? '✔ 比較に選択中' : '☑ 比較に選ぶ') + '</button>' +
      '</div>';
  });

  const nodate = (byDay.nodate || []).length;
  if (nodate && calSelKey !== 'nodate') {
    h += '<div style="margin-top:14px;font-size:12px;color:#555">📌 日付が入っていない古いルート表：' +
         '<a href="#" onclick="calSelect(\'nodate\');return false;">' + nodate + '件を表示</a></div>';
  }
  side.innerHTML = h;
}

function calPick(name) {
  const i = calPicked.indexOf(name);
  if (i >= 0) calPicked.splice(i, 1);
  else {
    if (calPicked.length >= 2) calPicked.shift();   // 3件目を選んだら古い方を外す
    calPicked.push(name);
  }
  renderCalendar();
}
function calCompare() {
  if (calPicked.length !== 2) return;
  document.getElementById('savedSelect1').value = calPicked[0];
  document.getElementById('savedSelect2').value = calPicked[1];
  compareRoutes();
}
function calLoad(name) {
  document.getElementById('savedSelect').value = name;
  loadSavedRoute();
}

/* ---------- ルート計算（AM→PM 連続） ---------- */
function buildStops(shift) {
  return selectedStops[shift].map(s => ({
    row: s.row, name: s.name, person: s.person, address: s.address, tel: s.tel,
    kind: s.kind, latlng: s.latlng, yoken: s.yoken, detail: s.detail, stay: s.stay
  }));
}

function calcBoth() {
  const skipAM = document.getElementById('skipAM').checked;
  const skipPM = document.getElementById('skipPM').checked;
  if (skipAM && skipPM) {
    alert('AM便・PM便のどちらも「配達なし」になっています。少なくとも一方を選択してください。');
    return;
  }
  const stopsAM = skipAM ? [] : buildStops('AM');
  const stopsPM = skipPM ? [] : buildStops('PM');
  if (!skipAM && stopsAM.length === 0) {
    alert('AM便の配達先が選択されていません。配達先を選ぶか、「この便は配達なし」にチェックしてください。');
    return;
  }
  if (!skipPM && stopsPM.length === 0) {
    alert('PM便の配達先が選択されていません。配達先を選ぶか、「この便は配達なし」にチェックしてください。');
    return;
  }
  if (!document.getElementById('driver').value) {
    if (!confirm('配達者が選択されていません。\nこのまま計算を進めますか？')) return;
  }
  const optimize = document.getElementById('optimizeOnCalc').checked;

  const btn = document.getElementById('btnCalc');
  btn.disabled = true; btn.textContent = '計算中...';

  // 会社ごとの入力内容を自動記憶（次回「＋追加」時の要件・詳細の初期値になる）
  const entries = stopsAM.concat(stopsPM).map(s => ({ row: s.row, name: s.name, yoken: s.yoken, detail: s.detail, stay: s.stay }));
  if (entries.length) {
    entries.forEach(e => { companyDefaults['n:' + e.name] = { yoken: e.yoken, detail: e.detail, stay: e.stay }; });
    google.script.run.saveCompanyDefaults(entries);
  }

  const basePayload = {
    date: document.getElementById('deliveryDate').value,
    driver: document.getElementById('driver').value,
    driverEmail: document.getElementById('driver').selectedOptions[0]?.dataset.email || ''
  };

  function runShift(shift, stops, startTime, cb) {
    if (!stops.length) { cb(null); return; }
    google.script.run
      .withSuccessHandler(r => cb(r))
      .withFailureHandler(e => { alert(shift + '便の計算エラー: ' + e.message); cb(null); })
      .calcRoute(Object.assign({}, basePayload, {
        shift: shift, startTime: startTime, stops: stops, optimize: optimize,
        avoidHighways: document.getElementById('avoidHighways' + shift).checked
      }));
  }

  runShift('AM', stopsAM, document.getElementById('startAM').value || '09:00', rAM => {
    runShift('PM', stopsPM, document.getElementById('startPM').value || '13:00', rPM => {
      btn.disabled = false; btn.textContent = 'ルート計算 ▶（AM＋PM）';
      if (!rAM && !rPM) { alert('ルートを計算できませんでした。'); return; }
      showResults({ AM: rAM, PM: rPM });
      if (loadedName) markDirty();   // 呼び出したルート表を計算し直した＝未保存の変更
    });
  });
}

/* ---------- 結果表示 ---------- */
function showResults(results) {
  RESULTS = results;
  const any = results.AM || results.PM;
  document.getElementById('rDate').textContent = any ? any.date : '';
  document.getElementById('rDriver').textContent = (any && any.driver) || '　　　';
  document.getElementById('rNow').textContent = new Date().toLocaleString('ja-JP');

  renderShiftBlock('AM');
  renderShiftBlock('PM');
  updateGrandTotal();
  // 結果の順番・内容を選択済みリストにも反映（戻って編集・保存しても順番が崩れないように）
  syncStopsFromResults('AM');
  syncStopsFromResults('PM');

  document.getElementById('pageSelect').style.display = 'none';
  document.getElementById('pageCalendar').style.display = 'none';
  document.getElementById('pageResult').style.display = 'block';
  document.getElementById('saveMsg').textContent = '';
  updateRestoreNote();
}

function renderShiftBlock(shift) {
  const r = RESULTS[shift];
  const blockEl = document.getElementById('block' + shift);
  const linksEl = document.getElementById('rLinks' + shift);
  const noteEl = document.getElementById('optNote' + shift);
  const editEl = document.getElementById('edit' + shift);
  const shiftLabel = shift === 'AM' ? 'AM便' : 'PM便';

  if (!r) {
    // 便が空でも、編集モード中は追加できるように見出しを出す
    blockEl.innerHTML = reorderMode
      ? '<div class="shift-result-title noprint">' + shiftLabel + '　（配達先なし）</div>' : '';
    linksEl.innerHTML = '';
    noteEl.style.display = 'none';
  } else {
    if (r.optimized && !r.reason) {
      noteEl.style.display = 'none';
    } else {
      noteEl.style.display = 'block';
      noteEl.textContent = '⚠ [' + shift + '便] ' + (r.reason || '最適化に失敗しました') +
        (r.optimized ? '' : '（選択順・移動15分の概算で表示中）');
    }
    blockEl.innerHTML = renderShiftTable(shift, r);
    linksEl.innerHTML = '<b>' + shift + '便: </b>' + r.links.map(l =>
      '<a class="maplink btn" style="text-decoration:none" href="' + l.url + '" target="_blank">🗺 ' + esc(l.label) + '</a>'
    ).join('');
  }
  editEl.innerHTML = reorderMode ? renderAddBar(shift) : '';
}

function updateGrandTotal() {
  const gt = document.getElementById('rGrandTotal');
  if (RESULTS.AM && RESULTS.PM) {
    const bothKm = (RESULTS.AM.totalKm != null && RESULTS.PM.totalKm != null)
      ? Math.round((RESULTS.AM.totalKm + RESULTS.PM.totalKm) * 10) / 10 : null;
    const bothMin = RESULTS.AM.totalMin + RESULTS.PM.totalMin;
    gt.style.display = 'block';
    gt.textContent = 'AM＋PM合計　総距離 ' + (bothKm != null ? bothKm + 'km' : '概算') +
      ' ／ 総時間 ' + bothMin + '分（' + Math.floor(bothMin / 60) + '時間' + (bothMin % 60) + '分）';
  } else {
    gt.style.display = 'none';
  }
}

function updateScheduleDetail(shift, idx, value) {
  RESULTS[shift].schedule[idx].detail = value;
  syncStopsFromResults(shift);
  markDirty();
}

function renderShiftTable(shift, r) {
  const shiftLabel = shift === 'AM' ? 'AM便' : 'PM便';
  let html = '<div class="shift-result-title">' + shiftLabel +
    '　出発 ' + r.startTime + ' ／ 帰着予定 ' + r.backTime +
    '　｜　総距離 ' + (r.totalKm != null ? r.totalKm + 'km' : '概算') +
    ' ／ 総時間 ' + r.totalMin + '分' +
    (r.avoidHighways ? '　｜　🛣️ 高速道路を使わないルート' : '') + '</div>';
  html += '<table><thead><tr><th class="col-jun">順</th><th class="col-co">会社名</th><th class="col-yoken">要件</th>' +
    '<th class="col-seki">積込</th><th class="col-detail">詳細</th>' +
    '<th class="print-hide">住所</th><th class="print-hide">電話番号</th><th class="print-hide">移動</th>' +
    '<th class="print-hide">到着</th><th class="print-hide">出発</th>' +
    '<th class="col-sumi">済</th>' +
    (reorderMode ? '<th class="noprint">編集</th>' : '') +
    '</tr></thead><tbody>';

  const last = r.schedule.length - 1;
  r.schedule.forEach((s, idx) => {
    (s.breaksCrossed || []).forEach(label => {
      html += '<tr class="lunch-row"><td colspan="12">―― ' + esc(label) + ' ――</td></tr>';
    });
    html += '<tr><td style="text-align:center">' + s.no + '</td>' +
      '<td><b>' + esc(s.name) + '</b><div style="font-size:11px;color:#888">' + esc(s.person) + '</div></td>' +
      '<td style="white-space:nowrap">' + esc(s.yoken) + '</td>' +
      '<td style="text-align:center"><span class="chk"></span></td>' +
      '<td class="detail-cell"><input type="text" class="detail-edit" value="' + esc(s.detail) +
        '" style="border:none;background:transparent;width:100%;font-family:inherit;font-size:inherit;padding:2px" ' +
        'onchange="updateScheduleDetail(\'' + shift + '\',' + idx + ',this.value)"></td>' +
      '<td class="print-hide" style="font-size:12px">' + esc(s.address) + '</td>' +
      '<td class="print-hide" style="white-space:nowrap">' + esc(s.tel) + '</td>' +
      '<td class="print-hide" style="text-align:right;white-space:nowrap">' +
        (s.travelKm != null ? s.travelKm + 'km / ' : '約') + s.travelMin + '分</td>' +
      '<td class="print-hide" style="text-align:center"><b>' + s.arrive + '</b></td>' +
      '<td class="print-hide" style="text-align:center">' + s.depart + '</td>' +
      '<td style="text-align:center"><span class="chk"></span></td>';
    if (reorderMode) {
      html += '<td class="noprint" style="text-align:center;white-space:nowrap">' +
        '<button type="button" class="edit-btn" title="上へ" onclick="moveStop(\'' + shift + '\',' + idx + ',-1)"' +
          (idx === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="edit-btn" title="下へ" onclick="moveStop(\'' + shift + '\',' + idx + ',1)"' +
          (idx === last ? ' disabled' : '') + '>▼</button>' +
        '<button type="button" class="del-btn" title="この配達先を削除" onclick="removeFromResult(\'' + shift + '\',' + idx + ')">×</button>' +
      '</td>';
    }
    html += '</tr>';
  });
  html += '<tr class="print-hide-row" style="background:#f4f6f9"><td colspan="7" style="text-align:right;color:#555">▶ 会社帰着</td>' +
    '<td style="text-align:right;white-space:nowrap;color:#555">' +
      (r.lastLegKm != null ? r.lastLegKm + 'km / ' : '約') + r.lastLegMin + '分</td>' +
    '<td style="text-align:center;font-weight:bold" colspan="3">' + r.backTime + '</td>' +
    (reorderMode ? '<td class="noprint"></td>' : '') + '</tr>';
  html += '</tbody></table>';
  return html;
}

function backToSelect() {
  document.getElementById('pageResult').style.display = 'none';
  document.getElementById('pageSelect').style.display = 'block';
  reorderMode = false;
  document.getElementById('btnReorder').textContent = '✏ ルートを編集';
}

/* ==========================================================
 *  結果画面でのルート編集（並べ替え・削除・追加）
 * ========================================================== */
function toggleReorder() {
  if (busy) return;
  reorderMode = !reorderMode;
  document.getElementById('btnReorder').textContent = reorderMode ? '✅ 編集終了' : '✏ ルートを編集';
  renderShiftBlock('AM');
  renderShiftBlock('PM');
}

/* 便の追加欄 */
function renderAddBar(shift) {
  const r = RESULTS[shift];
  const shiftLabel = shift === 'AM' ? 'AM便' : 'PM便';
  const opts = sortedClients().map(o =>
    '<option value="' + o.i + '">' + esc(o.c.name) + (o.c.kind === '2' ? '（外注）' : '') + '</option>'
  ).join('');
  return '<div class="edit-bar noprint">' +
    '<b style="color:var(--navy)">＋ ' + shiftLabel + 'に追加：</b>' +
    '<select id="addCo-' + shift + '" onchange="onAddCompanyChange(\'' + shift + '\')">' +
      '<option value="">— 取引先を選択 —</option>' + opts + '</select>' +
    '<select id="addYoken-' + shift + '">' +
      YOKEN_OPTS.map(o => '<option>' + o + '</option>').join('') + '</select>' +
    '<input type="text" id="addDetail-' + shift + '" list="addHist-' + shift + '" ' +
      'placeholder="詳細（品番・メモ）" style="width:220px">' +
    '<datalist id="addHist-' + shift + '"></datalist>' +
    '<span>滞在 <input type="number" id="addStay-' + shift + '" class="stay-in" min="0" value="10"> 分</span>' +
    '<button type="button" class="btn small" onclick="addStopToResult(\'' + shift + '\')">＋ 末尾に追加</button>' +
    (r && r.schedule.length > 1
      ? '<button type="button" class="btn small amber" onclick="reoptimize(\'' + shift + '\')" ' +
        'title="この便の訪問順を自動で最適化し直します">⚡ 順番を最適化し直す</button>'
      : '') +
  '</div>';
}

/* 追加欄で会社を選んだら、前回の入力内容・滞在時間・履歴候補をセット */
function onAddCompanyChange(shift) {
  const v = document.getElementById('addCo-' + shift).value;
  if (v === '') return;
  const c = CLIENTS[Number(v)];
  const def = defOf(c);
  document.getElementById('addYoken-' + shift).value = (def && def.yoken) || '納品';
  document.getElementById('addDetail-' + shift).value = (def && def.detail) || '';
  document.getElementById('addStay-' + shift).value = c.stay;
  document.getElementById('addHist-' + shift).innerHTML =
    (historyDetails[c.name] || []).map(d => '<option value="' + esc(d) + '">').join('');
}

/* 現在の結果（表示順）から計算用の配達先リストを作る */
function currentStops(shift) {
  const r = RESULTS[shift];
  if (!r) return [];
  return r.schedule.map(s => {
    const ci = findClientIdx(s); const c = ci >= 0 ? CLIENTS[ci] : null;
    return {
      row: s.row, latlng: s.latlng, name: s.name, person: s.person,
      address: s.address, tel: s.tel, kind: s.kind || (c ? c.kind : '1'),
      yoken: s.yoken, detail: s.detail, stay: s.stay
    };
  });
}

function moveStop(shift, idx, dir) {
  if (busy) return;
  const stops = currentStops(shift);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= stops.length) return;
  [stops[idx], stops[newIdx]] = [stops[newIdx], stops[idx]];
  recalcShift(shift, stops, false);
}

function removeFromResult(shift, idx) {
  if (busy) return;
  const stops = currentStops(shift);
  const target = stops[idx];
  if (!target) return;
  if (!confirm('「' + target.name + '」（' + target.yoken + '）を' + shift + '便から削除します。よろしいですか？')) return;
  stops.splice(idx, 1);
  recalcShift(shift, stops, false);
}

function addStopToResult(shift) {
  if (busy) return;
  const v = document.getElementById('addCo-' + shift).value;
  if (v === '') { alert('追加する取引先を選択してください。'); return; }
  const c = CLIENTS[Number(v)];
  const stop = {
    row: c.row, name: c.name, person: c.person, address: c.address, tel: c.tel,
    kind: c.kind, latlng: c.latlng,
    yoken: document.getElementById('addYoken-' + shift).value || '納品',
    detail: document.getElementById('addDetail-' + shift).value.trim(),
    stay: Number(document.getElementById('addStay-' + shift).value) || 0
  };
  // 入力内容を会社ごとの初期値として記憶
  companyDefaults['n:' + c.name] = { yoken: stop.yoken, detail: stop.detail, stay: stop.stay };
  google.script.run.saveCompanyDefaults([{ row: c.row, name: c.name, yoken: stop.yoken, detail: stop.detail, stay: stop.stay }]);

  recalcShift(shift, currentStops(shift).concat([stop]), false);
}

function reoptimize(shift) {
  if (busy) return;
  if (!confirm(shift + '便の訪問順を自動で最適化し直します。\n手で並べた順番は変わります。よろしいですか？')) return;
  recalcShift(shift, currentStops(shift), true);
}

function setBusy(on, msg) {
  busy = on;
  document.getElementById('busyMsg').textContent = on ? (msg || '再計算中...') : '';
  ['btnReorder', 'btnSaveRoute', 'btnSave', 'btnMail'].forEach(id => {
    document.getElementById(id).disabled = on;
  });
}

/* 指定の便を、渡した順番（optimize=trueなら最適化）で再計算 */
function recalcShift(shift, stops, optimize) {
  if (!stops.length) {
    // 最後の1件を削除した → この便は配達なし
    RESULTS[shift] = null;
    afterShiftChanged(shift);
    return;
  }
  const r0 = RESULTS[shift];
  const other = RESULTS[shift === 'AM' ? 'PM' : 'AM'];
  const ref = r0 || other;
  const driverSel = document.getElementById('driver');
  const payload = {
    date: ref ? ref.dateRaw : document.getElementById('deliveryDate').value,
    startTime: r0 ? r0.startTime
                  : (document.getElementById('start' + shift).value || (shift === 'AM' ? '09:00' : '13:00')),
    shift: shift,
    driver: ref ? ref.driver : driverSel.value,
    driverEmail: ref ? ref.driverEmail : (driverSel.selectedOptions[0]?.dataset.email || ''),
    avoidHighways: r0 ? r0.avoidHighways : document.getElementById('avoidHighways' + shift).checked,
    optimize: optimize,
    stops: stops
  };
  setBusy(true, shift + '便を再計算中...');
  google.script.run
    .withSuccessHandler(r => {
      RESULTS[shift] = r;
      setBusy(false);
      afterShiftChanged(shift);
    })
    .withFailureHandler(e => {
      setBusy(false);
      alert('再計算エラー: ' + e.message);
    })
    .calcRoute(payload);
}

function afterShiftChanged(shift) {
  renderShiftBlock(shift);
  updateGrandTotal();
  syncStopsFromResults(shift);
  markDirty();
}

/* 結果の内容（順番・要件・詳細・滞在）を選択済みリストへ反映 */
function syncStopsFromResults(shift) {
  const r = RESULTS[shift];
  selectedStops[shift] = r ? r.schedule.map(s => {
    const idx = findClientIdx(s);
    const c = idx >= 0 ? CLIENTS[idx] : null;
    return {
      uid: 'u' + (uidCounter++), i: idx, row: c ? c.row : s.row, name: s.name, person: s.person,
      address: s.address, tel: s.tel, kind: s.kind || (c ? c.kind : '1'),
      latlng: s.latlng || '', yoken: s.yoken, detail: s.detail, stay: s.stay
    };
  }) : [];

  // 便の設定も結果に合わせる
  document.getElementById('skip' + shift).checked = !r;
  toggleSkip(shift);
  if (r) {
    if (r.startTime) document.getElementById('start' + shift).value = r.startTime;
    document.getElementById('avoidHighways' + shift).checked = !!r.avoidHighways;
  }

  renderSelected(shift);
  updateCount(shift);
  refreshAllBadges(shift);
  if (currentGyo[shift] === 'sel') applyGyo(shift);
}

/* ---------- 印刷 ---------- */
function printFull() {
  document.body.classList.remove('print-mode-delivery');
  document.getElementById('pageSizeStyle').textContent = '@page { size: A4 landscape; margin: 10mm; }';
  window.print();
}
function printDelivery() {
  document.body.classList.add('print-mode-delivery');
  document.getElementById('pageSizeStyle').textContent = '@page { size: A4 portrait; margin: 10mm 8mm; }';
  window.print();
}

/* ---------- 履歴シートへの保存・メール送信（AM/PM両方を処理） ---------- */
function save() {
  const shifts = ['AM', 'PM'].filter(s => RESULTS[s]);
  if (!shifts.length) return;
  const btn = document.getElementById('btnSave');
  btn.disabled = true;
  let remaining = shifts.length, msgs = [];
  shifts.forEach(s => {
    RESULTS[s].schedule.forEach(entry => {
      if (!entry.detail) return;
      if (!historyDetails[entry.name]) historyDetails[entry.name] = [];
      const arr = historyDetails[entry.name];
      const p = arr.indexOf(entry.detail);
      if (p !== -1) arr.splice(p, 1);
      arr.unshift(entry.detail);
      if (arr.length > 8) arr.length = 8;
    });
    google.script.run
      .withSuccessHandler(msg => {
        msgs.push(msg); remaining--;
        if (remaining === 0) { document.getElementById('saveMsg').textContent = '✔ ' + msgs.join(' / '); btn.disabled = false; }
      })
      .withFailureHandler(e => { alert('保存エラー(' + s + '便): ' + e.message); btn.disabled = false; })
      .saveHistory(RESULTS[s]);
  });
}

function sendMail() {
  const shifts = ['AM', 'PM'].filter(s => RESULTS[s]);
  if (!shifts.length) return;
  const email = RESULTS[shifts[0]].driverEmail;
  if (!email) {
    alert('配達者のメールアドレスが未設定です。\n選択画面で配達者を選んでから計算し直すか、\n「取引先の管理」→「配達者の管理」でメールアドレスを確認してください。');
    return;
  }
  const driver = RESULTS[shifts[0]].driver;
  if (!confirm(driver + 'さん（' + email + '）へ\n' + shifts.map(s => s + '便').join('・') +
               'のルート表のメールを作成します（メールソフトが開きます）。よろしいですか？')) return;
  const btn = document.getElementById('btnMail');
  btn.disabled = true; btn.textContent = '送信中...';
  let remaining = shifts.length, msgs = [];
  shifts.forEach(s => {
    google.script.run
      .withSuccessHandler(msg => {
        msgs.push(msg); remaining--;
        if (remaining === 0) {
          document.getElementById('saveMsg').textContent = '✔ ' + msgs.join(' / ');
          btn.disabled = false; btn.textContent = '📧 配達者へ送信';
        }
      })
      .withFailureHandler(e => {
        alert('送信エラー(' + s + '便): ' + e.message);
        btn.disabled = false; btn.textContent = '📧 配達者へ送信';
      })
      .sendToDriver(RESULTS[s]);
  });
}

/* ---------- 終了（取引先一覧シートに戻る） ---------- */
function closeApp() {
  if (dirty && !confirm('保存していない変更があります。終了してよろしいですか？')) return;
  google.script.run
    .withSuccessHandler(() => google.script.host.close())
    .withFailureHandler(() => google.script.host.close())
    .activateClientSheet();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
</script>
</body>
</html>`;
