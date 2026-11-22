import { useState } from "react";
import type { Coordinate } from "../../../../shared/mappa-operativa/calcoli";
import PianificaIntervento from "./PianificaIntervento";
import PosizioneOperativa from "./PosizioneOperativa";
import type { PropostaMappa, TipoCandidato } from "./servizio";

interface Props {
  company: string;
  giorno: string;
  inizio: string;
  fine: string;
  indirizzo: string;
  punto: Coordinate | null;
  escludi?: string;
  lavori: boolean;
  onChiudi: () => void;
  puoProporre?: (tipo: TipoCandidato, id: string) => boolean;
  onProposta?: (proposta: PropostaMappa) => void;
}

export default function ViciniAppuntamento({ company, giorno, inizio, fine, indirizzo, punto, escludi, lavori, onChiudi, puoProporre, onProposta }: Props) {
  const [bozza, setBozza] = useState<Coordinate | null>(null);
  const [confermato, setConfermato] = useState(punto);
  return confermato
    ? <PianificaIntervento company={company} ambito="vendite" giorno={giorno} nomeDestinazione={indirizzo || "Posizione confermata"}
        meta={confermato} escludi={escludi} vendite lavori={lavori} partenza={inizio} fineIntervento={fine} onChiudi={onChiudi} puoProporre={puoProporre} onProposta={onProposta} />
    : <PosizioneOperativa company={company} ambito="vendite" indirizzoIniziale={indirizzo} punto={bozza} onPunto={setBozza}
        onSalva={setConfermato} onChiudi={onChiudi} />;
}
