// core/masters の公開 API(サーバー側)。
export { MasterPage } from "./components/master-page";
export { MASTER_KEYS, MASTER_LABEL, isMasterKey } from "./config";
export type { MasterKey, MasterRow } from "./config";
export { listMasters } from "./repo";
