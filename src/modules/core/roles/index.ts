// core/roles の公開 API(サーバー側)。
export { RolesPage, AssignmentsPage } from "./components/roles-pages";
export {
  CORE_PERMISSIONS,
  SYSTEM_ADMIN_ROLE_CODE,
  allPermissionDefinitions,
} from "./catalog";
export type { CorePermissionCode, PermissionDefinition } from "./catalog";
