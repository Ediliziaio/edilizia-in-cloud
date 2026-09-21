/**
 * «Ordine e pagine»: l'azienda decide in che ordine escono i capitoli del
 * preventivo, quali nascondere, e aggiunge le sue pagine (certificazioni,
 * showroom, un lavoro di cui va fiera).
 *
 * Stesso blocco negli otto editor dei moduli edili. L'ordine mostrato qui è
 * quello che il PDF usa davvero (`ordineEffettivo`), così l'anteprima a lato e
 * il documento consegnato dicono la stessa cosa.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FilePlus2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditorSafe } from "@/components/ui/rich-text-editor-safe";
import { cn } from "@/lib/utils";
import {
  CAPITOLI_EDILI, chiaveLibera, idLibera, leggiOrdine, leggiPagineLibere, ordineEffettivo, sposta,
  type PaginaLibera, type VoceOrdine,
} from "@/components/preventivi/pdf/ordineCapitoli";
import { EditorBlocco } from "@/components/preventivi/EditorBlocco";
import { BLOCCHI, type ChiaveBlocco, type SettoreBlocchi } from "../../../supabase/functions/_shared/blocchiPreventivo";

interface Props {
  /** Il valore salvato nel modello (`pdf_ordine_capitoli`): null = ordine di serie. */
  ordine: unknown;
  /** Il valore salvato nel modello (`pdf_pagine_libere`). */
  pagine: unknown;
  onOrdine: (v: VoceOrdine[] | null) => void;
  onPagine: (v: PaginaLibera[]) => void;
  /** Il campo per caricare la foto di una pagina: quello dell'editor, col suo bucket. */
  campoFoto: (valore: string | null, onChange: (url: string | null) => void) => ReactNode;
  /** Il settore del modulo: decide i testi e le foto di serie dei blocchi. */
  settore?: SettoreBlocchi;
  /** Le scelte dell'azienda sui blocchi (`pdf_blocchi`): con `onBlocchi`, i blocchi si modificano qui. */
  blocchi?: unknown;
  onBlocchi?: (v: Record<string, unknown>) => void;
}

const BLOCCO = new Map(BLOCCHI.map((b) => [b.chiave as string, b]));

const DESCRITTI = new Map(CAPITOLI_EDILI.map((c) => [c.chiave as string, c]));
const senzaAsterischi = (t: string) => t.replace(/\*/g, "");

export function OrdineCapitoli({ ordine, pagine, onOrdine, onPagine, campoFoto, settore, blocchi, onBlocchi }: Props) {
  const libere = useMemo(() => leggiPagineLibere(pagine, { ancheVuote: true }), [pagine]);
  const elenco = useMemo(() => ordineEffettivo(leggiOrdine(ordine), libere), [ordine, libere]);
  const [aperta, setAperta] = useState<string | null>(null);

  const salvaOrdine = (nuovo: VoceOrdine[]) => onOrdine(nuovo);
  const muovi = (chiave: string, verso: -1 | 1) => salvaOrdine(sposta(elenco, chiave, verso));
  const alterna = (chiave: string) => salvaOrdine(elenco.map((v) => (v.chiave === chiave ? { ...v, visibile: !v.visibile } : v)));

  const aggiungiPagina = () => {
    const id = Math.random().toString(36).slice(2, 10);
    const nuova: PaginaLibera = { id, occhiello: null, titolo: "La nostra *qualità*.", testoHtml: null, fotoUrl: null, didascalia: null };
    const pagineNuove = [...libere, nuova];
    onPagine(pagineNuove);
    // L'ordine si salva subito con la pagina al suo posto (prima del prezzo).
    onOrdine(ordineEffettivo(elenco, pagineNuove));
    setAperta(id);
  };

  const cambiaPagina = (id: string, campo: keyof PaginaLibera, valore: string | null) =>
    onPagine(libere.map((p) => (p.id === id ? { ...p, [campo]: valore } : p)));

  const eliminaPagina = (id: string) => {
    if (!window.confirm("Eliminare questa pagina dal modello?")) return;
    const pagineNuove = libere.filter((p) => p.id !== id);
    onPagine(pagineNuove);
    onOrdine(elenco.filter((v) => v.chiave !== chiaveLibera(id)));
    if (aperta === id) setAperta(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Il documento esce in quest'ordine: copertina, poi l'elenco qui sotto, poi «I prossimi passi», le condizioni e
          la firma. I numeri dei capitoli e l'indice seguono l'ordine scelto.
        </p>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOrdine(null)} title="Torna all'ordine di serie">
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Di serie
        </Button>
      </div>

      <ol className="divide-y rounded-lg border">
        {elenco.map((v, i) => {
          const idPagina = idLibera(v.chiave);
          const pagina = idPagina ? libere.find((p) => p.id === idPagina) ?? null : null;
          const descritto = DESCRITTI.get(v.chiave);
          const spostabile = descritto ? descritto.spostabile : true;
          const nascondibile = descritto ? descritto.nascondibile : true;
          const titolo = pagina ? senzaAsterischi(pagina.titolo) || "Pagina senza titolo" : descritto?.etichetta ?? v.chiave;
          const blocco = BLOCCO.get(v.chiave);
          const modificabile = Boolean(blocco && settore && onBlocchi);
          return (
            <li key={v.chiave} className={cn("px-3 py-2", !v.visibile && "bg-muted/40")}>
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", !v.visibile && "text-muted-foreground line-through")}>
                    {titolo}
                    {pagina ? <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">pagina vostra</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {pagina ? (pagina.testoHtml || pagina.fotoUrl ? "Testo e foto scritti da voi" : "Ancora da scrivere: non esce finché è vuota") : descritto?.descrizione}
                  </p>
                  {blocco?.promessa && v.visibile ? (
                    <p className="text-[11px] text-amber-700">Promette qualcosa al cliente: rileggila, e spegnila se non lo fate.</p>
                  ) : null}
                </div>
                {spostabile ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i <= 1} onClick={() => muovi(v.chiave, -1)} aria-label={`Sposta su ${titolo}`}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === elenco.length - 1} onClick={() => muovi(v.chiave, 1)} aria-label={`Sposta giù ${titolo}`}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
                {modificabile ? (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAperta(aperta === v.chiave ? null : v.chiave)} aria-label={`Modifica ${titolo}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {pagina ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAperta(aperta === pagina.id ? null : pagina.id)} aria-label={`Modifica ${titolo}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => eliminaPagina(pagina.id)} aria-label={`Elimina ${titolo}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
                {nascondibile ? (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => alterna(v.chiave)} aria-label={v.visibile ? `Nascondi ${titolo}` : `Mostra ${titolo}`} title={v.visibile ? "Nascondi dal documento" : "Mostra nel documento"}>
                    {v.visibile ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                ) : (
                  <span className="w-7 text-center text-[10px] text-muted-foreground" title="Il prezzo non si nasconde">—</span>
                )}
              </div>

              {modificabile && blocco && aperta === v.chiave ? (
                <EditorBlocco
                  chiave={blocco.chiave as ChiaveBlocco}
                  settore={settore as SettoreBlocchi}
                  salvati={blocchi}
                  onSalvati={(nuovi) => onBlocchi?.(nuovi)}
                  campoFoto={campoFoto}
                />
              ) : null}

              {pagina && aperta === pagina.id ? (
                <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Occhiello</Label>
                      <Input value={pagina.occhiello ?? ""} onChange={(e) => cambiaPagina(pagina.id, "occhiello", e.target.value || null)} placeholder="Qualità" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Titolo</Label>
                      <Input value={pagina.titolo} onChange={(e) => cambiaPagina(pagina.id, "titolo", e.target.value)} placeholder="Le nostre *certificazioni*." />
                      <p className="text-[10px] text-muted-foreground">Una parola fra asterischi esce in corsivo, nel colore dell'azienda.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Testo</Label>
                    <RichTextEditorSafe
                      value={pagina.testoHtml ?? ""}
                      onChange={(html) => cambiaPagina(pagina.id, "testoHtml", html || null)}
                      placeholder="Racconta quello che conta: certificazioni, lo showroom, un lavoro di cui andate fieri…"
                      minHeight={120}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                    {campoFoto(pagina.fotoUrl, (url) => cambiaPagina(pagina.id, "fotoUrl", url))}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Didascalia della foto</Label>
                      <Input value={pagina.didascalia ?? ""} onChange={(e) => cambiaPagina(pagina.id, "didascalia", e.target.value || null)} placeholder="Il nostro showroom di Muggiò" />
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <Button size="sm" variant="outline" onClick={aggiungiPagina}>
        <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> Aggiungi una pagina vostra
      </Button>
    </div>
  );
}

export default OrdineCapitoli;
