import { addDocTab, appendToDocTab, googleDocsWriterConfig, listDocTabs, type GoogleDocsWriterConfig } from "@/modules/core/google-docs";
import { findReportTab, newTabTitle, parseDocMap, reportToDocText } from "./doc-text";
import { getReportDetail } from "./queries";
import type { ReportDetail } from "./types";

// 日報を Google ドキュメント「日報まとめ」へ自動で書き込む(docs/DESIGN.md 43 章)。サーバー側専用。
// Server Action の `after()` から呼ぶ(画面の操作を待たせない・失敗しても日報の操作は取り消さない)。
// 書き込むのは足すことだけ: 提出した日のタブを足す / 指導者のコメントをその日のタブの末尾に書き足す。
// ドキュメントにすでにある文章は消さない・書き換えない。

type Target = { config: GoogleDocsWriterConfig; documentId: string; report: ReportDetail };

/** 書き込み先(書き込み役の設定がない・その社員のドキュメントが登録されていない・未提出なら null)。 */
async function target(reportId: string): Promise<Target | null> {
  const config = googleDocsWriterConfig();
  if (!config) return null;
  const report = await getReportDetail(reportId);
  if (!report || report.status !== "submitted") return null;
  const documentId = parseDocMap(process.env.NIPPO_GOOGLE_DOCS).get(report.employeeNumber);
  return documentId ? { config, documentId, report } : null;
}

/** その日のタブを、日報(と指導者のコメント)の文章で足す。 */
async function addReportTab({ config, documentId, report }: Target, existingTitles: string[]): Promise<void> {
  const text = reportToDocText({ ...report, reviewerComments: report.comments.filter((c) => !c.byOwner).map((c) => c.body) });
  await addDocTab(config, documentId, newTabTitle(report.reportDate, existingTitles), text);
}

function logError(what: string, err: unknown) {
  console.error(`[nippo] ドキュメントに${what}を書き込めませんでした: ${err instanceof Error ? err.message : "不明"}`);
}

/** 日報を初めて提出したとき。すでにその日のタブがあれば(ドキュメントにも書いた日など)何もしない。 */
export async function writeSubmittedReportToDoc(reportId: string): Promise<void> {
  try {
    const t = await target(reportId);
    if (!t) return;
    const tabs = await listDocTabs(t.config, t.documentId);
    if (!findReportTab(tabs, t.report.reportDate)) await addReportTab(t, tabs.map((x) => x.title));
  } catch (err) {
    logError("日報", err);
  }
}

/** 指導者(本人以外)がコメントしたとき。その日のタブがなければ、コメントを含めた日報のタブを足す。 */
export async function writeReviewerCommentToDoc(reportId: string, body: string): Promise<void> {
  try {
    const t = await target(reportId);
    if (!t) return;
    const tabs = await listDocTabs(t.config, t.documentId);
    const tab = findReportTab(tabs, t.report.reportDate);
    if (tab) await appendToDocTab(t.config, t.documentId, tab.tabId, body.trim());
    else await addReportTab(t, tabs.map((x) => x.title));
  } catch (err) {
    logError("コメント", err);
  }
}
