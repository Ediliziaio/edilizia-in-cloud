/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.1
 *
 * Mutazioni CRUD su article_families, article_family_axes e
 * article_family_axis_values. Ogni mutazione invalida le query appropriate e
 * logga gli errori su Sentry/Velocity.
 *
 * Decisione architetturale: una hook unica per famiglia + assi + valori. La
 * sequenza "salvataggio famiglia" nell'editor passa per più chiamate
 * (upsert famiglia → diff assi → diff valori) ma ogni step è atomico a
 * livello DB.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import type {
  ArticleFamily,
  FamilyAxis,
  AxisValue,
} from "@/types/articleFamily";

// ── Input types ───────────────────────────────────────────────────────────────

export type FamilyInsert = Omit<
  ArticleFamily,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type FamilyUpdate = Partial<
  Omit<ArticleFamily, "id" | "company_id" | "created_at" | "updated_at">
>;

export type AxisInsert = Omit<FamilyAxis, "id" | "created_at"> & {
  id?: string;
};

export type AxisUpdate = Partial<
  Omit<FamilyAxis, "id" | "family_id" | "company_id" | "created_at">
>;

export type AxisValueInsert = Omit<AxisValue, "id" | "created_at"> & {
  id?: string;
};

export type AxisValueUpdate = Partial<
  Omit<AxisValue, "id" | "axis_id" | "company_id" | "created_at">
>;

function assertNonNegativeNumber(value: unknown, label: string) {
  if (value == null) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} deve essere un numero valido e non negativo.`);
  }
}

function assertPercentRange(value: unknown, label: string) {
  if (value == null) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`${label} deve essere compreso tra 0 e 100.`);
  }
}

function validateFamilyEconomics(payload: Partial<ArticleFamily>) {
  assertNonNegativeNumber(payload.prezzo_base_vendita, "Prezzo di vendita");
  assertNonNegativeNumber(payload.prezzo_base_acquisto, "Prezzo di acquisto");
  assertNonNegativeNumber(payload.markup_valore, "Markup");
  assertPercentRange(payload.sconto_fornitore_1, "Sconto fornitore 1");
  assertPercentRange(payload.sconto_fornitore_2, "Sconto fornitore 2");
  assertPercentRange(payload.vat_rate, "IVA vendita");
  assertPercentRange(payload.vat_rate_acquisto, "IVA acquisto");
  assertNonNegativeNumber(payload.manodopera_costo_acquisto, "Costo manodopera");
  assertNonNegativeNumber(payload.manodopera_prezzo_vendita, "Prezzo vendita manodopera");
  if (payload.posa_quantita_default != null) {
    const numeric = Number(payload.posa_quantita_default);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error("Quantità manodopera deve essere maggiore di zero.");
    }
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFamilyMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const invalidate = (familyId?: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
    if (familyId) {
      qc.invalidateQueries({
        queryKey: queryKeys.articleFamilies.detail(familyId),
      });
    }
  };

  // ── Famiglia ──────────────────────────────────────────────────────────────

  const createFamily = useMutation({
    mutationFn: async (payload: Omit<FamilyInsert, "company_id">) => {
      if (!companyId) throw new Error("Azienda non identificata");
      validateFamilyEconomics(payload);
      const { data, error } = await supabase
        .from("article_families" as never)
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ArticleFamily;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("families.create", err, { companyId }),
  });

  const updateFamily = useMutation({
    mutationFn: async (args: { id: string; patch: FamilyUpdate }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      validateFamilyEconomics(args.patch);
      const { data, error } = await supabase
        .from("article_families" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ArticleFamily;
    },
    onSuccess: (f) => invalidate(f.id),
    onError: (err: Error) =>
      captureVelocityError("families.update", err, { companyId }),
  });

  /**
   * Sposta la famiglia nel cestino (soft delete).
   *
   * Imposta `deleted_at = NOW()`: la riga scompare dal listino ma resta nel
   * DB. Dopo 15 giorni viene purgata dal job pg_cron
   * `cleanup-cestino-article-families-15gg` (migration 20260421000004).
   *
   * Preserva le referenze nei `quote_items` storici: il preventivatore
   * snapshotta sempre i dati della famiglia al momento della creazione della
   * riga, quindi l'eliminazione non rompe preventivi esistenti.
   *
   * Cambiato nel Apr 2026: in precedenza usava `attivo=false` (archiviazione
   * silenziosa). Ora la user-intent "elimina" è mappata su un vero soft
   * delete con retention 15gg + possibilità di restore dal cestino UI.
   */
  const deleteFamily = useMutation({
    mutationFn: async (familyId: string) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_families" as never)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", familyId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return familyId;
    },
    onSuccess: (id) => invalidate(id),
    onError: (err: Error) =>
      captureVelocityError("families.delete", err, { companyId }),
  });

  /**
   * Ripristina una famiglia dal cestino (deleted_at=NULL).
   *
   * Idempotente: se la famiglia è già attiva non fa nulla di dannoso. Non
   * tocca `attivo` per lasciare all'utente il controllo (una famiglia
   * archiviata manualmente con attivo=false resta archiviata dopo restore).
   */
  const restoreFamily = useMutation({
    mutationFn: async (familyId: string) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_families" as never)
        .update({ deleted_at: null })
        .eq("id", familyId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return familyId;
    },
    onSuccess: (id) => invalidate(id),
    onError: (err: Error) =>
      captureVelocityError("families.restore", err, { companyId }),
  });

  /**
   * Elimina definitivamente la famiglia (DELETE hard). Usato dalla UI del
   * cestino per "vuotare manualmente" prima dei 15 giorni. Cascade su
   * `article_family_axes` e `article_family_axis_values` tramite FK ON DELETE
   * CASCADE.
   *
   * Attenzione: i preventivi storici NON vengono toccati (snapshot nei
   * quote_items), ma ogni futuro accesso al dettaglio famiglia restituirà
   * null — assicurarsi che l'UI gestisca questo caso (già presente in
   * useFamily che ritorna null su missing).
   */
  const hardDeleteFamily = useMutation({
    mutationFn: async (familyId: string) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_families" as never)
        .delete()
        .eq("id", familyId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return familyId;
    },
    onSuccess: (id) => invalidate(id),
    onError: (err: Error) =>
      captureVelocityError("families.hardDelete", err, { companyId }),
  });

  /** Duplica una famiglia con assi+valori (clone profondo). */
  const duplicateFamily = useMutation({
    mutationFn: async (args: {
      sourceId: string;
      newName: string;
      /**
       * Macrocategoria di DESTINAZIONE. È il caso "stesso prodotto, altro
       * materiale": Finestra 2 Ante in PVC → la stessa in Alluminio a prezzo
       * diverso. Prima si poteva duplicare solo nella stessa macro, e per
       * costruire un listino a materiali toccava rifare a mano assi e griglia
       * (o farlo in SQL, come per Best Infissi). Omesso = resta dov'è.
       */
      targetMacrocategoriaId?: string | null;
      /** Nuovo prezzo base della copia (tipico quando cambia il materiale). */
      newPrezzoVendita?: number;
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");

      // 1. leggi sorgente con assi+valori
      const { data: src, error: errSrc } = await supabase
        .from("article_families" as never)
        .select(
          `*,
           axes:article_family_axes(
             *,
             values:article_family_axis_values(*)
           )`,
        )
        .eq("id", args.sourceId)
        .eq("company_id", companyId)
        .single();
      if (errSrc) throw new Error(errSrc.message);
      const source = src as unknown as ArticleFamily & {
        axes: Array<FamilyAxis & { values: AxisValue[] }>;
      };

      // 2. crea nuova famiglia (senza id, created_at, updated_at)
      const {
        id: _ignoreId,
        created_at: _ignoreCA,
        updated_at: _ignoreUA,
        axes: _ignoreAxes,
        ...famRest
      } = source as ArticleFamily & {
        axes: Array<FamilyAxis & { values: AxisValue[] }>;
      };
      void _ignoreId;
      void _ignoreCA;
      void _ignoreUA;
      void _ignoreAxes;

      // Override di destinazione. Se la copia cambia macrocategoria, la
      // categoria del sorgente appartiene all'albero VECCHIO: tenerla
      // aggancerebbe la copia a due rami diversi. Il catalogo risolve prima
      // macrocategoria_id quindi non si vedrebbe, ma i dati resterebbero
      // incoerenti — meglio azzerarla.
      const cambiaMacro =
        args.targetMacrocategoriaId != null &&
        args.targetMacrocategoriaId !== (famRest as { macrocategoria_id?: string | null }).macrocategoria_id;
      const overrides: Record<string, unknown> = { nome: args.newName };
      if (cambiaMacro) {
        overrides.macrocategoria_id = args.targetMacrocategoriaId;
        overrides.categoria_id = null;
      }
      if (args.newPrezzoVendita != null && Number.isFinite(args.newPrezzoVendita)) {
        overrides.prezzo_base_vendita = args.newPrezzoVendita;
      }

      const { data: newFam, error: errNew } = await supabase
        .from("article_families" as never)
        .insert({ ...famRest, ...overrides })
        .select("id")
        .single();
      if (errNew) throw new Error(errNew.message);
      const newFamilyId = (newFam as unknown as { id: string }).id;

      // 3. per ogni asse, insert + insert valori
      for (const ax of source.axes ?? []) {
        const { data: newAx, error: errAx } = await supabase
          .from("article_family_axes" as never)
          .insert({
            family_id: newFamilyId,
            company_id: companyId,
            nome: ax.nome,
            codice: ax.codice,
            descrizione: ax.descrizione,
            tipo: ax.tipo,
            obbligatorio: ax.obbligatorio,
            sort_order: ax.sort_order,
          })
          .select("id")
          .single();
        if (errAx) throw new Error(errAx.message);
        const newAxisId = (newAx as unknown as { id: string }).id;

        if (ax.values && ax.values.length > 0) {
          const rows = ax.values.map((v) => ({
            axis_id: newAxisId,
            company_id: companyId,
            valore: v.valore,
            label: v.label,
            descrizione: v.descrizione,
            is_default: v.is_default,
            maggiorazione_tipo: v.maggiorazione_tipo,
            maggiorazione_valore: v.maggiorazione_valore,
            maggiorazione_acquisto: v.maggiorazione_acquisto,
            codice: v.codice,
            prezzo_vendita: v.prezzo_vendita,
            prezzo_acquisto: v.prezzo_acquisto,
            immagine_url: v.immagine_url,
            sort_order: v.sort_order,
            attivo: v.attivo,
          }));
          const { error: errVal } = await supabase
            .from("article_family_axis_values" as never)
            .insert(rows);
          if (errVal) throw new Error(errVal.message);
        }
      }

      // 4. copia le celle griglia prezzi (listino_griglia). Le celle sono
      //    copiabili tali e quali anche in multi-fascia: axis_config è keyed
      //    su codice asse → valore (stringhe stabili clonate al punto 3), non
      //    su ID. Paginato: le griglie L×H superano facilmente le 1000 righe
      //    del limite di default PostgREST.
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: cells, error: errCells } = await supabase
          .from("listino_griglia" as never)
          .select(
            "axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id, note",
          )
          .eq("family_id", args.sourceId)
          .eq("company_id", companyId)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (errCells) throw new Error(errCells.message);
        const page = (cells ?? []) as unknown as Array<Record<string, unknown>>;
        if (page.length === 0) break;

        const { error: errIns } = await supabase
          .from("listino_griglia" as never)
          .insert(
            page.map((c) => ({
              ...c,
              family_id: newFamilyId,
              company_id: companyId,
            })),
          );
        if (errIns) throw new Error(errIns.message);
        if (page.length < PAGE) break;
      }

      return newFamilyId;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("families.duplicate", err, { companyId }),
  });

  // ── Assi ──────────────────────────────────────────────────────────────────

  const createAxis = useMutation({
    mutationFn: async (payload: Omit<AxisInsert, "company_id">) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axes" as never)
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as FamilyAxis;
    },
    onSuccess: (ax) => invalidate(ax.family_id),
    onError: (err: Error) =>
      captureVelocityError("axes.create", err, { companyId }),
  });

  const updateAxis = useMutation({
    mutationFn: async (args: {
      id: string;
      familyId: string;
      patch: AxisUpdate;
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axes" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as FamilyAxis;
    },
    onSuccess: (ax) => invalidate(ax.family_id),
    onError: (err: Error) =>
      captureVelocityError("axes.update", err, { companyId }),
  });

  const deleteAxis = useMutation({
    mutationFn: async (args: { id: string; familyId: string }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_family_axes" as never)
        .delete()
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axes.delete", err, { companyId }),
  });

  // ── Valori asse ───────────────────────────────────────────────────────────

  const createAxisValue = useMutation({
    mutationFn: async (
      args: Omit<AxisValueInsert, "company_id"> & { familyId: string },
    ) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { familyId: _fam, ...rest } = args;
      void _fam;
      const { data, error } = await supabase
        .from("article_family_axis_values" as never)
        .insert({ ...rest, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as AxisValue;
    },
    onSuccess: (_v, args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.create", err, { companyId }),
  });

  const updateAxisValue = useMutation({
    mutationFn: async (args: {
      id: string;
      familyId: string;
      patch: AxisValueUpdate;
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axis_values" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as AxisValue;
    },
    onSuccess: (_v, args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.update", err, { companyId }),
  });

  const deleteAxisValue = useMutation({
    mutationFn: async (args: { id: string; familyId: string }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_family_axis_values" as never)
        .delete()
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.delete", err, { companyId }),
  });

  /**
   * Bulk insert di assi + valori da un preset. Crea tutti gli assi in una
   * singola INSERT, poi tutti i valori in un'altra INSERT: 2 round-trip totali
   * invece di N×(1+M) del pattern naive. Idempotenza non richiesta lato DB
   * (il chiamante filtra i codici già presenti), ma ci proteggiamo dal caso
   * race: errore unique → messaggio chiaro all'utente.
   *
   * Input: familyId + array di preset assi (con il loro sort_order già
   * pre-calcolato dal chiamante per preservare l'ordine di presentazione).
   */
  type BulkAxisInput = {
    nome: string;
    codice: string;
    descrizione: string | null;
    tipo: FamilyAxis["tipo"];
    obbligatorio: boolean;
    sort_order: number;
    values: Array<{
      valore: string;
      label: string;
      descrizione: string | null;
      is_default: boolean;
      maggiorazione_tipo: AxisValue["maggiorazione_tipo"];
      maggiorazione_valore: number;
      maggiorazione_acquisto: number;
      sort_order: number;
      attivo: boolean;
    }>;
  };

  const bulkInsertAxesWithValues = useMutation({
    mutationFn: async (args: {
      familyId: string;
      axes: BulkAxisInput[];
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      if (args.axes.length === 0) return { axesCreated: 0, valuesCreated: 0 };

      // Step 1: INSERT assi (tutti insieme, select id). Preserva sort_order.
      const axisRows = args.axes.map((ax) => ({
        family_id: args.familyId,
        company_id: companyId,
        nome: ax.nome,
        codice: ax.codice,
        descrizione: ax.descrizione,
        tipo: ax.tipo,
        obbligatorio: ax.obbligatorio,
        sort_order: ax.sort_order,
      }));
      const { data: newAxes, error: errAx } = await supabase
        .from("article_family_axes" as never)
        .insert(axisRows)
        .select("id, codice");
      if (errAx) throw new Error(errAx.message);

      // Mappa codice → id per agganciare i valori al loro asse.
      const codiceToId = new Map<string, string>();
      for (const a of (newAxes ?? []) as Array<{ id: string; codice: string }>) {
        codiceToId.set(a.codice, a.id);
      }

      // Step 2: INSERT valori in bulk. Genera righe per ogni asse, ogni valore.
      const valueRows: Array<{
        axis_id: string;
        company_id: string;
        valore: string;
        label: string;
        descrizione: string | null;
        is_default: boolean;
        maggiorazione_tipo: AxisValue["maggiorazione_tipo"];
        maggiorazione_valore: number;
        maggiorazione_acquisto: number;
        sort_order: number;
        attivo: boolean;
      }> = [];
      for (const ax of args.axes) {
        const axisId = codiceToId.get(ax.codice);
        if (!axisId) continue; // dovrebbe essere impossibile
        for (const v of ax.values) {
          valueRows.push({
            axis_id: axisId,
            company_id: companyId,
            valore: v.valore,
            label: v.label,
            descrizione: v.descrizione,
            is_default: v.is_default,
            maggiorazione_tipo: v.maggiorazione_tipo,
            maggiorazione_valore: v.maggiorazione_valore,
            maggiorazione_acquisto: v.maggiorazione_acquisto,
            sort_order: v.sort_order,
            attivo: v.attivo,
          });
        }
      }
      if (valueRows.length > 0) {
        const { error: errVal } = await supabase
          .from("article_family_axis_values" as never)
          .insert(valueRows);
        if (errVal) {
          // M-34 (audit): due insert non transazionali — se i valori
          // falliscono, gli assi appena creati resterebbero vuoti (preset a
          // metà). Cleanup compensativo: rimuoviamo gli assi di questo batch
          // (FK CASCADE su eventuali valori parziali) prima di rilanciare.
          const createdAxisIds = Array.from(codiceToId.values());
          const { error: errCleanup } = await supabase
            .from("article_family_axes" as never)
            .delete()
            .in("id", createdAxisIds)
            .eq("company_id", companyId);
          throw new Error(
            errCleanup
              ? `${errVal.message} (pulizia assi parziali fallita: ${errCleanup.message} — controlla le variabili create)`
              : `${errVal.message} (nessuna variabile creata: il preset va riapplicato)`,
          );
        }
      }

      return {
        axesCreated: axisRows.length,
        valuesCreated: valueRows.length,
      };
    },
    onSuccess: (_res, args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axes.bulkInsert", err, { companyId }),
  });

  return {
    createFamily,
    updateFamily,
    deleteFamily,
    restoreFamily,
    hardDeleteFamily,
    duplicateFamily,
    createAxis,
    updateAxis,
    deleteAxis,
    createAxisValue,
    updateAxisValue,
    deleteAxisValue,
    bulkInsertAxesWithValues,
  };
}
