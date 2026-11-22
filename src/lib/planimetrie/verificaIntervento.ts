import { origineMisura, scalaModelloDaVerificare, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { esitiInquadramento, fonteEfficace, type DatiUrbanistici, type EsitoRegolaUrbanistica, type InterventoUrbanistico } from "../../../shared/planimetrie/urbanistica.ts";
import { IDROGEO, LINEE_GUIDA_MIT, PRG_ROMA, PTPR_LAZIO, riferimentoCatastale, ROMA_ISTAT, SITAP, TESTO_UNICO_EDILIZIA, VINCOLI_LOMBARDIA } from "./riferimentiUrbanistici";
import { unitaDellEdificio } from "./unita";

type Riferimento = { nome: string; url: string };
type Voce = { titolo: string; stato: "Riscontro" | "Dato mancante" | "Da verificare" | "Criticità"; dettaglio: string; fonte?: Riferimento };

export const INTERVENTO_INIZIALE: InterventoUrbanistico = { tipo: "frazionamento", unitaPreviste: 2 };
export const NOMI_PIANO = { interrato: "Interrato", seminterrato: "Seminterrato", terra: "Piano terra", superiore: "Piano superiore", sottotetto: "Sottotetto" } as const;
const testoUnico = (nome: string): Riferimento => ({ nome: `DPR 380/2001 · ${nome}`, url: TESTO_UNICO_EDILIZIA });
const aperta = (titolo: string, dettaglio: string, fonte?: Riferimento): Voce => ({ titolo, dettaglio, fonte, stato: "Da verificare" });

export function quadroIntervento(doc: Planimetria, variante: string, d: DatiUrbanistici, esiti: EsitoRegolaUrbanistica[], oggi: string) {
  const intervento = d.intervento ?? INTERVENTO_INIZIALE;
  const frazionamento = intervento.tipo === "frazionamento";
  const inquadramento = esitiInquadramento(d, oggi);
  const tavola = d.fonti.find(f => f.id === d.fonteZona && f.tipo === "tavola" && !f.ruoloTavola);
  const normeDocumentate = d.fonti.some(f => f.tipo === "norme" && fonteEfficace(f, oggi));
  const zonaDocumentata = inquadramento.zonaConfermata && fonteEfficace(tavola, oggi) && normeDocumentate && !d.attiDiscordanti;
  const ambiti = d.cartografia?.ambiti ?? [];
  const zone = ambiti.filter(a => a.categoria !== "tutela");
  const tutele = ambiti.filter(a => a.categoria === "tutela");
  const riscontroCatastale = d.originePosizione === "catasto" && d.particellaIndividuata;
  const verifiche: Voce[] = [{
    titolo: "Identificazione dell’immobile",
    stato: d.posizione?.confermata ? (d.originePosizione === "catasto" && !riscontroCatastale ? "Da verificare" : "Riscontro") : "Dato mancante",
    dettaglio: !d.posizione?.confermata ? "Localizza l’immobile e conferma il punto sulla mappa."
      : riscontroCatastale ? `Foglio ${riscontroCatastale.foglio} · Particella ${riscontroCatastale.numero}${riscontroCatastale.sezione ? ` · Sezione ${riscontroCatastale.sezione}` : ""} dalla cartografia regionale.`
      : d.originePosizione === "catasto" ? "Punto confermato sulla mappa. Riscontra foglio, particella e posizione sulla cartografia catastale."
      : [d.indirizzo, d.comune].filter(Boolean).join(" · ") || "Punto confermato sulla mappa.",
    ...(d.originePosizione === "catasto" ? { fonte: riscontroCatastale
      ? { nome: "Cartografia catastale · Regione Lombardia", url: riscontroCatastale.fonte }
      : riferimentoCatastale(d.codiceIstat) } : {}),
  }, {
    titolo: "Zona e atti applicabili",
    stato: zonaDocumentata ? "Riscontro" : "Da verificare",
    dettaglio: zonaDocumentata ? `${d.zona} · ${d.riferimentoZona}`
      : d.attiDiscordanti ? "Confronta gli atti o gli aggiornamenti discordanti."
      : zone.length ? "Confronta gli ambiti restituiti con la tavola ufficiale della particella. Registra tavola, riferimento e data di efficacia."
      : "Individua la zona sulla tavola comunale e registra le norme e gli atti efficaci.",
    ...(tavola?.url || d.codiceIstat === ROMA_ISTAT ? { fonte: { nome: tavola?.titolo ?? "PRG e NTA · Roma Capitale", url: tavola?.url ?? PRG_ROMA } } : {}),
  }, aperta("Stato legittimo e uso autorizzato", "Confronta il rilievo con i titoli edilizi e le tavole assentite. Registra gli estremi degli atti e le eventuali difformità.", testoUnico("art. 9-bis"))];

  const unita = variante && doc.livelli.some(l => l.proposte.some(p => p.id === variante))
    ? unitaDellEdificio(doc, `progetto:${variante}`) : [];
  const contorniStimati = doc.livelli.some(l => scalaModelloDaVerificare(l) ||
    (l.proposte.find(p => p.id === variante)?.locali ?? l.fatto.locali).some(a => !!a.unita?.trim() && origineMisura(a, "contorno") === "stimata"));
  if (frazionamento) {
    const numero = intervento.unitaPreviste ?? 2;
    verifiche.push({
      titolo: "Unità nella variante",
      stato: !unita.length ? "Dato mancante" : unita.length !== numero || contorniStimati ? "Da verificare" : "Riscontro",
      dettaglio: !unita.length ? `Assegna i locali alle ${numero} unità previste nella variante.`
        : unita.length !== numero ? `La variante contiene ${unita.length} unità. L’obiettivo impostato è ${numero}.`
        : contorniStimati ? `${numero} unità disegnate. Controlla la scala e conferma le misure prima di applicare le soglie.`
        : `${numero} unità assegnate. Confronta le superfici e le altezze con i requisiti applicabili.`,
    }, aperta("Inquadramento del frazionamento",
      intervento.volume === "variato" || intervento.usoFrazionamento === "variato"
        ? "La variante prevede una modifica della volumetria o della destinazione. Inquadra l’intervento completo e il relativo titolo edilizio."
        : intervento.volume === "invariato" && intervento.usoFrazionamento === "invariato"
          ? "Volumetria e uso dichiarati invariati. Verifica con il tecnico la manutenzione straordinaria, le opere previste e il titolo edilizio."
          : "Per valutare la manutenzione straordinaria, conferma la volumetria complessiva e la destinazione originaria.",
      testoUnico("art. 3")));
  } else {
    const { usoAttuale, usoPrevisto, piano, opere } = intervento;
    verifiche.push({
      titolo: "Cambio d’uso proposto",
      stato: usoAttuale?.trim() && usoPrevisto?.trim() && piano && opere ? "Da verificare" : "Dato mancante",
      dettaglio: usoAttuale?.trim() && usoPrevisto?.trim() && piano && opere
        ? `${usoAttuale} → ${usoPrevisto} · ${NOMI_PIANO[piano]} · ${opere === "con_opere" ? "Con opere" : "Senza opere"}. Verifica categoria funzionale, zona, condizioni comunali e disciplina regionale.`
        : "Indica uso attuale, uso previsto, piano e presenza di opere per circoscrivere la verifica.",
      fonte: testoUnico("art. 23-ter"),
    });
    if (piano && ["terra", "seminterrato", "interrato"].includes(piano)) verifiche.push(aperta("Disciplina del piano",
      "Verifica la disciplina regionale e le condizioni locali per il piano indicato.", { nome: "MIT · Linee guida sul cambio d’uso", url: LINEE_GUIDA_MIT }));
  }
  if (!esiti.some(e => {
    const r = d.regole.find(r => r.id === e.regolaId);
    return r?.metrica === "superficie" || r?.metrica === "altezza";
  })) verifiche.push(aperta("Superfici e altezze", "Registra i requisiti applicabili con articolo, pagina, criterio di misura e soglia. Il confronto si aggiorna con i dati della variante."));
  verifiche.push(
    aperta("Finestre, aerazione e accessi", "Verifica rapporti aeroilluminanti, accessi autonomi o comuni e dotazioni richieste per le unità e l’uso previsto."),
    aperta("Vincoli paesaggistici e beni tutelati", tutele.length
      ? "Le tavole consultate segnalano tutele nell’intorno. Controlla perimetri, provvedimenti e condizioni applicabili alla particella."
      : "Consulta i perimetri ufficiali e i provvedimenti applicabili, anche dove le tavole interrogate non danno riscontri.",
    d.codiceIstat === ROMA_ISTAT ? { nome: "Regione Lazio · PTPR, Tavole B", url: PTPR_LAZIO }
      : d.regione === "Lombardia" ? { nome: "Regione Lombardia · Vincoli e tutele", url: VINCOLI_LOMBARDIA } : { nome: "Ministero della Cultura · SITAP", url: SITAP }),
    aperta("Pericolosità idraulica e da frana", "Controlla pericolosità e prescrizioni di PAI e PGRA applicabili al punto e alla particella.", { nome: "ISPRA · IdroGEO", url: IDROGEO }),
    aperta("Titolo edilizio e adempimenti", "Definisci con il tecnico il procedimento, eventuali pareri e gli elaborati da presentare allo Sportello unico per l’edilizia."),
  );
  const criticita = esiti.filter(e => e.stato === "Criticità rilevata");
  return { verifiche, unita: frazionamento ? unita : [], criticita, contorniStimati };
}
