import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { calcolaCostoLavorazione, MODALITA_COSTO_LABEL, numeroCosto, type CostoLavorazione, type ModalitaCostoLavorazione } from "@/lib/tariffe/costoLavorazione";

export interface DipendenteCostoLavorazione { id: string; first_name: string; last_name: string; costo_orario: number | null }
interface Props {
  value: CostoLavorazione;
  onChange: (value: CostoLavorazione) => void;
  costoManuale: string;
  onCostoManuale: (value: string) => void;
  unita: string;
  dipendenti?: DipendenteCostoLavorazione[];
  erroreDipendenti?: boolean;
  costoModificato?: boolean;
}

export function CostoLavorazioneEditor({ value, onChange, costoManuale, onCostoManuale, unita, dipendenti = [], erroreDipendenti, costoModificato }: Props) {
  const calcolo = calcolaCostoLavorazione(value, numeroCosto(costoManuale));
  const aggiornaRisorsa = (index: number, patch: Partial<CostoLavorazione["risorse"][number]>) => onChange({
    ...value, risorse: value.risorse.map((r, i) => i === index ? { ...r, ...patch } : r),
  });
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4" aria-label="Calcolo del costo della lavorazione">
      <div>
        <h3 className="font-semibold">Come esegui il lavoro?</h3>
        <p className="text-xs text-muted-foreground">Calcola il costo aziendale per <strong>1 {unita}</strong>. Il prezzo al cliente si imposta separatamente.</p>
      </div>
      {costoModificato && <p role="status" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Il costo è stato modificato da un'altra funzione: manteniamo il valore attuale come costo diretto. Puoi riapplicare uno dei calcoli salvati.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Metodo di costo">
        {(["manuale", "interna", "subappalto"] as ModalitaCostoLavorazione[]).map(m => (
          <Button key={m} type="button" variant={value.modalita === m ? "default" : "outline"} aria-pressed={value.modalita === m} onClick={() => onChange({ ...value, modalita: m })}>
            {MODALITA_COSTO_LABEL[m]}
          </Button>
        ))}
      </div>
      {value.modalita === "manuale" && <label className="block space-y-1 text-sm">
        <span>Costo diretto (€ per {unita})</span>
        <Input aria-label="Costo diretto" type="number" min="0" step="0.01" value={costoManuale} onChange={e => onCostoManuale(e.target.value)} />
        <span className="block text-xs text-muted-foreground">Conserva il costo già presente oppure inserisci un importo diretto. Non lo consideriamo automaticamente costo di un dipendente.</span>
      </label>}
      <div className="grid gap-3">
        <div className={`space-y-3 rounded-lg border bg-background p-3 ${value.modalita === "interna" ? "border-primary" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Squadra interna</h4>
            <span className="text-sm font-semibold">{calcolo.interno == null ? "Da calcolare" : `${formatCurrency(calcolo.interno)} / ${unita}`}</span>
          </div>
          <p className="text-xs text-muted-foreground">Ore per persona × operatori × costo orario aziendale, per 1 {unita}. Usa il costo aziendale, non la paga netta. Per una voce a corpo inserisci le ore dell'intero lavoro; per m² le ore necessarie a un solo m².</p>
          {erroreDipendenti && <p role="status" className="text-xs text-amber-700">Anagrafica dipendenti non disponibile. Puoi compilare manualmente operatore e costo orario.</p>}
          {value.risorse.map((r, index) => (
            <div key={r.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Operatore / qualifica {index + 1}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Rimuovi operatore ${index + 1}`} onClick={() => onChange({ ...value, risorse: value.risorse.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {dipendenti.length > 0 && <label className="block text-xs">
                Copia il costo dall'anagrafica (facoltativo)
                <select aria-label={`Dipendente per operatore ${index + 1}`} value="" className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm" onChange={e => {
                  const d = dipendenti.find(d => d.id === e.target.value);
                  if (d) aggiornaRisorsa(index, { nome: `${d.first_name} ${d.last_name}`.trim(), dipendente_id: d.id, operatori: 1, costo_orario: d.costo_orario });
                }}>
                  <option value="">Scegli dipendente…</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} · {d.costo_orario == null ? "costo da impostare" : `${formatCurrency(d.costo_orario)}/h`}</option>)}
                </select>
              </label>}
              <label className="block space-y-1 text-xs">Operatore o qualifica
                <Input aria-label={`Nome operatore ${index + 1}`} value={r.nome} placeholder="Es. operaio specializzato" onChange={e => aggiornaRisorsa(index, { nome: e.target.value, dipendente_id: undefined })} />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="space-y-1 text-xs">N. operatori
                  <Input aria-label={`Numero operatori ${index + 1}`} type="number" min="1" step="1" value={r.operatori ?? ""} onChange={e => aggiornaRisorsa(index, { operatori: numeroCosto(e.target.value) })} />
                </label>
                <label className="space-y-1 text-xs">Ore per persona / {unita}
                  <Input aria-label={`Ore per operatore ${index + 1}`} type="number" min="0" step="0.01" value={r.ore ?? ""} onChange={e => aggiornaRisorsa(index, { ore: numeroCosto(e.target.value) })} />
                </label>
                <label className="space-y-1 text-xs">Costo aziendale €/h
                  <Input aria-label={`Costo orario operatore ${index + 1}`} type="number" min="0" step="0.01" value={r.costo_orario ?? ""} onChange={e => aggiornaRisorsa(index, { costo_orario: numeroCosto(e.target.value), dipendente_id: undefined })} />
                </label>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, risorse: [...value.risorse, { id: crypto.randomUUID(), nome: "", operatori: 1, ore: null, costo_orario: null }] })}><Plus className="mr-1 h-4 w-4" />Aggiungi operatore / qualifica</Button>
          <label className="block space-y-1 text-xs">Altri costi interni (€ per {unita}, facoltativi)
            <Input aria-label="Altri costi interni" type="number" min="0" step="0.01" value={value.altri_costi_interni ?? ""} onChange={e => onChange({ ...value, altri_costi_interni: numeroCosto(e.target.value) })} />
          </label>
          <p className="text-xs text-muted-foreground">Il costo orario copiato è una fotografia del valore corrente: non cambia automaticamente quando aggiorni il dipendente. Non conteggiare qui materiali o servizi già inseriti in altre voci.</p>
        </div>
        <div className={`space-y-2 rounded-lg border bg-background p-3 ${value.modalita === "subappalto" ? "border-primary" : ""}`}>
          <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><h4>Subappalto</h4><span>{calcolo.subappalto == null ? "Da impostare" : `${formatCurrency(calcolo.subappalto)} / ${unita}`}</span></div>
          <label className="block space-y-1 text-xs">Importo concordato col subappaltatore (€ per {unita})
            <Input aria-label="Costo subappalto" type="number" min="0" step="0.01" value={value.subappalto ?? ""} onChange={e => onChange({ ...value, subappalto: numeroCosto(e.target.value) })} />
          </label>
          <p className="text-xs text-muted-foreground">Non si somma al costo della squadra interna: viene usata solo la modalità selezionata. Associa una squadra nel campo “Listino di” se questa voce è riservata a quel subappaltatore.</p>
        </div>
      </div>
      <div className="rounded-lg bg-primary/5 p-3 text-sm" role="status">
        <span>Costo usato per il margine: <strong>{calcolo.applicato == null ? "Completa i dati" : `${formatCurrency(calcolo.applicato)} / ${unita}`}</strong> · {MODALITA_COSTO_LABEL[value.modalita]}</span>
        {value.modalita === "interna" && calcolo.oreUomo != null && <p className="mt-1 text-xs text-muted-foreground">Impegno interno: {calcolo.oreUomo.toLocaleString("it-IT")} ore-uomo per {unita}.</p>}
      </div>
    </section>
  );
}
