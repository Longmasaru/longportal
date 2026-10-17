// 元の画面(Apps Script の HTML)を、そのままポータルで動かすための置き換え。
// google.script.run.xxx(...) を /apps/haisou/api への POST に変える。
// - activateClientSheet / showRouteDialog / google.script.host.close は画面の移動に置き換える。
// - sendToDriver(配達者へメール)は、ポータルにメール送信の仕組みができるまで、
//   利用者のメールソフトを開いて(mailto)、ルート表を本文に入れる。AM・PM を 1 通にまとめる。
export const RPC_SHIM = String.raw`
<script>
(function () {
  var API = '/apps/haisou/api';
  var HOME = '/';

  function post(fn, args) {
    return fetch(API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn: fn, args: args })
    }).then(function (res) {
      return res.json().catch(function () {
        throw new Error(res.status === 404 ? 'このアプリを使う権限がありません。' : '通信エラー(' + res.status + ')');
      });
    }).then(function (body) {
      if (!body || !body.ok) throw new Error((body && body.message) || '処理できませんでした。');
      return body.value;
    });
  }

  /* ---------- 配達者へのメール(mailto) ---------- */
  var mailQueue = [];
  function mailText(r) {
    var lines = ['■ ' + r.shift + '便　出発 ' + r.startTime + ' / 帰着予定 ' + r.backTime +
                 '　総距離 ' + (r.totalKm != null ? r.totalKm + ' km' : '概算') + ' / 総移動時間 ' + r.totalMin + '分'];
    (r.links || []).forEach(function (l) { lines.push('🗺 ' + l.label + ': ' + l.url); });
    (r.schedule || []).forEach(function (s) {
      (s.breaksCrossed || []).forEach(function (b) { lines.push('―― ' + b + ' ――'); });
      lines.push(s.no + '. ' + s.arrive + ' ' + s.name + (s.person ? '(' + s.person + ')' : '') +
                 '　' + s.yoken + (s.detail ? '　' + s.detail : ''));
      lines.push('　　' + s.address + (s.tel ? '　TEL ' + s.tel : ''));
    });
    return lines.join('\n');
  }
  function flushMail() {
    var items = mailQueue; mailQueue = [];
    if (!items.length) return;
    var first = items[0].result;
    var to = first.driverEmail;
    if (!to) {
      items.forEach(function (it) { it.ng(new Error('配達者のメールアドレスが未設定です(取引先の管理 → 配達者の管理で登録してください)')); });
      return;
    }
    var subject = '【配達ルート】' + first.date + ' ' + items.map(function (it) { return it.result.shift + '便'; }).join('・') +
                  (first.driver ? '(' + first.driver + 'さん)' : '');
    var body = '配達ルート表(' + first.date + ')　配達者【' + (first.driver || '') + '】\n' +
               '休憩:昼休み 12:00〜12:45 / 休憩 15:00〜15:15 / 休憩 17:30〜17:40\n\n' +
               items.map(function (it) { return mailText(it.result); }).join('\n\n') +
               '\n\n↑ スマホでリンクをタップするとGoogleマップでナビを開始できます\n株式会社ロング 配達ルート';
    location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) +
                    '&body=' + encodeURIComponent(body);
    items.forEach(function (it) { it.ok(to + ' 宛てのメールを作成しました(メールソフトで送信してください)'); });
  }

  var LOCAL = {
    activateClientSheet: function () { return Promise.resolve('ok'); },
    showRouteDialog: function () { location.href = '/apps/haisou'; return Promise.resolve('ok'); },
    showClientDialog: function () { location.href = '/apps/haisou/clients'; return Promise.resolve('ok'); }
  };

  function runner(state) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (f) { return runner({ ok: f, ng: state.ng }); };
        if (prop === 'withFailureHandler') return function (f) { return runner({ ok: state.ok, ng: f }); };
        if (prop === 'withUserObject') return function () { return runner(state); };
        if (typeof prop !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var ok = state.ok || function () {};
          var ng = state.ng || function (e) { console.error(e); };
          if (prop === 'sendToDriver') {
            mailQueue.push({ result: args[0], ok: ok, ng: ng });
            setTimeout(flushMail, 0);
            return;
          }
          var p = LOCAL[prop] ? LOCAL[prop]() : post(prop, args);
          p.then(function (v) { ok(v); }, function (e) { ng(e instanceof Error ? e : new Error(String(e))); });
        };
      }
    });
  }

  window.google = {
    script: {
      run: runner({}),
      host: { close: function () { location.href = HOME; } }
    }
  };
})();
</script>
`;
