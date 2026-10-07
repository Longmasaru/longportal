// 権限(role + permission + scope)の純粋な判定(DB・セッションに依存しない)。docs/DESIGN.md 6 章。
//
// role = 何ができるか / scope = どの範囲でできるか。
// 割当のスコープ: location_id・department_id がどちらも NULL = 全社(global)、片方だけ = その拠点・部署、
// 両方 = 拠点 AND 部署。

/** ユーザーが持つ権限の 1 件(ロールの権限 × 割当のスコープ)。 */
export type Grant = {
  permissionCode: string;
  locationId: string | null;
  departmentId: string | null;
};

/** 権限判定の対象データの所属。判定に必要なデータだけが、自身に location_id / department_id を持つ。 */
export type ScopeTarget = {
  locationId?: string | null;
  departmentId?: string | null;
};

/**
 * 1 つの軸の判定。割当の軸が NULL なら制限なし。割当の軸が指定されていれば、
 * 対象データの同じ軸の値が一致する必要がある(対象データの値が NULL なら deny)。
 */
function axisAllows(grantAxis: string | null, targetAxis: string | null | undefined): boolean {
  if (grantAxis === null) return true;
  if (targetAxis === null || targetAxis === undefined) return false;
  return grantAxis === targetAxis;
}

/** 対象データに対して、その権限が使えるか(スコープ込み)。 */
export function grantAllows(grants: Grant[], code: string, target: ScopeTarget): boolean {
  return grants.some(
    (g) =>
      g.permissionCode === code &&
      axisAllows(g.locationId, target.locationId) &&
      axisAllows(g.departmentId, target.departmentId),
  );
}

/** 全社(スコープなし)でその権限を持つか。core の管理画面はこれを要求する。 */
export function hasGlobalGrant(grants: Grant[], code: string): boolean {
  return grants.some(
    (g) => g.permissionCode === code && g.locationId === null && g.departmentId === null,
  );
}

/** どのスコープでもよいので、その権限を持つか(「その機能の入口を見せるか」の判定用)。 */
export function hasAnyGrant(grants: Grant[], code: string): boolean {
  return grants.some((g) => g.permissionCode === code);
}

/**
 * スコープ付き割当が、現在有効な所属のいずれか 1 件に適合するか(異動時のロール警告用)。
 * 拠点と部署の両方が指定されている割当は、同じ 1 件の所属が両方を満たす必要がある。
 * 全社の割当は常に適合する。
 */
export function scopeFitsAssignments(
  scope: { locationId: string | null; departmentId: string | null },
  assignments: { locationId: string; departmentId: string }[],
): boolean {
  if (scope.locationId === null && scope.departmentId === null) return true;
  return assignments.some(
    (a) =>
      (scope.locationId === null || a.locationId === scope.locationId) &&
      (scope.departmentId === null || a.departmentId === scope.departmentId),
  );
}
