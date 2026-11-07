/**
 * Impostazioni → Contratti e condizioni (07/11/2026).
 *
 * Florin: «da qualche parte nelle impostazioni mettere tutte le condizioni, e da lì il sistema pesca le
 * condizioni sia per i preventivi, per i contratti, subappaltatori, committenti — tutto».
 *
 * La pagina risponde a tre domande, in quest'ordine:
 *   1. quali documenti escono ancora senza condizioni mie?   → la riga in cima, e le schede scoperte
 *   2. cosa esce su ciascun documento?                        → il modello predefinito, con l'anteprima
 *   3. cosa posso riusare?                                    → la libreria delle clausole
 *
 * L'archivio nasce vuoto: i testi che l'azienda ha già restano dove sono finché non li si porta qui.
 * Cambiare un modello non tocca un documento già mandato: ogni salvataggio alza la versione e ne
 * conserva la fotografia (lo fa il database).
 */
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PAGINA_CONDIZIONI, paginaDelModello } from "@/lib/condizioni/indirizzi";
import {
  FileText, Plus, Trash2, Archive, Star, Pencil, Search, Sparkles, Download, UserCheck
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { anteprimaCondizioniUrl, aziendaPerAnteprima } from "@/lib/condizioni/anteprimaPdf";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { useCondizioniArchivio, type ClausolaArchivio } from "@/hooks/useCondizioniArchivio";
import { useCondizioniImporta } from "@/hooks/useCondizioniImporta";
import { testoLeggibile } from "@/lib/condizioni/importa";
import {
  AMBITI_CONDIZIONI, CLAUSOLE_DI_PARTENZA, CONTROPARTE, DOVE_SI_USA, NOMI_AMBITI,
  type AmbitoCondizioni, type ModelloCondizioni,
} from "@/lib/condizioni/archivio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { htmlPerEditorContratto } from "@/lib/preventivi/contrattoEditor";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

/**
 * Il testo di una clausola può essere vecchio (Markdown importato) o nuovo (HTML dell'editor):
 * all'editor e all'anteprima si dà sempre HTML, così si vede come esce davvero.
 */
const perVedere = (testo: string | null | undefined): string =>
  DOMPurify.sanitize(htmlPerEditorContratto(String(testo ?? "")));

const NOMI_CONTROPARTE = {
  cliente: "Al cliente", fornitore: "Al fornitore", subappaltatore: "Al subappaltatore", dipendente: "Al dipendente",
} as const;
const ORDINE_CONTROPARTE = ["cliente", "fornitore", "subappaltatore", "dipendente"] as const;


/**
 * Le due pagine che prima erano schede sorelle (07/11/2026). Florin: «se mettessi tutto qui, anche
 * tutte le tab, anche quelle delle firme elettroniche». Chi cerca cosa accetta il cliente non deve
 * più indovinare in quale delle tre pagine guardare: le condizioni stanno tutte qui dentro.
 * Caricate a parte, così chi apre i modelli non si porta dietro anche il resto.
 */
const CondizioniDellaFirma = lazy(() => import("./SettingsCondizioniFirma"));
const FirmaElettronica = lazy(() => import("@/pages/azienda/settings/SettingsFirmaElettronica"));

type SchedaCondizioni = "modelli" | "clausole" | "firma" | "firma-elettronica";
const SCHEDE: readonly SchedaCondizioni[] = ["modelli", "clausole", "firma", "firma-elettronica"];

export default function SettingsCondizioni() {
  const permessi = usePermissions();
  const puoGestire = !permessi.isLoading && (!!permessi.isAdmin || !!permessi.canManageCondizioni);
  const puoVedereFirma = !permessi.isLoading && (!!permessi.isAdmin || !!permessi.canViewSettingsPricing);
  const puoVedereFea = !permessi.isLoading && (!!permessi.isAdmin || !!permessi.canViewSettingsIntegrations);
  const archivio = useCondizioniArchivio();
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  // La scheda sta nell'indirizzo: i vecchi link alle pagine separate arrivano dritti al punto giusto.
  const [parametri, setParametri] = useSearchParams();
  const chiesta = parametri.get("scheda") as SchedaCondizioni | null;
  const scheda: SchedaCondizioni = chiesta && SCHEDE.includes(chiesta) ? chiesta : "modelli";
  const setScheda = (s: SchedaCondizioni) => {
    const p = new URLSearchParams(parametri);
    if (s === "modelli") p.delete("scheda"); else p.set("scheda", s);
    setParametri(p, { replace: true });
  };
  const [clausola, setClausola] = useState<Partial<ClausolaArchivio> | null>(null);

  const attivi = useMemo(() => archivio.modelli.filter((m) => m.attivo), [archivio.modelli]);
  const scoperti = useMemo(
    () => AMBITI_CONDIZIONI.filter((a) => !attivi.some((m) => m.ambito === a && m.predefinito)),
    [attivi],
  );
  const gruppi = useMemo(() => ORDINE_CONTROPARTE.map((chi) => ({
    chi, nome: NOMI_CONTROPARTE[chi],
    ambiti: AMBITI_CONDIZIONI.filter((a) => CONTROPARTE[a] === chi).map((ambito) => ({
      ambito,
      predefinito: attivi.find((m) => m.ambito === ambito && m.predefinito) ?? null,
      altri: attivi.filter((m) => m.ambito === ambito && !m.predefinito),
    })),
  })), [attivi]);

  const importa = useCondizioniImporta({
    attivo: puoGestire && archivio.disponibile,
    clausoleNellArchivio: archivio.clausole,
    modelliNellArchivio: attivi,
  });
  const quante = importa.trovate.modelli.length + importa.trovate.clausole.length;

  // Il modello mostrato a destra: quello scelto, altrimenti il primo predefinito, altrimenti il primo.
  const [scelto, setScelto] = useState<string | null>(null);
  const mostrato = attivi.find((m) => m.id === scelto) ?? attivi.find((m) => m.predefinito) ?? attivi[0] ?? null;
  const anteprima = useCallback(() => anteprimaCondizioniUrl(mostrato!, aziendaPerAnteprima(effectiveCompany)), [mostrato, effectiveCompany]);

  // Un modello si scrive nella sua pagina (07/11/2026), non più in un popup.
  const nuovo = (ambito: AmbitoCondizioni): void => { void navigate(`${PAGINA_CONDIZIONI}/modello/nuovo?ambito=${ambito}`); };
  const apriModello = (m: ModelloCondizioni): void => { void navigate(paginaDelModello(m.id)); };

  if (!archivio.disponibile) {
    return (
      <div className="p-4">
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          L'archivio delle condizioni non è ancora attivo su questo database.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Contratti e condizioni">
          {([
            ["modelli", `Modelli (${attivi.length})`],
            ["clausole", `Clausole (${archivio.clausole.length})`],
            ...(puoVedereFirma ? [["firma", "Firma del preventivo"] as const] : []),
            ...(puoVedereFea ? [["firma-elettronica", "Firma elettronica"] as const] : []),
          ] as ReadonlyArray<readonly [SchedaCondizioni, string]>).map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={scheda === id} onClick={() => setScheda(id)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                scheda === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {nome}
            </button>
          ))}
        </div>
        {scheda === "clausole" && puoGestire && (
          <Button size="sm" variant="outline" onClick={() => setClausola({ titolo: "", testo: "", vessatoria: false, attiva: true })}>
            <Plus className="mr-1.5 h-4 w-4" />Nuova clausola
          </Button>
        )}
      </div>

      {/* Tutto quello che serve sapere, in due righe (07/11/2026): cos'è un modello, cos'è una clausola, e chi
          può cambiarle per un cliente solo. Florin: «pochi spazi vuoti». */}
      {(scheda === "modelli" || scheda === "clausole") && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>
            <FileText className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-primary" aria-hidden />
            <strong className="text-foreground">Modello</strong> = le clausole, in ordine, che escono su un tipo di documento ·{" "}
            <strong className="text-foreground">Clausola</strong> = un pezzo che riusi («Foro competente»). Cambiare un modello
            non tocca i documenti già mandati.
          </p>
          <p>
            <UserCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-primary" aria-hidden />
            Per <strong className="text-foreground">un cliente solo</strong>, chi ha il permesso «Riscrivere le condizioni su un
            documento» le cambia nel preventivo o nel contratto, anche partendo da un altro modello: l'archivio non cambia.{" "}
            <Link to="/azienda/impostazioni/persone" className="underline">Chi ce l'ha</Link>
          </p>
        </div>
      )}

      {quante > 0 && (scheda === "modelli" || scheda === "clausole") && (
        <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
          <h2 className="text-sm font-semibold text-sky-950">Le condizioni che hai già</h2>
          <p className="mt-0.5 text-xs text-sky-900">
            Ho trovato {importa.trovate.modelli.length === 1 ? "1 testo" : `${importa.trovate.modelli.length} testi`} e{" "}
            {importa.trovate.clausole.length === 1 ? "1 clausola" : `${importa.trovate.clausole.length} clausole`} già
            scritti nei modelli di preventivo e nelle condizioni della firma. Portarli qui ne fa una copia:
            gli originali restano dove sono e i documenti continuano a uscire come adesso.
          </p>
          <ul className="mt-2 space-y-1">
            {importa.trovate.modelli.slice(0, 6).map((m) => (
              <li key={m.nome} className="truncate text-xs text-sky-900">
                <span className="font-medium">{m.nome}</span>
                <span className="text-sky-700"> — {m.fonte}, {testoLeggibile(m.clausole[0]?.testo).length.toLocaleString("it-IT")} caratteri</span>
              </li>
            ))}
            {importa.trovate.clausole.length > 0 && (
              <li className="truncate text-xs text-sky-900">
                <span className="font-medium">{importa.trovate.clausole.length} clausole</span>
                <span className="text-sky-700"> — {importa.trovate.clausole.slice(0, 4).map((c) => c.titolo).join(", ")}{importa.trovate.clausole.length > 4 ? "…" : ""}</span>
              </li>
            )}
            {importa.trovate.modelli.length > 6 && <li className="text-xs text-sky-700">e altri {importa.trovate.modelli.length - 6}…</li>}
          </ul>
          <Button size="sm" className="mt-2" disabled={importa.importa.isPending}
            onClick={() => importa.importa.mutate(importa.trovate)}>
            <Download className="mr-1.5 h-4 w-4" />{importa.importa.isPending ? "Importo…" : "Portali nell'archivio"}
          </Button>
        </section>
      )}

      {scheda === "modelli" ? (
        // Florin: «mostra sempre le anteprime» (07/11/2026). A sinistra i modelli, a destra il PDF vero di
        // quello scelto: si sceglie con un clic, si apre con «Modifica».
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="min-w-0 space-y-4">
            <p className={cn("rounded-lg border px-3 py-2 text-sm",
              scoperti.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
              {scoperti.length === 0
                ? "Ogni tipo di documento ha il suo modello: escono tutti con le condizioni dell'azienda."
                : `${scoperti.length} ${scoperti.length === 1 ? "tipo di documento esce" : "tipi di documento escono"} ancora col testo di sistema: ${scoperti.map((a) => NOMI_AMBITI[a].toLowerCase()).join(", ")}.`}
            </p>

            {gruppi.map((g) => (
              <section key={g.chi} className="space-y-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.nome}</h2>
                <div className="divide-y rounded-lg border">
                  {g.ambiti.map(({ ambito, predefinito, altri }) => (
                    <article key={ambito} className="space-y-1.5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold">{NOMI_AMBITI[ambito]}</h3>
                          <p className="text-xs text-muted-foreground">{DOVE_SI_USA[ambito]}</p>
                        </div>
                        {puoGestire && (
                          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => nuovo(ambito)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />Modello
                          </Button>
                        )}
                      </div>
                      {[...(predefinito ? [predefinito] : []), ...altri].map((m) => (
                        <RigaModello key={m.id} m={m} puoGestire={puoGestire} predefinito={m.predefinito}
                          scelto={m.id === mostrato?.id}
                          onScegli={() => setScelto(m.id)}
                          onApri={() => apriModello(m)}
                          onArchivia={() => archivio.eliminaModello.mutate(m.id)} />
                      ))}
                      {!predefinito && altri.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessun modello: il documento esce col testo di sistema.</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside aria-label="Anteprima del modello scelto" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            {mostrato ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{mostrato.nome}</p>
                    <p className="text-xs text-muted-foreground">{NOMI_AMBITI[mostrato.ambito]} · versione {mostrato.versione} · com'esce, con dati d'esempio</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => apriModello(mostrato)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />{puoGestire ? "Modifica" : "Apri"}
                  </Button>
                </div>
                <div className="h-[72dvh] min-h-[420px]">
                  <PdfBlobLivePreviewPanel renderBlobUrl={anteprima} depsKey={`${mostrato.id}:${mostrato.versione}`} debounceMs={150}
                    downloadFileName={`${mostrato.nome.replace(/[^\w-]+/g, "-")}.pdf`} headerLabel="Anteprima" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ancora nessun modello. Crea il primo con «+ Modello» accanto al documento che ti serve: qui vedrai il PDF
                come lo riceve il cliente.
              </div>
            )}
          </aside>
        </div>
      ) : scheda === "clausole" ? (
        <Libreria clausole={archivio.clausole} modelli={attivi} puoGestire={puoGestire}
          onApri={(c) => setClausola(c)}
          onElimina={(id) => archivio.eliminaClausola.mutate(id)}
          onPartenza={() => archivio.clausoleDiPartenza.mutate(CLAUSOLE_DI_PARTENZA)} />
      ) : (
        <Suspense fallback={<p className="p-3 text-sm text-muted-foreground" role="status">Carico…</p>}>
          {scheda === "firma" ? <CondizioniDellaFirma dentroArchivio /> : <FirmaElettronica />}
        </Suspense>
      )}

      <DialogClausola clausola={clausola} onChiudi={() => setClausola(null)}
        onSalva={(c) => archivio.salvaClausola.mutate(c, { onSuccess: () => setClausola(null) })} />
    </div>
  );
}

function RigaModello({ m, puoGestire, predefinito, scelto, onScegli, onApri, onArchivia }: {
  m: ModelloCondizioni; puoGestire: boolean; predefinito?: boolean; scelto?: boolean;
  onScegli: () => void; onApri: () => void; onArchivia: () => void;
}) {
  const vessatorie = m.clausole.filter((c) => c.vessatoria).length;
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 transition-colors",
      scelto ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/60")}>
      {/* Un clic mostra il PDF a destra; doppio clic, o la matita, lo apre. */}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onScegli} onDoubleClick={onApri}
        aria-pressed={scelto} aria-label={`Mostra l'anteprima di ${m.nome}`}>
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          {predefinito && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Predefinito" />}
          {m.nome}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {predefinito ? "Predefinito · " : ""}{m.clausole.length} {m.clausole.length === 1 ? "clausola" : "clausole"}
          {vessatorie > 0 && ` · ${vessatorie} da approvare a parte`}
          {" · "}versione {m.versione}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`${puoGestire ? "Modifica" : "Apri"} ${m.nome}`} onClick={onApri}><Pencil className="h-3.5 w-3.5" /></Button>
        {puoGestire && <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" aria-label={`Archivia ${m.nome}`} onClick={onArchivia}><Archive className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  );
}

function Libreria({ clausole, modelli, puoGestire, onApri, onElimina, onPartenza }: {
  clausole: ClausolaArchivio[]; modelli: ModelloCondizioni[]; puoGestire: boolean;
  onApri: (c: ClausolaArchivio) => void; onElimina: (id: string) => void; onPartenza: () => void;
}) {
  const [cerca, setCerca] = useState("");
  const quanteVolte = (id: string): number => modelli.filter((m) => m.clausole.some((c) => c.clausola_id === id)).length;
  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return q ? clausole.filter((c) => `${c.titolo} ${c.testo} ${c.categoria ?? ""}`.toLowerCase().includes(q)) : clausole;
  }, [clausole, cerca]);
  const categorie = useMemo(() => {
    const m = new Map<string, ClausolaArchivio[]>();
    for (const c of filtrate) m.set(c.categoria || "Senza categoria", [...(m.get(c.categoria || "Senza categoria") ?? []), c]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it"));
  }, [filtrate]);

  if (clausole.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">La libreria è vuota.</p>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Le clausole sono i pezzi che componi nei modelli: pagamenti, tempi, varianti, garanzie, foro competente.
          Scrivile tu, oppure parti da sette clausole già pronte e correggile come vuoi.
        </p>
        {puoGestire && (
          <Button size="sm" onClick={onPartenza}><Sparkles className="mr-1.5 h-4 w-4" />Parti dalle clausole di base</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-8" placeholder="Cerca una clausola…" aria-label="Cerca una clausola" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>
      {filtrate.length === 0 && <p className="text-sm text-muted-foreground">Nessuna clausola con «{cerca}».</p>}
      {categorie.map(([categoria, righe]) => (
        <section key={categoria} className="space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{categoria}</h2>
          {righe.map((c) => {
            const usata = quanteVolte(c.id);
            return (
              <div key={c.id} className={cn("flex items-start justify-between gap-3 rounded-lg border p-2.5", !c.attiva && "opacity-60")}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {c.titolo}
                    {c.vessatoria && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-medium text-amber-900">da approvare a parte</Badge>}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {usata === 0 ? "non è in nessun modello" : usata === 1 ? "in 1 modello" : `in ${usata} modelli`}
                    </span>
                  </p>
                  {/* Il testo com'è scritto: grassetti e titoli si vedono già qui (07/11/2026; prima i tag HTML uscivano a vista). */}
                  <div className="line-clamp-3 text-xs text-muted-foreground [&_h1]:text-xs [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_p]:my-0 [&_strong]:text-foreground"
                    dangerouslySetInnerHTML={{ __html: perVedere(c.testo) }} />
                </div>
                {puoGestire && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Modifica ${c.titolo}`} onClick={() => onApri(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" aria-label={`Elimina ${c.titolo}`} onClick={() => onElimina(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function DialogClausola({ clausola, onChiudi, onSalva }: {
  clausola: Partial<ClausolaArchivio> | null;
  onChiudi: () => void;
  onSalva: (c: Partial<ClausolaArchivio> & { titolo: string; testo: string }) => void;
}) {
  const [bozza, setBozza] = useState<Partial<ClausolaArchivio>>({});
  const attiva = clausola ? { ...clausola, ...bozza } : null;
  const valida = !!attiva?.titolo?.trim() && !!attiva?.testo?.trim();
  const chiudi = (): void => { setBozza({}); onChiudi(); };
  return (
    <Dialog open={!!clausola} onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{clausola?.id ? "Modifica la clausola" : "Nuova clausola"}</DialogTitle>
          <DialogDescription>Un pezzo di contratto che riusi in più modelli.</DialogDescription>
        </DialogHeader>
        {attiva && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[2fr,1fr]">
              <div className="space-y-1"><Label htmlFor="cl-titolo">Titolo</Label>
                <Input id="cl-titolo" value={attiva.titolo ?? ""} onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })} placeholder="Es. Modalità di pagamento" /></div>
              <div className="space-y-1"><Label htmlFor="cl-categoria">Categoria</Label>
                <Input id="cl-categoria" value={attiva.categoria ?? ""} onChange={(e) => setBozza({ ...bozza, categoria: e.target.value })} placeholder="Pagamenti" /></div>
            </div>
            <div className="space-y-1">
              <Label>Testo</Label>
              {/* L'editor vero (07/11/2026): grassetto, corsivo, dimensione e carattere, elenchi. */}
              {/* Finché non si scrive, si mostra il testo di prima convertito; poi vale quello dell'editor,
                  identico a quello che l'editor ha appena emesso (altrimenti il cursore salterebbe). */}
              <RichTextEditor value={bozza.testo ?? perVedere(clausola?.testo)} minHeight={200}
                placeholder="Scrivi qui la clausola, come la vuoi sul documento."
                onChange={(html) => setBozza({ ...bozza, testo: html })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!attiva.vessatoria} onCheckedChange={(v) => setBozza({ ...bozza, vessatoria: v })} />
              Il cliente la approva a parte (clausola vessatoria, art. 1341 c.c.)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button disabled={!valida} onClick={() => { if (attiva?.titolo && attiva.testo) { onSalva({ ...attiva, titolo: attiva.titolo, testo: attiva.testo }); setBozza({}); } }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
