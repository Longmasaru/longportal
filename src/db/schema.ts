// 全 module のテーブル定義をまとめる(db クライアントの型付けと relational query 用)。
// migration の対象は drizzle.config.ts の schema(src/modules/**/schema.ts)で、ここには依存しない。
export * from "@/modules/core/departments/schema";
export * from "@/modules/core/locations/schema";
export * from "@/modules/core/positions/schema";
export * from "@/modules/core/employment-types/schema";
export * from "@/modules/core/employees/schema";
export * from "@/modules/core/auth/schema";
export * from "@/modules/core/audit/schema";
export * from "@/modules/core/roles/schema";
export * from "@/modules/core/audience/schema";
export * from "@/modules/core/notices/schema";
export * from "@/modules/core/links/schema";
export * from "@/modules/core/apps/schema";
export * from "@/modules/apps/todo/schema";
