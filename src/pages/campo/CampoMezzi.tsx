/**
 * Il mio mezzo — dal telefono di chi ha in carico un furgone, un'auto o un
 * attrezzo: foto, targa, km, i documenti da mostrare a un controllo (libretto,
 * assicurazione, revisione), gli attrezzi caricati sopra. Da qui si aggiornano
 * i km e si segnala un guasto o un danno con le foto: arriva all'ufficio in
 * campanella.
 *
 * I dati arrivano dalla RPC mezzi_in_carico: l'operaio non legge le tabelle dei
 * mezzi (valori, rate, fatture restano all'ufficio), solo quello che gli serve.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ExternalLink, Gauge, Loader2, Package, RefreshCcw, ScanLine, Truck, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { SegnalaProblemaDialog } from "@/components/mezzi/SegnalaProblemaDialog";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { useCopertineMezzi, useInviaSegnalazione, useMezzoSegnalazioni, useMieiMezzi, linkFileMezzo } from "@/hooks/useMezzi";
import {
  STATO_SCADENZA_BADGE, categoriaDocumentoLabel, documentiConStato, formatContatore, formatData, giornoItaliano,
  leggiCodiceScansionato, oggiIso, statoMezzo, statoSegnalazione, tipoMezzoLabel, tipoSegnalazioneLabel,
  type MezzoInCarico,
} from "@/types/mezzi";
import { cn } from "@/lib/utils";

const ORDINE_STATO: Record<string, number> = { scaduto: 0, in_scadenza: 1, valido: 2, senza_scadenza: 3 };

export default function CampoMezzi() {
  const { data: mezzi = [], isLoading, isError, error, refetch, isFetching } = useMieiMezzi();
  // Foto e documenti firmati in un colpo solo, al caricamento: sul telefono un
  // link che si apre dopo un'attesa viene bloccato come popup.
  const { data: link } = useCopertineMezzi(
    mezzi.flatMap((m) => [m.foto_path ?? "", ...m.documenti.map((d) => d.file_path ?? "")]).filter(Boolean),
  );

  // Un attrezzo caricato su un mio furgone sta dentro la scheda del furgone.
  const ids = new Set(mezzi.map((m) => m.id));
  const principali = mezzi.filter((m) => !m.su_mezzo_id || !ids.has(m.su_mezzo_id));
  const aBordo = (id: string) => mezzi.filter((m) => m.su_mezzo_id === id);

  const titolo = principali.length > 1 ? "I miei mezzi" : "Il mio mezzo";

  // Scansiona l'etichetta di un attrezzo: si apre la sua pagina con le azioni
  // (lo prendo io, lo lascio in cantiere…). «?scansiona=1» riapre lo scanner
  // tornando da un attrezzo («Scansiona un altro»).
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanner, setScanner] = useState(() => searchParams.get("scansiona") === "1");
  useEffect(() => {
    if (searchParams.get("scansiona") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("scansiona");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const letto = useCallback(
    (testo: string) => {
      const c = leggiCodiceScansionato(testo);
      if (!c) {
        toast.error("Non riconosco questo codice.");
        return;
      }
      navigate(`/campo/mezzi/scansione/${encodeURIComponent(c.codice)}${c.companyId ? `?c=${c.companyId}` : ""}`);
    },
    [navigate],
  );
  const lettoRef = useRef<(testo: string) => void>(letto);
  useEffect(() => {
    lettoRef.current = letto;
  }, [letto]);
  const suLettura = useCallback((t: string): void => {
    lettoRef.current(t);
  }, []);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight text-foreground">{titolo}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Documenti per i controlli, km e segnalazioni all'ufficio.</p>
      </div>
      <Button variant="outline" className="h-11 shrink-0 gap-2" onClick={() => setScanner(true)}>
        <ScanLine className="h-4 w-4 text-orange-600" />Scansiona
      </Button>
      <BarcodeScanner open={scanner} onOpenChange={setScanner} onScan={suLettura} />
    </div>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-28">
        {header}
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-28">
        {header}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-bold">Mezzi non caricati</p>
          <p className="mt-1 text-xs">{error instanceof Error ? error.message : "La richiesta non ha risposto."} Riprova quando la rete è stabile.</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-background px-3 text-xs font-bold shadow-sm disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28">
      {header}
      {principali.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-background px-4 py-10 text-center">
          <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">Non hai mezzi in carico</p>
          <p className="mt-1 text-xs text-muted-foreground">Quando l'ufficio ti affida un mezzo, lo trovi qui con i suoi documenti. Per un attrezzo con l'etichetta QR, tocca «Scansiona».</p>
        </div>
      ) : (
        principali.map((m) => (
          <SchedaMezzo key={m.id} mezzo={m} link={link} attrezzi={aBordo(m.id)} />
        ))
      )}
    </div>
  );
}

function SchedaMezzo({ mezzo, link, attrezzi }: { mezzo: MezzoInCarico; link: Map<string, string> | undefined; attrezzi: MezzoInCarico[] }) {
  const [km, setKm] = useState(false);
  const [segnala, setSegnala] = useState(false);
  const [aprendo, setAprendo] = useState<string | null>(null);
  const { data: segnalazioni = [] } = useMezzoSegnalazioni(mezzo.id);

  const oggi = oggiIso();
  const documenti = useMemo(
    () =>
      documentiConStato(mezzo.documenti, oggi)
        .filter((d) => d.stato !== "sostituito")
        .sort((a, b) => (ORDINE_STATO[a.stato] ?? 9) - (ORDINE_STATO[b.stato] ?? 9)),
    [mezzo.documenti, oggi],
  );
  const scaduti = documenti.filter((d) => d.stato === "scaduto");
  const ultime = segnalazioni.filter((s) => s.tipo !== "km").slice(0, 3);
  const stato = statoMezzo(mezzo.stato);
  const copertina = mezzo.foto_path ? link?.get(mezzo.foto_path) ?? null : null;
  const mostraContatore = mezzo.tipo !== "attrezzatura" || mezzo.contatore != null;

  // Riserva se il link preparato manca (scaduto o non arrivato): si apre
  // prima la scheda, poi ci si mette il documento, così il telefono non la blocca.
  const apri = async (path: string) => {
    const scheda = window.open("", "_blank");
    setAprendo(path);
    try {
      const url = await linkFileMezzo(path);
      if (!url) throw new Error("link non disponibile");
      if (scheda) scheda.location.replace(url);
      else window.location.assign(url);
    } catch {
      scheda?.close();
      toast.error("Non riesco ad aprire il documento. Riprova tra poco.");
    } finally {
      setAprendo(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-background shadow-sm" aria-label={mezzo.nome}>
      {copertina ? (
        <img src={copertina} alt={`Foto di ${mezzo.nome}`} className="h-44 w-full object-cover sm:h-56" />
      ) : (
        <div className="flex h-24 items-center justify-center bg-slate-100">
          <IconaMezzo tipo={mezzo.tipo} className="h-10 w-10 text-slate-400" />
        </div>
      )}

      <div className="space-y-4 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{mezzo.nome}</h2>
            {mezzo.stato !== "in_servizio" && <Badge variant="outline" className={`text-[11px] ${stato.cls}`}>{stato.label}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[tipoMezzoLabel(mezzo.tipo), [mezzo.marca, mezzo.modello].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
          </p>
          {mezzo.targa && (
            <p className="mt-2 inline-block rounded-md border-2 border-slate-800 px-2 py-0.5 font-mono text-lg font-bold tracking-widest">
              {mezzo.targa}
            </p>
          )}
          {mezzo.contatore != null && (
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {formatContatore(mezzo.contatore, mezzo.contatore_unita)}
              {mezzo.contatore_aggiornato_il && (
                <span className="text-xs text-muted-foreground">· al {formatData(mezzo.contatore_aggiornato_il)}</span>
              )}
            </p>
          )}
        </div>

        {/* Un attrezzo senza contaore non ha km né ore da aggiornare. */}
        <div className={cn("grid gap-2", mostraContatore ? "grid-cols-2" : "grid-cols-1")}>
          {mostraContatore && (
            <Button variant="outline" className="h-12 min-w-0 whitespace-normal leading-tight" onClick={() => setKm(true)}>
              <Gauge className="mr-2 h-4 w-4 shrink-0" />
              {mezzo.contatore_unita === "ore" ? "Aggiorna ore" : "Aggiorna km"}
            </Button>
          )}
          <Button className="h-12 min-w-0 whitespace-normal leading-tight" onClick={() => setSegnala(true)}>
            <Wrench className="mr-2 h-4 w-4 shrink-0" />Segnala un problema
          </Button>
        </div>

        {scaduti.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {scaduti.map((d) => categoriaDocumentoLabel(d.categoria).toLowerCase()).join(", ")}: scadenza passata. Avvisa l'ufficio prima di usare il mezzo.
            </span>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Documenti</h3>
          {documenti.length === 0 ? (
            <p className="text-xs text-muted-foreground">L'ufficio non ha ancora caricato documenti per questo mezzo.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {documenti.map((d) => {
                const badge = STATO_SCADENZA_BADGE[d.stato];
                return (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.titolo || categoriaDocumentoLabel(d.categoria)}</p>
                      <p className="text-xs text-muted-foreground">
                        {categoriaDocumentoLabel(d.categoria)}
                        {d.data_scadenza ? ` · scade il ${formatData(d.data_scadenza)}` : ""}
                      </p>
                    </div>
                    {d.data_scadenza && badge && <Badge variant="outline" className={`shrink-0 text-[10px] ${badge.cls}`}>{badge.label}</Badge>}
                    {d.file_path && link?.get(d.file_path) ? (
                      <Button asChild size="sm" variant="ghost" className="h-11 shrink-0 px-3">
                        <a
                          href={link.get(d.file_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Apri ${d.titolo || categoriaDocumentoLabel(d.categoria)}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : d.file_path ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 shrink-0 px-3"
                        onClick={() => apri(d.file_path!)}
                        disabled={aprendo === d.file_path}
                        aria-label={`Apri ${d.titolo || categoriaDocumentoLabel(d.categoria)}`}
                      >
                        {aprendo === d.file_path ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {attrezzi.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Attrezzi a bordo</h3>
            <ul className="space-y-1.5">
              {attrezzi.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate">{a.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{tipoMezzoLabel(a.tipo)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ultime.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Ultime segnalazioni</h3>
            <ul className="space-y-2">
              {ultime.map((s) => {
                const st = statoSegnalazione(s.stato);
                return (
                  <li key={s.id} className="rounded-xl bg-muted/40 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{tipoSegnalazioneLabel(s.tipo)}</span>
                      <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                      <span className="text-xs text-muted-foreground">{formatData(giornoItaliano(s.created_at))}</span>
                    </div>
                    {s.descrizione && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.descrizione}</p>}
                    {s.stato === "chiusa" && s.nota_chiusura && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{s.nota_chiusura}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {km && <DialogKm mezzo={mezzo} onClose={() => setKm(false)} />}
      {segnala && (
        <SegnalaProblemaDialog
          mezzoId={mezzo.id}
          companyId={mezzo.company_id}
          nome={mezzo.nome}
          targa={mezzo.targa}
          onClose={() => setSegnala(false)}
        />
      )}
    </section>
  );
}

function DialogKm({ mezzo, onClose }: { mezzo: MezzoInCarico; onClose: () => void }) {
  const invia = useInviaSegnalazione(mezzo.id, mezzo.company_id);
  const [valore, setValore] = useState("");
  const unita = mezzo.contatore_unita === "ore" ? "ore" : "km";
  const n = valore.trim() === "" ? null : Number(valore.replace(/\./g, "").replace(",", "."));
  const valido = n != null && Number.isFinite(n) && n >= 0;
  const indietro = valido && mezzo.contatore != null && n! < mezzo.contatore;

  const salva = async () => {
    if (!valido || indietro) return;
    try {
      await invia.mutateAsync({ tipo: "km", contatore: Math.round(n!) });
      onClose();
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{unita === "ore" ? "Ore di lavoro" : "Chilometri"} di {mezzo.nome}</DialogTitle>
          <DialogDescription>
            {mezzo.contatore != null ? `Ultimo valore: ${formatContatore(mezzo.contatore, mezzo.contatore_unita)}.` : "Leggi il valore sul cruscotto."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="campo-km">{unita === "ore" ? "Ore segnate adesso" : "Km segnati adesso"}</Label>
          <Input
            id="campo-km"
            inputMode="numeric"
            autoComplete="off"
            value={valore}
            onChange={(e) => setValore(e.target.value)}
            placeholder={mezzo.contatore != null ? String(mezzo.contatore) : "es. 84500"}
            className="h-12 text-lg"
            aria-describedby={indietro ? "campo-km-errore" : undefined}
          />
          {indietro && (
            <p id="campo-km-errore" className="text-xs text-red-700">
              È meno dell'ultimo valore. Controlla il numero; se è sbagliato quello vecchio, segnalalo come problema.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} disabled={!valido || indietro || invia.isPending}>
            {invia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
