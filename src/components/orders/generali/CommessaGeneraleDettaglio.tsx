// src/components/orders/generali/CommessaGeneraleDettaglio.tsx
// La pagina di una commessa generale: la regia. In alto quanto del valore è assegnato,
// eseguito, fatturato e incassato; sotto le commesse che contiene. Le commesse dentro
// restano commesse normali: si aprono e si lavorano come sempre.
// Da telefono si legge soltanto: creare, collegare e modificare si fa da tablet o computer.
// I moduli (contratto, piano economico, unità, investitori, documenti) aggiungono le loro
// schede accanto a «Panoramica», solo quando sono pronti e accesi dal modello (schede.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Info, Link2, MoreHorizontal, Pencil, Plus, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollegaCommesseDialog } from "@/components/orders/generali/CollegaCommesseDialog";
import { ModificaGeneraleDialog } from "@/components/orders/generali/ModificaGeneraleDialog";
import { BottoneRendiconto } from "@/components/orders/generali/rendiconto/RendicontoGenerale";
import { PerPartire } from "@/components/orders/generali/PerPartire";
import { riquadriDelModello, schedeDelModello } from "@/components/orders/generali/schede";
import { SpostaFigliaDialog, type AzioneFiglia } from "@/components/orders/generali/SpostaFigliaDialog";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useQuoteCostiComuni, type QuoteCostiComuni } from "@/hooks/useQuoteCostiComuni";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useRiepilogoGenerale } from "@/hooks/useCommesseGenerali";
import {
  DEFINIZIONI_MODELLI, avvisiGenerale, formattaEuro, quota, totaliGenerale,
  type FigliaGenerale, type RiepilogoGenerale, type TotaliGenerale,
} from "@/lib/orders/commesseGenerali";
import { totaliSal, valoreContratto } from "@/lib/orders/generali/contratto";
import { numeriChiave, pianoPerNumeri, type NumeroChiave } from "@/lib/orders/generali/numeriChiave";
import { cn } from "@/lib/utils";

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));
const percento = (n: number | null) => (n === null ? "" : `${Math.round(n)}%`);

export function CommessaGeneraleDettaglio({ generaleId }: { generaleId: string }) {
  const { data: r, isLoading, isError, refetch } = useRiepilogoGenerale(generaleId);
  const quote = useQuoteCostiComuni(r);
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
  // Un'unità divisa non è più un'unità: si contano le sue parti.
  const quanteVive = r.figlie.filter((f) => !f.divisa).length;
  // Il cliente della generale arriva già scelto nella commessa nuova (customer_id è letto da CreateOrder).
  const nuovaFiglia = () => navigate(`/azienda/ordini/nuovo?generale=${generaleId}${r.generale.clienteId ? `&customer_id=${r.generale.clienteId}` : ""}`);
  const schede = schedeDelModello(r.generale.modello, isMobile);
  const riquadri = riquadriDelModello(r.generale.modello);
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
      <QuadroGenerale r={r} t={totali} quote={quote} />

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

      {puoModificare && <PerPartire riepilogo={r} nuovaFiglia={nuovaFiglia} />}

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
          <TabellaFiglie r={r} t={totali} puoModificare={puoModificare} quote={quote} />
        )}
      </section>

      {/* Dopo le commesse, i dettagli dei moduli: affiancati, non uno sopra l'altro a tutta larghezza. */}
      {riquadri.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {riquadri.map((x) => x.Riquadro && (
            <div key={x.id} className={cn("min-w-0", (x.id === "unita" || x.id === "documenti") && "lg:col-span-2")}>
              <x.Riquadro {...propsScheda} />
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Testata */}
      <div className="space-y-1.5">
        <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Commesse
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 lg:flex-nowrap">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-normal">Commessa generale · {def.nome}</Badge>
              {r.generale.codice && <span className="text-xs text-muted-foreground">{r.generale.codice}</span>}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight">{r.generale.nome}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {r.generale.cliente ? `${def.cliente.etichetta}: ${r.generale.cliente} · ` : ""}
              {quanteVive === 1 ? `1 ${def.figlia.una}` : `${quanteVive} ${def.figlia.tante.toLowerCase()}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <BottoneRendiconto riepilogo={r} />
            {puoModificare && (
              <>
                <Button variant="outline" size="sm" onClick={() => setModifica(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCollega(true)}>
                  <Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse
                </Button>
                <Button size="sm" onClick={nuovaFiglia}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}
                </Button>
              </>
            )}
          </div>
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

function Numero({ etichetta, valore, nota, tono }: { etichetta: string; valore: string; nota?: string; tono?: "rosso" | "verde" }) {
  return (
    <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="truncate text-xs text-muted-foreground">{etichetta}</p>
      <p className={cn("mt-0.5 truncate text-lg font-semibold tabular-nums sm:text-2xl", tono === "rosso" && "text-destructive", tono === "verde" && "text-emerald-700 dark:text-emerald-400")}>{valore}</p>
      {nota && <p className="truncate text-[11px] text-muted-foreground" title={nota}>{nota}</p>}
    </div>
  );
}

/**
 * Il quadro in cima: una card sola con i quattro numeri (valore, come va, cosa devono pagarti,
 * cosa resta) e sotto il valore che «scala», dall'assegnato all'incassato, sulla stessa base.
 */
function QuadroGenerale({ r, t, quote }: { r: RiepilogoGenerale; t: TotaliGenerale; quote: QuoteCostiComuni | null }) {
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const appalto = r.generale.modello === "appalto";
  const n = useGeneralePianoNumeri(r);
  const piano = pianoPerNumeri(n.piano);
  // Il SAL è del contratto: senza il valore del contratto non c'è né la riga né il residuo.
  const contratto = useDatiContratto(r.generale.id, appalto);
  const aSal = contratto.data && valoreContratto(contratto.data.contratto, contratto.data.atti) ? totaliSal(contratto.data.sal).aSal : null;
  const numeri = numeriChiave(r.generale.modello, t, piano, { costiComuni: quote?.totale ?? 0, aSal });
  const di = (id: NumeroChiave["id"]) => numeri.find((x) => x.id === id)?.valore ?? null;
  // Senza un costo registrato il margine sarebbe tutto il ricavo: un numero verde che non dice niente.
  const senzaCosti = !piano && r.permessi.margini && (t.costo ?? 0) === 0 && (quote?.totale ?? 0) === 0;
  const margine = senzaCosti ? null : di("margine");

  const righe = [
    { etichetta: appalto ? "Assegnato" : "Prezzi delle unità", valore: t.assegnato, tono: "bg-primary/30" },
    { etichetta: "Eseguito", valore: t.eseguito, tono: "bg-primary/45" },
    ...(appalto && aSal !== null ? [{ etichetta: "A SAL", valore: aSal, tono: "bg-primary/60" }] : []),
    { etichetta: "Fatturato", valore: t.fatturato, tono: "bg-primary/75" },
    { etichetta: "Incassato", valore: t.incassato, tono: "bg-primary" },
  ];
  const colonne = righe.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <section aria-label={r.permessi.importi ? `${def.valore.etichetta}: ${euro(r.generale.valore ?? t.assegnato)}` : undefined} className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4 max-lg:[&>*:nth-child(3)]:border-l-0 max-lg:[&>*:nth-child(n+3)]:border-t">
        {r.permessi.importi ? (
          <>
            <Numero etichetta={def.valore.etichetta} valore={euro(r.generale.valore ?? t.assegnato)} nota={r.generale.valore === null ? `somma delle ${def.figlia.tante.toLowerCase()}` : undefined} />
            <Numero etichetta="Da incassare" valore={euro(t.daIncassare)} nota={appalto ? "fatturato e non ancora pagato" : "venduto o fatturato, non ancora pagato"} />
            {numeri.some((x) => x.id === "residuo") && <Numero etichetta="Residuo del contratto" valore={euro(di("residuo"))} nota="non ancora a SAL" />}
            {numeri.some((x) => x.id === "capitale") && r.permessi.margini && <Numero etichetta="Capitale impegnato" valore={euro(di("capitale"))} nota="il massimo previsto" />}
            {numeri.some((x) => x.id === "assegnare") && (
              <Numero
                etichetta="Da assegnare"
                valore={euro(t.daAssegnare)}
                tono={t.daAssegnare !== null && t.daAssegnare < 0 ? "rosso" : undefined}
                nota={t.daAssegnare === null ? "manca il valore" : undefined}
              />
            )}
          </>
        ) : (
          <Numero etichetta={def.figlia.tante} valore={String(t.figlie)} />
        )}
        {r.permessi.margini ? (
          <Numero
            etichetta={piano ? "Margine a finire" : quote ? "Margine dell'operazione" : `Margine delle ${def.figlia.tante.toLowerCase()}`}
            valore={euro(margine)}
            tono={margine !== null && margine < 0 ? "rosso" : margine !== null && margine > 0 ? "verde" : undefined}
            nota={senzaCosti
              ? "nessun costo registrato"
              : piano
                ? "stima dal piano, con costi comuni e interessi"
                : quote
                  ? (quote.totale > 0 ? `${def.figlia.tante.toLowerCase()} ${euro(t.margine)} − costi comuni ${euro(quote.totale)}` : "ricavi meno costi registrati")
                  : "senza i costi comuni registrati sulla generale"}
          />
        ) : (
          <Numero etichetta="Avanzamento" valore={`${Math.round(t.avanzamento)}%`} />
        )}
      </div>

      {r.permessi.importi && (
        <div className="border-t bg-muted/20 px-3 py-3 sm:px-4">
          <dl className={cn("space-y-1.5 lg:grid lg:gap-5 lg:space-y-0", colonne)}>
            {righe.map((riga) => {
              const q = quota(riga.valore, t.base);
              return (
                <div key={riga.etichetta} className="grid min-w-0 grid-cols-[6.5rem_1fr] items-center gap-2 text-xs lg:flex lg:flex-col lg:items-stretch lg:gap-1">
                  <dt className="truncate text-muted-foreground lg:order-1">{riga.etichetta}</dt>
                  <dd className="text-right tabular-nums lg:order-2 lg:flex lg:items-baseline lg:justify-between lg:text-left">
                    <span className="font-medium lg:text-sm">{euro(riga.valore)}</span> <span className="text-muted-foreground">{percento(q)}</span>
                  </dd>
                  {/* Da telefono bastano i numeri: la riga resta densa. */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted max-lg:hidden lg:order-3" aria-hidden="true">
                    <div className={cn("h-full rounded-full", riga.tono)} style={{ width: `${q ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </dl>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>Importi al netto dell'IVA.</span>
            {t.daAssegnare !== null && (
              <span className={cn(t.daAssegnare < 0 && "font-medium text-destructive")}>
                {t.daAssegnare < 0 ? `Oltre di ${euro(-t.daAssegnare)}` : `Da assegnare ${euro(t.daAssegnare)}`}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
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

function TabellaFiglie({ r, t, puoModificare, quote }: { r: RiepilogoGenerale; t: TotaliGenerale; puoModificare: boolean; quote: QuoteCostiComuni | null }) {
  // Il margine di ogni commessa è «pieno»: meno la sua quota dei costi comuni, se ce ne sono.
  const conQuote = !!quote && quote.totale > 0;
  const pieno = (f: FigliaGenerale) => (f.margine === null ? null : f.margine - (quote?.perFiglia.get(f.id)?.importo ?? 0));
  const [azione, setAzione] = useState<{ figlia: FigliaGenerale; tipo: AzioneFiglia } | null>(null);
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const p = r.permessi;
  return (
    <div className="overflow-x-auto">
      {azione && (
        <SpostaFigliaDialog riepilogo={r} totali={t} figlia={azione.figlia} azione={azione.tipo} onClose={() => setAzione(null)} />
      )}
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
            {p.margini && <th className="px-2 py-2 text-right font-medium" title={`Ricavi meno i costi registrati finora${conQuote ? `. ${quote!.motivo}` : ""}`}>Margine a oggi</th>}
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
                <td
                  className={cn("px-2 py-2 text-right tabular-nums", (pieno(f) ?? 0) < 0 && "text-destructive")}
                  title={conQuote && f.margine !== null ? `Margine diretto ${euro(f.margine)} − quota costi comuni ${euro(quote!.perFiglia.get(f.id)?.importo ?? 0)}` : undefined}
                >
                  {/* Senza costi registrati il margine sarebbe tutto il ricavo: meglio dirlo. */}
                  {f.costo === 0 && !conQuote ? <span className="text-xs text-muted-foreground">costi da registrare</span> : euro(pieno(f))}
                  {conQuote && f.margine !== null && !f.divisa && (
                    <span className="block text-[11px] text-muted-foreground">quota comuni −{euro(quote!.perFiglia.get(f.id)?.importo ?? 0)}</span>
                  )}
                </td>
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
                      <DropdownMenuItem onClick={() => setAzione({ figlia: f, tipo: "sposta" })}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Sposta in un'altra generale
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAzione({ figlia: f, tipo: "togli" })}>
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
              {p.margini && (() => {
                const totale = t.margine !== null && conQuote ? t.margine - quote!.totale : t.margine;
                if (t.costo === 0 && !conQuote) return <td className="px-2 py-2 text-right text-xs font-normal text-muted-foreground">—</td>;
                return <td className={cn("px-2 py-2 text-right tabular-nums", totale !== null && totale < 0 && "text-destructive")}>{euro(totale)}</td>;
              })()}
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
