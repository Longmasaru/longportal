// apps/hr の公開 API。src/app はここ経由でのみ参照する。
export { HrPage } from "./components/hr-page";
export { HrEmployeePage, parseKind, parseTab } from "./components/employee-page";
export { manifest } from "./manifest";
