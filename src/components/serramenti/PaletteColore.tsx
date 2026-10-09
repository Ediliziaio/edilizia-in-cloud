import { useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finituraDaEtichetta } from "@/lib/serramenti/finituraSerramento";
import { chiaveColore, coloreDisponibile, elencoColori, type CatalogoColori } from "@/lib/serramenti/catalogoColori";
import type { AsseColore, LatoColore, SceltaLato } from "@/lib/serramenti/coloriDentroFuori";

function sfondo(nome: string, hex?: string) {
  if (hex) return hex;
  const finitura = finituraDaEtichetta(nome);
  if (!finitura) return "repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 4px, #f8fafc 4px, #f8fafc 8px)";
  return finitura.tipo === "tinta" ? finitura.hex : `repeating-linear-gradient(90deg, ${finitura.chiaro}, ${finitura.scuro} 2px, ${finitura.chiaro} 5px)`;
}

/** Pannello in-page: funziona anche nel Dialog senza portal esterni né trappole di focus. */
export function PaletteColore({ asse, catalogo, lato, scelta, onChange }: {
  asse: AsseColore; catalogo?: CatalogoColori | null; lato: LatoColore; scelta: SceltaLato;
  onChange: (valueId: string, voce: string | null) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const campioni = elencoColori(asse).filter(v => v.attivo && coloreDisponibile(catalogo, v.chiave, lato));
  const risultati = campioni.filter(v => {
    const m = catalogo?.campioni.find(c => c.chiave === v.chiave);
    return `${v.nome} ${v.fascia} ${m?.codice ?? ""} ${m?.finitura ?? ""}`.toLowerCase().includes(cerca.toLowerCase());
  });
  return <div>
    <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-[10px] text-blue-800" aria-expanded={aperto} onClick={() => setAperto(!aperto)}><Palette className="mr-1 h-3 w-3" />{aperto ? "Chiudi campioni" : "Campioni colore"} {lato}</Button>
    {aperto && <div className="space-y-2 rounded-md border bg-background p-2">
      <Input className="h-8 text-xs" aria-label={`Cerca colore ${lato}`} placeholder="Nome, RAL, codice o finitura…" value={cerca} onChange={e => setCerca(e.target.value)} />
      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto">
        {risultati.map(v => {
          const m = catalogo?.campioni.find(c => c.chiave === v.chiave);
          const selezionato = !scelta.scritto && v.chiave === chiaveColore(scelta.valueId ?? "", scelta.voce);
          return <button type="button" key={v.chiave} aria-pressed={selezionato} className={`flex min-w-0 items-center gap-2 rounded-md border p-2 text-left text-[11px] hover:bg-blue-50 ${selezionato ? "border-blue-600 bg-blue-50" : "border-slate-200"}`} onClick={() => { onChange(v.valueId, v.voce); setAperto(false); setCerca(""); }}>
            <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded border border-black/15" style={{ background: sfondo(v.nome, m?.hex) }} />
            <span className="min-w-0"><span className="block break-words font-medium">{v.nome}</span><span className="block text-[10px] text-muted-foreground">{[m?.codice, m?.finitura].filter(Boolean).join(" · ") || v.fascia}</span></span>
          </button>;
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">Campioni indicativi, non sostituiscono quelli fisici del fornitore.</p>
      {campioni.length === 0 && <p className="text-xs">Nessun colore disponibile su questo lato.</p>}
      {campioni.length > 0 && risultati.length === 0 && <p role="status" className="text-xs">Nessun campione trovato. Prova un altro nome o codice.</p>}
    </div>}
  </div>;
}
