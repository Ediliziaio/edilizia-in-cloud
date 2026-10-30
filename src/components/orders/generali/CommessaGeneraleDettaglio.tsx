// src/components/orders/generali/CommessaGeneraleDettaglio.tsx
// La pagina di una commessa generale: la regia. In alto quanto del valore è assegnato,
// eseguito, fatturato e incassato; sotto le commesse che contiene. Le commesse dentro
// restano commesse normali: si aprono e si lavorano come sempre.
// Da telefono si legge soltanto: creare, collegare e modificare si fa da tablet o computer.
// I moduli (contratto, piano economico, unità, investitori, documenti) aggiungono le loro
// schede accanto a «Panoramica», solo quando sono pronti e accesi dal modello (schede.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Link2, MoreHorizontal, Pencil, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollegaCommesseDialog } from "@/components/orders/generali/CollegaCommesseDialog";
import { ModificaGeneraleDialog } from "@/components/orders/generali/ModificaGeneraleDialog";
import { BottoneRendiconto } from "@/components/orders/generali/rendiconto/RendicontoGenerale";
import { schedeDelModello } from "@/components/orders/generali/schede";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioGenerale, useRiepilogoGenerale, useScollegaCommessa } from "@/hooks/useCommesseGenerali";
import {
  DEFINIZIONI_MODELLI, avvisiGenerale, formattaEuro, quota, totaliGenerale,
  type FigliaGenerale, type RiepilogoGenerale, type TotaliGenerale,
} from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));
const percento = (n: number | null) => (n === null ? "" : `${Math.round(n)}%`);

export function CommessaGeneraleDettaglio({ generaleId }: { generaleId: string }) {
  const { data: r, isLoading, isError, refetch } = useRiepilogoGenerale(generaleId);
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [collega, setCollega] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [parametri, setParametri] = useSearchParams();
  const puoModificare = !!permissions.canEditOrders && !isMobile;

  const totali = useMemo(() => (r ? totaliGenerale(r) : null), [r]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !r || !totali) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-6">
        <p>Non riesco a leggere questa commessa generale.</p>
        <div className="flex gap-2">
          <Button onClick={() => void refetch()}>Riprova</Button>
          <Button variant="outline" onClick={() => navigate("/azienda/ordini")}>Torna alle commesse</Button>
        </div>
      </div>
    );
  }

  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const avvisi = avvisiGenerale(r, totali);
  // Il cliente della generale arriva già scelto nella commessa nuova (customer_id è letto da CreateOrder).
  const nuovaFiglia = () => navigate(`/azienda/ordini/nuovo?generale=${generaleId}${r.generale.clienteId ? `&customer_id=${r.generale.clienteId}` : ""}`);
  const schede = schedeDelModello(r.generale.modello, isMobile);
  const propsScheda = { riepilogo: r, totali, puoModificare };
  // La scheda aperta sta nell'indirizzo (?scheda=piano): si può mandare un link e tornare indietro.
  const richiesta = parametri.get("scheda");
  const schedaAttiva = schede.some((x) => x.id === richiesta) ? richiesta! : "panoramica";
  const apriScheda = (id: string) => {
    const dopo = new URLSearchParams(parametri);
    if (id === "panoramica") dopo.delete("scheda"); else dopo.set("scheda", id);
    setParametri(dopo, { replace: true });
  };

  const panoramica = (
    <>
      {r.permessi.importi && <Scala r={r} t={totali} />}

      <NumeriChiave r={r} t={totali} />

      {schede.map((x) => x.Riquadro && <x.Riquadro key={x.id} {...propsScheda} />)}

      {avvisi.length > 0 && (
        <section aria-label="Cosa richiede attenzione" className="space-y-1.5">
          {avvisi.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                a.tono === "attenzione" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "bg-muted/40",
              )}
            >
              {a.tono === "attenzione" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{a.testo}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="figlie-titolo" className="rounded-lg border bg-card">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="figlie-titolo" className="text-base font-semibold">{def.figlia.tante}</h2>
          <span className="text-xs text-muted-foreground">Avanzamento {Math.round(totali.avanzamento)}%</span>
        </header>
        {r.figlie.length === 0 ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">Qui dentro non c'è ancora niente.</p>
            {puoModificare && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={nuovaFiglia}><Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}</Button>
                <Button size="sm" variant="outline" onClick={() => setCollega(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse esistenti</Button>
              </div>
            )}
          </div>
        ) : isMobile ? (
          <ul className="divide-y">
            {r.figlie.map((f) => <FigliaCard key={f.id} f={f} permessi={r.permessi} />)}
          </ul>
        ) : (
          <TabellaFiglie r={r} t={totali} puoModificare={puoModificare} />
        )}
      </section>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Testata */}
      <div className="space-y-2">
        <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Commesse
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">Commessa generale · {def.nome}</Badge>
              {r.generale.codice && <span className="text-xs text-muted-foreground">{r.generale.codice}</span>}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">{r.generale.nome}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {r.generale.cliente ? `${def.cliente.etichetta}: ${r.generale.cliente} · ` : ""}
              {r.figlie.length === 1 ? `1 ${def.figlia.una}` : `${r.figlie.length} ${def.figlia.tante.toLowerCase()}`}
            </p>
          </div>
          <BottoneRendiconto riepilogo={r} />
          {puoModificare && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setModifica(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCollega(true)}>
                <Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse
              </Button>
              <Button size="sm" onClick={nuovaFiglia}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}
              </Button>
            </div>
          )}
        </div>
      </div>

      {schede.length === 0 ? panoramica : (
        <Tabs value={schedaAttiva} onValueChange={apriScheda}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="panoramica">Panoramica</TabsTrigger>
            {schede.map((x) => <TabsTrigger key={x.id} value={x.id}>{x.titolo}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="panoramica" className="mt-4 space-y-4">{panoramica}</TabsContent>
          {schede.map((x) => (
            <TabsContent key={x.id} value={x.id} className="mt-4">
              <x.Scheda {...propsScheda} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {puoModificare && (
        <>
          <CollegaCommesseDialog open={collega} onOpenChange={setCollega} riepilogo={r} />
          <ModificaGeneraleDialog open={modifica} onOpenChange={setModifica} riepilogo={r} />
        </>
      )}
    </div>
  );
}

/** Il valore che «scala»: quattro righe con la stessa base, dall'assegnato all'incassato. */
function Scala({ r, t }: { r: RiepilogoGenerale; t: TotaliGenerale }) {
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const conValore = r.generale.valore !== null;
  const righe = [
    { etichetta: r.generale.modello === "appalto" ? "Assegnato agli ordini" : "Prezzi delle unità", valore: t.assegnato, tono: "bg-primary/25" },
    { etichetta: "Eseguito", valore: t.eseguito, tono: "bg-primary/45" },
    { etichetta: "Fatturato", valore: t.fatturato, tono: "bg-primary/70" },
    { etichetta: "Incassato", valore: t.incassato, tono: "bg-primary" },
  ];
  return (
    <section aria-labelledby="scala-titolo" className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="scala-titolo" className="text-sm font-semibold">
          {conValore ? `${def.valore.etichetta}: ${euro(r.generale.valore)}` : `Totale ${def.figlia.tante.toLowerCase()}: ${euro(t.assegnato)}`}
        </h2>
        {conValore && t.daAssegnare !== null && (
          <span className={cn("text-xs", t.daAssegnare < 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
            {t.daAssegnare < 0 ? `Oltre di ${euro(-t.daAssegnare)}` : `Da assegnare ${euro(t.daAssegnare)}`}
          </span>
        )}
      </div>
      <dl className="mt-2 space-y-1.5">
        {righe.map((riga) => {
          const q = quota(riga.valore, t.base);
          return (
            <div key={riga.etichetta} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[10rem_1fr_9rem]">
              <dt className="truncate text-muted-foreground">{riga.etichetta}</dt>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full", riga.tono)} style={{ width: `${q ?? 0}%` }} />
              </div>
              <dd className="text-right tabular-nums">
                {euro(riga.valore)} <span className="text-muted-foreground">{percento(q)}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Riquadro({ etichetta, valore, nota, tono }: { etichetta: string; valore: string; nota?: string; tono?: "rosso" | "verde" }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tono === "rosso" && "text-destructive", tono === "verde" && "text-emerald-700 dark:text-emerald-400")}>{valore}</p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Quattro numeri, sempre nello stesso posto: valore, cosa manca, cosa devono pagarti, come va. */
function NumeriChiave({ r, t }: { r: RiepilogoGenerale; t: TotaliGenerale }) {
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {r.permessi.importi ? (
        <>
          <Riquadro etichetta={def.valore.etichetta} valore={euro(r.generale.valore ?? t.assegnato)} nota={r.generale.valore === null ? `somma delle ${def.figlia.tante.toLowerCase()}` : undefined} />
          <Riquadro
            etichetta="Da assegnare"
            valore={euro(t.daAssegnare)}
            tono={t.daAssegnare !== null && t.daAssegnare < 0 ? "rosso" : undefined}
            nota={t.daAssegnare === null ? "manca il valore" : undefined}
          />
          <Riquadro etichetta="Da incassare" valore={euro(t.daIncassare)} nota="fatturato e non ancora pagato" />
        </>
      ) : (
        <Riquadro etichetta={def.figlia.tante} valore={String(t.figlie)} />
      )}
      {r.permessi.margini ? (
        <Riquadro
          etichetta={`Margine delle ${def.figlia.tante.toLowerCase()}`}
          valore={euro(t.margine)}
          tono={t.margine !== null && t.margine < 0 ? "rosso" : t.margine !== null && t.margine > 0 ? "verde" : undefined}
          // Somma i margini delle commesse dentro: i costi registrati sulla generale (terreno, oneri, tecnici)
          // non ci sono. Il margine dell'operazione intera lo dà il piano economico.
          nota="senza i costi comuni: quello dell'operazione è nel piano economico"
        />
      ) : (
        <Riquadro etichetta="Avanzamento" valore={`${Math.round(t.avanzamento)}%`} />
      )}
    </div>
  );
}

function Stato({ f }: { f: FigliaGenerale }) {
  if (!f.statoNome) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.statoColore ?? "hsl(var(--muted-foreground))" }} aria-hidden="true" />
      <span className="truncate">{f.statoNome}</span>
    </span>
  );
}

function Avanzamento({ valore }: { valore: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${valore}%` }} />
      </div>
      <span className="tabular-nums text-xs">{Math.round(valore)}%</span>
    </div>
  );
}

function TabellaFiglie({ r, t, puoModificare }: { r: RiepilogoGenerale; t: TotaliGenerale; puoModificare: boolean }) {
  const scollega = useScollegaCommessa();
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const p = r.permessi;
  const rendiIndipendente = (f: FigliaGenerale) => {
    scollega.mutate(f.id, {
      onSuccess: () => toast.success(`${f.codice ?? f.nome} ora è una commessa indipendente`),
      onError: (e) => toast.error(messaggioGenerale(e, "la commessa")),
    });
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">{def.figlia.tante}</th>
            <th className="px-2 py-2 font-medium">Stato</th>
            <th className="px-2 py-2 font-medium">Avanzamento</th>
            {p.importi && <th className="px-2 py-2 text-right font-medium">Importo</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Eseguito</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Fatturato</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Incassato</th>}
            {p.margini && <th className="px-2 py-2 text-right font-medium">Margine</th>}
            {puoModificare && <th className="w-10 px-2 py-2"><span className="sr-only">Azioni</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {r.figlie.map((f) => (
            <tr key={f.id} className="hover:bg-muted/40">
              <td className="max-w-[22rem] px-4 py-2">
                <Link to={`/azienda/ordini/${f.id}`} className="block min-w-0 hover:underline">
                  {f.codice && <span className="mr-1.5 text-xs text-muted-foreground">{f.codice}</span>}
                  <span className="font-medium">{f.nome}</span>
                </Link>
                {f.indirizzo && <p className="truncate text-xs text-muted-foreground">{f.indirizzo}</p>}
              </td>
              <td className="max-w-[10rem] px-2 py-2 text-xs"><Stato f={f} /></td>
              <td className="px-2 py-2"><Avanzamento valore={f.avanzamento} /></td>
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.importo)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.eseguito)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.fatturato)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.incassato)}</td>}
              {p.margini && (
                <td className={cn("px-2 py-2 text-right tabular-nums", f.margine !== null && f.margine < 0 && "text-destructive")}>{euro(f.margine)}</td>
              )}
              {puoModificare && (
                <td className="px-2 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Azioni per ${f.codice ?? f.nome}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link to={`/azienda/ordini/${f.id}`}>Apri</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => rendiIndipendente(f)} disabled={scollega.isPending}>
                        <Unlink className="mr-2 h-4 w-4" /> Togli da questa generale
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {r.figlie.length > 1 && (
          <tfoot>
            <tr className="border-t bg-muted/30 text-sm font-medium">
              <td className="px-4 py-2">Totale</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2"><Avanzamento valore={t.avanzamento} /></td>
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.assegnato)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.eseguito)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.fatturato)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.incassato)}</td>}
              {p.margini && <td className={cn("px-2 py-2 text-right tabular-nums", t.margine !== null && t.margine < 0 && "text-destructive")}>{euro(t.margine)}</td>}
              {puoModificare && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Da telefono: una riga per commessa, con i due numeri che servono. */
function FigliaCard({ f, permessi }: { f: FigliaGenerale; permessi: RiepilogoGenerale["permessi"] }) {
  return (
    <li>
      <Link to={`/azienda/ordini/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-muted/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[f.codice, f.statoNome].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {permessi.importi && <p className="text-sm tabular-nums">{euro(f.importo)}</p>}
          <p className="text-xs tabular-nums text-muted-foreground">{Math.round(f.avanzamento)}%</p>
        </div>
      </Link>
    </li>
  );
}
