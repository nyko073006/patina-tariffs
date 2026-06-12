import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  site: "https://patina-tariffs.example",
  build: {
    format: "directory",
  },
});
