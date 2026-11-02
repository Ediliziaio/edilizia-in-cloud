/**
 * /azienda/impostazioni/documenti-azienda
 *
 * Le carte della ditta: ISO, SOA, DURC, visura, polizze, iscrizioni, contatori,
 * estintori. Quelle che se scadono fermano una gara o un cantiere.
 *   - In cima tre numeri cliccabili: scaduti, in scadenza, a posto. Sono anche i filtri.
 *   - L'elenco è raggruppato per categoria; una riga si apre e mostra i dettagli e lo storico.
 *   - Un documento può non avere scadenza (statuto, organigramma): si carica e basta.
 *   - «Rinnovato»: si mette la data nuova, la scadenza si calcola da sola e la versione
 *     vecchia resta nello storico col suo file.
 *   - La prima volta la pagina propone le carte che ha quasi ogni impresa edile: si spunta
 *     quello che si ha, il resto sparisce e non torna più. Nessun obbligo.
 *   - In sola lettura non compare nessun comando.
 */

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Lock, Paperclip,
  Pencil, Plus, RotateCw, Search, Trash2, Upload, X,
} from 'lucide-react';

import { usePermissions } from '@/hooks/usePermissions';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useSediList } from '@/hooks/useSediAnalytics';
import { useCompanyStaffUsers } from '@/hooks/useCompanyStaffUsers';
import {
  caricaFileDocumento, linkFileDocumento, rimuoviFileDocumento,
  useAggiungiDaElencoDiPartenza, useAllegaFileDocumento, useDocumentiAzienda, useEliminaDocumentoAzienda,
  useElencoDiPartenzaDaMostrare, useRinnovaDocumentoAzienda, useSalvaDocumentoAzienda,
  useStoricoDocumento,
} from '@/hooks/useDocumentiAzienda';
import {
  CATEGORIE_DOCUMENTO, ELENCO_DI_PARTENZA, ETICHETTA_CATEGORIA, PREAVVISO_PREDEFINITO,
  type CategoriaDocumento, type DatiDocumento, type DocumentoAzienda, type StatoDocumento,
} from '@/types/documentiAzienda';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Aiutanti ─────────────────────────────────────────────────────────────────

/**
 * Oggi in `aaaa-mm-gg`, secondo l'orologio di chi guarda.
 *
 * `toISOString()` passa per UTC: in Italia, dalla mezzanotte all'una (alle due d'estate)
 * restituisce il giorno prima. Qui si leggono i pezzi della data locale e basta.
 */
function dataISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

const OGGI = () => dataISO(new Date());

/**
 * Da quanti documenti in su hanno senso i tre contatori e il filtro.
 *
 * Sotto, l'elenco si legge tutto in una schermata e tre riquadroni con «1», «0», «3» sono solo
 * rumore. Stessa scelta delle Sedi (`SEDI_PER_FILTRARE`).
 */
const DOCUMENTI_PER_FILTRARE = 8;

function dataItaliana(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

/**
 * «fra 12 giorni», «scaduto da 3 mesi», «scade oggi».
 *
 * Oltre l'anno non si conta più: «fra 1005 giorni» non dice niente a nessuno, e la data da sola
 * basta. Sopra i due mesi si passa ai mesi, che è come si parla di queste scadenze.
 */
function quantoManca(giorni: number | null): string {
  if (giorni === null) return '';
  if (giorni === 0) return 'scade oggi';
  if (giorni > 365) return '';
  const mesi = (n: number) => (n === 1 ? '1 mese' : `${n} mesi`);
  if (giorni > 0) {
    if (giorni <= 60) return giorni === 1 ? 'fra 1 giorno' : `fra ${giorni} giorni`;
    return `fra ${mesi(Math.round(giorni / 30))}`;
  }
  const passati = Math.abs(giorni);
  if (passati <= 60) return passati === 1 ? 'scaduto da 1 giorno' : `scaduto da ${passati} giorni`;
  if (passati <= 365) return `scaduto da ${mesi(Math.round(passati / 30))}`;
  const anni = Math.floor(passati / 365);
  return anni === 1 ? 'scaduto da oltre un anno' : `scaduto da oltre ${anni} anni`;
}

/** Il semaforo: rosso scaduto, giallo in scadenza, verde a posto, grigio senza scadenza. */
const COLORE_PALLINO: Record<StatoDocumento, string> = {
  scaduto: 'bg-destructive',
  in_scadenza: 'bg-warning',
  valido: 'bg-success',
  senza_scadenza: 'bg-muted-foreground/40',
};

/** La riga porta lo stesso colore sul bordo sinistro: si legge di sbieco, senza cercare il pallino. */
const BORDO_RIGA: Record<StatoDocumento, string> = {
  scaduto: 'border-l-destructive',
  in_scadenza: 'border-l-warning',
  valido: 'border-l-success/60',
  senza_scadenza: 'border-l-transparent',
};

function mesiLeggibili(mesi: number | null): string {
  if (!mesi) return 'Non si rinnova da solo';
  if (mesi === 12) return 'Ogni anno';
  if (mesi === 6) return 'Ogni sei mesi';
  if (mesi === 3) return 'Ogni tre mesi';
  if (mesi % 12 === 0) return `Ogni ${mesi / 12} anni`;
  return `Ogni ${mesi} mesi`;
}

const SCELTE_RINNOVO = [
  { valore: '0', etichetta: 'Non si rinnova da solo' },
  { valore: '3', etichetta: 'Ogni tre mesi' },
  { valore: '4', etichetta: 'Ogni quattro mesi (DURC)' },
  { valore: '6', etichetta: 'Ogni sei mesi' },
  { valore: '12', etichetta: 'Ogni anno' },
  { valore: '24', etichetta: 'Ogni due anni' },
  { valore: '36', etichetta: 'Ogni tre anni' },
  { valore: '60', etichetta: 'Ogni cinque anni' },
];

/**
 * La scadenza che viene fuori dalla data del documento più i mesi di rinnovo.
 *
 * Si lavora sui pezzi della data, senza fuso: prima si passava da `toISOString()` e ogni
 * scadenza calcolata cadeva un giorno prima (02/11 + un anno dava 01/11/2027).
 */
function scadenzaDaRinnovo(dataDocumento: string, mesi: number | null): string {
  if (!mesi) return '';
  const [a, m, g] = dataDocumento.split('-').map(Number);
  if (!a || !m || !g) return '';
  const d = new Date(a, m - 1, g);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + mesi);
  return dataISO(d);
}

/**
 * Apre il file in una scheda nuova.
 *
 * La scheda si apre subito, nello stesso istante del clic, e il link firmato ci arriva dopo:
 * se si aspetta prima di aprirla, il browser la prende per una finestra che non ha chiesto
 * nessuno e la blocca (Safari sempre, Chrome a volte), e all'utente non succede niente.
 */
async function apriFile(path: string | null) {
  if (!path) return;
  const scheda = window.open('', '_blank');
  if (scheda) scheda.opener = null;
  const url = await linkFileDocumento(path);
  if (!url) {
    scheda?.close();
    toast.error('Non è riuscito ad aprire il file');
    return;
  }
  if (scheda && !scheda.closed) scheda.location.href = url;
  else window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Pagina ───────────────────────────────────────────────────────────────────

type Filtro = 'tutti' | 'scaduto' | 'in_scadenza' | 'valido';

export default function SettingsDocumentiAzienda() {
  const permissions = usePermissions();
  const puoModificare = permissions.isAdmin || permissions.canEditSettingsProfile;

  const { data: documenti = [], isLoading } = useDocumentiAzienda();
  const { data: mostraPartenza = false } = useElencoDiPartenzaDaMostrare();

  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [cerca, setCerca] = useState('');
  const [aperto, setAperto] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState<DocumentoAzienda | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [daRinnovare, setDaRinnovare] = useState<DocumentoAzienda | null>(null);
  const [daEliminare, setDaEliminare] = useState<DocumentoAzienda | null>(null);

  const conti = useMemo(() => ({
    scaduto: documenti.filter((d) => d.stato === 'scaduto').length,
    in_scadenza: documenti.filter((d) => d.stato === 'in_scadenza').length,
    valido: documenti.filter((d) => d.stato === 'valido' || d.stato === 'senza_scadenza').length,
  }), [documenti]);

  const visibili = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    return documenti.filter((d) => {
      if (filtro === 'valido' && d.stato !== 'valido' && d.stato !== 'senza_scadenza') return false;
      if (filtro !== 'tutti' && filtro !== 'valido' && d.stato !== filtro) return false;
      if (!testo) return true;
      return [d.titolo, d.ente, d.numero, d.sede_nome, ETICHETTA_CATEGORIA[d.categoria]]
        .some((v) => (v ?? '').toLowerCase().includes(testo));
    });
  }, [documenti, filtro, cerca]);

  const perCategoria = useMemo(() => {
    const gruppi = new Map<CategoriaDocumento, DocumentoAzienda[]>();
    for (const categoria of CATEGORIE_DOCUMENTO) {
      const righe = visibili.filter((d) => d.categoria === categoria);
      if (righe.length > 0) gruppi.set(categoria, righe);
    }
    return gruppi;
  }, [visibili]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      {!puoModificare && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Stai consultando i documenti della ditta: li cambia chi ha il permesso «Profilo
            aziendale» in modifica.
          </AlertDescription>
        </Alert>
      )}

      {documenti.length >= DOCUMENTI_PER_FILTRARE && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Contatore
            etichetta="Scaduti" valore={conti.scaduto} icona={<AlertTriangle className="h-4 w-4" />}
            tono="text-destructive" rail="bg-destructive" attivo={filtro === 'scaduto'}
            onClick={() => setFiltro(filtro === 'scaduto' ? 'tutti' : 'scaduto')}
          />
          <Contatore
            etichetta="In scadenza" valore={conti.in_scadenza} icona={<Clock className="h-4 w-4" />}
            tono="text-warning" rail="bg-warning" attivo={filtro === 'in_scadenza'}
            onClick={() => setFiltro(filtro === 'in_scadenza' ? 'tutti' : 'in_scadenza')}
          />
          <Contatore
            etichetta="A posto" valore={conti.valido} icona={<CheckCircle2 className="h-4 w-4" />}
            tono="text-success" rail="bg-success" attivo={filtro === 'valido'}
            onClick={() => setFiltro(filtro === 'valido' ? 'tutti' : 'valido')}
          />
        </div>
      )}
      {filtro !== 'tutti' && (
        <button
          type="button"
          onClick={() => setFiltro('tutti')}
          className="-mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Mostra tutti i documenti
        </button>
      )}

      {/* In cima alla pagina c'è già la ricerca delle impostazioni: questa, larga uguale e appena
          sotto, sembrava la stessa cosa due volte. Piccola e accanto al comando si capisce che
          filtra l'elenco qui sotto, non la pagina. */}
      {(puoModificare || documenti.length >= DOCUMENTI_PER_FILTRARE) && (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {documenti.length >= DOCUMENTI_PER_FILTRARE && (
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Filtra: nome, ente, numero…"
            className="pl-9"
          />
          {cerca && (
            <button
              type="button"
              onClick={() => setCerca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Pulisci la ricerca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        )}
        {puoModificare && (
          <Button onClick={() => setNuovo(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi documento
          </Button>
        )}
      </div>
      )}

      {/* Il suggerimento sta sotto il comando: chi sa già cosa caricare non deve scavalcarlo. */}
      {mostraPartenza && puoModificare && documenti.length === 0 && <ElencoDiPartenza />}

      {visibili.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {documenti.length === 0 ? 'Non c’è ancora nessun documento' : 'Nessun documento con questi filtri'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {documenti.length === 0
                ? 'Aggiungi la prima carta della ditta: il DURC, la visura, una polizza.'
                : 'Prova a togliere la ricerca o a cambiare filtro.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...perCategoria.entries()].map(([categoria, righe]) => (
            <div key={categoria} className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {ETICHETTA_CATEGORIA[categoria]}
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {righe.length}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <Card className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {righe.map((d) => (
                    <Riga
                      key={d.id}
                      documento={d}
                      aperta={aperto === d.id}
                      onApri={() => setAperto(aperto === d.id ? null : d.id)}
                      puoModificare={puoModificare}
                      onModifica={() => setInModifica(d)}
                      onRinnova={() => setDaRinnovare(d)}
                      onElimina={() => setDaEliminare(d)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {(nuovo || inModifica) && (
        <ModuloDocumento
          documento={inModifica}
          onChiudi={() => { setNuovo(false); setInModifica(null); }}
        />
      )}
      {daRinnovare && (
        <ModuloRinnovo documento={daRinnovare} onChiudi={() => setDaRinnovare(null)} />
      )}
      <AlertDialog open={!!daEliminare} onOpenChange={(v) => !v && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimino «{daEliminare?.titolo}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Sparisce dall’elenco insieme ai file che hai caricato, anche quelli delle versioni
              precedenti. Non si torna indietro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lascia stare</AlertDialogCancel>
            <BottoneElimina documento={daEliminare} onFatto={() => setDaEliminare(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Pezzi ────────────────────────────────────────────────────────────────────

function Contatore({ etichetta, valore, icona, tono, rail, attivo, onClick }: {
  etichetta: string; valore: number; icona: React.ReactNode; tono: string; rail: string;
  attivo: boolean; onClick: () => void;
}) {
  const spento = valore === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attivo}
      className={`relative overflow-hidden rounded-lg border px-3 py-3 text-left transition-all sm:px-4
        ${attivo ? 'border-foreground/20 bg-muted shadow-sm' : 'hover:border-foreground/15 hover:bg-muted/40'}
        ${spento && !attivo ? 'opacity-60' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${spento ? 'bg-muted-foreground/20' : rail}`} aria-hidden />
      {/* Sul telefono l'etichetta va a capo invece di tagliarsi: «In scad…» non vuol dire niente. */}
      <span className={`flex items-start gap-1.5 ${spento ? 'text-muted-foreground' : tono}`}>
        <span className="mt-px shrink-0">{icona}</span>
        <span className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wide sm:text-sm sm:normal-case sm:tracking-normal">
          {etichetta}
        </span>
      </span>
      <p className="mt-1 text-3xl font-semibold tabular-nums leading-none">{valore}</p>
    </button>
  );
}

function Riga({ documento, aperta, onApri, puoModificare, onModifica, onRinnova, onElimina }: {
  documento: DocumentoAzienda;
  aperta: boolean;
  onApri: () => void;
  puoModificare: boolean;
  onModifica: () => void;
  onRinnova: () => void;
  onElimina: () => void;
}) {
  const { data: storico = [] } = useStoricoDocumento(aperta ? documento.id : undefined);
  const dettagli = [documento.ente, documento.numero, documento.sede_nome].filter(Boolean).join(' · ');
  // «Rinnovato» sta in riga solo dove è la mossa del giorno. Sugli altri si trova aprendo la riga:
  // ventiquattro righe con tre comandi ciascuna sono un muro, e nessuno rinnova una SOA del 2028.
  const daRinnovare = documento.stato === 'scaduto' || documento.stato === 'in_scadenza';

  return (
    <div className={`border-l-[3px] transition-colors ${BORDO_RIGA[documento.stato]} ${aperta ? 'bg-muted/20' : ''}`}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onApri}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={aperta}
        >
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COLORE_PALLINO[documento.stato]}`} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium group-hover:underline group-hover:underline-offset-4">
                {documento.titolo}
              </span>
              {documento.file_path && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              {documento.versioni_precedenti > 0 && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {documento.versioni_precedenti + 1}ª versione
                </span>
              )}
            </span>
            {dettagli && (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">{dettagli}</span>
            )}
          </span>
          {aperta ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>

        <div className="flex shrink-0 items-center gap-3 pl-6 sm:pl-0">
          <div className="min-w-[9rem] text-sm sm:text-right">
            {documento.data_scadenza ? (
              <>
                <p className="font-medium tabular-nums">{dataItaliana(documento.data_scadenza)}</p>
                <p className={
                  documento.stato === 'scaduto' ? 'text-destructive'
                  : documento.stato === 'in_scadenza' ? 'text-warning'
                  : 'text-muted-foreground'
                }>
                  {quantoManca(documento.giorni_mancanti)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Senza scadenza</p>
            )}
          </div>
          {puoModificare && (
            <div className="flex items-center gap-1">
              {daRinnovare && (
                <Button variant="outline" size="sm" onClick={onRinnova} title="Segna il documento come rinnovato">
                  <RotateCw className="h-4 w-4" />
                  <span className="ml-1 hidden lg:inline">Rinnovato</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onModifica} aria-label="Modifica">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onElimina} aria-label="Elimina">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {aperta && (
        <div className="space-y-3 border-t bg-muted/30 px-4 py-3 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Dato etichetta="Data del documento" valore={dataItaliana(documento.data_documento)} />
            <Dato etichetta="Rinnovo" valore={mesiLeggibili(documento.rinnovo_mesi)} />
            <Dato
              etichetta="Avvisa"
              valore={
                documento.data_scadenza
                  ? `${documento.alert_giorni_prima} giorni prima · ${
                      documento.alert_destinatari.length > 0
                        ? `${documento.alert_destinatari.length} ${documento.alert_destinatari.length === 1 ? 'persona' : 'persone'}`
                        : 'gli amministratori'
                    }`
                  : 'Non avvisa'
              }
            />
            <Dato etichetta="Sede" valore={documento.sede_nome ?? 'Tutta l’azienda'} />
          </div>
          {documento.note && <p className="whitespace-pre-wrap text-muted-foreground">{documento.note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {documento.file_path ? (
              <Button variant="outline" size="sm" onClick={() => apriFile(documento.file_path)}>
                <Paperclip className="mr-2 h-4 w-4" />
                {documento.file_name ?? 'Apri il file'}
              </Button>
            ) : (
              !puoModificare && <span className="text-muted-foreground">Nessun file caricato</span>
            )}
            {puoModificare && (
              <CaricaQui documento={documento} ha={!!documento.file_path} />
            )}
            {puoModificare && !daRinnovare && (
              <Button variant="outline" size="sm" onClick={onRinnova}>
                <RotateCw className="mr-2 h-4 w-4" />
                Rinnovato
              </Button>
            )}
          </div>
          {storico.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="font-medium">Versioni precedenti</p>
              <ul className="space-y-1">
                {storico.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span className="tabular-nums">
                      {dataItaliana(v.data_documento)} → {dataItaliana(v.data_scadenza)}
                    </span>
                    {v.numero && <span>· {v.numero}</span>}
                    {v.file_path && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        onClick={() => apriFile(v.file_path)}
                      >
                        <Paperclip className="h-3 w-3" />
                        {v.file_name ?? 'file'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Carica il file» dentro la riga aperta.
 *
 * Senza questo, per allegare un PDF bisogna aprire la finestra di modifica, che ha dodici campi
 * già pieni e un bottone Salva: troppo per un gesto che si fa cento volte. Qui si sceglie il
 * file e parte, senza conferme.
 */
function CaricaQui({ documento, ha }: { documento: DocumentoAzienda; ha: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const allega = useAllegaFileDocumento();
  const id = `carica-${documento.id}`;

  return (
    <>
      <input
        ref={campo}
        id={id}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          allega.mutate({ documento, file });
          // Così lo stesso file si può riscegliere subito, se il caricamento va storto.
          if (campo.current) campo.current.value = '';
        }}
      />
      <Button asChild variant={ha ? 'ghost' : 'outline'} size="sm" disabled={allega.isPending}>
        <label htmlFor={id} className="cursor-pointer">
          <Upload className="mr-2 h-4 w-4" />
          {allega.isPending ? 'Carico…' : ha ? 'Sostituisci' : 'Carica il file'}
        </label>
      </Button>
    </>
  );
}

/**
 * Il campo «scegli un file».
 *
 * Il controllo del browser («Scegli file — Nessun file selezionato») è grigio, piccolo e parla
 * la lingua del sistema operativo, non la nostra. Qui resta nascosto: si vede un bottone e il
 * nome del file, con la crocetta per toglierlo.
 */
function SceltaFile({ id, file, nomeAttuale, onFile }: {
  id: string;
  file: File | null;
  nomeAttuale?: string | null;
  onFile: (f: File | null) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={campo}
        id={id}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <Button asChild variant="outline" size="sm">
        <label htmlFor={id} className="cursor-pointer">
          <Upload className="mr-2 h-4 w-4" />
          {file ?? nomeAttuale ? 'Cambia il file' : 'Scegli il file'}
        </label>
      </Button>
      {file ? (
        <span className="flex min-w-0 items-center gap-1 text-sm">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Togli il file"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              // Senza svuotare anche il campo, riscegliere lo stesso file non farebbe scattare niente.
              if (campo.current) campo.current.value = '';
              onFile(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : nomeAttuale ? (
        <span className="min-w-0 truncate text-sm text-muted-foreground">Ora c’è {nomeAttuale}</span>
      ) : (
        <span className="text-sm text-muted-foreground">PDF o foto</span>
      )}
    </div>
  );
}

function Dato({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p>{valore}</p>
    </div>
  );
}

function BottoneElimina({ documento, onFatto }: { documento: DocumentoAzienda | null; onFatto: () => void }) {
  const elimina = useEliminaDocumentoAzienda();
  return (
    <AlertDialogAction
      disabled={elimina.isPending}
      onClick={async () => {
        if (!documento) return;
        await elimina.mutateAsync({ id: documento.id, file_path: documento.file_path });
        onFatto();
      }}
    >
      Elimina
    </AlertDialogAction>
  );
}

// ── L'elenco di partenza ─────────────────────────────────────────────────────

function ElencoDiPartenza() {
  const aggiungi = useAggiungiDaElencoDiPartenza();
  const [scelte, setScelte] = useState<Set<string>>(new Set());

  const cambia = (chiave: string) => {
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(chiave)) dopo.delete(chiave); else dopo.add(chiave);
      return dopo;
    });
  };

  const conferma = async () => {
    const righe: DatiDocumento[] = ELENCO_DI_PARTENZA
      .filter((v) => scelte.has(v.chiave))
      .map((v) => ({
        categoria: v.categoria,
        titolo: v.titolo,
        ente: v.ente ?? null,
        rinnovo_mesi: v.rinnovo_mesi ?? null,
        alert_giorni_prima: PREAVVISO_PREDEFINITO[v.categoria],
      }));
    await aggiungi.mutateAsync(righe);
  };

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="space-y-1">
          <p className="text-base font-semibold">Quali di queste carte ha la tua azienda?</p>
          <p className="text-sm text-muted-foreground">
            Spunta quelle che hai: le aggiungiamo all’elenco e tu ci metti le scadenze.
            Quelle che non spunti non le vedrai più.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ELENCO_DI_PARTENZA.map((v) => {
            const scelta = scelte.has(v.chiave);
            return (
              <label
                key={v.chiave}
                className={`flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 transition-colors
                  ${scelta ? 'border-foreground/25 bg-muted/60' : 'hover:bg-muted/30'}`}
              >
                <Checkbox
                  checked={scelta}
                  onCheckedChange={() => cambia(v.chiave)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{v.titolo}</span>
                  <span className="block text-xs text-muted-foreground">{v.spiegazione}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={conferma} disabled={aggiungi.isPending || scelte.size === 0}>
            Aggiungi {scelte.size > 0 ? `(${scelte.size})` : ''}
          </Button>
          <Button
            variant="ghost"
            disabled={aggiungi.isPending}
            onClick={() => aggiungi.mutate([])}
          >
            Non mi serve, li metto io
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Aggiungi e modifica ──────────────────────────────────────────────────────

function ModuloDocumento({ documento, onChiudi }: {
  documento: DocumentoAzienda | null;
  onChiudi: () => void;
}) {
  const companyId = useEffectiveCompanyId();
  const salva = useSalvaDocumentoAzienda();
  const { data: sedi = [] } = useSediList();

  const [categoria, setCategoria] = useState<CategoriaDocumento>(documento?.categoria ?? 'certificazioni');
  const [titolo, setTitolo] = useState(documento?.titolo ?? '');
  const [ente, setEnte] = useState(documento?.ente ?? '');
  const [numero, setNumero] = useState(documento?.numero ?? '');
  const [sedeId, setSedeId] = useState(documento?.sede_id ?? 'nessuna');
  const [dataDocumento, setDataDocumento] = useState(documento?.data_documento ?? '');
  const [dataScadenza, setDataScadenza] = useState(documento?.data_scadenza ?? '');
  const [rinnovo, setRinnovo] = useState(String(documento?.rinnovo_mesi ?? 0));
  const [preavviso, setPreavviso] = useState(
    String(documento?.alert_giorni_prima ?? PREAVVISO_PREDEFINITO[documento?.categoria ?? 'certificazioni']),
  );
  const [destinatari, setDestinatari] = useState<string[]>(documento?.alert_destinatari ?? []);
  const [note, setNote] = useState(documento?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const { data: persone = [] } = useCompanyStaffUsers(companyId);

  const cambiaCategoria = (nuova: CategoriaDocumento) => {
    setCategoria(nuova);
    if (!documento) setPreavviso(String(PREAVVISO_PREDEFINITO[nuova]));
  };

  const cambiaRinnovo = (mesi: string) => {
    setRinnovo(mesi);
    const n = Number(mesi);
    if (n > 0 && dataDocumento && !dataScadenza) setDataScadenza(scadenzaDaRinnovo(dataDocumento, n));
  };

  const salvaTutto = async () => {
    if (!titolo.trim()) {
      toast.error('Dai un nome al documento');
      return;
    }
    setInCorso(true);
    let caricato: { path: string; name: string } | null = null;
    try {
      if (file && companyId) caricato = await caricaFileDocumento(companyId, file);
      await salva.mutateAsync({
        id: documento?.id,
        dati: {
          categoria,
          titolo: titolo.trim(),
          ente: ente.trim() || null,
          numero: numero.trim() || null,
          sede_id: sedeId === 'nessuna' ? null : sedeId,
          data_documento: dataDocumento || null,
          data_scadenza: dataScadenza || null,
          rinnovo_mesi: Number(rinnovo) || null,
          alert_giorni_prima: Number(preavviso) || 30,
          alert_destinatari: destinatari,
          note: note.trim() || null,
          ...(caricato ? { file_path: caricato.path, file_name: caricato.name } : {}),
        },
      });
      onChiudi();
    } catch {
      // Il file caricato senza la riga salvata resterebbe orfano nel bucket.
      if (caricato) await rimuoviFileDocumento(caricato.path);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{documento ? 'Modifica il documento' : 'Aggiungi un documento'}</DialogTitle>
          <DialogDescription>
            Bastano il nome e, se ce l’ha, la scadenza. Il resto puoi metterlo dopo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titolo">Nome del documento</Label>
            <Input
              id="titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)}
              placeholder="DURC, SOA, polizza RC…"
            />
          </div>

          <div className="space-y-2">
            <Label>Dove lo metto</Label>
            <Select value={categoria} onValueChange={(v) => cambiaCategoria(v as CategoriaDocumento)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIE_DOCUMENTO.map((c) => (
                  <SelectItem key={c} value={c}>{ETICHETTA_CATEGORIA[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ente">Chi lo rilascia</Label>
              <Input id="ente" value={ente} onChange={(e) => setEnte(e.target.value)} placeholder="INAIL, Helvetia…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero">Numero</Label>
              <Input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="50937496" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="data-doc">Data del documento</Label>
              <Input
                id="data-doc" type="date" value={dataDocumento}
                onChange={(e) => {
                  setDataDocumento(e.target.value);
                  const n = Number(rinnovo);
                  if (n > 0 && e.target.value) setDataScadenza(scadenzaDaRinnovo(e.target.value, n));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-scad">Scade il</Label>
              <Input
                id="data-scad" type="date" value={dataScadenza}
                onChange={(e) => setDataScadenza(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Lascialo vuoto se non scade mai.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Si rinnova</Label>
              <Select value={rinnovo} onValueChange={cambiaRinnovo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCELTE_RINNOVO.map((s) => (
                    <SelectItem key={s.valore} value={s.valore}>{s.etichetta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preavviso">Avvisami (giorni prima)</Label>
              <Input
                id="preavviso" type="number" min={0} max={365} value={preavviso}
                onChange={(e) => setPreavviso(e.target.value)}
                disabled={!dataScadenza}
              />
            </div>
          </div>

          {dataScadenza && persone.length > 0 && (
            <div className="space-y-2">
              <Label>Chi avvisare</Label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                {persone.map((p) => {
                  const nome = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Senza nome';
                  const scelto = destinatari.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm
                        ${scelto ? 'bg-muted' : 'hover:bg-muted/50'}`}
                    >
                      <Checkbox
                        checked={scelto}
                        onCheckedChange={(v) =>
                          setDestinatari((prima) =>
                            v === true ? [...prima, p.id] : prima.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <span className="truncate">{nome}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {destinatari.length === 0
                  ? 'Se non scegli nessuno avvisiamo gli amministratori.'
                  : `L’avviso arriva a ${destinatari.length === 1 ? 'una persona' : `${destinatari.length} persone`}, nella campanella e per email.`}
              </p>
            </div>
          )}

          {sedi.length > 0 && (
            <div className="space-y-2">
              <Label>Vale per</Label>
              <Select value={sedeId} onValueChange={setSedeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">Tutta l’azienda</SelectItem>
                  {sedi.map((s: { id: string; nome: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="file">Il file</Label>
            <SceltaFile id="file" file={file} nomeAttuale={documento?.file_name} onFile={setFile} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Annulla</Button>
          <Button onClick={salvaTutto} disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Salva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rinnovo ──────────────────────────────────────────────────────────────────

function ModuloRinnovo({ documento, onChiudi }: { documento: DocumentoAzienda; onChiudi: () => void }) {
  const companyId = useEffectiveCompanyId();
  const rinnova = useRinnovaDocumentoAzienda();

  const [dataDocumento, setDataDocumento] = useState(OGGI());
  const [dataScadenza, setDataScadenza] = useState(
    documento.rinnovo_mesi ? scadenzaDaRinnovo(OGGI(), documento.rinnovo_mesi) : '',
  );
  const [numero, setNumero] = useState(documento.numero ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const conferma = async () => {
    if (!dataScadenza) {
      toast.error('Metti la nuova scadenza');
      return;
    }
    setInCorso(true);
    let caricato: { path: string; name: string } | null = null;
    try {
      if (file && companyId) caricato = await caricaFileDocumento(companyId, file);
      await rinnova.mutateAsync({
        documentoId: documento.id,
        dataDocumento,
        dataScadenza,
        filePath: caricato?.path ?? null,
        fileName: caricato?.name ?? null,
        numero: numero.trim() || null,
      });
      onChiudi();
    } catch {
      if (caricato) await rimuoviFileDocumento(caricato.path);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hai rinnovato «{documento.titolo}»</DialogTitle>
          <DialogDescription>
            La versione di prima resta nello storico col suo file. Non devi rifare la scheda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rin-data">Rinnovato il</Label>
              <Input
                id="rin-data" type="date" value={dataDocumento}
                onChange={(e) => {
                  setDataDocumento(e.target.value);
                  if (documento.rinnovo_mesi && e.target.value) {
                    setDataScadenza(scadenzaDaRinnovo(e.target.value, documento.rinnovo_mesi));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rin-scad">Nuova scadenza</Label>
              <Input
                id="rin-scad" type="date" value={dataScadenza}
                onChange={(e) => setDataScadenza(e.target.value)}
              />
            </div>
          </div>
          {documento.rinnovo_mesi && (
            <p className="text-xs text-muted-foreground">
              Calcolata da sola: {mesiLeggibili(documento.rinnovo_mesi).toLowerCase()}. Puoi cambiarla.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="rin-numero">Numero nuovo</Label>
            <Input id="rin-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rin-file">Il file nuovo</Label>
            <SceltaFile id="rin-file" file={file} onFile={setFile} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Annulla</Button>
          <Button onClick={conferma} disabled={inCorso}>
            <Upload className="mr-2 h-4 w-4" />
            {inCorso ? 'Salvo…' : 'Registra il rinnovo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
