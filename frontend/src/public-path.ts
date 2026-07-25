const viteBase = import.meta.env?.BASE_URL;

export const APP_BASE_PATH = typeof viteBase === "string" && viteBase.length > 0
  ? viteBase
  : "/";

export function publicAssetUrl(path: string): string {
  return `${APP_BASE_PATH}${path.replace(/^\/+/, "")}`;
}
