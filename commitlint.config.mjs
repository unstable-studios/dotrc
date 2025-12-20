export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "perf", "docs", "refactor", "test", "chore", "ci"],
    ],
    "scope-enum": [
      2,
      "always",
      ["core", "wasm", "server", "worker", "web", "sdk", "docs"],
    ],
    "scope-empty": [2, "never"],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
  },
};
