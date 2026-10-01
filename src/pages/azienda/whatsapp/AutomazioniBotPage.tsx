// La scheda «Automazioni» del WhatsApp hub: le cose che il bot fa da solo
// (report del mattino, le cose del giorno agli operai, avvisi, promemoria
// appuntamenti). Il titolare le crea e le gestisce qui, in parole semplici,
// senza toccare il codice. Niente termini tecnici in schermata.

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, ListChecks, Loader2, Plus, Sun, Trash2 } from "lucide-react";
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

const TIPO_LABEL: Record<BotRoutineTipo, string> = {
  report_mattino: "Report del mattino",
  todo_operaio: "Le cose del giorno agli operai",
  avviso: "Avvisi",
  promemoria_appuntamento: "Promemoria appuntamenti",
};

const TIPO_DESC: Record<BotRoutineTipo, string> = {
  report_mattino: "Ogni mattina un riepilogo: commesse attive, incassi da fare, materiale sotto scorta.",
  todo_operaio: "Ogni operaio riceve la lista dei suoi cantieri del giorno, con indirizzo e con chi lavora.",
  avviso: "Ti segnala incassi in ritardo, preventivi visti ma senza risposta e materiale sotto scorta.",
  promemoria_appuntamento: "Un promemoria poco prima di ogni appuntamento, a chi è assegnato.",
};

const TIPO_ICON: Record<BotRoutineTipo, typeof Sun> = {
  report_mattino: Sun,
  todo_operaio: ListChecks,
  avviso: Bell,
  promemoria_appuntamento: CalendarClock,
};

const TEMPLATE_DEFAULT: Record<BotRoutineTipo, string | null> = {
  report_mattino: "report_operativo_mattino",
  todo_operaio: "todo_operaio_giorno",
  avviso: null,
  promemoria_appuntamento: null,
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

function riassuntoQuando(r: BotRoutine): string {
  if (r.tipo === "promemoria_appuntamento") {
    const min = r.regole?.anticipo_min ?? 120;
    return min >= 60 ? `${Math.round(min / 60)} h prima` : `${min} min prima`;
  }
  const ora = (r.ora ?? "").slice(0, 5) || "—";
  const g = r.giorni ?? [1, 2, 3, 4, 5];
  const tutti = g.length === 7;
  const feriali = g.length === 5 && [1, 2, 3, 4, 5].every((x) => g.includes(x));
  const quali = tutti ? "tutti i giorni" : feriali ? "lun–ven" : g.map((n) => GIORNI.find((x) => x.n === n)?.label).filter(Boolean).join(", ");
  return `alle ${ora}, ${quali}`;
}

function riassuntoChi(r: BotRoutine, nomePersona: (id: string) => string): string {
  if (r.tipo === "todo_operaio") return "a ogni operaio con lavori quel giorno";
  const { scelta, personaId } = destToScelta(r.destinatari, null);
  if (scelta === "responsabili") return "ai responsabili";
  if (scelta === "persona" && personaId) return `a ${nomePersona(personaId)}`;
  return "a una persona";
}

export default function AutomazioniBotPage() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const numbers = useWhatsAppNumbersByPurpose();
  const operativo = (numbers.byPurpose.bot_operativo ?? [])[0];
  const { data: routines, isLoading, isError, error } = useBotRoutine(companyId);
  const { data: staff = [] } = useCompanyStaffUsers(companyId, "all");
  const toggle = useToggleBotRoutine(companyId);
  const elimina = useEliminaBotRoutine(companyId);

  const [editing, setEditing] = useState<Partial<BotRoutine> | null>(null);

  const nomePersona = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "una persona"]));
    return (id: string) => map.get(id) ?? "una persona";
  }, [staff]);

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
              <h3 className="font-semibold">Prima collega il numero dei cantieri</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Le automazioni partono dal numero WhatsApp con scopo <strong>Operativo / Cantieri</strong>. Collegane uno nella scheda Numeri e torna qui.
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
          <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Automazioni non caricate."}</p>
        </Card>
      </div>
    );
  }

  const lista = routines ?? [];

  return (
    <div className="space-y-6 p-4 md:p-0">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Le automazioni sono le cose che il bot fa da solo, senza che glielo chieda: il riepilogo del mattino,
          le cose del giorno a ogni operaio, gli avvisi e i promemoria degli appuntamenti.
        </p>
        <Button onClick={() => setEditing({ tipo: "report_mattino" })} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Nuova
        </Button>
      </div>

      {lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Non hai ancora nessuna automazione. Premi <strong>Nuova</strong> per farne partire una.
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
                        <CardTitle className="text-base">{TIPO_LABEL[r.tipo]}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{TIPO_DESC[r.tipo]}</p>
                        <p className="text-xs text-foreground mt-2">
                          {riassuntoChi(r, nomePersona)} · {riassuntoQuando(r)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={r.attiva}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ id: r.id, attiva: v })}
                        aria-label={`Attiva ${TIPO_LABEL[r.tipo]}`}
                      />
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Modifica</Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Elimina"
                        onClick={() => {
                          if (confirm("Vuoi eliminare questa automazione?")) elimina.mutate(r.id);
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
      toast.error("Scegli l'ora");
      return;
    }
    if (mostraOrario && giorni.length === 0) {
      toast.error("Scegli almeno un giorno");
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
          : { ai };

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
          toast.success(isNuova ? "Automazione creata" : "Automazione aggiornata");
          onClose();
        },
        onError: (e: Error) => toast.error("Non salvata", { description: e.message }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNuova ? "Nuova automazione" : "Modifica automazione"}</DialogTitle>
          <DialogDescription>{TIPO_DESC[tipo]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Cosa manda</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as BotRoutineTipo)} disabled={!isNuova}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as BotRoutineTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mostraAI && (
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Scrivi con l'AqI</p>
                <p className="text-[11px] text-muted-foreground">Testo più curato e ordinato per priorità. Se spento, usa il testo standard.</p>
              </div>
              <Switch checked={ai} onCheckedChange={setAi} aria-label="Scrivi con l'AqI" />
            </div>
          )}

          {mostraChi && (
            <div className="space-y-1">
              <Label>A chi</Label>
              <Select value={scelta} onValueChange={(v) => setScelta(v as ScelaChi)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">A me</SelectItem>
                  <SelectItem value="responsabili">Ai responsabili</SelectItem>
                  <SelectItem value="persona">A una persona</SelectItem>
                </SelectContent>
              </Select>
              {tipo === "promemoria_appuntamento" && (
                <p className="text-[11px] text-muted-foreground">
                  Se l'appuntamento ha un assegnatario, il promemoria va prima a lui.
                </p>
              )}
              {scelta === "persona" && (
                <Select value={personaId ?? ""} onValueChange={(v) => setPersonaId(v)}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Scegli la persona…" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Senza nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {!mostraChi && (
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              Va a ogni operaio che ha lavori assegnati quel giorno.
            </p>
          )}

          {mostraOrario ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>A che ora</Label>
                <Input type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>In che giorni</Label>
                <div className="flex flex-wrap gap-1">
                  {GIORNI.map((g) => (
                    <button
                      key={g.n}
                      type="button"
                      onClick={() => toggleGiorno(g.n)}
                      className={`rounded-md border px-2 py-1 text-xs ${giorni.includes(g.n) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quanto prima avvisare</Label>
                <Select
                  value={String(regole.anticipo_min ?? 120)}
                  onValueChange={(v) => setRegole((r) => ({ ...r, anticipo_min: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minuti</SelectItem>
                    <SelectItem value="60">1 ora</SelectItem>
                    <SelectItem value="120">2 ore</SelectItem>
                    <SelectItem value="180">3 ore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>In che giorni</Label>
                <div className="flex flex-wrap gap-1">
                  {GIORNI.map((g) => (
                    <button
                      key={g.n}
                      type="button"
                      onClick={() => toggleGiorno(g.n)}
                      className={`rounded-md border px-2 py-1 text-xs ${giorni.includes(g.n) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tipo === "avviso" && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Cosa segnalare</p>
              <SwitchRow
                label="Incassi in ritardo"
                checked={regole.fattura_scaduta ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, fattura_scaduta: v }))}
              />
              <SwitchRow
                label="Preventivi visti ma senza risposta"
                checked={regole.preventivo_fermo ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, preventivo_fermo: v }))}
              />
              {(regole.preventivo_fermo ?? true) && (
                <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                  <span>dopo</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-16"
                    value={regole.preventivo_giorni ?? 3}
                    onChange={(e) => setRegole((r) => ({ ...r, preventivo_giorni: Math.max(1, Number(e.target.value) || 3) }))}
                  />
                  <span>giorni</span>
                </div>
              )}
              <SwitchRow
                label="Materiale sotto scorta"
                checked={regole.sotto_scorta ?? true}
                onChange={(v) => setRegole((r) => ({ ...r, sotto_scorta: v }))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={onSalva} disabled={salva.isPending}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
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
