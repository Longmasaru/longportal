// LONG PORTAL の「Google ドキュメントの書き込み役」(docs/DESIGN.md 43 章)。
// 長井さんの Google アカウントで、Apps Script のウェブアプリとして公開する。ポータルから合言葉つきで呼ばれ、
// 長井さんが編集できるドキュメントに、タブを足す・タブの末尾に書き足すだけを行う(消す・書き換えることはしない)。
//
// 準備(1 回だけ):
//   1. https://script.google.com で新しいプロジェクトを作り、このファイルの中身を貼る。
//   2. 左の「サービス +」から「Google Docs API」を追加する(識別子は Docs のまま)。
//   3. 「プロジェクトの設定」→「スクリプト プロパティ」に、プロパティ SECRET(長いランダムな文字列)を足す。
//      同じ値を、ポータル(Vercel)の GOOGLE_DOCS_WRITER_SECRET に登録する。
//   4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、実行するユーザー「自分」、アクセスできるユーザー「全員」。
//      表示された URL(…/exec)を、ポータルの GOOGLE_DOCS_WRITER_URL に登録する。
// コードを直したら、「デプロイを管理」で同じデプロイの新しいバージョンにする(URL を変えないため)。

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: "bad request" });
  }
  var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret || req.secret !== secret) return reply_({ ok: false, error: "unauthorized" });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (req.action === "listTabs") return reply_({ ok: true, tabs: listTabs_(req.documentId) });
    if (req.action === "addTab") return reply_({ ok: true, tabId: addTab_(req.documentId, req.title, req.text) });
    if (req.action === "appendToTab") {
      appendToTab_(req.documentId, req.tabId, req.text);
      return reply_({ ok: true });
    }
    return reply_({ ok: false, error: "unknown action" });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function allTabs_(documentId) {
  var doc = Docs.Documents.get(documentId, { includeTabsContent: true });
  var out = [];
  (function walk(tabs) {
    (tabs || []).forEach(function (t) {
      out.push(t);
      walk(t.childTabs);
    });
  })(doc.tabs);
  return { doc: doc, tabs: out };
}

function listTabs_(documentId) {
  return allTabs_(documentId).tabs.map(function (t) {
    return { tabId: t.tabProperties.tabId, title: t.tabProperties.title || "" };
  });
}

function addTab_(documentId, title, text) {
  var top = allTabs_(documentId).doc.tabs || [];
  var res = Docs.Documents.batchUpdate(
    { requests: [{ addDocumentTab: { tabProperties: { title: String(title), index: top.length } } }] },
    documentId,
  );
  var tabId = res.replies[0].addDocumentTab.tabProperties.tabId;
  Docs.Documents.batchUpdate({ requests: [{ insertText: { text: String(text), location: { tabId: tabId, index: 1 } } }] }, documentId);
  return tabId;
}

function appendToTab_(documentId, tabId, text) {
  var tab = allTabs_(documentId).tabs.filter(function (t) {
    return t.tabProperties.tabId === tabId;
  })[0];
  if (!tab) throw new Error("tab not found");
  var content = tab.documentTab.body.content;
  var end = content[content.length - 1].endIndex - 1;
  Docs.Documents.batchUpdate(
    { requests: [{ insertText: { text: "\n" + String(text), location: { tabId: tabId, index: end } } }] },
    documentId,
  );
}
