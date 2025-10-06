import { startCatalogPage, createMoviesConfig } from "./catalog.js";

export async function startMoviesPage() {
  const config = createMoviesConfig();
  await startCatalogPage(config);
}