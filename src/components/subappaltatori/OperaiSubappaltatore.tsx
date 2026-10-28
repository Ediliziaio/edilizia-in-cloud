import { QualificheAddetto } from "@/components/sicurezza/QualificheAddetto";
import { useState } from "react";
import {
  useOperaiEsterni,
  useAssegnazioniEsterne,
  useCommesseFascicolo,
  useFasiFascicolo,
  useScriviFascicolo,
} from "@/hooks/useFascicoloCantiere";
import { usePermissions } from "@/hooks/usePermissions";
import { DpiEsterni } from "@/components/sicurezza/DpiEsterni";
import {
  errorePeriodo,
  oggiSicurezza,
  type OperaioEsterno,
} from "@/lib/sicurezza/fascicolo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Users, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function OperaiSubappaltatore({
  companyId,
  subId,
}: {
  companyId: string;
  subId: string;
}) {
  const perms = usePermissions();
  const ambito = { companyId, subId };
  const operai = useOperaiEsterni(ambito);
  const assegnazioni = useAssegnazioniEsterne(ambito);
  const commesse = useCommesseFascicolo(companyId);
  const salva = useScriviFascicolo("subappaltatori_operai", companyId);
  const assegna = useScriviFascicolo("subappaltatori_assegnazioni", companyId);
  const [form, setForm] = useState<{
    id?: string;
    nome: string;
    cognome: string;
    mansione: string;
    telefono: string;
    attivo: boolean;
  } | null>(null);
  const [assegnato, setAssegnato] = useState<OperaioEsterno | null>(null);
  const [assegnazioneId, setAssegnazioneId] = useState<string | undefined>();
  const [dest, setDest] = useState({
    order_id: "",
    fase_id: "",
    dal: oggiSicurezza(),
    al: "",
    area: "",
    attivita: "",
  });
  const fasi = useFasiFascicolo(companyId, dest.order_id || undefined);
  const [archiviati, setArchiviati] = useState(false);
  const [dotazioni, setDotazioni] = useState(false);
  const [qualifichePersona, setQualifichePersona] =
    useState<OperaioEsterno | null>(null);
  const [operaioDpi, setOperaioDpi] = useState<string | undefined>();
  const [cerca, setCerca] = useState("");
  const scrive = perms.canViewSicurezzaCantiere && !perms.solaLettura;
  if (!perms.canViewSicurezzaCantiere)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Per consultare gli addetti esterni e i loro requisiti serve il permesso
        Sicurezza cantiere.
      </p>
    );
  const righe = (operai.data ?? []).filter(
    (o) =>
      (archiviati || o.attivo) &&
      `${o.nome} ${o.cognome} ${o.mansione}`
        .toLowerCase()
        .includes(cerca.toLowerCase()),
  );
  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    try {
      await salva.mutateAsync({ ...form, subappaltatore_id: subId });
      setForm(null);
      toast.success("Operaio esterno salvato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    }
  };
  const inviaAssegnazione = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assegnato) return;
    if (
      dest.fase_id &&
      (fasi.isLoading ||
        fasi.isError ||
        !fasi.data?.some((f) => f.id === dest.fase_id))
    ) {
      toast.error("Rileggi le fasi della commessa prima di salvare.");
      return;
    }
    const errore = errorePeriodo(dest.dal, dest.al);
    if (errore) {
      toast.error(errore);
      return;
    }
    try {
      await assegna.mutateAsync({
        ...dest,
        id: assegnazioneId,
        al: dest.al || null,
        fase_id: dest.fase_id || null,
        subappaltatore_id: subId,
        operaio_id: assegnato.id,
      });
      setAssegnato(null);
      toast.success("Assegnazione salvata sulla commessa");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assegnazione non salvata");
    }
  };
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Operai dell’impresa
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Organico esterno e assegnazioni ai cantieri. Ogni operaio resta
            distinto dai tuoi dipendenti.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOperaioDpi(undefined);
              setDotazioni(true);
            }}
          >
            Dotazioni DPI
          </Button>
          {scrive && (
            <Button
              onClick={() =>
                setForm({
                  nome: "",
                  cognome: "",
                  mansione: "",
                  telefono: "",
                  attivo: true,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi operaio
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {qualifichePersona && (
          <Dialog
            open
            onOpenChange={(o) => {
              if (!o) setQualifichePersona(null);
            }}
          >
            <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Qualifiche di {qualifichePersona.nome}{" "}
                  {qualifichePersona.cognome}
                </DialogTitle>
                <DialogDescription>
                  Gli originali restano nei Documenti dell’impresa, collegati al
                  singolo operaio. Le qualifiche non vengono copiate fra persone
                  o aziende.
                </DialogDescription>
              </DialogHeader>
              <QualificheAddetto
                key={companyId + qualifichePersona.id}
                companyId={companyId}
                tipo="esterno"
                personaId={qualifichePersona.id}
                apertoIniziale
              />
            </DialogContent>
          </Dialog>
        )}

        {dotazioni && (
          <Dialog open onOpenChange={setDotazioni}>
            <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Dotazioni DPI degli operai esterni</DialogTitle>
                <DialogDescription>
                  Il registro resta collegato a questa impresa e ai suoi operai.
                  Le commesse recuperano le registrazioni pertinenti senza
                  copiarle.
                </DialogDescription>
              </DialogHeader>
              <DpiEsterni
                ambito={{
                  companyId,
                  subId,
                  data: oggiSicurezza(),
                  operaioId: operaioDpi,
                }}
                apertoIniziale
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDotazioni(false)}>
                  Chiudi dotazioni
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {operai.data &&
          assegnazioni.data &&
          !operai.isError &&
          !assegnazioni.isError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Addetti attivi", operai.data.filter((o) => o.attivo).length],
                [
                  "Commesse collegate",
                  new Set(assegnazioni.data.map((a) => a.order_id)).size,
                ],
                ["Periodi assegnati", assegnazioni.data.length],
              ].map(([label, valore]) => (
                <div key={String(label)} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {valore}
                  </p>
                </div>
              ))}
            </div>
          )}
        {!!operai.data?.length && (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              aria-label="Cerca operaio esterno"
              placeholder="Cerca nome o mansione…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archiviati}
                onChange={(e) => setArchiviati(e.target.checked)}
              />
              Mostra anche cessati
            </label>
          </div>
        )}
        {operai.isError || assegnazioni.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Non riesco a leggere organico o assegnazioni.{" "}
            <Button
              variant="link"
              onClick={() => {
                void operai.refetch();
                void assegnazioni.refetch();
              }}
            >
              Riprova
            </Button>
          </p>
        ) : operai.isLoading ? (
          <p>Caricamento operai…</p>
        ) : !righe.length ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/10 px-5 py-8 text-center">
            <div className="mb-3 rounded-xl bg-primary/5 p-3 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="font-semibold">
              {operai.data?.length
                ? "Nessun operaio corrisponde ai filtri"
                : "Aggiungi gli addetti di questa impresa"}
            </h3>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {operai.data?.length
                ? "Prova un altro nome o mostra anche gli addetti cessati."
                : "Registra nome e mansione, poi assegna ciascun operaio alla commessa e al periodo di lavoro. Qualifiche, documenti e DPI restano collegati alla persona."}
            </p>
            {operai.data?.length ? (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setCerca("");
                  setArchiviati(true);
                }}
              >
                Reimposta filtri
              </Button>
            ) : (
              scrive && (
                <Button
                  className="mt-4"
                  onClick={() =>
                    setForm({
                      nome: "",
                      cognome: "",
                      mansione: "",
                      telefono: "",
                      attivo: true,
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi il primo operaio
                </Button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Operaio</th>
                  <th className="p-3 text-left">Mansione</th>
                  <th className="p-3 text-left">Commesse e periodi</th>
                  <th className="p-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3 align-top">
                      <p className="font-medium">
                        {o.nome} {o.cognome}
                      </p>
                      {!o.attivo && <Badge variant="outline">Cessato</Badge>}
                      {o.telefono && (
                        <a
                          href={`tel:${o.telefono}`}
                          className="mt-1 block text-xs text-primary"
                        >
                          {o.telefono}
                        </a>
                      )}
                    </td>
                    <td className="p-3 align-top">{o.mansione}</td>
                    <td className="p-3 align-top">
                      {(assegnazioni.data ?? [])
                        .filter((a) => a.operaio_id === o.id)
                        .map((a) => (
                          <p key={a.id} className="mb-2 text-xs">
                            <a
                              className="font-medium text-primary"
                              href={`/azienda/ordini/${a.order_id}`}
                            >
                              {commesse.data?.find((c) => c.id === a.order_id)
                                ?.order_code ?? "Commessa"}
                            </a>
                            <br />
                            {a.dal} → {a.al ?? "fine da definire"}
                            {a.area ? ` · ${a.area}` : ""}
                            {a.fase_id
                              ? " · fase specifica"
                              : " · tutte le fasi"}
                            <br />
                            {a.attivita}
                            {scrive && (
                              <Button
                                size="sm"
                                variant="link"
                                className="ml-1 h-auto p-0 text-xs"
                                onClick={() => {
                                  setAssegnazioneId(a.id);
                                  setDest({
                                    order_id: a.order_id,
                                    fase_id: a.fase_id ?? "",
                                    dal: a.dal,
                                    al: a.al ?? "",
                                    area: a.area ?? "",
                                    attivita: a.attivita,
                                  });
                                  setAssegnato(o);
                                }}
                              >
                                Modifica periodo
                              </Button>
                            )}
                          </p>
                        ))}
                      {!(assegnazioni.data ?? []).some(
                        (a) => a.operaio_id === o.id,
                      ) && (
                        <span className="text-xs text-muted-foreground">
                          Non assegnato
                        </span>
                      )}
                    </td>
                    <td className="p-3 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Qualifiche di ${o.nome} ${o.cognome}`}
                          onClick={() => setQualifichePersona(o)}
                        >
                          Qualifiche
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Dotazioni DPI di ${o.nome} ${o.cognome}`}
                          onClick={() => {
                            setOperaioDpi(o.id);
                            setDotazioni(true);
                          }}
                        >
                          DPI
                        </Button>
                        {scrive && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Modifica ${o.nome} ${o.cognome}`}
                              onClick={() =>
                                setForm({
                                  id: o.id,
                                  nome: o.nome,
                                  cognome: o.cognome,
                                  mansione: o.mansione,
                                  telefono: o.telefono ?? "",
                                  attivo: o.attivo,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {o.attivo && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAssegnazioneId(undefined);
                                  setDest({
                                    order_id: "",
                                    fase_id: "",
                                    dal: oggiSicurezza(),
                                    al: "",
                                    area: "",
                                    attivita: o.mansione,
                                  });
                                  setAssegnato(o);
                                }}
                              >
                                <MapPin className="mr-1 h-4 w-4" />
                                Assegna
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v && !salva.isPending) setForm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id
                ? "Modifica operaio esterno"
                : "Aggiungi operaio esterno"}
            </DialogTitle>
            <DialogDescription>
              L’addetto appartiene a questo subappaltatore. L’inserimento non
              crea un account.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={invia} className="space-y-4">
              {(["nome", "cognome", "mansione", "telefono"] as const).map(
                (k) => (
                  <div key={k}>
                    <Label htmlFor={`est-${k}`}>
                      {k === "nome"
                        ? "Nome"
                        : k === "cognome"
                          ? "Cognome"
                          : k === "mansione"
                            ? "Mansione"
                            : "Telefono"}
                    </Label>
                    <Input
                      id={`est-${k}`}
                      required={k !== "telefono"}
                      value={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </div>
                ),
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.attivo}
                  onChange={(e) =>
                    setForm({ ...form, attivo: e.target.checked })
                  }
                />
                Addetto attivo nell’impresa
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm(null)}
                  disabled={salva.isPending}
                >
                  Annulla
                </Button>
                <Button disabled={salva.isPending}>
                  {salva.isPending && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  Salva operaio
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!assegnato}
        onOpenChange={(v) => {
          if (!v && !assegna.isPending) setAssegnato(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assegna {assegnato?.nome} {assegnato?.cognome}
            </DialogTitle>
            <DialogDescription>
              Scegli il cantiere e il periodo effettivo dell’incarico operativo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={inviaAssegnazione} className="space-y-4">
            <div>
              <Label htmlFor="est-commessa">Commessa</Label>
              {commesse.isError ? (
                <p role="alert">
                  Commesse non disponibili.{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => commesse.refetch()}
                  >
                    Riprova
                  </Button>
                </p>
              ) : (
                <select
                  id="est-commessa"
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={dest.order_id}
                  onChange={(e) =>
                    setDest({ ...dest, order_id: e.target.value, fase_id: "" })
                  }
                >
                  <option value="">Scegli la commessa</option>
                  {commesse.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.order_code} · {c.description?.slice(0, 70)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label htmlFor="est-fase">Fase di lavoro</Label>
              <select
                id="est-fase"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={dest.fase_id}
                disabled={!dest.order_id || fasi.isLoading || fasi.isError}
                onChange={(e) => setDest({ ...dest, fase_id: e.target.value })}
              >
                <option value="">Tutte le fasi della commessa</option>
                {fasi.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {fasi.isError && (
                <p role="alert" className="text-sm">
                  Fasi non disponibili.{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => void fasi.refetch()}
                  >
                    Riprova
                  </Button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                La fase limita l’assegnazione; il periodo viene confermato qui e
                non segue automaticamente le date del cronoprogramma.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="est-dal">Dal</Label>
                <Input
                  id="est-dal"
                  type="date"
                  required
                  value={dest.dal}
                  onChange={(e) => setDest({ ...dest, dal: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="est-al">Al</Label>
                <Input
                  id="est-al"
                  type="date"
                  min={dest.dal}
                  value={dest.al}
                  onChange={(e) => setDest({ ...dest, al: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="est-area">Area di lavoro</Label>
              <Input
                id="est-area"
                value={dest.area}
                onChange={(e) => setDest({ ...dest, area: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="est-attivita">Attività affidata</Label>
              <Input
                id="est-attivita"
                required
                value={dest.attivita}
                onChange={(e) => setDest({ ...dest, attivita: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssegnato(null)}
                disabled={assegna.isPending}
              >
                Annulla
              </Button>
              <Button disabled={assegna.isPending || !dest.order_id}>
                Salva assegnazione
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
