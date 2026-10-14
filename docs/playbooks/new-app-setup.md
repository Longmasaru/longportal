# 新しいアプリを作るときの標準手順書(GitHub / Neon / Vercel / Cloudflare R2 / 環境変数)

**この手順書は、特定のアプリに依存しない。** 新しいアプリ(社内ツール、ポータル、検証用のアプリなど)を作って、GitHub・Neon・Vercel・Cloudflare とつなぎ、本番に出すときは、**必ずこの手順書を先に読み、この流れで進める。**
実績: LONG PORTAL(2026-10)、TODOSample(2026-10)。LONG PORTAL の経緯は `docs/HANDOFF.md`、設計は `docs/DESIGN.md`。

---

## 0. Claude への指示(最初に読むこと)

### 0.1 ユーザーの前提
- ユーザー(永井さん)は、**この手順を覚えていない・覚えられない**。だから、**Claude が主導して**進め、毎回、次にやることを平易な日本語で案内する。専門用語は、短く言い換える。
- ユーザーは「色々任せたい」と考えている。**ブラウザでしかできない操作と、秘密の値の入力だけをお願いし、それ以外は Claude が行う。**
- 画面操作をお願いするときは、**1 手順ずつ、ゆっくり**。区切りごとに止めて、**スクリーンショット**(ユーザーは「スクショ」と送る。保存先は `C:\Users\masarunagai\OneDrive\画像\スクリーンショット\`。最新のファイルを読む)で確認する。ボタン名は、画面の表記(日本語 UI のことが多い)で案内する。

### 0.2 任せ方のルール(一括承認と、止まる場所)
1. 開始時に、**計画を 1 回だけ**提示する: 何を作るか、使うサービス、これから行う**外向きの操作**(GitHub への送信、Vercel のプロジェクトと環境変数の登録、Neon・R2 の設定、本番 DB への migration)、あなたにお願いする操作。**そこで、ユーザーの承認を 1 回もらう。**
2. 承認後は、計画の範囲で、**確認を重ねずに進める**。止まるのは、次の場合だけ。
   - ユーザーの操作が必要なとき(ブラウザの操作、秘密の値のファイルへの保存)。
   - **本番 DB への書き込み**の直前(接続先が本番のホストであることを確認して実行。初回の承認に含まれていれば、続けてよい。含まれていなければ確認する)。
   - 計画にない外向きの操作、削除・上書き・強制送信(`--force`)・パスワードの再発行など、**元に戻しにくい操作**。
   - 想定外のエラーや、判断が分かれるとき(選択肢と推奨を示して聞く)。
3. **コミット・プッシュ**: 「コミットして」「プッシュして」と言われたときに行う。ただし、承認済みの計画に「コミットして送る」まで含まれているなら、その範囲で行う。
4. 判断が必要な項目は、**推奨の既定値を添えて、まとめて 1 回で聞く**(1 つずつ聞かない)。
5. 完了時の報告は「できたこと / 確認した内容 / まだのこと / 次のご判断」の順。**確認していないことは、確認していないと書く。**

### 0.3 秘密情報の鉄則
- **チャットに貼らせない。** 接続文字列・APIキー・パスワードは、ユーザーが**ファイル**(`.env.local` / `.env.production.local`)に保存し、Claude は**値を表示せずに**使う(形式の確認は「桁数」「ホスト名」だけ)。
- ユーザーがチャットに貼ってしまったら、**再発行を勧める**(使った場合も、使ったことを伝える)。
- Vercel には、**Secret(`--sensitive`)** で登録する。コミット前に、**実際の値で**追跡対象を検索して、混入がないことを確認する。
- 手元の `.env.production.local` などの一時ファイルは、作業が終わったら**削除**する。

---

## 1. 全体像

```
        ┌───────────┐  push(main)  ┌──────────┐   自動デプロイ   ┌───────────────┐
 手元PC │  ソース    │ ───────────▶ │  GitHub   │ ──────────────▶ │    Vercel      │ ← 利用者がアクセス
        └───────────┘              └──────────┘                  │ (本番・Preview) │
   │ migration/seed(手元から明示実行)                              └──────┬────────┘
   ▼                                                                      │ 環境変数
┌────────────────┐                                                        ▼
│ Neon(PostgreSQL)│ ◀──────────── DATABASE_URL ───────────────────────────┤
│ development/    │                                                        │
│ production      │      Cloudflare R2(ファイル)◀── R2_* ────────────────┘
└────────────────┘
```

| 役割 | サービス | 備考 |
|---|---|---|
| コード | GitHub(Private) | `main` への push が、本番デプロイの合図 |
| 公開 | Vercel(個人スコープ `longmasaru`) | Hobby は個人・非商用向け。会社の業務利用は Pro が必要になる可能性 |
| DB | Neon(PostgreSQL) | **開発用と本番用のブランチを分ける**。実行時は pooler、migration は direct |
| ファイル | Cloudflare R2 | 非公開のバケット + 署名付き URL(5 分) |
| ログイン | Auth.js v5 beta(Credentials、JWT) | 秘密は `AUTH_SECRET`(環境ごとに別の値) |

### 環境変数の置き場所
| 環境 | 場所 | 主な変数 |
|---|---|---|
| 手元の開発 | `.env.local`(`.gitignore` 済み) | `DATABASE_URL`(開発 pooler)、`DATABASE_URL_UNPOOLED`、`AUTH_SECRET`、`DB_TARGET=development`、`R2_*` |
| 本番 | Vercel の Production(Secret) | `DATABASE_URL`(本番 pooler)、`AUTH_SECRET`(本番専用)、`R2_*`(`R2_KEY_PREFIX=prod/`) |
| Preview | Vercel の Preview(Secret) | `R2_*`(`dev/`)。DB を使うなら開発用の `DATABASE_URL` |
| 本番 DB への作業中 | `.env.production.local`(一時。終わったら削除) | 本番の `DATABASE_URL`、`DATABASE_URL_UNPOOLED`、`DB_TARGET=production`、`CONFIRM_PRODUCTION=yes` |

- `DATABASE_URL_UNPOOLED` は、**Vercel には置かない**(アプリは使わない。migration は手元から実行する)。

---

## 2. 事前確認(Claude が行う)

```bash
git config user.name ; git config user.email     # 未設定なら、ユーザーの過去のリポジトリ(例: TODOSample)と同じ値を、そのリポジトリだけに設定
node -v ; npm -v                                  # Node 24.x を使う
vercel --version ; vercel whoami                  # ログインしていなければ、ユーザーに「! vercel login」を実行してもらう
```
- コミット作者のメールが、**GitHub のアカウントで認証済み**でないと、Vercel のデプロイが **Blocked**(「couldn't find a Git account for the commit author」)になる。Blocked になったデプロイは、Redeploy できず、新しいコミットでやり直す。
- 既存のアプリがあれば(`TODOSample` など)、その構成を参考にする(`C:\Users\masarunagai\projects\`)。

## 3. 段階別の手順

### A. プロジェクトの土台(Claude)
- Next.js(App Router)+ TypeScript + Tailwind + Drizzle ORM + Auth.js + zod。**依存は `^` なしで固定**、`engines.node` は `24.x`、`.nvmrc`、`.npmrc`(`engine-strict`、`save-exact`)。
- `.gitignore` に **`.env*`(`!.env.example` を除く)** と **`.vercel`** を入れる。`.env.example` は値を空にした雛形。
- DB は Drizzle + **正式 migration**(`drizzle-kit generate` / `migrate`)。起動時の自動 DDL(`ensureSchema` など)は使わない。
- 本番への誤実行を防ぐガード(`DB_TARGET` と `CONFIRM_PRODUCTION=yes`)を、`drizzle.config.ts` と、seed などのスクリプトに入れる(LONG PORTAL の `scripts/guard.ts` を参考)。
- `vercel.json` で **Functions の地域を DB に合わせる**(Neon がシンガポールなら `"regions": ["sin1"]`)。標準は米国東部で、DB が遠いと遅い。
- `proxy.ts`(Next.js 16)は「ログイン済みか」の粗い確認だけ。認可は、各ページ・Server Action で本判定する。

### B. GitHub(ユーザー + Claude)
1. **ユーザー**: https://github.com/new で、**Private**・README などは追加しない(空)で、リポジトリを作り、**HTTPS の URL**(`https://github.com/<ユーザー>/<名前>.git`)を伝える。(`gh` CLI は未導入のため、Claude はリポジトリを作れない。)
2. **Claude**: `git remote add origin <URL>` → `git ls-remote origin`(空であることを確認)→ `git push -u origin main`。
3. 送る前に、コミットに秘密が含まれていないことを、実際の値で検索して確認する。

### C. Neon(ユーザー + Claude)
1. **ユーザー**: Neon でプロジェクトを作る(リージョンは、利用者に近い所。変更しにくいので、最初に決める)。ブランチは `production`(最初からある)と、**`development`**(New Branch。Parent は production、**Auto-delete は Never**)。
2. **ユーザー**: 各ブランチの接続文字列を、Connect から取る(**Connection pooling オン/オフの 2 種類**)。**`development` のパスワードは、再発行して、本番と別にする**(Roles → `neondb_owner` → Reset password。ブランチ切替を確認してから押す)。
3. **ユーザー**: 開発用の接続文字列を、`.env.local` に書く(**チャットに貼らない**)。
   ```
   DATABASE_URL="(開発・pooler あり)"
   DATABASE_URL_UNPOOLED="(開発・pooler なし)"
   DB_TARGET=development
   ```
4. **Claude**: ホスト名が開発用(本番とは別)であることを確認 → 読み取りだけで接続テスト → migration と seed を実行(開発)。
5. 接続文字列の形: `postgresql://neondb_owner:<パスワード>@<ホスト>/neondb?sslmode=require&channel_binding=require`。`pg` の SSL の警告は、`sslmode=verify-full` に正規化して避ける。

### D. Vercel(ユーザー + Claude)
1. **ユーザー**: https://vercel.com の Add New → Project → GitHub のリポジトリを **Import**(個人スコープ)。最初のデプロイは、環境変数がないため、画面が動かなくてよい。
2. **Claude**: `vercel link --yes --project <名前> --scope <スコープ>` で手元と接続。**注意**: この操作は `.env.local` に `VERCEL_OIDC_TOKEN` を足し、`.gitignore` に重複行を足す → **実行前に `.env.local` をバックアップし、実行後に元へ戻す**(`git checkout -- .gitignore`)。
3. 確認: `vercel ls --scope <スコープ>`、`vercel project inspect <名前>`(Node 24.x、Framework = Next.js)。

### E. 本番 DB の準備(ユーザー + Claude。**本番への書き込み**)
1. **ユーザー**: Neon の `production` ブランチの接続文字列(pooler あり/なし)を、`<プロジェクト>\.env.production.local` に保存する(**チャットに貼らない**)。Claude が、メモ帳の作成を手伝ってもよい(中身は、ユーザーが入力)。形式:
   ```
   DATABASE_URL="(本番・pooler あり)"
   DATABASE_URL_UNPOOLED="(本番・pooler なし)"
   DB_TARGET=production
   CONFIRM_PRODUCTION=yes
   SEED_ADMIN_LOGIN_ID=admin
   SEED_ADMIN_PASSWORD="(Claude が乱数で作って追記。値は表示しない)"
   ```
2. **Claude**: 実行前チェック(本番のホスト名であること、開発用のホストと違うこと、`DB_TARGET=production`)→ **読み取りだけ**で現状を確認(適用済み migration 数、テーブルの有無)→ 実行。
   ```bash
   set -a; . ./.env.production.local; set +a
   npx drizzle-kit migrate      # 成功は「migrations applied successfully」で確認する(終了コードだけに頼らない)
   npx tsx scripts/seed.ts      # 初期管理者(初回ログインでパスワード変更が必須)・権限・初期データ
   ```
3. 読み取りで結果を確認(テーブル数、migration 数、ユーザー)。
4. **ユーザー**: 本番にログインしてパスワードを変える(初期パスワードは `.env.production.local` の `SEED_ADMIN_PASSWORD`。メモ帳で開く)。**Claude**: パスワード変更済みを DB で確認。
5. 作業が終わったら、**`.env.production.local` を削除**。

### F. Vercel の環境変数と本番デプロイ(Claude)
```bash
# 値は、ファイルから読み、標準入力で渡す(画面に出さない)。AUTH_SECRET は、本番専用に新しく生成。
node -e "….env.production.local の DATABASE_URL を出力…" | vercel env add DATABASE_URL production --sensitive --yes
node -e "process.stdout.write(require('crypto').randomBytes(33).toString('base64'))" | vercel env add AUTH_SECRET production --sensitive --yes
# Preview が必要なら:  … | vercel env add NAME preview --sensitive --yes
vercel env ls                                    # 名前と対象環境を確認(値は表示されない)
vercel redeploy <最新の本番URL> --scope <スコープ>  # 環境変数を反映(登録後に再デプロイしないと反映されない)
vercel ls --scope <スコープ>                      # Ready を確認
curl -s -o /dev/null -w "%{http_code}\n" https://<本番URL>/login     # 200
vercel logs https://<本番URL> --since 30m --level error             # エラーがないこと
```
- 本番の動作確認は、**ユーザーに本番でログインしてもらう**(Claude は、本物の管理者では、ロックを避けるため試さない。存在しない ID で、制限の動作は確認できる)。
- `vercel curl` は beta で不安定。公開 URL には、通常の `curl` で足りる。

### G. Cloudflare R2(ファイル保管。ユーザー + Claude)
画面は、**日本語 UI のことが多い**。1 手順ずつ案内し、スクショで確認する。
1. **ユーザー**: R2 オブジェクト ストレージ → **バケットを作成**(名前は `<アプリ名>`、場所は自動、**公開アクセスは、オンにしない**)。バケットは、**1 つでも可**(開発と本番は、キーの頭 `dev/` `prod/` で区別。**権限の分離ではない**ので、本番に本物のファイルを入れる前に、2 つへの分離を検討する)。
2. **ユーザー**: 概要ページの右側「Account Details」の **Manage API Tokens** → **Account API トークンを作成する**。
   - トークン名: `<アプリ名>`
   - アクセス許可: **オブジェクト読み取りと書き込み**(初期値は「読み取り専用」なので、**変更が必要**。「管理者…」は選ばない)
   - バケットの指定: **特定のバケットにのみ適用**(初期値は「すべてのバケット」)→ `<アプリ名>` だけ
   - TTL: 無期限、IP フィルタリング: 空
   - 作成後に 1 回だけ表示される **アクセスキー ID** と **シークレットアクセスキー** を使う(「トークン値」は使わない)。
3. **Claude**: アカウント ID(画面の「Account Details」にある 32 桁)と、固定の値を `.env.local` に追記し、キーの 2 行は**空のまま**にして、`.env.local` をメモ帳で開く(`Start-Process notepad.exe -ArgumentList '<パス>'`)。
   ```
   R2_ACCOUNT_ID=(アカウントID)
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=<アプリ名>
   R2_KEY_PREFIX=dev/
   ```
4. **ユーザー**: キーを、メモ帳の `=` の右に**直接貼って**(スペース・引用符なし)、Ctrl+S で保存。**Claude**: 形式を確認(アクセスキー ID が 32 桁、シークレットが 64 桁。値は表示しない)。保存されていなければ、メモ帳のタイトルの `*`(未保存)を確認してもらう。
5. **Claude**: `@aws-sdk/client-s3` と `@aws-sdk/s3-request-presigner` を、**同じバージョンで固定**して追加。署名付き URL の保管サービス(LONG PORTAL の `src/modules/core/storage/` を参考)を作り、**接続テスト**(一覧 → 署名付きアップロード → 確認 → 署名付きダウンロード → 削除)で確認。
6. **CORS(ブラウザから R2 へ直接アップロードするための許可)**: 作ったトークンの権限では**バケットの設定を変えられない**(403)。ユーザーが画面から設定する。
   - **Claude**: 許可オリジン(`http://localhost:3000`、`http://localhost:3001`、本番の `https://<プロジェクト>.vercel.app` と別名 2 つ)の JSON を作り、**`Set-Clipboard` でクリップボードにコピー**する(ユーザーがメモ帳を探さなくて済む。秘密が含まれないことを確認)。
   - **ユーザー**: R2 → バケット → 設定 → **CORS ポリシー → ポリシーを追加** → JSON 欄に貼り付け(初期の内容は、消す)→ 保存。
   - **Claude**: ブラウザの事前確認(OPTIONS)を送って、許可したサイトが通り、関係のないサイトが 403 になることを確認。
7. **Claude**: Vercel に `R2_*` を登録(Production は `R2_KEY_PREFIX=prod/`、Preview は `dev/`)。`R2_ACCESS_KEY_ID` と `R2_SECRET_ACCESS_KEY` は `--sensitive`。
- 保存キー: `<プレフィックス><アプリのキー>/<所有者ID>/<UUID>.<拡張子>`(拡張子は小文字。無いと、ダウンロードしたときに拡張子が消える)。
- 独自ドメインを足す・開発サーバーのポートを変えたときは、**CORS の許可オリジンも更新**する(設定は R2 側にだけ残る)。

### H. 仕上げ(Claude)
- 本番の `/login` が 200、未ログインの `/` がログイン画面へ送られることを確認。
- 追跡対象に秘密の値がないことを確認 → ドキュメント(設計・引き継ぎ・この手順書の更新点)とメモリを更新。
- 一時ファイル(`.env.production.local`、確認用のデータ、スクリーンショット)を削除。
- 貼られた秘密があれば、再発行を案内(Neon のパスワードを再発行したら、**Vercel の `DATABASE_URL` を、ユーザーが画面で直接更新** → Deployments から Redeploy)。

---

## 4. 日常の運用(作ったあと)
1. 実装 → lint・型チェック・テスト・ビルド → 動作確認(確認用データは必ず削除)。
2. コミット → push(`main`)→ Vercel が自動デプロイ(`vercel ls` で Ready)。
3. **DB を変える場合は、本番へ先に migration**(手順 E の流れ)→ そのあとコードを push。
4. 環境変数を変えたら、**再デプロイ**。

## 5. 落とし穴
- **シェルのヒアドキュメントで、日本語や記号を含む長い文章が失敗**することがある → ファイルは **Write ツール**で作る。
- **`.next/dev/types/routes.d.ts` が壊れて型チェックが落ちる**(開発サーバーと typegen/build が同時に書く) → `rm -rf .next/dev/types && npx next typegen`、再実行。
- **`drizzle-kit migrate` は、`DATABASE_URL_UNPOOLED` のパスワードが古いと、エラーを出さずに終了する** → 失敗したら `DATABASE_URL` から `-pooler` を除いて作り直す。
- **npm の出力に色コード**が付き、`grep` が空振りする → ファイルに出力して `sed 's/\x1b\[[0-9;]*m//g'` で除く。
- **`vercel link` が `.env.local` と `.gitignore` を変える**(手順 D)。
- **Vercel Blocked**(作者メールが GitHub で未認証)。
- **`vercel env add` を登録した後に再デプロイしないと、反映されない。**
- **`localhost:3000` の開発サーバーは、ユーザーが自分で起動していることがある** → 勝手に止めない(プロセスを確認する)。
- **PC のメモリが逼迫するとシェルが極端に遅い** → 重い処理は、バックグラウンドで実行し、出力ファイルを読む。
- **Playwright の MCP が接続できないことがある** → `curl` や `tsx` で代替する。
- **Cloudflare のトークンは、権限を最小に**(オブジェクトの読み書き・特定バケットのみ)。既存のトークンが「管理者・全バケット」と広い場合(TODOSample)は、見直しを提案する。
- **Neon の接続文字列は、`development` と `production` で別のホスト**。実行前に、必ずホスト名を確認する。
- **Hobby の Vercel は個人・非商用向け**、**DB が海外**の場合は、個人情報の取り扱いの社内確認が要る。

## 6. 完了の確認(チェックリスト)
- [ ] GitHub: Private、`main` に最新、作者メールが正しい
- [ ] Neon: `development` と `production` のブランチ、パスワードがブランチごとに別
- [ ] 手元の `.env.local` は開発用だけ、`.gitignore` が `.env*` と `.vercel` を含む
- [ ] 本番 DB に migration と seed、初期管理者がパスワードを変更済み
- [ ] Vercel: 環境変数(Secret)、Functions の地域、本番が Ready、`/login` が 200
- [ ] Cloudflare R2: 非公開、権限最小のトークン、接続テスト OK、CORS 設定済み、Vercel に登録済み
- [ ] 一時ファイルは削除済み、秘密の値が追跡対象にない
- [ ] 引き継ぎ書・設計ドキュメント・メモリを更新済み
