# LINE WORKS の Bot 基盤の計画(案・未確定)

作成: 2026-10-21。**まだ実装していない。ユーザーの判断待ち**。
設計の正は `docs/DESIGN.md`。この案を採用する場合は、先に DESIGN.md を更新する(36 章として足す想定)。

---

## ユーザーの希望(2026-10-21 の会話より)

- LONG PORTAL の中で、LINE WORKS の Bot をいろいろ作りたい。
- ポータルの中で Bot を作れたら最高。作れる人は限られる。
- いま別に作っている「雨予報の通知 Bot」も、この中の 1 つにしたい。

## いまあるもの(35 章)

- `core/lineworks`: API 2.0、サービスアカウントの JWT でトークンを取り、トークルームに文字を送るだけ(送信専用)。
- Bot は「LONG PORTAL」1 つ。鍵と Bot ID は環境変数 `LINEWORKS_*`。送り先はアプリごとの環境変数。
- 受け取り口(callback)はまだない。定時実行は `vercel.json` の cron。

## おすすめの形

「Bot の**種類**はコードで用意し、Bot の**中身**(どこへ・いつ・何を)は画面で設定する」

| 決めごと | 内容 | 理由 |
|---|---|---|
| ① 新しいアプリ `apps/bots` | Bot の一覧・作成・設定の画面。manifest に権限 `bots.manage` を置く | 作れる人を権限で絞れる(deny by default) |
| ② 種類はコード | `apps/bots/kinds/<種類>.ts` に「設定の形(zod)」「定時に何をするか」「話しかけにどう答えるか」を書く。例: 雨予報、定時のお知らせ、AI の受け答え | 画面だけで何でも作れる形は壊れやすく、権限や外部 API の扱いが危ない |
| ③ 中身は DB | `bots.instances`(種類・名前・送り先の channelId・設定 JSON・有効/無効・作った人)、`bots.runs`(実行の記録) | 権限のある人が画面から追加・停止できる |
| ④ LINE WORKS 側の Bot | まずは既存の「LONG PORTAL」Bot を共用し、名前やアイコンを分けたいものだけ別の Bot を登録する(Bot ID と Bot Secret を instance に持つ) | Developer Console での Bot 登録は手作業なので、数を増やしすぎない |
| ⑤ 受け取り口 | `src/app/api/lineworks/callback/[botKey]/route.ts`。`X-WORKS-Signature`(Bot Secret による HMAC-SHA256)を確かめてから、その Bot の種類の処理に渡す | なりすましの呼び出しを防ぐ |
| ⑥ 定時実行 | `src/app/api/cron/bots/route.ts` を cron で呼び、その時刻に動く instance をまとめて実行する(`CRON_SECRET` で保護) | cron の登録を Bot ごとに増やさなくてよい |
| ⑦ 鍵 | 共通の鍵は今の `LINEWORKS_*` のまま。別 Bot の Secret は環境変数に置き、DB には名前だけ持つ | 秘密を DB に平文で置かない |

## 最初の Bot(案)

- **雨予報**: 拠点(core の locations)ごとに、朝の決まった時刻に、その日の降水確率がしきい値以上なら部屋に知らせる。天気は外部 API(気象庁の予報 JSON か Open-Meteo)。いま作っているコードを確認してから決める。

## 未確定(ユーザーに確認中)

1. 雨予報 Bot のコードの場所と、今の作り(何の API、どこで動かしているか)。
2. 雨予報のほかに最初に作りたい Bot。
3. 作れる人は system_admin だけか、新しい権限 `bots.manage` を特定の人に渡すか。
4. Vercel のプラン(Hobby だと cron は 1 日 1 回まで。雨予報が朝 1 回なら足りる)。
