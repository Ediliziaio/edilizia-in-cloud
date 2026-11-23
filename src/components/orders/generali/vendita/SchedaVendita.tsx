// src/components/orders/generali/vendita/SchedaVendita.tsx
// La scheda vendita dell'unità in PDF, da dare o mandare all'acquirente: operazione, unità,
// piano, tipologia, m², il prezzo di listino se lo vuoi, planimetria, foto, capitolato in breve
// e i contatti dell'azienda. Mai costi, margini, acquirenti o incassi (vendita.ts).
// Il capitolato in breve vale di solito per tutta l'operazione: si ricorda per la generale
// in questo browser.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Eye, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { euro } from "@/components/orders/generali/unita/aspetto";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAziendaDossier } from "@/hooks/useGeneraleRendiconto";
import { immaginePerScheda, useFileVenditaUnita } from "@/hooks/useGeneraleVendita";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { oggiLocale } from "@/lib/orders/generali/documenti";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import {
  MAX_FOTO_SCHEDA, aziendaVendita, componiSchedaVendita, nomeFileScheda,
} from "@/lib/orders/generali/vendita";

const AnteprimaPDF = lazy(() => import("@/components/shared/PdfBlobLivePreviewPanel").then(
  ({ PdfBlobLivePreviewPanel }) => ({ default: PdfBlobLivePreviewPanel }),
));

interface Props {
  generaleId: string;
  modello: ModelloGenerale;
  operazione: string;
  unita: UnitaGenerale;
  vedeImporti: boolean;
}

const chiaveCapitolato = (generaleId: string) => `generale-vendita-capitolato:${generaleId}`;
function leggiCapitolato(generaleId: string): string {
  try {
    return window.localStorage.getItem(chiaveCapitolato(generaleId)) ?? "";
  } catch {
    return "";
  }
}
function salvaCapitolato(generaleId: string, testo: string) {
  try {
    window.localStorage.setItem(chiaveCapitolato(generaleId), testo);
  } catch {
    // Navigazione privata o spazio pieno: si riscrive la prossima volta.
  }
}

export function SchedaVendita({ generaleId, modello, operazione, unita: u, vedeImporti }: Props) {
  const azienda = useAziendaDossier();
  const { file, isLoading } = useFileVenditaUnita({ generaleId, modello, orderId: u.orderId });
  const conListino = vedeImporti && u.listino !== null && u.listino > 0;
  const [conPrezzo, setConPrezzo] = useState(false);
  const [conPlanimetria, setConPlanimetria] = useState(true);
  const [conFoto, setConFoto] = useState(true);
  const [capitolato, setCapitolato] = useState(() => leggiCapitolato(generaleId));
  const [mostraAnteprima, setMostraAnteprima] = useState(false);
  const telefono = useIsMobile();
  const visore = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (telefono && mostraAnteprima) visore.current?.scrollIntoView?.({ block: "end" });
  }, [telefono, mostraAnteprima]);

  const planimetria = file?.planimetria[0] ?? null;
  const foto = (file?.foto ?? []).slice(0, MAX_FOTO_SCHEDA);
  const id = (n: string) => `scheda-${u.orderId}-${n}`;
  const base = azienda.data ? componiSchedaVendita({
    azienda: aziendaVendita(azienda.data),
    operazione,
    unita: u,
    conPrezzo: conListino && conPrezzo,
    planimetria: null,
    foto: [],
    capitolato,
    data: oggiLocale(),
  }) : null;
  const planimetriaPDF = conPlanimetria ? planimetria : null;
  const fotoPDF = conFoto ? foto : [];
  const chiavePDF = JSON.stringify([base, planimetriaPDF, fotoPDF]);

  const genera = async () => {
    if (!base) throw new Error("I dati dell’azienda non sono disponibili. Riprova.");
    salvaCapitolato(generaleId, capitolato);
    const [immagini, { pdf }, { SchedaVenditaPDF }] = await Promise.all([
      Promise.all([
        planimetriaPDF ? immaginePerScheda(planimetriaPDF) : Promise.resolve(null),
        ...fotoPDF.map((f) => immaginePerScheda(f, 1000)),
      ]),
      import("@react-pdf/renderer"),
      import("@/components/orders/generali/vendita/VenditaPDF"),
    ]);
    const [immPlanimetria, ...immFoto] = immagini;
    const fotoBuone = immFoto.filter((f): f is string => !!f);
    const blob = await pdf(<SchedaVenditaPDF d={{ ...base, planimetria: immPlanimetria, foto: fotoBuone }} />).toBlob();
    const persi = (planimetriaPDF && !immPlanimetria ? 1 : 0) + fotoPDF.length - fotoBuone.length;
    if (persi > 0) toast.warning(persi === 1
      ? "Un’immagine non si è caricata ed è rimasta fuori dal PDF."
      : `${persi} immagini non si sono caricate e sono rimaste fuori dal PDF.`);
    return createPdfPreviewUrl(blob);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
      <div className="space-y-3">
        <section aria-label="Contenuto del PDF" className="min-w-0 rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <FileText className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> Contenuto del PDF
          </h3>
          <div className="space-y-3 p-4">
            {conListino && (
              <div className="flex items-center gap-2">
                <Checkbox id={id("prezzo")} checked={conPrezzo} onCheckedChange={(v) => setConPrezzo(v === true)} />
                <Label htmlFor={id("prezzo")} className="text-sm font-normal">Metti il prezzo di listino ({euro(u.listino)})</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id={id("planimetria")} checked={conPlanimetria && !!planimetria} disabled={!planimetria} onCheckedChange={(v) => setConPlanimetria(v === true)} />
              <Label htmlFor={id("planimetria")} className="text-sm font-normal">
                {isLoading ? "Planimetria…" : planimetria ? "Planimetria" : "Planimetria (non caricata: si carica dalla scheda Vendita)"}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={id("foto")} checked={conFoto && foto.length > 0} disabled={foto.length === 0} onCheckedChange={(v) => setConFoto(v === true)} />
              <Label htmlFor={id("foto")} className="text-sm font-normal">
                {foto.length === 0 ? "Foto o render (nessuna caricata)" : `Foto o render (${foto.length})`}
              </Label>
            </div>
          </div>
        </section>
        <div className="min-w-0 rounded-lg border bg-card">
          <Label htmlFor={id("capitolato")} className="block border-b px-4 py-3 text-sm font-semibold">Capitolato in breve</Label>
          <div className="space-y-2 p-4">
            <Textarea
              id={id("capitolato")}
              value={capitolato}
              onChange={(ev) => setCapitolato(ev.target.value)}
              rows={3}
              className="text-sm"
              placeholder={"Classe energetica A4\nPavimenti in gres porcellanato 60×60\nInfissi in PVC con triplo vetro"}
            />
            <p className="text-xs text-muted-foreground">Una voce per riga. Il testo vale per tutte le unità dell’operazione.</p>
          </div>
        </div>
      </div>
      {mostraAnteprima && base ? (
        <div ref={visore} className="h-[clamp(320px,48dvh,440px)] min-w-0">
          <Suspense fallback={<div role="status" className="grid h-full place-items-center rounded-lg border text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carico il visore PDF…</span>
          </div>}>
            <AnteprimaPDF renderBlobUrl={genera} depsKey={chiavePDF} enabled={!isLoading}
              downloadFileName={nomeFileScheda(base)} downloadButtonLabel="Scarica PDF"
              requireRenderedDownload showDownloadOnMobile allowOpenInNewTab={false}
              headerLabel="Anteprima del PDF" accentClass="text-blue-700 dark:text-blue-300" vistaPagina />
          </Suspense>
        </div>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/25 px-4 py-6 text-center lg:min-h-full">
          <Eye className="size-6 text-blue-700 dark:text-blue-300" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Controlla la scheda di {u.sigla} prima di scaricarla.</p>
          <Button size="sm" disabled={!base || isLoading} onClick={() => setMostraAnteprima(true)}>Mostra anteprima</Button>
        </div>
      )}
    </div>
  );
}
