// 取引先の管理の画面。元の Apps Script「clients.html」をそのまま使う。
// 変えたのは、ポータル用の見出し、シートの「行」を「No.」にした表記、削除の説明、配達者の管理(元は配達者リストシートを直接編集)の追加だけ。
// サーバーの呼び出し(google.script.run)は ui/shim.ts が /apps/haisou/api に置き換える。
// 注意: この文字列の中では、バッククォートと「$」+「{」を使わない(String.raw のテンプレートのため)。
export const CLIENTS_HTML = String.raw`<!DOCTYPE html>
<html>
<head>
<base target="_top">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>取引先の管理 | LONG PORTAL</title>
<style>
  :root { --navy:#1F3A5F; --teal:#0E7C7B; --amber:#E8A33D; --red:#C0504D; }
  * { box-sizing:border-box; font-family:'Noto Sans CJK JP','Yu Gothic UI','Meiryo UI',sans-serif; }
  body { margin:0; padding:16px 16px 0; color:#222; font-size:14px; }
  h2 { color:var(--navy); margin:0 0 10px; font-size:18px; }
  .bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
         background:#f4f6f9; border:1px solid #d8dee8; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
  .bar label { font-weight:bold; color:var(--navy); }
  input[type=text], input[type=number], input[type=search], select {
    font-size:14px; padding:6px 8px; border:1px solid #b9c3d0; border-radius:5px; }
  input:focus, select:focus { outline:2px solid #9fd3d2; border-color:var(--teal); }
  .btn { background:var(--teal); color:#fff; border:none; border-radius:6px;
         padding:9px 20px; font-size:14px; cursor:pointer; white-space:nowrap; }
  .btn.gray { background:#8a93a2; }
  .btn.amber { background:var(--amber); }
  .btn.red { background:var(--red); }
  .btn.small { padding:5px 11px; font-size:13px; }
  .btn:disabled { background:#bbb; cursor:default; }
  .gyo-bar { display:flex; flex-wrap:wrap; gap:4px; }
  .gyo-bar button { padding:4px 9px; border:1px solid var(--navy); background:#fff;
                    color:var(--navy); border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; }
  .gyo-bar button.on { background:var(--navy); color:#fff; }
  .tablewrap { max-height:calc(100vh - 215px); overflow:auto; border:1px solid #c9d2de; border-radius:6px; }
  table { border-collapse:collapse; width:100%; }
  th, td { border-bottom:1px solid #dde3ea; padding:6px 8px; text-align:left; vertical-align:middle; }
  th { background:var(--navy); color:#fff; font-weight:normal; white-space:nowrap; position:sticky; top:0; z-index:1; }
  tbody tr:hover { background:#f6f9fc; }
  tr.flash { animation:flash 2.4s ease-out; }
  @keyframes flash { 0%,40% { background:#fff1c9; } 100% { background:transparent; } }
  .tag { font-size:11px; border-radius:4px; padding:1px 6px; color:#fff; white-space:nowrap; }
  .tag.k1 { background:var(--teal); }
  .tag.k2 { background:#8a93a2; }
  .pin { color:var(--teal); font-size:12px; white-space:nowrap; }
  .sub { font-size:11px; color:#888; }
  .num { text-align:right; }
  .foot { position:sticky; bottom:0; background:#fff; padding:10px 0 12px; margin-top:10px;
          border-top:2px solid var(--navy); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  #msg { font-weight:bold; }
  #msg.ok { color:var(--teal); }
  #msg.ng { color:var(--red); }

  /* 入力画面・確認画面（画面の上に重ねて表示） */
  .overlay { position:fixed; inset:0; background:rgba(20,30,45,.45); display:none;
             align-items:flex-start; justify-content:center; padding-top:30px; z-index:10; }
  .overlay.show { display:flex; }
  .panel { background:#fff; border-radius:10px; width:820px; max-width:96vw; max-height:92vh; overflow:auto;
           box-shadow:0 10px 40px rgba(0,0,0,.3); }
  .panel-head { background:var(--navy); color:#fff; padding:12px 18px; font-size:16px; font-weight:bold;
                border-radius:10px 10px 0 0; }
  .panel-head.red { background:var(--red); }
  .panel-body { padding:16px 20px; }
  .form-grid { display:grid; grid-template-columns:150px 1fr; gap:10px 14px; align-items:center; }
  .form-grid .lbl { font-weight:bold; color:var(--navy); text-align:right; }
  .req { color:var(--red); font-size:12px; margin-left:3px; }
  .hint { font-size:12px; color:#777; margin-top:3px; }
  .warn { font-size:12px; color:#a56a00; margin-top:3px; }
  .err { color:var(--red); font-size:12px; margin-top:3px; }
  .w-full { width:100%; }
  .row-inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .radio-group label { margin-right:18px; cursor:pointer; font-weight:normal; color:#222; }
  .geo-box { margin-top:6px; padding:8px 12px; border-radius:6px; font-size:13px; display:none; }
  .geo-box.ok { display:block; background:#eaf5f4; border:1px solid #9fd3d2; }
  .geo-box.ng { display:block; background:#fdf3e0; border:1px solid var(--amber); }
  .panel-foot { display:flex; gap:10px; justify-content:flex-end; padding:12px 20px 16px;
                border-top:1px solid #e3e8ef; }
  .sep { grid-column:1 / -1; border-top:1px dashed #c9d2de; margin:4px 0; }
  .del-info { background:#fbeeee; border:1px solid #e6b8b7; border-radius:6px; padding:10px 14px; margin:10px 0; line-height:1.7; }
  .drv-table td { border:1px solid #dde3ea; }
  .drv-table input[type=text] { width:100%; }
</style>
</head>
<body>

<h2>🏢 取引先の管理（追加・変更・削除）</h2>

<div class="bar">
  <button class="btn" onclick="openForm(null)">＋ 新しい取引先を追加</button>
  <input type="search" id="q" placeholder="🔍 会社名・フリガナ・住所・担当者で探す" style="width:300px" oninput="render()">
  <select id="kindFilter" onchange="render()">
    <option value="">受注先・外注先 すべて</option>
    <option value="1">受注先だけ</option>
    <option value="2">外注先だけ</option>
  </select>
  <span>表示中 <b id="cnt">0</b> 件 ／ 全 <b id="total">0</b> 件</span>
  <button class="btn small gray" onclick="load()" title="読み込み直す">🔄 読み込み直す</button>
  <button class="btn small amber" onclick="openDrivers()" style="margin-left:auto">👤 配達者の管理</button>
</div>
<div class="bar" style="padding:6px 14px">
  <div class="gyo-bar" id="gyoBar"></div>
</div>

<div class="tablewrap">
  <table>
    <thead><tr>
      <th style="width:52px">No.</th><th>会社名</th><th>フリガナ</th><th>担当者</th><th>住所</th>
      <th>電話番号</th><th>区分</th><th class="num">滞在</th><th>位置</th><th style="width:150px">操作</th>
    </tr></thead>
    <tbody id="tbody"><tr><td colspan="10" style="color:#888;padding:20px">読み込み中...</td></tr></tbody>
  </table>
</div>

<div class="foot">
  <button class="btn gray" onclick="closeApp()">✖ 閉じる</button>
  <button class="btn amber" onclick="openRoute()">🚚 ルート作成を開く</button>
  <span id="msg"></span>
</div>

<!-- ===== 追加・変更の入力画面 ===== -->
<div class="overlay" id="formOverlay">
  <div class="panel">
    <div class="panel-head" id="formTitle">新しい取引先を追加</div>
    <div class="panel-body">
      <div class="form-grid">
        <div class="lbl">会社名<span class="req">必須</span></div>
        <div>
          <input type="text" id="f_name" class="w-full" placeholder="例：京町産業車輛（第2工場）" oninput="checkName()">
          <div class="err" id="e_name"></div>
          <div class="warn" id="w_name"></div>
        </div>

        <div class="lbl">フリガナ</div>
        <div>
          <input type="text" id="f_kana" class="w-full" placeholder="例：キョウマチ" onblur="fixKana()">
          <div class="hint">カタカナで入力（ひらがなで入れても自動でカタカナに直します）。ルート作成画面の「ア行」「カ行」…の分け方と並び順に使います。</div>
        </div>

        <div class="lbl">担当者</div>
        <div><input type="text" id="f_person" style="width:260px" placeholder="例：工場長"></div>

        <div class="lbl">住所</div>
        <div>
          <div class="row-inline">
            <input type="text" id="f_address" style="flex:1;min-width:300px" placeholder="例：金沢市京町10-30" oninput="clearGeo()">
            <button type="button" class="btn small" onclick="checkAddress()" id="btnGeo">📍 地図で確認</button>
          </div>
          <div class="hint">ルートの計算に使います。番地まで正確に入れてください。</div>
          <div class="geo-box" id="geoBox"></div>
        </div>

        <div class="lbl">電話番号</div>
        <div><input type="text" id="f_tel" style="width:220px" placeholder="例：076-251-0111" onblur="fixTel()"></div>

        <div class="lbl">区分</div>
        <div class="radio-group">
          <label><input type="radio" name="f_kind" value="1" checked> 受注先（1）</label>
          <label><input type="radio" name="f_kind" value="2"> 外注先（2）</label>
        </div>

        <div class="lbl">滞在時間</div>
        <div class="row-inline">
          <input type="number" id="f_stay" min="0" step="5" style="width:90px" placeholder="10"> 分
          <span class="hint" style="margin:0">（空欄なら10分として計算します）</span>
        </div>

        <div class="sep"></div>

        <div class="lbl">緯度・経度<br><span style="font-weight:normal;font-size:11px;color:#888">なくてもよい</span></div>
        <div>
          <div class="row-inline">
            緯度 <input type="text" id="f_lat" style="width:130px" placeholder="36.637632">
            経度 <input type="text" id="f_lng" style="width:130px" placeholder="136.661719">
            <a href="#" id="latlngMap" target="_blank" style="display:none">🗺 この位置を地図で見る</a>
          </div>
          <div class="hint">住所で場所がずれるときだけ入れます。入れると住所より優先されます。<br>
            調べ方：Googleマップで場所を右クリック → いちばん上の数字（前が緯度、後が経度）をクリックするとコピーされます。</div>
        </div>
      </div>
      <div class="err" id="e_form" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel-foot">
      <button class="btn gray" onclick="closeForm()">キャンセル</button>
      <button class="btn" id="btnSaveForm" onclick="submitForm(false)">💾 保存</button>
    </div>
  </div>
</div>

<!-- ===== 削除の確認画面 ===== -->
<div class="overlay" id="delOverlay">
  <div class="panel" style="width:560px">
    <div class="panel-head red">取引先を削除します</div>
    <div class="panel-body">
      <div>次の取引先を<b>取引先一覧から削除</b>します。</div>
      <div class="del-info" id="delInfo"></div>
      <div style="font-size:13px;line-height:1.7">
        ・保存済みのルート表や配達履歴は、そのまま残ります。<br>
        ・間違えて削除したときは、システムの管理者に連絡してください（データは残してあるので戻せます）。
      </div>
    </div>
    <div class="panel-foot">
      <button class="btn gray" onclick="closeDel()">キャンセル</button>
      <button class="btn red" id="btnDoDel" onclick="doDelete()">🗑 削除する</button>
    </div>
  </div>
</div>

<!-- ===== 配達者の管理（元は「配達者リスト」シートを直接編集していた） ===== -->
<div class="overlay" id="drvOverlay">
  <div class="panel" style="width:720px">
    <div class="panel-head">👤 配達者の管理</div>
    <div class="panel-body">
      <div class="hint" style="margin:0 0 10px">ルート作成画面の「配達者」の選択肢です。メールアドレスは「📧 配達者へ送信」の宛先になります。上から順に、カレンダーの色が決まります。</div>
      <table class="drv-table">
        <thead><tr><th style="width:70px">順番</th><th>名前</th><th>メールアドレス</th><th style="width:170px">操作</th></tr></thead>
        <tbody id="drvBody"><tr><td colspan="4" style="color:#888;padding:14px">読み込み中...</td></tr></tbody>
        <tfoot><tr>
          <td style="color:#888;font-size:12px">新規</td>
          <td><input type="text" id="d_name" placeholder="例：竹下"></td>
          <td><input type="text" id="d_email" placeholder="例：name@example.com"></td>
          <td><button class="btn small" onclick="addDriver()">＋ 追加</button></td>
        </tr></tfoot>
      </table>
      <div class="err" id="e_drv" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel-foot">
      <button class="btn gray" onclick="closeDrivers()">閉じる</button>
    </div>
  </div>
</div>

<script>
let LIST = [];
let editing = null;          // 変更中の取引先（追加のときは null）
let deleting = null;
let curGyo = 'all';
let flashRow = 0;

const GYO_LABEL = { all:'すべて','あ':'ア行','か':'カ行','さ':'サ行','た':'タ行','な':'ナ行',
                    'は':'ハ行','ま':'マ行','や':'ヤ行','ら':'ラ行','わ':'ワ行','英':'英数・未入力' };
const GYO_ORDER = ['あ','か','さ','た','な','は','ま','や','ら','わ','英'];

/* ---------- 文字の整形 ---------- */
function toKatakana(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)).trim();
}
function toHiragana(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function gyoOf(c) {
  const base0 = toHiragana(c.kana || '').charAt(0);
  const base = { 'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','っ':'つ','ゃ':'や','ゅ':'ゆ','ょ':'よ',
    'が':'か','ぎ':'き','ぐ':'く','げ':'け','ご':'こ','ざ':'さ','じ':'し','ず':'す','ぜ':'せ','ぞ':'そ',
    'だ':'た','ぢ':'ち','づ':'つ','で':'て','ど':'と','ば':'は','び':'ひ','ぶ':'ふ','べ':'へ','ぼ':'ほ',
    'ぱ':'は','ぴ':'ひ','ぷ':'ふ','ぺ':'へ','ぽ':'ほ','ゔ':'う' }[base0] || base0;
  const rows = { 'あ':'あいうえお','か':'かきくけこ','さ':'さしすせそ','た':'たちつてと',
    'な':'なにぬねの','は':'はひふへほ','ま':'まみむめも','や':'やゆよ','ら':'らりるれろ','わ':'わをん' };
  for (const g in rows) if (base && rows[g].includes(base)) return g;
  return '英';
}
function fixKana() { const el = document.getElementById('f_kana'); el.value = toKatakana(el.value); }
function fixTel() {
  const el = document.getElementById('f_tel');
  el.value = el.value.normalize('NFKC').replace(/[ー－‐−–—―]/g, '-').replace(/\s+/g, '').trim();
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function showMsg(text, ok) {
  const m = document.getElementById('msg');
  m.textContent = text; m.className = ok ? 'ok' : 'ng';
}

/* ---------- 一覧 ---------- */
function load(after) {
  google.script.run
    .withSuccessHandler(list => {
      LIST = list || [];
      document.getElementById('total').textContent = LIST.length;
      buildGyoBar();
      render();
      if (after) after();
    })
    .withFailureHandler(e => {
      document.getElementById('tbody').innerHTML =
        '<tr><td colspan="10" style="color:#C0504D;padding:20px">読み込みエラー: ' + esc(e.message) + '</td></tr>';
    })
    .cmListClients();
}

function buildGyoBar() {
  const counts = {};
  LIST.forEach(c => { const g = gyoOf(c); counts[g] = (counts[g] || 0) + 1; });
  const keys = ['all'].concat(GYO_ORDER.filter(g => counts[g]));
  if (!keys.includes(curGyo)) curGyo = 'all';
  document.getElementById('gyoBar').innerHTML = keys.map(g =>
    '<button class="' + (g === curGyo ? 'on' : '') + '" onclick="setGyo(\'' + g + '\')">' +
    GYO_LABEL[g] + (g === 'all' ? '' : ' (' + counts[g] + ')') + '</button>').join('');
}
function setGyo(g) { curGyo = g; buildGyoBar(); render(); }

function render() {
  const q = toHiragana(document.getElementById('q').value.trim()).toLowerCase();
  const kf = document.getElementById('kindFilter').value;
  const rows = LIST.filter(c => {
    if (kf && String(c.kind) !== kf) return false;
    if (curGyo !== 'all' && gyoOf(c) !== curGyo) return false;
    if (!q) return true;
    const hay = toHiragana([c.name, c.kana, c.address, c.person, c.tel].join(' ')).toLowerCase();
    return hay.includes(q);
  });
  document.getElementById('cnt').textContent = rows.length;
  const tb = document.getElementById('tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="10" style="color:#888;padding:20px">該当する取引先はありません</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(c => {
    const k2 = String(c.kind) === '2';
    return '<tr id="r' + c.row + '"' + (c.row === flashRow ? ' class="flash"' : '') + '>' +
      '<td class="sub">' + c.row + '</td>' +
      '<td><b>' + esc(c.name) + '</b></td>' +
      '<td>' + (c.kana ? esc(c.kana) : '<span class="sub" style="color:#c0504d">未入力</span>') + '</td>' +
      '<td>' + esc(c.person) + '</td>' +
      '<td style="font-size:13px">' + esc(c.address) + '</td>' +
      '<td style="white-space:nowrap">' + esc(c.tel) + '</td>' +
      '<td><span class="tag ' + (k2 ? 'k2' : 'k1') + '">' + (k2 ? '外注先' : '受注先') + '</span></td>' +
      '<td class="num">' + (c.stay !== '' ? esc(c.stay) + '分' : '<span class="sub">10分</span>') + '</td>' +
      '<td>' + (c.lat && c.lng ? '<span class="pin" title="緯度・経度を登録済み">📍登録済</span>' : '') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn small" onclick="openForm(' + c.row + ')">✏ 変更</button> ' +
        '<button class="btn small red" onclick="openDel(' + c.row + ')">🗑 削除</button>' +
      '</td></tr>';
  }).join('');
  if (flashRow) {
    const el = document.getElementById('r' + flashRow);
    if (el) el.scrollIntoView({ block: 'center' });
    flashRow = 0;
  }
}

/* ---------- 追加・変更 ---------- */
function openForm(row) {
  editing = row ? LIST.find(c => c.row === row) : null;
  const c = editing || { name:'', kana:'', person:'', address:'', tel:'', kind:'1', stay:'10', lat:'', lng:'' };
  document.getElementById('formTitle').textContent =
    editing ? '取引先を変更（No.' + editing.row + '：' + editing.name + '）' : '新しい取引先を追加';
  ['name','kana','person','address','tel','stay','lat','lng'].forEach(k =>
    document.getElementById('f_' + k).value = c[k] == null ? '' : c[k]);
  document.querySelectorAll('input[name=f_kind]').forEach(r => r.checked = (r.value === (String(c.kind) === '2' ? '2' : '1')));
  ['e_name','w_name','e_form'].forEach(id => document.getElementById(id).textContent = '');
  clearGeo();
  updateLatLngLink();
  document.getElementById('formOverlay').classList.add('show');
  setTimeout(() => document.getElementById('f_name').focus(), 50);
}
function closeForm() { document.getElementById('formOverlay').classList.remove('show'); editing = null; }

function checkName() {
  const name = document.getElementById('f_name').value.trim();
  const dup = LIST.find(c => c.name === name && (!editing || c.row !== editing.row));
  document.getElementById('e_name').textContent = '';
  let w = dup ? '⚠ 同じ会社名がすでに No.' + dup.row + ' にあります。工場や支店は「○○（第2工場）」のように区別できる名前にしてください。' : '';
  if (editing && name && name !== editing.name) {
    w += (w ? '　' : '') + '※会社名を変えると、ルート作成画面の「＋選択2」（過去の詳細）と前回の入力内容は、新しい名前では引き継がれません。';
  }
  document.getElementById('w_name').textContent = w;
}

['f_lat','f_lng'].forEach(id => document.addEventListener('input', e => { if (e.target.id === id) updateLatLngLink(); }));
function updateLatLngLink() {
  const lat = document.getElementById('f_lat').value.trim(), lng = document.getElementById('f_lng').value.trim();
  const a = document.getElementById('latlngMap');
  if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
    a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng);
    a.style.display = '';
  } else a.style.display = 'none';
}

/* 住所を地図で確認 */
function clearGeo() { const b = document.getElementById('geoBox'); b.className = 'geo-box'; b.innerHTML = ''; }
function checkAddress() {
  const addr = document.getElementById('f_address').value.trim();
  if (!addr) { document.getElementById('f_address').focus(); return; }
  const btn = document.getElementById('btnGeo');
  btn.disabled = true; btn.textContent = '確認中...';
  google.script.run
    .withSuccessHandler(r => {
      btn.disabled = false; btn.textContent = '📍 地図で確認';
      const b = document.getElementById('geoBox');
      if (!r.ok) {
        b.className = 'geo-box ng';
        b.innerHTML = '⚠ この住所では場所が見つかりませんでした（' + esc(r.status) + '）。住所を見直すか、下の緯度・経度を入れてください。';
        return;
      }
      const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.lat + ',' + r.lng);
      const rough = r.partial || r.type !== 'ROOFTOP';
      b.className = 'geo-box ' + (rough ? 'ng' : 'ok');
      b.innerHTML = (rough ? '⚠ 場所は見つかりましたが、番地まで正確ではない可能性があります。地図で確認してください。<br>'
                           : '✔ 場所が見つかりました。<br>') +
        'Googleマップの住所：<b>' + esc(r.formatted) + '</b><br>' +
        '<a href="' + url + '" target="_blank">🗺 地図で開いて確認する</a>　' +
        '<button type="button" class="btn small gray" onclick="useLatLng(' + r.lat + ',' + r.lng + ')">この位置を緯度・経度に入れる</button>' +
        '<div class="hint">地図の位置が正しければ、緯度・経度は空欄のままで大丈夫です。位置がずれているときは、正しい場所の緯度・経度を入れてください。</div>';
    })
    .withFailureHandler(e => {
      btn.disabled = false; btn.textContent = '📍 地図で確認';
      const b = document.getElementById('geoBox');
      b.className = 'geo-box ng'; b.textContent = '確認エラー: ' + e.message;
    })
    .cmGeocode(addr);
}
function useLatLng(lat, lng) {
  document.getElementById('f_lat').value = lat;
  document.getElementById('f_lng').value = lng;
  updateLatLngLink();
}

function collectForm() {
  fixKana(); fixTel();
  const v = id => document.getElementById(id).value.trim();
  return {
    name: v('f_name'), kana: v('f_kana'), person: v('f_person'), address: v('f_address'), tel: v('f_tel'),
    kind: document.querySelector('input[name=f_kind]:checked').value,
    stay: v('f_stay').normalize('NFKC'), lat: v('f_lat').normalize('NFKC'), lng: v('f_lng').normalize('NFKC')
  };
}

function submitForm(allowDuplicate) {
  const c = collectForm();
  const ef = document.getElementById('e_form');
  ef.textContent = '';
  if (!c.name) { document.getElementById('e_name').textContent = '会社名を入力してください'; document.getElementById('f_name').focus(); return; }
  if (!c.address && !(c.lat && c.lng)) {
    if (!confirm('住所が空欄です。住所がないとルートの計算ができません。\nこのまま保存しますか？')) return;
  }
  if (!c.kana && !confirm('フリガナが空欄です。ルート作成画面では「英数」に表示されます。\nこのまま保存しますか？')) return;
  c.allowDuplicate = !!allowDuplicate;

  const btn = document.getElementById('btnSaveForm');
  btn.disabled = true; btn.textContent = '保存中...';
  const done = res => {
    btn.disabled = false; btn.textContent = '💾 保存';
    closeForm();
    showMsg('✔ ' + res.message, true);
    flashRow = res.row;
    load();
  };
  const fail = e => {
    btn.disabled = false; btn.textContent = '💾 保存';
    const m = String(e.message || e);
    if (m.indexOf('DUP:') >= 0) {
      if (confirm(m.replace(/^.*DUP:/, '') + '。\n同じ会社名で登録すると、ルート作成画面で見分けがつきにくくなります。\nそれでも登録しますか？')) submitForm(true);
      return;
    }
    ef.textContent = '保存できませんでした：' + m.replace(/^Exception:\s*/, '').replace(/^Error:\s*/, '');
  };
  if (editing) {
    google.script.run.withSuccessHandler(done).withFailureHandler(fail).cmUpdateClient(editing.row, editing.name, c);
  } else {
    google.script.run.withSuccessHandler(done).withFailureHandler(fail).cmAddClient(c);
  }
}

/* ---------- 削除 ---------- */
function openDel(row) {
  deleting = LIST.find(c => c.row === row);
  if (!deleting) return;
  document.getElementById('delInfo').innerHTML =
    '<b style="font-size:16px">' + esc(deleting.name) + '</b>（No.' + deleting.row + '）<br>' +
    '担当者：' + esc(deleting.person || '—') + '<br>住所：' + esc(deleting.address || '—') + '<br>電話：' + esc(deleting.tel || '—');
  document.getElementById('delOverlay').classList.add('show');
}
function closeDel() { document.getElementById('delOverlay').classList.remove('show'); deleting = null; }
function doDelete() {
  if (!deleting) return;
  const btn = document.getElementById('btnDoDel');
  btn.disabled = true; btn.textContent = '削除中...';
  google.script.run
    .withSuccessHandler(res => {
      btn.disabled = false; btn.textContent = '🗑 削除する';
      closeDel();
      showMsg('✔ ' + res.message, true);
      load();
    })
    .withFailureHandler(e => {
      btn.disabled = false; btn.textContent = '🗑 削除する';
      closeDel();
      showMsg('削除できませんでした：' + String(e.message).replace(/^Exception:\s*/, ''), false);
      load();
    })
    .cmDeleteClient(deleting.row, deleting.name);
}

/* ---------- 配達者の管理 ---------- */
let DRIVERS = [];
function openDrivers() {
  document.getElementById('e_drv').textContent = '';
  document.getElementById('drvOverlay').classList.add('show');
  loadDrivers();
}
function closeDrivers() { document.getElementById('drvOverlay').classList.remove('show'); }
function drvFail(e) { document.getElementById('e_drv').textContent = String(e.message || e); }
function loadDrivers() {
  google.script.run
    .withSuccessHandler(list => { DRIVERS = list || []; renderDrivers(); })
    .withFailureHandler(drvFail)
    .dmListDrivers();
}
function renderDrivers() {
  const tb = document.getElementById('drvBody');
  if (!DRIVERS.length) {
    tb.innerHTML = '<tr><td colspan="4" style="color:#888;padding:14px">配達者が登録されていません</td></tr>';
    return;
  }
  const last = DRIVERS.length - 1;
  tb.innerHTML = DRIVERS.map((d, i) =>
    '<tr><td style="text-align:center;white-space:nowrap">' +
      '<button class="btn small gray" onclick="moveDriver(\'' + d.id + '\',-1)"' + (i === 0 ? ' disabled' : '') + '>▲</button> ' +
      '<button class="btn small gray" onclick="moveDriver(\'' + d.id + '\',1)"' + (i === last ? ' disabled' : '') + '>▼</button></td>' +
    '<td><input type="text" id="dn-' + d.id + '" value="' + esc(d.name) + '"></td>' +
    '<td><input type="text" id="de-' + d.id + '" value="' + esc(d.email) + '"></td>' +
    '<td style="white-space:nowrap"><button class="btn small" onclick="saveDriver(\'' + d.id + '\')">💾 保存</button> ' +
      '<button class="btn small red" onclick="deleteDriver(\'' + d.id + '\')">🗑 削除</button></td></tr>'
  ).join('');
}
function addDriver() {
  const name = document.getElementById('d_name').value.trim();
  const email = document.getElementById('d_email').value.trim();
  document.getElementById('e_drv').textContent = '';
  google.script.run
    .withSuccessHandler(msg => {
      document.getElementById('d_name').value = '';
      document.getElementById('d_email').value = '';
      showMsg('✔ ' + msg, true);
      loadDrivers();
    })
    .withFailureHandler(drvFail)
    .dmAddDriver({ name: name, email: email });
}
function saveDriver(id) {
  document.getElementById('e_drv').textContent = '';
  google.script.run
    .withSuccessHandler(msg => { showMsg('✔ ' + msg, true); loadDrivers(); })
    .withFailureHandler(drvFail)
    .dmUpdateDriver(id, { name: document.getElementById('dn-' + id).value, email: document.getElementById('de-' + id).value });
}
function deleteDriver(id) {
  const d = DRIVERS.find(x => x.id === id);
  if (!d || !confirm('配達者「' + d.name + '」を削除します。よろしいですか？\n（保存済みのルート表・配達履歴はそのまま残ります）')) return;
  google.script.run
    .withSuccessHandler(msg => { showMsg('✔ ' + msg, true); loadDrivers(); })
    .withFailureHandler(drvFail)
    .dmDeleteDriver(id);
}
function moveDriver(id, dir) {
  google.script.run.withSuccessHandler(loadDrivers).withFailureHandler(drvFail).dmMoveDriver(id, dir);
}

/* ---------- その他 ---------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeForm(); closeDel(); closeDrivers(); }
});
function closeApp() {
  google.script.run
    .withSuccessHandler(() => google.script.host.close())
    .withFailureHandler(() => google.script.host.close())
    .activateClientSheet();
}
function openRoute() { google.script.run.showRouteDialog(); }

load();
</script>
</body>
</html>`;
