// core/access の公開 API(サーバー側専用)。
export { requireActor, resolveActor, loadActor } from "./actor";
export type { Actor, ActorAssignment, ActorDenyReason, ActorResult, ActorRole } from "./actor";
export { can, canGlobally, canInAnyScope, requireGlobalPermission, requirePermission } from "./guards";
export { grantAllows, hasAnyGrant, hasGlobalGrant, scopeFitsAssignments } from "./grants";
export type { Grant, ScopeTarget } from "./grants";
export { evaluateEmployeeAccess, evaluateUserAccess } from "./evaluate";
export type { AccessDenyReason } from "./evaluate";
