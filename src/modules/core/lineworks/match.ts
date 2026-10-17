// トークルームに入れる人を、ポータルの社員名簿と LINE WORKS の利用者の名前で突き合わせる(準備のときだけ使う純粋関数)。
// docs/DESIGN.md 33 章。LINE WORKS の ID は社員番号と結びついていないので、氏名で探す。
// 空白・中黒・括弧書き(「長井 勉(社長)」)は無視し、英字の大小・ひらがなとカタカナの違いもそろえる。
// LINE WORKS では外国籍の方の名前がカタカナのことがあるので、名簿のフリガナでも探す。

export type RoomSpec = {
  /** 送り先の名前(教科書の slug か部署名。"*" は全体用)。 */
  key: string;
  title: string;
  /** 全社員。 */
  all?: boolean;
  /** その部署(主所属)の全員。 */
  departments?: string[];
  /** 名字だけ、または「名字 名前」で名指し。 */
  members?: string[];
  /** 名前で突き合わせられない人を、LINE WORKS の ID で直接入れる。 */
  lineWorksIds?: string[];
};

export type RosterEmployee = {
  familyName: string;
  givenName: string | null;
  familyNameKana?: string | null;
  givenNameKana?: string | null;
  department: string | null;
};
export type DirectoryUser = { userId: string; lastName: string; firstName: string };

export type ResolvedRoom = {
  memberIds: string[];
  /** 名簿にはいるが、LINE WORKS に見つからない人(氏名)。 */
  notInLineWorks: string[];
  /** 名指しした名前が名簿に見つからない・何人もいる、など。 */
  problems: string[];
};

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s・･·.,、]/g, "")
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toUpperCase();
}

function nameKeys(e: RosterEmployee): string[] {
  const keys = [normalizeName(`${e.familyName}${e.givenName ?? ""}`)];
  if (e.familyNameKana) keys.push(normalizeName(`${e.familyNameKana}${e.givenNameKana ?? ""}`));
  return [...new Set(keys.filter(Boolean))];
}

function fullName(e: RosterEmployee): string {
  return `${e.familyName} ${e.givenName ?? ""}`.trim();
}

export function resolveRoom(spec: RoomSpec, roster: RosterEmployee[], directory: DirectoryUser[]): ResolvedRoom {
  const problems: string[] = [];
  const picked = new Set<RosterEmployee>();

  if (spec.all) roster.forEach((e) => picked.add(e));
  for (const d of spec.departments ?? []) {
    const hit = roster.filter((e) => e.department === d);
    if (hit.length === 0) problems.push(`部署「${d}」の社員が名簿にいません`);
    hit.forEach((e) => picked.add(e));
  }
  for (const m of spec.members ?? []) {
    const n = normalizeName(m);
    const byFull = roster.filter((e) => normalizeName(fullName(e)) === n);
    const hit = byFull.length > 0 ? byFull : roster.filter((e) => normalizeName(e.familyName) === n);
    if (hit.length === 0) problems.push(`「${m}」さんが名簿にいません`);
    else if (hit.length > 1) problems.push(`「${m}」さんが ${hit.length} 人います(${hit.map(fullName).join("、")})。名前まで書いてください`);
    else picked.add(hit[0]);
  }

  const byName = new Map<string, string[]>();
  for (const u of directory) {
    const key = normalizeName(`${u.lastName}${u.firstName}`);
    byName.set(key, [...(byName.get(key) ?? []), u.userId]);
  }
  const memberIds = new Set<string>(spec.lineWorksIds ?? []);
  const notInLineWorks: string[] = [];
  for (const e of picked) {
    const ids = [...new Set(nameKeys(e).flatMap((k) => byName.get(k) ?? []))];
    if (ids.length === 1) memberIds.add(ids[0]);
    else if (ids.length === 0) notInLineWorks.push(fullName(e));
    else problems.push(`LINE WORKS に「${fullName(e)}」さんが ${ids.length} 人います`);
  }
  return { memberIds: [...memberIds], notInLineWorks, problems };
}
