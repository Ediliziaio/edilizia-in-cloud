/** La vista CAD è un vincolo geometrico, non una fotografia da conservare. */
export function vincoloFonte3d(config: unknown): string {
  if (!config || typeof config !== "object") return "";
  const c = config as Record<string, unknown>;
  const legacy = c.legacy_config && typeof c.legacy_config === "object" ? c.legacy_config as Record<string, unknown> : {};
  const note = [c.notes, c.note_libere, c.technicalDetails, legacy.note_libere, legacy.technicalDetails].filter((v): v is string => typeof v === "string").join("\n");
  if (!note.includes("La sorgente è una vista 3D del progetto")) return "";
  const infissi = note.match(/Infissi comuni del progetto:[^.]+\./)?.[0] ?? "";
  return `PLAN-TO-PHOTOGRAPH CONTRACT. Image 1 is a schematic 3D CAD blockout, NOT a real photograph. Preserve its exact camera, building silhouette, storeys, opening positions, dimensions, sill heights and sash layout. Replace the CGI appearance of ALL visible surfaces with physically realistic architectural photography: natural detailed sky, grass and vegetation, realistic plaster, paving, glass reflections and material texture. Keep the positions and scale of trees and objects but make their appearance photographic, never low-poly or diagrammatic. Geometry preservation does NOT mean preserving flat CGI shading, polygonal trees or placeholder blue-grey window materials. Do not deliver a recolored version of the original 3D preview. ${infissi ? `AUTHORITATIVE WINDOW FINISH: ${infissi} Apply this same frame material and color to every visible window; preserve each opening's geometry and do not add muntins. This finish overrides placeholder CAD frame colors. ` : ""}Do not add openings, buildings, roofs, furniture, people or decoration not present in the source or explicitly requested intervention.`;
}
