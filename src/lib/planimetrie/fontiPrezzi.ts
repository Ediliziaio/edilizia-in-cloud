/**
 * Da dove arrivano i prezzi proposti per le lavorazioni della pianta: prima il listino
 * dell'azienda; dove non arriva, la voce del prezzario pubblico della sua regione abbinata
 * PER CODICE alla lavorazione (`shared/planimetrie/abbinamentiPrezzario.ts`); poi il prezzo
 * indicativo dichiarato.
 *
 * Niente ricerca per parole nel prezzario, di proposito. Provata il 23/11/2026 su Lombardia
 * 2026: restituiva forniture senza posa («Zoccolino di plastica» 2,30 €/m per il battiscopa),
 * voci d'altro genere («Pavimento di piscine») e per quattro lavorazioni su dieci niente.
 * Un prezzo così, con accanto «Prezzario Lombardia», sembrerebbe attendibile e non lo è.
 * Una lavorazione senza abbinamento resta al prezzo indicativo; dal prezzario si sceglie a
 * mano con «Cambia prezzo» → «Scegli dal listino».
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { regioneAzienda } from "@/lib/geo/provinceRegioni";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { abbinamentiPerRegione, PROVINCE_TOSCANA, regioneDelPrezzario, unitaDelPrezzario } from "../../../shared/planimetrie/abbinamentiPrezzario.ts";
import { FONTI_VUOTE, REGOLE_LAVORAZIONI, type FontiPrezzi, type TipoLavorazione, type VoceDiPrezzo } from "./prezziProposti";

// La tabella del listino non è nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

async function listinoAzienda(companyId: string): Promise<VoceDiPrezzo[]> {
  const { data, error } = await sb().from("rst_listino_voci").select("codice, descrizione, unita_misura, prezzo_unitario")
    .eq("company_id", companyId).gt("prezzo_unitario", 0).limit(3000);
  if (error) return [];
  return ((data ?? []) as { codice: string | null; descrizione: string; unita_misura: string | null; prezzo_unitario: number }[])
    .map((v) => ({ codice: v.codice, descrizione: v.descrizione, unita: v.unita_misura, prezzo: Number(v.prezzo_unitario) }));
}

/**
 * Le voci abbinate per codice nel prezzario della regione dell'azienda, con il nome da mostrare
 * («Lombardia 2026»). Vuoto se la regione non si conosce, non ha abbinamenti o la sua fonte non
 * è pubblicata. Si caricano tutte (sono una decina): il risultato non dipende dalle righe.
 */
type PrezzarioCaricato = Pick<FontiPrezzi, "prezzario" | "prezzarioNome">;
const PREZZARIO_VUOTO: PrezzarioCaricato = { prezzario: {}, prezzarioNome: null };

async function prezzarioAbbinato(companyId: string): Promise<PrezzarioCaricato> {
  const vuoto = PREZZARIO_VUOTO;
  const { data: azienda } = await sb().from("companies").select("region, operational_province, legal_province").eq("id", companyId).maybeSingle();
  // La provincia che decide la regione è quella da cui `regioneAzienda` l'ha dedotta: prima l'operativa.
  const provincia = (azienda?.operational_province || azienda?.legal_province || "").trim().toUpperCase();
  const abbinamenti = abbinamentiPerRegione(regioneDelPrezzario(regioneAzienda(azienda), provincia));
  if (!abbinamenti) return vuoto;
  const { data: fonti } = await sb().from("prezzario_fonte").select("id, nome")
    .eq("regione", abbinamenti.regione).eq("anno", abbinamenti.anno).eq("stato", "pubblicato").limit(20);
  const elenco = (fonti ?? []) as { id: string; nome: string | null }[];
  // Un prezzario per provincia: solo quello della provincia dell'azienda, mai uno a caso.
  const nomeProvincia = abbinamenti.perProvincia ? PROVINCE_TOSCANA[provincia] : null;
  const fonte = abbinamenti.perProvincia
    ? (nomeProvincia ? elenco.find((f) => (f.nome ?? "").trim().endsWith(nomeProvincia)) : undefined)
    : elenco.length === 1 ? elenco[0] : undefined;
  if (!fonte?.id) return vuoto;
  // Le voci abbinate, più le «per ogni cm in più» delle voci a spessore (il cappotto).
  const codici = Object.values(abbinamenti.voci).flatMap((v) => (v.perCm ? [v.codice, v.perCm.codice] : [v.codice]));
  const { data, error } = await sb().from("prezzario_voce").select("codice, descrizione, unita_misura, prezzo")
    .eq("fonte_id", fonte.id).in("codice", codici).limit(codici.length * 2);
  if (error || !data?.length) return vuoto;
  const righe = data as { codice: string; descrizione: string; unita_misura: string | null; prezzo: number | string | null }[];
  // Un codice ripetuto nella fonte non è più un abbinamento sicuro: si scarta.
  const unica = (codice: string) => { const t = righe.filter((x) => x.codice === codice); return t.length === 1 ? t[0] : undefined; };
  const prezzario: FontiPrezzi["prezzario"] = {};
  for (const [tipoChiave, abbinata] of Object.entries(abbinamenti.voci)) {
    const tipo = tipoChiave as TipoLavorazione, v = unica(abbinata.codice);
    if (!v || !(tipo in REGOLE_LAVORAZIONI)) continue;
    const voce: VoceDiPrezzo = { codice: v.codice, descrizione: v.descrizione, unita: unitaDelPrezzario(v.unita_misura), prezzo: Number(v.prezzo) };
    if (abbinata.perCm) {
      // Senza la voce del centimetro in più, quella a spessore non sa quotare: non si propone.
      const cm = unica(abbinata.perCm.codice);
      if (!cm || !unitaCompatibili(unitaDelPrezzario(cm.unita_misura), voce.unita)) continue;
      voce.perCm = { codice: cm.codice, prezzo: Number(cm.prezzo), daCm: abbinata.perCm.daCm };
    }
    prezzario[tipo] = voce;
  }
  const nome = abbinamenti.regione.replace(/^Trentino — /, "");
  return { prezzario, prezzarioNome: `${nome} ${abbinamenti.anno}${nomeProvincia ? ` (${nomeProvincia})` : ""}` };
}

export async function caricaFontiPrezzi(companyId: string, tipi: readonly TipoLavorazione[]): Promise<FontiPrezzi> {
  if (!tipi.length) return FONTI_VUOTE;
  const [listino, prezzario] = await Promise.all([
    listinoAzienda(companyId).catch((): VoceDiPrezzo[] => []),
    prezzarioAbbinato(companyId).catch(() => PREZZARIO_VUOTO),
  ]);
  return { listino, ...prezzario };
}

/** Le fonti per proporre i prezzi; finché caricano (o se non si possono vedere i prezzi) sono vuote. */
export function useFontiPrezzi(companyId: string | null | undefined, tipi: readonly TipoLavorazione[], abilitato = true): { fonti: FontiPrezzi; pronte: boolean } {
  const serve = tipi.length > 0;
  const { data, isFetched } = useQuery({
    queryKey: ["planimetrie", "fonti-prezzi", companyId],
    enabled: !!companyId && abilitato && serve,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => caricaFontiPrezzi(companyId!, tipi),
  });
  return { fonti: data ?? FONTI_VUOTE, pronte: isFetched || !serve };
}
