import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  usePlaybooksList,
  usePlaybookExecutions,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
  useTogglePlaybook,
} from "@/hooks/superadmin/usePlaybooks";
import type {
  Playbook,
  PlaybookAction,
  CreatePlaybookPayload,
} from "@/hooks/superadmin/usePlaybooks";

// ─── Costanti eventi trigger ──────────────────────────────

const TRIGGER_EVENTI: Array<{ value: Playbook["trigger_event"]; label: string }> = [
  { value: "trial_started", label: "Trial iniziato" },
  { value: "trial_expiring_7d", label: "Trial in scadenza (7gg)" },
  { value: "trial_expired", label: "Trial scaduto" },
  { value: "payment_failed", label: "Pagamento fallito" },
  { value: "payment_recovered", label: "Pagamento recuperato" },
  { value: "plan_upgraded", label: "Piano upgradato" },
  { value: "plan_downgraded", label: "Piano downgradato" },
  { value: "account_suspended", label: "Account sospeso" },
  { value: "churned", label: "Churnato" },
  { value: "reactivated", label: "Riattivato" },
];

const TIPI_AZIONE: Array<{ value: PlaybookAction["type"]; label: string }> = [
  { value: "send_email", label: "Invia email" },
  { value: "add_tag", label: "Aggiungi tag" },
  { value: "notify_superadmin", label: "Notifica SuperAdmin" },
  { value: "update_flag", label: "Aggiorna flag" },
];

// ─── Badge colore evento ──────────────────────────────────

function BadgeEvento({ evento }: { evento: Playbook["trigger_event"] }) {
  const colori: Record<Playbook["trigger_event"], string> = {
    trial_started: "bg-green-100 text-green-700 border-green-200",
    trial_expiring_7d: "bg-yellow-100 text-yellow-700 border-yellow-200",
    trial_expired: "bg-yellow-100 text-yellow-700 border-yellow-200",
    payment_failed: "bg-red-100 text-red-700 border-red-200",
    payment_recovered: "bg-yellow-100 text-yellow-700 border-yellow-200",
    plan_upgraded: "bg-blue-100 text-blue-700 border-blue-200",
    plan_downgraded: "bg-yellow-100 text-yellow-700 border-yellow-200",
    account_suspended: "bg-yellow-100 text-yellow-700 border-yellow-200",
    churned: "bg-gray-100 text-gray-700 border-gray-200",
    reactivated: "bg-green-100 text-green-700 border-green-200",
  };

  const label = TRIGGER_EVENTI.find((e) => e.value === evento)?.label ?? evento;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colori[evento]}`}
    >
      {label}
    </span>
  );
}

// ─── Badge stato esecuzione ───────────────────────────────

function BadgeStato({ stato }: { stato: string }) {
  const mappa: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700 border-gray-200",
    running: "bg-yellow-100 text-yellow-700 border-yellow-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };

  const etichette: Record<string, string> = {
    pending: "In attesa",
    running: "In esecuzione",
    completed: "Completato",
    failed: "Fallito",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${mappa[stato] ?? "bg-gray-100 text-gray-700"}`}
    >
      {etichette[stato] ?? stato}
    </span>
  );
}

// ─── Card singola azione ──────────────────────────────────

interface ActionCardProps {
  azione: PlaybookAction;
  indice: number;
  onUpdate: (indice: number, azione: PlaybookAction) => void;
  onRimuovi: (indice: number) => void;
}

function ActionCard({ azione, indice, onUpdate, onRimuovi }: ActionCardProps) {
  function aggiorna(campi: Partial<PlaybookAction>) {
    onUpdate(indice, { ...azione, ...campi });
  }

  return (
    <Card className="border border-gray-200">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Tipo azione */}
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Tipo azione</Label>
            <Select
              value={azione.type}
              onValueChange={(v) => aggiorna({ type: v as PlaybookAction["type"] })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_AZIONE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delay minuti */}
          <div className="w-28">
            <Label className="text-xs text-muted-foreground">Ritardo (min)</Label>
            <Input
              type="number"
              min={0}
              className="h-8 text-sm"
              value={azione.delay_minutes}
              onChange={(e) => aggiorna({ delay_minutes: Number(e.target.value) })}
            />
          </div>

          {/* Rimuovi */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 mt-4"
            onClick={() => onRimuovi(indice)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Campi contestuali */}
        {azione.type === "send_email" && (
          <div>
            <Label className="text-xs text-muted-foreground">ID Template email</Label>
            <Input
              className="h-8 text-sm"
              placeholder="es. welcome_trial"
              value={azione.template_id ?? ""}
              onChange={(e) => aggiorna({ template_id: e.target.value })}
            />
          </div>
        )}

        {azione.type === "add_tag" && (
          <div>
            <Label className="text-xs text-muted-foreground">Tag da aggiungere</Label>
            <Input
              className="h-8 text-sm"
              placeholder="es. trial-scaduto"
              value={azione.tag ?? ""}
              onChange={(e) => aggiorna({ tag: e.target.value })}
            />
          </div>
        )}

        {azione.type === "notify_superadmin" && (
          <div>
            <Label className="text-xs text-muted-foreground">Messaggio notifica</Label>
            <Input
              className="h-8 text-sm"
              placeholder="es. Azienda {{name}} ha fatto churn"
              value={azione.message ?? ""}
              onChange={(e) => aggiorna({ message: e.target.value })}
            />
          </div>
        )}

        {azione.type === "update_flag" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Nome flag</Label>
              <Input
                className="h-8 text-sm"
                placeholder="es. is_churned"
                value={azione.flag ?? ""}
                onChange={(e) => aggiorna({ flag: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valore</Label>
              <Input
                className="h-8 text-sm"
                placeholder="es. true"
                value={String(azione.value ?? "")}
                onChange={(e) => aggiorna({ value: e.target.value })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Editor playbook inline ───────────────────────────────

interface EditorPlaybookProps {
  playbook: Playbook;
  onChiudi: () => void;
}

function EditorPlaybook({ playbook, onChiudi }: EditorPlaybookProps) {
  const [nome, setNome] = useState(playbook.name);
  const [triggerEvent, setTriggerEvent] = useState<Playbook["trigger_event"]>(
    playbook.trigger_event
  );
  const [delayHours, setDelayHours] = useState(playbook.delay_hours);
  const [isActive, setIsActive] = useState(playbook.is_active);
  const [azioni, setAzioni] = useState<PlaybookAction[]>(playbook.actions);

  const { mutate: salva, isPending: salvando } = useUpdatePlaybook();

  function aggiungiAzione() {
    setAzioni((prev) => [
      ...prev,
      { type: "send_email", delay_minutes: 0 },
    ]);
  }

  function aggiornaAzione(indice: number, azione: PlaybookAction) {
    setAzioni((prev) => prev.map((a, i) => (i === indice ? azione : a)));
  }

  function rimuoviAzione(indice: number) {
    setAzioni((prev) => prev.filter((_, i) => i !== indice));
  }

  function handleSalva() {
    salva(
      {
        id: playbook.id,
        name: nome,
        is_active: isActive,
        delay_hours: delayHours,
        actions: azioni,
      },
      { onSuccess: onChiudi }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">Modifica playbook</h3>
        <Button variant="ghost" size="sm" onClick={onChiudi}>
          Chiudi
        </Button>
      </div>

      {/* Nome */}
      <div>
        <Label>Nome playbook</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1" />
      </div>

      {/* Evento trigger */}
      <div>
        <Label>Evento trigger</Label>
        <Select
          value={triggerEvent}
          onValueChange={(v) => setTriggerEvent(v as Playbook["trigger_event"])}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_EVENTI.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delay ore + toggle attivo */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Label>Ritardo esecuzione (ore)</Label>
          <Input
            type="number"
            min={0}
            className="mt-1"
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{isActive ? "Attivo" : "Inattivo"}</Label>
        </div>
      </div>

      {/* Lista azioni */}
      <div>
        <Label className="mb-2 block">Azioni ({azioni.length})</Label>
        <div className="space-y-2">
          {azioni.map((az, i) => (
            <ActionCard
              key={i}
              azione={az}
              indice={i}
              onUpdate={aggiornaAzione}
              onRimuovi={rimuoviAzione}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full border-dashed"
          onClick={aggiungiAzione}
        >
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi azione
        </Button>
      </div>

      {/* Salva */}
      <Button className="w-full" onClick={handleSalva} disabled={salvando}>
        {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        <Save className="h-4 w-4 mr-2" />
        Salva Playbook
      </Button>
    </div>
  );
}

// ─── Dialog: nuovo playbook ───────────────────────────────

interface DialogNuovoPlaybookProps {
  aperto: boolean;
  onChiudi: () => void;
}

function DialogNuovoPlaybook({ aperto, onChiudi }: DialogNuovoPlaybookProps) {
  const [nome, setNome] = useState("");
  const [evento, setEvento] = useState<Playbook["trigger_event"]>("trial_started");

  const { mutate: crea, isPending: creando } = useCreatePlaybook();

  function handleCrea() {
    if (!nome.trim()) return;
    const payload: CreatePlaybookPayload = { name: nome.trim(), trigger_event: evento };
    crea(payload, {
      onSuccess: () => {
        setNome("");
        setEvento("trial_started");
        onChiudi();
      },
    });
  }

  return (
    <Dialog open={aperto} onOpenChange={onChiudi}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo playbook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Nome playbook</Label>
            <Input
              className="mt-1"
              placeholder="es. Benvenuto trial"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div>
            <Label>Evento trigger</Label>
            <Select
              value={evento}
              onValueChange={(v) => setEvento(v as Playbook["trigger_event"])}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTI.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button onClick={handleCrea} disabled={creando || !nome.trim()}>
            {creando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea playbook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab esecuzioni ───────────────────────────────────────

function TabEsecuzioni() {
  const { data: esecuzioni, isLoading } = usePlaybookExecutions();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    );
  }

  if (!esecuzioni || esecuzioni.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">Nessuna esecuzione registrata</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Azienda</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Iniziato il</TableHead>
            <TableHead>Completato il</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {esecuzioni.map((ex) => (
            <TableRow key={ex.id}>
              <TableCell className="font-mono text-xs">{ex.company_id}</TableCell>
              <TableCell>
                <span className="text-sm">{ex.trigger_event}</span>
              </TableCell>
              <TableCell>
                <BadgeStato stato={ex.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(ex.started_at), "dd/MM/yyyy HH:mm", { locale: it })}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {ex.completed_at
                  ? format(new Date(ex.completed_at), "dd/MM/yyyy HH:mm", { locale: it })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────

export default function PlaybooksPage() {
  const [dialogAperto, setDialogAperto] = useState(false);
  const [playbookSelezionato, setPlaybookSelezionato] = useState<Playbook | null>(null);

  const { data: playbooks, isLoading } = usePlaybooksList();
  const { mutate: elimina } = useDeletePlaybook();
  const { mutate: toggle } = useTogglePlaybook();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Playbook Automatici</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura sequenze di azioni automatiche scatenate da eventi del lifecycle
        </p>
      </div>

      <Tabs defaultValue="playbooks">
        <TabsList>
          <TabsTrigger value="playbooks">Playbook</TabsTrigger>
          <TabsTrigger value="esecuzioni">Esecuzioni</TabsTrigger>
        </TabsList>

        {/* Tab Playbook */}
        <TabsContent value="playbooks" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonna sinistra — lista */}
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setDialogAperto(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Playbook
              </Button>

              {isLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!isLoading && (!playbooks || playbooks.length === 0) && (
                <p className="text-center text-muted-foreground py-8">
                  Nessun playbook configurato. Crea il primo!
                </p>
              )}

              {(playbooks ?? []).map((pb) => (
                <Card
                  key={pb.id}
                  className={`cursor-pointer transition-colors hover:border-primary/50 ${
                    playbookSelezionato?.id === pb.id ? "border-primary" : ""
                  }`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{pb.name}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <BadgeEvento evento={pb.trigger_event} />
                          <span className="text-xs text-muted-foreground">
                            {pb.actions.length}{" "}
                            {pb.actions.length === 1 ? "azione" : "azioni"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Toggle attivo */}
                        <Switch
                          checked={pb.is_active}
                          onCheckedChange={(val) =>
                            toggle({ id: pb.id, is_active: val })
                          }
                          aria-label="Attiva/disattiva playbook"
                        />

                        {/* Modifica */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPlaybookSelezionato(
                              playbookSelezionato?.id === pb.id ? null : pb
                            )
                          }
                        >
                          {playbookSelezionato?.id === pb.id ? "Chiudi" : "Modifica"}
                        </Button>

                        {/* Elimina */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => elimina(pb.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Colonna destra — editor */}
            <div>
              {playbookSelezionato ? (
                <Card>
                  <CardContent className="pt-4">
                    <EditorPlaybook
                      playbook={playbookSelezionato}
                      onChiudi={() => setPlaybookSelezionato(null)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-muted-foreground text-sm">
                  Seleziona un playbook per modificarlo
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab Esecuzioni */}
        <TabsContent value="esecuzioni" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ultime 20 esecuzioni</CardTitle>
            </CardHeader>
            <CardContent>
              <TabEsecuzioni />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog nuovo playbook */}
      <DialogNuovoPlaybook
        aperto={dialogAperto}
        onChiudi={() => setDialogAperto(false)}
      />
    </div>
  );
}
