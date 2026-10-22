/**
 * La fattura di un certificato di pagamento (lavori pubblici), già compilata:
 * cliente = la stazione appaltante, una riga «lavori del SAL n. X» per
 * l'imponibile del certificato (al netto di ritenuta e anticipazione), IVA
 * con la scissione dei pagamenti se il contratto la prevede, CIG e CUP nei
 * dati della PA. Solo dati: la fattura la crea l'editor (documento_crea).
 */
import { calcolaRiga } from "@/lib/fatturazione/calcoli";
import type { ClienteSnapshot, RigaDocumento, TipoDocumento } from "@/types/fatturazione";

export interface AnagraficaFatturazione {
  id: string;
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  codice_sdi?: string | null;
  pec?: string | null;
  indirizzo_via?: string | null;
  indirizzo_cap?: string | null;
  indirizzo_comune?: string | null;
  indirizzo_provincia?: string | null;
  indirizzo_nazione?: string | null;
  tipo_cliente?: string | null;
  cig?: string | null;
  cup?: string | null;
  metodo_pagamento_default?: string | null;
}

export interface DatiFatturaCertificato {
  certificato: { numero: number; data: string; imponibile: number; aliquota_iva: number; split_payment: boolean };
  sal: { numero: number; lavori_a_tutto: string };
  computo: { oggetto_lavori?: string | null; titolo?: string | null; stazione_appaltante?: string | null; cig?: string | null; cup?: string | null };
  orderId: string;
  orderCode?: string | null;
  anagrafica?: AnagraficaFatturazione | null;
}

export interface BozzaFattura {
  tipo: TipoDocumento;
  righe: RigaDocumento[];
  esigibilita_iva: "I" | "S";
  ordine_id: string;
  note_documento: string;
  cig?: string;
  cup?: string;
  anagrafica_id?: string;
  cliente_snapshot?: ClienteSnapshot;
  metodo_pagamento_codice?: string;
}

const dataIt = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT");
const pulito = (s: string | null | undefined) => (s ?? "").trim() || undefined;

export function bozzaFatturaCertificato(d: DatiFatturaCertificato): BozzaFattura {
  const { certificato: c, sal, computo, anagrafica: a } = d;
  const lavori = pulito(computo.oggetto_lavori) ?? pulito(computo.titolo);
  const riga = calcolaRiga({
    id: crypto.randomUUID(),
    numero_linea: 1,
    descrizione: `Lavori di cui al SAL n. ${sal.numero} a tutto il ${dataIt(sal.lavori_a_tutto)} (certificato di pagamento n. ${c.numero} del ${dataIt(c.data)})${lavori ? ` — ${lavori}` : ""}`,
    quantita: 1,
    unita_misura: "a corpo",
    prezzo_unitario: c.imponibile,
    aliquota_iva: String(c.aliquota_iva),
    imponibile: 0,
    imposta: 0,
    totale_riga: 0,
  });
  const cig = pulito(computo.cig) ?? pulito(a?.cig);
  const cup = pulito(computo.cup) ?? pulito(a?.cup);
  const tipoCliente = (a?.tipo_cliente as ClienteSnapshot["tipo_cliente"] | undefined) ?? (computo.stazione_appaltante ? "PA" : undefined);
  const snapshot: ClienteSnapshot | undefined = a
    ? {
        ragione_sociale: pulito(a.ragione_sociale) ?? pulito(computo.stazione_appaltante) ?? "",
        nome: pulito(a.nome), cognome: pulito(a.cognome), partita_iva: pulito(a.partita_iva), codice_fiscale: pulito(a.codice_fiscale),
        codice_sdi: pulito(a.codice_sdi), pec: pulito(a.pec), indirizzo_via: pulito(a.indirizzo_via), indirizzo_cap: pulito(a.indirizzo_cap),
        indirizzo_comune: pulito(a.indirizzo_comune), indirizzo_provincia: pulito(a.indirizzo_provincia),
        indirizzo_nazione: pulito(a.indirizzo_nazione) ?? "IT", tipo_cliente: tipoCliente ?? "B2B", cig, cup,
      }
    : pulito(computo.stazione_appaltante)
      // Senza anagrafica: il nome della stazione appaltante dal computo; il resto si completa nell'editor.
      ? { ragione_sociale: computo.stazione_appaltante!.trim(), tipo_cliente: "PA", indirizzo_nazione: "IT", cig, cup }
      : undefined;
  const pa = c.split_payment || snapshot?.tipo_cliente === "PA";
  return {
    tipo: pa ? "fattura_pa" : "fattura",
    righe: [riga],
    esigibilita_iva: c.split_payment ? "S" : "I",
    ordine_id: d.orderId,
    note_documento: [
      d.orderCode ? `Rif. commessa ${d.orderCode}` : null,
      `Certificato di pagamento n. ${c.numero} del ${dataIt(c.data)}, SAL n. ${sal.numero}`,
      c.split_payment ? "Scissione dei pagamenti (art. 17-ter DPR 633/1972)" : null,
    ].filter(Boolean).join(" — "),
    ...(cig && { cig }),
    ...(cup && { cup }),
    ...(a?.id && { anagrafica_id: a.id }),
    ...(snapshot && { cliente_snapshot: snapshot }),
    ...(a?.metodo_pagamento_default && { metodo_pagamento_codice: a.metodo_pagamento_default }),
  };
}
