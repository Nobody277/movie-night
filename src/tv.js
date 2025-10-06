import { startCatalogPage, createTVConfig } from "./catalog.js";

export async function startTVPage() {
  const config = createTVConfig();
  await startCatalogPage(config);
}