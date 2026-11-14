import { messaggioErrore } from "@/lib/orders/sottofasi";
import { MODELLI_STANDARD } from "@/lib/orders/modelliStandard";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MESSAGGIO_PERMESSI } from "@/lib/userErrorMessage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { assignOfficeEmployee } from "@/lib/orders/assignOfficeEmployee";
import type { FaseModello } from "@/lib/orders/modelliFasi";
import { issuedPurchaseOrderNumber } from "@/lib/orders/materialProcurement";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { invalidaSquadreCollegate } from '@/lib/manodopera/cacheSquadre';
import type { OrigineCostoDitta } from "@/lib/orders/costoDitta";

export type PhaseStatus = "da_iniziare" | "in_corso" | "completata";
export type ExecutorType = "interno" | "esterno";
export type AssignmentSource = "employee" | "team";

export interface PhaseAssignment {
  id: string;
  source: AssignmentSource; // employee = order_employees, team = order_external_teams
  phase_id: string | null;
  executor_type: ExecutorType;
  planned_hours?: number | null;
  planned_hourly_rate?: number | null;
  employee_id: string | null;
  external_team_id: string | null;
  cost_preventivo: number;
  cost_consuntivo: number; // = total_cost (sorgente di verità letta da margine/dashboard)
  /** Ditte: aliquota con cui sono scritti gli importi (IVA inclusa). */
  vat_rate?: number | null;
  /** Ditte: da dove viene il costo previsto (tariffa × quantità, voci del preventivo, a mano). */
  tariffa_id?: string | null;
  quantita?: number | null;
  /** Senza IVA. */
  costo_unitario?: number | null;
  costo_origine?: OrigineCostoDitta | null;
  hours: number | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  /** Read-only identity from the related record, also for inactive historical staff. */
  executor_label?: string | null;
  executor_inactive?: boolean;
  executor_kind?: "interna" | "esterna";
}

export interface WorkPhase {
  id: string;
  order_id: string;
  name: string;
  position: number;
  status: PhaseStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  /** Avanzamento reale 0-100 dichiarato dai rapportini di campo */
  percentuale: number;
  /** Giorno in cui la fase è stata chiusa («yyyy-MM-dd»), se registrato. */
  completata_il: string | null;
  /** Venduto della lavorazione scritto dall'ufficio (imponibile); vuoto = dalle righe del contratto. */
  importo_venduto: number | null;
  assignments: PhaseAssignment[];
}

export interface ExecutorOption {
  id: string;
  label: string;
  campoUserId?: string | null;
  kind?: "interna" | "esterna";
  /** Solo ditte: IVA in fattura, 0 = reverse charge. */
  vat_rate?: number | null;
}

// Stato di approvvigionamento di un articolo/materiale della commessa:
// magazzino = collegato a giacenza, ordinato = coperto da un OdA, da_ordinare = scoperto.
export type MaterialReadiness = "magazzino" | "ordinato" | "da_ordinare";

export interface PhaseMaterial {
  id: string;
  name: string;
  quantity: number;
  phase_id: string | null;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  /** Prezzo di vendita, sconto di riga e costo standard: fanno il venduto e il costo previsto della fase. */
  unit_price: number | null;
  discount_percent: number | null;
  standard_cost: number | null;
  /** L'unità della riga: i posati dei rapportini si confrontano solo nella stessa unità. */
  unita_misura?: string | null;
  stock_item_id?: string | null;
  readiness: MaterialReadiness;
  odaNumber: string | null;
}

/** Modelli di fasi per tipo di lavoro edile: creano in un clic le fasi standard
 *  della lavorazione, così si può assegnare subito manodopera/subappalti.
 *  Dal 07/11/2026 vivono in lib/orders/modelliStandard.ts con sottofasi e giorni tipici;
 *  `phases` resta l'elenco dei nomi. */
export interface PhaseTemplate {
  key: string;
  label: string;
  hint: string;
  phases: string[];
  /** Fasi con sottofasi e giorni tipici. */
  fasi?: FaseModello[];
}

export const PHASE_TEMPLATES: PhaseTemplate[] = MODELLI_STANDARD.map((m) => ({ ...m, phases: m.fasi.map((f) => f.nome) }));

// Fasi standard di una ristrutturazione (template "1 clic")
export const RISTRUTTURAZIONE_TEMPLATE: string[] =
  PHASE_TEMPLATES.find((t) => t.key === "ristrutturazione_completa")?.phases ?? [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Le colonne che una parte divisa eredita dalla riga originale: anagrafica,
 * stato (consegna, scarico dal magazzino), aggancio al listino e misure.
 * Restano sulla riga originale le quantità ricevute e riservate, gli acconti
 * e i saldi in euro e la distinta delle posizioni: sono importi o righe d'ordine
 * che, copiati, verrebbero contati due volte.
 */
export const CAMPI_CHE_SEGUONO_LA_DIVISIONE = [
  "order_id", "name", "description", "natura_riga", "position", "section_id", "notes",
  "purchase_price", "vat_rate", "unit_price", "discount_percent",
  "supplier_id", "stock_item_id", "destination_warehouse_id", "lot_number",
  "status", "fulfillment_status", "auto_deducted", "delivery_date",
  "receipt_id", "shipment_id", "last_goods_receipt_date", "last_shipment_date",
  "is_paid", "paid_date", "payment_method",
  "article_template_id", "product_code", "categoria", "standard_cost",
  "family_id", "axis_selections", "measure_status", "misure_preventivo", "misure_rilevate",
  "measure_variance", "survey_id", "survey_element_id", "installation_id",
  "gruppo_id", "riferimento",
  "misure_da_ordinare", "misura_tipo", "misura_forma", "componente", "gioco_posa_mm", "sfrido",
] as const;

/** Le quantità si confrontano a quattro decimali, come le salva il database. */
const quattroDecimali = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Le parti di una divisione vanno bene? Ognuna maggiore di zero e la somma
 * uguale alla quantità della riga. Un articolo di magazzino si divide a pezzi
 * interi (il magazzino conta pezzi); un materiale in kg, m², m³ anche coi
 * decimali: 12,4 kg in 7,4 + 5.
 */
export function erroreDivisione(
  totale: number,
  parti: ReadonlyArray<{ quantity: number }>,
  articoloDiMagazzino: boolean,
): string | null {
  if (parti.length < 2) return "Servono almeno 2 righe per dividere.";
  if (parti.some((p) => !Number.isFinite(p.quantity) || p.quantity <= 0)) {
    return "Ogni quantità deve essere maggiore di zero.";
  }
  if (articoloDiMagazzino && parti.some((p) => !Number.isInteger(p.quantity))) {
    return "È un articolo di magazzino: si divide a pezzi interi.";
  }
  const somma = quattroDecimali(parti.reduce((acc, p) => acc + p.quantity, 0));
  if (somma !== quattroDecimali(totale)) {
    return `La somma delle quantità deve essere ${quattroDecimali(totale).toLocaleString("it-IT", { maximumFractionDigits: 4 })}.`;
  }
  return null;
}

/** La nuova riga per una parte di un articolo diviso tra le fasi. */
export function parteDivisa(
  original: Record<string, unknown>,
  parte: { phaseId: string | null; quantity: number },
): Record<string, unknown> {
  const riga: Record<string, unknown> = {};
  for (const campo of CAMPI_CHE_SEGUONO_LA_DIVISIONE) {
    if (original[campo] !== undefined) riga[campo] = original[campo];
  }
  riga.quantity = parte.quantity;
  riga.phase_id = parte.phaseId;
  // Una riga legata a un rilievo: la parte porta le stesse misure, ma l'indice «un rilievo,
  // un componente, una riga» vale solo per la riga di partenza. Gli articoli normali non cambiano.
  if (original.survey_element_id || original.measure_status) {
    riga.diviso_da = original.diviso_da ?? original.id;
  }
  return riga;
}

export const MESSAGGIO_ORDINE_NON_DIVISO =
  "Articolo diviso, ma l'ordine d'acquisto copre ancora solo la riga originale. Controlla gli ordini ai fornitori della commessa prima di riordinare.";

export const MESSAGGIO_SCARICO_NON_SPOSTATO =
  "Articolo diviso, ma la quota già scaricata dal magazzino è rimasta sulla riga originale. Avvisa l'ufficio prima dell'installazione, così non si scarica due volte.";

/**
 * Crea le nuove righe di un articolo diviso tra le fasi. `dividi_scarico_magazzino`
 * gira per ogni riga nuova: divide la riga dell'ordine d'acquisto che copre la voce
 * (la nuova resta coperta per la sua parte) e, per un articolo da magazzino, le dà la
 * sua quota dello scarico già fatto: la giacenza non cambia e all'installazione la
 * riga nuova non scarica di nuovo.
 */
export async function creaPartiDivise(
  client: typeof supabase,
  original: Record<string, unknown> & { id: string },
  parti: ReadonlyArray<{ phaseId: string | null; quantity: number }>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  for (const parte of parti) {
    const { data: nuova, error: insError } = await c.from("order_items")
      .insert(parteDivisa(original, parte)).select("id").single();
    if (insError) throw insError;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (client as any).rpc("dividi_scarico_magazzino", {
      p_originale: original.id,
      p_nuova: nuova.id,
      p_quantita: parte.quantity,
    });
    if (rpcError) throw new Error(original.stock_item_id ? MESSAGGIO_SCARICO_NON_SPOSTATO : MESSAGGIO_ORDINE_NON_DIVISO);
  }
}

export interface AddAssignmentPayload {
  phase_id: string | null;
  executor_type: ExecutorType;
  planned_hours?: number | null;
  planned_hourly_rate?: number | null;
  employee_id: string | null;
  external_team_id: string | null;
  /** Anagrafica reale senza squadra collegata: la RPC crea il ponte e assegna insieme. */
  subappaltatore_id?: string;
  cost_preventivo: number;
  cost_consuntivo: number;
  hours: number | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  /** Solo ditte: da dove viene il costo previsto, per ricalcolarlo e spiegarlo. */
  origine_costo?: {
    costo_origine: OrigineCostoDitta;
    tariffa_id: string | null;
    quantita: number | null;
    costo_unitario: number | null;
  } | null;
}

export function useOrderWorkPhases(orderId: string | null | undefined) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const invalidate = () => refreshWorkQueries(qc, orderId, companyId);

  // Ogni mutation fallita mostra un toast (prima: fallimenti silenziosi → spinner
  // infinito nel dialog "Aggiungi esecutore" e input che tornano indietro senza avviso).
  const onError = (e: unknown) =>
    toast.error(messaggioErrore(e));

  // Un salvataggio che il database lascia passare senza scrivere niente (la regola non vede la
  // riga) sembrava riuscito e poi tornava indietro: ora lo si dice, col messaggio dei permessi.
  const scritto = (righe: unknown) => {
    if (!Array.isArray(righe) || righe.length === 0) throw new Error(MESSAGGIO_PERMESSI);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["order_work_phases", orderId, companyId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const [phasesRes, empRes, teamRes] = await Promise.all([
        db.from("order_work_phases").select("*").eq("order_id", orderId!).eq("company_id", companyId!).order("position", { ascending: true }),
        db.from("order_employees").select("id, employee_id, phase_id, total_cost, cost_preventivo, hours_worked, is_paid, paid_date, notes, employee:employees(first_name,last_name,is_active), orders!inner(company_id)").eq("order_id", orderId!).eq("orders.company_id", companyId!).eq("employee.company_id", companyId!),
        db.from("order_external_teams").select("id, external_team_id, phase_id, total_cost, cost_preventivo, vat_rate, tariffa_id, quantita, costo_unitario, costo_origine, is_paid, paid_date, notes, team:external_teams(name,kind,is_active), orders!inner(company_id)").eq("order_id", orderId!).eq("orders.company_id", companyId!).eq("team.company_id", companyId!),
      ]);
      if (phasesRes.error) throw phasesRes.error;
      if (empRes.error) throw empRes.error;
      if (teamRes.error) throw teamRes.error;

      const empAssignments: PhaseAssignment[] = (empRes.data ?? []).map((e: Record<string, unknown>): PhaseAssignment => ({
        id: e.id as string,
        source: "employee",
        phase_id: (e.phase_id as string) ?? null,
        executor_type: "interno",
        employee_id: (e.employee_id as string) ?? null,
        external_team_id: null,
        cost_preventivo: Number(e.cost_preventivo) || 0,
        cost_consuntivo: Number(e.total_cost) || 0,
        hours: e.hours_worked != null ? Number(e.hours_worked) : null,
        is_paid: Boolean(e.is_paid),
        paid_date: (e.paid_date as string) ?? null,
        notes: (e.notes as string) ?? null,
        executor_label: e.employee && typeof e.employee === "object" ? [(e.employee as Record<string, unknown>).first_name, (e.employee as Record<string, unknown>).last_name].filter(v => typeof v === "string").join(" ").trim() || null : null,
        executor_inactive: !!e.employee && (e.employee as Record<string, unknown>).is_active === false,
      }));

      const teamAssignments: PhaseAssignment[] = (teamRes.data ?? []).map((t: Record<string, unknown>): PhaseAssignment => ({
        id: t.id as string,
        source: "team",
        phase_id: (t.phase_id as string) ?? null,
        executor_type: "esterno",
        employee_id: null,
        external_team_id: (t.external_team_id as string) ?? null,
        cost_preventivo: Number(t.cost_preventivo) || 0,
        cost_consuntivo: Number(t.total_cost) || 0,
        vat_rate: t.vat_rate == null ? null : Number(t.vat_rate),
        tariffa_id: (t.tariffa_id as string) ?? null,
        quantita: t.quantita == null ? null : Number(t.quantita),
        costo_unitario: t.costo_unitario == null ? null : Number(t.costo_unitario),
        costo_origine: (t.costo_origine as OrigineCostoDitta) ?? null,
        hours: null,
        is_paid: Boolean(t.is_paid),
        paid_date: (t.paid_date as string) ?? null,
        notes: (t.notes as string) ?? null,
        executor_label: t.team && typeof t.team === "object" && typeof (t.team as Record<string, unknown>).name === "string" ? (t.team as Record<string, unknown>).name as string : null,
        executor_inactive: !!t.team && (t.team as Record<string, unknown>).is_active === false,
        executor_kind: (t.team as {kind?: "interna" | "esterna"} | null)?.kind,
      }));

      const all = [...empAssignments, ...teamAssignments];
      const phases: WorkPhase[] = (phasesRes.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        order_id: p.order_id as string,
        name: p.name as string,
        position: Number(p.position) || 0,
        status: (p.status as PhaseStatus) ?? "da_iniziare",
        start_date: (p.start_date as string) ?? null,
        end_date: (p.end_date as string) ?? null,
        notes: (p.notes as string) ?? null,
        percentuale: Number(p.percentuale) || 0,
        completata_il: p.completata_il ? giornoLocale(p.completata_il as string) : null,
        importo_venduto: p.importo_venduto == null ? null : Number(p.importo_venduto),
        assignments: all.filter((a) => a.phase_id === p.id),
      }));

      const unassigned = all.filter((a) => !a.phase_id);
      return { phases, unassigned, all };
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees_active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, first_name, last_name, user_id")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).map((e: { id: string; first_name: string; last_name: string; user_id: string | null }) => ({
        id: e.id,
        label: `${e.first_name} ${e.last_name}`.trim(),
        campoUserId: e.user_id,
      })) as ExecutorOption[];
    },
  });

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external_teams_active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("external_teams")
        .select("id, name, kind")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      // Manteniamo anche le interne per risolvere le etichette storiche.
      // Solo il selettore di NUOVI subappalti le esclude.
      return (data ?? []).map((t: { id: string; name: string; kind?: "interna" | "esterna" }) => ({
        id: t.id, label: t.name, kind: t.kind,
      })) as ExecutorOption[];
    },
  });

  // Materiali della commessa (order_items) con stato di approvvigionamento:
  // coperti da OdA → "ordinato", collegati a giacenza → "magazzino", altrimenti "da_ordinare".
  // phase_id non è nei tipi generati → db cast.
  const { data: materials = [] } = useQuery({
    queryKey: ["order-items-materials", orderId],
    enabled: !!orderId,
    staleTime: 30000,
    queryFn: async () => {
      const { data: items, error } = await db
        .from("order_items")
        .select("id, name, quantity, phase_id, stock_item_id, supplier_id, purchase_price, vat_rate, unit_price, discount_percent, standard_cost, unita_misura")
        .filter("natura_riga", "eq", "materiale")
        .eq("order_id", orderId!);
      if (error) throw error;
      const rows = (items ?? []) as Record<string, unknown>[];

      // Copertura OdA: order_item_id → numero OdA (stesso pattern di OrderItemsList)
      const odaByItem = new Map<string, string | null>();
      if (rows.length > 0) {
        const { data: coverage, error: covError } = await supabase
          .from("purchase_order_items")
          .select("order_item_id, purchase_orders!inner(oda_number, status)")
          .in("order_item_id", rows.map((r) => r.id as string));
        if (covError) throw covError;
        for (const row of (coverage ?? []) as unknown as Array<{
          order_item_id: string;
          purchase_orders: { oda_number: string; status: string };
        }>) {
          const number = issuedPurchaseOrderNumber(row.purchase_orders);
          if (!row.order_item_id || !number || odaByItem.has(row.order_item_id)) continue;
          odaByItem.set(row.order_item_id, number);
        }
      }

      return rows.map((r): PhaseMaterial => {
        const id = r.id as string;
        const covered = odaByItem.has(id);
        const readiness: MaterialReadiness = covered
          ? "ordinato"
          : r.stock_item_id
            ? "magazzino"
            : "da_ordinare";
        return {
          id,
          name: (r.name as string) ?? "",
          quantity: Number(r.quantity) || 0,
          phase_id: (r.phase_id as string) ?? null,
          supplier_id: (r.supplier_id as string) ?? null,
          purchase_price: r.purchase_price != null ? Number(r.purchase_price) : null,
          vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
          unit_price: r.unit_price != null ? Number(r.unit_price) : null,
          discount_percent: r.discount_percent != null ? Number(r.discount_percent) : null,
          standard_cost: r.standard_cost != null ? Number(r.standard_cost) : null,
          readiness,
          odaNumber: covered ? (odaByItem.get(id) ?? null) : null,
          // Servono a dividere il costo tra le fasi in base alla posa (consumiMateriali): senza, l'unità valeva «pz».
          unita_misura: (r.unita_misura as string) ?? null,
          stock_item_id: (r.stock_item_id as string) ?? null,
        };
      });
    },
  });

  const materialsByPhase = useMemo(() => {
    const map = new Map<string, PhaseMaterial[]>();
    for (const m of materials) {
      if (!m.phase_id) continue;
      const list = map.get(m.phase_id);
      if (list) list.push(m);
      else map.set(m.phase_id, [m]);
    }
    return map;
  }, [materials]);

  const unassignedMaterials = useMemo(
    () => materials.filter((m) => !m.phase_id),
    [materials],
  );

  const phases = data?.phases ?? [];
  const unassigned = data?.unassigned ?? [];
  const allAssignments = data?.all ?? [];

  const addPhase = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await db.from("order_work_phases").insert({
        // In fondo: dopo un'eliminazione «quante sono» ripeteva una posizione già usata.
        company_id: companyId, order_id: orderId, name, position: phases.reduce((m, p) => Math.max(m, Number(p.position ?? -1)), -1) + 1,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });

  const applyTemplate = useMutation({
    // Fasi e sottofasi in un colpo solo, dal server (aggiungi_fasi_commessa): il
    // permesso si controlla là e un modello non resta a metà.
    mutationFn: async (fasi: FaseModello[]) => {
      const { error } = await db.rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });

  const updatePhase = useMutation({
    // "percentuale" è correggibile dall'ufficio: prima l'avanzamento poteva
    // solo salire dai rapportini (Math.max) e un 100 digitato per errore
    // restava per sempre — l'unico rimedio era SQL diretto.
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<WorkPhase, "name" | "status" | "start_date" | "end_date" | "notes" | "position" | "percentuale" | "importo_venduto">>) => {
      // Chi chiude una fase dall'ufficio ne registra il giorno, come l'app di
      // campo (CampoAvanzamento): è la fine reale del cronoprogramma. Prima
      // dall'ufficio non si scriveva mai (06/10/2026: 98 fasi, 0 con la data).
      // Una fase già chiusa che si «richiude» (per esempio «Rettifica
      // avanzamento» salvata a 100) tiene il suo giorno di chiusura: oggi al
      // suo posto farebbe comparire nel cronoprogramma un ritardo che non c'è.
      const giaChiusa = data?.phases.find((p) => p.id === id)?.status === "completata";
      const chiusura = patch.status === undefined
        ? {}
        : patch.status === "completata"
          ? (giaChiusa ? {} : { completata_il: new Date().toISOString(), completata_da: user?.id ?? null })
          : { completata_il: null, completata_da: null };
      const { data: righe, error } = await db
        .from("order_work_phases")
        .update({ ...patch, ...chiusura, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      scritto(righe);
    },
    onSuccess: invalidate,
    onError,
  });

  // L'ordine delle fasi (prima non si poteva cambiare): posizioni 0..n nell'ordine dato.
  const riordinaFasi = useMutation({
    mutationFn: async (ids: ReadonlyArray<string>) => {
      for (const [position, id] of ids.entries()) {
        const { data, error } = await db.from("order_work_phases").update({ position }).eq("id", id).eq("order_id", orderId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Ordine delle fasi non salvato: non hai il permesso di modificarle.");
      }
    },
    onSuccess: invalidate,
    onError,
  });

  const deletePhase = useMutation({
    // ON DELETE SET NULL: le assegnazioni non vengono cancellate, tornano "Senza fase"
    // → nessun costo/margine perso.
    mutationFn: async (id: string) => {
      const { data, error } = await db.from("order_work_phases").delete().eq("id", id).select("id");
      if (error) {
        // Collegata a una variante del cliente, a verifiche, schede o incarichi di subappalto: il database la tiene.
        if ((error as { code?: string }).code === "23503")
          throw new Error("La fase è collegata a una variante, a verifiche o a incarichi di subappalto: non si elimina. Togli prima quei collegamenti, oppure rinominala.");
        throw error;
      }
      if (!data?.length) throw new Error("Fase non eliminata: non hai il permesso o è già stata tolta.");
    },
    onSuccess: invalidate,
    onError,
  });

  const addAssignment = useMutation({
    mutationFn: async (a: AddAssignmentPayload) => {
      if (a.executor_type === "interno") {
        if ((a.hours ?? 0) !== 0 || a.cost_consuntivo !== 0) {
          throw new Error("L'assegnazione non registra ore o spese: usa i rapportini per il consuntivo del dipendente.");
        }
        if (!orderId || !a.employee_id) throw new Error("Scegli la persona da assegnare.");
        // Chi ha «Modifica commesse» assegna le persone (14/11/2026): la funzione del server
        // controlla il permesso e calcola tariffa e costo previsto dalle ore. Prima il browser
        // scriveva la riga a mano, e a chi non era amministratore arrivava un rifiuto generico.
        const rigaId = await assignOfficeEmployee(orderId, { employeeId: a.employee_id }, a.phase_id, a.planned_hours ?? null);
        // Le note sulla persona sono un dato di «Costi e Personale»: senza, il database rifiuta
        // col nome del permesso. L'assegnazione resta fatta, e lo si dice.
        if (a.notes) {
          const { data: righe, error } = await db.from("order_employees").update({ notes: a.notes }).eq("id", rigaId).select("id");
          if (error || !righe?.length) {
            toast.warning("Persona assegnata, ma la nota non è stata salvata", { description: error ? messaggioErrore(error) : MESSAGGIO_PERMESSI });
          }
        }

        // Chi è messo su una fase trova la commessa nell'app da solo, nei
        // giorni della fase: lo fa il database (commessa_allinea_accessi).
        // Qui solo l'avviso quando la persona l'app non ce l'ha.
        const persona = employees.find((e) => e.id === a.employee_id);
        if (persona && !persona.campoUserId) {
          toast.warning(`${persona.label} è al lavoro, ma non ha l'app`, {
            description: "Non vedrà questa commessa sul telefono. Puoi dargli l'app dalla sua scheda in Manodopera.",
          });
        }
      } else {
        if (a.subappaltatore_id) {
          if (!orderId || !companyId || a.external_team_id) throw new Error('Contesto della ditta non valido.');
          const { data: assegnazione, error } = await db.rpc('commessa_assegna_subappaltatore', {
            p_order_id: orderId, p_subappaltatore_id: a.subappaltatore_id, p_phase_id: a.phase_id,
            p_cost_preventivo: a.cost_preventivo, p_cost_consuntivo: a.cost_consuntivo, p_notes: a.notes,
          });
          if (error) throw error;
          // La RPC non conosce l'origine del costo: la si scrive dopo, sulla riga che ha creato.
          if (a.origine_costo && assegnazione) {
            const { data: righeOrigine, error: origineError } = await db.from("order_external_teams")
              .update(a.origine_costo).eq("id", assegnazione).select("id");
            if (origineError || !righeOrigine?.length) {
              toast.warning("Ditta assegnata, ma non ho salvato da dove viene il costo previsto.", {
                description: origineError ? messaggioErrore(origineError) : MESSAGGIO_PERMESSI,
              });
            }
          }
          void qc.invalidateQueries({ queryKey: ['assignment-companies', companyId] });
          void invalidaSquadreCollegate(qc);
          return;
        }
        const { data: team, error: teamError } = await db.from("external_teams")
          .select("id, kind, is_active")
          .eq("id", a.external_team_id)
          .eq("company_id", companyId)
          .maybeSingle();
        if (teamError) throw teamError;
        if (!team || !team.is_active || team.kind === "interna") {
          throw new Error("Seleziona una ditta esterna attiva. I dipendenti delle squadre interne si assegnano come manodopera interna.");
        }
        const { error } = await db.from("order_external_teams").insert({
          order_id: orderId,
          external_team_id: a.external_team_id,
          phase_id: a.phase_id,
          total_cost: a.cost_consuntivo,
          cost_preventivo: a.cost_preventivo,
          is_paid: a.is_paid,
          paid_date: a.paid_date,
          notes: a.notes,
          ...(a.origine_costo ?? {}),
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError,
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, source, patch }: { id: string; source: AssignmentSource; patch: Partial<Pick<PhaseAssignment, "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes" | "costo_origine">> }) => {
      const table = source === "employee" ? "order_employees" : "order_external_teams";
      const row: Record<string, unknown> = {};
      if (patch.cost_preventivo !== undefined) row.cost_preventivo = patch.cost_preventivo;
      // Previsto riscritto a mano: tariffa e quantità non lo spiegano più. Preso dalle voci: lo si dice.
      if (patch.cost_preventivo !== undefined && source === "team") row.costo_origine = patch.costo_origine ?? "manuale";
      if (patch.cost_consuntivo !== undefined) row.total_cost = patch.cost_consuntivo;
      if (patch.hours !== undefined && source === "employee") row.hours_worked = patch.hours;
      // is_paid/paid_date esistono su entrambe le tabelle: gestione uniforme
      if (patch.is_paid !== undefined) {
        row.is_paid = patch.is_paid;
        row.paid_date = patch.is_paid ? new Date().toISOString().slice(0, 10) : null;
      }
      if (patch.paid_date !== undefined) row.paid_date = patch.paid_date;
      if (patch.phase_id !== undefined) row.phase_id = patch.phase_id;
      if (patch.notes !== undefined) row.notes = patch.notes;
      const { data: righe, error } = await db.from(table).update(row).eq("id", id).select("id");
      if (error) throw error;
      scritto(righe);
    },
    onSuccess: invalidate,
    onError,
  });

  // Sposta un articolo su una fase (o lo toglie con phaseId = null)
  const setMaterialPhase = useMutation({
    mutationFn: async ({ itemId, phaseId }: { itemId: string; phaseId: string | null }) => {
      const { data: righe, error } = await db.from("order_items").update({ phase_id: phaseId }).eq("id", itemId).select("id");
      if (error) throw error;
      scritto(righe);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] }),
    onError,
  });

  // Divide un articolo su più fasi ("100 kg usati in più fasi"): la riga
  // originale tiene la prima parte, le parti successive diventano nuove righe
  // order_items con gli stessi dati di stato, listino e consegna (vedi parteDivisa).
  const splitMaterial = useMutation({
    mutationFn: async ({
      itemId,
      parts,
    }: {
      itemId: string;
      parts: { phaseId: string | null; quantity: number }[];
    }) => {
      // Rileggo la riga fresca dal DB: la cache potrebbe essere stantia
      const { data: original, error } = await db
        .from("order_items")
        .select(["id", "quantity", "phase_id", "diviso_da", ...CAMPI_CHE_SEGUONO_LA_DIVISIONE].join(", "))
        .filter("natura_riga", "eq", "materiale")
        .eq("id", itemId)
        .single();
      if (error) throw error;

      const totalQty = Number(original.quantity) || 0;
      const errore = erroreDivisione(totalQty, parts, !!original.stock_item_id);
      if (errore) throw new Error(errore);

      // La riga originale tiene la prima parte
      const { error: updError } = await db
        .from("order_items")
        .update({ quantity: parts[0].quantity, phase_id: parts[0].phaseId })
        .eq("id", itemId);
      if (updError) throw updError;

      // Le altre parti diventano nuove righe con gli stessi dati dell'originale,
      // ognuna con la sua quota di scarico dal magazzino.
      await creaPartiDivise(supabase, original, parts.slice(1));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] });
      // Lista articoli in OrderDetail: quantità e righe sono cambiate
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      toast.success("Materiale diviso su più fasi");
    },
    onError: (e: unknown) => {
      // Anche a metà strada le righe possono essere cambiate: si rileggono.
      qc.invalidateQueries({ queryKey: ["order-items-materials", orderId] });
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      onError(e);
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: async ({ id, source }: { id: string; source: AssignmentSource }) => {
      // Da una funzione del database: col DELETE diretto chi non è amministratore non toglieva niente, senza errori.
      const { error } = await db.rpc("togli_assegnazione", { p_source: source === "employee" ? "employee" : "team", p_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError,
  });

  const totals = allAssignments.reduce(
    (acc, a) => {
      acc.preventivo += Number(a.cost_preventivo) || 0;
      acc.consuntivo += Number(a.cost_consuntivo) || 0;
      return acc;
    },
    { preventivo: 0, consuntivo: 0 },
  );

  return {
    phases,
    unassigned,
    isLoading,
    isError,
    refetch,
    employees,
    externalTeams,
    totals: { ...totals, scostamento: totals.consuntivo - totals.preventivo },
    addPhase,
    applyTemplate,
    updatePhase,
    riordinaFasi,
    deletePhase,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    materialsByPhase,
    unassignedMaterials,
    /** Tutte le righe della commessa e tutte le assegnazioni: servono all'economia delle fasi. */
    materials,
    allAssignments,
    setMaterialPhase,
    splitMaterial,
  };
}
