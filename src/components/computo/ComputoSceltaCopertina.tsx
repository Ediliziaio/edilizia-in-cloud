import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attivaCopertina, COPERTINE_COMPUTO, haPaginaCopertina, type StileCopertinaComputo } from "@/lib/computo/copertineComputo";
import type { ModelloComputo } from "@/lib/computo/modelloComputo";

const PER_PAGINA = 4;
function MiniCopertina({ tipo, colore, font }: { tipo: StileCopertinaComputo; colore: string; font: string }) {
  const scura = tipo === "piena" || tipo === "fotografica";
  const laterale = tipo === "colonna";
  return <span aria-hidden="true" className="relative mx-auto mb-3 block aspect-[.707] w-full max-w-36 overflow-hidden rounded-sm border shadow-sm"
    style={{ background: scura ? colore : tipo === "editoriale" || tipo === "cornice" ? "#FAF8F4" : "#FFFFFF", color: scura ? "#FFFFFF" : "#172033", fontFamily: font }}>
    {tipo === "piena" && <span className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "12px 12px" }} />}
    {tipo === "editoriale" && <span className="absolute right-0 top-0 h-[28%] w-[26%]" style={{ background: colore }} />}
    {tipo === "fascia" && <span className="absolute inset-x-0 top-0 h-[3%]" style={{ background: colore }} />}
    {tipo === "sobria" && <span className="absolute left-[7%] right-[7%] top-[25%] h-px opacity-35" style={{ background: colore }} />}
    {tipo === "fotografica" && <span className="absolute inset-x-0 top-0 h-[44%] overflow-hidden bg-white/75"><span className="absolute bottom-0 left-[8%] h-[65%] w-[33%] opacity-30" style={{ background: colore }} /><span className="absolute bottom-0 right-[9%] h-[90%] w-[42%] opacity-45" style={{ background: colore }} /><span className="absolute bottom-[18%] left-0 right-0 h-px bg-white/80" /></span>}
    {tipo === "diagonale" && <><span className="absolute right-0 top-0 h-[34%] w-[44%]" style={{ background: colore, clipPath: "polygon(0 0,100% 0,100% 100%)" }} /><span className="absolute right-0 top-[20%] h-[24%] w-[22%] opacity-15" style={{ background: colore, clipPath: "polygon(0 0,100% 0,100% 100%)" }} /></>}
    {tipo === "cornice" && <><span className="absolute inset-[3.5%] border" style={{ borderColor: colore }} /><span className="absolute inset-[5%] border opacity-20" style={{ borderColor: colore }} /></>}
    {laterale && <span className="absolute inset-y-0 left-0 w-[14%]" style={{ background: colore }} />}
    <span className="absolute right-[7%] text-[6px] font-bold tracking-widest" style={{ left: laterale ? "21%" : "7%", top: tipo === "fotografica" ? "47%" : "8%" }}>LA TUA AZIENDA</span>
    <span className="absolute right-[7%]" style={{ left: laterale ? "21%" : "7%", top: tipo === "fotografica" ? "54%" : "37%" }}>
      <span className="block text-[6px] tracking-wider opacity-75">PREVENTIVO</span>
      <span className="mt-1 block text-[15px] font-semibold leading-[1.05]">Il tuo<br />progetto.</span>
    </span>
    <span className="absolute bottom-[14%] right-[7%] h-px opacity-35" style={{ left: laterale ? "21%" : "7%", background: "currentColor" }} />
    <span className="absolute bottom-[8%] right-[7%] text-[5px] opacity-75" style={{ left: laterale ? "21%" : "7%" }}>CLIENTE · DATA · RIFERIMENTO</span>
  </span>;
}

export function ComputoSceltaCopertina({ modello, colore, font, onChange }: { modello: ModelloComputo; colore: string; font: string; onChange: (m: ModelloComputo) => void }) {
  const indice = COPERTINE_COMPUTO.findIndex(c => c.id === modello.copertina);
  const paginaScelta = Math.floor(Math.max(0, indice) / PER_PAGINA);
  const [sfogliata, setSfogliata] = useState({ stile: modello.copertina, pagina: paginaScelta });
  const pagina = sfogliata.stile === modello.copertina ? sfogliata.pagina : paginaScelta;
  const vaiAPagina = (pagina: number) => setSfogliata({ stile: modello.copertina, pagina });
  const inizio = pagina * PER_PAGINA;
  const corrente = COPERTINE_COMPUTO[indice];
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Scegli la copertina</h3><p className="mt-1 text-xs text-muted-foreground">Otto stili pronti, tutti con i tuoi colori.</p></div>
      <div className="flex items-center gap-2">
        <span role="status" aria-live="polite" className="min-w-14 text-center text-[11px] tabular-nums text-muted-foreground">{inizio + 1}–{Math.min(inizio + PER_PAGINA, COPERTINE_COMPUTO.length)} di {COPERTINE_COMPUTO.length}</span>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Copertine precedenti" disabled={pagina === 0} onClick={() => vaiAPagina(pagina - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Altre copertine" disabled={inizio + PER_PAGINA >= COPERTINE_COMPUTO.length} onClick={() => vaiAPagina(pagina + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
    <div role="radiogroup" aria-label="Stile della copertina" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {COPERTINE_COMPUTO.slice(inizio, inizio + PER_PAGINA).map(c => <button key={c.id} type="button" role="radio" aria-label={c.nome} aria-checked={modello.copertina === c.id}
        onClick={() => onChange(attivaCopertina(modello, c.id))} title={c.descrizione}
        className={`relative min-w-0 rounded-xl border p-2.5 text-left transition-colors ${modello.copertina === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 hover:border-slate-400"}`}>
        {modello.copertina === c.id && <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-primary p-0.5 text-white"><Check className="h-3 w-3" /></span>}
        <MiniCopertina tipo={c.id} colore={colore} font={font} /><span className="block text-center text-xs font-medium">{c.nome}</span>
      </button>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground"><span className="font-medium">{corrente?.nome}.</span> {corrente?.descrizione}</p>
    {!haPaginaCopertina(modello, modello.sezioni.copertina) && <p className="mt-2 text-xs text-amber-700">La pagina di copertina è disattivata. Scegli uno stile per attivarla nell’anteprima e nel PDF.</p>}
  </div>;
}
