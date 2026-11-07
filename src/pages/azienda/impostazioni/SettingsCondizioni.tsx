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
import { useMemo, useState } from "react";
import {
  FileText, Plus, Trash2, Archive, Star, Pencil, X, ChevronUp, ChevronDown, Copy, Search, Eye, Sparkles, Download,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCondizioniArchivio, type ClausolaArchivio } from "@/hooks/useCondizioniArchivio";
import { useCondizioniImporta } from "@/hooks/useCondizioniImporta";
import { testoLeggibile } from "@/lib/condizioni/importa";
import {
  AMBITI_CONDIZIONI, CLAUSOLE_DI_PARTENZA, CONTROPARTE, DOVE_SI_USA, NOMI_AMBITI, testoDelModello,
  type AmbitoCondizioni, type Clausola, type ModelloCondizioni,
} from "@/lib/condizioni/archivio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NOMI_CONTROPARTE = {
  cliente: "Al cliente", fornitore: "Al fornitore", subappaltatore: "Al subappaltatore", dipendente: "Al dipendente",
} as const;
const ORDINE_CONTROPARTE = ["cliente", "fornitore", "subappaltatore", "dipendente"] as const;

type BozzaModello = { id?: string; nome?: string; ambito?: AmbitoCondizioni; clausole?: Clausola[]; predefinito?: boolean; versione?: number };

export default function SettingsCondizioni() {
  const permessi = usePermissions();
  const puoGestire = !permessi.isLoading && (!!permessi.isAdmin || !!permessi.canManageCondizioni);
  const archivio = useCondizioniArchivio();
  const [scheda, setScheda] = useState<"modelli" | "clausole">("modelli");
  const [clausola, setClausola] = useState<Partial<ClausolaArchivio> | null>(null);
  const [modello, setModello] = useState<BozzaModello | null>(null);
  const [anteprima, setAnteprima] = useState<ModelloCondizioni | null>(null);

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

  const nuovo = (ambito: AmbitoCondizioni): void =>
    setModello({ nome: "", ambito, clausole: [], predefinito: !attivi.some((m) => m.ambito === ambito && m.predefinito) });

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
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <FileText className="h-5 w-5 text-primary" aria-hidden />Contratti e condizioni
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Le condizioni dell'azienda in un posto solo: da qui le prendono preventivi, contratti, subappalti, ordini ai
          fornitori e contratti di lavoro. Cambiare un modello non tocca i documenti già mandati: ognuno tiene il testo
          con cui è uscito.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Contratti e condizioni">
          {([["modelli", `Modelli (${attivi.length})`], ["clausole", `Clausole (${archivio.clausole.length})`]] as const).map(([id, nome]) => (
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

      {quante > 0 && (
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
        <>
          <p className={cn("rounded-lg border px-3 py-2 text-sm",
            scoperti.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
            {scoperti.length === 0
              ? "Ogni tipo di documento ha il suo modello: escono tutti con le condizioni dell'azienda."
              : `${scoperti.length} ${scoperti.length === 1 ? "tipo di documento esce" : "tipi di documento escono"} ancora col testo di sistema: ${scoperti.map((a) => NOMI_AMBITI[a].toLowerCase()).join(", ")}.`}
          </p>

          {gruppi.map((g) => (
            <section key={g.chi} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.nome}</h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {g.ambiti.map(({ ambito, predefinito, altri }) => (
                  <article key={ambito} className="rounded-lg border p-3">
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

                    {predefinito ? (
                      <RigaModello m={predefinito} puoGestire={puoGestire} predefinito
                        onApri={() => setModello(predefinito)} onVedi={() => setAnteprima(predefinito)}
                        onArchivia={() => archivio.eliminaModello.mutate(predefinito.id)} />
                    ) : (
                      <p className="mt-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                        Nessun modello: il documento esce col testo di sistema.
                      </p>
                    )}

                    {altri.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t pt-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Altri modelli</p>
                        {altri.map((m) => (
                          <RigaModello key={m.id} m={m} puoGestire={puoGestire}
                            onApri={() => setModello(m)} onVedi={() => setAnteprima(m)}
                            onArchivia={() => archivio.eliminaModello.mutate(m.id)} />
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}

          <aside className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Come arrivano sui documenti</p>
            <p className="mt-1">
              <strong>Preventivi e computi:</strong> nell'editor delle condizioni, il pulsante «Copia da…» offre già i
              modelli di qui. La copia resta sul preventivo: se poi cambi il modello, quel preventivo non cambia.
            </p>
            <p className="mt-1">
              <strong>Gli altri documenti</strong> (appalto, subappalto, ordini, fatture, manutenzione, contratti di
              lavoro) oggi tengono il testo ciascuno per conto suo: l'archivio è pronto, l'aggancio arriva un documento
              per volta.
            </p>
          </aside>
        </>
      ) : (
        <Libreria clausole={archivio.clausole} modelli={attivi} puoGestire={puoGestire}
          onApri={(c) => setClausola(c)}
          onElimina={(id) => archivio.eliminaClausola.mutate(id)}
          onPartenza={() => archivio.clausoleDiPartenza.mutate(CLAUSOLE_DI_PARTENZA)} />
      )}

      <DialogClausola clausola={clausola} onChiudi={() => setClausola(null)}
        onSalva={(c) => archivio.salvaClausola.mutate(c, { onSuccess: () => setClausola(null) })} />
      <DialogModello modello={modello} clausole={archivio.clausole} onChiudi={() => setModello(null)}
        onSalva={(m) => archivio.salvaModello.mutate(m, { onSuccess: () => setModello(null) })} />
      <DialogAnteprima modello={anteprima} onChiudi={() => setAnteprima(null)} />
    </div>
  );
}

function RigaModello({ m, puoGestire, predefinito, onApri, onVedi, onArchivia }: {
  m: ModelloCondizioni; puoGestire: boolean; predefinito?: boolean;
  onApri: () => void; onVedi: () => void; onArchivia: () => void;
}) {
  const vessatorie = m.clausole.filter((c) => c.vessatoria).length;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {predefinito && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Predefinito" />}
          {m.nome}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {m.clausole.length} {m.clausole.length === 1 ? "clausola" : "clausole"}
          {vessatorie > 0 && ` · ${vessatorie} da approvare a parte`}
          {" · "}versione {m.versione}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Vedi come esce ${m.nome}`} onClick={onVedi}><Eye className="h-3.5 w-3.5" /></Button>
        {puoGestire && <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Modifica ${m.nome}`} onClick={onApri}><Pencil className="h-3.5 w-3.5" /></Button>}
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
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.testo}</p>
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

function DialogAnteprima({ modello, onChiudi }: { modello: ModelloCondizioni | null; onChiudi: () => void }) {
  return (
    <Dialog open={!!modello} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{modello?.nome}</DialogTitle>
          <DialogDescription>Come esce sul documento, oggi. Versione {modello?.versione}.</DialogDescription>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">{testoDelModello(modello) || "Il modello non ha ancora clausole."}</pre>
        <DialogFooter><Button variant="outline" onClick={onChiudi}>Chiudi</Button></DialogFooter>
      </DialogContent>
    </Dialog>
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
            <div className="space-y-1"><Label htmlFor="cl-testo">Testo</Label>
              <Textarea id="cl-testo" rows={7} value={attiva.testo ?? ""} onChange={(e) => setBozza({ ...bozza, testo: e.target.value })} /></div>
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

function DialogModello({ modello, clausole, onChiudi, onSalva }: {
  modello: BozzaModello | null;
  clausole: ClausolaArchivio[];
  onChiudi: () => void;
  onSalva: (m: { id?: string; nome: string; ambito: AmbitoCondizioni; clausole: Clausola[]; predefinito?: boolean }) => void;
}) {
  const [bozza, setBozza] = useState<BozzaModello>({});
  const [vedi, setVedi] = useState(false);
  const attivo = modello ? { ...modello, ...bozza } : null;
  const dentro: Clausola[] = attivo?.clausole ?? [];
  const valida = !!attivo?.nome?.trim() && dentro.length > 0;
  const chiudi = (): void => { setBozza({}); setVedi(false); onChiudi(); };
  const cambia = (c: Clausola[]): void => setBozza({ ...bozza, clausole: c });
  const sposta = (i: number, di: number): void => {
    const j = i + di;
    if (j < 0 || j >= dentro.length) return;
    const copia = [...dentro];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    cambia(copia);
  };
  return (
    <Dialog open={!!modello} onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modello?.id ? `Modifica «${modello.nome}»` : "Nuovo modello"}</DialogTitle>
          <DialogDescription>
            Le clausole nell'ordine in cui escono sul documento. Salvando, la versione sale e quella di prima resta
            fotografata: i documenti già mandati non cambiano.
          </DialogDescription>
        </DialogHeader>
        {attivo && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="mo-nome">Nome</Label>
                <Input id="mo-nome" value={attivo.nome ?? ""} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} placeholder="Es. Condizioni standard 2026" /></div>
              <div className="space-y-1"><Label htmlFor="mo-ambito">Per quale documento</Label>
                <select id="mo-ambito" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={attivo.ambito ?? "preventivo"} onChange={(e) => setBozza({ ...bozza, ambito: e.target.value as AmbitoCondizioni })}>
                  {AMBITI_CONDIZIONI.map((a) => <option key={a} value={a}>{NOMI_AMBITI[a]}</option>)}
                </select></div>
            </div>
            <p className="text-xs text-muted-foreground">{DOVE_SI_USA[(attivo.ambito ?? "preventivo") as AmbitoCondizioni]}.</p>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!attivo.predefinito} onCheckedChange={(v) => setBozza({ ...bozza, predefinito: v })} />
              È il modello che il sistema prende da solo per questo tipo di documento
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Clausole del modello {dentro.length > 0 && <span className="text-muted-foreground">({dentro.length})</span>}</p>
                {dentro.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setVedi((v) => !v)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />{vedi ? "Nascondi l'anteprima" : "Vedi come esce"}
                  </Button>
                )}
              </div>
              {dentro.length === 0 && <p className="text-xs text-muted-foreground">Ancora nessuna: aggiungine dalla libreria o scrivine una qui.</p>}
              {dentro.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-2">
                  <div className="flex shrink-0 flex-col pt-1">
                    <Button variant="ghost" size="sm" className="h-5 w-6 p-0" disabled={i === 0} aria-label={`Sposta su la clausola ${i + 1}`} onClick={() => sposta(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-5 w-6 p-0" disabled={i === dentro.length - 1} aria-label={`Sposta giù la clausola ${i + 1}`} onClick={() => sposta(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input aria-label={`Titolo della clausola ${i + 1}`} value={c.titolo} onChange={(e) => cambia(dentro.map((x, j) => j === i ? { ...x, titolo: e.target.value } : x))} />
                    <Textarea aria-label={`Testo della clausola ${i + 1}`} rows={3} value={c.testo} onChange={(e) => cambia(dentro.map((x, j) => j === i ? { ...x, testo: e.target.value } : x))} />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={!!c.vessatoria} onCheckedChange={(v) => cambia(dentro.map((x, j) => j === i ? { ...x, vessatoria: v } : x))} />
                      Da approvare a parte
                    </label>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Duplica la clausola ${i + 1}`} onClick={() => cambia([...dentro.slice(0, i + 1), { ...c, clausola_id: null }, ...dentro.slice(i + 1)])}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Togli la clausola ${i + 1}`} onClick={() => cambia(dentro.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => cambia([...dentro, { titolo: "", testo: "" }])}><Plus className="mr-1.5 h-3.5 w-3.5" />Scrivi una clausola</Button>
                {clausole.length > 0 && (
                  <select aria-label="Aggiungi dalla libreria" className="h-9 rounded-md border bg-background px-2 text-sm" value=""
                    onChange={(e) => {
                      const c = clausole.find((x) => x.id === e.target.value);
                      if (c) cambia([...dentro, { clausola_id: c.id, titolo: c.titolo, testo: c.testo, vessatoria: c.vessatoria }]);
                    }}>
                    <option value="">+ Dalla libreria…</option>
                    {clausole.filter((c) => c.attiva).map((c) => <option key={c.id} value={c.id}>{c.titolo}</option>)}
                  </select>
                )}
              </div>
            </div>

            {vedi && dentro.length > 0 && (
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">{testoDelModello({ clausole: dentro })}</pre>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button disabled={!valida} onClick={() => {
            if (attivo?.nome) onSalva({ id: attivo.id, nome: attivo.nome, ambito: (attivo.ambito ?? "preventivo") as AmbitoCondizioni, clausole: dentro, predefinito: attivo.predefinito });
            setBozza({}); setVedi(false);
          }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
