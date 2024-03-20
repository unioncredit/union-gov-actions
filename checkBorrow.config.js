// rollup.config.js
import json from "@rollup/plugin-json";

export default {
  input: "src/checkBorrowAmount.js",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [json()],
};
