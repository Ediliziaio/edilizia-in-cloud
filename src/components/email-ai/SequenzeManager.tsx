/**
 * SequenzeManager — MP-EMAIL-AI-13 · follow-up, solleciti e sequenze in uscita
 *
 * Tre aree:
 *  1) Da approvare — invii pronti (modalità 'conferma'): l'azienda rivede e invia.
 *  2) Le tue sequenze — editor con approvazione obbligatoria + scelta
 *     modalità (conferma | automatico) come da richiesta.
 *  3) In corso — cruscotto esecuzioni: a chi, a che step, con stop alla risposta.
 *
 * Regola d'oro: niente invio senza che l'azienda l'abbia approvato (default
 * 'conferma'); chi vuole può passare la singola sequenza in 'automatico'.
 */
import { useMemo, useState } from "react";
import {
  Send, Plus, Trash2, Play, Pause, Ban, ShieldCheck, Clock, CheckCircle2,
  XCircle, MailWarning, Loader2, Pencil, Save, AlertTriangle, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSequenze, useSalvaSequenza, useApprovaAttivaSequenza, useSequenzeEsecuzioni,
  useInviiInAttesa, useGestisciInvioSequenza, useStatoEsecuzioneSequenza, useEnrollSequenza,
  type Sequenza, type SequenzaStepDef,
} from "@/lib/email-ai/hooks";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const TIPI: { v: Sequenza["tipo"]; label: string }[] = [
  { v: "followup_preventivo", label: "Follow-up preventivo" },
  { v: "sollecito_pagamento", label: "Sollecito pagamento" },
  { v: "ricontatto_opportunita", label: "Ricontatto opportunità" },
  { v: "conferma_appuntamento", label: "Conferma appuntamento" },
  { v: "altro", label: "Altro" },
];
const tipoLabel = (v: string) => TIPI.find((t) => t.v === v)?.label ?? v;

const STATO_BADGE: Record<string, { label: string; cls: string }> = {
  attiva: { label: "In corso", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  in_attesa_conferma: { label: "Attende conferma", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  in_pausa: { label: "In pausa", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  fermata_risposta: { label: "Fermata: ha risposto", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  completata: { label: "Completata", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  opt_out: { label: "Disiscritto", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  bounce: { label: "Indirizzo errato", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  annullata: { label: "Annullata", cls: "border-slate-200 bg-slate-50 text-slate-500" },
};

function nuovaBozza(companyId: string): Partial<Sequenza> & { company_id: string } {
  return {
    company_id: companyId,
    nome: "",
    tipo: "followup_preventivo",
    modalita_invio: "conferma",
    limite_invii_giorno: 50,
    oauth_connection_id: null,
    step: [{ offset_giorni: 3, oggetto: "", corpo_template: "" }],
  };
}

export function SequenzeManager() {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sequenze, isLoading: loadingSeq } = useSequenze();
  const { data: esecuzioni } = useSequenzeEsecuzioni();
  const { data: inAttesa } = useInviiInAttesa();
  const salva = useSalvaSequenza();
  const approva = useApprovaAttivaSequenza();
  const gestisci = useGestisciInvioSequenza();
  const statoEsec = useStatoEsecuzioneSequenza();
  const enroll = useEnrollSequenza();

  const [editor, setEditor] = useState<(Partial<Sequenza> & { company_id: string }) | null>(null);
  const [enrollFor, setEnrollFor] = useState<Sequenza | null>(null);

  const attive = useMemo(
    () => (esecuzioni || []).filter((e) => ["attiva", "in_attesa_conferma", "in_pausa"].includes(e.stato)),
    [esecuzioni],
  );

  if (!companyId) {
    return <p className="p-4 text-sm text-muted-foreground">{t("Nessuna azienda selezionata.")}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Principio guida */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <p className="text-xs text-blue-900">
          {t("Le sequenze si fermano")} <b>{t("da sole")}</b> {t("appena il destinatario risponde. Di default ogni invio è una")} <b>{t("bozza che approvi tu")}</b>{t("; puoi mettere una sequenza in automatico nelle sue impostazioni.")}
        </p>
      </div>

      {/* 1) DA APPROVARE */}
      {(inAttesa?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <MailWarning className="h-4 w-4" /> {t("Da approvare ({n})", { n: inAttesa!.length })}
          </h3>
          {inAttesa!.map((inv) => (
            <div key={inv.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-sm font-medium text-slate-800">{inv.oggetto || t("(senza oggetto)")}</p>
              {inv.corpo_anteprima && (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">{inv.corpo_anteprima}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-8 gap-1.5"
                  disabled={gestisci.isPending}
                  onClick={() => gestisci.mutate({ invio_id: inv.id, outbox_id: inv.outbox_id, azione: "inviato" })}>
                  <Send className="h-3.5 w-3.5" /> {t("Approva e invia")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5"
                  disabled={gestisci.isPending}
                  onClick={() => gestisci.mutate({ invio_id: inv.id, outbox_id: inv.outbox_id, azione: "saltato" })}>
                  <XCircle className="h-3.5 w-3.5" /> {t("Salta")}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 2) LE TUE SEQUENZE */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{t("Le tue sequenze")}</h3>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setEditor(nuovaBozza(companyId))}>
            <Plus className="h-4 w-4" /> {t("Nuova")}
          </Button>
        </div>

        {loadingSeq ? (
          <p className="text-xs text-muted-foreground">{t("Caricamento…")}</p>
        ) : (sequenze?.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed bg-slate-50/50 p-4 text-center">
            <Clock className="mx-auto mb-1 h-5 w-5 text-slate-400" />
            <p className="text-xs text-muted-foreground">
              {t("Nessuna sequenza. Crea il tuo primo follow-up: niente più preventivi dimenticati.")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sequenze!.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-800">{s.nome || t("(senza nome)")}</span>
                    <Badge variant="outline" className="text-[10px]">{t(tipoLabel(s.tipo))}</Badge>
                    <Badge variant="outline" className={s.modalita_invio === "automatico"
                      ? "border-orange-200 bg-orange-50 text-[10px] text-orange-700"
                      : "border-blue-200 bg-blue-50 text-[10px] text-blue-700"}>
                      {s.modalita_invio === "automatico" ? t("Automatico") : t("Conferma")}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("{n} step · max {limite}/giorno", { n: s.step?.length ?? 0, limite: String(s.limite_invii_giorno ?? "") })}
                    {s.attiva ? ` ${t("· attiva")}` : ` ${t("· in bozza")}`}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Modifica")}
                  onClick={() => setEditor({ ...s })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {s.attiva ? (
                  <>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5"
                      onClick={() => setEnrollFor(s)}>
                      <UserPlus className="h-3.5 w-3.5" /> {t("Arruola")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5"
                      disabled={approva.isPending}
                      onClick={() => approva.mutate({ id: s.id, attiva: false })}>
                      <Pause className="h-3.5 w-3.5" /> {t("Sospendi")}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="h-8 gap-1.5"
                    disabled={approva.isPending || (s.step?.length ?? 0) === 0}
                    onClick={() => approva.mutate({ id: s.id, attiva: true })}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("Approva e attiva")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3) IN CORSO */}
      {attive.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">{t("In corso ({n})", { n: attive.length })}</h3>
          <div className="space-y-1.5">
            {attive.map((e) => {
              const b = STATO_BADGE[e.stato] ?? { label: e.stato, cls: "border-slate-200 bg-slate-50 text-slate-600" };
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">
                      {e.destinatario_nome || e.destinatario}
                      <span className="ml-1 text-[11px] text-muted-foreground">· {e.sequenza?.nome ?? t(tipoLabel(e.sequenza?.tipo ?? ""))}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("Step {n}", { n: e.step_corrente + 1 })}
                      {e.prossimo_invio_at ? ` · ${t("prossimo: {data}", { data: new Intl.DateTimeFormat(intlCampo(), { day: "2-digit", month: "short" }).format(new Date(e.prossimo_invio_at)) })}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${b.cls}`}>{t(b.label)}</Badge>
                  {e.stato === "in_pausa" ? (
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Riprendi")}
                      onClick={() => statoEsec.mutate({ id: e.id, stato: "attiva" })}>
                      <Play className="h-4 w-4 text-blue-600" />
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Pausa")}
                      onClick={() => statoEsec.mutate({ id: e.id, stato: "in_pausa" })}>
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Annulla")}
                    onClick={() => statoEsec.mutate({ id: e.id, stato: "annullata" })}>
                    <Ban className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {editor && (
        <SequenzaEditor
          value={editor}
          saving={salva.isPending}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={() => salva.mutate(editor, { onSuccess: () => setEditor(null) })}
        />
      )}

      {enrollFor && (
        <EnrollDialog
          sequenza={enrollFor}
          enrolling={enroll.isPending}
          onClose={() => setEnrollFor(null)}
          onEnroll={(p) => enroll.mutate(
            { sequenza_id: enrollFor.id, ...p },
            { onSuccess: () => setEnrollFor(null) },
          )}
        />
      )}
    </div>
  );
}

// ── Arruola destinatario ("attiva follow-up") ────────────────────────────────
function EnrollDialog({
  sequenza, enrolling, onClose, onEnroll,
}: {
  sequenza: Sequenza;
  enrolling: boolean;
  onClose: () => void;
  onEnroll: (p: { destinatario: string; destinatario_nome?: string; variabili?: Record<string, unknown> }) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [importo, setImporto] = useState("");
  const [numero, setNumero] = useState("");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("Arruola in “{nome}”", { nome: String(sequenza.nome ?? "") })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("Il primo messaggio partirà dopo {n} giorni. Si fermerà da solo se il destinatario risponde.", { n: sequenza.step?.[0]?.offset_giorni ?? 0 })}
          </p>
          <div>
            <Label htmlFor="en-email">{t("Email destinatario")}</Label>
            <Input id="en-email" type="email" value={email} placeholder="cliente@esempio.it"
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="en-nome">{t("Nome (per {variabile})", { variabile: "{{nome}}" })}</Label>
            <Input id="en-nome" value={nome} placeholder="Mario Rossi" onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="en-imp">{t("Importo ({variabile})", { variabile: "{{importo}}" })}</Label>
              <Input id="en-imp" value={importo} placeholder="1.500 €" onChange={(e) => setImporto(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="en-num">{t("Numero ({variabile})", { variabile: "{{numero}}" })}</Label>
              <Input id="en-num" value={numero} placeholder="PR-2026-014" onChange={(e) => setNumero(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{t("Annulla")}</Button>
          <Button className="gap-1.5" disabled={!emailOk || enrolling}
            onClick={() => onEnroll({
              destinatario: email.trim(),
              destinatario_nome: nome.trim() || undefined,
              variabili: {
                ...(nome.trim() ? { nome: nome.trim() } : {}),
                ...(importo.trim() ? { importo: importo.trim() } : {}),
                ...(numero.trim() ? { numero: numero.trim() } : {}),
              },
            })}>
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t("Attiva follow-up")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Editor dialog ────────────────────────────────────────────────────────────
function SequenzaEditor({
  value, saving, onChange, onClose, onSave,
}: {
  value: Partial<Sequenza> & { company_id: string };
  saving: boolean;
  onChange: (v: Partial<Sequenza> & { company_id: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const tr = useT();
  const steps = value.step ?? [];
  const isMarketing = value.tipo === "ricontatto_opportunita" || value.tipo === "altro";

  const setStep = (i: number, patch: Partial<SequenzaStepDef>) =>
    onChange({ ...value, step: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addStep = () =>
    onChange({ ...value, step: [...steps, { offset_giorni: (steps.at(-1)?.offset_giorni ?? 0) + 4, oggetto: "", corpo_template: "" }] });
  const delStep = (i: number) => onChange({ ...value, step: steps.filter((_, idx) => idx !== i) });

  const valido = !!value.nome?.trim() && steps.length > 0 && steps.every((s) => s.oggetto.trim() && s.corpo_template.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.id ? tr("Modifica sequenza") : tr("Nuova sequenza")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="seq-nome">{tr("Nome")}</Label>
              <Input id="seq-nome" value={value.nome ?? ""} placeholder={tr("Es. Sollecito preventivi 7 giorni")}
                onChange={(e) => onChange({ ...value, nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="seq-tipo">{tr("Tipo")}</Label>
              <Select value={value.tipo} onValueChange={(v) => onChange({ ...value, tipo: v as Sequenza["tipo"] })}>
                <SelectTrigger id="seq-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPI.map((t) => <SelectItem key={t.v} value={t.v}>{tr(t.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Modalità invio — la scelta richiesta */}
          <div className="rounded-md border bg-slate-50/60 p-2.5">
            <Label htmlFor="seq-mod" className="text-sm">{tr("Come inviare")}</Label>
            <Select value={value.modalita_invio} onValueChange={(v) => onChange({ ...value, modalita_invio: v as "conferma" | "automatico" })}>
              <SelectTrigger id="seq-mod" className="mt-1 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conferma">{tr("Conferma (consigliato): prepariamo il messaggio, lo approvi tu")}</SelectItem>
                <SelectItem value="automatico">{tr("Automatico: invio da solo (si ferma comunque a risposta/bounce)")}</SelectItem>
              </SelectContent>
            </Select>
            {value.modalita_invio === "automatico" && (
              <p className="mt-1.5 flex items-start gap-1 text-[11px] text-orange-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {tr("In automatico i messaggi partono senza chiederti conferma. Si fermano comunque appena il destinatario risponde, in caso di bounce o disiscrizione.")}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="seq-limite">{tr("Limite invii al giorno (azienda)")}</Label>
            <Input id="seq-limite" type="number" min={1} max={500} value={value.limite_invii_giorno ?? 50}
              onChange={(e) => onChange({ ...value, limite_invii_giorno: Math.max(1, Math.min(500, Number(e.target.value) || 50)) })} />
          </div>

          {/* Step */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tr("Passi della sequenza")}</Label>
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addStep}>
                <Plus className="h-3.5 w-3.5" /> {tr("Passo")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr("Variabili disponibili:")} <code>{"{{nome}}"}</code> <code>{"{{importo}}"}</code> <code>{"{{numero}}"}</code> <code>{"{{scadenza}}"}</code>
            </p>
            {steps.map((s, i) => (
              <div key={i} className="rounded-md border p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">{tr("Passo {i}", { i: i + 1 })}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {tr("dopo")}
                    <Input type="number" min={0} className="h-7 w-16" value={s.offset_giorni}
                      onChange={(e) => setStep(i, { offset_giorni: Math.max(0, Number(e.target.value) || 0) })} />
                    {tr("giorni")}
                  </div>
                  {steps.length > 1 && (
                    <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label={tr("Rimuovi passo")} onClick={() => delStep(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  )}
                </div>
                <Input className="mb-2 h-8" placeholder={tr("Oggetto")} value={s.oggetto}
                  onChange={(e) => setStep(i, { oggetto: e.target.value })} />
                <Textarea rows={3} placeholder={tr("Testo del messaggio…")} value={s.corpo_template}
                  onChange={(e) => setStep(i, { corpo_template: e.target.value })} />
              </div>
            ))}
            {isMarketing && (
              <p className="text-[11px] text-amber-700">
                {tr("Sequenza commerciale: aggiungeremo automaticamente un link di disiscrizione (richiesto dalla normativa).")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{tr("Annulla")}</Button>
          <Button className="gap-1.5" disabled={!valido || saving} onClick={onSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tr("Salva bozza")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
