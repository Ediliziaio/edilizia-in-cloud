import { useState } from "react";
import {
  useIncarichiCantiere,
  useFigurePerIncarico,
  useEvidenzeFascicolo,
  apriFileFascicolo,
  useScriviFascicolo,
} from "@/hooks/useFascicoloCantiere";
import { usePermissions } from "@/hooks/usePermissions";
import {
  RUOLI_INCARICO,
  errorePeriodo,
  oggiSicurezza,
  statoIncarico,
  type AmbitoFascicolo,
  type IncaricoSicurezza,
  type RuoloIncarico,
} from "@/lib/sicurezza/fascicolo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Form = {
  figura_id: string;
  id?: string;
  ruolo: RuoloIncarico;
  nominativo: string;
  telefono: string;
  email: string;
  nominante: string;
  dal: string;
  al: string;
  area: string;
  stato: IncaricoSicurezza["stato"];
  atto_riferimento: string;
  mansioni_sicurezza: string;
  note: string;
};
const vuoto = (): Form => ({
  figura_id: "",
  ruolo: "referente_operativo",
  nominativo: "",
  telefono: "",
  email: "",
  nominante: "",
  dal: oggiSicurezza(),
  al: "",
  area: "",
  stato: "proposto",
  atto_riferimento: "",
  mansioni_sicurezza: "",
  note: "",
});

export function IncarichiCantiere({
  companyId,
  subId,
  orderId,
  compact = false,
  dataRiferimento,
}: AmbitoFascicolo & { compact?: boolean;dataRiferimento?:string }) {
  const giorno=dataRiferimento||oggiSicurezza();
  const perms = usePermissions();
  const q = useIncarichiCantiere({ companyId, subId, orderId });
  const documenti=useEvidenzeFascicolo({companyId,subId,orderId});
  const figure = useFigurePerIncarico(companyId, !!orderId && !subId);
  const salva = useScriviFascicolo("sicurezza_incarichi", companyId);
  const [form, setForm] = useState<Form | null>(null);
  const [tutti, setTutti] = useState(false);
  const [apertoCompatto, setApertoCompatto] = useState(false);
  const scrive = perms.canViewSicurezzaCantiere && !perms.solaLettura;
  if (!perms.canViewSicurezzaCantiere) return null;
  const righe = (q.data ?? []).filter(
    (i) => tutti || !["Cessato", "Futuro"].includes(statoIncarico(i,giorno)),
  );
  const visibili = compact && !tutti ? righe.slice(0, 4) : righe;
  const cambia = (key: keyof Form, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const modifica = (i: IncaricoSicurezza) =>
    setForm({
      id: i.id,
      figura_id: i.figura_id ?? "",
      ruolo: i.ruolo,
      nominativo: i.nominativo,
      telefono: i.telefono ?? "",
      email: i.email ?? "",
      nominante: i.nominante ?? "",
      dal: i.dal,
      al: i.al ?? "",
      area: i.area ?? "",
      stato: i.stato,
      atto_riferimento: i.atto_riferimento ?? "",
      mansioni_sicurezza: i.mansioni_sicurezza ?? "",
      note: i.note ?? "",
    });
  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const errore = errorePeriodo(form.dal, form.al);
    if (errore) {
      toast.error(errore);
      return;
    }
    if (
      form.stato === "documentato" &&
      (!form.nominante.trim() || !form.atto_riferimento.trim())
    ) {
      toast.error(
        "Indica chi ha nominato la persona e il riferimento dell’atto.",
      );
      return;
    }
    try {
      const { id, ...resto } = form;
      await salva.mutateAsync({
        ...resto,
        id,
        ...(!id
          ? { order_id: orderId ?? null, subappaltatore_id: subId ?? null }
          : {}),
        al: form.al || null,
        figura_id: form.figura_id || null,
      });
      setForm(null);
      toast.success("Incarico salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incarico non salvato");
    }
  };
  const elenco = (
    <>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Caricamento incarichi…
          </p>
        ) : q.isError ? (
          <div role="alert" className="text-sm text-destructive">
            Non riesco a leggere gli incarichi.{" "}
            <Button variant="link" onClick={() => q.refetch()}>
              Riprova
            </Button>
          </div>
        ) : !visibili.length ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Nessun incarico corrente registrato.{" "}
            {scrive
              ? "Assegna le figure pertinenti a questo cantiere."
              : "Chiedi al responsabile della sicurezza di verificarli."}
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {visibili.map((i) => (
              <div
                key={i.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {RUOLI_INCARICO[i.ruolo]}
                    {i.area ? ` · ${i.area}` : ""}
                  </p>
                  <p className="break-words text-sm font-semibold">
                    {i.nominativo}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{statoIncarico(i,giorno)}</Badge>
                    {subId && (
                      <span className="text-xs text-muted-foreground">
                        {i.order_id
                          ? "Incarico di cantiere"
                          : "Figura dell’impresa"}
                      </span>
                    )}
                  </div>
                  {i.telefono && (
                    <a
                      className="mt-1 block text-xs text-primary"
                      href={`tel:${i.telefono}`}
                    >
                      {i.telefono}
                    </a>
                  )}
                  {documenti.isError?<p className="text-xs text-destructive">Documenti collegati non disponibili</p>:<div className="mt-1 space-y-1">{documenti.data?.filter(e=>e.incarico_id===i.id&&e.stato!=="superato").map(e=><div key={e.id} className="text-xs">{e.file_path?<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={()=>void apriFileFascicolo(e.file_path!).catch(err=>toast.error(err.message))}>{e.titolo}</Button>:<span>{e.titolo}</span>}<span className="text-muted-foreground"> · {e.stato==="verificato"?"Verifica registrata":"Evidenza da completare / verificare"}</span></div>)}</div>}
                  {i.atto_riferimento && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      Atto: {i.atto_riferimento}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dal {i.dal.split("-").reverse().join("/")}
                    {i.al ? ` al ${i.al.split("-").reverse().join("/")}` : ""}
                  </p>
                </div>
                {scrive && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Modifica incarico di ${i.nominativo}`}
                    onClick={() => modifica(i)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {(q.data?.length ?? 0) > 0 && (
          <Button
            size="sm"
            variant="link"
            className="px-0"
            onClick={() => setTutti(!tutti)}
          >
            {tutti
              ? "Mostra incarichi correnti"
              : `Vedi tutti e storico (${q.data!.length})`}
          </Button>
        )}
    </>
  );
  const dialogo = (
      <Dialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open && !salva.isPending) setForm(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Modifica incarico" : "Assegna una figura"}
            </DialogTitle>
            <DialogDescription>
              Registra l’incarico reale, il suo periodo e l’evidenza della
              nomina. Nessun invito viene inviato.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={invia} className="space-y-4">
              {!!orderId && !subId && (
                <div className="rounded-lg border bg-slate-50 p-3">
                  <Label htmlFor="inc-fonte">
                    Riprendi una figura dall’anagrafica aziendale
                  </Label>
                  <select
                    id="inc-fonte"
                    className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                    value={form.figura_id}
                    onChange={(e) => {
                      const f = figure.data?.find(
                        (f) => f.id === e.target.value,
                      );
                      if (!f) {
                        cambia("figura_id", "");
                        return;
                      }
                      setForm((v) =>
                        v
                          ? {
                              ...v,
                              figura_id: f.id,
                              nominativo: f.nominativo,
                              ruolo:
                                f.ruolo in RUOLI_INCARICO
                                  ? (f.ruolo as RuoloIncarico)
                                  : v.ruolo,
                              telefono: f.telefono ?? "",
                              email: f.email ?? "",
                              mansioni_sicurezza: f.mansioni_sicurezza ?? "",
                              stato: "proposto",
                              nominante: "",
                              atto_riferimento: "",
                            }
                          : v,
                      );
                    }}
                  >
                    <option value="">Inserisci un nuovo nominativo</option>
                    {figure.data?.map((f) => (
                      <option
                        key={f.id}
                        value={f.id}
                        disabled={!!f.scadenza && f.scadenza < giorno}
                      >
                        {f.nominativo} · {f.ruolo}
                        {f.scadenza && f.scadenza < giorno
                          ? " · scaduto"
                          : ""}
                      </option>
                    ))}
                  </select>
                  {figure.isError && (
                    <p role="alert" className="text-xs text-destructive">
                      Anagrafica delle figure non disponibile.{" "}
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => void figure.refetch()}
                      >
                        Riprova
                      </Button>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    La selezione propone i dati di contatto. Registra
                    separatamente nomina e periodo per questa commessa.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="inc-ruolo">Ruolo</Label>
                  <select
                    id="inc-ruolo"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.ruolo}
                    onChange={(e) => cambia("ruolo", e.target.value)}
                  >
                    {Object.entries(RUOLI_INCARICO).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inc-nome">Nome e cognome</Label>
                  <Input
                    id="inc-nome"
                    required
                    value={form.nominativo}
                    onChange={(e) =>
                      setForm((f) =>
                        f
                          ? { ...f, nominativo: e.target.value, figura_id: "" }
                          : f,
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["telefono", "email"] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`inc-${k}`}>
                      {k === "telefono" ? "Telefono" : "Email"}
                    </Label>
                    <Input
                      id={`inc-${k}`}
                      type={k === "email" ? "email" : "tel"}
                      value={form[k]}
                      onChange={(e) => cambia(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="inc-dal">Inizio incarico</Label>
                  <Input
                    id="inc-dal"
                    type="date"
                    required
                    value={form.dal}
                    onChange={(e) => cambia("dal", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="inc-al">Fine incarico</Label>
                  <Input
                    id="inc-al"
                    type="date"
                    min={form.dal}
                    value={form.al}
                    onChange={(e) => cambia("al", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="inc-area">Area o fase</Label>
                <Input
                  id="inc-area"
                  value={form.area}
                  onChange={(e) => cambia("area", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inc-stato">Stato della nomina</Label>
                <select
                  id="inc-stato"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.stato}
                  onChange={(e) => cambia("stato", e.target.value)}
                >
                  <option value="proposto">Da verificare</option>
                  <option value="documentato">Nomina documentata</option>
                  <option value="cessato">Cessato / sostituito</option>
                </select>
              </div>
              <div>
                <Label htmlFor="inc-nominante">Soggetto nominante</Label>
                <Input
                  id="inc-nominante"
                  required={form.stato === "documentato"}
                  value={form.nominante}
                  onChange={(e) => cambia("nominante", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inc-atto">
                  Riferimento dell’atto di nomina
                </Label>
                <Input
                  id="inc-atto"
                  required={form.stato === "documentato"}
                  placeholder="Numero, data e riferimento al documento nel fascicolo"
                  value={form.atto_riferimento}
                  onChange={(e) => cambia("atto_riferimento", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inc-mansioni">Mansioni di sicurezza</Label>
                <Textarea
                  id="inc-mansioni"
                  value={form.mansioni_sicurezza}
                  onChange={(e) => cambia("mansioni_sicurezza", e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={salva.isPending}
                  onClick={() => setForm(null)}
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={salva.isPending}>
                  {salva.isPending && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  Salva incarico
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
  );
  // Nella pagina Lavorazioni (compact): una riga sola come «Organizzazione», l'elenco si apre a richiesta (31/10/2026).
  if (compact) {
    const correnti = (q.data ?? []).filter((i) => !["Cessato", "Futuro"].includes(statoIncarico(i, giorno)));
    const riassunto = q.isLoading ? "caricamento…" : q.isError ? "dato non disponibile"
      : correnti.length === 0 ? "nessun incarico registrato"
      : correnti.slice(0, 3).map((i) => `${RUOLI_INCARICO[i.ruolo]}: ${i.nominativo}`).join(" · ") + (correnti.length > 3 ? ` · +${correnti.length - 3}` : "");
    return (
      <section aria-label="Figure e responsabilità" className="rounded-lg border bg-slate-50/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-muted-foreground" />Figure e responsabilità</h3>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{riassunto}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scrive && <Button size="sm" variant="outline" onClick={() => setForm(vuoto())}><Plus className="mr-1 h-4 w-4" />Assegna</Button>}
            {(q.data?.length ?? 0) > 0 && <Button size="sm" variant="ghost" aria-expanded={apertoCompatto} onClick={() => setApertoCompatto(!apertoCompatto)}>{apertoCompatto ? "Chiudi" : "Dettagli"}</Button>}
          </div>
        </div>
        {apertoCompatto && <div className="mt-3 space-y-3">{elenco}</div>}
        {dialogo}
      </section>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Figure e responsabilità
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {orderId
              ? "Incarichi di questa commessa."
              : "Figure dell’impresa e incarichi nei suoi cantieri."}{" "}
            La proposta di un nominativo non sostituisce la nomina.
          </p>
        </div>
        {scrive && (
          <Button size="sm" variant="outline" onClick={() => setForm(vuoto())}>
            <Plus className="mr-1 h-4 w-4" />
            Assegna
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {elenco}
      </CardContent>
      {dialogo}
    </Card>
  );
}
