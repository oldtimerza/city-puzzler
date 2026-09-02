import { defineConfig } from "vite";

export default defineConfig({
  // itch.io serves uploaded HTML games from a subdirectory, not the site root.
  base: "./",
});
