import {
  normalizzaDocumentazioneMezzo,
  type DocumentazioneMezzoPos,
} from "./posDocumentiMezzi.ts";
import { normalizzaSceltaMezzo, type SceltaMezzoPos } from "./posMezzi.ts";
import {
  normalizzaFontiTecniche,
  type FontiTecnicheScheda,
} from "./posFontiTecniche.ts";
import type { PosContenuto } from "./posModello.ts";

/** Structured descriptions, not an automatic risk assessment or a certificate. */
export const CAMPI_CONTESTO_TECNICO = {
  area: "Area di lavoro e accessi",
  interferenze: "Interferenze e coordinamento",
  condizioni_avvio: "Condizioni da verificare prima dell’avvio",
  sospensione: "Condizioni di sospensione e ripresa",
  emergenze: "Procedure di emergenza per la lavorazione",
  prima: "Sequenza operativa: prima del lavoro",
  durante: "Sequenza operativa: durante il lavoro",
  dopo: "Sequenza operativa: fine del lavoro",
} as const;
export const CAMPI_RISCHIO_TECNICO = {
  pericolo: "Pericolo e evento temuto",
  esposti: "Mansioni e persone esposte",
  situazione: "Circostanze di esposizione",
  valutazione_iniziale: "Valutazione iniziale e metodo adottato",
  misure_collettive: "Protezioni collettive",
  misure_organizzative: "Misure tecniche e organizzative",
  dpi: "DPI e condizioni di impiego",
  valutazione_residua: "Valutazione residua e verifiche di efficacia",
  riferimento: "Fonte della valutazione e riferimento documentale",
} as const;
export const CAMPI_ATTREZZATURA_TECNICA = {
  nome: "Macchina, attrezzatura, impianto o opera provvisionale",
  identificativo: "Identificazione dell’attrezzatura effettiva",
  impiego: "Impiego e limiti operativi nel cantiere",
  controlli_preuso: "Controlli prima dell’uso e manutenzione",
  manuale_riferimento: "Manuale e documenti di riferimento",
  formazione_addestramento:
    "Formazione, abilitazione e addestramento da verificare",
} as const;
type Testi<T> = { -readonly [K in keyof T]: string };
export type RischioTecnicoPos = {
  id: string;
  fonti?: FontiTecnicheScheda;
} & Testi<typeof CAMPI_RISCHIO_TECNICO>;
export type AttrezzaturaTecnicaPos = {
  id: string;
  anagrafica?: SceltaMezzoPos;
  documentazione?: DocumentazioneMezzoPos;
  fonti?: FontiTecnicheScheda;
} & Testi<typeof CAMPI_ATTREZZATURA_TECNICA>;
export type TecnicaLavorazionePos = Testi<typeof CAMPI_CONTESTO_TECNICO> & {
  rischi: RischioTecnicoPos[];
  attrezzature_previste: "da_verificare" | "si" | "no";
  motivo_senza_attrezzature: string;
  attrezzature: AttrezzaturaTecnicaPos[];
  riesaminata: boolean;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function testi<T extends Record<string, string>>(
  campi: T,
  v: unknown,
): Testi<T> {
  const o = obj(v);
  return Object.fromEntries(
    Object.keys(campi).map((k) => [k, typeof o[k] === "string" ? o[k] : ""]),
  ) as Testi<T>;
}
export const rischioTecnicoVuoto = (id: string): RischioTecnicoPos => ({
  id,
  ...testi(CAMPI_RISCHIO_TECNICO, {}),
});
export const attrezzaturaTecnicaVuota = (
  id: string,
): AttrezzaturaTecnicaPos => ({ id, ...testi(CAMPI_ATTREZZATURA_TECNICA, {}) });
export function normalizzaTecnicaPos(v: unknown): TecnicaLavorazionePos {
  const o = obj(v);
  return {
    ...testi(CAMPI_CONTESTO_TECNICO, o),
    rischi: (Array.isArray(o.rischi) ? o.rischi : []).map((r, i) => ({
      id: typeof obj(r).id === "string" ? String(obj(r).id) : `r-${i + 1}`,
      ...testi(CAMPI_RISCHIO_TECNICO, r),
      ...(obj(r).fonti ? { fonti: normalizzaFontiTecniche(obj(r).fonti) } : {}),
    })),
    attrezzature_previste:
      o.attrezzature_previste === "si" || o.attrezzature_previste === "no"
        ? o.attrezzature_previste
        : "da_verificare",
    motivo_senza_attrezzature:
      typeof o.motivo_senza_attrezzature === "string"
        ? o.motivo_senza_attrezzature
        : "",
    attrezzature: (Array.isArray(o.attrezzature) ? o.attrezzature : []).map(
      (r, i) => ({
        id: typeof obj(r).id === "string" ? String(obj(r).id) : `a-${i + 1}`,
        ...testi(CAMPI_ATTREZZATURA_TECNICA, r),
        ...(obj(r).fonti
          ? { fonti: normalizzaFontiTecniche(obj(r).fonti) }
          : {}),
        ...(obj(r).documentazione
          ? {
              documentazione: normalizzaDocumentazioneMezzo(
                obj(r).documentazione,
              ),
            }
          : {}),
        ...(obj(r).anagrafica
          ? { anagrafica: normalizzaSceltaMezzo(obj(r).anagrafica) }
          : {}),
      }),
    ),
    riesaminata: o.riesaminata === true,
  };
}
export const tecnicaPosVuota = (): TecnicaLavorazionePos =>
  normalizzaTecnicaPos({});
export function erroriTecnicaPos(
  v: TecnicaLavorazionePos | undefined,
): string[] {
  if (!v) return ["compila la scheda tecnica di dettaglio"];
  const e: string[] = [];
  for (const [k, label] of Object.entries(CAMPI_CONTESTO_TECNICO))
    if (!v[k as keyof typeof CAMPI_CONTESTO_TECNICO].trim()) e.push(label);
  if (!v.rischi.length) e.push("descrivi i rischi specifici della lavorazione");
  if (v.rischi.length > 50 || v.attrezzature.length > 50)
    e.push("massimo 50 rischi e 50 attrezzature per scheda");
  for (const [i, r] of v.rischi.entries())
    for (const [k, label] of Object.entries(CAMPI_RISCHIO_TECNICO))
      if (!r[k as keyof typeof CAMPI_RISCHIO_TECNICO].trim())
        e.push(`Rischio ${i + 1}: ${label}`);
  if (v.attrezzature_previste === "da_verificare")
    e.push("valuta le attrezzature effettivamente previste");
  if (
    v.attrezzature_previste === "no" &&
    (!v.motivo_senza_attrezzature.trim() || v.attrezzature.length)
  )
    e.push(
      "motiva l’assenza di attrezzature e risolvi le schede eventualmente presenti",
    );
  if (v.attrezzature_previste === "si" && !v.attrezzature.length)
    e.push("identifica almeno un’attrezzatura effettiva");
  for (const [i, a] of v.attrezzature.entries())
    for (const [k, label] of Object.entries(CAMPI_ATTREZZATURA_TECNICA))
      if (!a[k as keyof typeof CAMPI_ATTREZZATURA_TECNICA].trim())
        e.push(`Attrezzatura ${i + 1}: ${label}`);
  for (const rows of [v.rischi, v.attrezzature])
    if (
      rows.some((r) => !r.id.trim()) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      e.push("identificativi delle schede mancanti o duplicati");
  if (!v.riesaminata)
    e.push("riesamina il dettaglio tecnico per questo cantiere");
  return e;
}
/** Do not carry operational context, real equipment IDs or documentary references to another site. */
export function tecnicaPosRiutilizzabile(
  v: TecnicaLavorazionePos,
): TecnicaLavorazionePos {
  const t = normalizzaTecnicaPos(v);
  return {
    ...t,
    area: "",
    interferenze: "",
    condizioni_avvio: "",
    sospensione: "",
    emergenze: "",
    attrezzature_previste: "da_verificare",
    motivo_senza_attrezzature: "",
    riesaminata: false,
    rischi: t.rischi.map((r, i) => ({
      ...r,
      id: `r-${i + 1}`,
      fonti: normalizzaFontiTecniche(null),
      esposti: "",
      situazione: "",
      valutazione_iniziale: "",
      valutazione_residua: "",
      riferimento: "",
    })),
    attrezzature: t.attrezzature.map((a, i) => ({
      ...a,
      id: `a-${i + 1}`,
      fonti: normalizzaFontiTecniche(null),
      anagrafica: normalizzaSceltaMezzo(null),
      documentazione: normalizzaDocumentazioneMezzo(null),
      identificativo: "",
      manuale_riferimento: "",
      formazione_addestramento: "",
    })),
  };
}
export const supportaTecnicaPos = (body: Record<string, unknown>) =>
  body.versione_client === 2 && body.versione_tecnica_client === 1;
/** Read confirmation is revoked when the operational context or technical content changes. */
export function invalidaRiesameTecnico(
  prima: PosContenuto,
  dopo: PosContenuto,
) {
  if (dopo.versione_tecnica !== 1) return;
  const globale = (p: PosContenuto) =>
    JSON.stringify([
      p.opera,
      p.impresa,
      p.dirigenti,
      p.preposti,
      p.rspp,
      p.medico_competente,
      p.rls,
      p.emergenze,
      p.lavoratori,
      p.autonomi,
      p.formazione,
      p.rumore,
      p.procedure_psc,
      p.allegati,
    ]);
  const cambiaContesto = globale(prima) !== globale(dopo);
  const firma = (l: PosContenuto["lavorazioni"][number]) =>
    JSON.stringify({
      ...l,
      verificata: false,
      prodotti_riesaminati: false,
      prodotti: l.prodotti?.map((p) => ({ ...p, verificato: false })),
      tecnica: l.tecnica ? { ...l.tecnica, riesaminata: false } : undefined,
    });
  for (const l of dopo.lavorazioni) {
    const vecchia = prima.lavorazioni.find((x) => x.id === l.id);
    if (
      l.tecnica &&
      (cambiaContesto || !vecchia || firma(vecchia) !== firma(l))
    )
      l.tecnica.riesaminata = false;
  }
}
