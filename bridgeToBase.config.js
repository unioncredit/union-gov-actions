// rollup.config.js
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default {
  input: "src/bridgeToBase.js",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [commonjs(), json()],
};
