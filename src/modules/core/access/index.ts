// core/access の公開 API(サーバー側専用)。
export { requireActor, resolveActor, loadActor } from "./actor";
export type { Actor, ActorAssignment, ActorDenyReason, ActorResult } from "./actor";
export { isAdminActor, requireAdmin } from "./admin";
export { evaluateEmployeeAccess, evaluateUserAccess } from "./evaluate";
export type { AccessDenyReason } from "./evaluate";
