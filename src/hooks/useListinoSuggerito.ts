/**
 * useListinoSuggerito — lookup listino manutenzione per un ticket/intervento.
 *
 * Scope: dopo la migration 20260814000001 esistono `tipi_impianto`,
 * `tipi_intervento` e `listino_prezzi` con la RPC `get_prezzo_intervento`.
 * Prima del presente hook la feature era ORFANA: nessun file sorgente
 * invocava la RPC, quindi il listino configurato in
 * /azienda/impostazioni/listino-manutenzione non influenzava alcun flusso.
 *
 * Strategia a 2 livelli (priorità deterministic > fuzzy):
 *
 *  A. **FK diretti dal ticket** (dopo migration 20261001000300).
 *     Se `tickets.tipo_impianto_id` e/o `tickets.tipo_intervento_id` sono
 *     popolati (dall'utente al save ticket, o dal backfill della migration),
 *     li usiamo direttamente: è **deterministic** e resiste a rename.
 *
 *  B. **By-name matching** (legacy fallback).
 *     Quando gli FK sono nulli ricadiamo sul matching legacy:
 *       1. `impianti_cliente.tipo_impianto` (TEXT cliente) → `tipi_impianto.nome`
 *       2. `tickets.category` (TEXT libero) → `tipi_intervento.nome`
 *     Entrambi case-insensitive. Match miss → fallback a
 *     `manutenzione_ordinaria` sul solo intervento.
 *
 *  Qualunque miss finale → `null` (UI non mostra nulla, degrade silenzioso).
 *
 * Trade-off legacy: **non-deterministico** (un rename di un tipo rompe il
 * match) ma ci lascia backward-safe sui ticket pre-FK. Il caller può anche
 * passare `tipoImpiantoIdOverride`/`tipoInterventoIdOverride` per bypassare
 * completamente la resolve (es. form di rapportino dove l'utente ha già
 * scelto un tipo dall'autocomplete).
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
  /** Ticket identifier (per la chiave di cache e per leggere gli FK diretti). */
  ticketId: string | null | undefined;
  /** FK a impianti_cliente. */
  impiantoId: string | null | undefined;
  /** Category libera del ticket (mappata a tipi_intervento.nome). */
  category: string | null | undefined;
  /** Cliente del ticket: abilita override. */
  clienteId: string | null | undefined;
  /**
   * Override FK: se il caller conosce già `tipo_impianto_id` (es. dall'autocomplete
   * in un form di rapportino), salta la resolve — modalità deterministic pura.
   */
  tipoImpiantoIdOverride?: string | null;
  /** Analogo override per `tipo_intervento_id`. */
  tipoInterventoIdOverride?: string | null;
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
  const {
    companyId,
    ticketId,
    impiantoId,
    category,
    clienteId,
    tipoImpiantoIdOverride,
    tipoInterventoIdOverride,
  } = params;

  const hasOverride = !!tipoImpiantoIdOverride || !!tipoInterventoIdOverride;

  return useQuery<ListinoSuggerito | null>({
    queryKey: [
      "listino-suggerito",
      companyId ?? null,
      ticketId ?? null,
      impiantoId ?? null,
      category ?? null,
      clienteId ?? null,
      tipoImpiantoIdOverride ?? null,
      tipoInterventoIdOverride ?? null,
    ],
    enabled: !!companyId && (hasOverride || !!impiantoId || !!category || !!ticketId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ListinoSuggerito | null> => {
      if (!companyId) return null;

      // 0. PATH A — Override espliciti dal caller (massima priorità: deterministic)
      let tipoImpiantoId: string | null = tipoImpiantoIdOverride ?? null;
      let tipoInterventoId: string | null = tipoInterventoIdOverride ?? null;
      let tipoImpiantoNome = "";
      let tipoInterventoNome = "";

      // 1. PATH B — FK diretti sul ticket (migration 20261001000300).
      //    Se il ticket ha `tipo_impianto_id`/`tipo_intervento_id` popolati,
      //    saltiamo completamente il by-name matching per quel lato.
      let fkTipoImpiantoId: string | null = null;
      let fkTipoInterventoId: string | null = null;
      if (ticketId && (!tipoImpiantoId || !tipoInterventoId)) {
        const { data: tk } = await (supabase as any)
          .from("tickets")
          .select("tipo_impianto_id, tipo_intervento_id")
          .eq("id", ticketId)
          .eq("company_id", companyId)
          .maybeSingle();
        fkTipoImpiantoId = (tk?.tipo_impianto_id as string | null) ?? null;
        fkTipoInterventoId = (tk?.tipo_intervento_id as string | null) ?? null;
        if (!tipoImpiantoId && fkTipoImpiantoId) tipoImpiantoId = fkTipoImpiantoId;
        if (!tipoInterventoId && fkTipoInterventoId) tipoInterventoId = fkTipoInterventoId;
      }

      // 2. PATH C — by-name fallback per l'IMPIANTO (solo se ancora non risolto).
      if (!tipoImpiantoId) {
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
      }

      // Senza tipo_impianto non possiamo chiamare la RPC (vincolo della function SQL).
      if (!tipoImpiantoId) return null;

      // 3. PATH D — by-name / default fallback per l'INTERVENTO
      //    Se già risolto via override/FK tiriamo dritto; se no proviamo category
      //    e poi la "manutenzione_ordinaria" come default educato.
      if (!tipoInterventoId) {
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
      }

      if (!tipoInterventoId) return null;

      // 4. Popola i nomi (per la UI di debug) se li abbiamo saltati via FK/override.
      //    Facciamo una singola query batched per i due id.
      if (!tipoImpiantoNome || !tipoInterventoNome) {
        const [{ data: imp }, { data: intv }] = await Promise.all([
          !tipoImpiantoNome
            ? (supabase as any)
                .from("tipi_impianto")
                .select("nome")
                .eq("id", tipoImpiantoId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          !tipoInterventoNome
            ? (supabase as any)
                .from("tipi_intervento")
                .select("nome")
                .eq("id", tipoInterventoId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (imp?.nome) tipoImpiantoNome = imp.nome as string;
        if (intv?.nome) tipoInterventoNome = intv.nome as string;
      }

      // 5. Chiama la RPC
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
