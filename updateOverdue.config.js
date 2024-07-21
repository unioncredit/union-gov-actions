// rollup.config.js
import json from "@rollup/plugin-json";

export default {
  input: "src/updateOverdue.js",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [json()],
};
