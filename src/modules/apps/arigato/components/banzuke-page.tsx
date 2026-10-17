import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { KACHIKOSHI, RANKS, RANK_LABEL, kanjiNumber, kojoText, shikonaCandidates, type Rank } from "../banzuke";
import { getBanzukePage, getFamilyName, takenShikona, type BanzukeRow } from "../banzuke-queries";
import { ARIGATO_TAG_LABEL, type ArigatoTag } from "../constants";
import { manifest } from "../manifest";
import { KojoChooser, ShikonaChooser } from "./banzuke-choosers";
import styles from "./banzuke.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** 番付表の段。幕内(横綱〜前頭)・十両・幕下・序ノ口・前相撲。 */
const TIERS: { ranks: Rank[]; cls: string }[] = [
  { ranks: ["yokozuna", "ozeki", "sekiwake", "komusubi", "maegashira"], cls: styles.t1 },
  { ranks: ["juryo"], cls: styles.t2 },
  { ranks: ["makushita"], cls: styles.t3 },
  { ranks: ["jonokuchi"], cls: styles.t3 },
  { ranks: ["maezumo"], cls: styles.t3 },
];

const TAG_SHORT: Record<ArigatoTag, string> = { taught: "教えて", helped: "助けて", challenged: "挑戦", systemized: "仕組み" };
const FLAG_COLORS = ["#1f4f96", "#8a2b1d", "#2f6b3f", "#6b3a85", "#a8741a", "#3d4d63"];
const SANSHO_LABEL = { shukun: "殊勲賞", kanto: "敢闘賞", gino: "技能賞" } as const;

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function Cell({ row, label, me }: { row: BanzukeRow; label: string; me: boolean }) {
  return (
    <div className={cx(styles.cell, me && styles.me)}>
      <span className={cx(styles.rank, styles.v, styles.brush)}>{label}</span>
      <span className={cx(styles.from, styles.v, styles.brush)}>{row.departmentName ?? ""}</span>
      <span className={cx(styles.name, styles.v, styles.brush)}>{row.name}</span>
    </div>
  );
}

/** 片側(東か西)の段。同じ位の 2 人目からは「同」。 */
function SideTier({ rows, cls, meId }: { rows: BanzukeRow[]; cls: string; meId: string }) {
  const seen = new Set<Rank>();
  return (
    <div className={cx(styles.tier, cls)}>
      {rows.map((r) => {
        const label = seen.has(r.rank) ? "同" : RANK_LABEL[r.rank];
        seen.add(r.rank);
        return <Cell key={r.userId} row={r} label={label} me={r.userId === meId} />;
      })}
    </div>
  );
}

/** ありがとう番付の画面(`/apps/arigato/banzuke`)。 */
export async function ArigatoBanzukePage() {
  const actor = await requireAppAccess(manifest.appKey);
  const data = await getBanzukePage(actor.userId, actor.today);
  const { basho, rows, me, myWins } = data;

  const familyName = await getFamilyName(actor.userId);
  const candidates = familyName ? shikonaCandidates(familyName) : [];
  const taken = [...(await takenShikona(candidates, actor.userId))];

  const tiers = TIERS.map((t) => ({
    cls: t.cls,
    east: rows.filter((r) => t.ranks.includes(r.rank) && r.side === "east"),
    west: rows.filter((r) => t.ranks.includes(r.rank) && r.side === "west"),
  })).filter((t) => t.east.length + t.west.length > 0);

  const counts = RANKS.map((rank) => ({ rank, n: rows.filter((r) => r.rank === rank).length })).filter(
    (c) => c.n > 0 || c.rank !== "maezumo",
  );
  const rest = Math.max(KACHIKOSHI - myWins, 0);
  const stamped = data.stamps.filter((s) => s.stamped).length;
  const allMaezumo = rows.length > 0 && rows.every((r) => r.rank === "maezumo");
  const promoted = rows.filter((r) => r.promoted);

  return (
    <div className={styles.root}>
      <div className={styles.wrap}>
        <p>
          <Link href="/apps/arigato" className={styles.back}>
            ありがとうカードにもどる
          </Link>
        </p>

        <div className={styles.grid2}>
          <section className={styles.panel}>
            <p className={styles.eyebrow}>あなたの四股名</p>
            <p className={cx(styles.shikona, styles.brush)}>
              {me?.name ?? "―"}
              {me?.departmentName ? <small>{me.departmentName}部屋</small> : null}
            </p>
            {me ? (
              <p className={styles.plain}>
                いまの位は <em>{RANK_LABEL[me.rank]}</em>。{rows.length} 人中 {me.position} 番目です。
              </p>
            ) : (
              <p className={styles.plain}>次の場所から番付に載ります。</p>
            )}
            {candidates.length > 0 ? (
              <ShikonaChooser candidates={candidates} current={me?.name ?? null} taken={taken} />
            ) : null}
            <p className={styles.muted}>
              {me && !me.hasShikona ? "四股名を選ぶまでは、氏名で載ります。" : "四股名は、名字から作った候補の中から選べます。"}
            </p>
          </section>

          <section className={styles.panel}>
            <p className={styles.eyebrow}>あなたの位(上ほど強い)</p>
            <div className={styles.pyramid}>
              {counts.map((c, i) => (
                <div
                  key={c.rank}
                  className={cx(me?.rank === c.rank && styles.here)}
                  style={{ width: `${34 + i * 8}%`, background: `rgba(194, 58, 34, ${Math.max(0.32 - i * 0.035, 0.03)})` }}
                >
                  <b className={styles.brush}>{RANK_LABEL[c.rank]}</b>
                  <span>{c.n}人</span>
                </div>
              ))}
            </div>
            <p className={styles.muted}>上の位ほど、ありがとうをたくさん送っている人です。</p>
          </section>
        </div>

        <section className={styles.panel}>
          <p className={styles.eyebrow}>
            今場所({md(basho.start)}〜{md(basho.end)})の白星
          </p>
          <p className={cx(styles.bigCount, styles.solid)}>
            <span>
              白星 <em>{myWins}</em> つ
            </span>
            <small>= ありがとうを {myWins} 回送った</small>
          </p>
          <div className={styles.dots} aria-label={`白星 ${KACHIKOSHI} つのうち ${Math.min(myWins, KACHIKOSHI)} つ`}>
            {Array.from({ length: KACHIKOSHI }, (_, i) => (
              <span key={i} className={cx(i < myWins && styles.on, i === KACHIKOSHI - 1 && i >= myWins && styles.goal)}>
                {i === KACHIKOSHI - 1 && i >= myWins ? "昇" : ""}
              </span>
            ))}
          </div>
          <p className={styles.kachi}>
            {rest > 0 ? `あと ${rest} つで、次の場所は位が上がる目安です` : "勝ち越し。次の場所は位が上がる見込みです"}
          </p>
          <p className={styles.muted}>
            {md(basho.end)} までに白星が {KACHIKOSHI} つ以上なら位が上がり、{KACHIKOSHI - 1} つ以下なら下がります。いちばん多い人が優勝です。
          </p>
        </section>

        <section className={styles.panel}>
          <p className={styles.eyebrow}>今場所もらったありがとう(懸賞)</p>
          {data.myKensho.length > 0 ? (
            <div className={styles.kensho}>
              {data.myKensho.map((k, i) => (
                <div key={k.id} className={styles.flag} style={{ background: FLAG_COLORS[i % FLAG_COLORS.length] }} title={ARIGATO_TAG_LABEL[k.tag]}>
                  <span className={cx(styles.k, styles.v)}>{TAG_SHORT[k.tag]}</span>
                  <span className={cx(styles.v, styles.brush)}>{k.fromName}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>まだありません。</p>
          )}
          <p className={styles.muted}>もらったありがとうは、相撲の懸賞旗のように並びます。位は変わりませんが、三賞を決めるときに使います。</p>
        </section>

        <h2 className={cx(styles.sectionTitle, styles.solid)}>番付表(全員)</h2>
        <p className={styles.muted}>
          右半分が東、左半分が西です。外側ほど位が上で、いちばん外が横綱です。まん中の字は本物の番付表の決まり文句で、飾りです。
          {allMaezumo ? "最初の場所は、全員が前相撲(同じところ)からはじまります。" : null}
        </p>
        <section className={styles.banzuke} aria-label={`${basho.fullName}の番付表`}>
          <div className={cx(styles.half, styles.west)}>
            <div className={cx(styles.sideHead, styles.brush)}>西</div>
            {tiers.map((t, i) => (
              <SideTier key={i} rows={t.west} cls={t.cls} meId={actor.userId} />
            ))}
          </div>
          <div className={styles.center} aria-hidden="true">
            <div className={cx(styles.gomen, styles.v, styles.brush)}>蒙御免</div>
            <div className={cx(styles.basho, styles.v, styles.brush)}>{basho.fullName}</div>
            <div className={cx(styles.cSmall, styles.v, styles.brush)}>勧進元 株式会社ロング</div>
            <div className={cx(styles.cSmall, styles.v, styles.brush)}>此外中前相撲東西ニ御座候</div>
            <div className={cx(styles.banzai, styles.v, styles.brush)}>千穐萬歳大々叶</div>
          </div>
          <div className={cx(styles.half, styles.east)}>
            <div className={cx(styles.sideHead, styles.brush)}>東</div>
            {tiers.map((t, i) => (
              <SideTier key={i} rows={t.east} cls={t.cls} meId={actor.userId} />
            ))}
          </div>
        </section>

        {promoted.length > 0 ? (
          <section className={styles.dentatsu} aria-label="伝達式">
            <p className={styles.eyebrow}>{basho.fullName} 昇進伝達式</p>
            {me?.promoted && !me.kojoWord ? (
              <>
                <h2 className={cx(styles.panelTitle, styles.solid)}>番付編成会議の使者が参りました</h2>
                <p className={styles.shisha}>
                  「本日の番付編成会議で、{me.name}関の{RANK_LABEL[me.rank]}昇進が満場一致で決まりました。謹んでお伝えいたします。」
                </p>
                <p className={styles.muted} style={{ color: "inherit" }}>
                  口上に入れる四字熟語を選んでください。選んだ口上は、この画面にみんなに見える形で載ります(選び直しはできません)。
                </p>
                <KojoChooser />
              </>
            ) : null}
            {promoted.map((p) => (
              <p key={p.userId} className={styles.kojo}>
                新{RANK_LABEL[p.rank]} <b className={styles.brush}>{p.name}</b>
                <br />
                {p.kojoWord ? `「${kojoText(p.kojoWord, p.rank)}」` : "(口上はまだです)"}
              </p>
            ))}
          </section>
        ) : null}

        {data.prev && (data.prev.yusho || data.prev.sansho.length > 0) ? (
          <div className={styles.grid2}>
            {data.prev.yusho ? (
              <section className={styles.hyosho} aria-label="表彰状">
                <div className={cx(styles.hyoshoText, styles.v)}>
                  <span className={cx(styles.ttl, styles.brush)}>表彰状</span>
                  <span className={cx(styles.big, styles.brush)}>
                    {data.prev.yusho.side === "east" ? "東" : "西"}
                    {RANK_LABEL[data.prev.yusho.rank]} {data.prev.yusho.name} 殿
                  </span>
                  <span>あなたは{data.prev.basho.fullName}において</span>
                  <span>白星{kanjiNumber(data.prev.yusho.wins)}の好成績をあげ</span>
                  <span>優勝を遂げられました</span>
                  <span>よってこれを賞します</span>
                  <span>株式会社ロング</span>
                </div>
              </section>
            ) : null}
            {data.prev.sansho.length > 0 ? (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>{data.prev.basho.name}の三賞</p>
                <ul className={styles.sansho}>
                  {data.prev.sansho.map((s) => (
                    <li key={s.kind}>
                      <b className={styles.brush}>{SANSHO_LABEL[s.kind]}</b>
                      <span>
                        <b className={styles.brush}>{s.name}</b>
                        {s.departmentName ? `(${s.departmentName})` : ""}。{s.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        <section className={styles.karte} aria-label="今週の一枚 スタンプカード">
          <div className={styles.karteHead}>
            <h2>今週の一枚 スタンプカード</h2>
            <p>
              しこな <span className={styles.brush}>{me?.name ?? ""}</span>
            </p>
          </div>
          <p style={{ fontSize: 13 }}>{basho.name}の週ごとに、1 枚でも送った週に判子を押します。</p>
          <div className={styles.weeks}>
            {data.stamps.map((s) => (
              <div key={s.start} className={cx(styles.week, s.future && styles.future, s.current && styles.current)}>
                <span className={styles.d}>{md(s.start)}〜</span>
                <div className={styles.slot}>
                  {s.stamped ? (
                    <span className={cx(styles.hanko, styles.brush)}>
                      感<br />謝
                    </span>
                  ) : s.current ? (
                    <Link href="/apps/arigato" style={{ color: "inherit" }}>
                      今週の
                      <br />
                      一枚を送る
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <p style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", fontSize: 13 }}>
            <span>
              判子 <b>{stamped}</b> / {data.stamps.length}
            </span>
            <span className={cx(styles.award, stamped === data.stamps.length && styles.on)}>皆勤賞(全部そろう)</span>
          </p>
        </section>

        <section className={cx(styles.panel, styles.rules)}>
          <h2 className={cx(styles.panelTitle, styles.solid)}>決まりは 4 つだけ</h2>
          <ol>
            <li>
              <b>ありがとうを 1 回送ると、白星が 1 つ。</b>同じ相手には 1 日 1 つまでです。
            </li>
            <li>
              <b>2 か月がひと場所。</b>白星が {KACHIKOSHI} つ以上なら次の場所で位が上がり、{KACHIKOSHI - 1}{" "}
              つ以下なら下がります。多いほど大きく上がります。
            </li>
            <li>
              <b>白星がいちばん多い人が優勝。</b>優勝すると大関に、大関で 2 回続けて優勝すると横綱になります。横綱は下がりません。
            </li>
            <li>
              <b>もらったありがとうは「懸賞」。</b>位は変わりませんが、三賞を決めるときに使います。
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
