// core/audience の公開 API(サーバー側)。
export { AudiencesPage, AudienceNewPage, AudienceEditPage } from "./components/audience-pages";
export { definitionSchema } from "./definition";
export type { AudienceDefinition, AudienceCondition, AudienceGroup } from "./definition";
export { matchesAudience, type EmployeeContext } from "./evaluate";
export { ensureDefaultAudiences, ALL_EMPLOYEES_AUDIENCE_NAME } from "./bootstrap";
