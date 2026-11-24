/**
 * «Su documento» nel popup «Nuovo ordine d'acquisto» (24/11/2026): si carica il modulo del
 * fornitore o l'ordine firmato, `oda-leggi-documento` lo trascrive e qui la lettura diventa
 * una proposta per il popup — fornitore dalla rubrica, righe abbinate agli articoli della
 * commessa ancora da comprare, il resto come righe libere. Niente si salva da solo: chi
 * crea la bozza vede tutto nei campi e corregge.
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { preparaDocumento, mimeDocumento } from "@/lib/ddt/preparaDocumento";
import { abbinaFornitore, type AbbinamentoFornitore, type FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";
import { chiaveVoce, rigaLibera, unitaNormalizzata, type RigaNuovoOda } from "./nuovoOdaCommessa";
import type { OrdineFornitoreLetto } from "../../../supabase/functions/_shared/estrazioneOrdineFornitore";

export type { OrdineFornitoreLetto };

function inBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("File non leggibile"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/** Il file al lettore. Lancia con un messaggio da mostrare se la lettura non riesce. */
export async function leggiDocumentoOda(file: File, companyId: string): Promise<OrdineFornitoreLetto> {
  const { lettura } = await preparaDocumento(file);
  const { data, error } = await supabase.functions.invoke("oda-leggi-documento", {
    body: { company_id: companyId, document_base64: await inBase64(lettura), file_name: file.name, mime_type: mimeDocumento(lettura) },
  });
  if (error) throw new Error(await edgeErrorMessage(error, "Lettura non riuscita"));
  if (!data?.success || !data.ordine) throw new Error(data?.error ?? "Lettura non riuscita");
  return data.ordine as OrdineFornitoreLetto;
}

export interface PropostaDaDocumento {
  fornitore: AbbinamentoFornitore | null;
  /** Il fornitore come scritto sul documento, per dirlo quando non è in rubrica. */
  fornitoreLetto: string | null;
  consegna: string | null;
  riferimento: string | null;
  /** Per gli articoli della commessa: spunta, quantità e prezzo dal documento. */
  modificheArticoli: Record<string, Partial<RigaNuovoOda>>;
  /** Le righe del documento senza un articolo della commessa corrispondente (chiave da assegnare). */
  libere: Omit<RigaNuovoOda, "key">[];
  abbinate: number;
  avvisi: string[];
}

const parole = (s: string) => chiaveVoce(s).replace(/[^a-z0-9àèéìòù ]/g, " ").split(/\s+/).filter((p) => p.length > 2);

/** L'articolo della commessa che corrisponde a una riga letta: stesso nome, o uno contiene l'altro, e uno solo. */
function articoloPer(descrizione: string, codice: string | null, liberi: RigaNuovoOda[]): RigaNuovoOda | null {
  const k = chiaveVoce(descrizione);
  const uguali = liberi.filter((a) => chiaveVoce(a.description) === k || (!!codice && chiaveVoce(a.description) === chiaveVoce(codice)));
  if (uguali.length === 1) return uguali[0];
  if (uguali.length > 1) return null;
  if (k.length < 6) return null;
  const contenuti = liberi.filter((a) => {
    const ka = chiaveVoce(a.description);
    return ka.length >= 6 && (k.includes(ka) || ka.includes(k));
  });
  if (contenuti.length === 1) return contenuti[0];
  // Tutte le parole significative dell'articolo stanno nella riga letta (l'ordine scrive di più).
  const perParole = liberi.filter((a) => {
    const pa = parole(a.description);
    const pr = new Set(parole(descrizione));
    return pa.length >= 2 && pa.every((p) => pr.has(p));
  });
  return perParole.length === 1 ? perParole[0] : null;
}

export function propostaDaLettura(
  letto: OrdineFornitoreLetto,
  rubrica: FornitoreInRubrica[],
  articoli: RigaNuovoOda[],
): PropostaDaDocumento {
  const fornitore = abbinaFornitore(
    { fornitoreNome: letto.fornitore.nome, fornitorePiva: letto.fornitore.partita_iva, fornitoreCodiceFiscale: letto.fornitore.codice_fiscale },
    rubrica,
  );
  const disponibili = [...articoli];
  const modificheArticoli: Record<string, Partial<RigaNuovoOda>> = {};
  const libere: Omit<RigaNuovoOda, "key">[] = [];
  const avvisi = [...letto.avvisi];
  for (const r of letto.righe) {
    const art = articoloPer(r.descrizione, r.codice, disponibili);
    const prezzo = r.prezzo_unitario;
    const comune: Partial<RigaNuovoOda> = {
      ...(r.quantita ? { quantity: r.quantita } : {}),
      ...(prezzo !== null ? { unit_price: prezzo, price_pending: false } : {}),
      ...(r.iva !== null ? { vat_rate: r.iva } : {}),
    };
    if (art) {
      disponibili.splice(disponibili.indexOf(art), 1);
      modificheArticoli[art.key] = { ...comune, scelta: true };
      continue;
    }
    const { key: _senzaChiave, ...base } = rigaLibera("");
    libere.push({
      ...base,
      description: r.codice && !r.descrizione.includes(r.codice) ? `${r.descrizione} (${r.codice})` : r.descrizione,
      unit_of_measure: r.unita ? unitaNormalizzata(r.unita) : base.unit_of_measure,
      ...comune,
    });
    if (!r.quantita) avvisi.push(`«${r.descrizione}»: quantità non letta, controllala.`);
  }
  // Il documento è l'ordine: gli articoli che non vi compaiono restano in elenco, non spuntati.
  for (const a of disponibili) modificheArticoli[a.key] = { scelta: false };
  if (letto.totale !== null && letto.imponibile === null && letto.righe.some((r) => r.prezzo_unitario === null)) {
    avvisi.push("Alcuni prezzi non si leggono: confrontali col totale del documento.");
  }
  return {
    fornitore,
    fornitoreLetto: [letto.fornitore.nome, letto.fornitore.partita_iva ? `P.IVA ${letto.fornitore.partita_iva}` : null].filter(Boolean).join(" · ") || null,
    consegna: letto.consegna,
    riferimento: letto.numero ? (letto.data ? `${letto.numero} del ${letto.data.split("-").reverse().join("/")}` : letto.numero) : null,
    modificheArticoli,
    libere,
    abbinate: Object.values(modificheArticoli).filter((m) => m.scelta).length,
    avvisi,
  };
}
