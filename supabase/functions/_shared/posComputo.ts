import type { VoceComputoPos } from "./posFontiScheda.ts";

export type ComputoPerPos = { id: string; titolo: string; stato: string; voci: VoceComputoPos[] };
type LetturaComputoPos = { fonte: ComputoPerPos | null; avviso?: string; errore?: boolean };

// deno-lint-ignore no-explicit-any
type Db = any;
const stringa = (v: unknown, limite: number) => typeof v === "string" ? v.trim().slice(0, limite) : "";

/** Legge i soli dati tecnici del computo, con precedenza alla versione contrattuale. */
export async function leggiComputoPerPos(db: Db, companyId: string, orderId: string, tutteLeVoci = false): Promise<LetturaComputoPos> {
  const cerca = (stato: string) => db.from("computo_uploads").select("id,titolo,file_name,stato")
    .eq("company_id", companyId).eq("order_id", orderId).eq("stato", stato).in("extraction_status", ["review", "completed"])
    .order(stato === "contrattuale" ? "contrattuale_dal" : "created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).order("id").limit(1).maybeSingle();
  let result = await cerca("contrattuale");
  if (!result.error && !result.data) result = await cerca("verificato");
  if (!result.error && !result.data) result = await cerca("bozza");
  if (result.error) return { fonte: null, avviso: "Archivio computi temporaneamente non leggibile.", errore: true };
  const computo = result.data;
  if (!computo) return { fonte: null, avviso: "Nessun computo con voci leggibili collegato alla commessa." };
  const selezionaVoci = () => db.from("computo_voci_estratte")
    .select("id,numero_ordine,codice_voce,codice_tariffa,codice_prezzario,descrizione_breve,descrizione_estesa,unita_misura,quantita,super_categoria,categoria,capitolo_nome,quadro_voce")
    .eq("company_id", companyId).eq("computo_upload_id", computo.id)
    .order("ordine").order("id");
  const righe: Record<string, unknown>[] = [];
  const dimensionePagina = 1000;
  for (let inizio = 0; ; inizio += dimensionePagina) {
    const query = selezionaVoci();
    const { data, error } = await (tutteLeVoci
      ? query.range(inizio, inizio + dimensionePagina - 1)
      : query.limit(dimensionePagina));
    if (error) return { fonte: null, avviso: "Voci del computo temporaneamente non leggibili.", errore: true };
    righe.push(...(data ?? []));
    if (!tutteLeVoci || data?.length !== dimensionePagina) break;
  }
  const voci: VoceComputoPos[] = righe.flatMap(v => {
    const titolo = stringa(v.descrizione_estesa || v.descrizione_breve, 320);
    const id = stringa(v.id, 64);
    if (!titolo || !id || v.quadro_voce === "somme_a_disposizione" ||
      /^(?:riepilogo economico|quadro economico|totale generale|totale lavori)[\s.:;-]*$/i.test(titolo)) return [];
    return [{
      id, titolo, codice: stringa(v.codice_tariffa || v.codice_prezzario || v.codice_voce || v.numero_ordine, 80),
      capitolo: stringa(v.capitolo_nome || v.categoria || v.super_categoria, 180),
      unita: stringa(v.unita_misura, 24),
      ...(typeof v.quantita === "number" && Number.isFinite(v.quantita) ? { quantita: v.quantita } : {}),
    }];
  });
  if (!voci.length) return { fonte: null, avviso: "Il computo collegato è privo di voci leggibili." };
  return {
    fonte: { id: computo.id, titolo: stringa(computo.titolo || computo.file_name, 200), stato: computo.stato, voci },
    ...(!tutteLeVoci && righe.length === dimensionePagina ? { avviso: "Letto il primo blocco di 1.000 voci del computo. Verifica le altre voci nella commessa." } : {}),
  };
}
