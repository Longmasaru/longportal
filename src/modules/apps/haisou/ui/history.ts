// 配達履歴の画面(元は「配達ルート履歴」シートを直接見ていたので、その代わり)。見た目は元の画面にそろえる。
// 列は元のシートと同じ。実時間(元の R 列)はここで入力する。
// 注意: この文字列の中では、バッククォートと「$」+「{」を使わない(String.raw のテンプレートのため)。
export const HISTORY_HTML = String.raw`<!DOCTYPE html>
<html>
<head>
<base target="_top">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>配達履歴 | LONG PORTAL</title>
<style>
  :root { --navy:#1F3A5F; --teal:#0E7C7B; --amber:#E8A33D; --red:#C0504D; }
  * { box-sizing:border-box; font-family:'Noto Sans CJK JP','Yu Gothic UI','Meiryo UI',sans-serif; }
  body { margin:0; padding:16px 16px 0; color:#222; font-size:14px; }
  h2 { color:var(--navy); margin:0 0 10px; font-size:18px; }
  .bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
         background:#f4f6f9; border:1px solid #d8dee8; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
  .bar label { font-weight:bold; color:var(--navy); }
  input[type=text], input[type=month], select { font-size:14px; padding:5px 8px; border:1px solid #b9c3d0; border-radius:5px; }
  .btn { background:var(--teal); color:#fff; border:none; border-radius:6px;
         padding:9px 20px; font-size:14px; cursor:pointer; white-space:nowrap; text-decoration:none; display:inline-block; }
  .btn.gray { background:#8a93a2; }
  .btn.amber { background:var(--amber); }
  .btn.red { background:var(--red); }
  .btn.small { padding:4px 10px; font-size:12px; }
  .btn:disabled { background:#bbb; cursor:default; }
  .nav-btn { border:1px solid var(--navy); background:#fff; color:var(--navy); border-radius:6px;
             padding:4px 11px; font-weight:bold; cursor:pointer; }
  .ym { font-size:18px; font-weight:bold; color:var(--navy); min-width:120px; text-align:center; }
  table { border-collapse:collapse; width:100%; margin-bottom:14px; }
  th, td { border:1px solid #c9d2de; padding:5px 8px; text-align:left; vertical-align:middle; }
  th { background:var(--navy); color:#fff; font-weight:normal; white-space:nowrap; }
  .batch-head td { background:#e8eef5; color:var(--navy); font-weight:bold; }
  .sub { font-size:11px; color:#888; font-weight:normal; }
  .actual { width:80px; text-align:center; }
  .actual.saved { outline:2px solid #9fd3d2; }
  .foot { position:sticky; bottom:0; background:#fff; padding:10px 0 12px; margin-top:10px;
          border-top:2px solid var(--navy); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  #msg { font-weight:bold; color:var(--teal); }
  #msg.ng { color:var(--red); }
</style>
</head>
<body>

<h2>📋 配達履歴</h2>

<div class="bar">
  <button class="nav-btn" onclick="moveMonth(-1)" title="前の月">◀</button>
  <span class="ym" id="ym"></span>
  <button class="nav-btn" onclick="moveMonth(1)" title="次の月">▶</button>
  <button class="nav-btn" onclick="thisMonth()">今月</button>
  <label style="margin-left:12px">配達者</label>
  <select id="driver" onchange="load()"><option value="">全員</option></select>
  <span>この月 <b id="cnt">0</b> 件</span>
</div>

<div id="area">読み込み中...</div>

<div class="foot">
  <button class="btn gray" onclick="location.href='/apps/haisou'">◀ ルート作成に戻る</button>
  <span class="sub">実時間は、入力して枠の外を押すと保存されます。</span>
  <span id="msg"></span>
</div>

<script>
let ROWS = [];
let curY = 0, curM = 0;
const pad2 = n => String(n).padStart(2, '0');

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function showMsg(text, ok) {
  const m = document.getElementById('msg');
  m.textContent = text; m.className = ok ? '' : 'ng';
}
function thisMonth() {
  const t = new Date();
  curY = t.getFullYear(); curM = t.getMonth() + 1;
  load();
}
function moveMonth(d) {
  curM += d;
  if (curM < 1) { curM = 12; curY--; }
  if (curM > 12) { curM = 1; curY++; }
  load();
}

function load() {
  document.getElementById('ym').textContent = curY + '年' + curM + '月';
  document.getElementById('area').textContent = '読み込み中...';
  google.script.run
    .withSuccessHandler(rows => { ROWS = rows || []; render(); })
    .withFailureHandler(e => { document.getElementById('area').textContent = '読み込みエラー: ' + e.message; })
    .hList(curY + '-' + pad2(curM), document.getElementById('driver').value);
}

function render() {
  document.getElementById('cnt').textContent = ROWS.length;
  if (!ROWS.length) {
    document.getElementById('area').innerHTML = '<div style="color:#888;padding:14px 4px">この月の配達履歴はありません。</div>';
    return;
  }
  // 便(保存の単位)ごとにまとめる。並びは日付の新しい順、同じ日の中は保存した順。
  const batches = [];
  const byId = {};
  ROWS.forEach(r => {
    if (!byId[r.batchId]) { byId[r.batchId] = { rows: [] }; batches.push(byId[r.batchId]); }
    byId[r.batchId].rows.push(r);
  });
  let h = '<table><thead><tr><th style="width:36px">順</th><th>会社名</th><th>要件</th><th style="width:28%">詳細</th>' +
    '<th>住所</th><th>到着</th><th>出発</th><th>滞在(分)</th><th>実時間</th></tr></thead><tbody>';
  batches.forEach(b => {
    const f = b.rows[0];
    const head = b.rows.find(r => r.totalMin != null || r.mapUrl) || f;
    const urls = String(head.mapUrl || '').split('\n').filter(Boolean);
    h += '<tr class="batch-head"><td colspan="9">' + esc(f.dateLabel) + '　' + esc(f.shift) + '便　配達者【' + esc(f.driver) + '】' +
      '　出発 ' + esc(f.startTime) + ' ／ 帰着 ' + esc(f.backTime) +
      (head.totalKm != null || head.totalMin != null
        ? '　｜　総距離 ' + (head.totalKm != null ? head.totalKm + 'km' : '概算') + ' ／ 総時間 ' + (head.totalMin != null ? head.totalMin + '分' : '—') : '') +
      urls.map((u, i) => '　<a href="' + esc(u) + '" target="_blank">🗺 マップ' + (urls.length > 1 ? (i + 1) : '') + '</a>').join('') +
      '　<button class="btn small red" style="float:right" onclick="deleteBatch(\'' + f.batchId + '\')">🗑 この便を削除</button></td></tr>';
    b.rows.forEach(r => {
      h += '<tr><td style="text-align:center">' + r.seq + '</td>' +
        '<td><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.person) + '</div></td>' +
        '<td style="white-space:nowrap">' + esc(r.yoken) + '</td>' +
        '<td>' + esc(r.detail) + '</td>' +
        '<td style="font-size:12px">' + esc(r.address) + '</td>' +
        '<td style="text-align:center"><b>' + esc(r.arrive) + '</b></td>' +
        '<td style="text-align:center">' + esc(r.depart) + '</td>' +
        '<td style="text-align:right">' + (r.stay != null ? r.stay : '') + '</td>' +
        '<td style="text-align:center"><input type="text" class="actual" value="' + esc(r.actualTime) + '" ' +
          'onchange="saveActual(\'' + r.id + '\', this)"></td></tr>';
    });
  });
  h += '</tbody></table>';
  document.getElementById('area').innerHTML = h;
}

function saveActual(id, el) {
  el.classList.remove('saved');
  google.script.run
    .withSuccessHandler(() => { el.classList.add('saved'); showMsg('✔ 実時間を保存しました', true); })
    .withFailureHandler(e => showMsg('保存できませんでした：' + e.message, false))
    .hSetActual(id, el.value);
}

function deleteBatch(batchId) {
  const rows = ROWS.filter(r => r.batchId === batchId);
  if (!rows.length) return;
  const f = rows[0];
  if (!confirm(f.dateLabel + ' ' + f.shift + '便（' + f.driver + '）の履歴 ' + rows.length + '件を削除します。よろしいですか？\n（この操作は元に戻せません）')) return;
  google.script.run
    .withSuccessHandler(msg => { showMsg('✔ ' + msg, true); load(); })
    .withFailureHandler(e => showMsg('削除できませんでした：' + e.message, false))
    .hDeleteBatch(batchId);
}

google.script.run.withSuccessHandler(names => {
  const sel = document.getElementById('driver');
  (names || []).forEach(n => { const op = document.createElement('option'); op.value = n; op.textContent = n; sel.appendChild(op); });
}).hDrivers();

thisMonth();
</script>
</body>
</html>`;
