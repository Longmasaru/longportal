import Link from "next/link";
import { RANK_LABEL } from "../banzuke";
import { getMyBanzukeSummary } from "../banzuke-queries";
import styles from "./banzuke.module.css";

/** アプリの画面の上に出す、自分の位と今場所の白星(押すと番付の画面へ)。 */
export async function BanzukeSummary({ userId, today }: { userId: string; today: string }) {
  const s = await getMyBanzukeSummary(userId, today);
  return (
    <Link href="/apps/arigato/banzuke" className={styles.summary}>
      <span className={`${styles.rankBig} ${styles.brush}`}>
        {s.rank ? RANK_LABEL[s.rank] : "新弟子"}
      </span>
      <span className={styles.meta}>
        <span>
          {s.basho.name}
          {s.place ? `・${s.total} 人中 ${s.place} 番目` : "・次の場所から番付に載ります"}
        </span>
        <span>
          白星 <b>{s.wins}</b> つ(ありがとうを送るほど、位が上がります)
        </span>
      </span>
      <span className={styles.go}>番付と、送るとどうなるかを見る →</span>
    </Link>
  );
}
