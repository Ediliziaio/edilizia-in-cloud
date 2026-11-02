/**
 * «Sul file c'è scritto questo: lo metto?»
 *
 * Il caricamento in blocco ha riempito l'archivio, ma le date restavano da
 * battere a mano una per una. Qui i file appena caricati si leggono e la
 * scadenza **si propone**: si vede nel campo, si può correggere, si conferma. Chi
 * trascina venti PDF conferma venti date senza digitare niente.
 *
 * Perché una finestra e non il campo che si riempie da solo: una scadenza
 * sbagliata su un DURC è peggio di una scadenza mancante. Quella mancante si
 * vede vuota; quella sbagliata ti fa credere di essere a posto e te ne accorgi
 * in gara. Quindi niente si scrive prima che qualcuno l'abbia guardato — e le
 * carte che hanno già una data non arrivano nemmeno qui.
 *
 * La stessa finestra serve tutti i punti in cui un file entra: il caricamento in
 * blocco, il bottone «Carica il file» sulla riga, il salvataggio dal modulo.
 */
import { useEffect, useState } from 'react';
import { CalendarCheck, Loader2, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useApplicaLettureDocumenti, type LetturaConfermata } from '@/hooks/useDocumentiAzienda';
import {
  campiDaScrivere, leggiCartaConAI, qualcosaDaProporre, siPuoLeggere,
  type LetturaCarta,
} from '@/lib/documentiAzienda/letturaAI';
import { ETICHETTA_CATEGORIA, type CartaDaLeggere, type DatiDocumento } from '@/types/documentiAzienda';

/** Due alla volta: leggere un PDF costa qualche secondo, venti in fila sono due minuti. */
const INSIEME = 2;

type Esito =
  | { stato: 'attesa' }
  | { stato: 'leggo' }
  | { stato: 'letto'; lettura: LetturaCarta }
  | { stato: 'nonLeggibile' }
  | { stato: 'errore'; motivo: string };

/** Cosa cambierà sulla carta, detto in italiano e senza nomi di campi. */
function descrivi(dati: Partial<DatiDocumento>): string[] {
  const righe: string[] = [];
  if (dati.titolo) righe.push(`si chiamerà «${dati.titolo}»`);
  if (dati.categoria) righe.push(`va in ${ETICHETTA_CATEGORIA[dati.categoria]}`);
  if (dati.ente) righe.push(`rilasciato da ${dati.ente}`);
  if (dati.numero) righe.push(`numero ${dati.numero}`);
  if (dati.data_documento) righe.push(`del ${dati.data_documento.split('-').reverse().join('/')}`);
  return righe;
}

/** Di questo file il modello legge il contenuto; di un .doc o di un .heic no. */
function leggibile(carta: CartaDaLeggere): boolean {
  return siPuoLeggere(carta.nomeFile) || siPuoLeggere(carta.mime ?? '');
}

export default function ConfermaDateLette({ carte, onChiudi }: {
  carte: CartaDaLeggere[];
  onChiudi: () => void;
}) {
  const companyId = useEffectiveCompanyId();
  const applica = useApplicaLettureDocumenti();
  // Un .doc o un .heic il modello non li legge: si sa subito, senza chiedere.
  const [esiti, setEsiti] = useState<Esito[]>(() =>
    carte.map((c) => (leggibile(c) ? { stato: 'attesa' } : { stato: 'nonLeggibile' })),
  );
  const [scadenze, setScadenze] = useState<string[]>(() => carte.map(() => ''));
  const [scelti, setScelti] = useState<boolean[]>(() => carte.map(() => false));

  useEffect(() => {
    if (!companyId) return;
    const coda = carte.map((_, i) => i).filter((i) => leggibile(carte[i]));
    // Bandiera di QUESTO giro, non un ref condiviso: in sviluppo React monta due
    // volte, e con un ref solo il secondo giro riaccenderebbe anche il primo —
    // due letture per ogni file.
    let vivo = true;

    const scrivi = (i: number, e: Esito) =>
      setEsiti((prima) => prima.map((x, k) => (k === i ? e : x)));

    const lavora = async () => {
      for (;;) {
        const i = coda.shift();
        if (i === undefined || !vivo) return;
        scrivi(i, { stato: 'leggo' });
        try {
          const lettura = await leggiCartaConAI({
            companyId,
            path: carte[i].path,
            nomeFile: carte[i].nomeFile,
            mime: carte[i].mime,
          });
          if (!vivo) return;
          scrivi(i, { stato: 'letto', lettura });
          if (lettura.data_scadenza) {
            setScadenze((prima) => prima.map((s, k) => (k === i ? lettura.data_scadenza! : s)));
          }
          if (qualcosaDaProporre(carte[i], lettura)) {
            setScelti((prima) => prima.map((s, k) => (k === i ? true : s)));
          }
        } catch (e) {
          if (!vivo) return;
          scrivi(i, { stato: 'errore', motivo: e instanceof Error ? e.message : 'non letto' });
        }
      }
    };
    for (let n = 0; n < INSIEME; n++) void lavora();
    return () => { vivo = false; };
    // Le carte arrivano una volta all'apertura: rileggere a ogni render costerebbe
    // una chiamata AI per ogni battuta nel campo della data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const finite = esiti.filter((e) => e.stato !== 'attesa' && e.stato !== 'leggo').length;
  const leggendo = finite < carte.length;

  const daScrivere: LetturaConfermata[] = carte.flatMap((carta, i) => {
    const e = esiti[i];
    if (!scelti[i] || e.stato !== 'letto') return [];
    const dati = campiDaScrivere(carta, e.lettura, scadenze[i]);
    return Object.keys(dati).length > 0 ? [{ documentoId: carta.documentoId, dati }] : [];
  });

  const salva = () => {
    if (daScrivere.length === 0) return;
    applica.mutate(daScrivere, { onSuccess: () => onChiudi() });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !applica.isPending) onChiudi(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {carte.length === 1 ? 'Ho letto il file' : 'Ho letto i file'}
          </DialogTitle>
          <DialogDescription>
            Le scadenze che ho trovato sul documento. Controllale: le metto solo quelle
            che spunti, e quelle che correggi le scrivo come le hai corrette.
          </DialogDescription>
        </DialogHeader>

        {leggendo && (
          <div className="space-y-2">
            <Progress value={carte.length > 0 ? (finite / carte.length) * 100 : 0} />
            <p className="text-xs text-muted-foreground tabular-nums">
              Leggo: {finite} di {carte.length}
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="divide-y">
            {carte.map((carta, i) => {
              const e = esiti[i];
              const dati = e.stato === 'letto' ? campiDaScrivere(carta, e.lettura, scadenze[i]) : {};
              const proponibile = e.stato === 'letto' && qualcosaDaProporre(carta, e.lettura);
              const altro = descrivi({ ...dati, data_scadenza: undefined });
              return (
                <div key={carta.documentoId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {dati.titolo || carta.titolo}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{carta.nomeFile}</p>
                    {e.stato === 'leggo' && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Leggo il documento…
                      </p>
                    )}
                    {e.stato === 'attesa' && <p className="mt-1 text-xs text-muted-foreground">In coda</p>}
                    {e.stato === 'nonLeggibile' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Questo non so leggerlo: la data va messa a mano.
                      </p>
                    )}
                    {e.stato === 'errore' && (
                      <p className="mt-1 text-xs text-destructive">Non sono riuscito a leggerlo.</p>
                    )}
                    {e.stato === 'letto' && !proponibile && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.lettura.senza_scadenza
                          ? 'Il documento dice di non scadere: lascio vuota la scadenza.'
                          : 'Sul documento non ho trovato una scadenza.'}
                      </p>
                    )}
                    {e.stato === 'letto' && proponibile && altro.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{altro.join(' · ')}</p>
                    )}
                  </div>

                  {e.stato === 'letto' && proponibile && (
                    <div className="flex items-center gap-2 sm:w-64">
                      <Checkbox
                        checked={scelti[i]}
                        aria-label={`Metti quello che ho letto su ${carta.titolo}`}
                        onCheckedChange={(v) =>
                          setScelti((prima) => prima.map((s, k) => (k === i ? v === true : s)))
                        }
                      />
                      <Input
                        type="date"
                        value={scadenze[i]}
                        disabled={!scelti[i]}
                        onChange={(ev) =>
                          setScadenze((prima) => prima.map((s, k) => (k === i ? ev.target.value : s)))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={applica.isPending}>
            Lascia stare
          </Button>
          <Button onClick={salva} disabled={applica.isPending || daScrivere.length === 0}>
            <CalendarCheck className="mr-2 h-4 w-4" />
            {applica.isPending
              ? 'Metto…'
              : daScrivere.length === 1 ? 'Metti la data' : `Metti ${daScrivere.length} date`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
