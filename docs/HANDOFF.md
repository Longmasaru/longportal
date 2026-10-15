# LONG PORTAL 引き継ぎ書(経緯・決定事項・運用・注意点)

別の環境(デスクトップ版の Claude など)や新しいセッションで、これまでの作業を**途切れなく**続けるための文書。
設計の正は `docs/DESIGN.md`、こちらは「経緯・約束事・運用手順・落とし穴・現在地」をまとめたもの。
最終更新: 2026-10-14(手順 0〜5、ログイン強化、本番公開、Cloudflare R2 の基盤まで完了した時点)。

---

## 0. 新しいセッションの始め方

1. 作業フォルダを `C:\Users\masarunagai\projects\LONG-PORTAL` にして開く(`CLAUDE.md` と、この文書が自動で読み込まれる)。
2. 最初の指示の例: 「`docs/HANDOFF.md` と `docs/DESIGN.md` を読んで、現在地を 5 行で要約してから、手順 6 の計画を提示して。まだ実装は始めないで。」
3. ユーザー共通の指示(`~/.claude/CLAUDE.md`)で、**常に日本語で応答**する設定になっている。

## 1. これは何か・誰のためか

- 株式会社ロング(金沢)の**社内ポータル基盤「LONG PORTAL」**。単なるダッシュボードではなく、今後多数の社内業務アプリ(TODO、教育・スキル、改善提案、出し直し管理、マニュアル、設備管理など)を載せていく**共通基盤**。
- 利用者は社員。管理者(ユーザー本人 = 長井(「永井」ではない)。Git の作者名は `Longmasaru`、メールは `m.nagai@e-long.co.jp`)が、社員・組織・権限・対象者を管理する。
- ユーザーは、専門用語が多いと負担になるため、**平易な日本語で、結論を先に**説明されることを好む。

## 2. ユーザーとの作業の約束事(重要)

| 約束事 | 内容 |
|---|---|
| 言語 | 常に日本語。専門用語は、短く言い換えるか、意味を添える |
| 画面操作の案内 | **1 手順ずつ、ゆっくり**。区切りごとに止めて、**スクリーンショット**(ユーザーは「スクショ」「すくしょ」と送る)で確認する。スクショは `C:\Users\masarunagai\OneDrive\画像\スクリーンショット\` に保存され、最新のものを読む |
| コミット・プッシュ | **「コミットして」「プッシュして」と言われたときだけ**行う。事前に提案して承認を得た一連の作業(例: 本番反映)は、承認の範囲で続けてよい |
| 秘密情報 | **チャットに貼らせない**。接続文字列やキーは、ファイル(`.env.local`、`.env.production.local`)に書いてもらい、私が値を表示せずに使う。貼られてしまったら、再発行を勧める。作業後に本番用の一時ファイルは削除する |
| 本番 DB | 勝手に変更しない。実行前に「接続先が本番のホストか」を確認し、`DB_TARGET=production CONFIRM_PRODUCTION=yes` のガードを通す。実行の承認は、ユーザーの明示的な指示で得る |
| 外向きの操作 | GitHub への送信、Vercel の設定変更、Cloudflare の設定などは、事前に内容を伝える |
| 報告の形 | 完了時は、「できたこと」「確認した内容」「まだのこと」「次のご判断」の順。確認していないことは、確認していないと書く |
| 検証 | 実装したら、lint・型チェック・テスト・ビルドを通し、可能なら実際に動かして確認する。確認用データは、必ず削除する(開発 DB の `zz_` 接頭辞など) |

## 3. 設計の要点(詳細は DESIGN.md)

- **モジュラーモノリス**: `src/app` は薄いルート、本体は `src/modules`(`core/` と将来の `apps/`)。依存方向は `app → apps → core` の一方向。ESLint で境界を検査。
- **DB**: PostgreSQL(Neon)+ **Drizzle ORM + 正式 migration + `pgSchema`**。起動時の自動 DDL(`ensureSchema` など)は使わない。主キーは全テーブル UUID。日付は JST の暦日(`YYYY-MM-DD` の文字列)。
- **社員と user の分離**: `employees`(人事)と `users`(ログイン)。所属は `employee_assignments`(期間つき、主所属の期間重複は DB の排他制約で禁止)。部署と拠点は独立したマスタ。役職は権限とは無関係。
- **権限**: ロール(何ができるか)+ スコープ(拠点・部署)の割当。権限(permission)の code は**コード側で定義**して sync で DB に反映(管理画面から作れない)。`system_admin` は保護(削除不可、アクセスできる最後の 1 人は剥奪・無効化・退職扱い不可)。
- **Audience**: 対象者の条件(グループ内 AND、グループ間 OR)を保存し、見るたびに現在の社員に当てて評価。部署と拠点は**同じ 1 件の所属**が満たす場合のみ成立(兼務対応)。グループ 0 個 = 誰も対象にならない。
- **アクセス判定**: deny by default。JWT には `userId` だけ。ユーザーの有効性・社員の在籍状態(入社日・退職日)・権限は、**毎回 DB で確認**(`resolveActor`)。`proxy.ts` は粗い入口だけ。
- **監査ログ**: 重要な管理操作を、変更と同じトランザクションで記録(秘密情報は含めない)。

## 4. 現在地

### 完了(すべてコミット・GitHub 反映済み。最新の本番デプロイも Ready)
| 区分 | 内容 |
|---|---|
| 手順 0・1 | 開発基盤、core スキーマ(組織・人) |
| 手順 2 | 認証(ログイン、強制パスワード変更、在籍状態の毎回判定) |
| 手順 3 | 組織マスタ・社員・所属履歴(異動)・アカウント発行の管理画面、警告 |
| 手順 4 | ロール・権限・スコープ付き割当、`system_admin` 保護、異動時のロール警告、監査ログ閲覧 |
| 手順 5 | Audience(保存・評価・管理画面。評価は全社員をメモリ上で、単一社員の判定と同じ関数で行う) |
| 本番公開 | Vercel + Neon 本番ブランチ。migration 6 本、初期データ投入済み |
| ログイン強化 | 入力長の上限(ID 50 / PW 200)、失敗回数の制限(ID は 15 分 5 回、接続元は 15 分 50 回。`core.login_attempts`)、セキュリティヘッダー |
| ファイル保管 | Cloudflare R2 の基盤(`core/storage`、署名付き URL、接続確認 `npm run r2:check`、CORS 設定済み) |
| 最初の業務アプリ | `apps/sodatsu`(人事ポリシー「育てて、育つ。」の紹介。`/apps/sodatsu`、閲覧のみ・DB なし・専用権限なし。記入欄とふりかえりは端末のブラウザにだけ保存)。サイドバーへの表示は、手順 6 までは `queries.ts` の `listVisibleApps` が固定で返している |

### 社員データ(2026-10-14)
- 社内サーバーの `社員名簿.xls`(「名簿 (2)」シート)から、在籍 54 人を**開発 DB に取り込み済み**(`npm run db:import-employees`、DESIGN.md 21 章)。**本番は未実施**。
- 取り込んだのは 社員番号・氏名・フリガナ・役職・部署・入社日 だけ。雇用区分は全員「正社員」で仮置き。
- 2026-10-15: 開発 DB に拠点 3 つ(本社工場・2号店・B工場。白山工場は今はない)を登録し、54 人全員に「部署(名簿どおり。1005 は総務・経理)× 本社工場」の主所属を作った。2号店は溶接、B工場はレーザーの人だけがいるので、**所属の割り当て画面**(`/admin/employees/assignments`。部署は選択欄、拠点は丸で選ぶ表。管理者が個別に変えると、そのまま DB に保存される)で選び直す。
- **本番 DB にも投入済み(2026-10-15)**: 拠点 3 つ、部署 8・役職 6、社員 54 人(画面で手登録されていた「052」は名簿の「0052」に番号を直して重複を防いだ)、全員に「部署 × 本社工場」の主所属。**本番のアカウントは未発行**(ユーザーの判断。お知らせ・アプリの中身と、社内確認(Vercel のプラン、DB の場所)のあとで `npm run db:issue-accounts` で発行する)。2号店・B工場の割り当ては、本番の所属の割り当て画面で行う。
- 本番の URL は独自ドメイン `https://long-ishikawa.com` に変わっている(`longportal.vercel.app` は転送)。R2 の CORS の許可オリジンに、このドメインを足す必要がある(`docs/r2-cors.json`、未対応)。
- 54 人にアカウントを発行済み(開発 DB。ログイン ID = 社員番号。`npm run db:issue-accounts`)。名簿にない社員が開発 DB に 1 人いる(以前の確認用と思われる。主所属がないため発行していない)。

### まだ「枠だけ」の部分
- 見本(架空)のデータは 2026-10-14 に削除した(`mock-data.ts`)。ホームとサイドバーの**お知らせ・アプリ・社内リンク・要対応**は、`queries.ts` の `listVisible*` が空を返す(アプリは apps/sodatsu だけを固定で返す)ので、枠と「まだありません」の表示だけが出る。実装時は、この関数の中身を差し替える。
- `/notices/*`、`/admin/apps` は「準備中」ページ(`[...slug]` のキャッチオール)。

### 次にやること(順番)
1. **手順 6**: app registry(コード側の manifest + DB の運用設定)、manifest の同期(`npm run sync:manifests` に、アプリの権限と `app_registry` を追加)、`canAccessApp` / `requireAppAccess`。サイドバーとホームのアプリ表示を、Audience の判定につなぐ。Audience の「利用先」の表示と「利用中は削除不可」(`listAudienceUsages`)もここで有効にする。
2. ~~**手順 7**~~(2026-10-15 完了・本番反映済み): お知らせ(全社・Audience・個人指定、通常・重要・緊急、ホームのバナー、既読、確認ボタン)と社内リンク。管理画面 `/admin/notices`・`/admin/links`、権限 `core.notices.manage`・`core.links.manage`。DESIGN.md 23 章。
3. **手順 8**: TODO アプリの移植(TODOSample から。TODO は `user_id` に紐づく個人データ。Claude による自動分類、R2 添付ファイルも含む)。添付のメタ情報テーブル(ファイル名・サイズ・所有者)は、このときに migration で追加する。
4. 以後: 教育・スキル、改善提案、出し直し管理、マニュアル、設備管理など。

### 社員にアカウントを配る前のチェック(未了)
- ~~見本データの除去~~(2026-10-14 に完了)。お知らせ・アプリ・社内リンクの実装(手順 6・7)。
- Vercel の **Hobby プランは個人・非商用向け**(利用規約を要確認)。会社の業務利用では Pro が必要になる可能性。
- **DB がシンガポール**(Neon の AWS ap-southeast-1)にあることの、社内の個人情報の取り扱いルールでの確認。
- 追加の強化候補: パスワード変更画面の失敗制限、ロックの管理者への通知、2 要素認証、CSP、CSV 一括登録(社員)。

## 5. インフラ・環境(外側の構成は TODOSample と同じ)

| 要素 | 内容 |
|---|---|
| コード | GitHub `Longmasaru/longportal`(`main`。ローカルの git の作者は `Longmasaru` / `m.nagai@e-long.co.jp`) |
| 公開 | Vercel `longmasaru/longportal`(個人スコープ、Hobby)。`main` への push で**自動デプロイ**。本番 URL `https://longportal.vercel.app`。Functions の地域は `vercel.json` で **sin1**(TODOSample は iad1)。Node 24.x |
| DB | Neon の project `longdashbord`、リージョン ap-southeast-1。**ブランチは 2 つ**: `development`(手元の開発)、`production`(本番)。接続は、実行時は pooler、migration は direct |
| ファイル | Cloudflare R2 のバケット `longportal`(**1 つのみ・非公開**)。API トークンは `longportal` 専用(オブジェクトの読み書き)。開発/本番は、キーの頭(`dev/`、`prod/`)で区別(**権限の分離ではない**) |
| AI | Anthropic API(TODO アプリの自動分類で使う予定。まだ未組み込み) |

### 環境変数(名前のみ。値はここにも書かない)
| 場所 | 変数 |
|---|---|
| 手元 `.env.local`(開発 DB) | `DATABASE_URL`(pooler)、`DATABASE_URL_UNPOOLED`、`AUTH_SECRET`、`DB_TARGET=development`、`R2_*` 5 つ(`R2_KEY_PREFIX=dev/`)。初期管理者用の `SEED_ADMIN_*` は使用後に削除してよい |
| Vercel Production(すべて Secret) | `DATABASE_URL`(本番 pooler)、`AUTH_SECRET`(本番専用)、`R2_*` 5 つ(`R2_KEY_PREFIX=prod/`) |
| Vercel Preview | `R2_*` 5 つ(`R2_KEY_PREFIX=dev/`)。`DATABASE_URL` などは未登録(`main` 以外に push していないため) |
| 本番用の一時ファイル | `.env.production.local`(本番 DB へ migration する間だけ作り、終わったら削除。`.gitignore` の対象) |

- Vercel に `DATABASE_URL_UNPOOLED` は**置かない**(アプリは使わない。migration は手元から実行)。
- 本番 DB のパスワードは、チャットに貼られたため再発行済み(Vercel の `DATABASE_URL` はユーザーが画面で更新)。次に本番へ migration するときは、新しい接続文字列をユーザーに `.env.production.local` へ保存してもらう。

### TODOSample との違い(意図的)
| | TODOSample | LONG PORTAL |
|---|---|---|
| テーブル作成 | 起動時に自動(`ensureSchema`) | 正式な migration を明示実行 |
| DB | 開発と本番が同じ | 開発用と本番用を分離 |
| 地域 | 米国東部 | シンガポール(DB と同じ) |
| 機密の環境変数 | 一部は画面から見える | すべて Secret |
| 内部設計 | 単一アプリ | 上記の新設計 |

## 6. 運用手順(Runbook)

### 通常の開発
1. 実装 → `npm run lint` / `npm run typecheck` / `npm test` / `npm run build`。
2. 動作確認(必要なら開発 DB に、`zz_` 接頭辞の確認用データを作り、終わったら削除)。
3. 「コミットして」と言われたらコミット(直前に、追跡対象への秘密情報の混入を、**実際の値で検索して**確認)。
4. 「プッシュして」と言われたら `git push`。Vercel が自動でデプロイ(`vercel ls --scope longmasaru` で Ready を確認、本番 URL を確認)。

### DB の変更(スキーマ)
1. スキーマを編集 → `npx drizzle-kit generate --name=...`(EXCLUDE などは `--custom` で手書き)。
2. 開発 DB に適用: `npx drizzle-kit migrate`(`.env.local`)。
3. **本番に適用するのは、コードを `main` に送る前**(新しいテーブルを使うコードが先に出ても、ログインは止まらない設計だが、確実にするため)。手順: ユーザーが `.env.production.local` に本番の接続文字列(pooler あり・なし)を保存 → 本番ホストであることを確認 → `set -a; . ./.env.production.local; set +a` のうえで `DB_TARGET=production CONFIRM_PRODUCTION=yes npx drizzle-kit migrate` → 読み取りだけで結果を確認 → ファイルを削除。
4. 初期データ・権限の同期: `npm run db:seed`(冪等)、`npm run sync:manifests`。管理者の復旧: `npm run db:grant-admin -- <login_id>`。

### その他のコマンド
`npm run dev` / `build` / `lint` / `typecheck` / `test` / `db:generate` / `db:migrate` / `db:check` / `db:seed` / `sync:manifests` / `db:grant-admin` / `r2:check`。

## 7. 技術的な落とし穴(再発防止メモ)

- **シェルのヒアドキュメントで、日本語や記号を含む長い文章が失敗する**ことがある → ファイル作成は **Write ツール**を使う。
- **`.next/dev/types/routes.d.ts` が壊れて型チェックが落ちる**(開発サーバーと `next typegen` / `build` が同時に書き換える) → `rm -rf .next/dev/types && npx next typegen` のあとに、型チェックとビルドをやり直す。
- **`drizzle-kit migrate` は、`DATABASE_URL_UNPOOLED` のパスワードが古いと、エラーを表示せずに終了する**(終了コードは 1) → 失敗したら、`DATABASE_URL` から `-pooler` を除いて `UNPOOLED` を作り直す。成功は「migrations applied successfully」で確認する。
- **npm の出力に色コードが付き、`grep` が空振りする** → 出力をファイルに書き、`sed 's/\x1b\[[0-9;]*m//g'` で色を除いてから検索する。
- **`vercel link` は `.env.local` に `VERCEL_OIDC_TOKEN` を足し、`.gitignore` に重複行を足す** → 実行前に `.env.local` をバックアップし、実行後に元へ戻す(`git checkout -- .gitignore`)。
- **Next.js 16 の `proxy.ts` は、標準で Node.js ランタイム**。Server Action は proxy を通らないことがあるため、認可は各アクションで本判定する。
- **Vercel の `env add` は、`--sensitive --yes` で非対話に登録できる**(値は標準入力から渡し、画面に出さない)。`preview` も同様に登録できる。
- **`vercel curl` は beta で不安定**。公開 URL には、通常の `curl` で足りる(本番の `/login` は保護なしで 200)。
- **`localhost:3000` の開発サーバーは、ユーザーが自分で起動していることがある** → 勝手に停止しない(プロセスの正体を確認してから)。
- **PC のメモリが逼迫すると、シェルが極端に遅くなる**(空きが約 1GB のとき)。重い処理は、バックグラウンド実行にして、出力ファイルを読む。
- **ブラウザ操作(Playwright)の MCP は、接続できないことがある**。その場合は、ログイン API を `curl` で直接たたく、DB の確認を `tsx` で行う、などで代替する。
- **Git の「LF → CRLF」の警告**は、Windows の設定によるもので、無害。
- **Cloudflare の API トークン(オブジェクトの読み書き)では、バケットの設定(CORS)は変えられない**。CORS は、ユーザーが Cloudflare の画面から設定する(内容は `docs/r2-cors.json`)。独自ドメインやポートを変えたら、更新が必要。

## 8. 参照

- **`docs/playbooks/new-app-setup.md`**: 新しいアプリを作る・GitHub / Neon / Vercel / Cloudflare につなぐ・本番に出す・環境変数を作るときの**標準手順書**(LONG PORTAL と TODOSample で確立した流れ。ユーザーは覚えておらず、Claude が主導して進める)。ユーザー共通の指示 `~/.claude/CLAUDE.md` にも、これを先に読む指示を入れてある。この文書(5〜7 章)の運用手順と落とし穴は、この手順書にも反映されている。手順に変更や新しい落とし穴があれば、両方を更新する。
- `docs/DESIGN.md`: 確定した設計(1〜20 章。13〜20 章が、実装時の取り決めと変更点)。
- `docs/design-system-long-kanazawa.md`: ロングのデザインシステム(配色・書体。ポータルでは流体フォントを使わず、ルート 16px 固定)。
- `docs/r2-cors.json`: R2 の CORS 設定の内容。
- `CLAUDE.md` / `AGENTS.md`: コマンド、守るべき規則、Next.js 16 の注意(`node_modules/next/dist/docs/` を確認する)。
- 参考実装: `C:\Users\masarunagai\projects\TODOSample`(Vercel 本番 `todosample-pied.vercel.app`)。手順 8 で、TODO の画面・処理・Claude 分類・R2 添付の実装を参照する。TODOSample 側には、権限が広い R2 トークン(管理者・全バケット)と、古い Next.js(16.3.1)が残っている(別件で見直しを提案する予定)。
