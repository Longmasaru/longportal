import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { lineWorksConfig } from "@/modules/core/lineworks";
import { RESIDENCE_STATUS_LABEL } from "../constants";
import { canManage } from "../guard";
import { PRINT_AREA, displayName, filterMembers, formatJapaneseDate, printGrid, yearOrdinal } from "../logic";
import { manifest } from "../manifest";
import { departmentsOf, listNakamaMembers } from "../queries";
import type { NakamaMember } from "../types";
import { Face } from "./face";
import { PrintButton } from "./print-button";

const BASE = "/apps/nakama";
const CHIP = "border-2 px-4 py-2 text-lg font-bold transition-colors";
const CHIP_ON = "border-brand01 bg-brand01 text-white";
const CHIP_OFF = "border-brand01/25 text-brand01 hover:border-brand03 hover:text-brand03 bg-white";

function href(q: string, dept: string | null): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (dept) sp.set("dept", dept);
  const s = sp.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** 札の下に並べる「技能実習 2 号」「日本に来て 3 年目」。どちらも未入力なら出さない。 */
function facts(m: NakamaMember, today: string): string[] {
  const out: string[] = [];
  if (m.residenceStatus) out.push(RESIDENCE_STATUS_LABEL[m.residenceStatus]);
  const year = yearOrdinal(m.arrivedOn, today);
  if (year !== null) out.push(`日本に来て ${year} 年目`);
  return out;
}

/**
 * ベトナムの仲間の名簿(docs/DESIGN.md 43 章)。年配の方にも見やすいよう、大きな写真と大きな文字で並べ、
 * 探し方は「名前の一部を打つ」と「部署を押す」だけにする。印刷すると、いま表示している人を A4 縦 1 枚にまとめる。
 */
export async function NakamaPage({ q, dept }: { q: string; dept: string | null }) {
  const actor = await requireAppAccess(manifest.appKey);
  const all = await listNakamaMembers(actor.today);
  const departments = departmentsOf(all);
  const selected = departments.find((d) => d.id === dept) ?? null;
  const shown = filterMembers(all, q, selected?.id ?? null);
  const withPhoto = lineWorksConfig() !== null;
  const manager = canManage(actor);

  const grid = printGrid(shown.length);
  const cellHeight = PRINT_AREA.height / grid.rows; // mm
  // 印刷の文字の大きさ(pt)。札の高さに合わせ、小さすぎ・大きすぎにならないよう上下を決める。
  const pt = (ratio: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, cellHeight * ratio)) * 10) / 10;
  const printTitle = `ベトナムの仲間${selected ? `(${selected.name})` : ""}`;

  return (
    <>
      <style>{"@page { size: A4 portrait; margin: 10mm; }"}</style>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
              NAKAMA<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">ベトナムの仲間</span>
            </p>
            <h1 className="text-brand01 mt-2 text-3xl font-bold">ベトナムの仲間</h1>
            <p className="text-brand04 mt-2 text-lg">顔と名前を覚えて、声をかけてみましょう。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {manager ? (
              <Link
                href={`${BASE}/manage`}
                className="border-brand01 text-brand01 hover:text-brand03 hover:border-brand03 border-2 bg-white px-5 py-3 text-lg font-bold transition-colors"
              >
                名簿を直す
              </Link>
            ) : null}
            <PrintButton disabled={shown.length === 0} />
          </div>
        </div>

        <form action={BASE} className="flex flex-wrap items-center gap-3">
          {selected ? <input type="hidden" name="dept" value={selected.id} /> : null}
          <label htmlFor="nakama-q" className="text-brand01 text-lg font-bold">
            名前でさがす
          </label>
          <input
            id="nakama-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="例: アン"
            className="bg-field text-brand01 placeholder:text-brand04 focus-visible:outline-brand01 min-w-0 flex-1 px-4 py-3 text-xl outline-none focus-visible:outline-2 sm:max-w-sm"
          />
          <button type="submit" className="bg-brand01 px-6 py-3 text-lg font-bold text-white transition-opacity hover:opacity-80">
            さがす
          </button>
          {q ? (
            <Link href={href("", selected?.id ?? null)} className="text-brand01 hover:text-brand03 text-lg font-bold underline">
              名前の条件を消す
            </Link>
          ) : null}
        </form>

        {departments.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href(q, null)} className={`${CHIP} ${selected ? CHIP_OFF : CHIP_ON}`}>
              全員
            </Link>
            {departments.map((d) => (
              <Link key={d.id} href={href(q, d.id)} className={`${CHIP} ${selected?.id === d.id ? CHIP_ON : CHIP_OFF}`}>
                {d.name}
              </Link>
            ))}
          </div>
        ) : null}

        <p className="text-brand04 text-lg">
          <span className="text-brand01 text-2xl font-bold">{shown.length}</span> 人
          {all.length !== shown.length ? `(全員で ${all.length} 人)` : ""}
        </p>

        {all.length === 0 ? (
          <p className="text-brand04 border-brand01/15 border bg-white p-6 text-lg">
            まだ、だれも載っていません。{manager ? "「名簿を直す」から、載せる人を足してください。" : ""}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-brand04 border-brand01/15 border bg-white p-6 text-lg">見つかりませんでした。名前を短くして、もう一度さがしてください。</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((m) => {
              const name = displayName(m);
              return (
                <li key={m.employeeId} className="border-brand01/15 flex flex-col border bg-white">
                  <Face
                    employeeId={m.employeeId}
                    name={name}
                    withPhoto={withPhoto}
                    className="aspect-square w-full"
                    letterClassName="text-6xl"
                  />
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <p className="text-brand01 text-3xl leading-tight font-bold break-words">
                      {name}
                      <span className="ml-1 text-xl">さん</span>
                    </p>
                    {m.nickname && m.nickname.trim() !== m.name ? <p className="text-brand01 text-lg">{m.nameKana ?? m.name}</p> : null}
                    {m.nativeName ? <p className="text-brand04 text-base break-words">{m.nativeName}</p> : null}
                    <p className="text-brand01 mt-1 text-lg font-bold">{m.departmentName ?? "所属なし"}</p>
                    {facts(m, actor.today).map((f) => (
                      <p key={f} className="bg-bg01 text-brand01 self-start px-2 py-0.5 text-lg font-bold">
                        {f}
                      </p>
                    ))}
                    {m.hometown || m.note ? (
                      <p className="text-brand04 mt-1 text-base">{[m.hometown && `出身: ${m.hometown}`, m.note].filter(Boolean).join(" / ")}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 印刷用(画面には出さない)。A4 縦 1 枚に、いま表示している人を並べる。並べ方は logic.ts の printGrid。 */}
      <section className="hidden text-black print:block" aria-hidden>
        <div className="flex items-baseline justify-between" style={{ height: "15mm" }}>
          <h1 className="font-bold" style={{ fontSize: "20pt" }}>
            {printTitle}
          </h1>
          <p style={{ fontSize: "10pt" }}>{formatJapaneseDate(actor.today)} 現在・{shown.length} 人</p>
        </div>
        <ul
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridAutoRows: `${cellHeight}mm`,
            gap: "0",
          }}
        >
          {shown.map((m) => {
            const name = displayName(m);
            const photo = Math.min(PRINT_AREA.width / grid.columns, cellHeight) * 0.62;
            return (
              <li
                key={m.employeeId}
                className="flex flex-col items-center overflow-hidden border border-black/30 text-center break-inside-avoid"
                style={{ padding: "2mm" }}
              >
                <Face
                  employeeId={m.employeeId}
                  name={name}
                  withPhoto={withPhoto}
                  eager
                  className="shrink-0 [print-color-adjust:exact]"
                  letterClassName=""
                  style={{ width: `${photo}mm`, height: `${photo}mm`, fontSize: `${photo * 0.4}mm` }}
                />
                <p className="mt-[1mm] leading-tight font-bold" style={{ fontSize: `${pt(0.3, 9, 28)}pt` }}>
                  {name}
                </p>
                {m.nativeName ? (
                  <p className="leading-tight" style={{ fontSize: `${pt(0.13, 6, 12)}pt` }}>
                    {m.nativeName}
                  </p>
                ) : null}
                {[m.departmentName ?? "所属なし", ...facts(m, actor.today)].map((line) => (
                  <p key={line} className="leading-tight" style={{ fontSize: `${pt(0.16, 7, 14)}pt` }}>
                    {line}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
