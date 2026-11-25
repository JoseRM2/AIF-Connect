import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Reglas estrictas del React Compiler introducidas en eslint-plugin-react-hooks v7:
    // desactivadas mientras `reactCompiler` no esté habilitado (Fase 3) para evitar
    // ruido sobre efectos legítimos de carga inicial y sincronización de props.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),
]);
