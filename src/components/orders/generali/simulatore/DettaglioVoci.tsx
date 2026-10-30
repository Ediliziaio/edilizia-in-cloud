// src/components/orders/generali/simulatore/DettaglioVoci.tsx
// Il dettaglio voce per voce: le voci che diventeranno il piano economico, con la regola
// che le calcola. Si corregge un importo o un mese (ritocco, si toglie col ripristino) e si
// aggiungono voci a mano.
import { useState } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoNumero } from "@/components/orders/generali/simulatore/Campi";
import { euro, nomeMese } from "@/components/orders/generali/piano/formato";
import { aggiungiMesi, categorieDelTipo, type CategoriaPiano } from "@/lib/orders/generali/pianoCategorie";
import { nuovaVoce, vociIpotesi, type Ipotesi, type Ritocco, type VoceAggiunta, type VoceSimulata } from "@/lib/orders/generali/simulatore";
import { cn } from "@/lib/utils";

export function DettaglioVoci({ ipotesi: ip, onCambia }: { ipotesi: Ipotesi; onCambia: (ip: Ipotesi) => void }) {
  const [aperto, setAperto] = useState(false);
  const voci = vociIpotesi(ip);
  const ritoccate = voci.filter((v) => v.ritoccata).length;

  const ritocca = (v: VoceSimulata, campo: keyof Ritocco, valore: number) => {
    const attuale: Ritocco = { ...ip.ritocchi[v.chiave] };
    if (valore === v.calcolato[campo]) delete attuale[campo];
    else attuale[campo] = valore;
    const ritocchi = { ...ip.ritocchi };
    if (Object.keys(attuale).length) ritocchi[v.chiave] = attuale;
    else delete ritocchi[v.chiave];
    onCambia({ ...ip, ritocchi });
  };
  const ripristina = (chiave: string) => {
    const ritocchi = { ...ip.ritocchi };
    delete ritocchi[chiave];
    onCambia({ ...ip, ritocchi });
  };
  const aggiunta = (id: string, p: Partial<VoceAggiunta>) => onCambia({ ...ip, aggiunte: ip.aggiunte.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const idDi = (v: VoceSimulata) => v.chiave.replace(/[^a-z0-9]/gi, "-");

  return (
    <Collapsible open={aperto} onOpenChange={setAperto} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold">Dettaglio voce per voce</span>
          <span className="block text-xs text-muted-foreground">
            {voci.length} voci{ritoccate ? `, ${ritoccate} corrette a mano` : ""}: diventano il piano economico dell'operazione.
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aperto && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-4 py-3">
        {voci.map((v) => {
          const a = v.aggiunta ? ip.aggiunte.find((x) => `aggiunta:${x.id}` === v.chiave) : null;
          return (
            <div key={v.chiave} className="grid items-end gap-2 md:grid-cols-[minmax(12rem,2fr)_minmax(7rem,1fr)_minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_auto]">
              {a ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="Descrizione" placeholder="Descrizione" value={a.descrizione} maxLength={300} className="h-9 text-sm"
                    onChange={(e) => aggiunta(a.id, { descrizione: e.target.value })} />
                  <Select value={`${a.tipo}:${a.categoria}`} onValueChange={(s) => { const [tipo, categoria] = s.split(":"); aggiunta(a.id, { tipo: tipo as VoceAggiunta["tipo"], categoria: categoria as CategoriaPiano }); }}>
                    <SelectTrigger aria-label="Categoria" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["costo", "ricavo"] as const).flatMap((tipo) => categorieDelTipo(tipo).map((c) => (
                        <SelectItem key={`${tipo}:${c.id}`} value={`${tipo}:${c.id}`}>{tipo === "ricavo" ? `Ricavo · ${c.nome}` : c.nome}</SelectItem>
                      )))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium">
                    {v.descrizione}
                    {v.tipo === "ricavo" && <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">ricavo</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.regola}{v.ritoccata && ` Calcolata: ${euro(v.calcolato.importo)}.`}
                  </p>
                </div>
              )}
              <CampoNumero id={`dv-imp-${idDi(v)}`} etichetta="Importo" unita="€" valore={a ? a.importo : v.importo}
                onCambia={(n) => (a ? aggiunta(a.id, { importo: n ?? 0 }) : ritocca(v, "importo", n ?? 0))} />
              <CampoNumero id={`dv-da-${idDi(v)}`} etichetta="Dal mese n." intero valore={a ? a.dopoMesi : v.dopoMesi}
                aiuto={nomeMese(aggiungiMesi(ip.inizio, a ? a.dopoMesi : v.dopoMesi))}
                onCambia={(n) => (a ? aggiunta(a.id, { dopoMesi: n ?? 0 }) : ritocca(v, "dopoMesi", n ?? 0))} />
              <CampoNumero id={`dv-mesi-${idDi(v)}`} etichetta="Per mesi" intero valore={a ? a.durataMesi : v.durataMesi}
                onCambia={(n) => (a ? aggiunta(a.id, { durataMesi: Math.max(1, n ?? 1) }) : ritocca(v, "durataMesi", Math.max(1, n ?? 1)))} />
              {a ? (
                <Button type="button" variant="ghost" size="icon" aria-label="Togli la voce" className="mb-5"
                  onClick={() => onCambia({ ...ip, aggiunte: ip.aggiunte.filter((x) => x.id !== a.id) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label="Torna al valore calcolato" title="Torna al valore calcolato"
                  className="mb-5" disabled={!v.ritoccata} onClick={() => ripristina(v.chiave)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">Il mese n. si conta dall'acquisto (0 = il mese dell'acquisto). Gli interessi del debito non sono una voce: li calcolano le fonti.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onCambia({ ...ip, aggiunte: [...ip.aggiunte, nuovaVoce()] })}>
          <Plus className="mr-1 h-4 w-4" /> Aggiungi una voce
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
