// src/components/orders/generali/rendiconto/RendicontoGenerale.tsx
// Il bottone «Rendiconto» della testata della generale e il suo dialogo: scegli per chi è
// (banca, soci, completo) e cosa entra, guarda l'anteprima del PDF, scaricalo in PDF o Excel
// e, solo con un clic su «Invia», mandalo per email a uno o più destinatari. Lo storico
// tiene ogni invio col file partito. Da telefono si vede solo lo storico.
// @react-pdf/renderer ed exceljs arrivano con un import dinamico: sono i pezzi pesanti.
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StoricoDossier } from "@/components/orders/generali/rendiconto/StoricoDossier";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { fotoPerPdf, useDatiDossier, useFotoDossier, useInviaDossier, type FotoCandidata } from "@/hooks/useGeneraleRendiconto";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import {
  MAX_DESTINATARI, MODELLI_DOSSIER, MODELLI_DOSSIER_ORDINE, NOMI_SEZIONE, SEZIONI_DOSSIER,
  componiDossier, leggiDestinatari, nomeFileDossier, presenzaDati, sezioniDelModello, sezioniDisponibili,
  type DatiDossier, type DisponibilitaSezione, type ModelloDossier, type SezioneDossier,
} from "@/lib/orders/generali/rendiconto";
import { TIPO_XLSX } from "@/lib/orders/generali/rendicontoExcel";
import { cn } from "@/lib/utils";
import { logger } from "@/utils/logger";

let moduloPdf: Promise<{
  pdf: typeof import("@react-pdf/renderer").pdf;
  Doc: typeof import("@/components/orders/generali/rendiconto/DossierPDF").DossierPDF;
}> | null = null;
function caricaPdf() {
  if (!moduloPdf) {
    moduloPdf = Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/orders/generali/rendiconto/DossierPDF"),
    ]).then(([p, t]) => ({ pdf: p.pdf, Doc: t.DossierPDF }));
  }
  return moduloPdf;
}

async function creaExcel(d: DatiDossier): Promise<Blob> {
  const { creaExcelDossier } = await import("@/lib/orders/generali/rendicontoExcel");
  return new Blob([await creaExcelDossier(d)], { type: TIPO_XLSX });
}

function scarica(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Il bottone della testata. Da telefono apre solo lo storico. */
export function BottoneRendiconto({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="ml-auto">
      <Button variant="outline" size="sm" onClick={() => setAperto(true)}>
        <FileText className="mr-1.5 h-3.5 w-3.5" /> Rendiconto
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="flex max-h-[94vh] max-w-6xl flex-col overflow-hidden">
          {aperto && <Contenuto riepilogo={riepilogo} onChiudi={() => setAperto(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Contenuto({ riepilogo, onChiudi }: { riepilogo: RiepilogoGenerale; onChiudi: () => void }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Rendiconti inviati</DialogTitle>
          <DialogDescription>Da telefono puoi riaprire quelli già fatti. Per prepararne uno nuovo usa un tablet o un computer.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto"><StoricoDossier generaleId={riepilogo.generale.id} /></div>
      </>
    );
  }
  return (
    <Tabs defaultValue="prepara" className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="space-y-2">
        <DialogTitle>Rendiconto di «{riepilogo.generale.nome}»</DialogTitle>
        <DialogDescription>Un dossier unico per banca, soci o commercialista. Parte solo quando premi «Invia».</DialogDescription>
        <TabsList className="w-fit">
          <TabsTrigger value="prepara">Prepara</TabsTrigger>
          <TabsTrigger value="storico">Inviati</TabsTrigger>
        </TabsList>
      </DialogHeader>
      <TabsContent value="prepara" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <Prepara riepilogo={riepilogo} onChiudi={onChiudi} />
      </TabsContent>
      <TabsContent value="storico" className="mt-3 min-h-0 flex-1 overflow-y-auto">
        <StoricoDossier generaleId={riepilogo.generale.id} />
      </TabsContent>
    </Tabs>
  );
}

interface Scelte {
  modello: ModelloDossier | "personalizzato";
  sezioni: SezioneDossier[];
  dal: string;
  al: string;
  note: string;
  foto: string[];
}

interface Anteprima { scelte: string; dati: DatiDossier; blob: Blob; url: string }

const oggi = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Prepara({ riepilogo, onChiudi }: { riepilogo: RiepilogoGenerale; onChiudi: () => void }) {
  const { input, isLoading } = useDatiDossier(riepilogo);
  const fotoQ = useFotoDossier(riepilogo);
  const candidate: FotoCandidata[] = useMemo(() => (Array.isArray(fotoQ.data) ? fotoQ.data : []), [fotoQ.data]);
  const disponibili = useMemo(
    () => (input ? sezioniDisponibili({ modello: riepilogo.generale.modello, permessi: riepilogo.permessi, dati: presenzaDati({ ...input, foto: candidate }) }) : []),
    [input, candidate, riepilogo.generale.modello, riepilogo.permessi],
  );
  if (!input || isLoading || fotoQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Raccolgo i numeri dei moduli…
      </div>
    );
  }
  return <Editor riepilogo={riepilogo} onChiudi={onChiudi} input={input} candidate={candidate} disponibili={disponibili} />;
}

function Editor({ riepilogo, onChiudi, input, candidate, disponibili }: {
  riepilogo: RiepilogoGenerale;
  onChiudi: () => void;
  input: NonNullable<ReturnType<typeof useDatiDossier>["input"]>;
  candidate: FotoCandidata[];
  disponibili: DisponibilitaSezione[];
}) {
  const permissions = usePermissions();
  const puoInviare = !!permissions.canEditOrders;
  const invia = useInviaDossier(riepilogo.generale.id);
  // Prima stesura: «Per la banca», le sei foto più recenti, dalla nascita della generale a oggi.
  const [scelte, setScelte] = useState<Scelte>(() => ({
    modello: "banca",
    sezioni: sezioniDelModello("banca", disponibili),
    dal: riepilogo.generale.creataIl?.slice(0, 10) ?? "",
    al: oggi(),
    note: "",
    foto: candidate.slice(0, 6).map((f) => f.id),
  }));

  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  // All'apertura l'anteprima si prepara da sola: si parte già «in preparazione».
  const [preparo, setPreparo] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const ultimo = useRef(0);
  useEffect(() => () => { if (anteprima) URL.revokeObjectURL(anteprima.url); }, [anteprima]);

  /** Il lavoro vero: foto, numeri, PDF. Lo stato si tocca solo dopo le attese. */
  const genera = async (s: Scelte, giro: number) => {
    try {
      const scelteFoto = candidate.filter((f) => s.foto.includes(f.id));
      const foto = s.sezioni.includes("foto")
        ? (await Promise.all(scelteFoto.map(async (f) => {
            const src = await fotoPerPdf(f.src);
            return src ? { src, didascalia: f.didascalia, data: f.data } : null;
          }))).filter((f): f is NonNullable<typeof f> => f !== null)
        : [];
      const dati = componiDossier({
        ...input,
        modello: s.modello,
        sezioni: s.sezioni,
        periodo: { dal: s.dal || null, al: s.al || oggi() },
        note: s.note,
        foto,
      });
      const { pdf, Doc } = await caricaPdf();
      const blob = await pdf(<Doc d={dati} />).toBlob();
      if (giro !== ultimo.current) return;
      if (scelteFoto.length > foto.length && s.sezioni.includes("foto")) {
        toast.warning(`${scelteFoto.length - foto.length} foto non si sono scaricate e restano fuori dal dossier.`);
      }
      setAnteprima({ scelte: JSON.stringify(s), dati, blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      logger.error("RendicontoGenerale", e);
      if (giro === ultimo.current) setErrore("Non sono riuscito a preparare il PDF. Riprova.");
    } finally {
      if (giro === ultimo.current) setPreparo(false);
    }
  };

  const prepara = (s: Scelte) => {
    setPreparo(true);
    setErrore(null);
    void genera(s, ++ultimo.current);
  };

  // La prima anteprima parte da sola, all'apertura.
  useEffect(() => {
    void genera(scelte, ++ultimo.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [destinatari, setDestinatari] = useState("");
  const [oggetto, setOggetto] = useState(`Rendiconto ${riepilogo.generale.nome}`);
  const [messaggio, setMessaggio] = useState(
    `Buongiorno,\n\nle mandiamo il rendiconto aggiornato dell'operazione «${riepilogo.generale.nome}»: avanzamento, numeri e situazione a oggi.\n\nPer qualunque domanda siamo a disposizione.`,
  );
  const [conExcel, setConExcel] = useState(false);

  const cambia = (p: Partial<Scelte>) => setScelte({ ...scelte, ...p });
  const scegliModello = (m: ModelloDossier) => cambia({ modello: m, sezioni: sezioniDelModello(m, disponibili) });
  const tocca = (s: SezioneDossier, si: boolean) =>
    cambia({ modello: "personalizzato", sezioni: si ? SEZIONI_DOSSIER.filter((x) => x === s || scelte.sezioni.includes(x)) : scelte.sezioni.filter((x) => x !== s) });
  const toccaFoto = (id: string) =>
    cambia({ foto: scelte.foto.includes(id) ? scelte.foto.filter((x) => x !== id) : [...scelte.foto, id].slice(-12) });

  const daAggiornare = !anteprima || anteprima.scelte !== JSON.stringify(scelte);
  const indirizzi = leggiDestinatari(destinatari);
  const troppi = indirizzi.validi.length > MAX_DESTINATARI;
  const puoMandare = puoInviare && !!anteprima && !daAggiornare && !preparo && indirizzi.validi.length > 0
    && indirizzi.sbagliati.length === 0 && !troppi && oggetto.trim().length > 0 && !invia.isPending;
  const periodoSbagliato = !!scelte.dal && !!scelte.al && scelte.dal > scelte.al;

  const scaricaExcel = async () => {
    if (!anteprima) return;
    try {
      scarica(await creaExcel(anteprima.dati), nomeFileDossier(anteprima.dati, "xlsx"));
    } catch (e) {
      logger.error("RendicontoGenerale excel", e);
      toast.error("Non sono riuscito a preparare l'Excel. Riprova.");
    }
  };

  const manda = async () => {
    if (!anteprima || !puoMandare) return;
    const d = anteprima.dati;
    let excel: { filename: string; dati: Blob } | null = null;
    if (conExcel) {
      try {
        excel = { filename: nomeFileDossier(d, "xlsx"), dati: await creaExcel(d) };
      } catch {
        toast.error("Non sono riuscito a preparare l'Excel: niente è partito.");
        return;
      }
    }
    invia.mutate(
      {
        destinatari: indirizzi.validi, subject: oggetto.trim(), message: messaggio.trim(),
        modello: d.modello, titolo: d.titolo, sezioni: d.sezioni, periodo: d.periodo,
        filename: nomeFileDossier(d), pdf: anteprima.blob, excel,
        // Nello storico i numeri, non le foto (sono già nel PDF salvato).
        numeri: { ...d, foto: d.foto.map((f) => ({ didascalia: f.didascalia, data: f.data })) },
      },
      {
        onSuccess: (r) => {
          const falliti = r?.esiti?.filter((e) => !e.ok) ?? [];
          if (falliti.length > 0) toast.warning(`Inviato, ma non a ${falliti.map((e) => e.a).join(", ")}`, { description: "Lo trovi nella scheda «Inviati»." });
          else toast.success(`Rendiconto inviato a ${indirizzi.validi.join(", ")}`);
          onChiudi();
        },
        onError: (e) => toast.error("Rendiconto non inviato", { description: e instanceof Error ? e.message : "Riprova tra poco." }),
      },
    );
  };

  return (
    <>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); prepara(scelte); }}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Per chi è</legend>
            <div className="grid grid-cols-3 gap-2">
              {MODELLI_DOSSIER_ORDINE.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={scelte.modello === m}
                  onClick={() => scegliModello(m)}
                  className={cn("rounded-md border px-2 py-2 text-sm transition-colors", scelte.modello === m ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
                >
                  {MODELLI_DOSSIER[m].nome}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {scelte.modello === "personalizzato" ? "Su misura: hai cambiato le sezioni a mano." : MODELLI_DOSSIER[scelte.modello].aiuto}
            </p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">Cosa entra <span className="font-normal text-muted-foreground">(la copertina c'è sempre)</span></legend>
            {disponibili.map((d) => (
              <div key={d.sezione} className="flex items-start gap-2">
                <Checkbox
                  id={`dossier-${d.sezione}`}
                  checked={scelte.sezioni.includes(d.sezione)}
                  disabled={!d.disponibile}
                  onCheckedChange={(v) => tocca(d.sezione, v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={`dossier-${d.sezione}`} className={cn("text-sm font-normal leading-tight", !d.disponibile && "text-muted-foreground")}>
                  {NOMI_SEZIONE[d.sezione].nome}
                  <span className="block text-xs text-muted-foreground">{d.motivo ?? NOMI_SEZIONE[d.sezione].aiuto}</span>
                </Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-sm font-medium">Periodo</legend>
            <div className="space-y-1">
              <Label htmlFor="dossier-dal" className="text-xs">Dal</Label>
              <Input id="dossier-dal" type="date" className="text-sm" value={scelte.dal} onChange={(e) => cambia({ dal: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dossier-al" className="text-xs">Al</Label>
              <Input id="dossier-al" type="date" className="text-sm" value={scelte.al} onChange={(e) => cambia({ al: e.target.value })} />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              {periodoSbagliato ? <span className="text-destructive">La data di inizio viene dopo quella di fine.</span> : "Vale per foto e andamento; gli altri numeri sono a oggi."}
            </p>
          </fieldset>

          {scelte.sezioni.includes("foto") && candidate.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Foto <span className="font-normal text-muted-foreground">({scelte.foto.length} scelte)</span></legend>
              <p className="text-xs text-muted-foreground">Guardale prima di mandarle: una foto può mostrare un difetto o un incidente.</p>
              <div className="grid grid-cols-4 gap-1.5">
                {candidate.map((f) => {
                  const scelta = scelte.foto.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={scelta}
                      aria-label={f.didascalia}
                      title={f.didascalia}
                      onClick={() => toccaFoto(f.id)}
                      className={cn("relative aspect-square overflow-hidden rounded border-2", scelta ? "border-primary" : "border-transparent opacity-50")}
                    >
                      <img src={f.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="space-y-1.5">
              <Label htmlFor="dossier-note">Note del titolare <span className="font-normal text-muted-foreground">(facoltative)</span></Label>
              <Textarea id="dossier-note" rows={4} className="text-sm" value={scelte.note} maxLength={3000}
                onChange={(e) => cambia({ note: e.target.value, sezioni: e.target.value.trim() && !scelte.sezioni.includes("note") ? SEZIONI_DOSSIER.filter((x) => x === "note" || scelte.sezioni.includes(x)) : scelte.sezioni })} />
          </div>

          <Button type="submit" variant={daAggiornare ? "default" : "outline"} size="sm" disabled={preparo || periodoSbagliato || scelte.sezioni.length === 0} className="w-full">
            {preparo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {anteprima ? "Aggiorna l'anteprima" : "Prepara l'anteprima"}
          </Button>
          {anteprima && daAggiornare && !preparo && <p className="text-xs text-amber-700 dark:text-amber-400">Hai cambiato le scelte: aggiorna l'anteprima prima di scaricare o inviare.</p>}

          {puoInviare ? (
            <fieldset className="space-y-3 border-t pt-4">
              <legend className="sr-only">Invio per email</legend>
              <div className="space-y-1.5">
                <Label htmlFor="dossier-a">Invia a</Label>
                <Textarea id="dossier-a" rows={2} className="text-sm" placeholder="banca@esempio.it, socio@esempio.it" value={destinatari} onChange={(e) => setDestinatari(e.target.value)}
                  aria-invalid={indirizzi.sbagliati.length > 0 || troppi || undefined} />
                {indirizzi.sbagliati.length > 0 && <p className="text-xs text-destructive">Non sembrano indirizzi email: {indirizzi.sbagliati.join(", ")}</p>}
                {troppi && <p className="text-xs text-destructive">Al massimo {MAX_DESTINATARI} destinatari per invio.</p>}
                <p className="text-xs text-muted-foreground">Uno o più indirizzi. Ognuno riceve la sua email e non vede gli altri.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dossier-oggetto">Oggetto</Label>
                <Input id="dossier-oggetto" className="text-sm" value={oggetto} onChange={(e) => setOggetto(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dossier-messaggio">Messaggio</Label>
                <Textarea id="dossier-messaggio" rows={5} className="text-sm" value={messaggio} onChange={(e) => setMessaggio(e.target.value)} maxLength={4000} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="dossier-excel" checked={conExcel} onCheckedChange={(v) => setConExcel(v === true)} />
                <Label htmlFor="dossier-excel" className="text-sm font-normal">Allega anche l'Excel con i dati</Label>
              </div>
            </fieldset>
          ) : (
            <p className="border-t pt-4 text-xs text-muted-foreground">Puoi scaricare PDF ed Excel; per inviarli serve il permesso di modificare le commesse.</p>
          )}
        </form>

        <div className="relative min-h-[70vh] rounded-md border bg-muted/30">
          {anteprima && <iframe title="Anteprima del rendiconto" src={anteprima.url} className="h-full min-h-[70vh] w-full rounded-md" />}
          {preparo && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparo il PDF…
            </div>
          )}
          {errore && <p className="p-4 text-sm text-destructive">{errore}</p>}
        </div>
      </div>

      <DialogFooter className="mt-3 gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={onChiudi}>Chiudi</Button>
        <Button type="button" variant="outline" disabled={!anteprima || daAggiornare || preparo} onClick={() => anteprima && scarica(anteprima.blob, nomeFileDossier(anteprima.dati))}>
          <Download className="mr-1.5 h-4 w-4" /> PDF
        </Button>
        <Button type="button" variant="outline" disabled={!anteprima || daAggiornare || preparo} onClick={() => void scaricaExcel()}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
        </Button>
        {puoInviare && (
          <Button type="button" onClick={() => void manda()} disabled={!puoMandare}>
            {invia.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
            {indirizzi.validi.length > 1 ? `Invia a ${indirizzi.validi.length} destinatari` : indirizzi.validi.length === 1 ? `Invia a ${indirizzi.validi[0]}` : "Invia"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
