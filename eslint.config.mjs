import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_foo` marks a deliberately-unused binding (e.g. a param kept to match
      // a signature the Supabase swap will need).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Any build output, not just the default one.
    //
    // .gitignore already covers these with a ".next-" prefix pattern — a
    // verification build writes .next-verify — but ESLint keeps its own ignore
    // list and did not. So `npx eslint .` walked 310 generated files and
    // reported 546 errors in code nobody wrote, which is what a person sees
    // when they run the lint command this project documents. A lint that is
    // always red is a lint nobody reads.
    //
    // Line comments, not a block: the pattern itself contains the two
    // characters that close one, which is how this file was briefly a syntax
    // error rather than a config.
    ".next-*/**",
  ]),
]);

export default eslintConfig;
