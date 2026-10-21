# LONG PORTAL 引き継ぎ書(経緯・決定事項・運用・注意点)

別の環境(デスクトップ版の Claude など)や新しいセッションで、これまでの作業を**途切れなく**続けるための文書。
設計の正は `docs/DESIGN.md`、こちらは「経緯・約束事・運用手順・落とし穴・現在地」をまとめたもの。
最終更新: 2026-10-18(本人によるパスワード再設定(メール)まで。それ以前の経緯は 4 章)。

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
| 会社カレンダー | `apps/calendar`(`/apps/calendar`。会社の休日・出勤日の月表示、今日・次の休み・残りの出勤日数、年間のまとめ。休日データは `company-calendar.ts` にコードで持つ(2026 年分のみ。紙のカレンダーを写したもので、`logic.test.ts` で照合)。本人だけのメモ・予定は `calendar.entries`(migration `0011_calendar_entries`、`user_id` でスコープ)。専用権限なし。アプリの登録簿(`sync:manifests`)に登録し、入場は `requireAppAccess`。本番で使うには、アプリ管理(`/admin/apps`)で有効にし、表示する相手を決める。2026-10-17 に第 1 弾(連休のカウントダウン・出勤土曜の前日・明日から連休・本人の入社の周年・給料日(毎月 29 日、休みなら前の出勤日)・今日のひとこと。ホームの一番上にも出す。DESIGN.md 33 章。DB の変更なし)。2026-10-21 に誕生日(生年月日を社員マスタ `core.employees.birth_date` に移し、本人には当日のお祝い、権限 `calendar.birthdays.view` の人には全社員の誕生日。DESIGN.md 37 章、migration 0020、一括登録 `npm run db:import-birth-dates`。本番反映済み)。同日、第 2 弾をブランチ `claude/calendar-round2`(PR #29)で実装(DESIGN.md 38 章): 全社の予定(一斉有給取得日・臨時休業は休みとして数える(一斉有給は「休み + 有給の印」で通知なし)、行事・予定)、参加の呼びかけ(名指し・Audience、参加/不参加の返事、ホームとカレンダーに返事のお願い)。権限 `calendar.events.manage`、migration `0021_calendar_company_events`(テーブルの追加だけ。本番は未適用) |

### 社員データ(2026-10-14)
- 社内サーバーの `社員名簿.xls`(「名簿 (2)」シート)から、在籍 54 人を**開発 DB に取り込み済み**(`npm run db:import-employees`、DESIGN.md 21 章)。**本番は未実施**。
- 取り込んだのは 社員番号・氏名・フリガナ・役職・部署・入社日 だけ。雇用区分は全員「正社員」で仮置き。
- 2026-10-15: 開発 DB に拠点 3 つ(本社工場・2号店・B工場。白山工場は今はない)を登録し、54 人全員に「部署(名簿どおり。1005 は総務・経理)× 本社工場」の主所属を作った。2号店は溶接、B工場はレーザーの人だけがいるので、**所属の割り当て画面**(`/admin/employees/assignments`。部署は選択欄、拠点は丸で選ぶ表。管理者が個別に変えると、そのまま DB に保存される)で選び直す。
- **本番 DB にも投入済み(2026-10-15)**: 拠点 3 つ、部署 8・役職 6、社員 54 人(画面で手登録されていた「052」は名簿の「0052」に番号を直して重複を防いだ)、全員に「部署 × 本社工場」の主所属。**本番のアカウントは 2026-10-16 に 54 人分を発行済み**(ログイン ID = 社員番号、初回ログインでパスワード変更が必要)。配布用の CSV はユーザーの `ドキュメント\LONGPORTAL\初期パスワード_本番_2026-10-16.csv`(リポジトリの外。配り終えたら削除してもらう)。パスワードは管理者も見られない(ハッシュのみ)。忘れた社員は管理画面で再設定する。**次の課題: 本人がメールで再設定できるようにする**(全員が会社のメールを持つ。LINE WORKS は全員ではない。送信サービスは Vercel Marketplace の Resend が候補)。2号店・B工場の割り当ては、本番の所属の割り当て画面で行う。
- 本番の URL は独自ドメイン `https://long-ishikawa.com` に変わっている(`longportal.vercel.app` は転送)。R2 の CORS の許可オリジンには、2026-10-15 にこのドメインを追加済み(`docs/r2-cors.json`)。
- 54 人にアカウントを発行済み(開発 DB。ログイン ID = 社員番号。`npm run db:issue-accounts`)。名簿にない社員が開発 DB に 1 人いる(以前の確認用と思われる。主所属がないため発行していない)。

- 2026-10-15: 氏名を姓・名・姓(かな)・名(かな)に分けた(本番も。DESIGN.md 22 章)。区切りのないかなは、漢字の姓名を手がかりに分けた一覧をユーザーが確認してから入れた(`npm run db:update-name-kana`)。
- 本番の社内リンク(ユーザーが画面で登録): LINE WORKS・freee勤怠管理Plus・ユニネク(全社)。計測用の `_gl` などや、使い捨ての `state` は URL から除いた。

- 2026-10-16: Audience の条件に「社員」(一覧から名指しで選ぶ)を追加(DESIGN.md 27 章、migration 0013。本番にも適用済み)。
- **人事管理(2026-10-17 本番公開)**: `apps/hr`(DESIGN.md 31 章。`/apps/hr`、権限 `hr.records.manage`、migration 0016 `hr_records`・0017 `hr_abilities`。本番 DB に適用・`sync:manifests` 済み、本番のアプリ管理で有効)。元の Google スプレッドシート「人事管理シート」(社員 1 人 1 シート)の 1〜5 章(基本情報・目標と評価・スキルと資格・人柄・コンディション)と、面談・指導・ほめ・異動の記録。本人は自分のページで 1〜3 章と「本人に公開」の記録だけを見る(ユーザーの判断)。画面は「まとめ(名札・能力 5 項目のレーダーチャート・直近の記録)+ タブ」(31.2。5 項目の名前は仮)。記録の内容に「音声入力」と「AIで整える」(31.3、PR #16)。**ユーザーの判断: 人事の文章を AI に送るのは、対象の社員の氏名を「本人」に置き換えてから**。未着手: シートの「評価シート」(自己評価の様式)、部署ごとの担当の割り当て、一覧での能力の比較。
- **本人によるパスワード再設定(2026-10-18)**: DESIGN.md 26 章。`core/mail`(Resend。送り元 `no-reply@long-ishikawa.com`。Vercel Marketplace の「longportal-mail」、Vercel に `RESEND_API_KEY` が自動で入る。DNS は Cloudflare、手順は playbook の G2)。初回のパスワード変更でメールの登録が必須 → 確認メール(`/verify-email`)。ログイン画面の「パスワードを忘れた方」→ `/forgot-password` → `/reset-password`(30 分・1 回限り、1 時間に 3 通まで)。未確認・未登録の人には、ポータルの上に案内が出る。`/password` でメールの変更・確認メールの再送。DB の変更はなし(migration 0012 は本番に適用済み)。開発で通しの流れと、本物のメールが届くことを確認済み。Resend の画面へは Vercel の Integrations から入る。Resend に登録しかけた `e-long.co.jp`(未確認)は削除してよい。

- 2026-10-17: AI教室(別アプリ。リポジトリ `ai-kyoshitsu`、本番 `https://ai-kyoshitsu.vercel.app`、DESIGN.md 28 章)を本番公開。ログインはポータルの通行証(SSO。入口 `/apps/launch/<app_key>`、`core/sso`、契約 `modules/apps/external-apps.ts`、鍵 `SSO_SECRET_AIKYOSHITSU`)。講師の老川さん(0052)にロール「AI教室 講師」(`aikyoshitsu.materials.manage`)。第1回の資料 4 つを投入済み。同日、**見え方をポータルの中のアプリにした**: サイドバーから同じタブで `/apps/aikyoshitsu` を開き、ポータルの画面の中に埋め込む。`/aikyoshitsu/…` はポータルがアプリへ転送する(multi-zones。`next.config.ts` の `ZONES`、アプリは basePath `/aikyoshitsu`)。

- **作業中(2026-10-17)**: 配達ルート(本番 DB は準備済み: migration 0014・sync:manifests・元データ取り込み(取引先 78・配達者 4・履歴 247・保存ルート 50)。Vercel Production に GOOGLE_MAPS_API_KEY 登録済み)(`apps/haisou`、`/apps/haisou`、DESIGN.md 29 章)。Google スプレッドシート「取引先一覧表」の Apps Script「配達ルート作成ツール v5」の移植で、**元のシートとスクリプトは消さない・書き換えない**。ブランチ `feature/haisou-route`(PR で確認中)。本番に出すには: migration `0014_haisou_app` を本番に適用 → `sync:manifests` → Google Maps Platform の鍵(Geocoding API・Routes API)を Vercel に `GOOGLE_MAPS_API_KEY`(Sensitive)で登録 → 切り替えの直前に `npm run db:import-haisou` で元データを取り込む → `/admin/apps` で有効化。配達者へのメールは当面メールソフトを開く形(`core/mail` ができたら戻す)。

- **作業中(2026-10-17)**: ロングの教科書(`apps/kyokasho`、`/apps/kyokasho`、DESIGN.md 30 章)。部署ごとの教科書を 1 つのアプリに並べる。正本は Google ドキュメント(持ち主は外部支援のアカウント)で、Word(.docx)で保存したものを `npm run db:import-kyokasho` で取り込む。中身と画像はリポジトリに入れない(DB と R2)。本番に出すには: migration `0015_kyokasho_app` を本番に適用 → `sync:manifests` → 教科書を取り込む → `/admin/apps` で有効化 → `/apps/kyokasho/manage` で公開。

- **教科書の自動の同期(2026-10-20)**: 元の Google ドキュメントが変わっていれば、毎朝 3 時ごろに自動で取り込み直す。管理画面に「今すぐ取り込む」。DESIGN.md 30 章。動かすには Vercel Production に `CRON_SECRET`(Sensitive、長いランダムな文字列)が要る。元の URL が未登録の教科書は同期しない。
- **教科書の「ツッコミ」(2026-10-17 本番公開)**: DESIGN.md 32 章。読んだ人の疑問・付け足し・まちがい(右下のボタン、文を選んで引用、音声入力、「AIで整える」)、教科書チームの返事と採用、ありがとう、教科書をよくしてくれた人。migration `0018_kyokasho_comments`(本番に適用済み)、権限 `kyokasho.comments.manage`(本番に sync 済み。今は system_admin と `kyokasho.books.manage` の人が返事できる)。新しいツッコミの知らせは LINE WORKS(DESIGN.md 35 章。2026-10-17。Bot「LONG PORTAL」、鍵と送り先は Vercel Production に Sensitive で登録済み)。**社員にポータルを周知するまでは、長井さんだけの試験の部屋に届く**(`KYOKASHO_LINEWORKS_CHANNEL_ID` = 試験の部屋、`KYOKASHO_LINEWORKS_CHANNELS` は未登録)。周知のあと、ユーザーの PC の `ドキュメント\LONGPORTAL\lineworks-rooms.json`(全社・ブレーキ部・技術部・スタッド・メタルエステの 5 部屋)で `npm run lineworks:setup -- --rooms <JSON> --apply` を実行し、表示された値を Vercel に登録し直す(社員に通知が届く操作なので、ユーザーの「作って」の指示を得てから)。

- **組織図(2026-10-21 本番公開・有効化済み)**: `apps/soshikizu`(`/apps/soshikizu`、DESIGN.md 36 章)。第 1 弾は部署ごとの箱(今日の主所属から作る。拠点の絞り込み、名前を押すと役職・拠点・入社年、顔写真は LINE WORKS のアイコン)。DB の変更なし・専用権限なし。写真は本番の LINE WORKS の鍵(登録済み)と scope `user.read` を使う(本物の LINE WORKS での表示は未確認)。管理者は札のドラッグで異動できる(36 章。PR で確認中)。2026-10-21 の本番の sync で、手違いにより作業中の日報(nippo)のアプリ登録(無効)と権限 `nippo.reports.review` も本番に入った(日報の表は未適用。害はなく、日報を出すときに使うので残している)。第 2 弾で上司・部下のツリー(migration が要る)。
- **日報(2026-10-21 本番公開)**: `apps/nippo`(DESIGN.md 39 章。`/apps/nippo`、権限 `nippo.reports.review`、migration `0024_nippo_app`。本番 DB に適用・`sync:manifests` 済み)。新人が書いて提出し、指導者がコメント・本人が返信。AI でメモを項目に振り分ける。残り: `/admin/apps` で有効にし、宛先を新人と指導者に → 指導者(長井さん)に `nippo.reports.review` を持つロールを割り当て(system_admin なら不要)。過去の日報(Google ドキュメント)は `npm run db:import-nippo` で取り込む(39 章。開発 DB で老川さん 75 日分・成岡さん 51 日分を確認済み)。本番の取り込みは、日報を本番に出したあと。

### まだ「枠だけ」の部分
- 見本(架空)のデータは 2026-10-14 に削除した(`mock-data.ts`)。ホームとサイドバーの**お知らせ・アプリ・社内リンク・要対応**は、`queries.ts` の `listVisible*` が空を返す(アプリは apps/sodatsu だけを固定で返す)ので、枠と「まだありません」の表示だけが出る。実装時は、この関数の中身を差し替える。
- `/notices/*`、`/admin/apps` は「準備中」ページ(`[...slug]` のキャッチオール)。

### 次にやること(順番)
1. ~~**手順 6**~~(2026-10-15 完了。DESIGN.md 24 章。登録簿 `/admin/apps`、ポータルの中のアプリは `requireAppAccess` で入場を制限、別プロジェクトのアプリは URL で登録。自動ログイン(SSO)と、アプリごとの開発者・管理者の指定は、あとの段階):  app registry(コード側の manifest + DB の運用設定)、manifest の同期(`npm run sync:manifests` に、アプリの権限と `app_registry` を追加)、`canAccessApp` / `requireAppAccess`。サイドバーとホームのアプリ表示を、Audience の判定につなぐ。Audience の「利用先」の表示と「利用中は削除不可」(`listAudienceUsages`)もここで有効にする。
2. ~~**手順 7**~~(2026-10-15 完了・本番反映済み): お知らせ(全社・Audience・個人指定、通常・重要・緊急、ホームのバナー、既読、確認ボタン)と社内リンク。管理画面 `/admin/notices`・`/admin/links`、権限 `core.notices.manage`・`core.links.manage`。DESIGN.md 23 章。
3. ~~**手順 8**~~(2026-10-16 完了・本番反映済み。DESIGN.md 25 章。`/apps/todo`。カテゴリは仕事向け 9 種、Claude Haiku 5.5 で自動分類、添付は 25MB まで。本番のアプリ管理ではまだ「無効」。Vercel Production に `ANTHROPIC_API_KEY`(Sensitive)、手元の `.env.local` にも同名のキーを登録済み): TODO アプリの移植(TODOSample から。TODO は `user_id` に紐づく個人データ。Claude による自動分類、R2 添付ファイルも含む)。添付のメタ情報テーブル(ファイル名・サイズ・所有者)は、このときに migration で追加する。
4. **ありがとうカード**(2026-10-15 実装。DESIGN.md 34 章。`/apps/arigato`、集計は `/apps/arigato/stats`。「育てて、育つ。」を風土として根づかせる最初の参加型アプリ): 2026-10-17 に「ありがとう番付」(`/apps/arigato/banzuke`。四股名・年六場所・白星・昇進・伝達式・今週の一枚スタンプカード)を追加し、テーブル `arigato.shikona`・`arigato.banzuke` も同じ migration に含めた。2026-10-17 に main(0018 まで)へそろえ、migration は `0019_arigato_cards` に作り直した。本番に出すときは、コードを `main` に送る前に migration `0019_arigato_cards` を本番 DB に適用し、`npm run sync:manifests`(権限 `arigato.stats.view`・`arigato.cards.manage` とアプリの登録)を実行してから、`/admin/apps` で有効にする。集計・削除の権限は、管理画面でロールに付ける(system_admin には sync で自動付与)。
5. **会社カレンダー 第 2 弾**(2026-10-21 実装。PR #29。DESIGN.md 38 章。全社の予定・参加の呼びかけ): 開発 DB に migration `0021_calendar_company_events` を適用 → `npm run sync:manifests`(権限 `calendar.events.manage`)→ 担当の人のロールに権限を付ける → 動作確認。本番は、**コードを `main` に入れる前に** 0021 を本番 DB に適用し、`npm run sync:manifests` を実行する(0021 はテーブルの追加だけで、既存のデータは変えない)。
6. 以後: 教育・スキル、改善提案、出し直し管理、マニュアル、設備管理など。

### 社員にアカウントを配る前のチェック(未了)
- ~~見本データの除去~~(2026-10-14 に完了)。お知らせ・アプリ・社内リンクの実装(手順 6・7)。
- 2026-10-15 ユーザーの判断: 本番は **Hobby プランのまま**、DB は**シンガポールのまま**(Neon に東京の地域がなく、日本に最も近い)。※ Vercel の Hobby は利用規約上「個人・非商用向け」。社員に配る段階で、Pro への切り替えを再検討する材料として残す。
- 追加の強化候補: パスワード変更画面の失敗制限、ロックの管理者への通知、2 要素認証、CSP、CSV 一括登録(社員)。

## 5. インフラ・環境(外側の構成は TODOSample と同じ)

| 要素 | 内容 |
|---|---|
| コード | GitHub `Longmasaru/longportal`(`main`。ローカルの git の作者は `Longmasaru` / `m.nagai@e-long.co.jp`) |
| 公開 | Vercel `longmasaru/longportal`(個人スコープ、Hobby)。`main` への push で**自動デプロイ**。本番 URL `https://longportal.vercel.app`。Functions の地域は `vercel.json` で **sin1**(TODOSample は iad1)。Node 24.x |
| DB | Neon の project `longdashbord`、リージョン ap-southeast-1。**ブランチは 2 つ**: `development`(手元の開発)、`production`(本番)。接続は、実行時は pooler、migration は direct |
| ファイル | Cloudflare R2 のバケット `longportal`(**1 つのみ・非公開**)。API トークンは `longportal` 専用(オブジェクトの読み書き)。開発/本番は、キーの頭(`dev/`、`prod/`)で区別(**権限の分離ではない**) |
| AI | Anthropic API(TODO アプリの自動分類。`claude-haiku-5-5`、`@anthropic-ai/sdk` 0.131.0。キーは `ANTHROPIC_API_KEY`) |

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
3. **本番に適用するのは、コードを `main` に送る前**(新しいテーブルを使うコードが先に出ても、ログインは止まらない設計だが、確実にするため)。手順: ユーザーが `.env.production.local` に本番の接続文字列(pooler あり・なし)を保存 → 本番ホストであることを確認 → 値を 1 行ずつそのまま読み込んで(`docs/playbooks/new-app-setup.md` のとおり。`set -a; . ./.env.production.local` は使わない)、接続先のホストが本番であることを表示して確かめたうえで `DB_TARGET=production CONFIRM_PRODUCTION=yes npx drizzle-kit migrate` → 読み取りだけで結果を確認 → ファイルを削除。
4. 初期データ・権限の同期: `npm run db:seed`(冪等)、`npm run sync:manifests`。管理者の復旧: `npm run db:grant-admin -- <login_id>`。

### その他のコマンド
`npm run dev` / `build` / `lint` / `typecheck` / `test` / `db:generate` / `db:migrate` / `db:check` / `db:seed` / `sync:manifests` / `db:grant-admin` / `r2:check`。

## 7. 技術的な落とし穴(再発防止メモ)

- **シェルのヒアドキュメントで、日本語や記号を含む長い文章が失敗する**ことがある → ファイル作成は **Write ツール**を使う。
- **`.next/dev/types/routes.d.ts` が壊れて型チェックが落ちる**(開発サーバーと `next typegen` / `build` が同時に書き換える) → `rm -rf .next/dev/types && npx next typegen` のあとに、型チェックとビルドをやり直す。
- **`drizzle-kit migrate` は、`DATABASE_URL_UNPOOLED` のパスワードが古いと、エラーを表示せずに終了する**(終了コードは 1) → 失敗したら、`DATABASE_URL` から `-pooler` を除いて `UNPOOLED` を作り直す。成功は「migrations applied successfully」で確認する。
- **`set -a; . ./.env.production.local` で本番の接続文字列を読むと、文字列の中の `&` でシェルが文を区切り、本番の値が読まれない**。そのまま `.env.local`(開発 DB)の値が使われ、「成功」と出ても開発 DB に向いている(2026-10-17 に発生。適用はなく影響なし)→ 値は 1 行ずつそのまま読み込み、実行の直前に接続先のホストを表示して確かめる。
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
