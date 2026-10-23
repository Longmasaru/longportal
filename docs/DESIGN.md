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
**`hr.records`**(人事管理アプリの、社員ごとの面談・注意・ほめの記録。`employee_id` FK → `core.employees`。31 章)

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
- **ホーム中央** = 今、自分が見るべき情報。上から、緊急バナー(該当時のみ)、あなたへのお知らせ、要対応(PENDING。各アプリが報告する件数。該当時のみ)、今週の予定(会社カレンダーを使える人だけ。2026-10-21 追加)。将来は、本当にホームで見る価値のある進捗・件数だけを追加する。氏名・所属などの自己紹介、アプリ一覧、社内リンクは置かない(アプリへの移動はサイドバーから行う)。
- **あなたへのお知らせ**(2026-10-17 変更): ホームを「お知らせの入口」にする。個人宛・全社宛を問わず、**未読のもの**と**要対応(確認がまだのもの)**を、要対応 → 未読 → 新しい順に出す(全社宛には「全社」の印)。既読で対応も済んだものは出さない(一覧はサイドバーの「個人」「重要・全社」で見る)。以前は、全社宛の通常のお知らせをホームに出していなかったが、見落としが起きるため改めた。
- **お知らせのプレビュー**(2026-10-21、社員の提案): ホームのお知らせは、本文の先頭を 3 行まで見せる。長いものは「続きを読む」で、その場で全文を開く(URL はリンクになる)。開いたら既読にする(詳細の画面を開いたときと同じ。次にホームを開くと、未読ではなくなったものは出ない)。確認ボタンは詳細の画面にあるので、要対応のものには「開いて確認する」を出す。
- **今週の予定**(2026-10-21、社員の提案): 月曜〜日曜の 7 日分。会社の休み・祝日・出勤土曜(会社カレンダー)と、本人のメモ・予定(カレンダーのアプリ。1 日 3 件まで、残りは件数)。日付を押すと、その月のカレンダーを開く。スマホは日ごとの縦の一覧、広い画面は 7 列。データは apps/calendar の `getHomeWeek` が作り、`src/app` のホームが `PortalHome` に渡す(core はアプリを参照しない)。

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
- **個人宛ての権限**(2026-10-23、ユーザーの判断): 個人宛て(社員の名指し)のお知らせは、`core.notices.manage` に加えて `core.notices.individual` を持つ人だけが作成・閲覧できる(system_admin には sync で自動付与)。持たない人(例: ロール「お知らせ担当」)の管理画面には、個人宛ては一覧にも出ず、宛先の選択肢にも「個人指定」が出ない。id を直接送っても、保存・下書きに戻す・削除はできない(サーバーで判定)。全社・Audience 宛て(緊急を含む)は、`core.notices.manage` だけで出せる。運用のルールとして、個人への連絡は LINE WORKS を使い、ポータルの個人宛ては必要なときだけにする。

### 23.1 添付ファイル・音声入力・AIで整える(2026-10-23、ユーザーの要望)

- **添付ファイル**: `core.announcement_attachments`(migration `0028_notice_attachments`。お知らせ・R2 のキー・元の名前・大きさ・種類・アップロードした人)。1 件に 10 個まで、1 つ 25MB まで。実行できる形式(exe・bat・js など)は断る。作る画面でファイルを選ぶと、その場で R2 へ直接アップロードし(キーは `<環境>notices/<アップロードした人>/<UUID>`)、「公開する」「下書きとして保存」で結び付ける。サーバーは、キーがこの人・この環境のものか、R2 に実在するかを確かめてから登録する。外した添付と、削除したお知らせの添付は、R2 からも消す(保存しなかったアップロードは R2 に残る。件数が増えたら掃除を考える)。
- **見られる人**: ダウンロードの署名付き URL(5 分)は、そのお知らせが届いている人(宛先の判定を通った人)と、お知らせ管理の人(個人宛ては個人宛ての権限も要る)にだけ出す。社員の詳細画面に一覧、ホーム・一覧には「📎 添付 N」。
- **音声入力・AIで整える**: 本文の下に、共通の音声入力のボタンと「AIで整える」(Claude Haiku。タイトルと本文だけを送る。案を見せ、「この案を使う」で入れ替え、「元に戻す」で戻せる)。目安箱・人事管理と同じ形。
- 変更はすべて監査ログに記録する。Audience の「利用先」(`listAudienceUsages`)に、お知らせと社内リンクを加える(利用中の Audience は削除できない)。

## 24. 実装メモ(手順 6: アプリの登録簿)

8 章の app registry を、次の形で実装する(module は `core/apps`)。2026-10-15 にユーザーと決めた範囲: 登録簿・Audience による表示と入場の制限・**別プロジェクトのアプリは URL で登録**。別プロジェクトへの自動ログイン(SSO)と、アプリごとの開発者・管理者の指定(`docs/plans/step6-plan-draft.md`)は、あとの段階。

- **`core.app_registry`** … `app_key`(PK・永続。半角小文字・数字・`_` `-`)、`kind`(`internal` = ポータルの中のアプリ / `external` = 別プロジェクトのアプリ)、`display_name`、`description`、`icon`、`url`(external だけ。`https://` / `http://`)、`route`(internal だけ。manifest から)、`target`(`company` / `audience`)、`audience_id`、`sort_order`、`is_enabled`、`in_manifest`(internal で、manifest にまだあるか)、作成・更新日時。
- **internal**: コード側の manifest(`modules/apps/○○/manifest.ts`。一覧は `modules/apps/manifests.ts`)を `npm run sync:manifests` で登録する。初回は `is_enabled = false`(誰にも見えない)。2 回目以降は `route` と権限だけを更新し、管理画面で決めた表示名・Audience・表示順などは上書きしない。manifest から消えたアプリは `is_enabled = false`・`in_manifest = false` にして警告する(削除しない)。
- **external**: 管理画面(`/admin/apps`)から登録する(sync の対象外)。サイドバーから別タブで開く。開くときは入口 `/apps/launch/<app_key>` を通り、SSO の契約があるアプリにはログインを引き継ぐ(28 章)。
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

2026-10-16 にユーザーと決めたこと: 初期パスワードは管理者が配布用ファイルで把握する。社員は**初回ログインで、自分のパスワードとメールアドレスを必ず登録**する。パスワードを忘れたら、**確認済みのメール**に届くリンクで、本人が再設定する。送り元は `no-reply@long-ishikawa.com`(当初は `e-long.co.jp` の予定だったが、その DNS は Cloudflare になく別の会社が管理しているため、2026-10-18 にポータルのドメインに変更。DNS は Cloudflare)、送信サービスは Resend(Vercel Marketplace の「longportal-mail」、地域は東京。Vercel に `RESEND_API_KEY` が自動で登録される)。Resend でメールを**受け取る**設定(ルートの MX)は入れない(会社のメールに影響しうるため)。管理者による再設定(社員の詳細画面)も残す。

- **`core.users`** に `email`(小文字で保存。空でない値は一意)と `email_verified_at` を追加する。ログイン用の連絡先なので、社員(人事)ではなくアカウントに持つ。
- **`core.auth_tokens`** … `id`、`user_id`、`purpose`(`email_verify` / `password_reset`)、`token_hash`(SHA-256。トークン本体は保存しない)、`email`(確認するアドレス)、`expires_at`、`used_at`、作成日時。トークンは 32 バイトの乱数。有効期間は、メール確認 24 時間、パスワード再設定 30 分。1 回使ったら無効。新しいものを発行したら、同じ目的の古いものは無効にする。
- **初回ログイン**(`must_change_password`): パスワードの変更と同時に、メールアドレスの登録を必須にする。保存すると確認メールを送る。確認が済むまでは、ポータルの上部に案内を出す(ポータルは使える)。
- **パスワードを忘れた**(`/forgot-password`、ログイン不要): ログイン ID を入れる。確認済みのメールがあるときだけ、再設定のリンクを送る。ID の有無・メールの有無にかかわらず、画面には同じ案内を出す(他人の ID を探られないように)。送るのは、同じアカウントに 1 時間 3 回まで。
- **再設定**(`/reset-password?token=…`、ログイン不要): 新しいパスワードを決める。成功したら、`must_change_password = false`、ログイン失敗の記録を消す。監査ログ `user.password_reset_self`。
- **メールの確認**(`/verify-email?token=…`、ログイン不要): トークンのアドレスが、今のアカウントのアドレスと同じときだけ確認済みにする。
- **メールの変更**: パスワード変更の画面で、今のパスワードを入れて変更する。変えると未確認に戻り、確認メールを送る。
- **送信**: `core/mail`(`sendMail`)。Resend をつなぐまで、開発環境では送る内容を開発サーバーのログに出す。本番で送信の設定がなければ、エラーを記録する(画面には同じ案内を出す)。リンクの先頭は `APP_URL`(本番 `https://long-ishikawa.com`)。

### 26.1 入力のしやすさ(2026-10-19 ユーザーの要望)

- **パスワード欄**(ログイン・変更・再設定・メール変更): 右の目のマークで、入力した文字の表示・非表示を切り替える(既定は非表示)。Caps Lock がオンのとき、全角の文字(かな・漢字を含む)や前後の空白が入っているときは、欄の下に注意を出す(`input-checks.ts`)。
- **新しいパスワード**: 条件(8 文字以上・現在と違う・確認の欄と同じ)を、入力しながら印で示す。
- **初回ログインの直後**: パスワードの変更で、初期パスワードをもう一度聞かない(ログインで確かめたばかりのため)。ログインから 15 分を過ぎた画面では、聞き直す(`canSkipCurrentPassword`。判定はサーバーで、DB の `last_login_at` から行う)。新しいパスワードが初期パスワードと同じなら止める。
- **まちがえたとき**: 入力を消さない(値は画面の側で持つ)。ログインの失敗では、どちらが違うかは言わず、見直すところ(ID は社員番号、大文字・小文字、初期パスワード)を箇条書きで出す。あと 3 回以内でロックされるときは、残りの回数を出す(存在しない ID も同じように数えるので、ID の有無は分からない)。ロック中は「パスワードを忘れた方」を案内する。
- **ログイン ID**: 全角の数字・英字と空白は、照合の前にそろえる(NFKC。「１００５」でも入れる)。
- **ブラウザのパスワード保存**(Chrome なら Google アカウントに保存され、ほかの端末でも使える): ID は `autocomplete="username"`、パスワードは `current-password` / `new-password`。パスワードを変える画面には、見えない username 欄(ログイン ID)を置き、保存済みのパスワードの更新が正しいアカウントに向くようにする。「Google でログイン」(Google アカウントそのものでのログイン)は、会社のメールが Google ではないため行わない。

## 27. 実装メモ(Audience: 社員を名指しで選ぶ)

2026-10-16 にユーザーの要望で追加: 部署や役職などの属性ではなく、**社員の一覧から選んで**対象にしたい(例: 「アプリ開発に携わる人だけ」)。

- 条件の種類に `employee`(表示名「社員」)を加える。`operator` は `in`、`value` は社員 ID の配列(1〜500 件)。社員本人に対して評価する社員条件(どれかに当てはまれば成立)。
- 社員 ID の一覧を保存することになるが、評価は他の条件と同じく毎回行うため、**退職・入社前など、いまアクセスできない社員は対象にならない**(7.2 の前段の除外)。
- ほかの条件と同じグループに入れると「かつ」になる。特定の人を足したいときは、「社員」だけのグループを別に作る(グループどうしは「または」)。
- 一覧の表示では、退職などでいまアクセスできない社員・存在しない社員を参照していると、「無効なマスタを参照」の警告を出す。
- 編集画面では、社員番号・氏名・フリガナ・主所属で絞り込める一覧から選ぶ(いまアクセスできる社員のみ。選択済みの対象外の社員は印を付けて残す)。
- DB: `audience_conditions_attribute_check` に `employee` を加える(migration 0013)。`audience_members`(個人の追加・除外)は引き続き使わない。

## 28. 実装メモ(別プロジェクトのアプリへのログインの受け渡し: SSO)

2026-10-17 にユーザーと決めたこと: AI教室は**別のアプリ**(リポジトリ `ai-kyoshitsu`・別の Vercel プロジェクト)として作り、LONG PORTAL にログインした人が、サイドバーから開けるようにする。ログインは**ポータルが発行する短時間の通行証**で引き継ぐ。DB は同じ Neon に専用のスキーマ `aikyoshitsu`、資料は専用の R2 バケット。`docs/plans/step6-plan-draft.md` の手順 4 の最初の実装。

- **入口** `/apps/launch/<app_key>`(`src/app/(portal)/apps/launch/[appKey]/route.ts`、本体は `core/sso` の `resolveLaunchUrl`): ログインを確かめ(初回のパスワード変更が済んでいなければ変更画面へ)、`listAppsForActor` で使えるアプリかを確かめる(使えなければ 404)。サイドバー・ホームの external のアプリは、すべてこの入口を通す。internal のアプリはそのページへ移すだけ。そのため `launch` は app_key に使わない。
- **SSO の契約**(コード側。`modules/apps/external-apps.ts` の `EXTERNAL_APP_CONTRACTS`): `app_key`・署名の鍵を入れる環境変数の名前・そのアプリの権限。契約のない external のアプリは、登録された URL をそのまま開く(いままでどおり)。
- **通行証**: 本文の JSON `{ v: 1, typ: "pass", app, sub(core.users の ID), name(社員の氏名), perms, iat, exp, jti }` を base64url にし、HMAC-SHA256 で署名した `<本文>.<署名>`。有効期間は 60 秒。`perms` は、契約にある権限のうち、本人がどこかのスコープで持っているもの(`canInAnyScope`)。`<アプリの URL>/sso?token=<通行証>` へ 303 で移す(`Cache-Control: no-store`・`Referrer-Policy: no-referrer`)。
- **アプリ側の責任**: 署名・宛先(`app`)・期限を確かめ、`jti` を記録して 2 回目を拒否し、自分のログイン状態(AI教室は 8 時間の cookie)を作る。切れたら、ポータルの入口から開き直す。
- **鍵**: アプリごとに別の鍵(AI教室は `SSO_SECRET_AIKYOSHITSU`)。ポータルの Vercel とアプリの Vercel に同じ値を置く(Sensitive)。
- **権限**: 契約の権限は `npm run sync:manifests` で `core.permissions` に登録され(`app_key` 付き)、ほかの権限と同じくロールで渡す。AI教室の `aikyoshitsu.materials.manage` = 回と資料の登録・変更・削除(講師に渡す)。
- 退職などでポータルにログインできなくなった人は、新しい通行証を受け取れない。発行済みのアプリのログイン状態は、その期限(AI教室は 8 時間)まで残る。
- **ポータルの中に表示する(2026-10-17 追加)**: ユーザーの希望は「作り方は別プロジェクトのまま、見え方はポータルの中のアプリの 1 つ(「育てて、育つ。」と同じ)」。別ウィンドウにしない。
  - external のアプリは、サイドバー・ホームから**同じタブで** `/apps/<app_key>`(`src/app/(portal)/apps/[appKey]/page.tsx`、本体は `core/sso` の `resolveExternalAppPage`)を開く。internal のアプリはそれぞれの静的なルートが優先される。
  - 契約に `embedPath`(AI教室は `/aikyoshitsu`)があるアプリは、ポータルの画面(ヘッダー・サイドバー)の中に iframe で埋め込む。iframe の中身は `/apps/launch/<app_key>` → `<embedPath>/sso?token=…`(相対の住所)。`embedPath` がないアプリは、入口へ移動する(ポータルの外へ出る)。
  - `embedPath` への要求は、ポータルが Next.js の multi-zones の rewrites でアプリへ転送する(`next.config.ts` の `ZONES`。転送先は `AIKYOSHITSU_ORIGIN`、未設定なら `https://ai-kyoshitsu.vercel.app`)。利用者から見た住所はポータルのまま(同じサイト)なので、アプリのログイン状態の cookie は第三者 cookie にならない。アプリ側は `basePath` を `embedPath` と同じにし、ポータル経由の Server Action のために `serverActions.allowedOrigins` にポータルの住所を入れる。
  - 埋め込みの許可: ポータルの画面は今までどおり `X-Frame-Options: DENY`。`embedPath` の住所だけはポータルのヘッダーを付けず、アプリが `X-Frame-Options: SAMEORIGIN` と `frame-ancestors 'self'` を返す。`proxy.ts` の matcher から `embedPath` を外す(ログインの確認はアプリ側)。
  - 全画面: iframe に `allow="fullscreen"`。アプリは埋め込まれているとき(`window.self !== window.top`)、自分の上のバーを出さない。


## 29. 実装メモ(配達ルート: Google スプレッドシートの Apps Script からの移植)

2026-10-17 にユーザーと決めたこと: Google スプレッドシート「取引先一覧表」に紐づく Apps Script「配達ルート作成ツール(株式会社ロング)v5」を、**ポータルの中のアプリ** `apps/haisou`(`/apps/haisou`)に移す。データはポータルの DB に移し、以後はポータルで見て編集する。**使い勝手は元のツールからほとんど変えない**。**元のスプレッドシートとスクリプトは消さない・書き換えない**(読むだけ)。

- **画面**: 元の HTML(`dialog.html`・`clients.html`)を、ほぼそのまま `ui/dialog.ts`・`ui/clients.ts` の文字列として持ち、Route Handler(`pages.ts` の `renderHaisouPage`)で返す。React に書き直さない(同じ動きを保つため)。`<script>` の前に `ui/shim.ts` を差し込み、`google.script.run.○○(...)` を `POST /apps/haisou/api { fn, args }` に置き換える。ポータルの外枠(サイドバー)は付かない(元と同じ全画面)。
  - 元はシートを直接見ていた「配達ルート履歴」は、新しい画面 `/apps/haisou/history`(月ごと・配達者で絞り込み・便ごとにまとめる・実時間の入力・便の削除)にした。
  - 「配達者リスト」の編集は、取引先の管理の「配達者の管理」から行う。
- **サーバー側**(`service.ts`): 元の `コード.gs` の関数を同じ名前・同じ戻り値の形で移した。入口は `rpc.ts` の `handleRpc`: 同じサイトからの呼び出しか(`Origin` または `Sec-Fetch-Site`)→ `requireAppAccess("haisou")` → 引数の形(zod)→ 処理。想定外のエラーの中身は画面に出さない。
- **計算**(`schedule.ts`、純粋関数、`schedule.test.ts`): 本社(株式会社ロング 石川県金沢市東蚊爪町1丁目34-3)発着、休憩 12:00-12:45・15:00-15:15・17:30-17:40 にかかったら休憩の終わりまで進める、既定の滞在 10 分、地図のリンクは経由地 9 件ごとに分ける。いずれも元と同じ。
- **待ち時間**(2026-10-17 追加。元のツールにはない): 結果画面の各配達先に「待ち」の欄(なし・5〜120 分・その他)を置く。前のトラックがいて受け入れを待ったときなどに入れると、到着のあと待ち・滞在の順に時刻を進め、それ以降の到着・出発・帰着をずらす。付け直しは `reschedule`(`rescheduleTimes`)で、順番と移動時間はそのまま使い、地図サービスは呼ばない。待ちは配達先のデータ(`wait`、分)として、並べ替え・再計算・ルート表の保存でも引き継ぐ。配達履歴には、待ちを足した到着・出発の時刻が残る(待ちの分数だけの列はまだない)。
- **1日の全トラックを並べて見る**(2026-10-17 追加): カレンダーで日を選び「この日の全員を並べて見る」を押すと、その日の保存ルート表をすべて(配達者の並び順)横に並べる。上に配達者ごとの AM・PM の出発 → 帰着と待ちの合計の一覧、各列に「このルート表を開く」。2 つを選ぶ比較と同じ画面(`showCompareMany`)を使う。横に並んだ列どうしは、AM便・PM便の高さをそろえ、同じ便が横一列に読めるようにする(`alignCompareShifts`。画面が狭く折り返した列とはそろえない。配達先がない便も空の枠を出す)。この画面では、配達先をドラッグして別の便・別の配達者の表へ落とすと移せる(スマホなどドラッグできない画面は各行の「↪」から番号で選ぶ)。移すときは、保存されている最新の内容を読み直して、移す配達先が変わっていないことを確かめてから、移した先の最後に入れ、両方の便を順番どおり(最適化なし)で計算し直し、両方のルート表を保存する(`dayMoveStop`)。データは保存されたルート表なので、待ちを入れたら「ルート表を保存」すると他の人の画面にも出る。
- **地図**(`maps.ts`): 元の `Maps.Geocoder` / `DirectionFinder` の代わりに、Google Maps Platform の Geocoding API(住所の前に「日本 石川県周辺 」を付ける)と Routes API(`computeRoutes`、経由地の最適化・高速道路を避ける)を使う。鍵は `GOOGLE_MAPS_API_KEY`(Vercel では Sensitive)。鍵がない・失敗したときは、元と同じく 1 区間 15 分の概算で計算し、理由を画面に出す。住所 → 座標は `haisou.geocode_cache` に 30 日控える(元は 6 時間)。
- **配達者へのメール**: ポータルにはまだメール送信の仕組みがない(26 章)ので、当面は利用者のメールソフトを開き(`mailto:`)、ルート表とマップのリンクを本文に入れる。AM・PM は 1 通にまとめる。`core/mail` ができたら、元と同じくサーバーから送る形に戻す。
- **DB**(スキーマ `haisou`、migration `0014_haisou_app`): `clients`(取引先。`row_no` は元のシートの行番号を引き継ぐ画面の「No.」で、保存ルートの照合にも使う。新規は最大値 + 1。削除は `deleted_at` を入れるだけ)、`drivers`、`history`(1 訪問 1 行。`batch_id` が 1 回の保存。日付の文字列 `date_label` と、絞り込み用の `delivery_date`)、`saved_routes`(名前つきの保存。同名は上書き。元の 50 件の上限はなくした)、`company_defaults`(会社ごとの前回の入力。**本人ごと**、`user_id`)、`geocode_cache`。前回の入力以外は会社で共有するデータで、アプリを使える人は全員が見て編集できる(元のスプレッドシートと同じ)。専用の権限はない。
- **元データの取り込み**: `npm run db:import-haisou -- <フォルダ> --actor <ログインID> [--replace] [--apply]`(`scripts/import-haisou.ts`、読み取りは `import.ts`)。各シートを CSV に書き出したもの(`clients.csv`・`drivers.csv`・`history.csv`・`saved-routes.csv`)を読む。既定は確認だけ。取り込み先にデータがあれば止まり、`--replace` で入れ直す。CSV は取引先の情報なので、リポジトリの中に置かない。**元のツールは今も毎日使われているため、本番への取り込みは、ポータルへ切り替える直前に行う**(それまでの分は、取り込み直せば反映される)。
- **元のシートとの同期**(2026-10-21 追加): ユーザーの判断で、元のツールとポータルの両方を使い続け、**元の Google スプレッドシートを正**にする(「元を変えてすぐ同期されないのはだめ」)。ポータルは取引先一覧・配達者リスト・配達ルート履歴・保存ルートを、Google Sheets API で**直接読み書き**し(`sheets-api.ts`・`sheet-store.ts`)、DB の同じ表は使わない(消さずに残す)。書き方は元の `コード.gs` と同じ(取引先の追加は A 列の最後の次の行、削除は行ごと、保存ルートは同名を上書き・50 件を超えたら上から消す、保存データは 45,000 文字まで、履歴は 1 訪問 1 行の追記)。値は人の入力と同じ扱い(`USER_ENTERED`)で書き、文字の欄は先頭に `'` を付けて、先頭の 0 や `=` が化けないようにする。配達者リストの C 列より右(元のツールの LINE WORKS の設定)には触らない(並べ替えは行の中身ごと入れ替える)。他の人の操作で行がずれることがあるので、画面に渡す行の ID は「行番号 + 中身のハッシュ」(`r12.ab12cd34`、履歴の便は `b12-15.…`)にし、書く前に読み直して中身が同じか確かめる(違えば「読み込み直してください」)。前回の入力(本人ごと)と住所の位置の控えは、今までどおり DB。入るのはポータル専用の Google Cloud のサービスアカウントで、シートをそのメールアドレスに「編集者」で共有する。環境変数 `HAISOU_SHEET_ID`・`HAISOU_SHEETS_CREDENTIALS`(Sensitive)の両方があるときだけシートを使い、無ければ DB(開発用)。元のスクリプトには触れない。待ち時間は保存ルートのデータの中に入るので、元のツールで開いて保存し直すと消える。

## 30. 実装メモ(ロングの教科書)

2026-10-17 にユーザーと決めたこと: 部署ごとの「ロングの教科書」を、**1 つのポータルの中のアプリ** `apps/kyokasho`(`/apps/kyokasho`)に並べる。**正本は Google ドキュメント**のまま(教科書作成チームが共同編集し、週 1 回の定例で直す)で、ポータルには取り込んで載せる。見られる人は、教科書ごとに後から変えられるようにする。最初に載せるのは、ブレーキ部(初級編・スタッド・メタルエステ)と全部署共通。

- **中身はリポジトリに入れない**: リポジトリは公開されており、教科書には社内のやり方・担当者名・写真が入るため。中身は DB(`kyokasho.books.content`、JSON)、画像は R2(非公開)に置く。
- **取り込み**(`scripts/import-kyokasho.ts`、本体は `import.ts`・`quiz.ts`): Google ドキュメントを「ファイル → ダウンロード → Microsoft Word(.docx)」で保存したファイルを読む(Drive の書き出しは 10MB を超えると使えず、文字だけの書き出しでは画像が抜けるため)。mammoth で HTML にし、見出し 1 = 章、見出し 2・3 = 節、段落・箇条書き・表(セルの中の画像も)・画像の部品にする。目次(文書の中へのリンクの段落)と、それより前の表紙は捨てる。中身のない章は載せない。
  - 「理解度チェックテスト」の見出しの下の、問題の表(①〜 と、問題文 + A. B. C. の選択肢)と解答の表(①〜 と、正解の記号 + 解説)を、テストの部品にする。読み取れないときは表のまま載せ、注意を出す。
  - 画像は png / jpeg / gif / webp / svg だけ(図形描画など、ほかの形式は飛ばして注意を出す)。同じ画像は 1 つだけ保存する。写真は sharp で長い辺 1600px までに縮めて WebP にする(元より小さくなるときだけ。【スタッド】は 34MB → 1.5MB)。1px 四方などの飾りの画像は載せない。キーは `<環境>/kyokasho/<book_id>/<UUID>.<拡張子>`(`core/storage` の `putObject`)。
  - 実行: `npm run db:import-kyokasho -- <ファイル.docx> --slug <URL の名前> --actor <ログインID> [--department <まとまり>] [--title <題名>] [--source-url <URL>] [--sort <並び順>] [--preview <JSON>] [--apply]`。既定は確認だけ(章ごとの節・画像・テストの数を表示)。新しい教科書は非公開・見られる人「全員」で作る。同じ slug があれば、中身と画像だけを入れ替え(公開・見られる人などの設定は残す)、古い画像は R2 から消す。
- **DB**(スキーマ `kyokasho`、migration `0015_kyokasho_app`): `books`(slug(一意。`images`・`manage`・`new` は使えない)・まとまり(部署名)・題名・説明・並び順・`target`(`company` / `audience`)・`audience_id`(`core.audiences` への外部キー、削除は restrict)・公開・元のドキュメントの URL・中身・取り込みの日時と実行者)、`images`(id・book_id(CASCADE)・R2 のキー・種類・大きさ)。
- **見られる人**(`logic.ts` の `canViewBook`、deny by default): アプリに入れる人(`requireAppAccess("kyokasho")`)のうち、公開済みで、`company` か、当てはまる Audience の教科書。権限 `kyokasho.books.manage`(全社)を持つ人は、非公開・対象外も確認のために見られる。
- **画面**: 一覧(まとまりごと)→ 目次(章と節、テストの問題数)→ 章(この章の内容・本文・前後の章)。テストはその場で答え合わせし、解説を出す。**前回の点数は端末のブラウザにだけ保存**(キーにユーザー ID を含める。サーバーに結果を保存して進み具合を見るのは、次の段階)。
- **図形描画の図**(2026-10-17): Google ドキュメントの図形描画は、Word に書き出すと 1×1 の空の画像になる。そうした教科書は「ウェブページ(.html、zip 圧縮)」で書き出した .zip を取り込む(`importGoogleZip`。図も画像として入る。書式は style 属性から太字だけ拾い、Google の転送 URL を元に戻し、コメントは除く)。ただし写真は文書上の表示の大きさに縮まるので、図形描画のない教科書は Word のままにする。
- **本文の読みやすさ**(2026-10-17): 本文は濃紺ではなく `--ink`(#222)、1 行はスマホで 40 字ほどまで(PC では区切らず画面の幅いっぱい。章のページは max-w-6xl)、行間 1.9。日本語は BudouX(`budoux`)で文節に区切って `<wbr>` を入れ、`word-break: keep-all` で語の途中では折り返さない(iPhone の Safari が `word-break: auto-phrase` に対応していないため)。Google ドキュメント由来の崩れ(見えない文字、`**` の囲み、位置合わせの全角スペース)は、取り込み直さなくて済むよう表示のときに整える(`typeset.ts`)。
- **スマホでの並べ方**(2026-10-17、`layout.ts`): 元の文書は紙の幅に合わせて作られているので、表示のときに並べ方を変える。セル 1 つの表は囲み、見出しの行がある表(縦の結合なし)はスマホでは 1 行ずつのカード(題 = 1 列目、項目名 = 見出しの行)にし、`sm` 以上では表のまま。縦の結合がある表は横に動かせる表。セルの中の、狭いマスに収めるために手で入れた改行と字下げはつなぐ(`typeset.ts` の `isSoftBreak`。文の終わり・項目の始まり・「寸法線/引出線」のような語の並びは分けたまま)。本文の、文の途中で切れた行(12 字以上で「。」などで終わらない)は次の行とつなぐ。続く写真は同じ大きさの枠にそろえて並べ(押すと元の大きさ)、カードの題の中の絵は右に小さく置く。本文の書体は、Zen Kaku Gothic New ではかなの字間が広く見えるため、端末の和文書体(`--font-prose`。ヒラギノ角ゴ・BIZ UDPゴシックなど)にする(見出しは Zen Kaku のまま)。テストの結果を保存する名前は、元の並びの番号で作る(つないだ行で番号がずれないように)。
- **画像の表示**: ページには固定の住所 `/apps/kyokasho/images/<id>` を書き、表示のたびに、その教科書を見られる人だけを R2 の署名付き URL(`createViewUrl`、5 分)へ転送する。
- **管理**(`/apps/kyokasho/manage`、`kyokasho.books.manage`): 教科書ごとに、まとまり・題名・説明・並び順・元の URL・見られる人(全員 / Audience)・公開を変える。監査ログ `kyokasho.book.update`(取り込みは `kyokasho.book.import` / `kyokasho.book.reimport`)。
- **Audience の削除**: core はアプリの中を知らないので、教科書が使っている Audience は、外部キーで削除が止まる。`deleteAudienceAction` はこれを「業務アプリで利用中」と表示する。
- **元のドキュメントとの自動の同期**(2026-10-20、ユーザーの要望「ドキュメントと同期される?」): 元の URL(`source_url`)が Google ドキュメントの教科書は、**毎朝 3 時ごろ**(Vercel Cron、`vercel.json` の `crons` → `/api/cron/kyokasho-sync`、`cron.ts`)に元のドキュメントを読み、変わっていれば取り込み直す(`sync.ts`)。管理画面の「今すぐ取り込む」でも同じことをする(`sync-actions.ts`、`kyokasho.books.manage`)。DB の変更はなし。
  - **読み方**: 教科書のドキュメントは「リンクを知っている全員」に共有されているので、ログインなしの書き出しの URL(`/export?format=docx|zip`)から読む(サービスアカウントなどは使わない)。共有をやめると読めなくなり、管理画面にそう出る。
  - **図形描画**: Word で書き出すと図形描画は空の画像になるので、空の画像があればウェブページ(zip)も書き出し、同じ順番の画像で埋める(`docx+zip`。写真は Word の元の大きさのまま)。画像の数と、写真の縦横の比で並びを照らし合わせ(`imagesAlign`)、合わなければ zip だけで読む。
  - **変わったかの見分け**: 取り込んだファイルの sha256 と、元の画像の sha256 → 画像の ID の対応を、中身の `source` に持つ(`content.ts` の `BookSource`)。ファイルが同じなら何もしない。中身が同じなら記録だけ更新する(取り込み日時・監査ログは変えない)。前回と同じ画像は、縮め直さず・R2 に保存し直さずに使い回し、使わなくなった画像だけを消す(`store.ts`。コマンドの取り込みも同じ)。
  - **ツッコミ**: 取り込み直しで章や見出しの並びが変わっても、ツッコミが同じ題名の章・節を指すよう、同じトランザクションで付け直す(`remap.ts`。同じ題名がなければ、節は章全体へのツッコミにし、章はそのまま)。
  - **入口の守り**: `/api/cron` は proxy のログイン確認から外し、`Authorization: Bearer <CRON_SECRET>` が合うときだけ動かす(`CRON_SECRET` がなければ動かない)。自動の取り込みの監査ログは、実行者なし・`trigger: "auto"`(監査ログの画面では「(自動)」)。
  - 時間の上限は 300 秒(route と管理画面の `maxDuration`)。定時の同期は 240 秒を過ぎたら、残りの教科書を次の日に回す。新しい教科書の追加は、今までどおりコマンドで行う。

## 31. 実装メモ(人事管理アプリ: 面談・注意・ほめの記録)

2026-10-16 にユーザーと決めたこと: Google スプレッドシートの「人事管理シート」をアプリにする。最初に、社員ごとの**記録**(どんな話をしたか・どんな注意・どんなほめをもらったか)を作る。シートのその他の項目は、シートの内容を確認してから足す。

- **アプリ**: `modules/apps/hr`、`app_key = hr`、`/apps/hr`(一覧)・`/apps/hr/<社員 ID>`(社員のページ)。入口は `requireAppAccess("hr")`。社員本人が自分のページを見るため、本番ではアプリ管理で有効にし、宛先を「全社」にする。
- **権限** `hr.records.manage`(manifest で定義。sync で `system_admin` に自動付与): 社員のページの閲覧と、記録の追加・編集・削除(上司が部下について持つ権限は 31.4)。人事担当・部門長などには、ロールに付けて割り当てる。
  - スコープ: 全社の割当 = 全社員。拠点・部署つきの割当 = **対象の社員の、今日有効な所属**のどれかがスコープに当てはまる社員。記録は人に付くもので、異動後も新しい上司が過去の記録を見られる必要があるため、6 章の「データ自身に `location_id` / `department_id` を持つ」の例外とし、記録の行には持たせない。
- **社員本人**: 自分のページと、上司として指定された部下のページ(31.4)だけを見られる(他の社員のページは 404)。見えるのは「本人に公開」の記録だけ。本人は記録を書けない。権限を持つ人でも、**自分のページは本人と同じ見え方**(管理者だけのメモは見えず、自分については書けない)。
- **テーブル** `hr.records`(`pgSchema("hr")`): `id`、`employee_id`(FK → `core.employees`、RESTRICT。社員は物理削除しない)、`kind`(`talk` 面談・話したこと / `caution` 注意 / `praise` ほめ)、`occurred_on`(JST の暦日)、`title`(100 字)、`body`(5000 字)、`visibility`(`employee` 本人に公開 / `managers` 管理者だけのメモ。初期値は `employee`)、`author_user_id`(FK → `core.users`、SET NULL)、作成・更新日時。kind・visibility は CHECK 制約。
- **画面**: 一覧は権限を持つ人だけ(スコープ内の社員、氏名・社員番号で絞り込み、記録の件数と最新の日付)。権限のない人が `/apps/hr` を開くと、自分のページを出す。社員のページは、社員の基本情報(社員番号・氏名・所属・役職・入社日)と、記録を新しい順に、種類で絞り込んで表示する。
- **監査ログ**: `hr.record.create` / `hr.record.update` / `hr.record.delete`。記録の本文は監査ログに入れない(種類・日付・公開範囲・社員 ID だけ)。

### 31.1 人事管理シートの項目(2026-10-16 追加)

元のスプレッドシート(社員 1 人 1 シート)の構成に合わせて、社員のページを 5 つの章と記録に分ける。2026-10-16 時点でシートに入っていたのは基本情報だけ(社員マスタと同じ内容)なので、データの移し替えはしない。

- **本人に見せる範囲**: 1〜3 章と「本人に公開」の記録。4 章(人柄・適性)・5 章(コンディション)は管理する人だけ(`labels.ts` の `SECTION_VISIBLE_TO_SELF`)。本人は書けない。
- **1. 基本情報**: 社員番号・氏名・フリガナ・所属(部署・拠点 = 勤務地)・役職・雇用区分・入社日は core の社員マスタを表示する(ここでは編集しない)。足すのは `birth_date`・`gender`(`male` / `female` / `other`)・`remote_ratio`(在宅勤務比率 0〜100%)。年齢と勤続年数は JST の今日から計算する。
- **2. 目標管理・評価**: 今期の目標、中間評価、最終評価、過去 3〜5 年の評価履歴、360 度評価の概要、キャリアの希望(各 2000 字)。
- **3. スキル・資格・経験**: 職務経歴・前職の経歴(各 2000 字)。一覧として、資格・免許(名称・取得日・有効期限)、スキル(名称・評価 1〜5)、研修の履歴(社内 / 社外・内容・受講日)。
- **4. 人柄・適性**: 強み・弱み、人柄・コミュニケーション、モチベーションの源泉、上司のコメント(各 2000 字)。
- **5. コンディション**: 月平均残業時間、有給休暇(付与日数・取得日数・基準日。残日数と消化率は計算)。健康状態・メンタル面(良好 / 変わらない / 不良)・満足度(5 段階)は、確認した日ごとに `hr.condition_checks` に積み、直近 2 回を「前回 / 今回 / 変化」で並べる。
- **記録の種類**に `transfer`(異動の理由)を加える(シートの「異動時の理由」)。シートの「指導した内容」は注意、「プラス評価」はほめ、「ワンonワン面談」は面談に当たる。
- **テーブル**: `hr.profiles`(`employee_id` が主キー兼 FK。1〜5 章の文章・数値)、`hr.qualifications`・`hr.skills`・`hr.trainings`・`hr.condition_checks`(いずれも `employee_id` FK、主キーは UUID)。
- **監査ログ**: `hr.profile.update`(変えた項目名だけ。値は残さない)、`hr.item.create` / `hr.item.delete`(一覧の行・コンディション)。
- シートの「評価シート」(自己評価・フィードバックの様式)は、別の機能としてあとで検討する。

### 31.2 画面の形と、能力の 5 項目(2026-10-17 追加)

ユーザーの感想「全体的に見にくい」「5 角形のグラフで何が得意かわかるとよい」を受けて、社員のページを次の形にする。

- **まとめ**(ページのいちばん上、どのタブでも出す): 名札(氏名・フリガナ・社員番号・所属・役職・年齢・勤続年数)、能力のレーダーチャート、直近の記録 3 件、管理する人には最新のコンディション(5 章)も。
- **タブ**(`?tab=`): 記録(既定)・基本情報・目標と評価・スキルと資格・人柄と適性・コンディション。本人の見え方では 4・5 章のタブを出さない。記録の種類の絞り込み(`?kind=`)は記録のタブの中。
- **未記入の項目**は 1 行の「未記入: ○○、○○」にまとめ、書かれた項目だけを並べる。
- **書く欄**は、「編集」「＋ 記録を追加」を押したときだけ開く。
- **能力の 5 項目**: 全社共通の軸で 1〜5 を付け、レーダーチャートにする(人どうしを同じ物差しで比べるため)。軸は `labels.ts` の `ABILITY_AXES`(key と表示名。仮の案: 技術力・品質・安全・段取り・協調性)。表示名はコードで変えられ、key は DB に保存するので変えない。3 章(スキル・資格・経験)の一部として扱い、本人にも見せる。
  - テーブル `hr.abilities`: `id`(UUID)、`employee_id`(FK → `core.employees`、RESTRICT)、`axis`(key。軸を足せるよう CHECK 制約は付けず、Server Action の zod で検証)、`level`(1〜5、CHECK)、`updated_by`、作成・更新日時。`(employee_id, axis)` は一意。
  - 保存は 5 項目をまとめて行い、空欄の項目は行を消す。監査ログ `hr.ability.update`(変えた軸の key だけ)。
  - グラフは、5 項目のどれかが付いていれば描く(付いていない軸は 0)。1 つも付いていなければ、「3 章の能力の評価で付けると、ここに表示されます」と出す。

### 31.3 記録の入力の補助: 音声入力と「AIで整える」(2026-10-17 追加)

ユーザーの要望「音声で入力したい」「打った文章を AI で構成するボタンがほしい」を受けて、記録の「内容」の欄に 2 つのボタンを付ける。どちらも、入力欄に文字を入れるだけで、保存は人が「記録を追加」「保存」を押したときだけ。

- **音声入力**(マイクのボタン): ブラウザの音声認識(Web Speech API、`ja-JP`)で、話した言葉を内容の末尾に足す。使えるのは Chrome と Edge(使えないブラウザではボタンを出さない)。Chrome・Edge は音声をそれぞれ Google・Microsoft の認識サービスに送る。マイクを使うため、`Permissions-Policy` を `microphone=(self)` に変える(他のサイトの埋め込みには許さない)。
- **AIで整える**: 内容の文章を Claude Haiku 5.5(`claude-haiku-5-5`)に送り、誤字・話し言葉を直し、記録の種類に合った見出し(例: 面談なら【状況】【本人の話】【伝えたこと】【次にやること】)で整えた案を返す。案は入力欄の下に出し、「この案を使う」を押したときだけ入力欄を置き換える(「元に戻す」で戻せる)。
  - 書かれていない事実は足さない。当てはまる内容がない見出しは出さない。です・ます調。
  - 1 行目に「ひとことで: 」の要点 1 文(40 文字程度)。「次にやること」の各項目には「(期限: ○○・担当: ○○)」を付け、書かれていなければ「未定」とする(ユーザーの要望、2026-10-17。一覧で見返しやすく、決め忘れに気づけるように)。
  - 送る前に、対象の社員の氏名(漢字・かな。姓だけ・名だけを含む。2 文字以上のもの)を「本人」に置き換える(`maskName`)。送るのはその欄の文章と記録の種類だけで、社員番号などは送らない。ほかの人の名前は機械では見分けられないため、そのまま送られる。
  - Server Action `polishRecordBodyAction` は、`managerFor`(対象の社員を管理できる人だけ)で判定する。DB は変えないので、監査ログは残さない。10〜5000 文字。API キーが無い・失敗・断られた場合は、その旨を出して入力欄は変えない。

### 31.4 上司と部下: 上司が部下のページを見る(2026-10-21 追加)

ユーザーの要望「リーダーやサブリーダーなど、組織の上下で『この人はこの人を見られるが、誰々は見られない』としたい」。役職の序列で自動に決める案・部署単位のままの案と比べ、**社員ごとに上司を 1 人指定する**案をユーザーが選んだ(部署をまたぐ関係も正確に表せるため)。

- **上司の指定**: `hr.profiles.supervisor_employee_id`(FK → `core.employees`、RESTRICT。NULL = 上司なし)。1 人につき直属の上司は 1 人。1 章(基本情報)の「編集」で、管理する人(`hr.records.manage` のスコープ内)が選ぶ。自分自身や、自分の部下(下にたどれる人)は選べない(輪にしない。DB の CHECK で自分自身を禁止し、輪は Server Action で調べる)。
- **見られる範囲**: 上司は、**直属の部下と、その下にたどれる部下全員**(例: リーダー → サブリーダー → 一般社員なら、リーダーは 2 人とも、サブリーダーは一般社員だけ)。上の人・横の人・ほかの系列の人は見られない。役職(`core.positions`)では決めない(「役職だけで権限を自動付与しない」を守る。上司の指定は、管理する人が明示的に行う割当として扱う)。
- **見え方** `supervisor`: まとめ・1〜3 章は本人と同じ範囲で、読むだけ。4・5 章は見えない。記録は「本人に公開」と「上司まで」が見える(本人の見え方では「本人に公開」と「本人と管理者だけ」)。`hr.records.manage` で管理できる相手なら、これまでどおり管理の見え方が優先する。自分のページは常に本人の見え方。
- **上司が書く記録**(2026-10-21、ユーザーの要望「1on1 をリーダーやサブリーダーにもしてもらい、内容をメモとして載せたい」): 上司は部下の記録(面談・注意・ほめ・異動)を追加でき、公開範囲は「本人に公開」か「上司まで」から選ぶ。直せる・消せるのは自分が書いた記録だけ。「AIで整える」も使える(氏名を伏せるのは 31.3 と同じ)。
- **記録の公開範囲は 4 つ**(同じ日、ユーザーの要望「リーダー・サブリーダーにも言えない、長井さん・社長にしか言えない内容は、上司にも見えないようにしたい」「長井さんとの 1on1 は、本人には見えるが上司には見えないようにしたい」)。管理する人(`hr.records.manage` で管理できる人)には、どれも見える。
  - `employee` 本人に公開: 本人・上司に見せる。
  - `supervisors` 上司まで: 上司に見せ、本人には見せない。
  - `personal` 本人と管理者だけ: 本人に見せ、上司には見せない(長井さん・社長との 1on1 など)。
  - `managers` 管理者だけ: 本人にも上司にも見せない。これまでの「管理者だけのメモ」は、そのままこれになる。
  - 上司が選べるのは `employee` と `supervisors` だけ(ほかを選ぶと、書いた上司自身も読めなくなるため)。
- **全部を見られる人**: 長井さんと社長。社長には `hr.records.manage` を全社で割り当てる(2026-10-21 のユーザーの判断。長井さんと同じく、全員を見て書ける)。専務・常務から下は、上司の指定で縦にだけ見る。
- **一覧**: `hr.records.manage` を持たなくても、部下がいる人には `/apps/hr` で一覧(自分と部下)を出す。記録の件数・最新の日付は、見る人に見える記録だけで数える(自分の行は「本人に公開」だけ)。部下がいなければ、これまでどおり自分のページを出す。
- **表示**: 1 章に「上司」と「直属の部下」を出す(本人にも見せる)。
- **退職**: 上司・部下が退職しても指定は消さない(退職した上司はログインできないので見られない)。一覧では、これまでどおり退職者は「退職した社員も出す」のときだけ。
- **監査ログ**: `hr.profile.update` の `after` に、変えた項目名に加えて `supervisorEmployeeId`(社員 ID)を残す。
- migration `0022_hr_supervisor`(上司の列・FK・索引・CHECK の追加と、`hr.records` の visibility の CHECK に `supervisors`・`personal` を足す。既存の行は変えない)。

## 32. 実装メモ(ロングの教科書: ツッコミ)

2026-10-17 のユーザーの要望: 教科書を読んだ人が、疑問・付け足し・まちがいを「ツッコミ」として書け、教科書チームがそれを見て採用でき、誰が言ったかがわかり、お礼ができるようにする。

- **正本は Google ドキュメントのまま**: 採用しても、ポータルの中身は直接書き換えない。教科書チームが元の文書を直し、取り込み直して「教科書に反映済み」にする(30 章の流れを崩さない)。
- **DB**(migration `0018_kyokasho_comments`): `kyokasho.comments`(教科書(CASCADE)・章の番号・章と節の題名の写し・引用・節の見出しの id・種類・本文(1〜1000 字)・書いた人・受け止め方・返事・返事をした人と日時)、`kyokasho.comment_thanks`(ツッコミ × ありがとうを送った人。1 人 1 回)。章は番号で指すので、取り込み直しで章がずれても読めるよう、題名は書いた時点の写しを持つ。節の題名はサーバーで教科書の中身から写す(送られた値は使わない)。
- **種類**: はてな(疑問)・付け足し・改善・まちがい・ひとこと。**受け止め方**: 返事待ち(open)→ 採用(直します)(adopted)→ 教科書に反映済み(reflected)、または 今回はこのまま(kept。返事で答える)。採用の数は adopted と reflected を数える。
- **見え方**: ツッコミは**名前つき**で、その教科書を見られる人全員に見える(誰が言ったかがわかり、同じ疑問の人の役にも立つため)。章のページの各見出し(見出し 2・3)の横に「ツッコむ」(その節のツッコミの数つき)、章の終わりに「この章へのツッコミ」(書く欄と一覧)。目次には章ごとのツッコミの数。一覧のページに「あなたのツッコミ」(最新 5 件と、返事)と「教科書をよくしてくれた人」(採用の数 → ツッコミの数の順。見られる教科書のツッコミだけで数える)。
- **手軽に書ける工夫**(2026-10-17、ユーザーの要望): 章のページの右下に、いつも「ツッコむ」を出す(押すと、画面の上の方に見えている節を選んだ状態で書く欄へ移る。書く欄が見えている間は隠す)。本文の文を指でなぞって選ぶと「選んだ文にツッコむ」に変わり、その文を引用(`quote`、300 字まで)して書き始められる。書く欄には音声入力(`core/shared/ui/dictation.tsx`。人事管理の記録と共通)。音声入力や走り書きは「AIで整える」で、伝わる文にした案を出す(`polish.ts`、Claude Haiku 5.5。送るのは種類・節の題名・引用・下書きだけで名前は送らない。案は「この案を使う」を押したときだけ入力欄に入り、「元に戻す」で戻せる。保存はしない)。
- **書く欄は横に出す**(2026-10-20、ユーザーの要望「書こうとすると一番下まで下がって、何にツッコむのかわからなくなる」): ツッコむボタンを押しても、ページは動かさない。書く欄は PC では画面の右(幅 400px。本文に重なる分だけ本文の右に余白を足し、ツッコむところの位置を保つ)、スマホでは画面の下に出る(Google スプレッドシートのコメントのように)。スマホでは、ツッコむところが書く欄の下に隠れるときだけ、上に見えるところまで送る。選んだ文(CSS Custom Highlight)と節の見出しに黄色の印を付け、書く欄にはその節のツッコミも並べる。章の終わりは「この章にツッコむ」ボタンと一覧だけにした。Esc か × で閉じる。
- **送ったときの演出**(2026-10-23、ユーザーの要望「お笑いみたいな「ツッコミ!」」「画面いっぱいにパチンコみたいに」「裏手でビッシイイイ」「もっとパチンコに寄せて」「文字はビシィッ‼と、その後はツッコミ!!!くらいで良い」): 送れたら、画面いっぱいに約 3 秒、パチンコの激アツ演出に寄せた流れを出す。暗転 → 赤い帯のカットインで裏手(手描きの SVG)が「ビシィッ!!」→ 白く光って金の放射 →「ツッコミ」が 1 字ずつ落ちて「！！！」で虹色に格上げ。縦長の画面では「！！！」を下の行に置く。文字は Dela Gothic One(Google Fonts。書く欄を開いたときに先読み)に、黒・赤・白の重ね縁取り・厚みの影・つや。`tsukkomi-burst.tsx`。下の画面の操作は邪魔しない(pointer-events なし)。対応する端末は震える。動きを減らす設定の端末では、文字だけを出す。
- **お礼**: 教科書チームの返事(「ツッコミありがとうございます!」をボタンで入れられる)と、読んだ人どうしの「ありがとう」(自分のツッコミには送れない。送った人の名前が出る)。
- **教科書チーム**: 権限 `kyokasho.comments.manage`(全社。`kyokasho.books.manage` を持つ人もできる)。`/apps/kyokasho/manage/tsukkomi` で受け止め方ごとに一覧し(返事待ちは古い順)、返事と受け止め方を決める。章のページでも同じ操作ができる。不適切なツッコミは消せる。返事・削除は監査ログ(`kyokasho.comment.handle` / `kyokasho.comment.delete`)。
- **本人の削除**: 返事がつく前(返事待ち・返事なし)の自分のツッコミだけ。
- **まだしないこと**: ツッコミの書き直し(消して書き直す)。新しいツッコミの知らせは 35 章(LINE WORKS)。

## 33. 実装メモ(会社カレンダー: 第 1 弾の楽しみ・お知らせ)

2026-10-17 のユーザーとの相談で決めた「第 1 弾」。DB の変更はない(すべてコードの定数と、既存の社員データから求める)。

- **次の連休のカウントダウン**: 休みが 3 日以上続く期間を「連休」とする(土日だけの 2 連休は数えない)。今日が連休の中なら「連休中(あと◯日)」。翌年の会社カレンダーが未登録で途切れる休み(年末)は、祝日・休暇を含むときだけ「(翌年分は未登録)」を付けて出す。名前は、年末年始休暇を含めば「年末年始休暇」、5/3〜5/5 を含めば「ゴールデンウィーク」、夏季休暇を含めば「夏季休暇」、それ以外は「◯連休」。
- **出勤土曜のお知らせ**: 次の出勤日が出勤する土曜のとき、その前の日(ふつうは金曜)から「明日は出勤日(土曜)です」、当日は「今日は出勤土曜です」。カレンダーの画面と、**ホームの一番上**に出す。
- **連休の前日**: 明日から連休なら「明日から◯連休です」(カレンダーとホーム)。
- **入社の周年**: 入社日と同じ月日に、**本人にだけ**「今日で入社◯年です」(カレンダーとホーム)。月の表でも、本人の入社記念日に印を付ける。2/29 入社の人は、平年は 2/28。他の人の周年を見せるかは、あとで決める。
- **給料日**: `company-calendar.ts` の `PAYDAY` = **毎月 29 日**(2026-10-17 にユーザーが確認)。土日・休日に当たるときは前の出勤日にずらす。その月にない日は月末(2 月)。`null` にすると表示しない。カレンダーとホーム、月の表の印に出す。
- **今日のひとこと**: `daily-notes.ts`。日付の決まった行事(七夕、兼六園の雪吊りの始まり 11/1、石川のズワイガニ漁の解禁 11/6 など)と、月ごとの季節の話題(雪道・熱中症など、工場の仕事に合うもの)。日付が年によって変わる行事(二十四節気、百万石まつりの日など)は、間違いを避けるため日付を書かない。
- **ホームへの表示**: core は apps を参照できないので、`src/app` のホームのルートで、`PortalHome` の上に apps/calendar の `CalendarHomeNotice` を並べる。カレンダーを使えない人(アプリ管理で無効・対象外)には何も出さない。出すことがない日も何も出さない。

## 34. 実装メモ(ありがとうカード)

人事ポリシー「育てて、育つ。」を風土として根づかせるための、最初の参加型アプリ(`modules/apps/arigato`、`app_key = arigato`、`/apps/arigato`)。2026-10-15 にユーザーと決めたこと: 「育てて、育つ。」とは別のアプリにして行き来できるようにする、カードは全員に公開(送る人が「本人にだけ」も選べる)、匿名はなし、「どんなこと」は 4 つ、毎週「今週の一枚」を声かけする。

- **送る・読む**: アプリを使える社員は、在籍中の他の社員(有効なログインアカウントがある人)に、「どんなこと」(教えてくれた・助けてくれた・挑戦していた・仕組みにしてくれた)と 140 字までのひとことを送れる。自分には送れない。1 人が 1 日に送れるのは 20 枚まで(連投の防止)。
- **公開範囲**: `public` = アプリを使える全員が読める。`private` = 送った人と受け取った人だけが本文を読める(集計の件数には含める)。匿名はない(送り主は常に表示)。
- **取り消し**: 送った人は自分のカードを削除できる。権限 `arigato.cards.manage`(全社)を持つ人は、不適切なカードを削除できる(監査ログに記録)。
- **いいね**: 公開カードに 1 人 1 回。送った人・受け取った人も押せる。
- **返事のスタンプ**(2026-10-21 ユーザーの判断: ありがとうを一方通行で終わらせず、送った人に「届いた」が分かるように): もらった人だけが、カードに 1 つだけスタンプで返事できる(うれしい! / こちらこそ / どういたしまして / またいつでも)。同じスタンプをもう一度押すと外れる。カードを読める人には、カードの下に「○○さんから返事」として見える。点数には入れない。`arigato.cards` の `reply`・`replied_at`(migration `0023_arigato_reply`)。
- **今週の一枚**: 週は JST の月曜〜日曜。今週まだ 1 枚も送っていない人には、ホームの「要対応」と、アプリの画面の上に声かけと先週のまとめ(件数・いちばん多かった「どんなこと」)を出す。送ったら消える。通知(メール・LINE など)はしない(ポータルに通知の仕組みがまだないため)。ホームへの表示は、`src/app` のホームのページがこのアプリの関数で項目を作り、`PortalHome` に渡す(core はアプリを参照しない)。
- **集計**: 権限 `arigato.stats.view`(全社)を持つ人だけが `/apps/arigato/stats` で、月ごとの件数・「どんなこと」の内訳・受け取った人の部署ごとの件数・受け取った枚数の多い人(参考)・**一人ひとりの伝えた点ともらった点**(在籍中の全員。0 点の人も含む。部署で絞り込める)を見られる。部署は、送った時点の受け取った人の主所属を、カードに記録しておく(異動しても過去の集計が変わらない)。
- **加点**(2026-10-16 ユーザーの方針: 実験段階なので、まずは「ありがとうを伝えた」実績を定量的に見て評価する): 送ったカード 1 枚につき 1 点。ただし同じ相手には 1 日 1 点まで(同じ日に同じ人へ何枚送っても 1 点。連投での水増しを防ぐ)。「本人にだけ」のカードも数え、取り消したカードは数えない。本人には、アプリの画面に今月の自分の「伝えた点」と「もらった点」を出す。点数は保存せず、カードから毎回数える(ルールを変えても過去の分を数え直せる)。
- **もらった点**(2026-10-21 ユーザーの方針: ゲームにしたいのではなく、ありがとうが増えて「育てて、育つ。」が進む状態にしたい。もらう人もよいことをしているので評価に入れるが、伝えることを中心に置く): もらったカード 1 枚につき 1 点。同じ人からは 1 日 1 点・月 4 点まで。評価に入れるのは、自分が「伝えた点」と同じ数まで(超えた分は集計画面に参考として出す)。点は足すだけで、0 点を減点にはしない(運用の方針)。決まりは画面ではやさしく短く書く。数え方は `receivedPoints`(`constants.ts`)。番付は、これまでどおり伝えた数だけで決める。
- **テーブル**(`pgSchema("arigato")`): `arigato.cards`(送った人・受け取った人(`core.users`、CASCADE)・受け取った人の部署(`core.departments`、SET NULL)・どんなこと・ひとこと・公開範囲・送った日(JST の暦日)・作成日時)、`arigato.likes`(カード × ユーザーで 1 件)。主キーは UUID(likes は複合主キー)。
- **ありがとう番付**(2026-10-17 ユーザーと決めたこと: ゲームのように楽しめて、続けるほど回るしくみにする。誰でも知っている大相撲の形を借り、見た目は本物に寄せ、決まりは相撲を知らない人にもわかる 4 つだけにする)。画面は `/apps/arigato/banzuke`、アプリの画面の上には自分の位と今場所の白星を出す。
  - **場所**: 2 か月でひと場所、年六場所(初場所 1〜2 月・春場所 3〜4 月・夏場所 5〜6 月・名古屋場所 7〜8 月・秋場所 9〜10 月・九州場所 11〜12 月。JST の暦日)。
  - **白星**: その場所の加点と同じ数え方(送ったカード 1 枚で 1 つ、同じ相手には 1 日 1 つまで、「本人にだけ」も数え、取り消しは数えない)。上限はない。
  - **番付の編成**: 場所が変わって最初にこのアプリの画面が開かれたとき、前の場所の結果から新しい番付を作って保存する(同時に開かれても 1 回だけ作るよう、トランザクションの advisory lock と主キーで守る)。前の場所の位置(上から何番目か)から「(白星 − 7.5)× 2」だけ上に動かした値で並べ直す。位は、ほかの人との比べ合いで決まる(白星 8 つでも、まわりがもっと多ければ上がらないことがある)。そのため画面では「8 つで上がる」とは言わず、下の「見込み」で具体的に見せる。並べた順に、関脇 2・小結 2・残りの 3 割を前頭・3 割を十両・2 割 5 分を幕下・残りを序ノ口にする。前の場所の番付にいない人(最初の場所・新しく入った人)は「前相撲」で、いちばん下に置く。最初の場所は全員が前相撲。
  - **優勝・大関・横綱**: 白星がいちばん多い人(1 つ以上)が優勝。並んだら、その場所にもらったカードの多い人、さらに並んだら前の位置が上の人。優勝した人は大関に上がる。大関で 2 場所続けて優勝すると横綱。大関は白星 7 以下で関脇に下がる(関脇のいちばん上)。横綱は下がらない。
  - **東西**: 同じ位の中で、上から東・西・東…と交互に置く。
  - **懸賞**: もらったカードを懸賞と呼び、番付には使わない。三賞(殊勲賞 = いちばん多くの人に送った、敢闘賞 = 前の場所から白星がいちばん増えた、技能賞 = 「教えてくれた」をいちばん多くもらった)と、優勝が並んだときに使う。
  - **四股名**: 姓から作った候補(姓+乃海・錦・富士・山・龍、若+姓)から本人が選ぶ。全社で重複しない。選ぶまでは氏名を出す。自由入力はさせない(不適切な名前を防ぐ)。
  - **伝達式**: 新しく大関・横綱になった人は、四字熟語を 1 つ選んで口上を作る(番付の行に保存し、番付の画面に出す)。
  - **今週の一枚 スタンプカード**: その場所の週(月曜はじまり)ごとに、1 枚でも送った週に判子を押す。全部の週に押せたら皆勤賞。保存せず、カードから毎回数える。
  - **画面の組み立て**(2026-10-19 ユーザーの指摘「番付表が見にくい」「どうなったらどうよくなるのか分かりにくい」「最初にどういうものか分かりやすく」):
    - いちばん上に「ありがとう番付とは」(送る → 白星がつく → 位が上がる の 3 段)。
    - 「あなたのいま」: 位・何番目・今場所の白星と、「あと N つで、次の場所は○○の見込み」。
    - 「送るとどうなる?」: 今場所の白星がいくつなら、次の場所でどの位になるかの表(見込み)。いまの白星から 1 つずつ増やして、位が変わるところだけを並べる(`projectionLadder`。ほかの人の白星は、いまの時点の数で計算する目安)。
    - 番付は、位ごとに名前を並べた読みやすい一覧を基本にし、本物の縦書きの番付表は「本物の番付表の形で見る」を開いて見る。ほかの人の白星の数は出さない(加点は本人と集計の権限を持つ人だけが見るため)。
  - 書体は、筆文字の Web 書体(Yuji Boku)を太らせて相撲字に寄せる(四股名・位など漢字だけのところ)。ひらがなが入る文は、筆文字のかなが崩れて読みにくいため、太い Zen Antique にする(2026-10-17 ユーザーの指摘)。本物の相撲字の有料書体(DynaFont 相撲体・藍原相撲字など。Web での利用許諾の確認が必要)を買ったら、書体の指定だけを差し替える。
  - **テーブル**: `arigato.shikona`(ユーザーごとに 1 件。四股名は一意)、`arigato.banzuke`(場所 × ユーザー。位置・位・東西・新昇進・口上、場所が終わったあとの白星・懸賞・優勝)。評価に使う加点(上限なし)は、これまでどおり月ごとに数える。
- 「育てて、育つ。」のページの「今日から、あなたにできること」から、このアプリを使える人にだけ入口を出す(アプリ同士は参照せず、`canAccessApp(actor, "arigato")` と URL だけを使う)。

## 35. 実装メモ(LINE WORKS への知らせ)

2026-10-17 のユーザーの判断: 新しいツッコミの知らせは、メールではなく LINE WORKS で教科書チームに送る(メールより早く気づけるため)。

- **`core/lineworks`**(サーバー側専用): LINE WORKS API 2.0 の Bot。サービスアカウントの JWT(RS256。iss = クライアント ID、sub = サービスアカウント)で `https://auth.worksmobile.com/oauth2/v2.0/token` からアクセストークンを取り(scope `bot`。期限まで使い回す)、`https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages` に文字を送る。外部のライブラリは使わない。
- **鍵**: 環境変数 `LINEWORKS_CLIENT_ID`・`LINEWORKS_CLIENT_SECRET`・`LINEWORKS_SERVICE_ACCOUNT`・`LINEWORKS_PRIVATE_KEY`・`LINEWORKS_BOT_ID`(Vercel では Sensitive)。送り先のトークルームはアプリごとの環境変数。
- **失敗しても本来の操作は止めない**: 設定がなければ送らない。送れなければログに残すだけ(ツッコミは保存されたまま)。送るのは `after()` で、画面を返したあと。
- **準備**: Bot が入ったトークルームは `npm run lineworks:setup` で作り、試しに 1 通送って channelId を表示する。`--rooms <JSON>` を渡すと、教科書ごとの届け先(全社員・部署の全員・名指し)を、ポータルの社員名簿と LINE WORKS の利用者(scope `user.read`)の氏名で突き合わせてまとめて作り、Vercel に登録する値を表示する(既定は確認だけ、`--apply` で作る。突き合わせは `core/lineworks/match.ts`)。JSON は氏名が入るのでリポジトリの外に置く。LINE WORKS を使っていない社員は入らない。
- **教科書のツッコミの送り先**(2026-10-17 のユーザーの判断「部署による」): 教科書の部署ごとにトークルームを分け、その部署の教科書チームにだけ知らせる。教科書ごと・部署ごとの channelId は `KYOKASHO_LINEWORKS_CHANNELS`(JSON。`{"教科書の slug か部署名": "channelId"}`。ブレーキ部には初級編・スタッド・メタルエステがあり、チームが教科書で違うので slug を先に見る)、どちらにもないもの(全部署共通など)は全体用の `KYOKASHO_LINEWORKS_CHANNEL_ID` へ送る(届け漏れを防ぐ)。判定は `notifyChannelFor`(`apps/kyokasho/tsukkomi.ts`)。
- **教科書のツッコミ**: 新しいツッコミが届くと「📝 教科書に新しいツッコミ【種類】/ 教科書 › 章 › 節 / 名前 さん: 本文(120 字まで)/ 届いたツッコミの画面の URL」を送る。


## 36. 実装メモ(組織図)

2026-10-21 のユーザーの判断: 第 1 弾は「部署ごとの箱」、上司・部下や部署の上下をつなぐツリーは第 2 弾で足す。

- **`apps/soshikizu`**(`/apps/soshikizu`)。DB の変更なし・専用権限なし。アプリの登録簿(`sync:manifests`)に登録し、入場は `requireAppAccess`。本番で使うには `/admin/apps` で有効にし、表示する相手を決める。
- **元のデータ**: 今日(JST)の主所属(`core.employee_assignments`)。異動は所属の画面で直せば、そのまま組織図に出る。載せるのは在籍者(人事上の状態が active / leave、入社済み、最終在籍日を過ぎていない。ログインの在籍判定と同じ考え方)。主所属のない人は最後の「所属なし」の箱。
- **箱の並び**: 部署の表示順(`sort_order` → `code`)。人のいない部署は出さない。箱の中は、管理職(役職の `is_management`)を上の段に分け、役職の序列(`rank`、大きいほど上位)→ 役職の表示順 → 役職なし → 入社が早い順 → 社員番号。並びはマスタ管理の序列で変えられる。判定は `apps/soshikizu/logic.ts`。
- **画面**: 拠点で絞り込み(`?location=<拠点の code>`)、名前を押すと役職・拠点・入社年が開く(JS なしの `details`)。本人の札に「あなた」の印。
- **顔写真**(2026-10-21 のユーザーの希望): LINE WORKS のアイコンを出す。写真はポータルに保存しない(DB・R2 の変更なし)。札の `<img>` は `/apps/soshikizu/photos/<社員の id>` を指し、その入口(`apps/soshikizu/photo-route.ts`)が組織図を見られる人・在籍者の写真だけを、LINE WORKS の API(`GET /users/{userId}/photo`、scope `user.read`。302 の転送先から中身を取る)から取って返す(本人のブラウザに 1 日覚えさせる)。社員と LINE WORKS の利用者は、ポータルに登録されたメール → 氏名・フリガナの順で突き合わせ、1 人に決まらなければ写真なし(`core/lineworks` の `matchDirectoryUser`)。利用者の一覧は 1 時間使い回す。LINE WORKS の設定がない環境・写真のない人・突き合わせられない人は、名字の 1 文字の丸を出す。
- **ドラッグで異動**(2026-10-21 のユーザーの希望): 社員管理の権限 `core.employees.manage` を全社で持つ人だけ、札を別の部署の箱へドラッグできる(スマホは札を開いて「部署を変える」)。落とすと確認(いつから。既定は今日)が出て、「異動する」を押したときだけ `core/employees` の `moveEmployeeDepartmentAction` が主所属を変える。拠点は今のまま、規則は所属の割り当て画面と同じ(変更日に始まった所属は付け直し、それより前からは前日で閉じて異動。共通の `applyPrimaryChange`)、監査ログも同じ。人のいない部署の箱は出さない(そこへ移すときは、札を開いて「部署を変える」)。主所属のない人(「所属なし」)は動かせない。箱の中の並びは役職の序列で決まるので、並び替えのドラッグはない。
- **経営を分ける**(2026-10-21 のユーザーの判断「部署という枠ではなく組織図なので分けて」): 役職名に「社長・専務・常務・工場長」を含む人(`EXECUTIVE_TITLE_WORDS`。「代表取締役社長」「副社長」も含む)と、氏名で指定した人(`EXECUTIVE_NAMES`。2026-10-21 のユーザーの判断で長井 将さん)は部署の箱に入れず、一番上の「経営」に序列順で並べる。経営の人が抜けて空になった部署の箱(総務・経理、板金全般など)は出さない。経営の札はドラッグで動かさず、開いた中に部署を出す。拠点で絞ると、経営もその拠点の人だけ。
- **LINE WORKS でトーク**(2026-10-22 のユーザーの希望「個人を押すとその人とのチャットが開く」): 札の右の吹き出し(開いた中にも「LINE WORKS でトーク」)を押すと、新しいタブで `/apps/soshikizu/talk/<社員の id>` を開き、その人との 1 対 1 のトークへ転送する(LINE WORKS の App Link `https://line.worksmobile.com/message/send?version=26&emailList=<アカウント>`。スマホはアプリ、PC はアプリかブラウザで開く)。アカウントは写真と同じ突き合わせ(メール → 氏名)で、押されたときにだけ調べる(一覧を画面に出さない)。見つからなければ、その旨の短い案内を出す。自分の札と、LINE WORKS の連携がない環境では出さない。DB の変更なし。
- **配置図**(2026-10-23 のユーザーの希望「組織図の中から別タブで分かるように。地図や名簿を押したら地図でビーコンがぴこーん」): 組織図アプリの上に「組織図 / 配置図」のタブ。`/apps/soshikizu/haichi`。元は Google ドライブの「会社配置図_2026-10-23(A3横).html」(老川さんの清書を写したもの)で、建物・部屋・機械・「よくいる場所」の札をコード(`floor-map.ts`。座標は A3 横の図の mm)で持つ。DB の変更なし。札は、名字(長井さんは名前まで)かフルネーム(ベトナムの人)で今日の在籍者に当て、1 人に決まらない札は灰色の点線で出す。名簿にいるのに札がない人は、名簿の下に「配置図にまだいない人」として出す。名簿の名前を押すと地図の上でその人の札が光る輪(3 重、くり返し)で光り、地図の建物を押すとそこにいる人がみんな光る。下の説明に、写真・場所・役目と LINE WORKS のトーク。スマホは地図を横に動かす。建物・部屋・機械が変わったら `floor-map.ts` を直す。
- **札をドラッグで動かす**(2026-10-23 のユーザーの希望「場所をドラッグとかで変えられるように」): 「札を動かす」ボタン。組織図を見られる社員はだれでも、だれの札でも動かせる(2026-10-23 のユーザーの判断「みんなも位置を細かく移動できるように」「だれの札でも」。はじめは社員管理の権限を持つ人だけだった。だれがいつ動かしたかは監査ログに残る)。押すと、札をつかんで建物の中に置き直せる(建物の外は断る)。「配置図にまだいない人」は、名前を押してから地図を押すと置ける。動かした札は、下の説明の「元の場所に戻す」(コードにない人は「配置図から外す」)で戻せる。保存先は `soshikizu.seat_positions`(migration `0028_soshikizu_seat_positions`。社員 1 人 1 行、座標は配置図の mm、場所(どの建物か)はサーバーが座標から決める)。行がある人はコードの場所より優先し、行がない人はコードの場所のまま。社員が消えると行も消える。監査ログ `soshikizu.seat.move` / `soshikizu.seat.reset`。
- **第 2 弾(ツリー)で要るもの**: 上司・部下(または部署の親子)を持つ表を `soshikizu.*` に migration で足し、登録の画面を作る。今の `core.departments` はフラット(4.3)のまま。

## 37. 実装メモ(生年月日と、会社カレンダーの誕生日)

2026-10-21 のユーザーの要望「誕生日を入れてください。私のカレンダーには全社員の誕生日を表示して」。

- **生年月日は社員マスタに持つ**: `core.employees.birth_date`(date、任意)。migration `0020_core_employee_birth_date` で列を足し、人事管理(`hr.profiles.birth_date`、31 章)に入力済みの値を移してから、そちらの列を消す(持ち場を 1 つにする)。人事管理の「生年月日・年齢」は、社員マスタの値を読み書きする。
- **入れ方**: 管理画面の社員の編集(`/admin/employees/<id>`)に「生年月日」の欄。名簿からの一括登録は `npm run db:import-birth-dates -- <CSV> --actor <ログインID> [--apply] [--overwrite]`(見出し `employee_number,birth_date`。既定は確認だけ。CSV はリポジトリの外に置き、出力にも生年月日・氏名は出さない。監査ログにも値は残さない)。入社日より後の日付・1900 年より前は受け付けない。
- **見え方**(会社カレンダー、33 章の続き):
  - 本人: 誕生日の当日に「お誕生日おめでとうございます」(カレンダーとホーム)、月の表に「誕生日」の印。
  - 権限 `calendar.birthdays.view`(全社のスコープ。system_admin には sync で自動で付く)のある人: 在籍中の全社員の誕生日を、月の表に「◯◯さん誕生日」の印で、当日はホームとカレンダーに「今日は ◯◯さん の誕生日です」。**年齢は出さない**。
  - それ以外の人には、ほかの人の誕生日は出さない。
  - 2/29 生まれの人は、平年は 2/28。
- **本番に出すとき**: migration 0020 を本番に適用 → `sync:manifests`(権限の追加) → コードを main に入れる → 生年月日を入れる(画面か一括登録)。

## 38. 実装メモ(会社カレンダー: 第 2 弾 全社の予定・参加の呼びかけ)

2026-10-21 にユーザーと決めた「第 2 弾」。第 1 弾(33 章)の動き、本人だけのメモ・予定(`calendar.entries`)、誕生日(37 章。権限 `calendar.birthdays.view`)はそのまま残す。

### 38.1 全社の予定

担当の人(権限 `calendar.events.manage`、全社)が `/apps/calendar/events` から登録する。カレンダーを使える人は全員見られる。種類は 3 つ。

| 種類(`kind`) | 表示 | 休みとして数えるか |
|---|---|---|
| `paid_leave_day` 一斉有給取得日 | 休日と同じ赤 + 「有給」の印 | 数える |
| `temporary_closure` 臨時休業 | 休日と同じ赤 + 「臨時休業」の印 | 数える |
| `event` 行事・予定(健康診断・棚卸し・大掃除など) | その日の印と一覧(時刻・メモは任意) | 数えない |

- **休みとして数える**: 次の休み・連休のカウントダウン(金曜が一斉有給なら土日と合わせて 3 連休)・明日から連休・今月の残りの出勤日数・年間のまとめ・月の表の色が、すべて同じ判定(`logic.ts` の `dayInfo`)で変わる。判定の関数は純粋関数のままにし、DB から読んだ休みの日を `withCompanyOffDays(会社カレンダー, 休みの日)` で会社カレンダーに重ねて渡す(`company-calendar.ts` の `extraOffDays`)。出勤土曜が臨時休業になれば、その日は出勤土曜として扱わない。
- **一斉有給取得日には、特別なお知らせを出さない**(ユーザーの指示: ふつうの有給のように表示するだけ)。ただし、連休の判定が変わった結果としての「明日から◯連休です」は、これまでの決まり(33 章)どおり出る。臨時休業も、カレンダーへの表示だけ。
- **登録の決まり**: 休みの 2 種類は、会社カレンダーが登録済みの年の、もともと出勤日の日だけに登録できる(休みの日に重ねても意味がないため)。時刻・呼びかけは付けられない。名称が空なら「一斉有給取得日」「臨時休業」にする。
- **給料日は動かさない**: 給料日のずらし(33 章)は、紙の会社カレンダー(`COMPANY_CALENDAR`)だけで判定する(一斉有給取得日・臨時休業で振り込み日は変わらないため)。

### 38.2 参加の呼びかけ(出欠の返事)

行事・予定(`kind = event`)には、呼びかける相手を付けられる。

- **相手の指定**: 社員を名指し(`calendar.event_invitees`)と、Audience(`audience_id`。部署・拠点・全社など。7 章・23 章と同じく、保存するのは条件で、見るたびに `matchedAudienceIds` / `evaluateDefinition` で評価する)。両方を付ければ、どちらかに当てはまる人が相手。登録した本人は相手に含めない(主催者のため)。いまログインできない社員(退職など)は数えない。
- **誰が作れるか**(決めた既定): カレンダーを使える人は誰でも、**社員を名指しした「自分の予定 + 呼びかけ」**を作れる(見えるのは本人と相手だけ。`visibility = invitees`)。次のどれかに当たるものは、権限 `calendar.events.manage` が必要: 全社に表示する(`visibility = company`)、Audience に呼びかける、休みの 2 種類。権限のない人が名指しの相手なしで作ろうとしたら、「メモ・予定」(自分だけ)に書くよう案内する。
- **見える条件**(deny by default): `visibility = company` はカレンダーを使える全員。`invitees` は登録した本人と、相手に当てはまる人だけ(それ以外には一覧にも詳細にも出さない。詳細は 404)。
- **返事**: 相手は、カレンダーの画面とポータルのホームの一番上に「10.30(木) 健康診断の説明会 への参加の返事をしてください」と「参加」「不参加」のボタンを見る。返事をするか、予定の日が過ぎると消える。返事は予定の日まで、その日の欄から変えられる。返事はアカウントごと(`calendar.event_responses`、`user_id` × 予定)。予定の日付・時刻を変えたら、返事は消して、もう一度聞く。
- **返事の一覧**: 登録した本人(と、全社に表示する予定なら `calendar.events.manage` を持つ人)が、予定の詳細(`/apps/calendar/events/[id]`)で「参加 / 不参加 / 未回答」と名前を見られる。相手はその時点で評価する(異動で変わる)。アカウントのない社員は「未回答(アカウントなし)」。カレンダーのアプリを使えない設定の人も相手に入りうる(アプリ管理の表示する相手と揃えて運用する)。
- **編集・削除**: `visibility = company` の予定は `calendar.events.manage` を持つ人。`invitees` の予定は登録した本人だけ(管理者でも他人の私的な呼びかけは見ない)。全社の予定の登録・変更・削除は監査ログに記録する(`calendar.event.create` / `update` / `delete`)。
- **Audience の削除**: core は apps を参照できないため、Audience の「利用先」(`listAudienceUsages`)には出ない。FK は `ON DELETE SET NULL` にし、Audience が消えたら、その条件の相手はいなくなる(名指しの相手は残る)。
- **通知**: メール・LINE WORKS には送らない(ポータルの画面に出すだけ)。

### 38.3 テーブル(`pgSchema("calendar")`、migration `0021_calendar_company_events`)

- **`calendar.company_events`** … `id`(UUID)、`kind`、`date`(JST の暦日)、`time`(`HH:MM` か NULL)、`title`(100 字)、`note`(1000 字)、`visibility`(`company` / `invitees`)、`audience_id`(`core.audiences`、SET NULL)、`created_by` / `updated_by`(`core.users`、SET NULL)、作成・更新日時。CHECK: 休みの 2 種類は `visibility = company`・時刻なし・Audience なし。
- **`calendar.event_invitees`** … 名指しの相手(予定 × `core.employees`、どちらも CASCADE)。
- **`calendar.event_responses`** … 返事(予定 × `core.users`、`response` = `yes` / `no`、返事をした日時)。

### 38.4 純粋関数とテスト

`logic.ts`(休みの判定に `calendar` を渡せるようにした)、`events.ts`(休みの日の重ね合わせ・見える条件・返事が必要か・編集できるか・権限が要るか)。`npm test` で、金曜の一斉有給で 3 連休になる・残りの出勤日数が減る・臨時休業は休み・行事は休みにしない・呼びかけの見え方を確かめる。

### 38.5 誕生日(37 章)との組み合わせ

- 誕生日の表示は 37 章のまま(本人のお祝い・「誕生日」の印、`calendar.birthdays.view` の人には「◯◯さん誕生日」の印と当日のお知らせ)。月の表の印(`marks`)に入れるだけで、予定の一覧とは別に出す。
- ホームとカレンダーの一番上は、上から「参加の返事のお願い」→ 会社カレンダーからのお知らせ(33 章・37 章。出勤土曜・連休・本人の誕生日・入社の周年・ほかの人の誕生日・給料日)の順。お知らせの判定には、全社の休みを重ねた会社カレンダーを渡す(連休・出勤土曜が変わる)。給料日だけは紙の会社カレンダーで判定する(38.1)。

### 38.6 本番に出すとき

migration `0021_calendar_company_events` を本番 DB に適用 → `sync:manifests`(権限 `calendar.events.manage` の追加) → コードを `main` に入れる → 担当の人のロールに `calendar.events.manage` を付ける。

## 39. 実装メモ(日報)

2026-10-21 のユーザーの依頼: 新人(成岡さん・老川さん)が Google ドキュメント「【日報まとめ】氏名」に毎日書き、長井さんが「指導者からのフィードバック」欄にコメントしている。これをポータルの中で完結させる。

- **アプリ**: `modules/apps/nippo`、`app_key = nippo`、`/apps/nippo`(一覧)・`/apps/nippo/write?date=YYYY-MM-DD`(自分の日報を書く。既定は今日、未来の日は不可)・`/apps/nippo/<id>`(日報 1 件とコメント)。入口は `requireAppAccess("nippo")`。本番ではアプリ管理で有効にし、宛先を新人と指導者(Audience)にする。
- **項目**: ドキュメントの様式(2026-10 時点)のまま。1. 今日の研修内容(提出に必須)、2. 教わったこと・学んだこと(今日一番の学び・指導で教わったこと・質問して分かったこと・自分で気づいたこと)、3. 一人でできるようになったこと、4. 難しかったこと、5. まだ分からないこと、6. コンディション(今日の点数 1〜10 と一言)、7. 明日の予定、8. 指導者からのフィードバック(= コメント)。項目の定義は `labels.ts` の `FIELD_DEF`。
- **流れ**: 本人が書いて「下書き保存」または「提出」。1 人 1 日 1 件(`(employee_id, report_date)` で一意)。提出した日報は下書きに戻さず、直すとそのまま更新する。消せるのは下書きだけ。提出した日報に、指導者がコメントし、本人も返信できる(どちらも自分のコメントだけ消せる)。
- **権限** `nippo.reports.review`(manifest で定義。sync で `system_admin` に自動付与): 提出済みの日報の閲覧とコメント。スコープは人事管理(31 章)と同じく、**書いた社員の今日の所属**で判定する。日報を書くのに権限は要らない。下書きは本人にしか見えない。自分の日報は、権限があっても本人の見え方(`reportMode`)。
- **一覧**: 指導者には「みんなの日報」(既定は**コメント待ち** = 本人以外のコメントがまだない提出済みの日報。書いた人で絞り込み)と「自分の日報」のタブ。権限のない人には自分の日報だけ。
- **ホームの要対応**(`home.ts`): 一度でも日報を書いた人で、今日の日報がまだ提出されていなければ「今日の日報を書きましょう」(日曜は出さない)。指導者には「コメント待ちの日報 N件」。
- **入力の補助**: 各欄に音声入力(31.3 と同じ `DictationButton`)。「メモや録音の文字起こしから、AI で下書きを作る」: 貼ったメモを Claude Haiku 5.5 に送り、日報の項目に振り分けた案を返す(tool use で項目ごとに受け取り、`sanitizeSorted` で知らない項目・範囲外の点数を捨てる)。「項目に入れる」を押したときだけ、空の項目には入れ、書いてある項目には後ろに足す(`mergeSorted`。「元に戻す」あり)。書かれていない事実は足させない。送るのは本人が貼ったメモだけで、日報は本人の文章なので氏名の置き換え(31.3 の `maskName`)はしない。
- **テーブル**(`pgSchema("nippo")`、migration `0024_nippo_app`。本番には 2026-10-21 に適用済み。番号は main の 0023 とぶつかったため付け直したが、SQL と日時は適用したときのまま): `nippo.reports`(項目ごとの列、`status` = `draft` / `submitted`、`submitted_at` は提出済みのときだけ、`score` 1〜10 は CHECK)、`nippo.comments`(`report_id` は CASCADE、`by_owner` = 書いた本人のコメントか。コメント待ちの判定に使う)。
- **監査ログ**: `nippo.report.delete`(下書きの削除)、`nippo.comment.delete`、`nippo.report.import`(過去の日報の取り込み。件数だけ)。本文は残さない。
- **過去の日報の取り込み**(2026-10-21 のユーザーの依頼): `npm run db:import-nippo -- <テキスト> --employee <社員番号> --mentor <指導者のログインID> --actor <ログインID> [--apply]`(既定は確認だけ)。元は Google ドキュメントを「書式なしテキスト(.txt)」で保存したもの(個人の記録なので、リポジトリの外に置く)。読み取りは `import.ts` の `parseNippoDocument`(純粋関数、`import.test.ts`)。「【日報】」の行で 1 日ずつに分け(見出しが 2 行続く日は 1 日分)、日付は「日付」の欄から読む。様式は 3 通り: 6 月〜(時間割つき。時間割は「・08:30-09:00 朝礼」の形にして 1. に、「本日のできた成果」は 3. に、「本日の気づき・学んだこと」は 2. の「指導で教わったこと」に)、8 月〜(研修内容の欄がない。「難しかったこと・備忘録」は 4. に、「今後の予定」は 7. に)、10 月〜(今の様式)。「いっぱいいっぱい度」(星 5 つ・10 段階。点数と向きが逆)は点数にせず一言に入れ、点数は「今日の点数」だけ。決まった項目にない見出し(「日報を踏まえて(相談済み)」など)は、見出しごと「自分で気づいたこと」に残す。日報は提出済み(提出はその日の 17:30、コメントは 18:00 とみなす)、「指導者からのフィードバック」は `--mentor` の人のコメントにする(空ならコメントなし。コメントのない日はコメント待ちに出る)。「氏名」の欄が社員の姓と合わない・同じ日付が 2 つ・未来の日付は止める。すでに日報がある日は取り込まない(何度実行しても同じ)。ただし、提出済みでまだ指導者のコメントがない日に、ドキュメントのフィードバックがあれば、そのコメントだけを足す(2026-10-22。取り込みのあとにドキュメントへ書いたフィードバックを入れるため。ユーザーの依頼)。一覧の見出しは、研修内容が空の日報(8 月〜の様式)では教わったことを出す。
- **まだのこと**: 新しいコメントの既読・通知(LINE WORKS)、指導者のコメントの「AIで下書き」。

## 40. 実装メモ(LINE WORKS の Bot: 雨予報・定時のお知らせ)

2026-10-21 のユーザーの判断: LINE WORKS の Bot をポータルの中でいろいろ作れるようにする。作れる人は限る(全権管理者と、Bot 管理者のロール。及川さん・南さん・長井勉社長)。いま LINE WORKS 側にある雨予報の Bot も、この中の 1 つとして作り直す(元のコードは取り出せないため)。計画の経緯は `docs/plans/lineworks-bots.md`。

- **module**: `apps/bots`(`/apps/bots`)。権限 `bots.manage`(全社)を持つ人だけが画面を開ける(ない人は 404)。system_admin には sync で自動で付く。Bot 管理者のロールは管理画面で作り、この権限を付けて 3 人に割り当てる。
- **種類はコード、中身は画面**: Bot の「種類」(`apps/bots/kinds.ts`)は、設定の形(zod)と「その日に何を送るか」をコードで持つ。画面で決めるのは、名前・種類・送り先のトークルーム(channelId)・種類ごとの設定・有効/無効。画面だけで何でも作れる形にはしない(壊れやすく、外部 API や権限の扱いが危ない)。新しい種類は、`kinds.ts` に 1 つ足す。
- **種類(第 1 弾)**:
  - **雨予報**(`rain`): 気象庁の天気予報(`https://www.jma.go.jp/bosai/forecast/data/forecast/<府県>.json`。鍵なし。出典「気象庁」を本文に入れる)から、選んだ地域(石川県の加賀・能登)の今日の降水確率(6 時間ごと)と天気を読み、いちばん高い降水確率がしきい値(既定 50%)以上なら知らせる。しきい値未満の日は送らない(「雨が降らない日も送る」にすると毎日送る)。読み取りは純粋関数 `rainReport`(`rain.ts`)で、テストあり。
  - **定時のお知らせ**(`notice`): 選んだ曜日に、決めた文を送る。
- **送り方**: LINE WORKS の Bot は、今ある「LONG PORTAL」(35 章の `core/lineworks`、鍵は `LINEWORKS_*`)を共用する。送り先は Bot ごとの channelId(下の「送り先の部屋を作る」で画面から作るか、`npm run lineworks:setup` で作って表示された値を入れる)。画面の「試しに送る」で、その場で 1 通送って確かめられる(本文の頭に【試し】。記録には残さない)。
- **送り先の部屋を作る**(2026-10-22): Bot の画面の送り先の欄にある「部屋を新しく作る」で、部屋の名前と入れる社員(氏名・フリガナ・社員番号・部署で絞り込み、部署ごとにまとめて選べる)を選ぶと、「LONG PORTAL」Bot の入ったトークルームを作り、その channelId を欄に入れる(コマンドは要らない)。社員と LINE WORKS の利用者は、組織図と同じく、メール → 氏名・フリガナの順で突き合わせる(`matchDirectoryUser`。scope `user.read`)。1 人でも見つからない人がいれば作らず、名前を出す(外すか、LINE WORKS の名前を直してもらう)。候補は在籍中の社員(入社日・退職日・状態で判定)。作ると選んだ人の LINE WORKS に部屋ができ、あいさつが 1 通届くので、押す前に確認を出す。`bots.manage` で本判定し、監査ログ `bots.room.create`(部屋の名前・channelId・入れた社員の id)を残す。部屋そのものは DB に持たない(Bot の channelId だけ)。部屋に入れた人の出入りは LINE WORKS 側で行う。
- **定時の実行**: `vercel.json` の cron が毎朝 6 時(JST。`0 21 * * *` UTC)に `/api/cron/bots` を呼ぶ(`CRON_SECRET` で保護。30 章と同じ)。有効な Bot を 1 つずつ実行し、`bots.runs` に結果(sent / skipped / failed)を残す。`(bot_id, run_date)` は一意で、同じ日に 2 回送らない(先に行を入れて、入れられたときだけ送る)。Vercel の Hobby プランの cron は 1 日 1 回・時刻は 1 時間の幅があるので、送る時刻は Bot ごとに選べない(Pro にしたら、時刻の設定を足す)。
- **テーブル**(`pgSchema("bots")`、migration `0025_bots_app`): `bots.bots`(名前・種類・channelId・設定(jsonb)・有効・作った人・作成/更新日時)、`bots.runs`(Bot・実行日(JST)・結果・送った本文かエラー・日時)。
- **監査ログ**: Bot の作成・変更・削除を、同じトランザクションで記録する(`bots.bot.create` / `update` / `delete`)。
- **まだしないこと**: 話しかけると答える Bot(LINE WORKS からの受け取り口 `callback`。`X-WORKS-Signature` の確認が要る)、Bot ごとの別の LINE WORKS Bot(名前・アイコンを分ける)、送る時刻の設定。
- **本番に出すとき**: migration `0025_bots_app` を本番に適用 → `sync:manifests`(アプリと権限 `bots.manage`) → コードを main に入れる → `/admin/apps` で「Bot」を有効にし、見せる相手を Bot 管理者に限る → ロール「Bot 管理者」を作って 3 人に割り当てる → 雨予報の部屋の channelId を入れて「試しに送る」。

## 41. 実装メモ(TODO の依頼)

2026-10-21 にユーザーと決めたこと。TODO アプリ(25 章)から、ほかの社員に TODO をお願いできるようにする(例:「○○さんに、金曜までに見積もりを出してもらう」)。

### 41.1 しくみ(データの持ち方)

依頼は、**頼まれた人の TODO の 1 行**として持つ(`todo.todos` に、空でもよい列を足す。別のテーブルは作らない)。

- 理由: 頼まれた人の「自分のタスク」に、ふつうの TODO と並べて出す・完了にする・カテゴリの自動分類・会社カレンダーの期限表示を、これまでと同じ読み書きで扱える。状態の持ち場が 1 か所なので、頼んだ人と頼まれた人で表示がずれない。
- `user_id` = 頼まれた人(TODO の持ち主)。足す列:

| 列 | 意味 |
|---|---|
| `requested_at` | 頼んだ日時。**これが空でない行が依頼**(空の行はこれまでどおりの自分の TODO) |
| `requested_by_user_id` | 頼んだ人(`core.users`、`ON DELETE SET NULL`。アカウントは削除しない運用だが、消えても頼まれた人の TODO は残す) |
| `acknowledged_at` | 頼まれた人が「確認しました」を押した(か、完了・お返し・並べ替えなど何か操作した)日時 |
| `returned_at` / `returned_reason` | お返しした日時と、ひとこと(200 字まで・任意) |

- 状態は 3 つ: **未完了**(`done = false`・`returned_at` が空)、**完了**(`done = true`)、**お返し**(`returned_at` が空でない)。CHECK で「完了とお返しは同時にならない」「自分には頼めない」「依頼でない行には依頼の列を入れない」を守る。
- 依頼のメモは、TODO の「詳細」(`description`)をそのまま使う。期限は `due_date`。
- **カテゴリ**: 依頼を作るときも、ふつうの追加と同じく、タスク名を Claude で自動分類する(25 章。送るのはタスク名とカテゴリ一覧だけで、相手の名前は送らない)。カテゴリと優先度は、頼まれた人が自分用に変えられる。

### 41.2 誰が何をできるか(deny by default)

見られるのは**頼んだ人と頼まれた人の 2 人だけ**。管理者にも見せない(TODO は個人のデータ。25 章)。ほかの人には一覧にも出さず、操作は「見つかりません」にする。

| 操作 | 頼んだ人 | 頼まれた人 |
|---|---|---|
| 見る | ○(「頼んだこと」に、状態つきで) | ○(「自分のタスク」に「○○さんから」の印つきで。お返ししたものは出さない) |
| 相手・タスク名・メモ・期限を変える | ○(完了するまで) | × |
| 頼んだ人を変える | × | × |
| 取り下げる(行を消す) | ○(完了するまで) | × |
| 完了にする・未完了に戻す | × | ○(お返ししたもの以外) |
| お返しする(ひとこと任意) | × | ○(未完了のとき) |
| カテゴリ・優先度を変える | × | ○ |
| 確認しました | × | ○ |
| 添付ファイル | ×(依頼には付けない。添付は本人だけの TODO に限る) | × |
| 削除する | (取り下げ) | ×(やらないときは「お返し」) |

- **お返しされたら**: 頼んだ人の「頼んだこと」に「お返し」とひとことが出る。頼んだ人は、内容や相手を直して**頼み直す**(保存すると未完了に戻り、相手にもう一度お知らせが出る)か、取り下げる。
- **頼んだ人が内容を変えたら**: 「確認しました」を消して、相手のホームにもう一度お知らせを出す。
- **完了した依頼**: 両方の一覧(完了したもの)に残る。片付け方は、あとで決める。
- **相手の候補**: 在籍中で、有効なアカウントのある社員(自分を除く。カレンダーの呼びかけ(38.2)と同じ選び方: 氏名・フリガナ・社員番号・所属で絞り込み)。保存するときに、相手が TODO アプリを使える設定か(アプリ管理の表示する相手。`canAccessApp`)を確かめ、使えなければ断る。
- Server Action は、毎回 `requireAppAccess("todo")` を通し、引数を zod で検証し、上の表の判定(`requests.ts` の純粋関数)を通す。更新・削除の SQL にも「頼んだ人 = 本人」か「持ち主 = 本人」の条件を必ず入れる。
- TODO は個人のデータなので、監査ログには記録しない(25 章と同じ)。専用の権限もない。

### 41.3 ホームのお知らせ

- 頼まれた人のホームの一番上に「○○さんから依頼が届きました: 見積もりを出す(期限 10.24(金))」と「確認しました」「TODO を開く」を出す。**確認するか、完了するか、お返しするまで**出し続ける。
- core は apps を参照できないので、33 章のカレンダーと同じく `src/app` のホームのルートで、apps/todo の `TodoHomeNotice` を並べる(カレンダーのお知らせの下)。TODO アプリを使えない人・依頼がない人には何も出さない。
- メール・LINE WORKS には送らない(今回は画面だけ)。

### 41.4 会社カレンダーへの期限の表示

- 自分の TODO と、頼まれた依頼のうち、**未完了で期限のあるもの**を、本人の会社カレンダーの月の表と、その日の欄に出す(「TODO の期限」。依頼は「○○さんから」)。頼んだ人のカレンダーには出さない。ほかの人には見えない。
- アプリどうしは参照しない: `src/app` のカレンダーのルートが、apps/todo の公開 API(`listTodoCalendarItems`)で本人の期限の一覧を読み、ただのデータ(`id`・日付・名前・印・リンク)として apps/calendar の `CalendarPage` の `extraDayItems` に渡す。カレンダーは TODO を知らないまま、渡された印を並べるだけ。TODO アプリを使えない人には空の一覧を渡す。
- 期限を過ぎた未完了のものも、その日付に出す(完了したら消える)。

### 41.5 テーブルの変更(migration `0026_todo_requests`)

- `todo.todos` に `requested_at`・`requested_by_user_id`・`acknowledged_at`・`returned_at`・`returned_reason` を足す(すべて空を許す。既存の行はそのまま自分の TODO)。索引 `todos_requested_by_idx`(頼んだ人 × 頼んだ日時)。CHECK 4 つ(41.1)。
- 列の追加だけで、既存のデータは変えない。

### 41.6 純粋関数とテスト

`requests.ts`(状態・誰が何をできるか・ホームに出すか・頼み直しで消す列)と `calendar-items.ts`(期限の一覧 → カレンダーの印)。`npm test` で確かめる。

### 41.7 本番に出すとき

migration `0026_todo_requests` を本番 DB に適用 → `sync:manifests`(権限の追加はないが、いつもの手順として) → コードを `main` に入れる。TODO アプリは本番のアプリ管理でまだ「無効」なので、使い始めるときに `/admin/apps` で有効にし、表示する相手を決める(依頼の相手も、この表示する相手に入っている必要がある)。

## 42. 実装メモ(目安箱)

2026-10-21 のユーザーの要望: 社内を歩いていると呼び止められて、要望・危なかったこと・困りごと・欲しいものなどを言われることが多い。それを呼び止めずに、ここから「ちょこん」と言えるようにしたい。音声入力と、写真を簡単に付けられること。宛先は誰か個人ではなく「会社宛て」が基本で、「リーダー宛て」もあってよい。全管理者(長井さん)は、全部の投稿とやり取りを見られること。

- **アプリ**: `modules/apps/meyasubako`、`app_key = meyasubako`、`/apps/meyasubako`(タブ `?tab=`: 投稿する・わたしの投稿・みんなの投稿・受け付けた投稿)、`/apps/meyasubako/<投稿の id>`(詳細とやり取り)、`/apps/meyasubako/photos/<写真の id>`(写真の入口)。入口は `requireAppAccess("meyasubako")`。本番で使うには `/admin/apps` で有効にし、表示する相手を「全社」にする。
- **カテゴリ**(`constants.ts` の `CATEGORY_LABEL`。key は DB に保存するので変えない): 要望・ヒヤリハット/危険・困りごと/相談・意見/提案・欲しいもの・ありがとう/よかったこと・その他。ヒヤリハットは一覧で目立たせ、LINE WORKS の知らせに ⚠️ を付ける。
- **公開範囲は必ず選ぶ**(2026-10-21 ユーザーの要望「みんなに見えてもいいものと、見えてはよくないものを分けたい。押し間違いがないように、どちらかを選ばないと送れないように。送れないときは赤字で理由を」): `public` = みんなに見えてOK(「みんなの投稿」に出て、返事も全員が読める)、`private` = 管理者だけ(本人と、返事ができる人だけ)。カテゴリと公開範囲は画面で初期値を置かない。足りない項目は、送ろうとしたときに項目ごとの赤字と、送信ボタンの上のまとめで示す。判定は `missingFields`(画面と Server Action で同じ関数)。内容は文章か写真のどちらかがあればよい。
- **宛先**: `company` 会社宛て(初期値)/ `leader` リーダー宛て。管理する人は宛先に関係なく全部を見る。
- **権限**(manifest で定義。sync で `system_admin` に自動付与):
  - `meyasubako.posts.manage`(全社で割り当てる): 全投稿の閲覧・返事・状況の変更・削除。
  - `meyasubako.leader.respond`(拠点・部署のスコープで割り当てる): 「リーダー宛て」の投稿のうち、**投稿した時点の投稿者の主所属**(`posts.department_id` / `location_id`。6 章の「データ自身に所属を持つ」)が割当の範囲に入るものの閲覧・返事・状況の変更。役職では決めない。
- **匿名**: 「名前を出さずに送る」を選ぶと、ほかの社員にも、管理する人・リーダーの画面にも名前(と所属)を出さない。返事を本人に届けるため、DB には投稿者(`author_user_id`)を持つ(画面の説明は「名前を出さない」とし、「記録に残らない」とは言わない)。
- **見え方の判定**は `postAccess`(`constants.ts`、テストあり)に集め、一覧・詳細・写真の入口・Server Action が同じ判定を通す。見られない投稿は 404。書き込み(返事・書き足し)は投稿者と返事ができる人だけで、公開の投稿でもほかの社員は読むだけ。
- **状況**: 未読(new)→ 確認済み(seen)→ 対応中(doing)→ 完了(done)。返事ができる人が開くと未読は確認済みになる。要対応(ホームと「受け付けた投稿」の印)は、未読か、投稿者があとから書き足したもの。投稿者には、返事・状況の変化をまだ読んでいなければ印を出す(ホームの「要対応」にも出す)。既読は人ごとではなく、投稿者 / 返事をする側の 2 つで持つ。
- **写真**: 4 枚まで。端末で長い辺 1600px の JPEG に縮めてから、署名付き URL で R2 へ直接送る(20 章の方式。キーは `<プレフィックス>meyasubako/<投稿者の user id>/<UUID>.jpg`)。投稿のときに、本人のキーか・R2 に実在するか・種類(JPEG・PNG・WebP)と大きさ(10MB まで)を確かめてから登録する。表示は入口(`photo-route.ts`)が見てよい人だけを署名付き URL へ転送する。投稿しなかった写真は R2 に残る(掃除は未実装)。R2 の設定がない環境でも、写真のない投稿はできる。
- **音声入力**: 共通の `core/shared/ui/dictation.tsx`(31.3)。使えないブラウザでは、キーボードのマイクで話す案内を出す。
- **投函の演出**(2026-10-23 ユーザーの要望「目安箱ってものに沿った、過剰演出」。案から「書状で投函」を選んだ。上様が出る案は、上から目線に見えるので見送り): 送った直後の詳細ページで、書いた文が書状になり、巻かれて「封」をされ、木の目安箱の口へ落ちて「コトン」、錠前が「カチャ」と閉まって「たしかに受け取りました」(約 6 秒。`components/toukan-scene.tsx`。画面だけの演出で DB の変更なし)。書体は、どっしりした Zen Antique(筆文字の Yuji Boku は「ヘロヘロすぎ」とのユーザーの指摘で 2026-10-23 にやめた)。どこを押しても飛ばせる。同じ投稿では 1 回だけ(sessionStorage)。動きを減らす設定の人には最後の文だけ。
- **AIで整える**(2026-10-22 ユーザーの依頼「AI校正できるようにして」): 投稿の内容と、やり取り(返事・書き足し)の欄に「AIで整える」(32 章のツッコミと同じ形。`polish.ts`、Claude Haiku 5.5)。誤字・音声入力の聞き間違い・言いよどみを直した案を出し、「この案を使う」で入れ替える(「元に戻す」あり)。送るのはカテゴリと書きかけの文だけで、投稿者の名前は送らない。保存はしない。10 字以上から。
- **お知らせ(個人)**(2026-10-22 ユーザーの判断「メールではなく、管理できるところかお知らせに届けてほしい」): 新しい投稿を、返事ができる人(`meyasubako.posts.manage` の人と、リーダー宛てなら範囲内の `meyasubako.leader.respond` の人。投稿者本人は除く)の「お知らせ → 個人」に 1 件ずつ届ける(`notify.ts` → core の `createAppNotice`。宛先は `core/access` の `listPermissionHolders` で、`can()` と同じ判定)。お知らせの本文は「お知らせ管理」でも見えるので、**投稿の内容と投稿者の名前は入れず**、種類・宛先・公開範囲と投稿へのリンクだけ。ヒヤリハットは種類「安全」・重要度「重要」。掲載は 30 日。投稿の保存のあとに `after()` で作り、失敗しても投稿は取り消さない。
- **サイドバーの数**: 返事をする人には、サイドバーの「目安箱」の横に未対応の件数(要対応と同じ数え方)を出す。core は apps を参照できないので、`src/app/(portal)/layout.tsx` が `getMeyasubakoNavBadge()` で数えて `PortalShell` の `appBadges` に渡す(`buildNavigation` がアプリの項目の `badge` にする)。返事をしない人には DB を読まない。数えられなくても画面は止めない(0 にする)。
- **知らせ**: 新しい投稿を LINE WORKS のトークルーム `MEYASUBAKO_LINEWORKS_CHANNEL_ID` に送る(35 章と同じ。設定がなければ送らない。匿名なら名前を出さない)。
- **連投の防止**: 1 人 1 日 20 件まで。
- **削除**: 管理する人だけ(不適切な内容への対応)。監査ログ `meyasubako.post.delete`(本文は残さず、種類・宛先・公開範囲・状況・投稿者・写真の数だけ)。写真も R2 から消す。投稿者本人の取り消しはまだない。
- **テーブル**(`pgSchema("meyasubako")`、migration `0027_meyasubako_app`): `meyasubako.posts`(投稿者(`core.users`、CASCADE)・投稿時の部署と拠点(SET NULL)・カテゴリ・宛先・公開範囲・匿名・場所(100 字)・本文(2000 字)・状況・投稿日(JST)・既読と書き込みの日時 4 つ)、`meyasubako.photos`(投稿(CASCADE)・R2 のキー(一意)・種類・大きさ・並び)、`meyasubako.messages`(投稿(CASCADE)・書いた人(SET NULL)・返事をする側か・本文(1000 字))。
- **本番に出すとき**: migration `0027_meyasubako_app` を本番 DB に適用(テーブルの追加だけ)→ `sync:manifests`(アプリの登録と権限 2 つ)→ コードを `main` に入れる → `/admin/apps` で有効にし、表示する相手を「全社」に → リーダーに `meyasubako.leader.respond` を部署・拠点つきで割り当てる → 知らせを使うなら、トークルームを作って `MEYASUBAKO_LINEWORKS_CHANNEL_ID` を Vercel に登録。
- **まだしないこと**: 投稿者による取り消し・書き直し、集計(カテゴリ・部署ごとの件数)、ありがとう・いいね、投稿しなかった写真の掃除。

## 43. 実装メモ(手順書)

2026-10-23 のユーザーの要望: ポータルの中のアプリとして「手順書」を作り、いくつもの手順書を載せられるようにする。最初の 1 つは freee勤怠管理Plus の詳しい使い方。

- **アプリ**: `modules/apps/tejunsho`、`app_key = tejunsho`、`/apps/tejunsho`(一覧。まとまりごと)、`/apps/tejunsho/<slug>`(手順書。要点 → 目次 → 本文 → 出典)。入口は `requireAppAccess("tejunsho")`。閲覧だけなので専用の権限はない。DB の変更もない。
- **中身はコードに持つ**(`guides/<名前>.ts`、一覧は `guides/index.ts` の `GUIDES`)。リポジトリは公開なので、載せてよいのは公開の情報から作れる一般的な手順だけ(社内のやり方・担当者名・写真を含む手順は、30 章の教科書と同じく DB と R2 に置く形を、そのときに作る)。
- **形**(`types.ts`): 手順書 = slug・まとまり・題名・説明・確認した日・並び順・要点・節・出典。節は小見出しごとに、文・番号つきの手順(補足つき)・箇条書き・囲み(こつ / 注意 / 補足)・表・よくある質問の部品を並べる。「」で囲んだ語(ボタン名・メニュー名)は太字で出す。
- **書き間違いの検査**: `validateGuides`(`logic.ts`)が slug・節の id の形と重なり、空の節、確認した日の形、出典の URL を確かめる。`npm test` で登録済みの手順書を検査する。
- **freee勤怠管理Plus の使い方**(`guides/freee-kintai.ts`): freee の公式ヘルプと従業員マニュアルから、従業員の操作(ログイン・打刻・タイムカード・打刻申請・休暇・時間外勤務・申請履歴・エラー勤務・月末の勤怠確認・よくある質問)をまとめた。会社の設定で出ない画面(休憩ボタン、LINE WORKS の打刻など)はそう書いた。freee の画面が変わったら直して `checkedOn` を更新する。
- **本番に出すとき**: `sync:manifests`(アプリの登録)→ コードを `main` に入れる → `/admin/apps` で有効にし、表示する相手を「全社」に。
