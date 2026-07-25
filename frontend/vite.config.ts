import { defineConfig } from "vite";

const GITHUB_PAGES_BASE = "/whale-acoustic-lab/";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project below the repository path. Keep the root
  // base for the Vite development server so localhost behavior is unchanged.
  base: command === "build" ? GITHUB_PAGES_BASE : "/",
}));
