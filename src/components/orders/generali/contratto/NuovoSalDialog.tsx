// src/components/orders/generali/contratto/NuovoSalDialog.tsx
// Emettere un SAL di contratto in tre passi (piano §3.2, F4): periodo → avanzamenti o misure di
// ogni ordine di lavoro, già precompilati → lordo, ritenuta, recupero dell'anticipazione e netto.
// I numeri li calcola il database (generale_sal_anteprima): qui si propongono le percentuali.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAnteprimaSal, useCreaSal } from "@/hooks/useGeneraleContrattoSal";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import { aggiungiGiorni, messaggioContratto, oggiIso, type AnteprimaSal, type ContrattoGenerale } from "@/lib/orders/generali/contratto";
import { leggiNumero } from "@/lib/orders/generali/contrattoElenco";
import { cn } from "@/lib/utils";
import { Campo } from "./campi";
import { dataIt, euro, numeroIt, percentoIt } from "./formato";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PASSI = ["Periodo", "Lavori", "Riepilogo"] as const;

export function NuovoSalDialog({ open, onOpenChange, generaleId, contratto, figlie, ultimoAl }: {
  open: boolean; onOpenChange: (o: boolean) => void; generaleId: string; contratto: ContrattoGenerale;
  figlie: FigliaGenerale[]; ultimoAl: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {open && <Procedura chiudi={() => onOpenChange(false)} generaleId={generaleId} contratto={contratto} figlie={figlie} ultimoAl={ultimoAl} />}
      </DialogContent>
    </Dialog>
  );
}

function Procedura({ chiudi, generaleId, contratto, figlie, ultimoAl }: {
  chiudi: () => void; generaleId: string; contratto: ContrattoGenerale; figlie: FigliaGenerale[]; ultimoAl: string | null;
}) {
  const tr = useT();
  const oggi = oggiIso();
  const [passo, setPasso] = useState(0);
  const [dal, setDal] = useState(ultimoAl === oggi ? oggi : ultimoAl ? aggiungiGiorni(ultimoAl, 1) : contratto.dataConsegnaLavori ?? "");
  const [al, setAl] = useState(oggi);
  const [note, setNote] = useState("");
  const [avanzamenti, setAvanzamenti] = useState<Record<string, number>>({});
  // Le percentuali scritte arrivano all'anteprima poco dopo l'ultima battuta.
  const [inviati, setInviati] = useState<Record<string, number>>({});
  useEffect(() => {
    const t = setTimeout(() => setInviati(avanzamenti), 400);
    return () => clearTimeout(t);
  }, [avanzamenti]);

  const periodoOk = /^\d{4}-\d{2}-\d{2}$/.test(al) && (!dal || dal <= al) && (!ultimoAl || al >= ultimoAl);
  const anteprima = useAnteprimaSal(generaleId, al, inviati, passo > 0 && periodoOk);
  const crea = useCreaSal(generaleId);
  const a = anteprima.data;
  const inAttesa = anteprima.isFetching || inviati !== avanzamenti;

  const conferma = () => {
    // La data del documento la fissa l'emissione, come nei SAL di commessa.
    crea.mutate({ dal: dal || null, al, data: oggi, avanzamenti: inviati, note: note.trim() || null }, {
      onSuccess: () => { toast.success(tr("Bozza del SAL n. {numero} pronta: controllala ed emettila.", { numero: a?.numero ?? "" })); chiudi(); },
      onError: (e) => toast.error(messaggioContratto(e, "il SAL")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{a ? tr("Nuovo SAL di contratto n. {numero}", { numero: a.numero }) : tr("Nuovo SAL di contratto")}</DialogTitle>
        <DialogDescription>
          <span className="flex flex-wrap gap-x-3">
            {PASSI.map((p, i) => (
              <span key={p} className={cn(i === passo ? "font-medium text-foreground" : "text-muted-foreground")}>{i + 1}. {tr(p)}</span>
            ))}
          </span>
        </DialogDescription>
      </DialogHeader>

      {passo === 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etichetta={tr("Lavori dal")}>{(id) => <Input id={id} type="date" value={dal} onChange={(e) => setDal(e.target.value)} />}</Campo>
            <Campo
              etichetta={tr("Lavori fino al")}
              errore={ultimoAl && al && al < ultimoAl ? tr("Il SAL precedente arriva al {data}.", { data: dataIt(ultimoAl) }) : dal && al && dal > al ? tr("Viene prima dell'inizio.") : undefined}
              aiuto={tr("Entrano le misure fino a questo giorno.")}
            >
              {(id) => <Input id={id} type="date" value={al} onChange={(e) => setAl(e.target.value)} />}
            </Campo>
          </div>
          <Campo etichetta={tr("Note per il committente")}>{(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Campo>
        </div>
      )}

      {passo === 1 && (
        anteprima.isLoading || !a ? (
          anteprima.isError
            ? <p role="alert" className="text-sm text-destructive">{messaggioContratto(anteprima.error, "il SAL")}</p>
            : <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : (
          <VociSal anteprima={a} figlie={figlie} avanzamenti={avanzamenti} setAvanzamenti={setAvanzamenti} />
        )
      )}

      {passo === 2 && a && <Riepilogo anteprima={a} contratto={contratto} inAttesa={inAttesa} />}

      <DialogFooter className="gap-2 sm:justify-between sm:gap-0">
        <Button type="button" variant="ghost" onClick={() => (passo === 0 ? chiudi() : setPasso(passo - 1))}>
          {passo === 0 ? tr("Annulla") : <><ArrowLeft className="mr-1.5 h-4 w-4" /> {tr("Indietro")}</>}
        </Button>
        {passo < 2 ? (
          <Button type="button" disabled={!periodoOk || (passo === 1 && (!a || a.voci.length === 0))} onClick={() => setPasso(passo + 1)}>
            {tr("Avanti")} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={conferma} disabled={crea.isPending || inAttesa || !a || a.lordo <= 0}>
            {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("Crea la bozza")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function VociSal({ anteprima, figlie, avanzamenti, setAvanzamenti }: {
  anteprima: AnteprimaSal; figlie: FigliaGenerale[]; avanzamenti: Record<string, number>;
  setAvanzamenti: (f: (x: Record<string, number>) => Record<string, number>) => void;
}) {
  const t = useT();
  const perFiglia = useMemo(() => new Map(figlie.map((f) => [f.id, f])), [figlie]);
  if (anteprima.voci.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {t("Non c'è ancora lavoro da mettere a SAL: dai un importo agli ordini di lavoro o scrivi le misure.")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("Le voci sono cumulative, dall'inizio dei lavori. Gli ordini ad avanzamento propongono la loro percentuale: correggila se serve.")}
        {anteprima.misureNuove > 0 && ` ${t(anteprima.misureNuove === 1 ? "Entrano 1 misura nuova." : "Entrano {n} misure nuove.", { n: anteprima.misureNuove })}`}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t("Voce")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("Contrattuale")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("Avanzamento")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Importo")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {anteprima.voci.map((v) => {
              const f = v.figliaId ? perFiglia.get(v.figliaId) : undefined;
              return (
                <tr key={`${v.ordine}-${v.figliaId}-${v.voceId}`}>
                  <td className="max-w-[24rem] px-3 py-1.5">
                    <span className="block">{v.descrizione}</span>
                    {f && (
                      <Link to={`/azienda/ordini/${f.id}`} target="_blank" className="text-xs text-muted-foreground hover:underline">
                        {t(v.tipo === "misure" ? "da {nome} · misure" : "da {nome}", { nome: f.codice ?? f.nome })}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euro(v.importoContrattuale)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {v.tipo === "avanzamento" && v.figliaId ? (
                      <CampoPercentuale
                        etichetta={t("Avanzamento di {nome}", { nome: f?.codice ?? f?.nome ?? t("questo ordine") })}
                        valore={avanzamenti[v.figliaId] ?? v.percentuale}
                        onChange={(p) => setAvanzamenti((x) => ({ ...x, [v.figliaId!]: p }))}
                      />
                    ) : v.tipo === "misure" ? (
                      <span className="text-xs text-muted-foreground">{numeroIt(v.quantita, 3)} {v.unita}</span>
                    ) : (
                      <span className="tabular-nums">{percentoIt(v.percentuale)}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{euro(v.importo)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-3 py-2" colSpan={3}>{t("Lavori eseguiti dall'inizio")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{euro(anteprima.cumulativo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CampoPercentuale({ etichetta, valore, onChange }: { etichetta: string; valore: number; onChange: (p: number) => void }) {
  const [testo, setTesto] = useState(numeroIt(valore, 2));
  const n = leggiNumero(testo);
  const sbagliato = n === null || n < 0 || n > 100;
  return (
    <div className="ml-auto flex w-24 items-center gap-1">
      <Input
        aria-label={etichetta}
        inputMode="decimal"
        className="h-8 text-right"
        value={testo}
        aria-invalid={sbagliato || undefined}
        onChange={(e) => {
          setTesto(e.target.value);
          const p = leggiNumero(e.target.value);
          if (p !== null && p >= 0 && p <= 100) onChange(Math.round(p * 100) / 100);
        }}
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function Riepilogo({ anteprima: a, contratto, inAttesa }: { anteprima: AnteprimaSal; contratto: ContrattoGenerale; inAttesa: boolean }) {
  const t = useT();
  const righe: { etichetta: string; valore: number; tono?: "meno" | "totale"; nota?: string }[] = [
    { etichetta: t("Lavori eseguiti dall'inizio"), valore: a.cumulativo },
    { etichetta: t("Meno: già messi a SAL"), valore: -a.precedente, tono: "meno" },
    { etichetta: t("Lavori di questo SAL"), valore: a.lordo, tono: "totale" },
    { etichetta: t("Ritenuta di garanzia {perc}", { perc: percentoIt(a.ritenutaPct) }), valore: -a.ritenuta, tono: "meno", nota: t("Si svincola a fine lavori.") },
    ...(a.recupero > 0 || a.recuperoPct > 0
      ? [{ etichetta: t("Recupero dell'anticipazione {perc}", { perc: percentoIt(a.recuperoPct) }), valore: -a.recupero, tono: "meno" as const, nota: t("Resta da recuperare {importo}.", { importo: euro(Math.max(0, a.anticipazioneResidua - a.recupero)) }) }]
      : []),
    { etichetta: t("Netto da liquidare"), valore: a.netto, tono: "totale" },
  ];
  return (
    <div className={cn("space-y-3", inAttesa && "opacity-60")} aria-busy={inAttesa}>
      {a.lordo <= 0 && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t("Rispetto all'ultimo SAL non c'è lavoro nuovo: aggiorna avanzamenti o misure.")}
        </p>
      )}
      <dl className="divide-y rounded-md border text-sm">
        {righe.map((r) => (
          <div key={r.etichetta} className={cn("flex items-baseline justify-between gap-3 px-3 py-2", r.tono === "totale" && "bg-muted/30 font-semibold")}>
            <dt>
              <span className={cn(r.tono === "meno" && "text-muted-foreground")}>{r.etichetta}</span>
              {r.nota && <span className="block text-xs font-normal text-muted-foreground">{r.nota}</span>}
            </dt>
            <dd className="tabular-nums">{euro(r.valore)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {t("Importi IVA esclusa.")}
        {contratto.splitPayment && ` ${t("La fattura andrà in scissione dei pagamenti: l'IVA la versa il committente.")}`}
        {contratto.reverseCharge && ` ${t("La fattura andrà in inversione contabile, senza IVA.")}`}
        {" "}{t("La bozza non si manda a nessuno: la controlli, poi la emetti e prepari il documento.")}
      </p>
    </div>
  );
}
