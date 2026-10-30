import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tecnicaPosVuota } from "../../../../supabase/functions/_shared/posTecnica";
import type { PosContenuto } from "../../../../supabase/functions/_shared/posModello";
import type { Modifica } from "./PosSezioni";

interface Props {
  d: PosContenuto;
  ro: boolean;
  modifica: Modifica;
}

/** Ogni passo attiva un controllo in più su tutte le lavorazioni: i testi già scritti restano, il riesame va rifatto prima di approvare. */
function passi(d: PosContenuto) {
  const riesamina = (x: PosContenuto) => { for (const l of x.lavorazioni) if (l.tecnica) l.tecnica.riesaminata = false; };
  return [
    { id: "tecnica", attiva: d.versione_tecnica === 1, disponibile: true, nome: "Attiva schede tecniche",
      titolo: "Dettaglio tecnico di ogni lavorazione", testo: "Organizzazione, rischi specifici e attrezzature, da riesaminare prima dell’approvazione.",
      attiva_: (x: PosContenuto) => { x.versione_tecnica = 1; for (const l of x.lavorazioni) { l.tecnica ||= tecnicaPosVuota(); l.tecnica.riesaminata = false; } } },
    { id: "fonti", attiva: d.versione_fonti_tecniche === 1, disponibile: d.versione_tecnica === 1, nome: "Attiva collegamenti alle fonti tecniche",
      titolo: "Documenti tecnici di rischi e attrezzature", testo: "Collega a ogni rischio e attrezzatura i documenti da cui nasce la valutazione.",
      attiva_: (x: PosContenuto) => { x.versione_fonti_tecniche = 1; riesamina(x); } },
    { id: "mezzi", attiva: d.versione_mezzi === 1, disponibile: d.versione_tecnica === 1, nome: "Attiva identità e impiego attrezzature",
      titolo: "Attrezzature della commessa", testo: "Collega le attrezzature a quelle assegnate alla commessa, con periodo e quantità d’uso da confermare.",
      attiva_: (x: PosContenuto) => { x.versione_mezzi = 1; riesamina(x); } },
    { id: "documenti_mezzi", attiva: d.versione_documenti_mezzi === 1, disponibile: d.versione_mezzi === 1, nome: "Attiva documenti e controlli delle attrezzature",
      titolo: "Documenti e controlli delle macchine", testo: "Collega gli originali tecnici di ogni macchina e riesamina manutenzioni e segnalazioni.",
      attiva_: (x: PosContenuto) => { x.versione_documenti_mezzi = 1; riesamina(x); } },
    { id: "requisiti", attiva: d.versione_requisiti_addetti === 1, disponibile: true, nome: "Attiva requisiti nominativi per lavorazione",
      titolo: "Attestati dei lavoratori", testo: "Collega a ogni lavorazione i riscontri nominativi della tua impresa (attestati, idoneità) e conserva gli originali pertinenti. Richiede il riesame prima dell’approvazione.",
      attiva_: (x: PosContenuto) => { x.versione_requisiti_addetti = 1; x.versione_controlli = 2; } },
  ];
}

/**
 * Le funzioni facoltative delle lavorazioni, in un riquadro solo e chiuso: prima erano fino a cinque avvisi uno sopra l’altro in
 * cima alla sezione, con frasi lunghe, e spingevano il lavoro vero fuori dallo schermo.
 */
export function FunzioniAvanzatePos({ d, ro, modifica }: Props) {
  const [aperto, setAperto] = useState(false);
  if (ro) return null;
  const tutti = passi(d);
  const daAttivare = tutti.filter((p) => !p.attiva && p.disponibile);
  if (!daAttivare.length) return null;
  const attive = tutti.filter((p) => p.attiva).length;
  return (
    <div className="rounded-lg border bg-slate-50/70 text-sm">
      <button type="button" onClick={() => setAperto((a) => !a)} aria-expanded={aperto} aria-controls="pos-funzioni-avanzate"
        className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="min-w-0"><span className="font-medium">Funzioni avanzate</span> <span className="text-xs text-muted-foreground">facoltative · {attive} di {tutti.length} attive</span></span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !aperto && "-rotate-90")} aria-hidden="true" />
      </button>
      <ul id="pos-funzioni-avanzate" hidden={!aperto} className="space-y-2 border-t p-3">
        {daAttivare.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-medium">{p.titolo}</p><p className="text-xs text-muted-foreground">{p.testo}</p></div>
            <Button type="button" size="sm" variant="outline" className="tap-compact shrink-0" aria-label={p.nome} onClick={() => modifica(p.attiva_)}>Attiva</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
