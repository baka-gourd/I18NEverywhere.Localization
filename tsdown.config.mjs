import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "tools/*": "src/tools/*.ts",
  },
  platform: "node",
  target: "node22",
  fixedExtension: false,
  dts: false,
});
