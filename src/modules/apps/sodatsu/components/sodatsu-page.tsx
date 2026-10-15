import Link from "next/link";
import type { ReactNode } from "react";
import { canAccessApp, requireAppAccess } from "@/modules/core/apps";
import { manifest } from "../manifest";
import {
  CHAIN,
  COMPANY_FACTS,
  FOUR_THINGS,
  GOOD_CULTURE,
  MECHANISMS,
  NOT_MEANT,
  PROMISES,
  QA,
  RETURNS,
  STATUS_LABEL,
  SURVEY,
  SURVEY_TOTAL,
  type Status,
} from "../content";
import { TodayActions } from "./reflection";
import { RoleTabs } from "./role-tabs";

function Section({ en, ja, title, children }: { en: string; ja: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          {en}
          <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">{ja}</span>
        </p>
        <h2 className="text-brand01 mt-2 text-xl font-bold [word-break:auto-phrase] md:text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status, text }: { status: Status; text?: string }) {
  const tone =
    status === "set"
      ? "bg-brand01 text-white"
      : status === "review"
        ? "bg-bg01 text-brand01"
        : "border-brand03 text-brand03 border";
  return (
    <span className={`${tone} px-2.5 py-0.5 text-xs font-bold whitespace-nowrap`}>
      {text ?? STATUS_LABEL[status]}
    </span>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
      {steps.map((step, i) => (
        <span key={step} className="flex items-center gap-1.5">
          {i > 0 ? <span className="text-brand04">›</span> : null}
          <span className="bg-bg01 text-brand01 px-2.5 py-0.5">{step}</span>
        </span>
      ))}
    </p>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <p className="border-brand03 text-brand01 border-l-[3px] pl-3 font-bold">{children}</p>;
}

/**
 * 人事ポリシー「育てて、育つ。」の紹介ページ。アプリ管理(登録簿)で有効にし、
 * 表示する相手に当てはまる社員だけが見られる(それ以外は 404)。
 */
export async function SodatsuPage() {
  const actor = await requireAppAccess(manifest.appKey);
  // ありがとうカード(apps/arigato)は直接参照せず、使えるかどうかと URL だけを使う(docs/DESIGN.md 26 章)。
  return <SodatsuContent userId={actor.userId} showArigato={await canAccessApp(actor, "arigato")} />;
}

export function SodatsuContent({ userId, showArigato = false }: { userId: string; showArigato?: boolean }) {
  return (
    <article className="text-brand01/90">
      <header className="bg-brand01 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 md:px-8 md:py-14">
          <p className="text-xs font-bold tracking-[0.2em] text-white/70">わたしたちの人事ポリシー</p>
          <h1 className="text-5xl leading-tight font-black tracking-wide md:text-6xl">
            育てて、
            <br />
            育つ。
          </h1>
          <p className="text-lg font-bold">未来のロングを、みんなでつくる。</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
            {COMPANY_FACTS.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-4 py-12 md:px-8">
        <Section en="INTRODUCTION" ja="はじめに" title="はじめて、言葉にしました">
          <p>
            これまでロングには、明文化された理念がありませんでした。そこで戦略人事の会で話し合い、人事ポリシーとして「育てて、育つ。」をつくりました。これを全員の共通の考え方として共有していきます。
          </p>
        </Section>

        <Section en="OUR STRENGTH" ja="すでにある良いもの" title="ロングには、すでに良い文化がある">
          <ul className="flex flex-wrap gap-2">
            {GOOD_CULTURE.map((c) => (
              <li key={c} className="border-brand01/20 border px-3.5 py-1 text-sm">
                {c}
              </li>
            ))}
          </ul>
          <Key>これは、これからも絶対に壊したくない、ロングの財産です。</Key>
        </Section>

        <Section en="CHALLENGE" ja="でも" title="その良さが「人」に依存している">
          <p>
            教える人によって内容が違う。新人によって覚える順番が違う。分からないことは、みんな同じ人に聞く。その結果、責任感の強いベテランに業務が集中しています。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-brand01/15 text-brand04 border p-4">
              <p className="text-xs font-bold tracking-widest">これまで</p>
              <p className="mt-1 font-bold">人が良いから、回っている会社</p>
            </div>
            <div className="bg-brand01 p-4 text-white">
              <p className="text-xs font-bold tracking-widest text-white/75">これから</p>
              <p className="mt-1 font-bold">人が育つから、強くなる会社</p>
            </div>
          </div>
          <Key>善意をなくすのではなく、善意が続けられる仕組みをつくりたいのです。</Key>
        </Section>

        <Section en="CYCLE" ja="だから、育てて、育つ。" title="「育てて」→「育つ」を、くり返していく">
          <ol className="flex flex-col">
            {CHAIN.map((step, i) => (
              <li key={i} className="relative grid grid-cols-[2rem_1fr] items-center gap-3 py-1.5">
                {i < CHAIN.length - 1 ? (
                  <span aria-hidden className="bg-brand01/15 absolute top-1/2 left-[0.95rem] h-full w-0.5" />
                ) : null}
                <span
                  aria-hidden
                  className={`relative z-10 size-3.5 justify-self-center rounded-full border-[3px] bg-white ${step.kind === "grow" ? "border-brand03" : "border-brand01"}`}
                />
                <span>
                  <span className="text-brand04 block text-xs">{step.who}</span>
                  <span className={`text-lg font-bold ${step.kind === "grow" ? "text-brand03" : "text-brand01"}`}>
                    {step.act}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p>
            「教える」も「育つ」も、一回で終わりではありません。一人が育つと、その人がまた次の人を育てます。このくり返しが、会社全体の力になります。
          </p>
        </Section>

        <Section en="WHAT YOU GROW" ja="自分は何を育てるのか" title="あなたが育てるのは、この4つです">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FOUR_THINGS.map((t) => (
              <div key={t.title} className="border-brand01/15 border p-4">
                <p className="text-brand01 font-bold">{t.title}</p>
                <p className="mt-1 text-sm">{t.body}</p>
              </div>
            ))}
          </div>
          <p className="text-brand04 text-sm">特別なことをする必要はありません。今日から少しずつ意識するだけで十分です。</p>
        </Section>

        <Section en="CLARIFY" ja="誤解のないように" title="こういう意味ではありません">
          <div className="flex flex-col gap-3">
            {NOT_MEANT.map((m) => (
              <div key={m.not} className="border-brand01/15 flex flex-col gap-1.5 border p-4">
                <p className="text-brand04 decoration-brand03 text-sm line-through">{m.not}</p>
                <p className="text-brand01 font-bold">{m.but}</p>
                <p className="text-brand04 text-sm">{m.detail}</p>
                {m.flow ? <Flow steps={m.flow} /> : null}
              </div>
            ))}
          </div>
        </Section>

        <Section en="SYSTEMS" ja="仕組みにする" title="良い気持ちだけでなく、仕組みにする">
          <ul className="border-brand01/15 border-t">
            {MECHANISMS.map((m) => (
              <li key={m.title} className="border-brand01/15 flex items-center gap-4 border-b py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-brand01 font-bold">{m.title}</p>
                  <p className="text-brand04 text-sm">{m.body}</p>
                </div>
                <StatusBadge status={m.status} text={m.statusText} />
              </li>
            ))}
          </ul>
          <p className="text-brand04 text-sm">
            いずれも一部からのスタートです。完成した制度を渡す話ではなく、運用しながらみんなで改善していきます。
          </p>
        </Section>

        <Section en="FOR YOU" ja="あなたにどう関係するか" title="これは、新人だけの話ではありません">
          <RoleTabs />
        </Section>

        <Section en="RETURNS" ja="自分にとっての意味" title="教える・効率化は、巡り巡って自分に返ってくる">
          <div className="flex flex-col gap-3">
            {RETURNS.map((r) => (
              <div key={r.title} className="border-brand01/15 flex flex-col gap-2 border p-4">
                <p className="text-brand01 font-bold">{r.title}</p>
                <Flow steps={r.flow} />
              </div>
            ))}
          </div>
          <p className="text-brand04 flex items-center gap-2 text-sm">
            <StatusBadge status="review" />
            評価・給与への反映は検討中の方向性です。
          </p>
        </Section>

        <Section en="Q&A" ja="リーダー層から出た疑問への答え" title="ひとことで言うと">
          <div className="border-brand01/15 border-t">
            {QA.map((item) => (
              <details key={item.q} className="group border-brand01/15 border-b">
                <summary className="flex cursor-pointer list-none items-center gap-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="text-brand03 block text-sm font-bold">{item.q}</span>
                    <span className="text-brand01 group-hover:text-brand03 block font-bold transition-colors">
                      {item.a}
                    </span>
                  </span>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                  <span aria-hidden className="text-brand01 transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="flex flex-col gap-3 pb-4 text-sm">
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {item.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  {item.example ? (
                    <p className="bg-bg01 p-3">
                      <span className="text-brand01 mr-2 font-bold">たとえば</span>
                      {item.example}
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </Section>

        <Section en="SURVEY" ja="リーダー層への説明会アンケート" title="リーダーには、しっかり届いていました">
          <div className="flex flex-col gap-2.5">
            {SURVEY.map((s) => (
              <div key={s.label} className="bg-bg01 flex items-center gap-4 px-4 py-3">
                <p className="text-brand01 min-w-0 flex-1 font-bold">{s.label}</p>
                <p className="text-brand04 text-sm font-bold whitespace-nowrap tabular-nums">
                  {SURVEY_TOTAL}人中
                  <span className="text-brand01 mx-0.5 text-3xl font-black">{s.count}</span>人
                </p>
              </div>
            ))}
          </div>
          <p className="text-brand04 text-xs">
            先に説明を受けたリーダー層{SURVEY_TOTAL}人の匿名集計。5段階のうち「4・5」を「そう思う」として数えています。
          </p>
        </Section>

        <Section en="START TODAY" ja="今日から、あなたにできること" title="3つのうち、一つからで大丈夫">
          {showArigato ? (
            <Link
              href="/apps/arigato"
              className="border-brand03 hover:bg-bg01 flex items-center gap-4 border-2 px-4 py-3 transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="text-brand01 block font-bold">ありがとうカードを送る</span>
                <span className="text-brand04 block text-sm">教えてくれた人・助けてくれた人に、一言で伝えましょう。</span>
              </span>
              <span aria-hidden className="text-brand03 text-xl">
                ›
              </span>
            </Link>
          ) : null}
          <TodayActions userId={userId} />
          <Key>
            ロングが作りたいのは、ミスをしない人だけを評価する会社ではありません。教わり、挑戦し、失敗から学び、その経験を次の人へ渡せる会社です。
          </Key>
        </Section>

        <Section en="ASK US" ja="気になることは" title="遠慮なく聞いてください">
          <div className="grid gap-4 sm:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title} className="border-brand01 border-t-[3px] pt-3">
                <p className="text-brand01 font-bold">{p.title}</p>
                <p className="text-brand04 mt-1 text-sm">{p.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </article>
  );
}
