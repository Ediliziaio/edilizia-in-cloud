/**
 * Editor del Flusso di lavoro commessa (per-azienda, per mestiere).
 *
 * Gestisce le righe di `order_task_template`. Ogni riga è un passo del flusso:
 *   • QUANDO parte — subito con la commessa (scadenza = data commessa + giorni)
 *     oppure dopo che si è chiuso un altro passo (scadenza = giorno dello
 *     sblocco + giorni);
 *   • CHI lo riceve — una persona dello staff, o il responsabile della commessa.
 *
 * Il passaggio di consegne lo fa il DB (trigger `sblocca_task_a_catena`): quando
 * si chiude un passo, il successivo smette di essere "In attesa", prende la
 * scadenza e il suo assegnatario riceve la notifica nella campanella.
 *
 * Dialog (niente route nuove). Salvataggio atomico di righe, dipendenze e
 * applicazione automatica, conservando gli id e verificando la versione letta.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useUfficiAttivi } from "@/hooks/useUffici";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Sparkles,
  ChevronDown,
  GitBranch,
  Clock3,
  UserRound,
  Settings2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { OfficeSelect } from "./OfficeSelect";
import { getOrderPlaybook, PLAYBOOK_LABELS } from "@/lib/orderPlaybook";
import { TICKET_PLAYBOOK } from "@/lib/ticketPlaybook";
import { OFFICE_STAGES, officeStage } from "@/lib/orders/officeWorkspace";
import {
  EVENTI_CHIUSURA,
  type AmbitoFlusso,
  type EventoChiusura,
  type PassoFlusso,
} from "@/lib/flussoLavoro";

interface PlaybookEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Commesse (default) o ticket di assistenza: cambia il flusso che si sta modificando. */
  ambito?: AmbitoFlusso;
  /** Mestiere per le commesse, categoria del ticket per l'assistenza. */
  vertical?: string | null;
  onSaved?: () => void;
}

interface Row {
  id?: string;
  office_stage: string;
  _key: string;
  titolo: string;
  /** Giorni dalla data della commessa. Vale solo per i passi che partono subito. */
  giorni_offset: number;
  /** Giorni concessi a partire dallo sblocco. Vale solo per i passi a catena. */
  giorni_dopo_sblocco: number;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  attivo: boolean;
  /** Persona che riceve il passo; null = responsabile della commessa. */
  assegna_a_utente: string | null;
  /** Ufficio che riceve il passo; se valorizzato vince sulla persona. */
  assegna_a_ufficio_id: string | null;
  /** _key del passo che deve chiudersi prima; null = parte subito. */
  dipende_da_key: string | null;
  /** Fatto che chiude il passo da solo; null = lo spunta una persona. */
  chiudi_su_evento: EventoChiusura | null;
  /** Fase in cui passa la commessa quando il passo si chiude; null = resta dov'è. */
  fase_raggiunta_id: string | null;
  /** Fase dell'ufficio (vista Cantiere → Ufficio) invece che attività generica. */
  ufficio: boolean;
  /** Nome della fase del cantiere da aspettare; vuoto = nessuna attesa. */
  dopo_fase_lavorazione: string;
}

/** Riga come arriva dal DB. */
interface DbRow {
  updated_at: string;
  office_stage: string | null;
  id: string;
  titolo: string;
  giorni_offset: number;
  giorni_dopo_sblocco: number | null;
  priorita: string;
  attivo: boolean;
  sort_order: number;
  assegna_a_utente: string | null;
  assegna_a_ufficio_id: string | null;
  dipende_da_id: string | null;
  chiudi_su_evento: string | null;
  fase_raggiunta_id: string | null;
  activity_scope: string | null;
  dopo_fase_lavorazione: string | null;
}

const PRIORITA = ["bassa", "normale", "alta", "urgente"] as const;

const SUBITO = "__subito__";
const RESPONSABILE = "__responsabile__";
/** Prefisso per distinguere un ufficio da una persona nello stesso menu. */
const PREFISSO_UFFICIO = "uff:";
/** Il passo lo chiude una persona spuntandolo. */
const A_MANO = "__a_mano__";
/** Chiudere il passo non cambia la fase della commessa. */
const STESSA_FASE = "__stessa_fase__";

function newKey() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlaybookEditorDialog({
  open,
  onOpenChange,
  companyId,
  ambito = "commessa",
  vertical,
  onSaved,
}: PlaybookEditorDialogProps) {
  const v = vertical ?? null;
  const perTicket = ambito === "ticket";
  const playbookKey = getOrderPlaybook(vertical).key;
  // Su assistenza il "mestiere" non c'entra: il percorso predefinito è uno solo.
  const etichettaFlusso = perTicket
    ? "Assistenza"
    : PLAYBOOK_LABELS[playbookKey];
  const passiPredefiniti: PassoFlusso[] = perTicket
    ? TICKET_PLAYBOOK
    : getOrderPlaybook(vertical).steps;
  // Interruttori separati: chi vuole il flusso automatico sulle commesse non lo
  // vuole per forza anche sui ticket.
  const colonnaAutoApply = perTicket
    ? "ticket_playbook_auto_apply"
    : "playbook_auto_apply";
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoApply, setAutoApply] = useState(false);

  const { data: staffUsers = [] } = useCompanyStaffUsers(companyId);
  const { data: uffici = [] } = useUfficiAttivi(companyId);
  const persone = useMemo(
    () =>
      staffUsers.map((p) => ({
        id: p.id,
        nome: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Utente",
      })),
    [staffUsers],
  );

  const { data: autoApplyData } = useQuery({
    queryKey: ["company-playbook-auto-apply", companyId, ambito],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(colonnaAutoApply)
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(
        (data as Record<string, unknown> | null)?.[colonnaAutoApply],
      );
    },
  });
  useEffect(() => {
    // Restore the server snapshot only when the dialog opens or loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setAutoApply(!!autoApplyData);
  }, [autoApplyData, open]);

  const toggleAutoApply = (val: boolean) => setAutoApply(val);

  // Chiave propria: la stessa di OrderDetail con un select diverso
  // avvelenerebbe la cache di entrambe le schermate.
  const { data: fasi = [] } = useQuery({
    queryKey: ["order-statuses-flusso", companyId],
    enabled: open && !!companyId && !perTicket,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, position")
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        position: number;
      }>;
    },
  });

  const {
    data: dbRows,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["order-task-template", companyId, ambito, v],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: open && !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("order_task_template")
        .select(
          "id, titolo, giorni_offset, giorni_dopo_sblocco, priorita, attivo, sort_order, assegna_a_utente, assegna_a_ufficio_id, dipende_da_id, chiudi_su_evento, fase_raggiunta_id, activity_scope, dopo_fase_lavorazione, office_stage, updated_at",
        )
        .eq("company_id", companyId)
        .eq("ambito", ambito)
        .order("sort_order", { ascending: true });
      q = v === null ? q.is("vertical", null) : q.eq("vertical", v);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DbRow[];
    },
  });

  useEffect(() => {
    if (!open) return;
    // Gli id del DB diventano _key locali: così `dipende_da_id` si riaggancia
    // alla riga giusta anche dopo che il salvataggio li avrà rigenerati.
    const keyPerId = new Map<string, string>();
    (dbRows ?? []).forEach((r) => keyPerId.set(r.id, newKey()));
    // Snapshot initialization is bounded by query changes, never by user input.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(
      (dbRows ?? []).map((r) => ({
        id: r.id,
        office_stage: officeStage(r.office_stage),
        _key: keyPerId.get(r.id)!,
        titolo: r.titolo,
        giorni_offset: Number(r.giorni_offset) || 0,
        giorni_dopo_sblocco: Number(r.giorni_dopo_sblocco) || 0,
        priorita: (r.priorita as Row["priorita"]) ?? "normale",
        attivo: r.attivo ?? true,
        assegna_a_utente: r.assegna_a_utente ?? null,
        assegna_a_ufficio_id: r.assegna_a_ufficio_id ?? null,
        chiudi_su_evento: (r.chiudi_su_evento as EventoChiusura | null) ?? null,
        fase_raggiunta_id: r.fase_raggiunta_id ?? null,
        ufficio: r.activity_scope === "ufficio",
        dopo_fase_lavorazione: r.dopo_fase_lavorazione ?? "",
        dipende_da_key: r.dipende_da_id
          ? (keyPerId.get(r.dipende_da_id) ?? null)
          : null,
      })),
    );
  }, [dbRows, open]);

  /**
   * Importa il flusso del mestiere GIÀ A CATENA: ogni passo parte quando si
   * chiude il precedente. È il motivo per cui esiste questa schermata — chi
   * importa vuole il processo, non un elenco. I giorni fra un passo e l'altro
   * si ricavano dalla distanza fra gli offset dello standard.
   */
  const importaStandard = () => {
    const steps = passiPredefiniti;
    const keys = steps.map(() => newKey());
    setRows(
      steps.map(
        (s, i): Row => ({
          office_stage: officeStage(s.office_stage),
          _key: keys[i],
          titolo: s.titolo,
          giorni_offset: s.giorni_offset,
          giorni_dopo_sblocco:
            i === 0
              ? 0
              : Math.max(1, s.giorni_offset - steps[i - 1].giorni_offset),
          priorita: s.priorita,
          attivo: true,
          assegna_a_utente: null,
          assegna_a_ufficio_id: null,
          chiudi_su_evento: s.chiudi_su_evento ?? null,
          fase_raggiunta_id: null,
          ufficio: s.activity_scope === "ufficio",
          dopo_fase_lavorazione: s.dopo_fase_lavorazione ?? "",
          dipende_da_key: i === 0 ? null : keys[i - 1],
        }),
      ),
    );
    toast.info(
      "Flusso standard importato a catena — assegna le persone e salva.",
    );
  };

  const addRow = () =>
    setRows((p) => [
      ...p,
      {
        office_stage: "altro",
        _key: newKey(),
        titolo: "",
        giorni_offset: 0,
        giorni_dopo_sblocco: 2,
        priorita: "normale",
        attivo: true,
        assegna_a_utente: null,
        assegna_a_ufficio_id: null,
        chiudi_su_evento: null,
        fase_raggiunta_id: null,
        ufficio: false,
        dopo_fase_lavorazione: "",
        // Di default il nuovo passo si accoda all'ultimo: è il caso normale.
        dipende_da_key: p.length > 0 ? p[p.length - 1]._key : null,
      },
    ]);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((p) => p.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setRows((p) =>
      p
        .filter((r) => r._key !== key)
        // Chi dipendeva dal passo rimosso torna a partire subito: meglio che
        // restare in attesa di qualcosa che non esiste più.
        .map((r) =>
          r.dipende_da_key === key ? { ...r, dipende_da_key: null } : r,
        ),
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isLoading || isFetching || isError || !dbRows)
        throw new Error("Ricarica il modello prima di salvare.");
      if (rows.some((r) => !r.titolo.trim()))
        throw new Error("Completa il titolo di ogni passo prima di salvare.");
      const payload = rows.map((r, idx) => ({
        id: r.id ?? null,
        titolo: r.titolo.trim(),
        giorni_offset: Number(r.giorni_offset) || 0,
        giorni_dopo_sblocco: Number(r.giorni_dopo_sblocco) || 0,
        priorita: r.priorita,
        attivo: r.attivo,
        assegna_a_utente: r.assegna_a_ufficio_id ? null : r.assegna_a_utente,
        assegna_a_ufficio_id: r.assegna_a_ufficio_id,
        chiudi_su_evento: r.chiudi_su_evento,
        fase_raggiunta_id: perTicket ? null : r.fase_raggiunta_id,
        activity_scope: perTicket
          ? "generale"
          : r.ufficio || r.assegna_a_ufficio_id
            ? "ufficio"
            : "generale",
        dopo_fase_lavorazione: perTicket
          ? null
          : r.dopo_fase_lavorazione.trim() || null,
        office_stage: perTicket ? null : r.office_stage,
        dipende_da_posizione: r.dipende_da_key
          ? rows.findIndex((p) => p._key === r.dipende_da_key)
          : null,
      }));
      // One transaction includes dependencies and the automatic-application switch.
      // No destructive fallback if the endpoint is unavailable.
      const { error } = await supabase.rpc(
        "salva_flusso_lavoro_atomico" as never,
        {
          p_company_id: companyId,
          p_ambito: ambito,
          p_vertical: v,
          p_rows: payload,
          p_expected: dbRows.map((r) => ({
            id: r.id,
            updated_at: r.updated_at,
          })),
          p_auto_apply: autoApply,
        } as never,
      );
      if (error) throw error;
      toast.success("Flusso di lavoro salvato.");
      refetch();
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        "Errore salvataggio: " + (e instanceof Error ? e.message : "riprova"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:rounded-3xl">
        <DialogHeader className="shrink-0 border-b px-6 pb-5 pt-6 pr-12">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-600">
            <GitBranch className="h-4 w-4" /> Modello aziendale ·{" "}
            {etichettaFlusso}
          </div>
          <DialogTitle className="text-xl">
            {perTicket
              ? "Flusso di lavoro assistenza"
              : "Flusso di lavoro commessa"}
          </DialogTitle>
          <DialogDescription className="max-w-2xl leading-relaxed">
            Definisci chi fa cosa e quando. I passi collegati aspettano il
            precedente; le opzioni avanzate gestiscono eventi e passaggi di
            stato.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 px-4 py-5 sm:px-6">
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border bg-background p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Applica automaticamente{" "}
                {perTicket ? "ai nuovi ticket" : "alle nuove commesse"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Si attiva dopo «Salva flusso». Le{" "}
                {perTicket ? "richieste" : "commesse"} esistenti non cambiano.
              </p>
            </div>
            <Switch
              aria-label="Applica automaticamente"
              checked={autoApply}
              onCheckedChange={toggleAutoApply}
              disabled={autoApplyData === undefined || saving}
            />
          </div>

          {isError ? (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/20 bg-background p-4 text-sm text-destructive"
            >
              Modello non disponibile. Nessuna modifica salvata.{" "}
              <button onClick={() => void refetch()} className="underline">
                Riprova
              </button>
            </p>
          ) : isLoading || isFetching ? (
            <p
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              Caricamento…
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
              <Sparkles className="mx-auto mb-3 h-7 w-7 text-orange-500" />
              <h3 className="font-semibold">
                Disegna il percorso del tuo team
              </h3>
              <p className="mx-auto mb-5 mt-2 max-w-md text-sm text-muted-foreground">
                Parti dal modello {etichettaFlusso} oppure aggiungi un’attività.
                Potrai cambiare responsabili, tempi e dipendenze prima di
                salvare.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button className="rounded-xl" onClick={importaStandard}>
                  Importa il flusso standard {etichettaFlusso}
                </Button>
                <Button
                  className="rounded-xl"
                  variant="outline"
                  onClick={addRow}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Aggiungi passo
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                aria-label="Riepilogo modello"
              >
                <span className="rounded-full border bg-background px-3 py-1.5">
                  {rows.filter((r) => r.attivo).length} passi attivi
                </span>
                <span className="rounded-full border bg-background px-3 py-1.5">
                  {rows.filter((r) => r.attivo && !r.dipende_da_key).length} con
                  avvio immediato
                </span>
                <span className="rounded-full border bg-background px-3 py-1.5">
                  {rows.filter((r) => r.attivo && r.dipende_da_key).length}{" "}
                  collegati a un altro passo
                </span>
              </div>
              <ol className="space-y-4" aria-label="Passi del flusso">
                {rows.map((r, idx) => {
                  const precedenti = rows
                    .slice(0, idx)
                    .filter((p) => p.titolo.trim());
                  const aCatena = r.dipende_da_key != null;
                  const previous = rows.find(
                    (p) => p._key === r.dipende_da_key,
                  );
                  const isOffice = r.ufficio || !!r.assegna_a_ufficio_id;
                  const assignee = r.assegna_a_ufficio_id
                    ? "Ufficio · " +
                      (uffici.find((u) => u.id === r.assegna_a_ufficio_id)
                        ?.nome ?? "non disponibile")
                    : r.assegna_a_utente
                      ? (persone.find((p) => p.id === r.assegna_a_utente)
                          ?.nome ?? "Persona non disponibile")
                      : perTicket
                        ? "Tecnico del ticket"
                        : "Responsabile commessa";
                  return (
                    <li key={r._key} className="relative pl-10 sm:pl-12">
                      {idx < rows.length - 1 && (
                        <div
                          aria-hidden="true"
                          className="absolute bottom-[-1rem] left-3.5 top-9 w-px bg-border sm:left-4"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 sm:h-8 sm:w-8"
                      >
                        {idx + 1}
                      </span>
                      <div
                        className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${!r.attivo ? "border-dashed bg-muted/40" : ""}`}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <Input
                                aria-label={`Titolo del passo ${idx + 1}`}
                                value={r.titolo}
                                onChange={(e) =>
                                  updateRow(r._key, { titolo: e.target.value })
                                }
                                placeholder={
                                  perTicket
                                    ? "Es. Diagnosi del guasto"
                                    : "Es. Conferma capitolato"
                                }
                                className="h-10 rounded-xl font-medium"
                                disabled={saving}
                              />
                            </div>
                            <div className="flex h-10 items-center gap-2 pl-1">
                              <Switch
                                aria-label={`Passo ${idx + 1} attivo`}
                                checked={r.attivo}
                                disabled={saving}
                                onCheckedChange={(attivo) =>
                                  updateRow(r._key, { attivo })
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={saving}
                                className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                onClick={() => removeRow(r._key)}
                                aria-label={`Rimuovi passo ${idx + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {!perTicket && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Dove si svolge
                                </span>
                                <OfficeSelect
                                  label={`Ambito del passo ${idx + 1}`}
                                  value={isOffice ? "ufficio" : "operativa"}
                                  disabled={saving || !!r.assegna_a_ufficio_id}
                                  onValueChange={(value) =>
                                    updateRow(r._key, {
                                      ufficio: value === "ufficio",
                                    })
                                  }
                                  options={[
                                    {
                                      value: "ufficio",
                                      label: "Attività d’ufficio",
                                    },
                                    {
                                      value: "operativa",
                                      label: "Attività operativa",
                                    },
                                  ]}
                                />
                              </div>
                              {isOffice && (
                                <div className="space-y-1.5">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Fase dell’ufficio
                                  </span>
                                  <OfficeSelect
                                    label={`Gruppo del passo ${idx + 1}`}
                                    value={r.office_stage}
                                    disabled={saving}
                                    onValueChange={(office_stage) =>
                                      updateRow(r._key, { office_stage })
                                    }
                                    options={OFFICE_STAGES.map(
                                      ([value, label]) => ({ value, label }),
                                    )}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_130px]">
                            <div className="min-w-0 space-y-1.5">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <GitBranch className="h-3.5 w-3.5" /> Quando
                                parte
                              </span>
                              <OfficeSelect
                                label={`Avvio del passo ${idx + 1}`}
                                value={r.dipende_da_key ?? SUBITO}
                                disabled={saving}
                                onValueChange={(val) =>
                                  updateRow(r._key, {
                                    dipende_da_key: val === SUBITO ? null : val,
                                  })
                                }
                                options={[
                                  {
                                    value: SUBITO,
                                    label: perTicket
                                      ? "Subito, con il ticket"
                                      : "Subito, con la commessa",
                                  },
                                  ...precedenti.map((p) => ({
                                    value: p._key,
                                    label: `Dopo ${rows.indexOf(p) + 1}. ${p.titolo.trim()}`,
                                  })),
                                ]}
                              />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <UserRound className="h-3.5 w-3.5" />{" "}
                                Responsabile
                              </span>
                              <OfficeSelect
                                label={`Responsabile del passo ${idx + 1}`}
                                value={
                                  r.assegna_a_ufficio_id
                                    ? PREFISSO_UFFICIO + r.assegna_a_ufficio_id
                                    : (r.assegna_a_utente ?? RESPONSABILE)
                                }
                                disabled={saving}
                                onValueChange={(val) =>
                                  updateRow(
                                    r._key,
                                    val === RESPONSABILE
                                      ? {
                                          assegna_a_utente: null,
                                          assegna_a_ufficio_id: null,
                                        }
                                      : val.startsWith(PREFISSO_UFFICIO)
                                        ? {
                                            assegna_a_utente: null,
                                            assegna_a_ufficio_id: val.slice(
                                              PREFISSO_UFFICIO.length,
                                            ),
                                          }
                                        : {
                                            assegna_a_utente: val,
                                            assegna_a_ufficio_id: null,
                                          },
                                  )
                                }
                                options={[
                                  {
                                    value: RESPONSABILE,
                                    label: perTicket
                                      ? "Tecnico del ticket"
                                      : "Responsabile commessa",
                                  },
                                  ...uffici.map((u) => ({
                                    value: PREFISSO_UFFICIO + u.id,
                                    label: "Ufficio · " + u.nome,
                                  })),
                                  ...persone.map((p) => ({
                                    value: p.id,
                                    label: p.nome,
                                  })),
                                  ...(r.assegna_a_utente &&
                                  !persone.some(
                                    (p) => p.id === r.assegna_a_utente,
                                  )
                                    ? [
                                        {
                                          value: r.assegna_a_utente,
                                          label: "Persona non disponibile",
                                        },
                                      ]
                                    : []),
                                  ...(r.assegna_a_ufficio_id &&
                                  !uffici.some(
                                    (u) => u.id === r.assegna_a_ufficio_id,
                                  )
                                    ? [
                                        {
                                          value:
                                            PREFISSO_UFFICIO +
                                            r.assegna_a_ufficio_id,
                                          label: "Ufficio non disponibile",
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                            <label className="space-y-1.5">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" /> Entro giorni
                              </span>
                              <Input
                                aria-label={`Giorni del passo ${idx + 1}`}
                                type="number"
                                min={0}
                                max={3650}
                                inputMode="numeric"
                                disabled={saving}
                                value={
                                  aCatena
                                    ? r.giorni_dopo_sblocco
                                    : r.giorni_offset
                                }
                                onChange={(e) =>
                                  updateRow(
                                    r._key,
                                    aCatena
                                      ? {
                                          giorni_dopo_sblocco:
                                            Number(e.target.value) || 0,
                                        }
                                      : {
                                          giorni_offset:
                                            Number(e.target.value) || 0,
                                        },
                                  )
                                }
                                className="h-10 rounded-xl"
                              />
                            </label>
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {!r.attivo
                              ? "Passo disattivato: non verrà creato. "
                              : ""}
                            {aCatena
                              ? `Aspetta «${previous?.titolo || "il passo precedente"}»: poi avrà ${r.giorni_dopo_sblocco} giorni per essere completato.`
                              : `Scadenza a ${r.giorni_offset} giorni dalla creazione ${perTicket ? "del ticket" : "della commessa"}.`}{" "}
                            Assegnato a: {assignee}.
                          </p>
                        </div>

                        <details className="group border-t bg-muted/10">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 sm:px-5 [&::-webkit-details-marker]:hidden">
                            <span className="flex items-center gap-2">
                              <Settings2 className="h-3.5 w-3.5" /> Opzioni
                              avanzate
                              {r.chiudi_su_evento ||
                              r.dopo_fase_lavorazione ||
                              r.fase_raggiunta_id
                                ? " · configurate"
                                : ""}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                          </summary>
                          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium">
                                Priorità
                              </span>
                              <OfficeSelect
                                label={`Priorità del passo ${idx + 1}`}
                                value={r.priorita}
                                disabled={saving}
                                onValueChange={(val) =>
                                  updateRow(r._key, {
                                    priorita: val as Row["priorita"],
                                  })
                                }
                                options={PRIORITA.map((value) => ({
                                  value,
                                  label:
                                    value[0].toUpperCase() + value.slice(1),
                                }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium">
                                Come si completa
                              </span>
                              <OfficeSelect
                                label={`Completamento del passo ${idx + 1}`}
                                value={r.chiudi_su_evento ?? A_MANO}
                                disabled={saving}
                                onValueChange={(val) =>
                                  updateRow(r._key, {
                                    chiudi_su_evento:
                                      val === A_MANO
                                        ? null
                                        : (val as EventoChiusura),
                                  })
                                }
                                options={[
                                  {
                                    value: A_MANO,
                                    label: "A mano, con la spunta",
                                  },
                                  ...EVENTI_CHIUSURA.map((e) => ({
                                    value: e.value,
                                    label: e.label,
                                  })),
                                ]}
                              />
                            </div>
                            {!perTicket && (
                              <>
                                <label className="space-y-1.5">
                                  <span className="text-xs font-medium">
                                    Aspetta anche una fase del cantiere
                                  </span>
                                  <Input
                                    value={r.dopo_fase_lavorazione}
                                    disabled={saving}
                                    placeholder="Nessuna · es. Rilievo misure"
                                    onChange={(e) =>
                                      updateRow(r._key, {
                                        dopo_fase_lavorazione: e.target.value,
                                      })
                                    }
                                    className="h-10 rounded-xl"
                                    aria-label={`Fase del cantiere da aspettare: ${r.titolo || "passo"}`}
                                  />
                                  <span className="block text-xs leading-relaxed text-muted-foreground">
                                    Usa il nome esatto della fase prevista nella
                                    commessa.
                                  </span>
                                </label>
                                {fasi.length > 0 && (
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-medium">
                                      Al completamento, stato commessa
                                    </span>
                                    <OfficeSelect
                                      label={`Stato raggiunto dal passo ${idx + 1}`}
                                      value={r.fase_raggiunta_id ?? STESSA_FASE}
                                      disabled={saving}
                                      onValueChange={(val) =>
                                        updateRow(r._key, {
                                          fase_raggiunta_id:
                                            val === STESSA_FASE ? null : val,
                                        })
                                      }
                                      options={[
                                        {
                                          value: STESSA_FASE,
                                          label: "Non cambiare lo stato",
                                        },
                                        ...fasi.map((f) => ({
                                          value: f.id,
                                          label: f.name,
                                        })),
                                      ]}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                            {r.chiudi_su_evento && (
                              <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-800 dark:bg-blue-950 dark:text-blue-200 sm:col-span-2">
                                {
                                  EVENTI_CHIUSURA.find(
                                    (e) => e.value === r.chiudi_su_evento,
                                  )?.spiegazione
                                }
                              </p>
                            )}
                          </div>
                        </details>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 flex flex-wrap justify-between gap-2 pl-10 sm:pl-12">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={addRow}
                  disabled={saving}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Aggiungi passo
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl text-muted-foreground"
                  onClick={importaStandard}
                  disabled={saving}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Reimporta standard
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 sm:items-center sm:justify-between">
          <p className="mb-2 text-xs text-muted-foreground sm:mb-0">
            Le modifiche restano in bozza fino al salvataggio.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              className="rounded-xl"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button
              className="rounded-xl"
              onClick={handleSave}
              disabled={
                saving ||
                isLoading ||
                isFetching ||
                isError ||
                autoApplyData === undefined
              }
            >
              {saving ? "Salvataggio…" : "Salva flusso"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
