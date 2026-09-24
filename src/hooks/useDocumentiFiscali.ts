import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { createTimeoutSignal, withClientTimeout } from "@/lib/query-timeout";
import { toast } from "sonner";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento } from "@/types/fatturazione";
import { TIPI_SDI } from "@/lib/fatturazione/sdiCassetto";

const DOCUMENTI_QUERY_TIMEOUT_MS = 12_000;

// ─── Filters ──────────────────────────────────────────────────

export interface DocumentiFiscaliFilters {
  tipo?: TipoDocumento | TipoDocumento[];
  stato?: StatoDocumento | StatoDocumento[];
  anagrafica_id?: string;
  data_da?: string;
  data_a?: string;
  search?: string;
  page?: number;
  perPage?: number;
  /** When true, show soft-deleted docs (cestino) instead of active docs */
  showDeleted?: boolean;
  /** Fase verso lo SDI: le fatture da inviare, quelle che aspettano l'esito, le scartate. */
  sdi?: "da_inviare" | "in_elaborazione" | "scartata";
}

// ─── Row mapper ───────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): DocumentoFiscale {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    tipo: row.tipo as TipoDocumento,
    numero: row.numero as string,
    numero_progressivo: row.numero_progressivo as number,
    anno: row.anno as number,
    serie: row.serie as string | undefined,
    data_emissione: row.data_emissione as string,
    data_scadenza: row.data_scadenza as string | undefined,
    data_consegna: row.data_consegna as string | undefined,
    anagrafica_id: row.anagrafica_id as string | undefined,
    cliente_snapshot: (row.cliente_snapshot ?? {}) as DocumentoFiscale["cliente_snapshot"],
    stato: row.stato as StatoDocumento,
    sdi_id_trasmissione: row.sdi_id_trasmissione as string | undefined,
    sdi_identificativo: row.sdi_identificativo as string | undefined,
    sdi_stato: row.sdi_stato as string | undefined,
    sdi_errori: (row.sdi_errori ?? []) as unknown[],
    sdi_data_consegna: row.sdi_data_consegna as string | undefined,
    sdi_notifica_tipo: row.sdi_notifica_tipo as string | undefined,
    sdi_file_xml_url: row.sdi_file_xml_url as string | undefined,
    sdi_ricevuta_url: row.sdi_ricevuta_url as string | undefined,
    trasmissione: row.trasmissione as DocumentoFiscale["trasmissione"],
    esigibilita_iva: row.esigibilita_iva as DocumentoFiscale["esigibilita_iva"],
    allega_pdf_sdi: row.allega_pdf_sdi as boolean | undefined,
    emesso_in_seguito_a: row.emesso_in_seguito_a as string | undefined,
    righe: (row.righe ?? []) as DocumentoFiscale["righe"],
    riepilogo_iva: (row.riepilogo_iva ?? []) as DocumentoFiscale["riepilogo_iva"],
    subtotale: Number(row.subtotale ?? 0),
    sconto_globale_percentuale: row.sconto_globale_percentuale as number | undefined,
    sconto_globale_valore: row.sconto_globale_valore as number | undefined,
    imponibile_totale: Number(row.imponibile_totale ?? 0),
    iva_totale: Number(row.iva_totale ?? 0),
    totale_documento: Number(row.totale_documento ?? 0),
    bollo_virtuale: row.bollo_virtuale as boolean | undefined,
    bollo_importo: row.bollo_importo as number | undefined,
    arrotondamento: row.arrotondamento as number | undefined,
    ritenuta_acconto: row.ritenuta_acconto as boolean | undefined,
    ritenuta_tipo: row.ritenuta_tipo as DocumentoFiscale["ritenuta_tipo"],
    ritenuta_aliquota: row.ritenuta_aliquota as number | undefined,
    ritenuta_causale: row.ritenuta_causale as string | undefined,
    ritenuta_importo: row.ritenuta_importo as number | undefined,
    cassa_previdenziale: row.cassa_previdenziale as boolean | undefined,
    cassa_tipo: row.cassa_tipo as string | undefined,
    cassa_aliquota: row.cassa_aliquota as number | undefined,
    cassa_importo: row.cassa_importo as number | undefined,
    cassa_imponibile: row.cassa_imponibile as number | undefined,
    cassa_aliquota_iva: row.cassa_aliquota_iva as string | undefined,
    cassa_ritenuta: row.cassa_ritenuta as boolean | undefined,
    // Rivalsa INPS
    rivalsa_inps: row.rivalsa_inps as boolean | undefined,
    rivalsa_aliquota: row.rivalsa_aliquota as number | undefined,
    rivalsa_importo: row.rivalsa_importo as number | undefined,
    rivalsa_tipo: row.rivalsa_tipo as string | undefined,
    // Altra ritenuta
    altra_ritenuta: row.altra_ritenuta as boolean | undefined,
    altra_ritenuta_tipo: row.altra_ritenuta_tipo as string | undefined,
    altra_ritenuta_aliquota: row.altra_ritenuta_aliquota as number | undefined,
    altra_ritenuta_importo: row.altra_ritenuta_importo as number | undefined,
    altra_ritenuta_causale: row.altra_ritenuta_causale as string | undefined,
    totale_da_pagare: Number(row.totale_da_pagare ?? 0),
    scadenze_pagamento: (row.scadenze_pagamento ?? []) as DocumentoFiscale["scadenze_pagamento"],
    metodo_pagamento_codice: row.metodo_pagamento_codice as DocumentoFiscale["metodo_pagamento_codice"],
    metodo_pagamento_nome: row.metodo_pagamento_nome as string | undefined,
    iban_pagamento: row.iban_pagamento as string | undefined,
    bic_pagamento: row.bic_pagamento as string | undefined,
    nome_banca: row.nome_banca as string | undefined,
    intestatario_conto: row.intestatario_conto as string | undefined,
    documento_correlato_id: row.documento_correlato_id as string | undefined,
    ordine_id: row.ordine_id as string | undefined,
    riferimenti_ordine: (row.riferimenti_ordine ?? []) as unknown[],
    riferimenti_ddt: (row.riferimenti_ddt ?? []) as unknown[],
    codice_commessa_convenzione: row.codice_commessa_convenzione as string | undefined,
    cig: row.cig as string | undefined,
    cup: row.cup as string | undefined,
    causale: (row.causale ?? []) as unknown[],
    note_documento: row.note_documento as string | undefined,
    importo_pagato: Number(row.importo_pagato ?? 0),
    pagato_at: row.pagato_at as string | undefined,
    pdf_url: row.pdf_url as string | undefined,
    allegati: (row.allegati ?? []) as unknown[],
    // Preventivo
    data_validita: row.data_validita as string | undefined,
    probabilita_chiusura: row.probabilita_chiusura as number | undefined,
    testo_intro: row.testo_intro as string | undefined,
    testo_conclusivo: row.testo_conclusivo as string | undefined,
    // DDT
    ddt_fattura_id: row.ddt_fattura_id as string | undefined,
    ddt_fatturato: row.ddt_fatturato as boolean | undefined,
    ddt_causale_trasporto: row.ddt_causale_trasporto as string | undefined,
    ddt_aspetto_beni: row.ddt_aspetto_beni as string | undefined,
    ddt_numero_colli: row.ddt_numero_colli as number | undefined,
    ddt_peso: row.ddt_peso as string | undefined,
    ddt_mezzo_trasporto: row.ddt_mezzo_trasporto as string | undefined,
    ddt_data_ora_consegna: row.ddt_data_ora_consegna as string | undefined,
    ddt_indirizzo_consegna: row.ddt_indirizzo_consegna as string | undefined,
    ddt_porto: row.ddt_porto as string | undefined,
    ddt_vettore: row.ddt_vettore as string | undefined,
    // Note & meta
    note_interne: row.note_interne as string | undefined,
    salesperson_id: row.salesperson_id as string | undefined,
    deleted_at: row.deleted_at as string | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  } as DocumentoFiscale;
}

// ─── List hook ────────────────────────────────────────────────

export function useDocumentiFiscali(filters: DocumentiFiscaliFilters = {}) {
  const companyId = useEffectiveCompanyId();
  const page = filters.page ?? 0;
  const perPage = filters.perPage ?? 50;

  return useQuery({
    queryKey: queryKeys.documentiFiscali.list(companyId ?? undefined, filters as unknown as Record<string, unknown>),
    enabled: !!companyId,
    queryFn: async () => {
      const timeout = createTimeoutSignal(DOCUMENTI_QUERY_TIMEOUT_MS);
      try {
        let query = supabase
          .from("documenti_fiscali" as never)
          .select("*", { count: "estimated" })
          .eq("company_id", companyId!)
          .order(filters.showDeleted ? "updated_at" : "data_emissione", { ascending: false })
          .range(page * perPage, (page + 1) * perPage - 1);

        // Cestino: show only soft-deleted docs; otherwise exclude them
        if (filters.showDeleted) {
          query = query.not("deleted_at", "is", null);
        } else {
          query = query.is("deleted_at", null);
        }

        if (filters.tipo) {
          const tipi = Array.isArray(filters.tipo) ? filters.tipo : [filters.tipo];
          query = query.in("tipo", tipi);
        }
        if (filters.stato && !filters.showDeleted) {
          const stati = Array.isArray(filters.stato) ? filters.stato : [filters.stato];
          query = query.in("stato", stati);
        }
        if (filters.anagrafica_id) {
          query = query.eq("anagrafica_id", filters.anagrafica_id);
        }
        // Le stesse regole di faseSdi (lib/fatturazione/sdiCassetto.ts).
        if (filters.sdi === "da_inviare") {
          query = query.in("tipo", TIPI_SDI).is("sdi_id_trasmissione", null)
            .not("stato", "in", "(bozza,annullata,in_invio)");
        } else if (filters.sdi === "in_elaborazione") {
          // invia-sdi scrive AT a ogni invio riuscito (il manuale no): niente
          // .or() qui, la ricerca ne usa già uno.
          query = query.in("tipo", TIPI_SDI).eq("sdi_stato", "AT");
        } else if (filters.sdi === "scartata") {
          query = query.eq("sdi_stato", "NS").not("stato", "in", "(annullata,stornata)");
        }
        if (filters.data_da) {
          query = query.gte("data_emissione", filters.data_da);
        }
        if (filters.data_a) {
          query = query.lte("data_emissione", filters.data_a);
        }
        if (filters.search) {
          query = query.or(`numero.ilike.%${filters.search}%,note_documento.ilike.%${filters.search}%,cliente_snapshot->>ragione_sociale.ilike.%${filters.search}%,cliente_snapshot->>codice_fiscale.ilike.%${filters.search}%,cliente_snapshot->>partita_iva.ilike.%${filters.search}%`);
        }

        const { data, error, count } = await withClientTimeout(
          query.abortSignal(timeout.signal),
          "Documenti fiscali",
          DOCUMENTI_QUERY_TIMEOUT_MS,
        );
        if (error) throw error;

        return {
          documenti: ((data as unknown[]) ?? []).map((r) => mapRow(r as Record<string, unknown>)),
          total: count ?? 0,
          page,
          perPage,
        };
      } finally {
        timeout.dispose();
      }
    },
    retry: 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── Detail hook ──────────────────────────────────────────────

/**
 * Il documento com'è adesso nel database. Serve dopo un invio allo SDI o un
 * aggiornamento dell'esito: l'editor si inizializza una volta sola, e senza
 * rileggere restava «da inviare» anche a invio fatto (24/09/2026).
 */
export async function rileggiDocumentoFiscale(id: string): Promise<DocumentoFiscale> {
  const { data, error } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export function useDocumentoFiscale(id: string | undefined) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.documentiFiscali.detail(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("*")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── Create mutation ──────────────────────────────────────────

interface CreateDocumentoInput {
  tipo: TipoDocumento;
  anagrafica_id?: string;
  cliente_snapshot?: DocumentoFiscale["cliente_snapshot"];
  righe?: DocumentoFiscale["righe"];
  data_emissione?: string;
  data_scadenza?: string;
  note_documento?: string;
  metodo_pagamento_codice?: string;
  [key: string]: unknown;
}

export function useCreateDocumento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentoInput) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");

      // Ensure anagrafica_azienda exists for this company
      const { data: anaExists } = await supabase
        .from("anagrafica_azienda" as never)
        .select("id")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!anaExists) {
        // Il profilo fiscale nasce dai dati VERI dell'azienda, non da segnaposto:
        // partita IVA, sede, PEC e codice SDI sono gia' in companies (raccolti in
        // fase di registrazione). Prima venivano ignorati e la prima fattura usciva
        // intestata a "Da configurare" con partita IVA 00000000000.
        // I campi hanno vincoli di lunghezza esatti a database (P.IVA 11, CAP 5,
        // SDI 7, provincia 2): se un dato non e' conforme si ricade sul segnaposto,
        // perche' un insert rifiutato bloccherebbe del tutto la fatturazione.
        const { data: azienda } = await supabase
          .from("companies")
          .select("name, vat_number, fiscal_code, legal_address, legal_city, legal_province, legal_postal_code, pec, sdi_code")
          .eq("id", companyId)
          .maybeSingle();

        const soloCifre = (v?: string | null) => (v ?? "").replace(/\D/g, "");
        const piva = soloCifre(azienda?.vat_number);
        const cf = (azienda?.fiscal_code ?? "").trim().toUpperCase();
        const cap = soloCifre(azienda?.legal_postal_code);
        const prov = (azienda?.legal_province ?? "").trim().toUpperCase();
        const sdi = (azienda?.sdi_code ?? "").trim().toUpperCase();
        const pivaValida = piva.length === 11 ? piva : "00000000000";

        const { error: anaError } = await supabase
          .from("anagrafica_azienda" as never)
          .insert({
            company_id: companyId,
            ragione_sociale: azienda?.name?.trim() || "Da configurare",
            partita_iva: pivaValida,
            // Per le societa' il codice fiscale coincide con la partita IVA:
            // meglio quello del segnaposto se il campo dedicato e' vuoto.
            codice_fiscale: cf.length === 11 || cf.length === 16 ? cf : pivaValida,
            regime_fiscale: "RF01",
            forma_giuridica: "SRL",
            indirizzo_via: azienda?.legal_address?.trim() || "Da configurare",
            indirizzo_cap: cap.length === 5 ? cap : "00000",
            indirizzo_comune: azienda?.legal_city?.trim() || "Da configurare",
            indirizzo_provincia: prov.length === 2 ? prov : "XX",
            indirizzo_nazione: "IT",
            ...(sdi.length === 7 && { codice_sdi: sdi }),
            ...(azienda?.pec?.trim() && { pec: azienda.pec.trim() }),
          } as never);
        if (anaError) throw new Error("Impossibile creare il profilo di fatturazione: " + anaError.message);
      }

      // Numero e documento nascono nella stessa transazione.
      //
      // Prima erano due chiamate: `genera_numero_documento_native` e poi
      // l'insert. Quella funzione non calcola un massimo, INCREMENTA E SCRIVE
      // un contatore, e la scrittura era gia' committata quando arrivava
      // l'insert: se l'insert falliva, il numero era consumato per sempre.
      // Non un caso di scuola — il menu offre sedici tipi di documento e il
      // vincolo sulla tabella ne ammette nove, quindi parcella, acconti e
      // reverse charge bruciavano un numero di FATTURA a ogni tentativo,
      // perche' il ramo di riserva della funzione usa quel contatore.
      //
      // `documento_crea` rifiuta i tipi non gestiti PRIMA di toccare il
      // contatore, e se l'inserimento fallisce anche l'incremento torna
      // indietro. Provato su dati veri in transazione annullata: tentativo con
      // «parcella» -> contatore fermo a 37; fattura valida -> 38, documento
      // FT-2026-0038 scritto.
      const { data: creato, error: rpcError } = await supabase.rpc("documento_crea", {
        p_company_id: companyId,
        p_dati: input as never,
      }) as { data: { id?: string } | null; error: { message?: string } | null };

      if (rpcError) throw new Error(rpcError.message ?? "Creazione documento non riuscita");
      if (!creato?.id) throw new Error("Il documento non e' stato creato");

      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select()
        .eq("id", creato.id)
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Documento creato");
    },
    onError: (err: Error) => {
      toast.error("Errore nella creazione", { description: err.message });
    },
  });
}

// ─── Update mutation ──────────────────────────────────────────

export function useUpdateDocumento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");

      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.detail(doc.id) });
      // No toast — the editor top bar already shows "Salvata X fa" indicator
    },
    onError: (err: Error) => {
      toast.error("Errore nell'aggiornamento", { description: err.message });
    },
  });
}

// ─── Soft-delete mutation ─────────────────────────────────────
// Italian fiscal law requires document retention — physical deletion is
// illegal for emitted invoices. We therefore:
//   bozza      → stato = annullata, deleted_at = now()  (hidden from all views)
//   annullata  → deleted_at = now()                     (already annulled, just hide)
// Emitted invoices must be reversed via nota di credito; this hook refuses them.

export function useDeleteDocumento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: doc, error: fetchErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("stato")
        .eq("id", id)
        .eq("company_id", companyId!)
        .single();

      if (fetchErr) throw fetchErr;
      const stato = (doc as Record<string, unknown>)?.stato as string | undefined;

      if (!stato) throw new Error("Documento non trovato");

      if (stato !== "bozza" && stato !== "annullata") {
        throw new Error(
          "I documenti emessi non possono essere eliminati. Emetti una nota di credito per stornare la fattura."
        );
      }

      // Soft delete: annul + mark as deleted (hidden from all views)
      const { error } = await supabase
        .from("documenti_fiscali" as never)
        .update({
          stato: "annullata",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .eq("company_id", companyId!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Documento annullato");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'annullamento", { description: err.message });
    },
  });
}

// ─── Emit mutation (bozza → emessa) ──────────────────────────

export function useEmittiDocumento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");

      const { data: doc, error: fetchErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();

      if (fetchErr) throw fetchErr;

      const d = doc as Record<string, unknown>;
      if (d.stato !== "bozza") {
        throw new Error("Solo i documenti in bozza possono essere emessi");
      }

      const righe = (d.righe as unknown[]) ?? [];
      const tipo = d.tipo as string;
      if (righe.length === 0 && tipo !== "nota_credito") {
        throw new Error("Il documento deve avere almeno una riga");
      }

      const clienteSnapshot = d.cliente_snapshot as Record<string, unknown> | null;
      if (!clienteSnapshot?.ragione_sociale) {
        throw new Error("Il cliente è obbligatorio per emettere il documento");
      }

      // L'emissione la fa il database (documento_emetti, 24/09/2026): assegna
      // il numero adesso e non alla creazione della bozza (niente buchi nella
      // serie), rifiuta la data futura e la data fuori ordine rispetto alle
      // fatture già emesse. Prima qui si cambiava solo lo stato.
      const { error: rpcErr } = await supabase.rpc("documento_emetti" as never, { p_documento_id: id } as never);
      if (rpcErr) throw new Error(rpcErr.message);

      const { data: updated, error } = await supabase
        .from("documenti_fiscali" as never)
        .select()
        .eq("id", id)
        .eq("company_id", companyId)
        .single();

      if (error) throw error;
      return mapRow(updated as Record<string, unknown>);
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.detail(doc.id) });
      toast.success("Documento emesso");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'emissione", { description: err.message });
    },
  });
}
