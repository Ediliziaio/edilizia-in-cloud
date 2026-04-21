/**
 * useListinoSuggerito — lookup listino manutenzione per un ticket/intervento.
 *
 * Scope: dopo la migration 20260814000001 esistono `tipi_impianto`,
 * `tipi_intervento` e `listino_prezzi` con la RPC `get_prezzo_intervento`.
 * Prima del presente hook la feature era ORFANA: nessun file sorgente
 * invocava la RPC, quindi il listino configurato in
 * /azienda/impostazioni/listino-manutenzione non influenzava alcun flusso.
 *
 * Questa implementazione è **by-name matching** e **degrade silenzioso**:
 *  1. Se il ticket ha `impianto_id`, carica `impianti_cliente.tipo_impianto`
 *     (campo TEXT del cliente), e lo matcha contro `tipi_impianto.nome`
 *     (case-insensitive, trim). Se c'è match → `tipo_impianto_id`.
 *  2. Il ticket ha `category` (TEXT libero): match contro
 *     `tipi_intervento.nome`. Se c'è match → `tipo_intervento_id`.
 *  3. Con entrambi gli id chiama la RPC `get_prezzo_intervento` passando
 *     anche `p_cliente_id` per applicare eventuali override cliente.
 *  4. Qualunque miss → `null` (UI non mostra nulla).
 *
 * Trade-off: **non-deterministico** (un rename di un tipo rompe il match)
 * ma non richiede migration del ticket/rapportino, quindi è backward-safe.
 * Upgrade path futuro: aggiungere `tickets.tipo_impianto_id` +
 * `tickets.tipo_intervento_id` come FK e usarli direttamente.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ListinoSuggerito {
  /** Prezzo finale (può essere override cliente). */
  prezzo: number;
  /** Prezzo base di catalogo (non override). */
  prezzo_base: number;
  /** Aliquota IVA %. */
  iva: number;
  /** Unità di misura. */
  unita: string;
  /** Note admin (es. "valido solo fuori orario"). */
  note: string | null;
  /** `true` se il prezzo finale proviene da un override cliente. */
  da_override: boolean;
  /** Nome del tipo impianto matchato (debug/UI). */
  impiantoNome: string;
  /** Nome del tipo intervento matchato (debug/UI). */
  interventoNome: string;
}

interface Params {
  companyId: string | null | undefined;
  /** Ticket identifier (per la chiave di cache). */
  ticketId: string | null | undefined;
  /** FK a impianti_cliente. */
  impiantoId: string | null | undefined;
  /** Category libera del ticket (mappata a tipi_intervento.nome). */
  category: string | null | undefined;
  /** Cliente del ticket: abilita override. */
  clienteId: string | null | undefined;
}

/**
 * Normalizza un nome per il matching case-insensitive.
 * Non usiamo ILIKE server-side per evitare costosi tablescan; facciamo
 * client-side su dataset piccoli (tipicamente < 100 tipi per company).
 */
function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function useListinoSuggerito(params: Params) {
  const { companyId, ticketId, impiantoId, category, clienteId } = params;

  return useQuery<ListinoSuggerito | null>({
    queryKey: [
      "listino-suggerito",
      companyId ?? null,
      ticketId ?? null,
      impiantoId ?? null,
      category ?? null,
      clienteId ?? null,
    ],
    enabled: !!companyId && (!!impiantoId || !!category),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ListinoSuggerito | null> => {
      if (!companyId) return null;

      // 1. Risolvi nome impianto dal ticket (se presente)
      let tipoImpiantoText: string | null = null;
      if (impiantoId) {
        const { data: impCliente } = await (supabase as any)
          .from("impianti_cliente")
          .select("tipo_impianto")
          .eq("id", impiantoId)
          .eq("company_id", companyId)
          .maybeSingle();
        tipoImpiantoText = (impCliente?.tipo_impianto as string | null) ?? null;
      }

      // Serve almeno una pista (impianto testo o category) per fare match
      if (!tipoImpiantoText && !category) return null;

      // 2. Match tipi_impianto per nome
      let tipoImpiantoId: string | null = null;
      let tipoImpiantoNome = "";
      if (tipoImpiantoText) {
        const { data: tipi } = await (supabase as any)
          .from("tipi_impianto")
          .select("id, nome")
          .eq("company_id", companyId)
          .eq("attivo", true);
        const needle = normalizeName(tipoImpiantoText);
        const match = (tipi ?? []).find(
          (t: { id: string; nome: string }) => normalizeName(t.nome) === needle,
        );
        if (match) {
          tipoImpiantoId = match.id;
          tipoImpiantoNome = match.nome;
        }
      }

      if (!tipoImpiantoId) return null;

      // 3. Match tipi_intervento dalla category del ticket
      //    Se category è vuota/non combacia, proviamo a mostrare il listino
      //    comunque scegliendo una voce "manutenzione_ordinaria" come default.
      let tipoInterventoId: string | null = null;
      let tipoInterventoNome = "";
      const { data: interventi } = await (supabase as any)
        .from("tipi_intervento")
        .select("id, nome, categoria")
        .eq("company_id", companyId)
        .eq("attivo", true);

      const interventiList: Array<{ id: string; nome: string; categoria: string | null }> =
        interventi ?? [];

      if (category) {
        const needle = normalizeName(category);
        const match = interventiList.find((t) => normalizeName(t.nome) === needle);
        if (match) {
          tipoInterventoId = match.id;
          tipoInterventoNome = match.nome;
        }
      }

      // Fallback: prima voce "manutenzione_ordinaria" disponibile
      if (!tipoInterventoId) {
        const fallback = interventiList.find(
          (t) => t.categoria === "manutenzione_ordinaria",
        );
        if (fallback) {
          tipoInterventoId = fallback.id;
          tipoInterventoNome = fallback.nome;
        }
      }

      if (!tipoInterventoId) return null;

      // 4. Chiama la RPC
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
        "get_prezzo_intervento",
        {
          p_company_id: companyId,
          p_tipo_impianto_id: tipoImpiantoId,
          p_tipo_intervento_id: tipoInterventoId,
          p_cliente_id: clienteId ?? null,
        },
      );

      if (rpcErr || !rpcData) return null;

      // La RPC ritorna un JSON object
      const row = rpcData as {
        prezzo: number;
        prezzo_base: number;
        iva: number | null;
        unita: string | null;
        note: string | null;
        da_override: boolean;
      };

      return {
        prezzo: Number(row.prezzo),
        prezzo_base: Number(row.prezzo_base),
        iva: Number(row.iva ?? 22),
        unita: row.unita ?? "intervento",
        note: row.note,
        da_override: !!row.da_override,
        impiantoNome: tipoImpiantoNome,
        interventoNome: tipoInterventoNome,
      };
    },
  });
}
