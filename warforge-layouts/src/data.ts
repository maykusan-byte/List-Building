import type { Layout, Manifest } from "./types";
export const asset = (path: string) => import.meta.env.BASE_URL + path;
export async function getManifest(): Promise<Manifest> {
  const response = await fetch(asset("data/manifest.json"));
  if (!response.ok)
    throw new Error("Le catalogue des layouts est indisponible.");
  const data = (await response.json()) as Manifest;
  if (
    data.schemaVersion !== "warforge-layouts/v1" ||
    !Array.isArray(data.layouts) ||
    !data.layouts.length
  )
    throw new Error("Le catalogue de layouts est incompatible.");
  return data;
}
export async function getLayout(
  path: string,
  signal: AbortSignal,
): Promise<Layout> {
  const response = await fetch(asset(path), { signal });
  if (!response.ok)
    throw new Error(
      "Impossible de charger ce layout. Réessayez ou choisissez une autre carte.",
    );
  return response.json();
}
