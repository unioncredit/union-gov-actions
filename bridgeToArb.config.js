// rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/bridgeToArb.js",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [
    commonjs(),
    resolve({ resolveOnly: [/^@arbitrum\/sdk.*$/] }),
    json(),
    // terser(),
  ],
};
