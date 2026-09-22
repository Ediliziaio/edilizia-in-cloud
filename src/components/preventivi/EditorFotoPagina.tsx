/**
 * La foto di una pagina del preventivo (prossimi passi, percorso, confronto,
 * garanzie…): quella di serie del settore, una della libreria, una vostra, o
 * nessuna. Salva in `pdf_blocchi` sotto «pagina_<chiave>» (vedi
 * supabase/functions/_shared/blocchiPreventivo.ts).
 */
import { useMemo, useState, type ReactNode } from "react";
import { ImageOff, ImagePlus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  chiaveSalvataFotoPagina, eFotoDiSerie, FOTO_PAGINE_ETICHETTE, fotoDellaLibreria, fotoPaginaDiSerie, leggiFotoPagina,
  type ChiaveFotoPagina, type SettoreBlocchi,
} from "../../../supabase/functions/_shared/blocchiPreventivo";
import { eTavola } from "../../../supabase/functions/_shared/proporzioniImmagine";

interface Props {
  chiave: ChiaveFotoPagina;
  settore: SettoreBlocchi;
  /** Tutte le scelte dell'azienda su blocchi e foto (`pdf_blocchi` del modello). */
  salvati: unknown;
  onSalvati: (v: Record<string, unknown>) => void;
  /** Il campo per caricare una foto: quello dell'editor, col suo bucket. */
  campoFoto: (valore: string | null, onChange: (url: string | null) => void) => ReactNode;
  /** Dentro una sezione dell'editor, che ha già la sua scheda: senza bordo né margine. */
  incorniciato?: boolean;
  /** Quando esce la foto (sempre, o solo se la pagina finisce a metà foglio). */
  nota?: string;
}

export function EditorFotoPagina({ chiave, settore, salvati, onSalvati, campoFoto, incorniciato = true, nota }: Props) {
  const tutti = useMemo(() => (salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {}), [salvati]);
  const chiaveSalvata = chiaveSalvataFotoPagina(chiave);
  const attuale = leggiFotoPagina(chiave, settore, tutti);
  const diSerie = fotoPaginaDiSerie(chiave, settore);
  const [libreriaAperta, setLibreriaAperta] = useState(false);
  // Senza le tavole: qui la foto riempie una fascia e si ritaglia, e una tavola
  // perderebbe le sue scritte.
  const libreria = useMemo(() => fotoDellaLibreria(settore).filter((f) => eTavola(f.url) == null), [settore]);

  const salva = (valore: Record<string, unknown> | null) => {
    const { [chiaveSalvata]: _via, ...resto } = tutti;
    onSalvati(valore ? { ...resto, [chiaveSalvata]: valore } : resto);
  };
  const scegli = (url: string | null) => salva(url ? { foto: [url], senzaFoto: false } : { foto: [], senzaFoto: true });

  return (
    <div className={incorniciato ? "mt-3 space-y-3 rounded-md border bg-background p-3" : "space-y-3"}>
      <div className="space-y-0.5">
        <p className="text-xs font-medium">{FOTO_PAGINE_ETICHETTE[chiave]}</p>
        {nota ? <p className="text-[11px] text-muted-foreground">{nota}</p> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        {attuale && eFotoDiSerie(attuale) ? (
          <div className="relative overflow-hidden rounded-md border">
            <img src={attuale} alt="" className="aspect-[16/9] w-full object-cover" />
            <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">di serie</span>
          </div>
        ) : attuale ? (
          campoFoto(attuale, (url) => scegli(url))
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Senza foto: la pagina finisce col testo. Potete caricarne una vostra:</p>
            {campoFoto(null, (url) => scegli(url))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 md:flex-col">
          <Button size="sm" variant="outline" onClick={() => setLibreriaAperta((a) => !a)}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> {libreriaAperta ? "Chiudi la libreria" : "Scegli dalla libreria"}
          </Button>
          {attuale && eFotoDiSerie(attuale) ? (
            <Button size="sm" variant="ghost" onClick={() => scegli(null)}>
              <ImageOff className="mr-1.5 h-3.5 w-3.5" /> Togli la foto
            </Button>
          ) : null}
          {diSerie && attuale !== diSerie ? (
            <Button size="sm" variant="ghost" onClick={() => salva(null)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Torna alla foto di serie
            </Button>
          ) : null}
        </div>
      </div>
      {attuale && eFotoDiSerie(attuale) ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Oppure caricate una vostra foto:</p>
          {campoFoto(null, (url) => scegli(url))}
        </div>
      ) : null}
      {libreriaAperta ? (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2 md:grid-cols-4">
          {libreria.map((f) => (
            <button
              key={f.url}
              type="button"
              onClick={() => { scegli(f.url); setLibreriaAperta(false); }}
              className="group overflow-hidden rounded border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <img src={f.url} alt={f.nome} loading="lazy" className="aspect-[16/9] w-full object-cover transition group-hover:opacity-80" />
              <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground">{f.nome}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default EditorFotoPagina;
