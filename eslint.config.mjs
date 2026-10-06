import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Capas de docs/ARCHITECTURE.md §A.2: components y lib nunca importan server. */
const noServerImports = {
  group: ["@/server", "@/server/*", "**/server/*"],
  message: "El código de servidor (src/server) no se puede importar desde UI ni desde lib.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "playwright-report/**", "next-env.d.ts"]),

  // Calidad (§43 / §S13)
  {
    rules: {
      "no-alert": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // `const { omitida: _omitida, ...resto } = obj` es la forma de quitar propiedades sin mutar.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "TSAsExpression > TSAnyKeyword", message: "No uses `as any`." },
      ],
    },
  },

  // Reglas con información de tipos en el núcleo y el servidor
  {
    files: ["src/lib/**/*.ts", "src/server/**/*.ts", "src/schemas/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },

  // UI: sin servidor y sin colores literales (los colores salen del tema MUI)
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noServerImports] }],
      "no-restricted-syntax": [
        "error",
        { selector: "TSAsExpression > TSAnyKeyword", message: "No uses `as any`." },
        {
          selector: "JSXAttribute[name.name=/^(sx|style)$/] Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]",
          message: "Usa tokens del tema MUI en lugar de colores literales.",
        },
      ],
    },
  },

  // Núcleo isomórfico: sin servidor, sin React ni Next
  {
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/state/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            noServerImports,
            { group: ["react", "react-dom", "next", "next/*"], message: "src/lib es isomórfico: sin React ni Next." },
          ],
        },
      ],
    },
  },

  // Route Handlers: el cuerpo solo se lee con readBodyCapped / ctx.readJson
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "TSAsExpression > TSAnyKeyword", message: "No uses `as any`." },
        {
          selector: "CallExpression[callee.property.name=/^(json|formData|arrayBuffer|text|blob)$/][callee.object.name=/^(request|req)$/]",
          message: "Lee el cuerpo con ctx.readBody()/ctx.readJson() (límite de tamaño de withApiGuards).",
        },
      ],
    },
  },
]);

export default eslintConfig;
