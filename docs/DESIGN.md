# LONG PORTAL 設計ドキュメント(確定版)

株式会社ロングの社内ポータル基盤。単なるダッシュボードではなく、今後多数の社内業務アプリを追加していくための共通基盤として作る。

- ステータス: 設計確定(実装未着手)
- 本書の内容は、設計協議で確定した方針の記録である。変更する場合は本書を先に更新する。

---

## 1. 基本方針

- 新規リポジトリ「LONG PORTAL」で作る。
- `C:\Users\masarunagai\projects\TODOSample` は参考実装・部品取り元。TODOSample 自体は拡張しない。
- 現在は 1 つのアプリとして運用し、内部は複数業務アプリの集合として明確にモジュール分割する(**モジュラーモノリス**)。
- 将来、特定アプリを別サービスへ切り出しやすい境界を保つ。
- **deny by default** を全体の原則とする。
- 既存の TODOSample の users / todos データは移行しない(開発・検証用のため)。

## 2. 技術基盤

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16.3.8(App Router)。実装時は `node_modules/next/dist/docs/` を確認し、TODOSample の実装を思い込みで流用しない |
| 言語 | TypeScript |
| 認証 | Auth.js v5(`next-auth` 5.0.0-beta.32)、Credentials、JWT セッション、`bcryptjs` |
| DB | PostgreSQL(Neon)+ Drizzle ORM + 正式 Migration |
| スタイル | Tailwind v4 + ロングのデザインシステム(`DESIGN-long-kanazawa.md` 由来の `globals.css`) |
| AI | Anthropic API(TODO のカテゴリ自動判定を引き継ぐ。将来は core の共通サービス化を検討) |
| ホスティング | Vercel + Neon |

### バージョン固定

- Node は `24.x` を `.nvmrc` と `package.json` の `engines` で固定する(ローカルは v24.18.0、Next 16.3.8 の要件は `>=20.9.0`)。Vercel 側の Node 設定も揃える。
- npm は `packageManager` フィールドで固定する。
- 主要依存(next、react、react-dom、next-auth、drizzle-orm、drizzle-kit)は `^` を付けず完全固定にする。

### DB 運用

- 本番起動時の `ensureSchema()` 等による自動 DDL 変更には依存しない。スキーマ変更は正式 migration のみ。
- LONG PORTAL 用に新規 Neon project を作る。TODOSample の DB とは分離する。
- 1 project に `production` ブランチと `development` ブランチを置く。Vercel の Preview 環境は development ブランチを参照する。
- 環境変数は `DATABASE_URL`(pooled、実行時用)と `DATABASE_URL_UNPOOLED`(direct、migration 用)に分ける。
- 初期データ(初期 `system_admin`、雇用区分、基本ロールなど)は seed スクリプトで冪等に投入する。起動時の自動投入はしない。
- `.env` は TODOSample からコピーしない。新規に作成する。

## 3. アーキテクチャ

### 3.1 依存方向

```
src/app  →  modules/apps/*  →  modules/core/*
```

- 各業務アプリ同士は原則直接依存しない。必ず core を経由する。
- core は apps に依存しない(テーブル参照も含む)。apps から core への FK は許可する。
- 各 module は `index.ts` の公開 API 経由でのみ他 module から参照される。
- 境界は ESLint の `no-restricted-imports` 等で機械的に強制する。

### 3.2 ディレクトリ構成

```
src/
  app/                      薄いルーティング層
    (auth)/login/
    apps/
      todo/
      education/ ...
    admin/
  modules/
    core/
      auth/
      access/               resolveActor / canAccessApp / requireAppAccess / can / requirePermission
      employees/            employees + employee_assignments
      departments/
      locations/
      positions/
      employment-types/
      roles/                roles / permissions / role_assignments
      audience/
      app-registry/
      portal/               announcements / portal_links / ホーム
      audit/
      notifications/        (MVP 後)
    apps/
      todo/
        schema.ts  queries.ts  actions.ts  components/  manifest.ts  index.ts
      education/ improvement/ quality/ equipment/ ...
  db/
    migrations/
    client.ts
drizzle.config.ts
scripts/
  seed.ts
  sync-manifests.ts
docs/
  DESIGN.md
```

- `src/app` には route、layout、認証・アクセス確認の入口、modules の呼び出しのみを置く。
- 業務ロジック、Server Actions、データアクセス、schema、components は各 module に集約する。

## 4. データベース

### 4.1 スキーマ分離(`pgSchema`)

`core.*` / `todo.*` / `education.*` / `quality.*` などの Postgres スキーマで module 境界を DB 上でも明確にする。Drizzle のスキーマ定義は各 module の `schema.ts` に置き、`drizzle.config.ts` から一元的に migration を管理する(1 ファイルの巨大 schema にはしない)。

### 4.2 共通規約

- 主キーは全テーブル UUID(`uuid`、`defaultRandom()`)。
- 人が扱う識別子(`employee_number`、`login_id`、`app_key`、各 `code`)は別に UNIQUE で持つ。UUID と業務識別子は別物。
- 日時は `timestamptz`。日付のみは `date`。
- 「今日」はすべて JST。アプリ側の `todayJst()` で求め、SQL にはパラメータとして渡す(SQL 内の `now()` を基準日判定に使わない)。
- マスタは物理削除せず `is_active` で無効化する。

### 4.3 core テーブル

#### 組織・人

**`core.departments`** … `id`、`code`(UNIQUE)、`name`、`sort_order`、`is_active`
**`core.locations`** … `id`、`code`(UNIQUE)、`name`、`sort_order`、`is_active`

- department と location は完全に独立したマスタ(何の仕事か / どこで働くか)。
- department はフラット。階層が必要になったら team / organizational_unit を別概念として追加する。

**`core.positions`** … `id`、`code`(UNIQUE)、`name`、`is_management`、`rank`、`sort_order`、`is_active`

- 会社上の役職。**システム上の role / permission とは無関係**。役職だけで権限を自動付与しない。

**`core.employment_types`** … `id`、`code`(UNIQUE)、`name`、`sort_order`、`is_active`

- 雇用区分のマスタ。管理画面から追加でき、コード変更・migration・deploy を要さない。

**`core.employees`**
| 列 | 備考 |
|---|---|
| `id` | uuid |
| `employee_number` | UNIQUE、NOT NULL |
| `name`、`name_kana` | |
| `employment_type_id` | FK → `employment_types` |
| `position_id` | FK → `positions` |
| `hired_on` | date、NOT NULL |
| `left_on` | date、NULL 可。**最終在籍日** |
| `status` | `planned` / `active` / `leave` / `retired`(人事上の状態) |
| `created_at`、`updated_at` | |

- 部署・拠点は employees に持たない(所属は `employee_assignments` を正とする)。
- CHECK 制約:
  - `status <> 'retired' OR left_on IS NOT NULL`(retired なら `left_on` 必須)
  - `left_on IS NULL OR left_on >= hired_on`
- `left_on` が設定されているだけでは `retired` を必須としない(未来の退職予定日を先に登録できる)。

**`core.employee_assignments`**
| 列 | 備考 |
|---|---|
| `id` | uuid |
| `employee_id` | FK → `employees` |
| `department_id` | FK → `departments` |
| `location_id` | FK → `locations` |
| `start_date` | date、NOT NULL |
| `end_date` | date、NULL 可(NULL は期限なし)。**最終日を含む** |
| `is_primary` | boolean |
| `created_at`、`updated_at` | |

- 「基準日に有効」: `start_date <= 基準日 AND (end_date IS NULL OR end_date >= 基準日)`。
- 制約(正式 migration、手書き SQL):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE core.employee_assignments
  ADD CONSTRAINT employee_assignments_period_check
  CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE core.employee_assignments
  ADD CONSTRAINT employee_assignments_no_overlap_primary
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (is_primary);
```

- **主所属同士だけ期間重複を禁止**し、副所属(`is_primary = false`)は重複可能。`WHERE (is_primary)` は将来副所属を許可しても維持する。
- uuid に対する `EXCLUDE USING gist` には `btree_gist` が必要なため、migration に含める。
- MVP では「現在有効な主所属は 1 人 1 件」で運用する。副所属は DB 構造のみ用意し、MVP の管理画面・サーバー側登録処理では `is_primary = true` のみ受け付ける。
- 将来、複数 active assignment(兼務・複数拠点)を許可する場合もテーブル構造は変えない。

**`core.users`**
| 列 | 備考 |
|---|---|
| `id` | uuid |
| `login_id` | UNIQUE |
| `password_hash` | bcryptjs |
| `employee_id` | FK → `employees`、**UNIQUE、NULL 可**(1 対 0..1) |
| `status` | `active` / `disabled`(システム利用可否) |
| `must_change_password` | boolean |
| `last_login_at` | |
| `created_at`、`updated_at` | |

- employee は user がなくても存在できる(入社予定者を先に登録、退職後も履歴を残す、user だけ無効化、将来社員以外に user だけ発行)。
- **`employees.status` = 人事上の状態、`users.status` = システム利用可否**。責務を分ける。
- 業務履歴は原則 `employee_id` に紐づける。TODO のようにアカウントそのものに属するデータは `user_id`。

#### 権限

**`core.roles`** … `id`、`code`(UNIQUE)、`name`、`description`、`is_system`、`is_protected`
**`core.permissions`** … `id`、`code`(UNIQUE。例 `education.view`)、`app_key`(NULL 可)、`description`

- permission の code は**コード側(manifest)で定義**し、sync で DB に反映する。管理画面から自由入力で新規作成する方式は取らない。

**`core.role_permissions`** … `role_id`、`permission_id`
**`core.role_assignments`** … `id`、`user_id`、`role_id`、`location_id`(NULL 可)、`department_id`(NULL 可)、`granted_by`、`granted_at`

- ロール割当のスコープ: 両方 NULL = global / location のみ = その拠点 / department のみ = その部署 / 両方 = location **AND** department。
- 将来 team 等の軸を追加できるよう、スコープ列の追加で拡張できる形にしておく。

#### Audience

**`core.audiences`** … `id`、`name`、`description`、`is_active`
**`core.audience_groups`** … `id`、`audience_id`、`sort_order`(グループ間は OR)
**`core.audience_conditions`** … `id`、`group_id`、`attribute`、`operator`、`value`(jsonb)(グループ内は AND)
**`core.audience_members`** … `audience_id`、`employee_id`、`kind`(`include` / `exclude`)

- `audience_members` は将来の個人追加・除外用。MVP では構造のみ用意し、使わない。
- 条件に使うマスタ(department、location、position、employment_type)は **ID を保存**する(名称変更に強くするため)。

#### ポータル・運用

**`core.app_registry`** … `app_key`(PK、永続)、`display_name`、`description`、`icon`、`sort_order`、`is_enabled`、`audience_id`、`show_on_home`
**`core.announcements`** … `id`、`title`、`body`、`audience_id`、`published_at`、`expires_at`、`is_pinned`、`created_by`(employee_id)
**`core.portal_links`** … `id`、`title`、`url`、`category`、`sort_order`、`audience_id`、`is_active`
**`core.audit_logs`** … `id`、`actor_user_id`、`action`、`target_type`、`target_id`、`before`(jsonb)、`after`(jsonb)、`at`

#### アプリ側

**`todo.todo_categories`**、**`todo.todos`**(`user_id` FK → `core.users`、ON DELETE CASCADE)
**`calendar.entries`**(会社カレンダーの本人だけのメモ・予定。`user_id` FK → `core.users`、ON DELETE CASCADE。会社の休日そのものは DB に持たず、`apps/calendar/company-calendar.ts` にコードで持つ)

### 4.4 リレーション概要

- employees → employment_types、positions は N:1。employees と employee_assignments は 1:N。assignments → departments、locations は N:1。
- users と employees は 1:0..1(FK は users 側)。
- users と roles は `role_assignments`(スコープ付き)で N:M。roles と permissions は `role_permissions` で N:M。
- audiences は groups、conditions、members を持つ。`app_registry`、`announcements`、`portal_links` が `audience_id` で参照する。

## 5. 認証とアクセス判定

### 5.1 役割分担

- **Middleware(`proxy.ts`)**: ログイン済みかどうかの粗い入口制御のみ。Edge Runtime のため DB には触れない。
- **本判定**: Node Runtime 側の共通ヘルパー(`modules/core/access`)。DB を参照する。
- **JWT** には認証に必要な最小限の ID(`userId`)だけを持たせる。権限・在籍状態は JWT で判断しない。

### 5.2 resolveActor の最終評価順

`resolveActor()` は `canAccessApp` / `requireAppAccess` / `can` / `requirePermission` 共通の入口。次の順に評価し、**1 つでも外れれば deny**。

1. セッション確認(JWT の `userId`)。なければ deny。
2. `users.status = 'active'` でなければ deny。
3. `users.employee_id` が NULL(社員以外の user)なら、4〜7 を飛ばして 8 へ進む。
4. employee の `status` が `active` / `leave` 以外(`planned`、`retired`、未知の値)なら deny。
5. `hired_on > 今日(JST)` なら deny。
6. `left_on IS NOT NULL AND left_on < 今日(JST)` なら deny(`status` に関係なく。退職日当日は利用可、翌日から deny)。
7. 基準日(今日)に有効な `employee_assignments` を取得する(0 件でも deny にはしない)。
8. Audience と role / permission + scope の評価に進む。

補足:

- `leave`(休職)中は利用可。利用を止める場合は `users.status = disabled` で制御する。
- 4・5 を併用するのは安全側に倒すため。管理者が誤って入社日前に `status` を `active` にしても、`hired_on` が未来ならアクセスできない。
- 退職日にバッチで `users.status` を書き換える方式には依存しない。バッチが失敗しても、退職日を過ぎればアクセスできない。
- 入社日に `planned → active` へ自動変更するバッチは作らない。管理者が手動で `active` に変更する。バッチが存在しなくても、失敗しても、安全側(deny)に倒れる。
- 管理画面での手動無効化(`users.status = disabled`)は、次の判定から即時に反映される。
- 判定結果はリクエスト内でメモ化する(`React.cache`)。永続キャッシュは使わない。
- **アカウントを準備できること**と**実際に利用できること**は別。user を作成・有効化できても、4〜6 に該当する間はログインしても利用できない。

### 5.3 アカウント有効化の条件

- employee に紐づく user を有効化する(作成時、または `disabled → active`)には、employee に**主所属のうち `end_date IS NULL OR end_date >= 今日` を満たすものが 1 件以上**必要。`start_date` が未来でもよい。
- これにより、入社予定者について「employee 登録 → 未来日開始の主所属登録 → user 作成」を事前に準備できる。
- employee に紐づかない user(社員以外)には、この条件を適用しない。

### 5.4 deny by default とアクセス制御の適用箇所

- ポータル画面上でアプリを隠すだけではなく、URL 直打ちでもアクセス不可にする。
- 同じ判定を次のすべてから利用する: ポータルのアプリ表示、page / layout、Server Actions、Route Handler / API、データ取得処理。
- **Audience** = そのアプリ自体を表示・利用できるか。**role / permission + scope** = アプリ内で何を閲覧・編集・承認・管理できるか。

## 6. 権限モデル(RBAC + Scope)

- `role` = 何ができるか。`scope` = どの範囲でできるか。分離して扱う。
- role は全社共通。割当(`role_assignments`)で scope を指定する。
- `can(user, permissionCode, target)` は、user の role 割当のうち、その permission を持つロールの割当について、スコープが target の location / department を含むかを判定する。
  - 割当の軸が NULL ならその軸は制限なし。割当の軸が非 NULL なら、target 側の同じ軸の値が一致する必要がある。target 側の値が NULL の場合は deny。
  - 割当が location と department の両方を持つ場合は両方を満たす必要がある(AND)。
- 例:

| ロール割当 | 対象データ | 結果 |
|---|---|---|
| 白山工場 | 白山工場 / ブレーキ | 許可 |
| 白山工場 | 現工場 / ブレーキ | deny |
| 白山工場 | 拠点が NULL | deny |
| global | 任意 | 許可 |
| 白山工場 AND ブレーキ | 白山工場 / 溶接 | deny |

- **スコープ判定用の列**: 権限判定に部署・拠点が必要な業務データは、そのデータ自身に `location_id` / `department_id` を保持する。現在の社員所属から逆算しない。ただし全アプリの全テーブルに機械的には持たせず、scope 判定上必要なデータのみに持たせる。該当テーブルは manifest の `scopedEntities`(table、locationColumn、departmentColumn)で宣言する。
- **`system_admin`** は固定・保護対象とする。
  - 削除、名称変更、permission の剥奪を拒否する(`roles.is_protected`)。
  - `system_admin` を持つ有効な user が常に 1 人以上存在することを検証する。最後の 1 人の無効化、ロール剥奪、退職紐づけはすべて拒否する。
  - permission の sync で新しい permission が追加されたら、`system_admin` にのみ自動付与する。
- roles、role_permissions、role assignment は管理画面から変更できる。permission の code は変更・新規作成できない(参照のみ)。
- **異動時の警告**: 異動時に role assignment は自動変更・削除しない。社員管理画面に「この社員には現在の所属と異なる Scope の Role があります。見直してください」と警告を出す。
  - 対象: その社員の user の scoped な割当(location か department が非 NULL)のうち、現在有効な assignment のどれにも適合しないもの。適合は、割当の location と department の両方を**同じ 1 つの assignment** が満たすかどうかで判定する。
  - global の割当は対象外。所属が未設定で scoped な割当がある場合も警告する。
  - 社員一覧にもアイコンで表示する。

## 7. Audience(対象指定)

お知らせ・アプリ・リンク・将来の通知、教育、アンケート等で共通利用する「誰を対象とするか」の仕組み。Authorization Scope とはデータモデルを分離する(department / location 等の条件判定用プリミティブは core 側で再利用可能にする)。

### 7.1 基本

- Audience は名前付きで保存し、再利用する。
- 社員 ID の一覧を固定保存せず、**条件を保存して現在の社員マスタに対して毎回評価する**。異動や役職変更で対象者が自動的に変わる。
- AND / OR は 2 階層。**1 グループ内は AND、複数グループ間は OR**。無限ネストにはしない。
- `audience_id` が NULL(未設定)のアプリ・お知らせ・リンクは、**非表示・アクセス不可**。「全社員」も明示的な Audience として登録し、公開するときは必ず何らかの Audience を指定する。

### 7.2 条件の種類と評価

| 種類 | 属性 | 評価の対象 |
|---|---|---|
| 所属条件 | `department`、`location` | 1 件の assignment |
| 社員条件 | `position`、`is_management`、`employment_type`、`tenure`(例: 入社 N か月未満)、`employee`(社員を名指しで選ぶ。27 章)、個人の include / exclude | employee |

- 1 つの条件に複数の値がある場合(例: department が A か B)は OR。
- **グループ(AND)が成立する条件**: そのグループの所属条件を、**基準日に有効な 1 件の assignment が全て満たす**こと、かつ社員条件を全て満たすこと。
  - 例: 所属 1 = 白山工場 / 溶接、所属 2 = 現工場 / ブレーキ の社員は、「白山工場 AND ブレーキ」の対象にならない。1 件の assignment が白山工場 / ブレーキである場合のみ対象。
  - グループ内に所属条件が無い場合は assignment を見ない。そのため、配属未確定の社員も社員条件だけなら対象になりえる。
- 評価対象の assignment は、主所属・副所属を区別せず、基準日に有効な全件。兼務を許可しても評価関数は変わらない。
- 退職日を過ぎた社員は、評価の前段で除外する。
- 評価関数は employee ではなく `EmployeeContext { employee, activeAssignments[], position }` を受け取る。

### 7.3 実装方針

- 単一社員の判定はメモリ上で行う(`matches(audience, ctx)`)。
- 対象社員の一覧(管理画面のプレビューや人数)は、条件を SQL に変換して取得する。1 グループにつき `EXISTS (SELECT 1 FROM employee_assignments a WHERE ...)` を 1 つ生成する。
- 基準日は `asOf` パラメータで渡す。MVP の UI は「今日時点」のみ。
- 管理画面では次を確認できる: Audience 名、条件、現在の対象人数、対象社員のプレビュー、どこで利用されているか(`app_registry`、`announcements`、`portal_links` の逆引き)、有効 / 無効。
- 無効化されたマスタを参照している Audience には警告を表示する。

## 8. app registry

- 新しい業務アプリは**コード側の manifest + DB 側の `app_registry`** で管理する。
- manifest = アプリの技術的な存在・契約: `app_key`、`route`、module identifier、必要 permission code(permissions の定義)、`scopedEntities`、`version`。
- `app_registry` = ポータル上の運用設定: 表示名、説明、アイコン、表示順、有効 / 無効、Audience、ホーム画面表示設定、その他運用設定。
- `app_key` は一度作成したら原則変更しない永続 ID。
- **manifest sync(`npm run sync:manifests`)**:
  - 初回は `app_registry` に INSERT する。初期値は `is_enabled = false`、`audience_id = NULL`(誰にも見えない)。
  - 2 回目以降は manifest 側の項目と permissions のみ更新する。管理画面で設定した表示名、Audience、表示順などの運用設定は**上書きしない**。
  - manifest から消えたアプリは `is_enabled = false` にして警告を出す。削除はしない。
  - permission の新規 code は DB に追加し、`system_admin` にのみ自動付与する。
  - migration 後に明示的に実行する。起動時に自動実行しない。

### 新しいアプリを追加する標準手順

1. `modules/apps/○○` を作る。
2. manifest を定義する。
3. route の薄いラッパーを `src/app/apps/○○` に追加する。
4. 必要 permission を manifest に定義する。
5. migration を実行する。
6. manifest sync で `app_registry` に登録する。
7. 管理画面で Audience、表示名、アイコン、表示順等を設定する。

## 9. 監査ログ(audit_logs)

誰が・いつ・何を・どう変更したかを追跡する(`actor_user_id`、`at`、`action`、`target_type`、`target_id`、`before`、`after`)。全操作を大量に記録するのではなく、管理・セキュリティ上重要な操作を対象とする。

- 社員情報変更(所属の追加・変更・終了、過去分の遡及編集を含む)
- アカウント有効 / 無効、パスワード再設定
- role の変更、permission(role_permissions)の変更
- role assignment の変更
- Audience の変更
- app registry の変更
- 雇用区分、部署、拠点、役職などマスタの変更
- その他の重要な管理設定の変更

## 10. 社員管理画面の仕様

- 一覧は現在の主所属(部署 / 拠点)を結合して表示する。employees 自体に部署・拠点の列は無い。
- 詳細に「所属履歴」タブを置く(期間付き一覧、追加、終了)。
- 異動操作は 1 トランザクションで行う: 現在の主所属の `end_date` に異動日の前日を設定し、新しい主所属を `start_date` = 異動日で追加する。
- **employee は所属なしで登録できる**(配属未確定の入社予定者を先に登録するため)。ただし次の警告を表示する。
  - 所属が未設定の employee(一覧と詳細)。
  - 入社日が近い、または過ぎているのに主所属が未設定の employee(一覧の上部に表示する案)。
  - `hired_on` を過ぎても `status = planned` のままの employee。
  - 主所属を持たない期間が存在すること。
  - 異動後のロール割当の不整合(6 章)。
- 主所属の期間が重複した場合は、DB の排他制約違反(SQLSTATE 23P01)を「所属期間が重複しています」というエラー表示に変換する。
- MVP の管理画面には副所属の登録 UI を作らない。
- `employment_types` の管理画面を、部署、拠点、役職と同様に用意する。
- CSV 一括登録は MVP 外。

## 11. TODOSample の再利用方針

### そのまま使う
- `lib/anthropic.ts` の `classifyCategory` のロジック(`modules/apps/todo` へ)。
- `globals.css` と `DESIGN-long-kanazawa.md`(ロングのデザインシステム)。
- `login-form.tsx`、`logout-button.tsx` の見た目。
- `tsconfig`、`eslint.config`、`postcss` の設定。
- 作法: `loginAction` の `AuthError` 以外を再送出する catch、`useActionState` 用の `(prevState, formData)` シグネチャ、`isUniqueViolation`、bcryptjs による照合。

### 修正して流用する
- `auth.config.ts` / `auth.ts`: JWT に載せるのは `userId` のみ。`users` の新構造に合わせる。
- `proxy.ts`: ログイン済みの確認のみ。`/admin` のロール判定は外す。
- `admin/*`: 社員管理とアカウント管理に分ける。
- `actions.ts` / `todo-app.tsx`(671 行): `modules/apps/todo/` へ移す。`requireUserId` を `requireAppAccess("todo")` に置き換え、zod で入力を検証し、2〜3 ファイルに分割する。
- `categories` → `todo.todo_categories`。
- `layout.tsx` / `page.tsx`: `/` をポータルホームにする。

### 流用しない
- `lib/db.ts` の `ensureSchema()` / `ensureAdminUser()`(Drizzle migration と seed に置き換える)。
- `users.role` の `'admin' | 'user'` CHECK。
- `.env`、`dev-*.log`、`.next`、`DESIGN-wise.md`、`tsconfig.tsbuildinfo`。
- `pg.Pool` 直書きの SQL 文字列組み立て(Drizzle に置き換える)。

TODOSample の git 履歴は新リポジトリに持ち込まず、必要なファイルのみコピーする。既存データは移行しない。

## 12. MVP

### 範囲

1. 認証
2. 社員管理(所属履歴、異動、警告を含む)
3. 部署管理
4. 拠点管理
5. 役職管理
6. 雇用区分管理
7. role / permission 管理(permission は参照のみ、role と role_permissions は編集可)
8. scope 付き role assignment
9. Audience 管理
10. app registry
11. ポータルホーム
12. お知らせ
13. 社内リンク
14. ログイン社員ごとのアプリ表示
15. TODO アプリの移植
16. audit_logs

MVP 後: notifications、副所属の UI、将来日付での Audience プレビュー、Preview ごとの Neon ブランチ自動作成、CSV 一括登録。

### 実装順序

0. リポジトリ初期化(Node / npm / 依存の固定、Drizzle、ESLint の境界ルール)、Neon project と環境変数の設定。
1. core スキーマ(組織・人)と migration(`btree_gist`、排他制約、CHECK 制約を含む)、seed(初期 `system_admin`、雇用区分、基本ロール)。
2. 認証: users、ログイン、JWT(userId のみ)、`proxy.ts`、`resolveActor`。
3. 部署・拠点・役職・雇用区分・社員の管理画面、所属履歴タブ、異動操作、未配属の警告、アカウント発行(有効化条件を含む)。
4. roles、permissions、scope 付き割当、`can` / `requirePermission`、`system_admin` の保護、異動時のロール警告、audit_logs。
5. Audience: スキーマ、評価関数(SQL とメモリ)、管理画面(プレビュー付き)。
6. app registry、manifest sync、`canAccessApp`、`requireAppAccess`。
7. ポータルホーム、お知らせ、社内リンク。
8. TODO アプリの移植。
9. 結合確認: URL 直打ちの拒否、Audience 変更の即時反映、異動・退職・入社前・休職の判定、`system_admin` の保護。

## 13. 将来拡張の余地

- 兼務・複数拠点勤務: 複数の active assignment を許可する(テーブル構造は変えない)。
- team / organizational_unit: ロールスコープと Audience の軸として追加する。
- Audience の個人追加 / 除外(`audience_members`)。
- notifications。
- 追加予定のアプリ: 新人教育 / 教育進捗、改善提案、品質 / 出し直し、設備管理、申請、人事、マニュアル、AI、経営ダッシュボード。

## 14. 実装時に確認すること

- Drizzle のスキーマ DSL は EXCLUDE 制約を表現できない。`drizzle-kit generate --custom` による手書き SQL の migration とし、以降の generate が当該制約を削除しようとしないか確認する。
- Neon の development ブランチで `btree_gist` の作成と排他制約の適用が通るか、migration を実際に流して確認する。
- 5.2 の判定は `hired_on` が NOT NULL である前提(本書では NOT NULL としている)。
- Next.js 16.3.8 の仕様(middleware / `proxy.ts`、Server Actions、キャッシュ)は `node_modules/next/dist/docs/` で確認しながら実装する。
- Vercel の Node バージョン設定と `engines` の整合。


## 15. UI 方針(ポータル画面)

- 配色・書体・フラットな見た目(影・グラデーションを使わない)・「hover は brand03」「現在地は brand03」・英字+和文の見出しペア・日付表記 `YYYY.MM.DD` は `docs/design-system-long-kanazawa.md` に従う。
- **例外**: コーポレートサイト用の「1920px 基準の流体ルートフォントサイズ」は採用しない。毎日使う業務画面の視認性を優先し、ルートは 16px 固定とする。見出しの英字サイズも業務画面向けに縮小する。
- 画面本体は `src/modules/core/portal/` に置き、`src/app/(portal)/` は薄い route / layout のみ。画面コンポーネントは `queries.ts` の戻り値(`types.ts`)だけに依存する。
- 見本(架空)のデータは画面に出さない。未実装の情報(お知らせ・アプリ・社内リンク・要対応)は `queries.ts` が空で返し、画面は枠と「まだありません」の表示だけを出す。実装時に `queries.ts` の中身を実データに差し替える(2026-10-14 に見本データ `mock-data.ts` を削除)。

### 画面の役割分担

- **右上(ヘッダー)** = 自分が誰か(氏名、所属、役職、ロール、アカウントメニュー)。
- **左サイドバー** = どこへ移動するか。ホーム / お知らせ(個人・重要・全社) / アプリ / 社内リンク(常時表示、別タブで開く) / 管理(管理者のみ、折りたたみ可能)。アプリ項目はホームのアプリ一覧と同じ(Audience 判定後の)リストから作る。
- **ホーム中央** = 今、自分が見るべき情報。上から、緊急バナー(該当時のみ)、あなたへのお知らせ(要対応・未読を優先)、要対応(PENDING。各アプリが報告する件数。該当時のみ)。将来は、本当にホームで見る価値のある進捗・件数だけを追加する。氏名・所属などの自己紹介、アプリ一覧、社内リンク、通常の全社連絡は置かない(アプリへの移動はサイドバーから行う)。

### お知らせの共通モデル

個人用と全社用でテーブルを分けず、1 つのモデル(`core.announcements` 想定)で表す。

- `target`: `company`(全社員) / `audience`(特定 Audience) / `individual`(個人指定)。
- `priority`: `normal` / `important` / `urgent`。
- `kind`: 連絡、確認依頼、承認依頼、教育、担当案件、安全、健康、行事、ルール、システム など。
- サイドバーの振り分け: `target = company` は「重要・全社」、それ以外は「個人」。
- ホームのバナー: `target = company` かつ `priority = urgent` かつ表示期限(`bannerUntil`)内のものだけ。
- 本人ごとの状態(既読、要対応)は別テーブル(既読管理など)で持つ。

## 16. 実装メモ(手順 3 時点)

- **管理者の暫定規則**: roles / role_assignments / permissions を実装する手順 4 までは、「社員に紐づかないアカウント(`employee_id` が NULL)= システム管理者」とする(`modules/core/access/admin.ts`)。社員に発行したアカウントは管理者にならず、管理画面(`/admin/*`)は 404 になる。手順 4 で `system_admin` ロールの判定に置き換える。
- **監査ログ(`core.audit_logs`)**: 設計の手順 4 から前倒しで、手順 3 で導入した。社員の登録・更新・異動・所属終了、アカウントの発行・有効化・無効化・パスワード再設定、組織マスタの追加・更新を、変更と同じトランザクションで記録する(パスワードなどの秘密は含めない)。閲覧画面は後続の手順で作る。
- **アカウントの発行**: 終了していない主所属(開始日が未来でもよい)が必要。一時パスワードは発行時に 1 度だけ画面へ表示し、初回ログインで本人が変更する。社員以外のアカウントの発行画面は、手順 4 以降(アカウント管理)で作る。
- **異動**: 異動日に有効な現在の主所属を前日で終了し、新しい主所属を異動日から始める(1 トランザクション)。異動日以降に開始する主所属が既にある場合は登録できない。MVP の画面・Server Action は主所属のみを扱う。
- **警告**: 主所属が未設定(入社日が 14 日以内ならより強い警告)、今日時点の主所属がない(開始前)、入社日を過ぎても入社予定のまま、退職済みなのにアカウントが有効、を社員一覧・詳細に表示する。ロール割当の不整合の警告は手順 4 で追加する。

## 17. 実装メモ(手順 4 時点)

- **管理者の判定**: 手順 3 の暫定規則(社員に紐づかないアカウント = 管理者)は廃止し、ロールの権限(`core.*`)の判定に置き換えた。管理画面と管理系 Server Action は `requireGlobalPermission(code)`(全社スコープの権限が必要。なければ 404)で本判定する。サイドバーの管理メニューも、必要な権限を持つ項目だけを出す。
- **権限(permission)**: code は `modules/core/roles/catalog.ts` で定義し、`npm run sync:manifests` で DB に反映する(管理画面からは作れない)。新しい権限は `system_admin` にだけ自動付与される。コードにない権限は既定で残して警告し、`--prune` で削除する。
- **スコープの判定**: `can(actor, code, { locationId, departmentId })`(スコープ込み)と `canGlobally`(全社のみ)。割当の軸が NULL なら制限なし、軸が指定されていれば対象データの同じ軸が一致する必要があり、対象データの値が NULL なら deny。ユーザーの権限は JWT ではなく、毎回 DB から読む(`Actor.grants`)。
- **`system_admin` の保護**: 削除・名称変更・権限の変更は不可。全社の割当のみ可能(拠点・部署の指定は不可)。「アクセスできる最後の 1 人」の `system_admin` については、割当の解除・アカウントの無効化・退職や入社予定への変更を拒否する(無効・退職済み・入社前などアクセス判定に通らない保持者は数えない)。
- **初期設定と復旧**: `npm run db:seed` が、`system_admin` を持つユーザーがいなければ、最も古い「社員に紐づかないアカウント」に付与する。管理者がいなくなった場合は `npm run db:grant-admin -- <login_id>` で復旧する(`DB_TARGET` の明示が必要)。
- **異動時のロール警告**: スコープ付きのロール割当が、現在有効な所属のどれにも適合しない場合(拠点と部署の両方を指定した割当は、同じ 1 件の所属が両方を満たす必要がある)、社員一覧・詳細に警告を出す。ロール割当は異動で自動的には変わらない。
- **ロール割当の重複**: 同じ(ユーザー、ロール、拠点、部署)の組は、NULL を同じ値として扱って禁止する(`UNIQUE NULLS NOT DISTINCT`)。
- **監査ログの閲覧**: `/admin/audit-logs`(`core.audit.view`)。ロール・ロール割当の変更も記録対象に加えた。
- **今後**: 権限の「閲覧のみ」(`core.employees.view` など)は未対応。必要になったら権限を追加する。

## 18. 実装メモ(手順 5 時点)

- **評価の方法(設計 7.3 からの変更)**: 対象社員の一覧・人数は、条件を SQL に変換せず、**全社員分を 2 回のクエリで読み込み、単一社員の判定と同じ関数(`matchesAudience`)でメモ上で評価する**。社員数が数百人規模のため性能上の問題はなく、判定ロジックが 1 か所になる(SQL とメモリの 2 つの実装がずれる危険を避ける)。社員数が大幅に増えた場合は、SQL への変換を再検討する。
- **評価の前提**: いまアクセスできる社員だけを対象にする(入社予定・退職済み・入社前・退職日の翌日以降は対象外)。判定は `access/evaluate.ts` の `evaluateEmployeeAccess` と同じ規則。
- **条件の種類**: 所属条件(部署・拠点。**同じ 1 件の所属**が全所属条件を満たす場合だけ成立)、社員条件(役職、雇用区分、管理職、入社からの期間 = 満の月数で「未満 / 以上」)。マスタは ID で保存する。1 つの条件に複数の値がある場合は OR。
- **意味の取り決め**: グループが 0 個 = 誰も対象にならない / 条件が 0 個のグループ = いまアクセスできる全員(「全社員」)。無効な Audience は誰も対象にしない。
- **初期の Audience**: seed が「全社員」(条件のない 1 グループ)を作る(既にあれば何もしない)。
- **管理画面** `/admin/audiences`(`core.audiences.manage`): 一覧(条件の文章、現在の対象人数、利用先、無効なマスタを参照している警告)、作成・編集(条件をグループ単位で組み立てる)、保存前のプレビュー(対象人数と対象社員)、削除。
- **未実装**: 個人の追加・除外(`audience_members` は構造のみ)。利用先の表示と「利用中は削除不可」は、利用先(アプリ登録・お知らせ・リンク)ができる手順 6・7 で有効になる(`listAudienceUsages` に集約済み)。

## 19. 実装メモ(ログインの強化)

- **入力の長さの上限**: ログイン ID は 50 文字、パスワードは 200 文字まで。超えた入力は、照合も記録もせず、通常の失敗と同じ文言で拒否する(bcrypt の負荷と、記録の肥大化を避ける。TODOSample と同じ方針)。パスワード変更の「現在のパスワード」も同じ上限。
- **失敗回数の制限**(`modules/core/auth/throttle*.ts`、テーブル `core.login_attempts`):
  - 同じログイン ID の失敗が **15 分間に 5 回**に達したら、その後の試行を止める(ロック中は、正しいパスワードでも照合しない)。
  - 同じ接続元の失敗が 15 分間に 50 回に達したら、その接続元からの試行を止める(会社の同じ出口から全員がつなぐ場合を考え、高めにしている)。
  - 成功すると、その ID の失敗の数え直しになる。存在しない ID も同じように数えるので、ID の有無は推測できない。管理者がパスワードを再設定すると、その ID のロックも解除される。
  - 画面には「試行回数が多すぎます。15 分ほど待ってください」と出る。
- **記録の読み書きに失敗しても、ログインは止めない**(制限が効かないだけで、サーバーのログに残す)。migration の適用前の環境でも、ログインできる。**本番に新しいコードを出すときは、先に本番へ migration を適用する**(適用するまでは、制限が働かない)。
- **セキュリティヘッダー**(`next.config.ts`): `X-Frame-Options: DENY`(他のサイトへの埋め込みの禁止)、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`。CSP と HSTS は未設定(HSTS は Vercel が付ける。独自ドメインにしたときに再検討)。
- **未対応**: パスワード変更画面(現在のパスワードの照合)の失敗の制限、ロックされたことの管理者への通知、2 要素認証。

## 20. 実装メモ(ファイル保管: Cloudflare R2)

- **方式(TODOSample と同じ)**: 署名付き URL で、ブラウザから R2 へ直接アップロード/ダウンロードする(Vercel の関数の本文サイズの上限を避ける)。URL を発行する側(各アプリの Server Action)が、`requireAppAccess` やロールの権限で、誰がどのファイルに触れるかを判定する。URL の有効期間は 5 分。
- **構成**: バケットは `longportal` の **1 つ**(非公開)。API トークンも 1 つ(`longportal` 専用、「オブジェクトの読み取りと書き込み」のみ)。開発と本番は、キーの頭の印(`R2_KEY_PREFIX`: 手元と Preview は `dev/`、本番は `prod/`)で置き場所を分ける。**これは置き場所の区別で、権限の分離ではない**(手元のキーが漏れると、本番のファイルにも触れる)。社員の実際のファイルを本番に入れる前に、バケットとキーを分けることを再検討する。
- **保存キー**: `<プレフィックス><アプリのキー>/<所有者の ID>/<UUID>.<拡張子>`。元のファイル名はキーに入れず、各アプリの DB のメタ情報で持つ。他の環境のプレフィックスのキーは、削除・参照できない。
- **実装**: `modules/core/storage/`(`policy.ts` = 純粋な規則とテスト、`r2.ts` = R2 とのやりとり)。環境変数は `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_KEY_PREFIX`。接続確認は `npm run r2:check`(試験用のファイルを作って、読んで、消す)。
- **メタ情報のテーブル**(ファイル名、サイズ、所有者など)は、最初の利用者(TODO アプリの添付ファイル、手順 8)を作るときに、migration で追加する。いまは未作成。
- **CORS**: トークンの権限が「オブジェクトの読み書き」のみで、バケットの設定は変えられないため、Cloudflare の画面から設定する(内容は `docs/r2-cors.json`)。許可オリジン: `localhost:3000/3001`、本番の独自ドメイン `long-ishikawa.com`(2026-10-15 に追加)、`longportal.vercel.app` ほか 2 つの別名。独自ドメインを足したときや、ポートを変えたときは、ここも更新する。プレビューごとの固有 URL は許可していない。

## 21. 実装メモ(社員の一括取り込み)

- **方式**: 管理画面ではなく、手元から実行するスクリプト `npm run db:import-employees -- <CSV> --actor <ログインID> [--apply]`(`scripts/import-employees.ts`)。既定は確認だけで、`--apply` を付けたときだけ書き込む。他のスクリプトと同じく `DB_TARGET` の明示が必須で、本番には `CONFIRM_PRODUCTION=yes` も要る。
- **取り込む項目は 6 つだけ**: 社員番号・氏名・フリガナ・役職・部署・入社日(見出し `employee_number,name,name_kana,position,department,hired_on`)。住所・電話番号・生年月日・家族などは、ポータルでは扱わないため取り込まない。
- **追加のみ**: 新しい社員番号だけを追加し、登録済みの社員は変更しない(何度実行しても重複しない)。修正は管理画面で行う。
- **正規化**: 半角カナ・全角英数は NFKC で統一し、空白の連続は全角空白 1 つにする。入社日は `YYYY/M/D` などを `YYYY-MM-DD` にする(`modules/core/employees/import.ts` = 純粋関数とテスト)。
- **マスタ**: 部署・役職の名前がマスタになければ追加する(code は名前から作る `dept_xxxxxxxx` / `pos_xxxxxxxx`)。雇用区分は CSV にないため、全員に `--employment-type`(既定 `regular` = 正社員)を設定する。違う人は画面で直す。
- **初期の主所属**: `--assign-location <拠点名>` を付けると、主所属が 1 件もない社員に、CSV の部署 × 指定の拠点で主所属を作る(開始日は `--start`、既定は今日)。部署が空の社員には作らない。実際の拠点は、下の「拠点の割り当て」画面で選び直す。
- **個人情報の扱い**: CSV はリポジトリの外(一時フォルダ)に置き、使い終わったら削除する。スクリプトの出力には、社員の氏名を出さない(件数と、部署・役職の名前だけ)。
- **元の名簿**: 社内サーバーの `社員名簿.xls` の「名簿 (2)」シート(2026-10-14 時点で在籍 54 人)。

### 所属の割り当て画面(`/admin/employees/assignments`)

- 退職者以外の社員を、部署の並び順 → 社員番号の順で表にし、各行の**選択欄で部署**を、**丸(ラジオボタン)で拠点**を選ぶ。列は有効な拠点。拠点ごとの人数を見出しに出す。主所属がない社員、無効な部署・拠点に所属している社員は、この画面では変えられない(詳細画面で設定する)。
- 保存すると、部署か拠点が変わった社員だけを処理する。変更日(既定は今日)に始まった主所属は**付け直し**(監査ログ `employee.assignment.update`)、それより前から続く主所属は、前日で終了して新しい主所属を始める**異動**として扱う(`employee.transfer`)。判定は `planAssignmentChange`(純粋関数とテスト)。
- 2026-10-15 に、拠点だけの画面(`/admin/employees/locations`、監査ログ `employee.assignment.location`)から、部署も変えられるこの画面に置き換えた。
- 全員を 1 トランザクションで処理し、1 人でも失敗したら何も変えない(一部だけ変わった状態を残さない)。権限は `core.employees.manage`。

### アカウントの一括発行(`npm run db:issue-accounts`)

- `npm run db:issue-accounts -- --actor <ログインID> --out <配布用 CSV> [--apply]`(`scripts/issue-accounts.ts`)。既定は確認だけ。
- 対象は、退職していない社員のうち、アカウントがまだなく、終了していない主所属がある人(画面からの発行と同じ条件)。**ログイン ID は社員番号**(小文字)。使用済み・形式違いの社員番号は飛ばす。
- 初期パスワードは一人ずつ `generateTempPassword` で作り、初回ログインで変更を求める(`must_change_password`)。配布用 CSV(社員番号・氏名・ログイン ID・初期パスワード。Excel 用に BOM 付き UTF-8)を、**確定の前に**書き出す(書き出せなければ発行も取り消す)。
- 配布用 CSV は、リポジトリの中には書き出せない(スクリプトが拒否する)。既存のファイルは上書きしない。配り終えたら削除する。

### 状況(2026-10-15)

- 開発 DB: 拠点 3 つ(本社工場・2号店・B工場。白山工場は現在ないため未登録)、社員 54 人に本社工場の主所属、54 人にアカウントを発行済み。2号店は溶接、B工場はレーザーの社員だけがいる(画面で選び直す。開発 DB では選び直し済み)。
- 本番: 未実施。

## 22. 実装メモ(氏名を姓と名に分ける)

- **保存**: `core.employees` に `family_name`(姓・必須)・`given_name`(名)・`family_name_kana`・`given_name_kana` を持つ。入力・更新はこの 4 つだけ。
- **表示用の氏名**: `name` / `name_kana` は、姓と名から DB が作る**生成列**(`GENERATED ALWAYS AS ... STORED`)。アプリから書き込まない。一覧・検索・権限の画面などは、今までどおり `name` を読む。つなぎ方: 姓と名がどちらも英字(ASCII)だけなら半角空白、それ以外は全角空白。名が空なら姓だけ。かなは全角空白でつなぎ、両方空なら NULL。
- **分け方**(既存データの移行と、名簿の取り込みで共通。`modules/core/employees/names.ts` = 純粋関数とテスト。migration の SQL も同じ規則):
  - 日本語の氏名: 最初の空白の前が姓、後ろが名。
  - 英字だけの氏名(ベトナムの方など): **最後の語が名、それより前(ミドルネームまで)が姓**。例: `LE QUOC AN` → 姓 `LE QUOC`・名 `AN`。
  - 空白のない氏名: 全体を姓とし、名は空(画面で直す)。
  - かな: 氏名が英字だけなら、かなも最後の語を名にする(中黒「・」でも区切る。例: レ・クオック・アン → 姓 レ・クオック・名 アン)。それ以外は、最初の空白の前を姓にする。
  - 表示用のかな(`name_kana`)は、姓(かな)に中黒があれば中黒で、なければ全角空白でつなぐ(migration 0007)。
- **区切りのないかな**(名簿の「ヤマダタロウ」など)は、規則では分けられない。漢字の姓名を手がかりに分けた一覧(CSV: `employee_number,family_name_kana,given_name_kana`)を人が確認し、`npm run db:update-name-kana -- <CSV> --actor <ログインID> [--apply]`(`scripts/update-name-kana.ts`)で入れる。今のかなと、区切りを除いて文字が一致しない行があれば、何も更新しない。2026-10-15 に開発 DB の 43 人分で使用(確認待ち)。
- 名簿 CSV の見出しは今までどおり(`name` / `name_kana` に氏名全体)。取り込み時に上の規則で分ける。

## 23. 実装メモ(手順 7: お知らせ・社内リンク)

4.3 の `announcements` / `portal_links` と「お知らせの共通モデル」(15 章)を、次の形で実装する。module は `core/notices`(お知らせ)と `core/links`(社内リンク)。ポータル画面(`core/portal`)は、この 2 つの公開 API だけを呼ぶ。

### テーブル

- **`core.announcements`** … `id`、`title`(100 字まで)、`body`(5000 字まで。文章と改行のみ)、`kind`(連絡・確認依頼・承認依頼・教育・担当案件・安全・健康・行事・ルール・システム)、`priority`(`normal` / `important` / `urgent`)、`target`(`company` / `audience` / `individual`)、`audience_id`(`target = audience` のときだけ必須。CHECK 制約)、`requires_action`(確認ボタンを出すか)、`status`(`draft` / `published`)、`published_on`(掲載開始日・JST)、`expires_on`(掲載の最終日・任意)、`banner_until`(ホーム上部のバナーの最終日。`company` かつ `urgent` のときだけ。CHECK 制約)、`created_by` / `updated_by`(user_id)、作成・更新日時。
- **`core.announcement_recipients`** … `target = individual` の宛先(`announcement_id` × `employee_id`)。
- **`core.announcement_reads`** … 本人ごとの状態(`announcement_id` × `user_id`、`read_at`、`acknowledged_at`)。詳細を開いたら既読、確認ボタンを押したら確認済み。
- **`core.portal_links`** … `id`、`title`、`url`(`https://` / `http://` のみ)、`description`、`target`(`company` / `audience`)、`audience_id`、`sort_order`、`is_active`、作成・更新日時。

### 見える条件(deny by default)

- お知らせ: `status = published` かつ `published_on <= 今日 <= expires_on`(空なら無期限)、かつ宛先に当てはまる。`company` = ログインできる全員。`audience` = その Audience に一致する社員(無効な Audience は誰にも見せない)。`individual` = 宛先に入っている社員。
- 対象外の人には、一覧にも詳細にも出さない(詳細は 404)。既読・確認の操作も、同じ判定を通す。
- 社内リンク: `is_active` かつ宛先に当てはまる。
- 判定は Audience の `matchesAudience`(単一社員の判定と同じ関数)を使う。

### 画面

- 社員: `/notices/personal`(`company` 以外)、`/notices/company`(`company`)、`/notices/[id]`(詳細。開くと既読。確認が必要なら「確認しました」ボタン)。ホームは既存の部品(緊急バナー・あなたへのお知らせ)に実データを渡す。サイドバーに未読の件数。要対応 = `requires_action` で、まだ確認していないもの。
- 管理: `/admin/notices`(一覧・作成・編集・公開・下書きに戻す。宛先の人数と、既読・確認の人数。確認状況の一覧)、`/admin/links`(登録・編集・並び順・有効 / 無効)。権限は `core.notices.manage` / `core.links.manage`(全社)。権限管理の画面で、ロールに付けて任せられる。
- 変更はすべて監査ログに記録する。Audience の「利用先」(`listAudienceUsages`)に、お知らせと社内リンクを加える(利用中の Audience は削除できない)。

## 24. 実装メモ(手順 6: アプリの登録簿)

8 章の app registry を、次の形で実装する(module は `core/apps`)。2026-10-15 にユーザーと決めた範囲: 登録簿・Audience による表示と入場の制限・**別プロジェクトのアプリは URL で登録**。別プロジェクトへの自動ログイン(SSO)と、アプリごとの開発者・管理者の指定(`docs/plans/step6-plan-draft.md`)は、あとの段階。

- **`core.app_registry`** … `app_key`(PK・永続。半角小文字・数字・`_` `-`)、`kind`(`internal` = ポータルの中のアプリ / `external` = 別プロジェクトのアプリ)、`display_name`、`description`、`icon`、`url`(external だけ。`https://` / `http://`)、`route`(internal だけ。manifest から)、`target`(`company` / `audience`)、`audience_id`、`sort_order`、`is_enabled`、`in_manifest`(internal で、manifest にまだあるか)、作成・更新日時。
- **internal**: コード側の manifest(`modules/apps/○○/manifest.ts`。一覧は `modules/apps/manifests.ts`)を `npm run sync:manifests` で登録する。初回は `is_enabled = false`(誰にも見えない)。2 回目以降は `route` と権限だけを更新し、管理画面で決めた表示名・Audience・表示順などは上書きしない。manifest から消えたアプリは `is_enabled = false`・`in_manifest = false` にして警告する(削除しない)。
- **external**: 管理画面(`/admin/apps`)から登録する(sync の対象外)。サイドバーから別タブで開く。いまは URL を開くだけで、ログインは各アプリ側。
- **見える条件**(deny by default): `is_enabled` かつ宛先に当てはまる(`company` = 全員、`audience` = 有効な Audience に一致)。サイドバー・ホームのアプリ一覧は、この判定を通ったものだけ。
- **入場の制限**: internal のアプリのページは、最初に `requireAppAccess(app_key)` を呼ぶ。見えない人は 404(存在も知らせない)。判定は `canAccessApp`。
- **管理**: `/admin/apps`(権限 `core.apps.manage`)。表示名・説明・アイコン・表示順・有効/無効・宛先を変更、external の追加・削除。変更は監査ログに記録。Audience の利用先に、アプリを加える。

## 25. 実装メモ(手順 8: TODO アプリ)

TODOSample の TODO を、ポータルの中のアプリ(`modules/apps/todo`、`app_key = todo`、`/apps/todo`)として移植する。2026-10-15 にユーザーと決めたこと: カテゴリは仕事向け、Claude による自動分類あり(モデルは Claude Haiku 5.5)、添付は 1 つ 25MB まで。

- **データは本人だけのもの**: TODO・添付は `user_id`(`core.users`、削除時は CASCADE)に紐づき、本人以外(管理者を含む)には見せない。すべての読み書きは `user_id = 本人` で絞り込む。画面の入口は `requireAppAccess("todo")`(アプリ管理で有効にし、表示する相手に当てはまる人だけ)。Server Action も、毎回同じ判定を通す。
- **テーブル**(`pgSchema("todo")`): `todo.categories`(code・表示名・絵文字・並び順。初期値は migration で入れる: 業務・会議・連絡・書類・安全・設備・教育・改善・その他)、`todo.todos`(タスク名 200 字・完了・詳細 5000 字・優先度 低/中/高・カテゴリ・期限(JST の暦日)・作成/更新日時)、`todo.attachments`(R2 のキー・元のファイル名・サイズ・種類)。主キーは UUID。
- **自動分類**: タスクを追加すると、タスク名を Claude Haiku 5.5(`claude-haiku-5-5`、構造化出力でカテゴリの code を 1 つ返す、effort `low`)に送り、カテゴリを決める。API キーが無い・失敗・断られた場合は「その他」にして、追加は止めない。送るのはタスク名とカテゴリ一覧だけ(氏名などは送らない)。環境変数 `ANTHROPIC_API_KEY`(Vercel では Sensitive)。
- **添付**: `core/storage`(R2、署名付き URL)を使う。キーは `<環境>/todo/<user_id>/<UUID>.<拡張子>`。登録前に、キーが本人のものか・R2 に実在するか(`headObject`)を確かめる。TODO を削除したら、R2 のファイルも消す(失敗しても TODO の削除は止めない)。
- 画面は TODOSample と同じ機能(追加・完了・編集・削除の取り消し・並べ替え・カテゴリの絞り込み・期限の相対表示・完了済みの一覧)を、ポータルのデザインで作る。

## 26. 実装メモ(本人によるパスワードの再設定・メールアドレス)

2026-10-16 にユーザーと決めたこと: 初期パスワードは管理者が配布用ファイルで把握する。社員は**初回ログインで、自分のパスワードとメールアドレスを必ず登録**する。パスワードを忘れたら、**確認済みのメール**に届くリンクで、本人が再設定する。送り元は `no-reply@e-long.co.jp`(DNS は Cloudflare)、送信サービスは Resend(Vercel Marketplace)。管理者による再設定(社員の詳細画面)も残す。

- **`core.users`** に `email`(小文字で保存。空でない値は一意)と `email_verified_at` を追加する。ログイン用の連絡先なので、社員(人事)ではなくアカウントに持つ。
- **`core.auth_tokens`** … `id`、`user_id`、`purpose`(`email_verify` / `password_reset`)、`token_hash`(SHA-256。トークン本体は保存しない)、`email`(確認するアドレス)、`expires_at`、`used_at`、作成日時。トークンは 32 バイトの乱数。有効期間は、メール確認 24 時間、パスワード再設定 30 分。1 回使ったら無効。新しいものを発行したら、同じ目的の古いものは無効にする。
- **初回ログイン**(`must_change_password`): パスワードの変更と同時に、メールアドレスの登録を必須にする。保存すると確認メールを送る。確認が済むまでは、ポータルの上部に案内を出す(ポータルは使える)。
- **パスワードを忘れた**(`/forgot-password`、ログイン不要): ログイン ID を入れる。確認済みのメールがあるときだけ、再設定のリンクを送る。ID の有無・メールの有無にかかわらず、画面には同じ案内を出す(他人の ID を探られないように)。送るのは、同じアカウントに 1 時間 3 回まで。
- **再設定**(`/reset-password?token=…`、ログイン不要): 新しいパスワードを決める。成功したら、`must_change_password = false`、ログイン失敗の記録を消す。監査ログ `user.password_reset_self`。
- **メールの確認**(`/verify-email?token=…`、ログイン不要): トークンのアドレスが、今のアカウントのアドレスと同じときだけ確認済みにする。
- **メールの変更**: パスワード変更の画面で、今のパスワードを入れて変更する。変えると未確認に戻り、確認メールを送る。
- **送信**: `core/mail`(`sendMail`)。Resend をつなぐまで、開発環境では送る内容を開発サーバーのログに出す。本番で送信の設定がなければ、エラーを記録する(画面には同じ案内を出す)。リンクの先頭は `APP_URL`(本番 `https://long-ishikawa.com`)。

## 27. 実装メモ(Audience: 社員を名指しで選ぶ)

2026-10-16 にユーザーの要望で追加: 部署や役職などの属性ではなく、**社員の一覧から選んで**対象にしたい(例: 「アプリ開発に携わる人だけ」)。

- 条件の種類に `employee`(表示名「社員」)を加える。`operator` は `in`、`value` は社員 ID の配列(1〜500 件)。社員本人に対して評価する社員条件(どれかに当てはまれば成立)。
- 社員 ID の一覧を保存することになるが、評価は他の条件と同じく毎回行うため、**退職・入社前など、いまアクセスできない社員は対象にならない**(7.2 の前段の除外)。
- ほかの条件と同じグループに入れると「かつ」になる。特定の人を足したいときは、「社員」だけのグループを別に作る(グループどうしは「または」)。
- 一覧の表示では、退職などでいまアクセスできない社員・存在しない社員を参照していると、「無効なマスタを参照」の警告を出す。
- 編集画面では、社員番号・氏名・フリガナ・主所属で絞り込める一覧から選ぶ(いまアクセスできる社員のみ。選択済みの対象外の社員は印を付けて残す)。
- DB: `audience_conditions_attribute_check` に `employee` を加える(migration 0013)。`audience_members`(個人の追加・除外)は引き続き使わない。
