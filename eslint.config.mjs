import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// module 境界の機械的な強制(docs/DESIGN.md 3.1)。
// 依存方向: src/app → modules/apps/* → modules/core/*
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // modules はルーティング層(src/app)に依存しない
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
          ],
        },
      ],
    },
  },
  {
    // core は apps に依存しない
    files: ["src/modules/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps", "@/modules/apps/*"],
              message: "core から業務アプリ(modules/apps)を参照しないでください。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/sodatsu から他のアプリを参照しない)
    files: ["src/modules/apps/sodatsu/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/sodatsu", "!@/modules/apps/sodatsu/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/todo から他のアプリを参照しない)
    files: ["src/modules/apps/todo/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/todo", "!@/modules/apps/todo/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/calendar から他のアプリを参照しない)
    files: ["src/modules/apps/calendar/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/calendar", "!@/modules/apps/calendar/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/haisou から他のアプリを参照しない)
    files: ["src/modules/apps/haisou/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/haisou", "!@/modules/apps/haisou/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/kyokasho から他のアプリを参照しない)
    files: ["src/modules/apps/kyokasho/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/kyokasho", "!@/modules/apps/kyokasho/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/hr から他のアプリを参照しない)
    files: ["src/modules/apps/hr/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/hr", "!@/modules/apps/hr/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/arigato から他のアプリを参照しない)
    files: ["src/modules/apps/arigato/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/arigato", "!@/modules/apps/arigato/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/soshikizu から他のアプリを参照しない)
    files: ["src/modules/apps/soshikizu/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/soshikizu", "!@/modules/apps/soshikizu/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  {
    // 業務アプリ同士は直接依存しない(apps/nippo から他のアプリを参照しない)
    files: ["src/modules/apps/nippo/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*"],
              message: "modules から src/app(ルーティング層)を参照しないでください。",
            },
            {
              group: ["@/modules/apps/*", "!@/modules/apps/nippo", "!@/modules/apps/nippo/*"],
              message: "業務アプリ同士は直接参照しないでください(core を経由する)。",
            },
          ],
        },
      ],
    },
  },
  // 業務アプリ同士の直接依存の禁止は、各アプリ(modules/apps/○○)を追加する際に
  // そのアプリ用のブロックをここへ追加する(他アプリの @/modules/apps/* を禁止)。
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/db/migrations/**",
  ]),
]);

export default eslintConfig;
