import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CrewSnapshot } from "@/lib/orders/internalTeamRoster";
import { crewShiftChanges, crewShiftError, overlappingShifts, replaceShiftParticipant, shiftFingerprint, shiftHours, type CrewShift, type CrewShiftDraft } from "@/lib/orders/internalTeamShift";
import { OfficeSelect } from "./OfficeSelect";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  snapshot: CrewSnapshot;
  phases: { id: string; name: string }[];
  workDate: string;
  shifts: CrewShift[];
  canPlan: boolean;
  onSave: (draft: CrewShiftDraft & { operationId: string }) => Promise<void>;
  onReload: () => void;
}
const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

export function InternalTeamShiftEditor({ snapshot, phases, workDate, shifts, canPlan, onSave, onReload }: Props) {
  const t = useT();
  const uid = useId();
  const [base] = useState(snapshot);
  const [draft, setDraft] = useState<CrewShiftDraft>(() => ({
    shiftId: crypto.randomUUID(), expectedVersion: null, rosterVersion: snapshot.roster.version ?? "",
    workDate, startTime: "08:00", endTime: "12:00", phaseId: null,
    employeeIds: [...snapshot.roster.employeeIds], leaderEmployeeId: snapshot.roster.leaderEmployeeId,
    notes: "", status: "planned",
  }));
  const [search, setSearch] = useState("");
  const [absentId, setAbsentId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const stale = base.roster.version !== snapshot.roster.version || base.teamId !== snapshot.teamId;
  const changes = crewShiftChanges(base, draft.employeeIds);
  const invalid = crewShiftError(draft, snapshot, phases.map(p => p.id));
  const conflicts = overlappingShifts(draft, shifts);
  const disabled = saving || !canPlan || stale || !snapshot.teamActive;
  const selected = new Set(draft.employeeIds);
  const baseIds = new Set(base.roster.employeeIds);
  const people = snapshot.employees.filter(e => (e.active || selected.has(e.id)) && e.name.toLocaleLowerCase("it").includes(search.toLocaleLowerCase("it")));
  const missing = draft.employeeIds.filter(id => !snapshot.employees.some(e => e.id === id));
  const canReplace = !disabled && !!replaceShiftParticipant(draft, absentId, replacementId, snapshot);
  const names = (ids: string[]) => ids.map(id => snapshot.employees.find(e => e.id === id)?.name ?? t("Persona non più disponibile")).join(", ");
  const patch = (next: Partial<CrewShiftDraft>) => { setDraft(d => ({ ...d, ...next })); setError(null); };
  const toggle = (id: string) => patch({ employeeIds: selected.has(id) ? draft.employeeIds.filter(e => e !== id) : [...draft.employeeIds, id], leaderEmployeeId: selected.has(id) && draft.leaderEmployeeId === id ? null : draft.leaderEmployeeId });
  const save = async () => {
    if (inFlight.current || disabled || invalid || conflicts.length) return;
    inFlight.current = true; setSaving(true); setError(null);
    const fingerprint = shiftFingerprint(draft);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, operationId: crypto.randomUUID() };
    try { await onSave({ ...draft, operationId: request.current.operationId }); }
    catch (e) { setError(e instanceof Error ? e.message : t("Turno non salvato. Riprova.")); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div role="region" aria-label={t("Dettagli del turno")} tabIndex={0} className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium">{t("Pianificazione, non consuntivo")}</p>
      <p className="mt-1 text-muted-foreground">{t("Questo turno non registra ore lavorate o costi e non concede accessi Campo. Gli incarichi già attivi restano invariati.")}</p>
    </div>
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-sm font-semibold">{t("Quando e dove lavorano")}</legend>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1"><Label htmlFor={`${uid}-date`}>{t("Giorno")}</Label><Input className="min-w-0" id={`${uid}-date`} type="date" min="2000-01-01" max="2100-12-31" value={draft.workDate} onChange={e => patch({ workDate: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-start`}>{t("Dalle")}</Label><Input className="min-w-0" id={`${uid}-start`} type="time" value={draft.startTime} onChange={e => patch({ startTime: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-end`}>{t("Alle")}</Label><Input className="min-w-0" id={`${uid}-end`} type="time" value={draft.endTime} onChange={e => patch({ endTime: e.target.value })} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor={`${uid}-phase`}>{t("Lavorazione")}</Label><OfficeSelect id={`${uid}-phase`} label={t("Lavorazione")} className="min-w-0" value={draft.phaseId ?? ""} onValueChange={v => patch({ phaseId: v || null })} options={[{ value: "", label: t("Intera commessa") }, ...phases.map(p => ({ value: p.id, label: p.name }))]} /></div>
    </fieldset>
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold">{t("Chi sarà presente · {n} persone", { n: selected.size })}</legend>
      <p className="text-xs text-muted-foreground">{t("Togli chi non partecipa. Seleziona un altro dipendente per aggiungere un sostituto: la squadra abituale non cambia.")}</p>
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">{t("Sostituisci una persona solo in questo turno")}</summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-absent`}>{t("Chi non partecipa")}</Label><OfficeSelect id={`${uid}-absent`} label={t("Chi non partecipa")} className="min-w-0" value={absentId} onValueChange={setAbsentId} options={[{ value: "", label: t("Scegli una persona prevista") }, ...snapshot.employees.filter(e => selected.has(e.id)).map(e => ({ value: e.id, label: e.name }))]} /></div>
          <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-replacement`}>{t("Chi viene al suo posto")}</Label><OfficeSelect id={`${uid}-replacement`} label={t("Chi viene al suo posto")} className="min-w-0" value={replacementId} onValueChange={setReplacementId} options={[{ value: "", label: t("Scegli il sostituto") }, ...snapshot.employees.filter(e => e.active && !selected.has(e.id)).map(e => ({ value: e.id, label: e.name }))]} /></div>
        </div>
        <Button variant="outline" size="sm" className="mt-3" disabled={!canReplace} onClick={() => {
          if (disabled) return;
          const next = replaceShiftParticipant(draft, absentId, replacementId, snapshot);
          if (next) { setDraft(next); setError(null); setAbsentId(""); setReplacementId(""); }
        }}>{t("Applica alla bozza")}</Button>
        <p className="mt-2 text-xs text-muted-foreground">{t("Poi conferma con Pianifica turno. Se escludi il referente, scegli chi lo sostituisce nel ruolo.")}</p>
      </details>
      <Input aria-label={t("Cerca persona nel turno")} placeholder={t("Cerca un dipendente…")} value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
        {people.map(e => <label key={e.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/40">
          <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={selected.has(e.id)} disabled={disabled || (!e.active && !selected.has(e.id))} onChange={() => toggle(e.id)} />
          <span className="min-w-0 break-words text-sm"><span className="font-medium">{e.name}</span><span className="block text-xs text-muted-foreground">{!e.active ? t("Non attivo · rimuovilo dal turno") : baseIds.has(e.id) ? t("Squadra abituale") : t("Sostituto / rinforzo")}{" · "}{!e.userId ? t("senza account collegato") : t("account collegato")}</span></span>
        </label>)}
        {!people.length && <p className="p-2 text-sm text-muted-foreground">{t("Nessun dipendente trovato.")}</p>}
        {missing.map(id => <div className="flex flex-wrap items-center gap-2 p-2 text-sm" key={id}><span>{t("Dipendente non più disponibile")}</span><Button variant="outline" size="sm" onClick={() => toggle(id)}>{t("Rimuovi dalla selezione")}</Button></div>)}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{t("{esclusi} non previsti · {sostituti} sostituti / rinforzi · {senzaAccount} senza account", { esclusi: changes.excluded.length, sostituti: changes.replacements.length, senzaAccount: changes.noAccount.length })}</p>
      {(changes.excluded.length > 0 || changes.replacements.length > 0) && <div className="rounded-lg bg-muted/30 p-3 text-xs" aria-live="polite">
        {changes.excluded.length > 0 && <p>{t("Non partecipano: {nomi}", { nomi: names(changes.excluded) })}</p>}
        {changes.replacements.length > 0 && <p>{t("Persone aggiunte: {nomi}", { nomi: names(changes.replacements) })}</p>}
        <p className="mt-1 text-muted-foreground">{t("Solo questo turno: la squadra abituale resta invariata.")}</p>
      </div>}
      <div className="space-y-1"><Label htmlFor={`${uid}-leader`}>{t("Referente del turno")}</Label><OfficeSelect id={`${uid}-leader`} label={t("Referente del turno")} className="min-w-0" value={draft.leaderEmployeeId ?? ""} onValueChange={v => patch({ leaderEmployeeId: v || null })} options={[{ value: "", label: t("Nessun referente") }, ...snapshot.employees.filter(e => selected.has(e.id) && e.active).map(e => ({ value: e.id, label: e.name }))]} /><p className="text-xs text-muted-foreground">{t("È un riferimento organizzativo: non diventa automaticamente capocantiere nell'app.")}</p></div>
      <div className="space-y-1"><Label htmlFor={`${uid}-notes`}>{t("Indicazioni per il turno")} <span className="text-muted-foreground">{t("(facoltative)")}</span></Label><Textarea id={`${uid}-notes`} maxLength={1000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} placeholder={t("Es. ritrovo in deposito; materiale da portare")} /></div>
    </fieldset>
    {stale && <p role="alert" className="text-sm text-destructive">{t("La composizione è cambiata in un'altra sessione. La tua selezione è conservata: ricarica prima di confermare.")}</p>}
    {invalid && !stale && <p role="status" className="text-sm text-destructive">{invalid}</p>}
    {!!conflicts.length && <p role="alert" className="text-sm text-destructive">{t("Una persona selezionata ha già un turno sovrapposto in questa commessa.")}</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="rounded-lg bg-muted/30 p-3 text-sm"><span className="font-medium">{t("{n} persone · {ore} ore di fascia oraria", { n: selected.size, ore: shiftHours(draft)?.toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) ?? "—" })}</span><p className="mt-1 text-xs text-muted-foreground">{t("Pause e viaggi vanno distinti dalle ore lavorate nel rapportino. Il controllo automatico copre i nuovi turni, non appuntamenti e assegnazioni precedenti.")}</p></div>
    </div>
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background pt-3">
      <Button variant="ghost" size="sm" disabled={saving} onClick={onReload}>{t("Scarta e ricarica")}</Button>
      <Button disabled={disabled || !!invalid || !!conflicts.length} onClick={() => void save()}>{saving ? t("Salvataggio…") : t("Pianifica turno")}</Button>
    </div>
  </div>;
}
