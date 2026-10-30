// src/components/orders/generali/subappalti/SubappaltiContratto.tsx
// I subappalti del contratto d'appalto (scheda «Contratto e SAL» → Subappalti): tutti quelli
// degli ordini di lavoro, la quota subappaltata sul valore del contratto con la soglia, i SAL
// passivi contro i SAL attivi, DURC e documenti dei subappaltatori. Contratti, SAL passivi e
// documenti si fanno dove l'app li gestisce già (commessa → Ditte e contratti, scheda del
// subappaltatore): qui si guardano insieme e si lega un subappalto a più ordini dello stesso contratto.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Link2, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CampoNumero, NumeroCheSiApre, ProssimoPasso, type RigaOrigine } from "@/components/orders/generali/contratto/campi";
import { dataIt, euro, percentoIt } from "@/components/orders/generali/contratto/formato";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useCollegaSubappalto, useSogliaSubappalti, useSubappaltiGenerale } from "@/hooks/useGeneraleSubappalti";
import { arrotonda, oggiIso, totaliSal, valoreContratto, type DatiContratto } from "@/lib/orders/generali/contratto";
import {
  NOMI_DOCUMENTO, STATI_SAL_PASSIVO, STATI_SUBAPPALTO, confrontoSal, contaNellaQuota, documentiDaGuardare, durcSubappaltatore,
  nomeOrdine, ordiniDelSubappalto, pagatoSal, quotaSubappaltata, valoreSubappalto,
  type OrdineDiLavoro, type QuotaSubappaltata, type StatoDocumento, type Subappalto,
} from "@/lib/orders/generali/subappalti";
import { cn } from "@/lib/utils";

interface Props {
  generaleId: string;
  dati: DatiContratto;
  puoModificare: boolean;
}

export function SubappaltiContratto({ generaleId, dati, puoModificare }: Props) {
  const { data: s, isLoading, isError, refetch } = useSubappaltiGenerale(generaleId);
  const [soglia, setSoglia] = useState(false);
  const [daLegare, setDaLegare] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (isError || !s) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere i subappalti.
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }
  if (!s.permessi.vede) {
    return <ProssimoPasso testo="I subappalti sono costi: li vede chi ha il permesso di vedere i costi e l'amministrazione dei subappaltatori." />;
  }

  const modifica = puoModificare && s.permessi.modifica;
  const valore = valoreContratto(dati.contratto, dati.atti)?.aggiornato ?? null;
  const quota = quotaSubappaltata(s.subappalti, valore, s.sogliaPct);
  const t = totaliSal(dati.sal);
  const incassato = arrotonda(dati.fatture.reduce((tot, f) => tot + f.incassato, 0));
  const confronto = confrontoSal({ aSal: t.aSal, netto: t.netto, incassato }, s.subappalti);
  const oggi = oggiIso();
  const legato = s.subappalti.find((x) => x.id === daLegare) ?? null;

  return (
    <div className="space-y-4">
      {s.subappalti.length === 0 ? (
        <ProssimoPasso testo="Nessun subappalto sugli ordini di lavoro. Il contratto con la ditta si prepara dalla commessa dell'ordine (Ditte e contratti) o dalla scheda del subappaltatore: qui compare da solo, con i suoi SAL e il DURC." />
      ) : (
        <>
          <AvvisoQuota quota={quota} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <NumeroCheSiApre
              etichetta="Subappaltato"
              valore={euro(quota.importo)}
              nota={quota.pct !== null ? `${percentoIt(quota.pct)} del contratto` : "manca il valore del contratto"}
              titolo="I subappalti del contratto"
              descrizione="Lavori più oneri della sicurezza. I subappalti risolti non contano."
              righe={[
                ...s.subappalti.filter(contaNellaQuota).map((x): RigaOrigine => ({
                  etichetta: x.subappaltatore.nome, valore: euro(valoreSubappalto(x)), nota: x.descrizione || undefined,
                })),
                { etichetta: "Subappaltato", valore: euro(quota.importo), tono: "totale" },
                ...(valore !== null ? [{ etichetta: "Valore aggiornato del contratto", valore: euro(valore) }] : []),
              ]}
            />
            <NumeroCheSiApre
              etichetta="Soglia"
              valore={quota.sogliaPct !== null ? percentoIt(quota.sogliaPct) : "Nessuna"}
              tono={quota.stato === "oltre" ? "rosso" : undefined}
              nota={quota.margineSoglia === null ? (quota.sogliaPct === null ? "nessun limite impostato" : "manca il valore del contratto")
                : quota.margineSoglia >= 0 ? `ancora ${euro(quota.margineSoglia)} subappaltabili` : `oltre di ${euro(-quota.margineSoglia)}`}
            />
            <NumeroCheSiApre
              etichetta="SAL dei subappaltatori"
              valore={euro(confronto.passivi.lordo)}
              nota={confronto.quotaPassiviPct !== null ? `${percentoIt(confronto.quotaPassiviPct)} dei SAL del contratto` : "nessun SAL del contratto"}
              titolo="SAL ricevuti dai subappaltatori"
              descrizione="Lordo dei SAL non contestati."
              righe={righeSalPassivi(s.subappalti, confronto.passivi.lordo)}
            />
            <NumeroCheSiApre
              etichetta="Da pagare ai subappaltatori"
              valore={euro(confronto.passivi.daPagare)}
              nota={`pagati ${euro(confronto.passivi.pagato)}`}
              righe={[
                { etichetta: "Netto dei SAL", valore: euro(confronto.passivi.netto) },
                { etichetta: "Pagato", valore: euro(-confronto.passivi.pagato), tono: "meno" },
                { etichetta: "Da pagare", valore: euro(confronto.passivi.daPagare), tono: "totale" },
                ...(confronto.passivi.contestati > 0 ? [{ etichetta: "SAL contestati, esclusi", valore: String(confronto.passivi.contestati) }] : []),
              ]}
            />
          </div>

          <section aria-labelledby="confronto-sal-titolo" className="rounded-lg border bg-card">
            <h3 id="confronto-sal-titolo" className="border-b px-4 py-3 text-sm font-semibold">Quanto incasso contro quanto devo ai subappaltatori</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
              <Confronto etichetta="A SAL col committente" valore={confronto.attiviASal} />
              <Confronto etichetta="Incassato dal committente" valore={confronto.incassato} />
              <Confronto etichetta="SAL dei subappaltatori" valore={-confronto.passivi.lordo} />
              <Confronto etichetta="Pagato ai subappaltatori" valore={-confronto.passivi.pagato} />
              <Confronto etichetta="Resta sui lavori a SAL" valore={confronto.differenzaSal} totale />
              <Confronto etichetta="Resta in cassa" valore={confronto.differenzaCassa} totale />
            </dl>
            {confronto.passivi.daPagare > 0 && confronto.differenzaCassa < confronto.passivi.daPagare && (
              <p className="flex items-start gap-2 border-t px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Per pagare i SAL dei subappaltatori ({euro(confronto.passivi.daPagare)}) non basta quanto incassato finora.
              </p>
            )}
          </section>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{s.subappalti.length > 0 ? `I subappalti · ${s.subappalti.length}` : ""}</h3>
        {modifica && (
          <Button size="sm" variant="outline" onClick={() => setSoglia(true)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> {s.sogliaPct === null ? "Imposta una soglia" : "Cambia la soglia"}
          </Button>
        )}
      </div>

      {s.subappalti.length > 0 && (
        <ul className="space-y-2">
          {s.subappalti.map((x) => (
            <SchedaSubappalto key={x.id} s={x} ordini={s.ordini} oggi={oggi} onLega={modifica && s.ordini.length > 1 ? () => setDaLegare(x.id) : undefined} />
          ))}
        </ul>
      )}

      {modifica && (
        <>
          <SogliaDialog open={soglia} onOpenChange={setSoglia} generaleId={generaleId} sogliaPct={s.sogliaPct} />
          {legato && <LegaOrdiniDialog generaleId={generaleId} s={legato} ordini={s.ordini} onChiudi={() => setDaLegare(null)} />}
        </>
      )}
    </div>
  );
}

function righeSalPassivi(subappalti: Subappalto[], totale: number): RigaOrigine[] {
  return [
    ...subappalti.flatMap((x) => x.sal.map((sal): RigaOrigine => ({
      etichetta: `${x.subappaltatore.nome} · SAL n. ${sal.numero}`,
      valore: euro(sal.lordo),
      nota: `${dataIt(sal.data)} · ${STATI_SAL_PASSIVO[sal.stato] ?? sal.stato}${sal.stato === "contestato" ? ", escluso" : ""}`,
      tono: sal.stato === "contestato" ? "meno" : undefined,
    }))),
    { etichetta: "Totale", valore: euro(totale), tono: "totale" },
  ];
}

function AvvisoQuota({ quota }: { quota: QuotaSubappaltata }) {
  if (quota.stato !== "oltre" && quota.stato !== "vicina") return null;
  const oltre = quota.stato === "oltre";
  return (
    <div role="alert" className={cn(
      "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
      oltre ? "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
    )}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {oltre
          ? <>Subappaltato il {percentoIt(quota.pct ?? 0)} del contratto: oltre la soglia del {percentoIt(quota.sogliaPct ?? 0)} di {euro(-(quota.margineSoglia ?? 0))}. Serve un'autorizzazione o un subappalto in meno.</>
          : <>Subappaltato il {percentoIt(quota.pct ?? 0)} del contratto, vicino alla soglia del {percentoIt(quota.sogliaPct ?? 0)}: restano {euro(quota.margineSoglia)}.</>}
      </p>
    </div>
  );
}

function Confronto({ etichetta, valore, totale }: { etichetta: string; valore: number; totale?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", totale && "border-t pt-2 font-semibold")}>
      <dt className={cn(!totale && "text-muted-foreground")}>{etichetta}</dt>
      <dd className={cn("tabular-nums", totale && valore < 0 && "text-destructive")}>{euro(valore)}</dd>
    </div>
  );
}

const STILE_DOCUMENTO: Record<StatoDocumento, string> = {
  valido: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  senza_scadenza: "bg-muted text-muted-foreground",
  in_scadenza: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  scaduto: "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  mancante: "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
};

function testoDurc(stato: StatoDocumento, scadenza: string | null) {
  if (stato === "mancante") return "DURC mancante";
  if (stato === "senza_scadenza") return "DURC senza scadenza";
  if (stato === "scaduto") return `DURC scaduto il ${dataIt(scadenza)}`;
  return `DURC fino al ${dataIt(scadenza)}`;
}

function SchedaSubappalto({ s, ordini, oggi, onLega }: { s: Subappalto; ordini: OrdineDiLavoro[]; oggi: string; onLega?: () => void }) {
  const durc = durcSubappaltatore(s, oggi);
  const altri = documentiDaGuardare(s, oggi);
  const suoi = ordiniDelSubappalto(s, ordini);
  const salDovuti = s.sal.filter((x) => x.stato !== "contestato");
  const lordo = arrotonda(salDovuti.reduce((t, x) => t + x.lordo, 0));
  const pagato = arrotonda(s.sal.reduce((t, x) => t + pagatoSal(x), 0));
  const valore = valoreSubappalto(s);
  const avanzamento = valore > 0 ? Math.min(100, Math.round((lordo / valore) * 100)) : null;
  const DurcIcona = durc.stato === "valido" ? ShieldCheck : ShieldAlert;
  return (
    <li className={cn("rounded-lg border bg-card px-4 py-3", s.stato === "risolto" && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {s.subappaltatore.id ? (
              <Link to={`/azienda/subappaltatori/${s.subappaltatore.id}`} className="hover:underline">{s.subappaltatore.nome}</Link>
            ) : s.subappaltatore.nome}
            {s.numero && <span className="ml-1.5 text-xs font-normal text-muted-foreground">contratto {s.numero}</span>}
          </p>
          {s.descrizione && <p className="text-xs text-muted-foreground">{s.descrizione}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">{STATI_SUBAPPALTO[s.stato] ?? s.stato}</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", STILE_DOCUMENTO[durc.stato])}>
            <DurcIcona className="h-3 w-3" /> {testoDurc(durc.stato, durc.scadenza)}
          </span>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Valore</dt><dd className="tabular-nums">{euro(valore)}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">A SAL</dt>
          <dd className="tabular-nums">{euro(lordo)}{avanzamento !== null && <span className="ml-1 text-xs text-muted-foreground">{avanzamento}%</span>}</dd>
        </div>
        <div><dt className="text-xs text-muted-foreground">Pagato</dt><dd className="tabular-nums">{euro(pagato)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Periodo</dt><dd>{s.dataInizio || s.dataFinePrevista ? `${dataIt(s.dataInizio)} → ${dataIt(s.dataFinePrevista)}` : "—"}</dd></div>
      </dl>

      {altri.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {altri.map((d) => (
            <span key={d.tipo} className={cn("rounded-full border px-2 py-0.5", STILE_DOCUMENTO[d.stato])}>
              {NOMI_DOCUMENTO[d.tipo] ?? d.tipo} {d.stato === "scaduto" ? "scaduto" : "in scadenza"} il {dataIt(d.scadenza)}
            </span>
          ))}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
        <span className="text-xs text-muted-foreground">Ordini di lavoro:</span>
        {suoi.map((o) => (
          <Link key={o.id} to={`/azienda/ordini/${o.id}`} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted/50">
            {nomeOrdine(o)}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {onLega && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onLega}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Ordini</Button>
          )}
          {s.subappaltatore.id && (
            <Button asChild size="sm" variant="ghost" className="h-8">
              <Link to={`/azienda/subappaltatori/${s.subappaltatore.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> SAL e documenti</Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function SogliaDialog({ open, onOpenChange, generaleId, sogliaPct }: { open: boolean; onOpenChange: (o: boolean) => void; generaleId: string; sogliaPct: number | null }) {
  const salva = useSogliaSubappalti(generaleId);
  const [valore, setValore] = useState<number | null>(sogliaPct);
  const sbagliato = valore !== null && (Number.isNaN(valore) || valore <= 0 || valore > 100);
  const conferma = () => {
    salva.mutate(valore, {
      onSuccess: () => { toast.success(valore === null ? "Soglia tolta" : `Soglia al ${percentoIt(valore)}`); onOpenChange(false); },
      onError: (e) => toast.error(messaggioGenerale(e, "la soglia")),
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Soglia dei subappalti</DialogTitle>
          <DialogDescription>
            Quanta parte del contratto si può subappaltare. Negli appalti pubblici la indicano il bando o il contratto;
            in quelli privati di solito non c'è. Lascia vuoto per non avere avvisi.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CampoNumero
            etichetta="Soglia sul valore aggiornato del contratto"
            valore={sogliaPct}
            onChange={setValore}
            suffisso="%"
            placeholder="Nessuna"
            errore={sbagliato && !Number.isNaN(valore) ? "Una percentuale tra 0 e 100." : undefined}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={conferma} disabled={sbagliato || salva.isPending}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LegaOrdiniDialog({ generaleId, s, ordini, onChiudi }: { generaleId: string; s: Subappalto; ordini: OrdineDiLavoro[]; onChiudi: () => void }) {
  const collega = useCollegaSubappalto(generaleId);
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(s.ordiniCollegati));
  const cambia = (id: string, si: boolean) => setScelti((prima) => {
    const dopo = new Set(prima);
    if (si) dopo.add(id); else dopo.delete(id);
    return dopo;
  });
  const conferma = () => {
    collega.mutate({ contrattoId: s.id, ordini: [...scelti] }, {
      onSuccess: () => { toast.success("Ordini di lavoro aggiornati"); onChiudi(); },
      onError: (e) => toast.error(messaggioGenerale(e, "il subappalto")),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Su quali ordini lavora {s.subappaltatore.nome}</DialogTitle>
          <DialogDescription>
            Il contratto resta uno, con i suoi SAL: qui dici a quali altri ordini di lavoro dello stesso appalto si riferisce.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
          {ordini.map((o) => {
            const principale = o.id === s.orderId;
            return (
              <li key={o.id}>
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={principale || scelti.has(o.id)}
                    disabled={principale}
                    onCheckedChange={(v) => cambia(o.id, v === true)}
                  />
                  <span className="min-w-0 flex-1 truncate">{nomeOrdine(o)}</span>
                  {principale && <span className="text-xs text-muted-foreground">contratto fatto qui</span>}
                </label>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={conferma} disabled={collega.isPending}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
