/** Reviewed named context, belonging exclusively to the POS emitter. Never copied by name. */
export type JsonRiesame =
  | null
  | boolean
  | number
  | string
  | JsonRiesame[]
  | { [key: string]: JsonRiesame };
export interface FonteRiesameAddettiPos {
  id: string;
  impronta: string;
  fotografia: Record<string, JsonRiesame>;
}
export interface RequisitiAddettiPos {
  modalita: "da_verificare" | "riesami" | "altra_gestione";
  dal: string;
  al: string;
  motivazione: string;
  adattamento: string;
  fonti: FonteRiesameAddettiPos[];
  confermata: boolean;
  contesto_lavorazione: Record<string, JsonRiesame> | null;
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
function copiaJson(v: unknown): Record<string, JsonRiesame> {
  return JSON.parse(JSON.stringify(obj(v)));
}
export function normalizzaRequisitiAddettiPos(v: unknown): RequisitiAddettiPos {
  const a = obj(v);
  return {
    modalita:
      a.modalita === "riesami" || a.modalita === "altra_gestione"
        ? a.modalita
        : "da_verificare",
    dal: str(a.dal),
    al: str(a.al),
    motivazione: str(a.motivazione),
    adattamento: str(a.adattamento),
    fonti: (Array.isArray(a.fonti) ? a.fonti : []).map((v) => {
      const f = obj(v);
      return {
        id: str(f.id),
        impronta: str(f.impronta),
        fotografia: copiaJson(f.fotografia),
      };
    }),
    confermata: a.confermata === true,
    contesto_lavorazione:
      a.contesto_lavorazione && typeof a.contesto_lavorazione === "object"
        ? copiaJson(a.contesto_lavorazione)
        : null,
  };
}
export const requisitiAddettiPosVuoti = () =>
  normalizzaRequisitiAddettiPos(null);
export function contestoLavorazioneAddetti(
  l: object,
): Record<string, JsonRiesame> {
  const { requisiti_addetti: _r, ...rest } = l as Record<string, unknown>;
  return copiaJson(rest);
}
function stabile(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stabile).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${stabile(x)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export function erroriRequisitiAddettiPos(
  v: RequisitiAddettiPos | undefined,
  lavoro: object,
  inizio: string,
  fine: string,
) {
  if (!v || v.modalita === "da_verificare")
    return [
      "definisci i riscontri nominativi della propria impresa per questa lavorazione",
    ];
  const e: string[] = [];
  if (
    !v.confermata ||
    stabile(v.contesto_lavorazione) !==
      stabile(contestoLavorazioneAddetti(lavoro))
  )
    e.push(
      "rileggi e conferma il collegamento dopo le modifiche alla lavorazione",
    );
  if (!v.adattamento.trim())
    e.push(
      "descrivi la pertinenza dei requisiti rispetto all’attività effettiva",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v.dal) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.al) ||
    v.al < v.dal ||
    (inizio && v.dal < inizio) ||
    (fine && v.al > fine)
  )
    e.push("indica un periodo della lavorazione entro le date del POS");
  if (v.modalita === "altra_gestione") {
    if (obj(lavoro).svolgimento !== "subappalto" || !str(obj(lavoro).svolgimento_con).trim() || !v.motivazione.trim() || v.fonti.length)
      e.push(
        "motiva l’altra gestione senza mantenere riesami propri collegati",
      );
  } else {
    if (
      !v.fonti.length ||
      v.fonti.length > 10 ||
      new Set(v.fonti.map((f) => f.id)).size !== v.fonti.length
    )
      e.push("collega da uno a dieci riesami distinti della propria impresa");
    for (const f of v.fonti)
      if (
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(f.id) ||
        !/^[0-9a-f]{64}$/.test(f.impronta) ||
        f.fotografia.id !== f.id ||
        f.fotografia.impronta !== f.impronta ||
        str(f.fotografia.dal) > v.dal ||
        str(f.fotografia.al) < v.al
      )
        e.push(
          "riesame non pertinente o non esteso all’intero periodo dichiarato",
        );
  }
  return [...new Set(e)];
}
export const supportaRequisitiAddettiPos = (b: Record<string, unknown>) =>
  b.versione_client === 2 && b.versione_requisiti_addetti_client === 1;
