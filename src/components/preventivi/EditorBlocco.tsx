/**
 * L'editor di un blocco del preventivo (come funziona, cosa è compreso,
 * protezione, controlli, documenti, diario): testi, voci con la loro icona, foto.
 *
 * Mostra sempre il blocco com'è davvero (i testi di serie del settore con sopra
 * quelli dell'azienda) e salva SOLO quello che l'azienda cambia: il resto resta
 * di serie e migliora insieme alla libreria. «Torna ai testi di serie» cancella le
 * scelte di questo blocco.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  descrizioneBlocco, eFotoDiSerie, fotoDellaLibreria, leggiBlocco,
  type ChiaveBlocco, type SettoreBlocchi, type VoceBlocco,
} from "../../../supabase/functions/_shared/blocchiPreventivo";
import { ICONE, type NodoIcona, type NomeIcona } from "../../../supabase/functions/_shared/iconePreventivo";
import { eTavola } from "../../../supabase/functions/_shared/proporzioniImmagine";

interface Props {
  chiave: ChiaveBlocco;
  settore: SettoreBlocchi;
  /** Tutte le scelte dell'azienda sui blocchi (`pdf_blocchi` del modello). */
  salvati: unknown;
  onSalvati: (v: Record<string, unknown>) => void;
  /** Il campo per caricare una foto: quello dell'editor, col suo bucket. */
  campoFoto: (valore: string | null, onChange: (url: string | null) => void) => ReactNode;
  /** Dentro una sezione dell'editor, che ha già la sua scheda: senza bordo né margine. */
  incorniciato?: boolean;
}

const NOMI_ICONE = Object.keys(ICONE) as NomeIcona[];

/** L'icona disegnata come nel PDF, per vederla accanto alla scelta. */
function AnteprimaIcona({ nome }: { nome: NomeIcona | null }) {
  if (!nome) return <span className="inline-block h-4 w-4" />;
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICONE[nome] as NodoIcona[]).map(([tag, a], i) => {
        const Tag = tag as unknown as "path";
        return <Tag key={i} {...(a as Record<string, string>)} />;
      })}
    </svg>
  );
}

function EditorVoci({ titolo, voci, onVoci, conTesto }: {
  titolo: string; voci: VoceBlocco[]; onVoci: (v: VoceBlocco[]) => void; conTesto: boolean;
}) {
  const cambia = (i: number, campo: keyof VoceBlocco, valore: string | null) =>
    onVoci(voci.map((x, j) => (j === i ? { ...x, [campo]: valore } : x)));
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{titolo}</Label>
      <div className="space-y-1.5">
        {voci.map((x, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="flex h-9 items-center gap-1 rounded-md border bg-background px-1.5">
              <AnteprimaIcona nome={x.icona} />
              <select
                aria-label={`Icona di ${x.titolo || "voce"}`}
                value={x.icona ?? ""}
                onChange={(e) => cambia(i, "icona", e.target.value || null)}
                className="h-7 max-w-[7.5rem] bg-transparent text-xs"
              >
                <option value="">nessuna</option>
                {NOMI_ICONE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="grid min-w-0 flex-1 gap-1.5 md:grid-cols-[1fr_1.4fr]">
              <Input value={x.titolo} onChange={(e) => cambia(i, "titolo", e.target.value)} placeholder="Titolo" aria-label="Titolo della voce" />
              {conTesto ? (
                <Input value={x.testo ?? ""} onChange={(e) => cambia(i, "testo", e.target.value || null)} placeholder="Una riga di spiegazione (facoltativa)" aria-label="Spiegazione della voce" />
              ) : null}
            </div>
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => onVoci(voci.filter((_, j) => j !== i))} aria-label={`Togli ${x.titolo || "voce"}`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={() => onVoci([...voci, { titolo: "", testo: null, icona: null }])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi una voce
      </Button>
    </div>
  );
}

export function EditorBlocco({ chiave, settore, salvati, onSalvati, campoFoto, incorniciato = true }: Props) {
  const tutti = useMemo(() => (salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {}), [salvati]);
  const proprio = (tutti[chiave] && typeof tutti[chiave] === "object" ? tutti[chiave] : {}) as Record<string, unknown>;
  const effettivo = useMemo(() => leggiBlocco(chiave, settore, tutti), [chiave, settore, tutti]);
  const descrizione = descrizioneBlocco(chiave);
  const [libreriaAperta, setLibreriaAperta] = useState(false);
  const libreria = useMemo(() => fotoDellaLibreria(settore), [settore]);

  const salva = (campi: Record<string, unknown>) => onSalvati({ ...tutti, [chiave]: { ...proprio, ...campi } });
  // Nei campi si vede quello che l'azienda sta scrivendo, anche vuoto: se mostrassero
  // il valore finale, svuotare un titolo per riscriverlo farebbe ricomparire quello di
  // serie. Il PDF usa il testo di serie solo dove l'azienda non ha scritto niente.
  const testoCampo = (k: "occhiello" | "titolo" | "intro"): string =>
    typeof proprio[k] === "string" ? (proprio[k] as string) : effettivo[k] ?? "";
  const vociCampo = (k: "voci" | "escluse"): VoceBlocco[] =>
    Array.isArray(proprio[k]) && (proprio[k] as unknown[]).length > 0 ? (proprio[k] as VoceBlocco[]) : effettivo[k];
  const tornaDiSerie = () => {
    if (!window.confirm("Rimettere testi e foto di serie per questa pagina?")) return;
    const { [chiave]: _via, ...resto } = tutti;
    onSalvati(resto);
  };

  // Due posti per le foto, come nel PDF. Una tavola (la grafica verticale con le
  // scritte dentro) esce da sola e intera, con le voci accanto: un posto solo.
  const slot = [effettivo.foto[0] ?? null, effettivo.foto[1] ?? null];
  const tavola = slot.find((u) => u && eTavola(u) != null) ?? null;
  const posti = tavola ? [tavola] : slot;
  const salvaFoto = (nuove: Array<string | null>) => {
    const piene = nuove.filter((u): u is string => Boolean(u));
    salva(piene.length > 0 ? { foto: piene, senzaFoto: false } : { foto: [], senzaFoto: true });
  };
  const scegliDallaLibreria = (url: string) => {
    // Una tavola prende il posto di tutte le foto; una foto prende il posto della tavola.
    if (eTavola(url) != null || tavola) {
      salvaFoto([url]);
    } else {
      const nuove = [...slot];
      const vuoto = nuove.findIndex((u) => !u);
      nuove[vuoto >= 0 ? vuoto : 1] = url;
      salvaFoto(nuove);
    }
    setLibreriaAperta(false);
  };

  return (
    <div className={incorniciato ? "mt-3 space-y-4 rounded-md border bg-background p-3" : "space-y-4"}>
      {descrizione.promessa ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Questa pagina promette qualcosa al cliente ed è accesa di serie: adatta le voci a come lavorate, e spegnila se non lo fate.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label className="text-xs">Occhiello</Label>
          <Input value={testoCampo("occhiello")} onChange={(e) => salva({ occhiello: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Titolo</Label>
          <Input value={testoCampo("titolo")} onChange={(e) => salva({ titolo: e.target.value })} />
          <p className="text-[10px] text-muted-foreground">Una parola fra asterischi esce in corsivo, nel colore dell'azienda.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Introduzione</Label>
        <Textarea value={testoCampo("intro")} onChange={(e) => salva({ intro: e.target.value })} rows={2} />
      </div>

      <EditorVoci
        titolo={chiave === "compreso" ? "Compreso nel prezzo" : "Le voci"}
        voci={vociCampo("voci")}
        onVoci={(voci) => salva({ voci })}
        conTesto={chiave !== "compreso"}
      />
      {chiave === "compreso" ? (
        <EditorVoci titolo="Non compreso" voci={vociCampo("escluse")} onVoci={(escluse) => salva({ escluse })} conTesto={false} />
      ) : null}

      {chiave !== "compreso" ? (
        <div className="space-y-2">
          <Label className="text-xs">{tavola ? "La tavola" : "Foto (al massimo due)"}</Label>
          <div className={tavola ? "grid gap-3 md:grid-cols-[220px_1fr] md:items-start" : "grid gap-3 md:grid-cols-2"}>
            {posti.map((url, i) => (
              <div key={i} className="space-y-1">
                {url && eFotoDiSerie(url) ? (
                  <div className="relative overflow-hidden rounded-md border bg-muted">
                    <img src={url} alt="" className={tavola ? "aspect-[4/5] w-full object-contain" : "aspect-[16/9] w-full object-cover"} />
                    <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">di serie</span>
                    <Button size="icon" variant="secondary" className="absolute right-1.5 top-1.5 h-7 w-7" onClick={() => salvaFoto(tavola ? [] : slot.map((u, j) => (j === i ? null : u)))} aria-label="Togli la foto">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  campoFoto(url, (nuova) => salvaFoto(tavola ? [nuova] : slot.map((u, j) => (j === i ? nuova : u))))
                )}
              </div>
            ))}
            {tavola ? (
              <p className="text-[11px] text-muted-foreground">
                Una tavola esce da sola e intera, grande quanto la pagina permette, con le voci accanto: le sue
                scritte non si tagliano. Per mettere le vostre foto, toglietela o sceglietene una dalla libreria.
              </p>
            ) : null}
          </div>
          <Button size="sm" variant="outline" onClick={() => setLibreriaAperta((a) => !a)}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> {libreriaAperta ? "Chiudi la libreria" : "Scegli dalla libreria"}
          </Button>
          {libreriaAperta ? (
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2 md:grid-cols-4">
              {libreria.map((f) => (
                <button key={f.url} type="button" onClick={() => scegliDallaLibreria(f.url)} className="group overflow-hidden rounded border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <img src={f.url} alt={f.nome} loading="lazy" className={`aspect-[16/9] w-full bg-muted transition group-hover:opacity-80 ${eTavola(f.url) != null ? "object-contain" : "object-cover"}`} />
                  <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground">{f.nome}</span>
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[10px] text-muted-foreground">
            Sotto le foto di serie il PDF scrive «Immagini indicative»: con le vostre foto la scritta sparisce.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={tornaDiSerie}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Torna ai testi di serie
        </Button>
      </div>
    </div>
  );
}

export default EditorBlocco;
