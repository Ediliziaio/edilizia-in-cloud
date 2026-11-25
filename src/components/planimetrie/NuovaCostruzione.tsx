/**
 * «Nuova costruzione» sulla scheda della planimetria (24/11/2026): dice al sistema che l'edificio
 * si fa da zero. Da lì studio della variante, previsione e computo metrico comprendono scavi,
 * fondazioni, strutture, solai, copertura, isolamenti, impianti ed esterni (nuovaCostruzione.ts).
 * Le scelte che la pianta non dice hanno un valore di partenza e si cambiano qui.
 */
import { useState } from "react";
import { Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { disegnoDaCostruire } from "@/lib/planimetrie/nuovaCostruzione";
import {
  COSTRUZIONE_PREDEFINITA, NOMI_FONDAZIONE, NOMI_MODO_PIANO, NOMI_RISCALDAMENTO, NOMI_SOLAIO, NOMI_STRUTTURA, costruzioneValida, modoPiano,
  type Costruzione, type ModoPiano,
} from "../../../shared/planimetrie/costruzione.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const SCELTE = [
  { chiave: "fondazione", etichetta: "Fondazioni", nomi: NOMI_FONDAZIONE },
  { chiave: "struttura", etichetta: "Struttura", nomi: NOMI_STRUTTURA },
  { chiave: "solaio", etichetta: "Solai", nomi: NOMI_SOLAIO },
  { chiave: "riscaldamento", etichetta: "Riscaldamento", nomi: NOMI_RISCALDAMENTO },
] as const;
const MISURE = [
  { chiave: "scavoCm", etichetta: "Scavo sotto il piano più basso (cm)", max: 1500 },
  { chiave: "cappottoCm", etichetta: "Cappotto (cm, 0 = intonaco esterno)", max: 40 },
  { chiave: "marciapiedeCm", etichetta: "Marciapiede intorno (cm, 0 = niente)", max: 500 },
] as const;

/** Ci sono piani disegnati che non hanno ancora una variante: il disegno è tutto «com'è oggi». */
const daPortareNelProgetto = (doc: Planimetria) => doc.livelli.some((l) => !l.proposte.length && (l.fatto.muri.length || l.fatto.locali.length));

export function NuovaCostruzione({ documento, planimetriaId, versione, solaLettura }: { documento: Planimetria; planimetriaId: string; versione: number; solaLettura: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [bozza, setBozza] = useState<Costruzione>(COSTRUZIONE_PREDEFINITA);
  const [portaNelProgetto, setPortaNelProgetto] = useState(true);
  const salva = useSalvaVersionePlanimetria();
  const attuale = documento.costruzione;
  const daPortare = daPortareNelProgetto(documento);

  const apri = () => { setBozza(attuale ?? COSTRUZIONE_PREDEFINITA); setPortaNelProgetto(true); setAperto(true); };
  const scrivi = async (nuovo: Planimetria, nota: string, messaggio: string) => {
    try {
      await salva.mutateAsync({ planimetriaId, versioneAttesa: versione, documento: nuovo, nota });
      toast.success(messaggio);
      setAperto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Non salvato: riprova.");
    }
  };
  const conferma = () => {
    if (!costruzioneValida(bozza)) return toast.error("Controlla le misure: devono essere numeri nei limiti indicati.");
    const base = !attuale && daPortare && portaNelProgetto ? disegnoDaCostruire(documento, bozza) : documento;
    void scrivi({ ...base, costruzione: bozza }, "Nuova costruzione: scelte dell'edificio",
      attuale ? "Scelte della costruzione aggiornate" : "Ora la pianta è una nuova costruzione: lo studio della variante comprende anche strutture e impianti");
  };
  const togli = () => {
    const { costruzione: _tolta, ...resto } = documento;
    void scrivi(resto as Planimetria, "Non più nuova costruzione", "La pianta torna una ristrutturazione");
  };

  return <section id="nuova-costruzione" aria-label="Nuova costruzione" className="scroll-mt-4 rounded-2xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" />{attuale ? "Costruzione e sopraelevazione" : "Tipo di intervento: ristrutturazione"}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {attuale
            ? "Il computo comprende scavi, fondazioni, strutture, solai, copertura, isolamenti, impianti ed esterni, ricavati dai piani."
            : "Se l'edificio si fa da zero, dillo qui: il computo aggiunge scavi, fondazioni, strutture, solai, copertura, impianti ed esterni."}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={apri} disabled={solaLettura}>{attuale ? "Cambia le scelte" : "Si costruisce o si sopraeleva"}</Button>
    </div>
    {attuale && <p className="mt-3 text-sm">
      {documento.livelli.some((l) => modoPiano(attuale, l.id) !== "nuovo") && <>{documento.livelli.map((l) => `${l.nome}: ${NOMI_MODO_PIANO[modoPiano(attuale, l.id)].toLowerCase()}`).join(" · ")}<br /></>}
      {NOMI_FONDAZIONE[attuale.fondazione]} · {NOMI_STRUTTURA[attuale.struttura]} · solai in {NOMI_SOLAIO[attuale.solaio].toLowerCase()} · {NOMI_RISCALDAMENTO[attuale.riscaldamento].toLowerCase()}
      {" · "}{attuale.cappottoCm ? `cappotto ${attuale.cappottoCm} cm` : "senza cappotto"}
    </p>}
    <Dialog open={aperto} onOpenChange={(v) => { if (!salva.isPending) setAperto(v); }}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova costruzione</DialogTitle>
          <DialogDescription>Le scelte che la pianta non dice. Partono da valori tipici: cambiale quando hai il progetto strutturale e quello degli impianti.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={salva.isPending} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-semibold">Cosa si fa su ogni piano</legend>
          <p className="text-xs text-muted-foreground">Per una sopraelevazione: i piani che ci sono già restano esistenti (da rifare dentro o da non toccare), quelli sopra si costruiscono. Il computo aggiunge consolidamento delle fondazioni, adeguamento sismico e rimozione della copertura.</p>
          {[...documento.livelli].sort((a, b) => b.quota - a.quota).map((l) => <label key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
            <span>{l.nome}</span>
            <UniformSelect aria-label={`Cosa si fa al ${l.nome}`} className="h-9 rounded-md border bg-background px-2" value={modoPiano(bozza, l.id)}
              onChange={(e) => setBozza({ ...bozza, piani: { ...bozza.piani, [l.id]: e.target.value as ModoPiano } })}>
              {Object.entries(NOMI_MODO_PIANO).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </UniformSelect>
          </label>)}
        </fieldset>
        <fieldset disabled={salva.isPending} className="grid gap-3 sm:grid-cols-2">
          {SCELTE.map((s) => <label key={s.chiave} className="text-sm font-medium">{s.etichetta}
            <UniformSelect className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={bozza[s.chiave]}
              onChange={(e) => setBozza({ ...bozza, [s.chiave]: e.target.value } as Costruzione)}>
              {Object.entries(s.nomi).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </UniformSelect>
          </label>)}
          {MISURE.map((m) => <label key={m.chiave} className="text-sm font-medium">{m.etichetta}
            <input type="number" inputMode="numeric" min={0} max={m.max} className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={bozza[m.chiave]} onChange={(e) => setBozza({ ...bozza, [m.chiave]: Number(e.target.value) })} />
          </label>)}
        </fieldset>
        {!attuale && daPortare && <label className="mt-2 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={portaNelProgetto} onChange={(e) => setPortaNelProgetto(e.target.checked)} />
          <span>Porto il disegno nella variante «Costruzione» secondo le scelte per piano: sui piani da costruire tutto è nuovo, su quelli da rifare dentro restano le pareti di perimetro e il resto è nuovo.</span>
        </label>}
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          {attuale ? <Button variant="ghost" onClick={togli} disabled={salva.isPending}>Non è una nuova costruzione</Button> : <span />}
          <Button onClick={conferma} disabled={salva.isPending} className="gap-2"><Save className="h-4 w-4" />{salva.isPending ? "Salvo…" : "Salva"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
