export const SQUADRE_OPERAI = "/azienda/manodopera?tab=operai&vista=squadre";
export const CALENDARI_SQUADRE =
  "/azienda/impostazioni/calendari-lavori?tab=squadre";

export function percorsoSquadra(base: string, id?: string | null) {
  if (!id) return base;
  const [path, query] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("squadra", id);
  return `${path}?${params.toString()}`;
}
