import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaParole } from "@/lib/ricerca/ricercaContatti";
import type { RigaPlanimetria } from "./archivio";
import type { Permissions } from "@/hooks/usePermissions";

export const TIPI_COLLEGAMENTO = ["contatto", "cliente", "preventivo", "commessa", "computo"] as const;
export type TipoCollegamento = typeof TIPI_COLLEGAMENTO[number];
export interface SceltaCollegamento { id: string; nome: string; titolo?: string; sottotitolo?: string; percorso?: string }
export type MappaCollegamenti = Record<TipoCollegamento, Record<string, SceltaCollegamento>>;
export const DEFINIZIONI_COLLEGAMENTI = {
  contatto: { titolo: "Contatto CRM", colonna: "contact_id", campo: "contactId", tabella: "marketing_contacts", colonne: "id,first_name,last_name,company_name,email", cerca: ["first_name", "last_name", "company_name", "email"], base: "/azienda/marketing/contatti" },
  cliente: { titolo: "Cliente", colonna: "customer_id", campo: "customerId", tabella: "profiles", colonne: "id,first_name,last_name,business_name,email", cerca: ["first_name", "last_name", "business_name"], base: "/azienda/clienti" },
  preventivo: { titolo: "Preventivo", colonna: "quote_id", campo: "quoteId", tabella: "quotes", colonne: "id,quote_number,title", cerca: ["quote_number", "title"], base: "/azienda/marketing/preventivi" },
  commessa: { titolo: "Commessa", colonna: "order_id", campo: "orderId", tabella: "orders", colonne: "id,order_code,description", cerca: ["order_code", "description"], base: "/azienda/ordini" },
  computo: { titolo: "Computo metrico", colonna: "computo_upload_id", campo: "computoUploadId", tabella: "computo_uploads", colonne: "id,titolo,file_name", cerca: ["titolo", "file_name"], base: "" },
} as const;

export function accessiCollegamenti(p: Pick<Permissions, "canViewMarketingContacts" | "canViewCustomers" | "canViewPreventivi" | "canViewOrders">): Record<TipoCollegamento, boolean> {
  return { contatto: p.canViewMarketingContacts, cliente: p.canViewCustomers, preventivo: p.canViewPreventivi, commessa: p.canViewOrders, computo: p.canViewOrders || p.canViewPreventivi };
}

export function sceltaDaRiga(tipo: TipoCollegamento, row: Record<string, unknown>): SceltaCollegamento {
  const testo = (key: string) => typeof row[key] === "string" ? (row[key] as string).trim() : "";
  const nomePersona = [testo("first_name"), testo("last_name")].filter(Boolean).join(" ");
  const nome = tipo === "preventivo" ? [testo("quote_number"), testo("title")].filter(Boolean).join(" · ")
    : tipo === "commessa" ? [testo("order_code"), testo("description")].filter(Boolean).join(" · ")
      : tipo === "computo" ? testo("titolo") || testo("file_name")
      : testo("business_name") || testo("company_name") || nomePersona;
  const titolo = tipo === "preventivo" ? testo("quote_number") : tipo === "commessa" ? testo("order_code") : "";
  const sottotitolo = tipo === "preventivo" ? testo("title") : tipo === "commessa" ? testo("description")
    : tipo === "computo" ? testo("titolo") && testo("file_name") !== testo("titolo") ? testo("file_name") : "" : testo("email");
  return {
    id: String(row.id), nome: nome || DEFINIZIONI_COLLEGAMENTI[tipo].titolo,
    ...(titolo ? { titolo } : {}), ...(sottotitolo ? { sottotitolo } : {}),
    ...(tipo === "computo" ? {} : { percorso: `${DEFINIZIONI_COLLEGAMENTI[tipo].base}/${row.id}` }),
  };
}

export const haCollegamenti = (riga: RigaPlanimetria) => TIPI_COLLEGAMENTO.some((tipo) => Boolean(riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]));

/** Soltanto i nomi dei riferimenti presenti nell'elenco; nessun caricamento dell'intero CRM. */
export function useCollegamentiPiante(companyId: string | undefined, righe: RigaPlanimetria[], accessi: Record<TipoCollegamento, boolean>) {
  const ids = Object.fromEntries(TIPI_COLLEGAMENTO.map((tipo) => [tipo, accessi[tipo]
    ? [...new Set(righe.map((r) => r[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]).filter((id): id is string => !!id))].sort() : []])) as Record<TipoCollegamento, string[]>;
  return useQuery({
    queryKey: ["planimetrie-collegamenti", companyId, ids],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<MappaCollegamenti> => {
      const result: MappaCollegamenti = { contatto: {}, cliente: {}, preventivo: {}, commessa: {}, computo: {} };
      await Promise.all(TIPI_COLLEGAMENTO.map(async (tipo) => {
        const def = DEFINIZIONI_COLLEGAMENTI[tipo];
        for (let i = 0; i < ids[tipo].length; i += 100) {
          const { data, error } = await supabase.from(def.tabella as never).select(def.colonne)
            .eq("company_id", companyId!).in("id", ids[tipo].slice(i, i + 100));
          if (error) throw error;
          for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            const scelta = sceltaDaRiga(tipo, row);
            result[tipo][scelta.id] = scelta;
          }
        }
      }));
      return result;
    },
  });
}

/** Ricerca limitata e filtrata per azienda, attivata solo aprendo un selettore. */
export async function cercaCollegamentiPianta(companyId: string, tipo: TipoCollegamento, testo: string): Promise<SceltaCollegamento[]> {
  if (tipo === "cliente") {
    const { data, error } = await supabase.rpc("get_customers_paginated" as never, {
      p_company_id: companyId, p_search: testo.trim() || null, p_limit: 20, p_offset: 0,
      p_sort_field: "name", p_sort_dir: "asc",
    } as never);
    if (error) throw error;
    const result = data as unknown as { rows?: Array<Record<string, unknown>> } | null;
    return (result?.rows ?? []).map((row) => sceltaDaRiga(tipo, row));
  }
  const def = DEFINIZIONI_COLLEGAMENTI[tipo];
  let query = supabase.from(def.tabella as never).select(def.colonne).eq("company_id", companyId).limit(20);
  query = tipo === "computo" ? query.neq("stato", "archiviato") : query.is("deleted_at", null);
  for (const filtro of filtriRicercaParole(testo, def.cerca)) query = query.or(filtro);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => sceltaDaRiga(tipo, row));
}
