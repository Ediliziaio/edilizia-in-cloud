import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { confrontaNumeri, giorniFra, numeroDocumento } from "../../../shared/acquisti/normalizza";
import { esigiRigaSalvata } from "./salvataggioFattura";

/** Cosa è successo al prezzo della bolla dopo il collegamento (ddt_prezzi_dal_collegamento). */
export interface EsitoPrezzoBolla {
  stato: string;
  motivo?: string;
  righe_prezzate?: number;
}

/**
 * Il riferimento che la fattura fa già a questa bolla, anche scritto diverso:
 * «2026-DT05-0004727» nell'XML e «4727/05» sulla carta sono la stessa bolla
 * (23/11/2026). Prima si cercava solo il testo identico e
 * il collegamento a mano aggiungeva una riga nuova, lasciando quella della
 * fattura «da collegare». Stesso numero ma scritto in modo diverso vale solo
 * con la data entro 10 giorni, come nell'aggancio automatico.
 */
export function riferimentoDellaBolla<T extends { numero_ddt: string; data_ddt: string | null; ddt_ricezione_id: string | null }>(
  riferimenti: T[],
  numero: string,
  data: string | null,
): T | null {
  const liberi = riferimenti.filter((r) => !r.ddt_ricezione_id);
  const identico = liberi.find((r) => r.numero_ddt === numero && (r.data_ddt ?? null) === data);
  if (identico) return identico;
  const bolla = numeroDocumento(numero);
  const compatibili = liberi.filter((r) => {
    const esito = confrontaNumeri(numeroDocumento(r.numero_ddt), bolla);
    if (esito === "diverso") return false;
    const giorni = giorniFra(r.data_ddt, data);
    return esito === "uguale" ? giorni == null || Math.abs(giorni) <= 10 : giorni != null && Math.abs(giorni) <= 10;
  });
  if (compatibili.length === 1) return compatibili[0];
  const stessoGiorno = compatibili.filter((r) => r.data_ddt && r.data_ddt === data);
  return stessoGiorno.length === 1 ? stessoGiorno[0] : null;
}

/** Una riga per il messaggio dopo il collegamento: il prezzo è arrivato sulla bolla, o perché no. */
export function messaggioPrezzoBolla(e: EsitoPrezzoBolla | null | undefined): string | null {
  if (!e) return null;
  if ((e.righe_prezzate ?? 0) > 0)
    return e.righe_prezzate === 1 ? "Prezzo della bolla aggiornato dalla fattura." : `${e.righe_prezzate} prezzi della bolla aggiornati dalla fattura.`;
  if (e.stato === "confermata" || e.stato === "aggiornata") return "I prezzi della bolla erano già quelli della fattura.";
  const perche: Record<string, string> = {
    articolo: "la voce della fattura non corrisponde con certezza a una riga della bolla",
    quantita_prezzo: "quantità o unità di misura diverse fra bolla e fattura",
    consegna: "la merce della bolla non è ancora consegnata a una commessa o al magazzino",
    fattura_concorrente: "la bolla è già valorizzata da un'altra fattura",
    ripartizione_manuale: "le quantità sono già state ripartite a mano",
    xml: "la fattura non ha l'XML da cui leggere i prezzi",
  };
  const motivo = e.motivo ? perche[e.motivo] : null;
  return motivo ? `Prezzo non aggiornato: ${motivo}. Puoi metterlo da «Confronta una fattura».` : null;
}

export interface DdtCollegabile {
  id: string;
  numero_ddt: string | null;
  data_ricezione: string;
  supplier_id: string | null;
  suppliers: { name: string } | null;
  destinazione: string | null;
  orders?: { order_code: string } | null;
}

export async function salvaCollegamentoDdt({
  companyId,
  fatturaId,
  ddtId,
  numero,
  data,
}: {
  companyId: string;
  fatturaId: string;
  ddtId?: string;
  numero: string;
  data: string | null;
}) {
  // Leggere la riga dopo la scrittura è essenziale: una modifica filtrata da RLS non è un successo.
  let campi = {
    numero_ddt: numero.trim(),
    data_ddt: data,
    ddt_ricezione_id: ddtId ?? null,
  };
  if (ddtId) {
    const d = esigiRigaSalvata(
      await db
        .from("ddt_ricezione")
        .select("id,numero_ddt,data_ricezione,supplier_id")
        .eq("company_id", companyId)
        .eq("id", ddtId)
        .maybeSingle(),
    ) as DdtCollegabile;
    const f = esigiRigaSalvata(
      await db
        .from("fatture_ricevute")
        .select("id,fornitore_id")
        .eq("company_id", companyId)
        .eq("id", fatturaId)
        .maybeSingle(),
    ) as { fornitore_id: string | null };
    if (f.fornitore_id && d.supplier_id && f.fornitore_id !== d.supplier_id)
      throw new Error(
        "Il DDT è di un altro fornitore. Controlla le anagrafiche prima di collegarlo.",
      );
    campi = {
      numero_ddt: d.numero_ddt?.trim() || `DDT ${d.id.slice(0, 8)}`,
      data_ddt: d.data_ricezione?.slice(0, 10) || null,
      ddt_ricezione_id: d.id,
    };
  }
  if (!campi.numero_ddt) throw new Error("Inserisci il numero DDT");
  // Un riferimento XML già presente viene completato con il documento reale, senza duplicarlo.
  const { data: esistenti, error } = await db
    .from("fattura_ddt")
    .select("id,numero_ddt,data_ddt,ddt_ricezione_id")
    .eq("company_id", companyId)
    .eq("fattura_ricevuta_id", fatturaId);
  if (error) throw error;
  const stessi = (esistenti ?? []) as Array<{
    id: string;
    numero_ddt: string;
    data_ddt: string | null;
    ddt_ricezione_id: string | null;
  }>;
  if (ddtId && stessi.some((d) => d.ddt_ricezione_id === ddtId))
    throw new Error("Questo DDT è già collegato alla fattura.");
  const occupato = stessi.find(
    (d) =>
      d.ddt_ricezione_id &&
      d.numero_ddt === campi.numero_ddt &&
      (d.data_ddt ?? null) === campi.data_ddt,
  );
  if (occupato)
    throw new Error(
      "Esiste già un documento con questo riferimento. Controlla il DDT collegato.",
    );
  // Con una bolla vera si cerca il riferimento anche scritto diverso; con il solo numero
  // scritto a mano conta solo quello identico, che non va riscritto.
  const riferimento = ddtId
    ? riferimentoDellaBolla(stessi, campi.numero_ddt, campi.data_ddt)
    : stessi.find((d) => !d.ddt_ricezione_id && d.numero_ddt === campi.numero_ddt && (d.data_ddt ?? null) === campi.data_ddt) ?? null;
  // Il riferimento della fattura resta com'è scritto in fattura (numero e data): le righe
  // della fattura lo citano così. Si aggiunge solo la bolla.
  const salvata = riferimento
    ? esigiRigaSalvata(
        await db
          .from("fattura_ddt")
          .update({ ddt_ricezione_id: campi.ddt_ricezione_id })
          .eq("id", riferimento.id)
          .eq("company_id", companyId)
          .eq("fattura_ricevuta_id", fatturaId)
          .is("ddt_ricezione_id", null)
          .select("id")
          .maybeSingle(),
      )
    : esigiRigaSalvata(
        await db
          .from("fattura_ddt")
          .insert({
            ...campi,
            company_id: companyId,
            fattura_ricevuta_id: fatturaId,
            origine: "manuale",
          })
          .select("id")
          .single(),
      );
  if (!ddtId) return { ...(salvata as { id: string }), prezzo: null };
  // Collegare è la conferma: se la voce della fattura è certa, il suo prezzo va sulla bolla.
  // Un errore qui non annulla il collegamento, che è già salvato.
  const { data: prezzo, error: errPrezzo } = await db.rpc("ddt_prezzi_dal_collegamento", { p_fattura: fatturaId, p_ddt: ddtId });
  return {
    ...(salvata as { id: string }),
    prezzo: errPrezzo ? null : ((prezzo ?? null) as EsitoPrezzoBolla | null),
  };
}
