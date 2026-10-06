/**
 * «Colore interno» e «Colore esterno» fra le variabili del prodotto, al posto della sola «Colore».
 *
 * Due tendine come tutte le altre variabili (SceltaVariante): le stesse fasce di prezzo del listino
 * («Colore Standard +10%») e, dentro, i colori veri. Il prezzo segue la fascia scelta; con due fasce diverse, se la
 * riga segue davvero la più cara, lo dice una riga sotto. Niente casella «diverso dentro e fuori»: la scelta è questa.
 *
 * In fondo a ognuna c'è «Altro colore (scrivi)…»: la tendina diventa una casella di testo nello stesso posto, per un
 * colore che nel listino non c'è (un RAL particolare). Il testo resta su quel lato e tiene la fascia scelta per il
 * prezzo: scrivere non cambia mai prezzo né variante. Una freccia riporta alla tendina del listino. È ancora un
 * Select, non un Popover con ricerca: dentro un Dialog il Portal di quello non risponde.
 *
 * Sono due celle da mettere nella griglia delle variabili, una dopo l'altra (un frammento, non un riquadro); la riga
 * che spiega il prezzo sta sotto l'esterno, così non apre una riga di griglia vuota a metà.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AxisValue } from "@/types/articleFamily";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { suffissoMaggiorazione } from "@/lib/listino/maggiorazione";
import { LATI_COLORE, fasceDeiLati, testiColori, type ColoriDentroFuori, type LatoColore } from "@/lib/serramenti/coloriDentroFuori";
import { SceltaVariante } from "./SceltaVariante";

interface Props {
  asse: { obbligatorio: boolean; values: AxisValue[] };
  colori: ColoriDentroFuori;
  /** Una scelta dall'elenco del listino: è il solo gesto che può cambiare la fascia del prezzo. */
  onChange: (lato: LatoColore, valueId: string, voce: string | null) => void;
  /** Il colore scritto nella casella «Altro colore»: resta su quel lato, non cambia mai fascia né prezzo. */
  onScrivi: (lato: LatoColore, testo: string) => void;
  /** Il lato scritto torna a un colore dell'elenco: quello che decide il prezzo, senza cambiarlo. */
  onElenco: (lato: LatoColore) => void;
  /** La fascia che il prezzo segue davvero (la scelta «Colore» della riga). */
  guidaId?: string | null;
  /** La fascia del lato più caro adesso: la riga dice «segue il più caro» solo se coincide con `guidaId`. */
  piuCaraId?: string | null;
  /** Il listino scrive le etichette da 11px, la riga di un preventivo da 10px con le tendine bianche. */
  formato: "listino" | "riga";
  /** Scrive «· standard» accanto al valore di serie (la riga lo fa, il listino no). */
  mostraStandard?: boolean;
}

const FORMATO = {
  listino: { etichetta: "text-[11px]", tendina: "h-9 text-xs" },
  riga: { etichetta: "text-[10px]", tendina: "h-8 bg-white text-xs" },
} as const;

const ETICHETTA_ALTRO = "Altro colore (scrivi)…";

const conSuffisso = (v: AxisValue) => `${v.label}${suffissoMaggiorazione(v.maggiorazione_tipo, v.maggiorazione_valore)}`;

export function SceltaColoriDentroFuori({ asse, colori, onChange, onScrivi, onElenco, guidaId, piuCaraId, formato, mostraStandard }: Props) {
  const stile = FORMATO[formato];
  // Un lato è «in scrittura» se lo si è aperto adesso o se il colore della riga non è nel listino.
  const [aperti, setAperti] = useState<Record<LatoColore, boolean>>({ interno: false, esterno: false });
  const [daFocalizzare, setDaFocalizzare] = useState<LatoColore | null>(null);
  const inScrittura = (lato: LatoColore) => aperti[lato] || !!colori[lato].scritto;
  const testi = testiColori(asse, colori);
  const imposta = (lato: LatoColore, valore: boolean) => {
    setAperti((prima) => ({ ...prima, [lato]: valore }));
    if (!valore) setDaFocalizzare((prima) => (prima === lato ? null : prima));
  };

  const apri = (lato: LatoColore) => {
    imposta(lato, true);
    setDaFocalizzare(lato);
  };
  // Il lato torna alla tendina. Solo se il testo era scritto davvero la riga cambia: altrimenti non c'è niente da togliere.
  const torna = (lato: LatoColore) => {
    imposta(lato, false);
    if (colori[lato].scritto) onElenco(lato);
  };
  const conferma = (lato: LatoColore, testo: string) => {
    const scritto = testo.trim();
    if (!scritto) return torna(lato);
    if (scritto === (testi[lato] ?? "").trim()) {
      if (!colori[lato].scritto) imposta(lato, false);
      return;
    }
    onScrivi(lato, scritto);
  };

  const fasce = fasceDeiLati(asse, colori);
  const costaDiverso = !!fasce && suffissoMaggiorazione(fasce.interno.maggiorazione_tipo, fasce.interno.maggiorazione_valore) !== suffissoMaggiorazione(fasce.esterno.maggiorazione_tipo, fasce.esterno.maggiorazione_valore);
  const fasciaPrezzo = guidaId ? asse.values.find((v) => v.id === guidaId) : undefined;
  // La nota dice solo il vero: «segue il più caro» se la fascia della riga è davvero quella del lato più caro.
  const scrivendo = LATI_COLORE.some(inScrittura);
  const nota = !fasciaPrezzo
    ? null
    : scrivendo
      ? `Colore scritto: il prezzo resta quello di ${conSuffisso(fasciaPrezzo)}.`
      : costaDiverso && guidaId === piuCaraId
        ? `Il prezzo segue il colore più caro: ${conSuffisso(fasciaPrezzo)}.`
        : null;

  return (
    <>
      {LATI_COLORE.map((lato) => {
        const scelta = colori[lato];
        const mancante = asse.obbligatorio && !scelta.valueId && !scelta.scritto;
        const nome = `Colore ${lato}`;
        return (
          <div key={lato} className="space-y-1">
            <Label className={cn("flex items-center gap-1", stile.etichetta, mancante ? "font-semibold text-rose-700" : "text-slate-700")}>
              {nome}
              {asse.obbligatorio && <span className="text-rose-500">*</span>}
            </Label>
            {inScrittura(lato) ? (
              <CasellaColore
                nome={nome}
                testo={testi[lato] ?? ""}
                classe={stile.tendina}
                focalizza={daFocalizzare === lato}
                onConferma={(testo) => conferma(lato, testo)}
                onElenco={() => torna(lato)}
              />
            ) : (
              <SceltaVariante
                values={asse.values}
                valueId={scelta.valueId}
                scelta={scelta.voce}
                onChange={(valueId, voce) => onChange(lato, valueId, voce)}
                altro={{ etichetta: ETICHETTA_ALTRO, onScegli: () => apri(lato) }}
                placeholder={mancante ? "Da scegliere…" : "Seleziona…"}
                mostraStandard={mostraStandard}
                aria-label={nome}
                className={cn(stile.tendina, mancante && "border-rose-300")}
              />
            )}
            {lato === "esterno" && nota && <p className="pt-0.5 text-[10px] leading-tight text-muted-foreground">{nota}</p>}
          </div>
        );
      })}
    </>
  );
}

/**
 * La casella di testo che prende il posto della tendina. Il testo si conferma uscendo dalla casella (o con Invio): una
 * scrittura sola, non una a ogni lettera. Svuotata, o confermata uguale a com'era, non scrive niente.
 */
function CasellaColore({
  nome, testo, classe, focalizza, onConferma, onElenco,
}: {
  nome: string;
  testo: string;
  classe: string;
  focalizza: boolean;
  onConferma: (testo: string) => void;
  onElenco: () => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [bozza, setBozza] = useState(testo);
  // Se il colore cambia da fuori (un'altra scelta, un ricalcolo) la casella lo segue: senza rimontarla, che farebbe
  // perdere il cursore a chi sta scrivendo altrove.
  const [testoVisto, setTestoVisto] = useState(testo);
  if (testo !== testoVisto) {
    setTestoVisto(testo);
    setBozza(testo);
  }
  useEffect(() => {
    if (!focalizza) return;
    // Un attimo dopo: la tendina che si chiude riporta il cursore sul suo bottone, che qui non c'è più.
    const attesa = setTimeout(() => {
      campo.current?.focus();
      campo.current?.select();
    }, 0);
    return () => clearTimeout(attesa);
  }, [focalizza]);

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={campo}
        value={bozza}
        onChange={(e) => setBozza(e.target.value)}
        onBlur={() => onConferma(bozza)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={`${nome} scritto a mano`}
        placeholder="Scrivi il colore, es. RAL 7016"
        className={cn("min-w-0 flex-1", classe)}
      />
      <button
        type="button"
        // Il clic non toglie il cursore alla casella: il testo non si scrive per poi essere tolto.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onElenco}
        aria-label={`${nome}: scegli dall'elenco`}
        title="Scegli dall'elenco del listino"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-white text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
