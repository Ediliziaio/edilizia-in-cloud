import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { normalizzaQuadro } from "@/lib/orders/quadroPagamenti";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type {
  DocumentoConsegna,
  FatturaFornitura,
  LegameFatturaDdt,
  OrdineFornitura,
  RigaConsegnata,
  RigaOrdinata,
} from "@/lib/orders/generali/controlloForniture";
import { leggiCostiOperazione } from "@/lib/orders/generali/costiOperazione";

// Newer native tables are not all represented in the generated client yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const unici = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

export function useControlloFornitureGenerale(r: RiepilogoGenerale) {
  const companyId = useEffectiveCompanyId();
  const ids = [r.generale.id, ...r.figlie.map((f) => f.id)];
  return useQuery({
    queryKey: ["generale-controllo-forniture", companyId, r.generale.id, ids.join(","), "ddt-diretti"],
    enabled: !!companyId && r.permessi.costi,
    staleTime: 30_000,
    queryFn: async () => {
      // Stable pagination and bounded IN lists, always restricted to the active legal entity.
      async function leggi<T>(table: string, fields: string, column: string, valori: string[]): Promise<T[]> {
        const rows: T[] = [];
        for (let i = 0; i < valori.length; i += 40)
          rows.push(
            ...(await allPaymentRows<T>((a, b) =>
              db
                .from(table)
                .select(fields)
                .eq("company_id", companyId)
                .in(column, valori.slice(i, i + 40))
                .order("id")
                .range(a, b),
            )),
          );
        return rows;
      }
      const [ordini, diretti, costi] = await Promise.all([
        leggi<OrdineFornitura>(
          "purchase_orders",
          "id, order_id, oda_number, status, supplier_id",
          "order_id",
          ids,
        ),
        leggi<DocumentoConsegna>(
          "ddt_ricezione",
          "id, purchase_order_id, order_id, numero_ddt, stato",
          "order_id",
          ids,
        ),
        leggiCostiOperazione(companyId!, ids),
      ]);
      const attivi = ordini.filter((o) =>
        ["inviato", "confermato", "parziale", "ricevuto"].includes(o.status),
      );
      const odaIds = attivi.map((o) => o.id);
      const campiFattura =
        "id, purchase_order_id, company_cost_id, fornitore_id, numero_fattura, righe, tipo_documento, imponibile_totale, stato, updated_at";
      const [righe, daOrdine, fattureOrdine, fattureCosto, quote] = await Promise.all([
        leggi<RigaOrdinata>(
          "purchase_order_items",
          "id, purchase_order_id, description, quantity, quantity_received, unit_price, discount_percent, line_total, price_pending",
          "purchase_order_id",
          odaIds,
        ),
        leggi<DocumentoConsegna>(
          "ddt_ricezione",
          "id, purchase_order_id, order_id, numero_ddt, stato",
          "purchase_order_id",
          odaIds,
        ),
        leggi<FatturaFornitura>("fatture_ricevute", campiFattura, "purchase_order_id", odaIds),
        leggi<FatturaFornitura>(
          "fatture_ricevute",
          campiFattura,
          "company_cost_id",
          costi.map((c) => c.id),
        ),
        leggi<{ id: string; fattura_id: string }>(
          "fattura_ricevuta_ordini",
          "id, fattura_id",
          "purchase_order_id",
          odaIds,
        ),
      ]);
      const bolle = unici([...diretti, ...daOrdine]).filter(
        (d) => !["annullato", "rifiutato"].includes(d.stato),
      );
      const [consegne, fattureQuote, legamiDdt] = await Promise.all([
        leggi<RigaConsegnata>(
          "ddt_righe",
          "id, ddt_ricezione_id, purchase_order_item_id, quantita, prezzo_unitario, importo, descrizione, unita_misura",
          "ddt_ricezione_id",
          bolle.map((d) => d.id),
        ),
        leggi<FatturaFornitura>("fatture_ricevute", campiFattura, "id", [
          ...new Set(quote.map((q) => q.fattura_id)),
        ]),
        leggi<LegameFatturaDdt>(
          "fattura_ddt",
          "id, fattura_ricevuta_id, ddt_ricezione_id",
          "ddt_ricezione_id",
          bolle.map((d) => d.id),
        ),
      ]);
      const fattureDdt = await leggi<FatturaFornitura>("fatture_ricevute", campiFattura, "id", [
        ...new Set(legamiDdt.map((d) => d.fattura_ricevuta_id)),
      ]);
      const fatture = unici([...fattureOrdine, ...fattureCosto, ...fattureQuote, ...fattureDdt]);
      // Anche le altre bolle della stessa fattura, eventualmente fuori dall'operazione:
      // senza questa lettura una fattura cumulativa sembrerebbe tutta di ciascun DDT.
      const tuttiLegamiDdt = await leggi<LegameFatturaDdt>(
        "fattura_ddt",
        "id, fattura_ricevuta_id, ddt_ricezione_id",
        "fattura_ricevuta_id",
        fatture.map((f) => f.id),
      );
      const quadri = [];
      // Avoid bursting hundreds of concurrent RPCs when a development contains many units.
      for (let i = 0; i < ids.length; i += 5)
        quadri.push(
          ...(await Promise.all(
            ids.slice(i, i + 5).map(async (id) => {
              const { data, error } = await db.rpc("commessa_quadro_pagamenti", { p_order_id: id });
              if (error) throw error;
              const quadro = normalizzaQuadro(data);
              if (!quadro) throw new Error("Quadro pagamenti non disponibile.");
              return { orderId: id, quadro };
            }),
          )),
        );
      return {
        ordini: attivi,
        righe,
        bolle,
        consegne,
        fatture,
        fattureConOrdine: fatture.filter(
          (f) =>
            f.purchase_order_id ||
            quote.some((q) => q.fattura_id === f.id) ||
            (Array.isArray(f.righe) && f.righe.some((r) => r.purchase_order_item_id)),
        ),
        legamiDdt: unici([...legamiDdt, ...tuttiLegamiDdt]),
        quadri,
      };
    },
  });
}

/** Save only the documentary link, using optimistic concurrency to preserve other invoice edits. */
export function useCollegaRigaFornitura(generaleId: string) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async ({
      fattura,
      indice,
      rigaId,
    }: {
      fattura: FatturaFornitura;
      indice: number;
      rigaId: string | null;
    }) => {
      if (!companyId || !fattura.updated_at) throw new Error("Ricarica la fattura prima di collegarla.");
      if (rigaId) {
        const { data: riga, error } = await db
          .from("purchase_order_items")
          .select("purchase_order_id,purchase_orders!inner(supplier_id)")
          .eq("company_id", companyId)
          .eq("id", rigaId)
          .single();
        if (error || !riga) throw new Error("La riga d'ordine non è disponibile per questa società.");
        if (fattura.purchase_order_id && fattura.purchase_order_id !== riga.purchase_order_id)
          throw new Error("La riga appartiene a un altro ordine d'acquisto.");
        if (fattura.fornitore_id && fattura.fornitore_id !== riga.purchase_orders?.supplier_id)
          throw new Error("Ordine e fattura devono appartenere allo stesso fornitore.");
        if (!fattura.fornitore_id && !fattura.purchase_order_id)
          throw new Error("Identifica prima il fornitore nella fattura ricevuta.");
      }
      const righe = fattura.righe.map((r, i) =>
        i === indice ? { ...r, purchase_order_item_id: rigaId } : r,
      );
      const { error } = await db
        .from("fatture_ricevute")
        .update({ righe, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", fattura.id)
        .eq("updated_at", fattura.updated_at)
        .select("id")
        .single();
      if (error)
        throw new Error(
          "Collegamento non salvato. La fattura potrebbe essere cambiata: aggiorna e riprova.",
          { cause: error },
        );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["generale-controllo-forniture", companyId, generaleId] });
      void qc.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
      void qc.invalidateQueries({ queryKey: ["fattura-ricevuta"] });
    },
  });
}
