import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  calcolaZone,
  consegnaFile,
  descriviFormati,
  messaggioEsito,
  valutaFile,
  zonaSotto,
  type ZonaRilascio,
} from "@/lib/rilascioFile";

/**
 * Trascinare un file sull'app, ovunque: un solo ascoltatore per tutte le pagine.
 *
 * Il file finisce nell'`<input type="file">` dell'area sotto il mouse e fa
 * scattare il suo `onChange`: dimensioni, messaggi e caricamento sono quelli del
 * pulsante, senza una riga in più nelle schermate. Vale anche per i caricamenti
 * che verranno.
 *
 * Ascolta su `window` e nella fase di risalita, dopo React: chi ha già una sua
 * area di rilascio ha chiamato `preventDefault` e qui si lascia stare.
 */

/** Pagine con un loro rilascio su tutta la finestra (`data-rilascio-pagina` sul body). */
const paginaGestisceDaSola = () => document.body.hasAttribute("data-rilascio-pagina");

/** Tra un dragover e l'altro passano al massimo ~550 ms: oltre, il trascinamento è finito o uscito. */
const SILENZIO_MS = 700;
/** Le aree si ricalcolano poco spesso: `dragover` arriva decine di volte al secondo. */
const VALIDITA_ZONE_MS = 250;

interface Riquadro {
  chiave: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Vista {
  riquadri: Riquadro[];
  attiva: number;
  etichetta: string;
  dettaglio: string;
  disabilitata: boolean;
}

function portaFile(dt: DataTransfer | null): dt is DataTransfer {
  return !!dt && Array.from(dt.types ?? []).includes("Files");
}

/** L'editor di testo chiama `preventDefault` su ogni trascinamento, anche senza fare nulla col file. */
function dentroEditor(bersaglio: EventTarget | null) {
  return bersaglio instanceof Element && !!bersaglio.closest('[contenteditable="true"]');
}

function ritaglia(el: HTMLElement, chiave: number): Riquadro | null {
  const r = el.getBoundingClientRect();
  const top = Math.max(r.top, 0);
  const left = Math.max(r.left, 0);
  const width = Math.min(r.right, window.innerWidth) - left;
  const height = Math.min(r.bottom, window.innerHeight) - top;
  return width > 0 && height > 0 ? { chiave, top, left, width, height } : null;
}

function costruisciVista(zone: ZonaRilascio[], attiva: ZonaRilascio | null): Vista {
  const riquadri = zone.flatMap((z, i) => ritaglia(z.elemento, i) ?? []);
  const input = attiva?.input;
  const disabilitata = !!input?.matches(":disabled");
  const formati = input && input.dataset.rilascio !== "senza-filtro" ? descriviFormati(input.accept) : "";
  return {
    riquadri,
    attiva: attiva ? zone.indexOf(attiva) : -1,
    etichetta: disabilitata ? "Non disponibile in questo momento" : "Rilascia qui per caricare",
    dettaglio: disabilitata ? "" : [formati, input?.multiple ? "anche più file" : ""].filter(Boolean).join(" · "),
    disabilitata,
  };
}

function cartelleTra(dt: DataTransfer): number {
  return Array.from(dt.items ?? []).filter((voce) => voce.webkitGetAsEntry?.()?.isDirectory).length;
}

function rilascia(e: DragEvent, dt: DataTransfer) {
  const cartelle = cartelleTra(dt);
  const files = Array.from(dt.files);
  if (cartelle > 0) {
    toast.error("Le cartelle non si possono caricare", { description: "Trascina i file che contiene." });
    return;
  }
  if (files.length === 0) return;

  const zone = calcolaZone(document);
  const zona = zonaSotto(e.target, zone);
  if (!zona) {
    toast.info("Qui non si possono caricare file", {
      description: zone.length > 0 ? "Rilascialo sopra uno dei riquadri evidenziati." : undefined,
    });
    return;
  }
  const { input } = zona;
  if (input.matches(":disabled")) {
    toast.info("Caricamento non disponibile in questo momento", {
      description: "Aspetta che finisca l'operazione in corso e riprova.",
    });
    return;
  }
  const esito = valutaFile(files, input, input.dataset.rilascio === "senza-filtro");
  const messaggio = messaggioEsito(esito, input.accept);
  if (messaggio) toast.error(messaggio.titolo, { description: messaggio.descrizione });
  if (esito.ammessi.length > 0) consegnaFile(input, esito.ammessi);
}

export function RilascioFileGlobale() {
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    let zone: ZonaRilascio[] = [];
    let calcolateAlle = 0;
    let silenzio: ReturnType<typeof setTimeout> | undefined;
    let ultima = "";

    const mostra = (nuova: Vista | null) => {
      const chiave = JSON.stringify(nuova);
      if (chiave === ultima) return;
      ultima = chiave;
      setVista(nuova);
    };
    const spegni = () => {
      clearTimeout(silenzio);
      calcolateAlle = 0;
      mostra(null);
    };

    const onSopra = (e: DragEvent) => {
      if (!portaFile(e.dataTransfer)) return;
      clearTimeout(silenzio);
      silenzio = setTimeout(spegni, SILENZIO_MS);
      if (paginaGestisceDaSola()) {
        mostra(null);
        return;
      }
      if (Date.now() - calcolateAlle > VALIDITA_ZONE_MS) {
        zone = calcolaZone(document);
        calcolateAlle = Date.now();
      }
      if (e.defaultPrevented && !dentroEditor(e.target)) {
        mostra(costruisciVista(zone, null));
        return;
      }
      // Senza questo, il file rilasciato fuori da un'area si aprirebbe al posto dell'app.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      mostra(costruisciVista(zone, zonaSotto(e.target, zone)));
    };

    const onRilascio = (e: DragEvent) => {
      if (!portaFile(e.dataTransfer)) return;
      spegni();
      if (e.defaultPrevented || paginaGestisceDaSola()) return;
      e.preventDefault();
      rilascia(e, e.dataTransfer);
    };

    window.addEventListener("dragenter", onSopra);
    window.addEventListener("dragover", onSopra);
    window.addEventListener("drop", onRilascio);
    return () => {
      clearTimeout(silenzio);
      window.removeEventListener("dragenter", onSopra);
      window.removeEventListener("dragover", onSopra);
      window.removeEventListener("drop", onRilascio);
    };
  }, []);

  if (!vista) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100000]" data-testid="rilascio-file">
      {/* Un PDF in anteprima terrebbe per sé il trascinamento e si sostituirebbe col file. */}
      <style>{"iframe,embed,object{pointer-events:none!important}"}</style>
      {vista.riquadri.map((r) => {
        const attiva = r.chiave === vista.attiva;
        const colore = vista.disabilitata ? "border-muted-foreground bg-muted/60" : "border-primary bg-primary/10";
        return (
          <div
            key={r.chiave}
            style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
            className={`absolute flex items-center justify-center overflow-hidden rounded-lg border-dashed ${
              attiva ? `border-2 ${colore}` : "border border-primary/50"
            }`}
          >
            {attiva && r.height >= 28 && (
              <div className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow">
                <Upload className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{vista.etichetta}</span>
                {vista.dettaglio && r.width >= 360 && (
                  <span className="truncate text-xs font-normal text-muted-foreground">{vista.dettaglio}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
