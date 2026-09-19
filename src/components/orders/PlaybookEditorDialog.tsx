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
 * Dialog (niente route nuove). Salvataggio = replace delle righe del vertical
 * corrente; siccome gli id cambiano a ogni salvataggio, le dipendenze si
 * riscrivono in un secondo passaggio, dopo l'insert (vedi handleSave).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useUfficiAttivi } from "@/hooks/useUffici";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, ArrowDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getOrderPlaybook, PLAYBOOK_LABELS } from "@/lib/orderPlaybook";
import { TICKET_PLAYBOOK } from "@/lib/ticketPlaybook";
import { EVENTI_CHIUSURA, type AmbitoFlusso, type EventoChiusura, type PassoFlusso } from "@/lib/flussoLavoro";

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
}

/** Riga come arriva dal DB. */
interface DbRow {
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

export function PlaybookEditorDialog({ open, onOpenChange, companyId, ambito = "commessa", vertical, onSaved }: PlaybookEditorDialogProps) {
  const v = vertical ?? null;
  const perTicket = ambito === "ticket";
  const playbookKey = getOrderPlaybook(vertical).key;
  // Su assistenza il "mestiere" non c'entra: il percorso predefinito è uno solo.
  const etichettaFlusso = perTicket ? "Assistenza" : PLAYBOOK_LABELS[playbookKey];
  const passiPredefiniti: PassoFlusso[] = perTicket ? TICKET_PLAYBOOK : getOrderPlaybook(vertical).steps;
  // Interruttori separati: chi vuole il flusso automatico sulle commesse non lo
  // vuole per forza anche sui ticket.
  const colonnaAutoApply = perTicket ? "ticket_playbook_auto_apply" : "playbook_auto_apply";
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoApply, setAutoApply] = useState(false);

  const { data: staffUsers = [] } = useCompanyStaffUsers(companyId);
  const { data: uffici = [] } = useUfficiAttivi(companyId);
  const persone = useMemo(
    () => staffUsers.map((p) => ({
      id: p.id,
      nome: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Utente",
    })),
    [staffUsers],
  );

  const { data: autoApplyData } = useQuery({
    queryKey: ["company-playbook-auto-apply", companyId, ambito],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(colonnaAutoApply)
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as Record<string, unknown> | null)?.[colonnaAutoApply]);
    },
  });
  useEffect(() => { if (open) setAutoApply(!!autoApplyData); }, [autoApplyData, open]);

  const toggleAutoApply = async (val: boolean) => {
    setAutoApply(val);
    const { error } = await supabase.from("companies").update({ [colonnaAutoApply]: val } as never).eq("id", companyId);
    if (error) { setAutoApply(!val); toast.error("Non riesco a salvare l'interruttore: " + error.message); }
  };

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
      return (data ?? []) as Array<{ id: string; name: string; position: number }>;
    },
  });

  const { data: dbRows, isLoading, refetch } = useQuery({
    queryKey: ["order-task-template", companyId, ambito, v],
    enabled: open && !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("order_task_template")
        .select("id, titolo, giorni_offset, giorni_dopo_sblocco, priorita, attivo, sort_order, assegna_a_utente, assegna_a_ufficio_id, dipende_da_id, chiudi_su_evento, fase_raggiunta_id")
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
    setRows(
      (dbRows ?? []).map((r) => ({
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
        dipende_da_key: r.dipende_da_id ? keyPerId.get(r.dipende_da_id) ?? null : null,
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
    setRows(steps.map((s, i): Row => ({
      _key: keys[i],
      titolo: s.titolo,
      giorni_offset: s.giorni_offset,
      giorni_dopo_sblocco: i === 0 ? 0 : Math.max(1, s.giorni_offset - steps[i - 1].giorni_offset),
      priorita: s.priorita,
      attivo: true,
      assegna_a_utente: null,
      assegna_a_ufficio_id: null,
      chiudi_su_evento: s.chiudi_su_evento ?? null,
      fase_raggiunta_id: null,
      dipende_da_key: i === 0 ? null : keys[i - 1],
    })));
    toast.info("Flusso standard importato a catena — assegna le persone e salva.");
  };

  const addRow = () => setRows((p) => [...p, {
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
    // Di default il nuovo passo si accoda all'ultimo: è il caso normale.
    dipende_da_key: p.length > 0 ? p[p.length - 1]._key : null,
  }]);

  const updateRow = (key: string, patch: Partial<Row>) => setRows((p) => p.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((p) => p
    .filter((r) => r._key !== key)
    // Chi dipendeva dal passo rimosso torna a partire subito: meglio che
    // restare in attesa di qualcosa che non esiste più.
    .map((r) => (r.dipende_da_key === key ? { ...r, dipende_da_key: null } : r)));

  const handleSave = async () => {
    setSaving(true);
    try {
      const valid = rows.filter((r) => r.titolo.trim());
      // replace: cancella le righe del vertical corrente, reinserisci.
      // .eq("ambito") NON è facoltativo: senza, salvare il flusso commessa
      // cancellerebbe in silenzio quello dell'assistenza (stessa tabella).
      let del = supabase.from("order_task_template").delete()
        .eq("company_id", companyId)
        .eq("ambito", ambito);
      del = v === null ? del.is("vertical", null) : del.eq("vertical", v);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      if (valid.length > 0) {
        const payload = valid.map((r, idx) => ({
          company_id: companyId,
          ambito,
          vertical: v,
          sort_order: idx,
          titolo: r.titolo.trim(),
          giorni_offset: Number(r.giorni_offset) || 0,
          giorni_dopo_sblocco: Number(r.giorni_dopo_sblocco) || 0,
          priorita: r.priorita,
          attivo: r.attivo,
          // Ufficio e persona si escludono: se c'è l'ufficio, la persona resta
          // vuota, altrimenti si finirebbe per non sapere chi comanda.
          assegna_a_utente: r.assegna_a_ufficio_id ? null : r.assegna_a_utente,
          assegna_a_ufficio_id: r.assegna_a_ufficio_id,
          chiudi_su_evento: r.chiudi_su_evento,
          fase_raggiunta_id: perTicket ? null : r.fase_raggiunta_id,
        }));
        // Prima le righe, poi le dipendenze: l'insert non conosce ancora gli id
        // che sta per generare, quindi `dipende_da_id` si scrive in un secondo
        // giro, agganciando per sort_order (univoco dopo il delete qui sopra).
        const { data: inserite, error: insErr } = await supabase
          .from("order_task_template")
          .insert(payload as never)
          .select("id, sort_order");
        if (insErr) throw insErr;

        const idPerPosizione = new Map<number, string>();
        ((inserite ?? []) as unknown as Array<{ id: string; sort_order: number }>)
          .forEach((r) => idPerPosizione.set(Number(r.sort_order), r.id));

        const posizionePerKey = new Map<string, number>();
        valid.forEach((r, idx) => posizionePerKey.set(r._key, idx));

        const dipendenze = valid
          .map((r, idx) => {
            const posPrec = r.dipende_da_key != null ? posizionePerKey.get(r.dipende_da_key) : undefined;
            const id = idPerPosizione.get(idx);
            const idPrec = posPrec != null ? idPerPosizione.get(posPrec) : undefined;
            return id && idPrec ? { id, idPrec } : null;
          })
          .filter((d): d is { id: string; idPrec: string } => d !== null);

        for (const d of dipendenze) {
          const { error } = await supabase
            .from("order_task_template")
            .update({ dipende_da_id: d.idPrec } as never)
            .eq("id", d.id);
          if (error) throw error;
        }
      }
      toast.success("Flusso di lavoro salvato.");
      refetch();
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Errore salvataggio: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            {perTicket ? "Flusso di lavoro assistenza" : "Flusso di lavoro commessa"} · {etichettaFlusso}
          </DialogTitle>
          <DialogDescription>
            Il percorso che segue {perTicket ? "ogni ticket di assistenza" : "ogni commessa"}, passo per passo. Un passo può partire subito con la
            commessa oppure quando si chiude quello prima: in quel caso nasce &laquo;In attesa&raquo;, senza
            scadenza, e si sblocca da solo — con notifica a chi lo riceve — appena tocca a lui.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Applica automaticamente {perTicket ? "ai nuovi ticket" : "alle nuove commesse"}</p>
            <p className="text-xs text-muted-foreground">Ogni {perTicket ? "nuovo ticket" : "nuova commessa"} parte già con questo flusso.</p>
          </div>
          <Switch checked={autoApply} onCheckedChange={toggleAutoApply} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Caricamento…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 border rounded-md">
            <p className="text-sm text-muted-foreground mb-3">{perTicket ? "Nessun flusso personalizzato per l'assistenza." : "Nessun flusso personalizzato per questo mestiere."}</p>
            <Button variant="outline" size="sm" onClick={importaStandard}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Importa il flusso standard {etichettaFlusso}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">…oppure aggiungi i tuoi passi uno a uno.</p>
            <Button variant="ghost" size="sm" className="mt-1" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi passo
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, idx) => {
              // Si può dipendere solo dai passi PRIMA: impedisce gli anelli
              // (due passi che si aspettano a vicenda per sempre) senza dover
              // spiegare all'utente cos'è un anello.
              const precedenti = rows.slice(0, idx).filter((p) => p.titolo.trim());
              const aCatena = r.dipende_da_key != null;
              return (
                <div key={r._key} className="rounded-lg border bg-card p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground w-5 shrink-0 text-center">{idx + 1}</span>
                    <Input
                      value={r.titolo}
                      onChange={(e) => updateRow(r._key, { titolo: e.target.value })}
                      placeholder={perTicket ? "Es. Diagnosi del guasto" : "Es. Emissione fattura di acconto"}
                      className="h-9"
                    />
                    <Select value={r.priorita} onValueChange={(val) => updateRow(r._key, { priorita: val as Row["priorita"] })}>
                      <SelectTrigger className="h-9 w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITA.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5 shrink-0" title="Passo attivo">
                      <Switch checked={r.attivo} onCheckedChange={(val) => updateRow(r._key, { attivo: val })} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => removeRow(r._key)} aria-label="Rimuovi passo">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-7 text-xs text-muted-foreground">
                    <span className="shrink-0">Parte</span>
                    <Select
                      value={r.dipende_da_key ?? SUBITO}
                      onValueChange={(val) => updateRow(r._key, { dipende_da_key: val === SUBITO ? null : val })}
                    >
                      <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SUBITO}>{perTicket ? "subito, col ticket" : "subito, con la commessa"}</SelectItem>
                        {precedenti.map((p, i) => (
                          <SelectItem key={p._key} value={p._key}>
                            dopo: {i + 1}. {p.titolo.trim().slice(0, 40)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {aCatena ? (
                      <>
                        <ArrowDown className="h-3 w-3 shrink-0 text-violet-500" />
                        <span className="shrink-0">da chiudere entro</span>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={r.giorni_dopo_sblocco}
                          onChange={(e) => updateRow(r._key, { giorni_dopo_sblocco: Number(e.target.value) || 0 })}
                          className="h-8 w-[64px] text-xs"
                        />
                        <span className="shrink-0">giorni dallo sblocco</span>
                      </>
                    ) : (
                      <>
                        <span className="shrink-0">con scadenza a</span>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={r.giorni_offset}
                          onChange={(e) => updateRow(r._key, { giorni_offset: Number(e.target.value) || 0 })}
                          className="h-8 w-[64px] text-xs"
                        />
                        <span className="shrink-0">giorni {perTicket ? "dal ticket" : "dalla commessa"}</span>
                      </>
                    )}

                    <span className="shrink-0">·</span>
                    <span className="shrink-0">a</span>
                    <Select
                      value={
                        r.assegna_a_ufficio_id
                          ? PREFISSO_UFFICIO + r.assegna_a_ufficio_id
                          : r.assegna_a_utente ?? RESPONSABILE
                      }
                      onValueChange={(val) => updateRow(r._key, val === RESPONSABILE
                        ? { assegna_a_utente: null, assegna_a_ufficio_id: null }
                        : val.startsWith(PREFISSO_UFFICIO)
                          ? { assegna_a_ufficio_id: val.slice(PREFISSO_UFFICIO.length), assegna_a_utente: null }
                          : { assegna_a_utente: val, assegna_a_ufficio_id: null })}
                    >
                      <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RESPONSABILE}>{perTicket ? "tecnico del ticket" : "responsabile commessa"}</SelectItem>
                        {uffici.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[10px]">Uffici</SelectLabel>
                            {uffici.map((u) => (
                              <SelectItem key={u.id} value={PREFISSO_UFFICIO + u.id}>{u.nome}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        <SelectGroup>
                          <SelectLabel className="text-[10px]">Persone</SelectLabel>
                          {persone.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    <span className="shrink-0">·</span>
                    <span className="shrink-0">si chiude</span>
                    <Select
                      value={r.chiudi_su_evento ?? A_MANO}
                      onValueChange={(val) => updateRow(r._key, {
                        chiudi_su_evento: val === A_MANO ? null : (val as EventoChiusura),
                      })}
                    >
                      <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={A_MANO}>a mano, con la spunta</SelectItem>
                        {EVENTI_CHIUSURA.map((e) => (
                          <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Chiudere il passo sposta la commessa nella fase scelta: chi
                      guarda l'elenco commesse vede a che punto è senza aprirle. */}
                  {!perTicket && fasi.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-7 text-xs text-muted-foreground">
                      <span className="shrink-0">Quando si chiude, la commessa passa a</span>
                      <Select
                        value={r.fase_raggiunta_id ?? STESSA_FASE}
                        onValueChange={(val) => updateRow(r._key, { fase_raggiunta_id: val === STESSA_FASE ? null : val })}
                      >
                        <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={STESSA_FASE}>nessun cambio di fase</SelectItem>
                          {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Il passo "aspetta l'incasso" non è lavoro di nessuno: qui
                      si dice al gestionale di accorgersene da solo. */}
                  {r.chiudi_su_evento && (
                    <p className="pl-7 text-[11px] text-emerald-700">
                      {EVENTI_CHIUSURA.find((e) => e.value === r.chiudi_su_evento)?.spiegazione}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi passo
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={importaStandard}>
                <Sparkles className="h-4 w-4 mr-1" /> Reimporta standard
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio…" : "Salva flusso"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
