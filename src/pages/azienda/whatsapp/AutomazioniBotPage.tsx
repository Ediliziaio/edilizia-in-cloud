// La scheda «Automazioni» del WhatsApp hub: le cose che il bot fa da solo
// (report del mattino, le cose del giorno agli operai, avvisi, promemoria
// appuntamenti). Il titolare le crea e le gestisce qui, in parole semplici,
// senza toccare il codice. Niente termini tecnici in schermata.

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, ClipboardCheck, ListChecks, Loader2, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useWhatsAppNumbersByPurpose } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import {
  useBotRoutine,
  useEliminaBotRoutine,
  useSalvaBotRoutine,
  useToggleBotRoutine,
  type BotRoutine,
  type BotRoutineDestinatari,
  type BotRoutineRegole,
  type BotRoutineTipo,
} from "@/hooks/whatsapp/useBotRoutine";
import { useWAMetaTemplates } from "@/hooks/whatsapp/useWAMetaTemplates";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const TIPO_LABEL: Record<BotRoutineTipo, string> = {
  report_mattino: "Report del mattino",
  todo_operaio: "Le cose del giorno agli operai",
  avviso: "Avvisi",
  promemoria_appuntamento: "Promemoria appuntamenti",
  rapportino_sera: "Rapportino della sera",
};

const TIPO_DESC: Record<BotRoutineTipo, string> = {
  report_mattino: "Ogni mattina un riepilogo: commesse attive, incassi da fare, materiale sotto scorta. Le persone scelte qui ricevono anche il brief di Silvio nella chat dell'app: spenta questa automazione, il brief non parte.",
  todo_operaio: "Ogni operaio riceve la lista dei suoi cantieri del giorno, con indirizzo e con chi lavora.",
  avviso: "Ti segnala incassi in ritardo, preventivi visti ma senza risposta e materiale sotto scorta.",
  promemoria_appuntamento: "Un promemoria poco prima di ogni appuntamento, a chi è assegnato.",
  rapportino_sera: "All'ora scelta scrive a chi oggi era in cantiere e non ha mandato il rapportino; a te l'elenco di chi manca.",
};

const TIPO_ICON: Record<BotRoutineTipo, typeof Sun> = {
  report_mattino: Sun,
  todo_operaio: ListChecks,
  avviso: Bell,
  promemoria_appuntamento: CalendarClock,
  rapportino_sera: ClipboardCheck,
};

const TEMPLATE_DEFAULT: Record<BotRoutineTipo, string | null> = {
  report_mattino: "report_operativo_mattino",
  todo_operaio: "todo_operaio_giorno",
  avviso: null,
  promemoria_appuntamento: null,
  rapportino_sera: "promemoria_rapportino_sera",
};

const GIORNI = [
  { n: 1, label: "Lun" },
  { n: 2, label: "Mar" },
  { n: 3, label: "Mer" },
  { n: 4, label: "Gio" },
  { n: 5, label: "Ven" },
  { n: 6, label: "Sab" },
  { n: 7, label: "Dom" },
];

type ScelaChi = "me" | "responsabili" | "persona";

function destToScelta(dest: BotRoutineDestinatari | null | undefined, userId: string | null): { scelta: ScelaChi; personaId: string | null } {
  const utenti = dest?.utenti ?? [];
  const ruoli = dest?.ruoli ?? [];
  if (ruoli.includes("admin")) return { scelta: "responsabili", personaId: null };
  if (utenti.length > 0) {
    if (userId && utenti.includes(userId) && utenti.length === 1) return { scelta: "me", personaId: null };
    return { scelta: "persona", personaId: utenti[0] };
  }
  return { scelta: "responsabili", personaId: null };
}

function sceltaToDest(scelta: ScelaChi, personaId: string | null, userId: string | null): BotRoutineDestinatari {
  if (scelta === "responsabili") return { ruoli: ["admin"] };
  if (scelta === "me") return { utenti: userId ? [userId] : [] };
  return { utenti: personaId ? [personaId] : [] };
}

type Traduci = ReturnType<typeof useT>;

function riassuntoQuando(r: BotRoutine, t: Traduci): string {
  if (r.tipo === "promemoria_appuntamento") {
    const min = r.regole?.anticipo_min ?? 120;
    return min >= 60 ? t("{n} h prima", { n: Math.round(min / 60) }) : t("{n} min prima", { n: min });
  }
  const ora = (r.ora ?? "").slice(0, 5) || "—";
  const g = r.giorni ?? [1, 2, 3, 4, 5];
  const tutti = g.length === 7;
  const feriali = g.length === 5 && [1, 2, 3, 4, 5].every((x) => g.includes(x));
  const quali = tutti ? t("tutti i giorni") : feriali ? t("lun–ven") : g.map((n) => GIORNI.find((x) => x.n === n)?.label).filter((l): l is string => Boolean(l)).map((l) => t(l)).join(", ");
  return t("alle {ora}, {quali}", { ora, quali });
}

function riassuntoChi(r: BotRoutine, nomePersona: (id: string) => string, t: Traduci): string {
  if (r.tipo === "todo_operaio") return t("a ogni operaio con lavori quel giorno");
  if (r.tipo === "rapportino_sera") {
    const { scelta, personaId } = destToScelta(r.destinatari, null);
    if (scelta === "responsabili") return t("a chi non l'ha mandato; l'elenco ai responsabili");
    if (scelta === "persona" && personaId) return t("a chi non l'ha mandato; l'elenco a {nome}", { nome: nomePersona(personaId) });
    return t("a chi non l'ha mandato; l'elenco a te");
  }
  const { scelta, personaId } = destToScelta(r.destinatari, null);
  if (scelta === "responsabili") return t("ai responsabili");
  if (scelta === "persona" && personaId) return t("a {nome}", { nome: nomePersona(personaId) });
  return t("a una persona");
}

export default function AutomazioniBotPage() {
  const t = useT();
  const [scopoPrima, scopoDopo = ""] = t("Le automazioni partono dal numero WhatsApp con scopo {scopo}. Collegane uno nella scheda Numeri e torna qui.").split("{scopo}");
  const [vuotoPrima, vuotoDopo = ""] = t("Non hai ancora nessuna automazione. Premi {nuova} per farne partire una.").split("{nuova}");
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const numbers = useWhatsAppNumbersByPurpose();
  const operativo = (numbers.byPurpose.bot_operativo ?? [])[0];
  const { data: routines, isLoading, isError, error } = useBotRoutine(companyId);
  // I modelli Meta approvati: fuori dalle 24 ore il bot può scrivere solo con quelli.
  const { data: modelli, isSuccess: modelliLetti } = useWAMetaTemplates(operativo?.id);
  const { data: staff = [] } = useCompanyStaffUsers(companyId, "all");
  const toggle = useToggleBotRoutine(companyId);
  const elimina = useEliminaBotRoutine(companyId);

  const [editing, setEditing] = useState<Partial<BotRoutine> | null>(null);

  const nomePersona = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || t("una persona")]));
    return (id: string) => map.get(id) ?? t("una persona");
  }, [staff, t]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!operativo) {
    return (
      <div className="p-4 md:p-0">
        <Card className="p-6 border-dashed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">{t("Prima collega il numero dei cantieri")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {scopoPrima}<strong>{t("Operativo / Cantieri")}</strong>{scopoDopo}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 md:p-0">
        <Card className="p-6 border-destructive/20 bg-destructive/5">
          <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? t("Automazioni non caricate.")}</p>
        </Card>
      </div>
    );
  }

  const lista = routines ?? [];

  return (
    <div className="space-y-6 p-4 md:p-0">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("Le automazioni sono le cose che il bot fa da solo, senza che glielo chieda: il riepilogo del mattino, le cose del giorno a ogni operaio, gli avvisi e i promemoria degli appuntamenti.")}
        </p>
        <Button onClick={() => setEditing({ tipo: "report_mattino" })} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> {t("Nuova")}
        </Button>
      </div>

      {lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {vuotoPrima}<strong>{t("Nuova")}</strong>{vuotoDopo}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((r) => {
            const Icon = TIPO_ICON[r.tipo];
            return (
              <Card key={r.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base">{t(TIPO_LABEL[r.tipo])}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{t(TIPO_DESC[r.tipo])}</p>
                        <p className="text-xs text-foreground mt-2">
                          {riassuntoChi(r, nomePersona, t)} · {riassuntoQuando(r, t)}
                        </p>
                        {modelliLetti && r.template_nome && !(modelli ?? []).some((m) => m.template_name === r.template_nome) && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t("Manca il modello Meta «{template_nome}» approvato: arriva solo a chi ha scritto al bot nelle ultime 24 ore.", { template_nome: r.template_nome })}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={r.attiva}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ id: r.id, attiva: v })}
                        aria-label={t("Attiva {nome}", { nome: t(TIPO_LABEL[r.tipo]) })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>{t("Modifica")}</Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("Elimina")}
                        onClick={() => {
                          if (confirm(t("Vuoi eliminare questa automazione?"))) elimina.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <EditorAutomazione
          iniziale={editing}
          companyId={companyId}
          waNumberId={operativo.id}
          userId={userId}
          staff={staff}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditorAutomazione({
  iniziale,
  companyId,
  waNumberId,
  userId,
  staff,
  onClose,
}: {
  iniziale: Partial<BotRoutine>;
  companyId: string | null;
  waNumberId: string;
  userId: string | null;
  staff: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  onClose: () => void;
}) {
  const tr = useT();
  const [dopoPrima, dopoDopo = ""] = tr("dopo {n} giorni").split("{n}");
  const salva = useSalvaBotRoutine(companyId);
  const [tipo, setTipo] = useState<BotRoutineTipo>(iniziale.tipo ?? "report_mattino");
  const [ora, setOra] = useState<string>((iniziale.ora ?? "07:00").slice(0, 5));
  const [giorni, setGiorni] = useState<number[]>(iniziale.giorni ?? [1, 2, 3, 4, 5]);
  const chiIniziale = destToScelta(iniziale.destinatari, userId);
  const [scelta, setScelta] = useState<ScelaChi>(chiIniziale.scelta);
  const [personaId, setPersonaId] = useState<string | null>(chiIniziale.personaId);
  const [regole, setRegole] = useState<BotRoutineRegole>(iniziale.regole ?? {});
  const [ai, setAi] = useState<boolean>(iniziale.regole?.ai !== false);

  const isNuova = !iniziale.id;
  const mostraOrario = tipo !== "promemoria_appuntamento";
  const mostraChi = tipo !== "todo_operaio";
  const mostraAI = tipo !== "promemoria_appuntamento";

  const toggleGiorno = (n: number) =>
    setGiorni((g) => (g.includes(n) ? g.filter((x) => x !== n) : [...g, n].sort((a, b) => a - b)));

  const onSalva = () => {
    if (mostraOrario && !ora) {
      toast.error(tr("Scegli l'ora"));
      return;
    }
    if (mostraOrario && giorni.length === 0) {
      toast.error(tr("Scegli almeno un giorno"));
      return;
    }
    const regoleFinali: BotRoutineRegole =
      tipo === "avviso"
        ? {
            fattura_scaduta: regole.fattura_scaduta ?? true,
            preventivo_fermo: regole.preventivo_fermo ?? true,
            sotto_scorta: regole.sotto_scorta ?? true,
            preventivo_giorni: regole.preventivo_giorni ?? 3,
            ai,
          }
        : tipo === "promemoria_appuntamento"
          ? { anticipo_min: regole.anticipo_min ?? 120 }
          // Le altre regole della routine (es. i numeri ammessi di una prova) restano.
          : { ...regole, ai };

    salva.mutate(
      {
        id: iniziale.id,
        tipo,
        wa_number_id: iniziale.wa_number_id ?? waNumberId,
        attiva: iniziale.attiva ?? true,
        ora: mostraOrario ? ora : null,
        giorni,
        destinatari: mostraChi ? sceltaToDest(scelta, personaId, userId) : {},
        regole: regoleFinali,
        template_nome: iniziale.template_nome ?? TEMPLATE_DEFAULT[tipo],
      },
      {
        onSuccess: () => {
          toast.success(isNuova ? tr("Automazione creata") : tr("Automazione aggiornata"));
          onClose();
        },
        onError: (e: Error) => toast.error(tr("Non salvata"), { description: e.message }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNuova ? tr("Nuova automazione") : tr("Modifica automazione")}</DialogTitle>
          <DialogDescription>{tr(TIPO_DESC[tipo])}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{tr("Cosa manda")}</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as BotRoutineTipo)} disabled={!isNuova}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as BotRoutineTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{tr(TIPO_LABEL[t])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mostraAI && (
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{tr("Scrivi con l'AI")}</p>
                <p className="text-[11px] text-muted-foreground">{tr("Testo più curato e ordinato per priorità. Se spento, usa il testo standard.")}</p>
              </div>
              <Switch checked={ai} onCheckedChange={setAi} aria-label={tr("Scrivi con l'AI")} />
            </div>
          )}

          {mostraChi && (
            <div className="space-y-1">
              <Label>{tipo === "rapportino_sera" ? tr("L'elenco di chi manca a") : tr("A chi")}</Label>
              <Select value={scelta} onValueChange={(v) => setScelta(v as ScelaChi)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">{tr("A me")}</SelectItem>
                  <SelectItem value="responsabili">{tr("Ai responsabili")}</SelectItem>
                  <SelectItem value="persona">{tr("A una persona")}</SelectItem>
                </SelectContent>
              </Select>
              {tipo === "rapportino_sera" && (
                <p className="text-[11px] text-muted-foreground">
                  {tr("Il promemoria va a ogni operaio che oggi era in cantiere e non ha mandato il rapportino (anche senza account, se ha il telefono in anagrafica).")}
                </p>
              )}
              {tipo === "promemoria_appuntamento" && (
                <p className="text-[11px] text-muted-foreground">
                  {tr("Se l'appuntamento ha un assegnatario, il promemoria va prima a lui.")}
                </p>
              )}
              {scelta === "persona" && (
                <Select value={personaId ?? ""} onValueChange={(v) => setPersonaId(v)}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder={tr("Scegli la persona…")} /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || tr("Senza nome")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {!mostraChi && (
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              {tr("Va a ogni operaio che ha lavori assegnati quel giorno.")}
            </p>
          )}

          {mostraOrario ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{tr("A che ora")}</Label>
                <Input type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{tr("In che giorni")}</Label>
                <div className="flex flex-wrap gap-1">
                  {GIORNI.map((g) => (
                    <button
                      key={g.n}
                      type="button"
                      onClick={() => toggleGiorno(g.n)}
                      className={`rounded-md border px-2 py-1 text-xs ${giorni.includes(g.n) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                    >
                      {tr(g.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{tr("Quanto prima avvisare")}</Label>
                <Select
                  value={String(regole.anticipo_min ?? 120)}
                  onValueChange={(v) => setRegole((r) => ({ ...r, anticipo_min: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{tr("30 minuti")}</SelectItem>
                    <SelectItem value="60">{tr("1 ora")}</SelectItem>
                    <SelectItem value="120">{tr("2 ore")}</SelectItem>
                    <SelectItem value="180">{tr("3 ore")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr("In che giorni")}</Label>
                <div className="flex flex-wrap gap-1">
                  {GIORNI.map((g) => (
                    <button
                      key={g.n}
                      type="button"
                      onClick={() => toggleGiorno(g.n)}
                      className={`rounded-md border px-2 py-1 text-xs ${giorni.includes(g.n) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                    >
                      {tr(g.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tipo === "avviso" && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{tr("Cosa segnalare")}</p>
              <SwitchRow
                label={tr("Incassi in ritardo")}
                checked={regole.fattura_scaduta ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, fattura_scaduta: v }))}
              />
              <SwitchRow
                label={tr("Preventivi visti ma senza risposta")}
                checked={regole.preventivo_fermo ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, preventivo_fermo: v }))}
              />
              {(regole.preventivo_fermo ?? true) && (
                <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                  <span>{dopoPrima.trim()}</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-16"
                    value={regole.preventivo_giorni ?? 3}
                    onChange={(e) => setRegole((r) => ({ ...r, preventivo_giorni: Math.max(1, Number(e.target.value) || 3) }))}
                  />
                  <span>{dopoDopo.trim()}</span>
                </div>
              )}
              <SwitchRow
                label={tr("Materiale sotto scorta")}
                checked={regole.sotto_scorta ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, sotto_scorta: v }))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr("Annulla")}</Button>
          <Button onClick={onSalva} disabled={salva.isPending}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("Salva")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
