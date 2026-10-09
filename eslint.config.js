const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  { ignores: ["supabase/functions/**", "scripts/**", "tests/**", "dist/**"] },
  { rules: { "react-hooks/exhaustive-deps": "off" } },
]);
