import { controllaPlanimetria } from "../../../shared/planimetrie/controllo.ts";
import { distanza, distanzaDalContorno, lunghezzaMuro } from "../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, funzionePareteDaVerificare, SANITARI_BAGNO, scalaModelloDaVerificare, type Muro, type Planimetria, type Punto, type StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { verificaPianta } from "../../../shared/planimetrie/verifiche.ts";
import { verificaConfermata, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { esodoDellaVariante, firmaRiscontroTecnico, RISCONTRI_TECNICI, STATI_ESODO } from "../../../shared/planimetrie/urbanistica.ts";
import { attraversamentiImpianto, eElementoElettrico, eElementoScarico, percorsiImpianti } from "../../../shared/planimetrie/impianti.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { controllaAccessiLocali, controllaAccessiPiano } from "./accessiPlanimetria";
import { puntoSullAsse } from "./verificaTavola";

const FONTI = {
  struttura: { nome: "NTC 2018 · costruzioni esistenti, cap. 8", url: "https://www.gazzettaufficiale.it/do/atto/serie_generale/caricaPdf?art.codiceRedazionale=18A00716&art.dataPubblicazioneGazzetta=2018-02-20&art.num=1&art.tiposerie=SG&cdimg=18A0071600100010110009&dgu=2018-02-20" },
  esodo: { nome: "Vigili del Fuoco · Codice, cap. S.4", url: "https://www.vigilfuoco.it/codice-di-prevenzione-incendi" },
  antincendio: { nome: "Vigili del Fuoco · DPR 151/2011, allegato I", url: "https://www.vigilfuoco.it/sites/default/files/2024-01/COORD_DPR_01_08_2011_n_151_e_DM_07_08_2012.pdf" },
  igiene: { nome: "Gazzetta Ufficiale · DM 5 luglio 1975", url: "https://www.gazzettaufficiale.it/eli/gu/1975/07/18/190/sg/pdf" },
  accessibilita: { nome: "Gazzetta Ufficiale · DM 236/1989", url: "https://www.gazzettaufficiale.it/eli/id/1989/06/23/089G0298/sg" },
  impianti: { nome: "Normattiva · impianti negli edifici, DM 37/2008", url: "https://www.normattiva.it/eli/id/2008/03/12/008G0060/CONSOLIDATED" },
  urbanistica: { nome: "Normattiva · Testo unico dell’edilizia", url: "https://www.normattiva.it/eli/id/2001/10/20/001G0429/CONSOLIDATED" },
};
type Fonte = (typeof FONTI)[keyof typeof FONTI];

export interface PosizioneSegnalazioneProgetto {
  livelloId: string;
  etichetta: string;
  locali?: string[];
  punti?: Punto[];
  tratto?: { da: Punto; a: Punto; tratteggiato?: boolean };
}

export interface CorrezioneSegnalazioneProgetto {
  tipo: "ripristina-apertura" | "mantieni-parete";
  id: string;
}

export type RiscontroImpianti = { criterio: "elettrico" | "scarichi"; livelloId: string };

export interface SegnalazioneProgetto {
  area: "Disegno" | "Struttura" | "Accessi" | "Antincendio" | "Igiene" | "Accessibilità" | "Impianti" | "Documenti";
  priorita: "problema" | "tecnico" | "dato";
  titolo: string;
  descrizione: string;
  verifica?: string;
  piano?: string;
  fonte?: Fonte;
  posizione?: PosizioneSegnalazioneProgetto;
  correzione?: CorrezioneSegnalazioneProgetto;
  riscontro?: RiscontroImpianti;
}

export interface DatiAntincendioProgetto {
  altezzaAntincendio?: number;
  autorimessaCoperta?: number;
}

const valore = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const eNumero = (n: number | undefined, minimo: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= minimo;
const stessaParete = (a: Muro, b: Muro) =>
  Math.abs(a.spessore - b.spessore) < .05 && Math.abs(a.altezza - b.altezza) < .05 &&
  (distanza(a.p1, b.p1) + distanza(a.p2, b.p2) < .1 || distanza(a.p1, b.p2) + distanza(a.p2, b.p1) < .1);

/** Riconosce un vano rimosso solo se il suo ripristino isolato ricollega l’unità nel modello. */
function ingressoDaRivedere(fatto: StatoPianta, stato: StatoPianta, sigla: string, alloggio: boolean, quotaPiano: number) {
  const attive = stato.aperture.filter(a => a.stato !== "da_demolire");
  const presenti = new Set(attive.map(a => a.id));
  const originali = new Map(fatto.aperture.filter(a => a.stato === "esistente").map(a => [a.id, a]));
  const alternative = new Map([...stato.aperture, ...originali.values()].map(a => [a.id, a]));
  const muri = new Map(stato.muri.filter(m => m.stato !== "da_demolire").map(m => [m.id, m]));
  const muriOriginali = new Map(fatto.muri.filter(m => m.stato === "esistente").map(m => [m.id, m]));
  let candidato: { id: string; da: Punto; a: Punto; ripristinabile: boolean } | undefined;
  for (const apertura of alternative.values()) {
    if (presenti.has(apertura.id) || apertura.tipo !== "porta" || apertura.sistema === "fisso") continue;
    const muro = muri.get(apertura.muroId);
    if (!muro || apertura.offset < 0 || apertura.offset + apertura.larghezza > lunghezzaMuro(muro) + .05) continue;
    if (attive.some(a => a.muroId === muro.id && a.offset < apertura.offset + apertura.larghezza && apertura.offset < a.offset + a.larghezza)) continue;
    const prova: StatoPianta = {
      ...stato,
      aperture: [...attive, { ...apertura, stato: "esistente" }],
    };
    const esito = controllaAccessiPiano(prova, alloggio, quotaPiano).ingressi.find(i => i.sigla === sigla);
    if (esito?.porta?.id !== apertura.id || esito.ambientiScollegati.length) continue;
    if (candidato) return undefined;
    const muroOriginale = muriOriginali.get(muro.id);
    candidato = {
      id: apertura.id,
      da: puntoSullAsse(muro, apertura.offset),
      a: puntoSullAsse(muro, apertura.offset + apertura.larghezza),
      ripristinabile: originali.has(apertura.id) && !!muroOriginale && muroOriginale.tipo === muro.tipo && stessaParete(muroOriginale, muro) &&
        distanza(muroOriginale.p1, muro.p1) < .05 && distanza(muroOriginale.p2, muro.p2) < .05,
    };
  }
  return candidato;
}

export function analizzaProgetto(documento: Planimetria, ambito: string, dati: DatiAntincendioProgetto = {}): SegnalazioneProgetto[] {
  const esiti: SegnalazioneProgetto[] = [];
  const piani = documento.livelli.map(livello => ({
    livello, stato: statoPerAmbito(documento, livello.id, ambito) ?? livello.fatto,
  }));
  const problemi = controllaPlanimetria(documento);
  for (const p of problemi) {
    const piano = piani.find(({ livello }) => livello.id === p.livelloId);
    if (piano && p.ambito !== (piano.stato === piano.livello.fatto ? "fatto" : ambito)) continue;
    esiti.push({
      area: "Disegno", priorita: p.gravita === "errore" ? "problema" : "dato", titolo: p.oggettoId ?? "Geometria",
      descrizione: p.messaggio, piano: piano?.livello.nome,
    });
  }
  if (problemi.some(p => p.codice === "forma_non_valida")) return esiti;

  for (const { livello, stato } of piani) {
    const piano = livello.nome;
    if (scalaModelloDaVerificare(livello)) esiti.push({
      area: "Disegno", priorita: "dato", titolo: "Scala da confermare", piano,
      descrizione: "Riscontra la scala del modello con una quota leggibile o misurata.",
    });
    const scaleDaRiscontrare = livello.fatto.testi.filter(t => t.id.startsWith(livello.id + "-scala-riscontro-"));
    if (scaleDaRiscontrare.length) esiti.push({
      area: "Accessi", priorita: "dato", titolo: "Scale da riscontrare", piano,
      descrizione: "La tavola mostra gradini. Servono quote, verso di salita e collegamento ai piani.",
      posizione: { livelloId: livello.id, etichetta: "Scale da riscontrare", punti: scaleDaRiscontrare.map(t => t.posizione) },
    });
    const funzioneIncerta = livello.fatto.muri.filter(m => m.stato === "esistente" && funzionePareteDaVerificare(m));
    if (funzioneIncerta.length) esiti.push({
      area: "Struttura", priorita: "dato", titolo: "Funzione delle pareti da riscontrare", piano,
      descrizione: funzioneIncerta.length === 1 ? "Una parete attende una classificazione." : `${funzioneIncerta.length} pareti attendono una classificazione.`,
      verifica: "Confronta gli elaborati strutturali e classifica le pareti da modificare.",
    });
    const portanti = livello.fatto.muri.filter(m => m.tipo === "portante" && m.stato !== "da_demolire");
    const pilastri = livello.fatto.elementi.filter(e => e.tipo === "pilastro" && e.stato !== "da_demolire");
    if (portanti.length || pilastri.length) esiti.push({
      area: "Struttura", priorita: "dato", titolo: "Elementi strutturali disegnati", piano, fonte: FONTI.struttura,
      descrizione: [
        portanti.length && `${portanti.length} ${portanti.length === 1 ? "parete indicata come portante" : "pareti indicate come portanti"}`,
        pilastri.length && `${pilastri.length} ${pilastri.length === 1 ? "pilastro disegnato" : "pilastri disegnati"}`,
      ].filter(Boolean).join(" e ") + ".",
      verifica: "Consulta le tavole strutturali e riscontra sul posto la funzione degli elementi prima di definire le demolizioni.",
    });

    if (stato !== livello.fatto) {
      const muri = new Map(stato.muri.map(m => [m.id, m]));
      for (const prima of livello.fatto.muri) {
        const dopo = muri.get(prima.id);
        if (prima.stato === "da_demolire" || (dopo && dopo.stato !== "da_demolire" && stessaParete(prima, dopo))) continue;
        const mantieni = prima.stato === "esistente" && prima.tipo === "portante" && dopo?.stato === "da_demolire" &&
          dopo.tipo === prima.tipo && stessaParete(prima, dopo);
        esiti.push({
          area: "Struttura", priorita: "tecnico", titolo: `Parete ${prima.id}`, piano, fonte: FONTI.struttura,
          descrizione: funzionePareteDaVerificare(prima) ? "La variante interessa una parete di cui va riscontrata la funzione."
            : prima.tipo === "portante" ? "La variante modifica o rimuove una parete classificata portante."
            : prima.tipo === "esterno" ? "La variante modifica o rimuove una parete perimetrale." : "La variante modifica o rimuove un elemento disegnato come tramezzo.",
          verifica: prima.tipo === "portante"
            ? "Mantieni la parete nella variante e sottoponi la modifica allo strutturista con rilievo e tavole strutturali."
            : "Prima di eseguire l’opera, riscontra la funzione della parete e le interferenze con struttura e impianti.",
          posizione: {
            livelloId: livello.id, etichetta: prima.tipo === "portante" ? "Parete portante" : "Parete interessata",
            tratto: { da: prima.p1, a: prima.p2, tratteggiato: !dopo || dopo.stato === "da_demolire" },
          },
          ...(mantieni && { correzione: { tipo: "mantieni-parete", id: prima.id } }),
        });
      }
      const esistenti = new Map(livello.fatto.aperture.map(a => [a.id, a]));
      for (const a of stato.aperture) {
        const precedente = esistenti.get(a.id);
        const muro = muri.get(a.muroId);
        const funzioneIncerta = muro && funzionePareteDaVerificare(muro);
        if (a.stato === "da_demolire" || !muro || (muro.tipo === "tramezzo" && !funzioneIncerta) ||
          (precedente && precedente.muroId === a.muroId && precedente.offset === a.offset &&
            precedente.larghezza === a.larghezza && precedente.altezza === a.altezza && precedente.davanzale === a.davanzale)) continue;
        esiti.push({
          area: "Struttura", priorita: "tecnico",
          titolo: funzioneIncerta ? `Vano ${a.id} su parete da riscontrare` : `Vano ${a.id} su parete ${muro.tipo}`, piano, fonte: FONTI.struttura,
          descrizione: "L’apertura è nuova oppure cambia posizione o dimensioni nella variante.",
          verifica: "Verifica parete, architrave e titolo edilizio con il progettista.",
          posizione: {
            livelloId: livello.id, etichetta: `Vano ${a.id}`,
            tratto: { da: puntoSullAsse(muro, a.offset), a: puntoSullAsse(muro, a.offset + a.larghezza) },
          },
        });
      }
      for (const prima of livello.fatto.elementi.filter(e => e.tipo === "pilastro" && e.stato !== "da_demolire")) {
        const dopo = stato.elementi.find(e => e.id === prima.id && e.tipo === "pilastro");
        if (dopo && dopo.stato !== "da_demolire" && distanza(prima.posizione, dopo.posizione) < .05 &&
          dopo.larghezza === prima.larghezza && dopo.profondita === prima.profondita && dopo.altezza === prima.altezza &&
          dopo.rotazione === prima.rotazione) continue;
        esiti.push({
          area: "Struttura", priorita: "tecnico", titolo: `Pilastro ${prima.etichetta || prima.id}`, piano, fonte: FONTI.struttura,
          descrizione: "Il pilastro è spostato, modificato o assente nella variante.",
          verifica: "Sottoponi la modifica allo strutturista prima di procedere.",
        });
      }
    }

    const alloggioSingolo = documento.ambitoDocumento === "alloggio" && documento.livelli.length === 1;
    const accessi = controllaAccessiPiano(stato, alloggioSingolo, livello.quota);
    for (const ingresso of accessi.ingressi) {
      if (ingresso.tipo !== "mancante" && !ingresso.ambientiScollegati.length) continue;
      const mancante = ingresso.tipo === "mancante";
      const gruppo = stato.locali.filter(l => eAmbienteInterno(l) &&
        (l.unita?.trim() === ingresso.sigla || (ingresso.sigla === "Alloggio" && alloggioSingolo && !l.unita?.trim())));
      const locali = gruppo.filter(l => mancante || ingresso.ambientiScollegati.includes(l.nome)).map(l => l.id);
      const varco = mancante && stato !== livello.fatto ? ingressoDaRivedere(livello.fatto, stato, ingresso.sigla, alloggioSingolo, livello.quota) : undefined;
      esiti.push({
        area: "Accessi", priorita: "problema", titolo: ingresso.sigla, piano, fonte: FONTI.esodo,
        descrizione: mancante ? "Nessun ingresso dall’esterno o da uno spazio comune riconosciuto nella pianta."
          : `Dal percorso disegnato non si raggiungono ${ingresso.ambientiScollegati.join(", ")}.`,
        verifica: varco
          ? `Rivedi il vano ${varco.id}. Nel modello il suo ripristino ricollega l’unità. Verifica luce netta e continuità del percorso verso il pianerottolo.`
          : "Controlla porte, disimpegni e continuità verso pianerottolo o uscita.",
        posizione: {
          livelloId: livello.id, etichetta: `${mancante ? "Ingresso" : "Percorso"} ${ingresso.sigla}`,
          locali, ...(varco && { tratto: { da: varco.da, a: varco.a, tratteggiato: true } }),
        },
        ...(varco?.ripristinabile && { correzione: { tipo: "ripristina-apertura", id: varco.id } }),
      });
    }
    if (accessi.senzaUnita.length) esiti.push({
      area: "Accessi", priorita: "dato", titolo: "Locali senza assegnazione", piano,
      descrizione: `Assegna a un’unità o alle parti comuni ${accessi.senzaUnita.map(l => l.nome).join(", ")}.`,
    });
    const partizioni = stato.muri.filter(m => m.stato === "nuovo" && m.tipo === "tramezzo").map(m => ({
      centro: puntoSullAsse(m, lunghezzaMuro(m) / 2), spessore: m.spessore,
    }));
    if (!alloggioSingolo && partizioni.length) {
      const interessati = stato.locali.filter(l => !l.unita?.trim() && !l.aperto && eAmbienteInterno(l) &&
        partizioni.some(({ centro, spessore }) => distanzaDalContorno(centro, l.contorno) <= spessore / 2 + 1));
      const isolati = controllaAccessiLocali(stato, interessati.map(l => l.id)).filter(l => l.esito === "assente");
      if (isolati.length) esiti.push({
        area: "Accessi", priorita: "problema", titolo: "Locali senza passaggio", piano,
        descrizione: `Nessun passaggio rilevato per ${isolati.map(l => l.nome).join(", ")}.`,
        verifica: "Controlla il tramezzo sulla tavola e verifica dove prevedere un passaggio.",
        posizione: { livelloId: livello.id, etichetta: "Locali senza passaggio", locali: isolati.map(l => l.localeId) },
      });
    }
    const porte = stato.aperture.filter(a => a.stato !== "da_demolire" && a.tipo === "porta");
    const senzaLuce = porte.filter(a => !eNumero(a.luceNettaCm, 1));
    if (senzaLuce.length) esiti.push({
      area: "Accessibilità", priorita: "dato", titolo: "Luce netta delle porte", piano, fonte: FONTI.accessibilita,
      descrizione: `${senzaLuce.length} porte senza luce netta documentata.`,
      verifica: "Misura il passaggio libero e riscontra soglie, manovra e collegamenti verticali sui percorsi interessati.",
    });
    const proposta = livello.proposte.find(p => p === stato);
    const elementiAttivi = stato.elementi.filter(e => e.stato !== "da_demolire");
    if (stato.tracciatiImpianti?.length) {
      const { percorsi, tracciatiDaRicollegare } = percorsiImpianti(stato);
      const incroci = percorsi.flatMap(p => attraversamentiImpianto(p, stato));
      const pareti = incroci.filter(p => !p.aperturaId);
      const vani = incroci.filter(p => p.aperturaId);
      if (pareti.length) esiti.push({
        area: "Impianti", priorita: "tecnico", titolo: "Interferenze dei tracciati", piano,
        descrizione: `${pareti.length} ${pareti.length === 1 ? "incrocio" : "incroci"} in pianta con pareti chiuse.`,
        verifica: "Controlla la quota di posa e la natura delle pareti nei punti indicati.",
        posizione: { livelloId: livello.id, etichetta: "Incroci impiantistici", punti: pareti.map(i => i.punto) },
      });
      if (vani.length) esiti.push({
        area: "Impianti", priorita: "dato", titolo: "Passaggi degli impianti nei vani", piano,
        descrizione: `${vani.length} ${vani.length === 1 ? "passaggio" : "passaggi"} in corrispondenza di un’apertura.`,
        verifica: "Riscontra soglie, stratigrafia e quota di posa nei passaggi indicati.",
        posizione: { livelloId: livello.id, etichetta: "Passaggi nei vani", punti: vani.map(i => i.punto) },
      });
      if (tracciatiDaRicollegare.length) esiti.push({
        area: "Impianti", priorita: "dato", titolo: "Tratti da ricollegare", piano,
        descrizione: `${tracciatiDaRicollegare.length} ${tracciatiDaRicollegare.length === 1 ? "tratto salvato" : "tratti salvati"} da riesaminare dopo la modifica dei collegamenti.`,
        verifica: "Apri Tracciati impianti nell’editor e ridisegna il collegamento attuale.",
      });
    }
    if (proposta && elementiAttivi.some(e => e.stato === "nuovo" && (eElementoElettrico(e.tipo) || eElementoScarico(e.tipo)))) {
      const { puntiSenzaUnita } = percorsiImpianti(stato);
      if (puntiSenzaUnita.length) {
        const ids = new Set(puntiSenzaUnita);
        esiti.push({
          area: "Impianti", priorita: "problema", titolo: "Punti impiantistici senza unità", piano,
          descrizione: `${puntiSenzaUnita.length} ${puntiSenzaUnita.length === 1 ? "punto resta" : "punti restano"} fuori dai contorni assegnati.`,
          verifica: "Controlla il confine del locale e sposta il simbolo solo dopo aver individuato l’unità servita.",
          posizione: { livelloId: livello.id, etichetta: "Punti da assegnare", punti: elementiAttivi.filter(e => ids.has(e.id)).map(e => e.posizione) },
        });
      }
      const controlli = [
        { criterio: "elettrico", elementi: eElementoElettrico, verifica: "Collega la relazione o lo schema del quadro con circuiti, carichi, sezioni e protezioni." },
        { criterio: "scarichi", elementi: eElementoScarico, verifica: "Riporta colonna, diametri, quote di innesto e pendenze dal rilievo o dall’elaborato tecnico." },
      ] as const;
      for (const c of controlli) {
        if (!elementiAttivi.some(e => e.stato === "nuovo" && c.elementi(e.tipo))) continue;
        const r = documento.urbanistica?.riscontriTecnici?.find(v => v.varianteId === proposta.id && v.livelloId === livello.id && v.criterio === c.criterio);
        const attuale = !!r && r.firma === firmaRiscontroTecnico(documento, r);
        const fonte = documento.urbanistica?.fonti.find(f => f.id === r?.fonteId);
        const esito = !r ? "Dati esecutivi da acquisire" : !attuale ? "Riscontro da rinnovare sulla revisione" :
          r.esito === "criticita" ? "Criticità riportata nel fascicolo" : "Riscontro registrato nel fascicolo";
        const quadri = c.criterio === "elettrico" ? elementiAttivi.filter(e => e.tipo === "quadro_elettrico").length : undefined;
        esiti.push({
          area: "Impianti", priorita: attuale && r?.esito === "riscontrato" ? "dato" : "tecnico", piano,
          titolo: RISCONTRI_TECNICI[c.criterio], descrizione: [esito, quadri ? `${quadri} quadri sulla tavola` : "", fonte?.titolo].filter(Boolean).join(" · ") + ".",
          verifica: attuale ? r?.riferimento : c.verifica,
          riscontro: { criterio: c.criterio, livelloId: livello.id }, fonte: FONTI.impianti,
        });
      }
    }
    const spostamenti = [...(proposta?.spostamentiBagno ?? []), ...(proposta?.spostamentiCucina ?? [])];
    for (const s of spostamenti) {
      esiti.push({
        area: "Impianti", priorita: "tecnico", titolo: stato.locali.find(l => l.id === s.destinazioneId)?.nome ?? "Spostamento di bagno o cucina",
        piano, fonte: FONTI.impianti, descrizione: "La variante sposta un ambiente servito da impianti.",
        verifica: "Riscontra montanti, scarichi, aerazione e attraversamenti nella tavola impiantistica e sul posto.",
      });
    }
    const tipiSanitari = new Set<string>(SANITARI_BAGNO);
    if (proposta && !spostamenti.length && stato.elementi.some(e => e.stato === "nuovo" && tipiSanitari.has(e.tipo))) esiti.push({
      area: "Impianti", priorita: "dato", titolo: "Sanitari aggiunti nella variante", piano, fonte: FONTI.impianti,
      descrizione: "Il progetto include nuovi sanitari.",
      verifica: "Confronta le posizioni disegnate con la fattibilità degli allacci e degli scarichi.",
    });
  }

  const residenziale = documento.ambitoDocumento === "alloggio";
  for (const v of verificaPianta(documento, ambito)) {
    if (v.esito === "ok") continue;
    const tecnico = ["interferenza", "scala", "contenimento", "serramento", "tetto"].includes(v.codice);
    if (!tecnico && !residenziale) continue;
    if (v.codice === "rai") {
      esiti.push({
        area: "Igiene", priorita: v.esito === "non_conforme" ? "tecnico" : "dato", titolo: v.oggetto, piano: v.livello,
        descrizione: v.messaggio, fonte: FONTI.igiene,
        verifica: [v.valore && `Dato del modello ${v.valore.toLowerCase()}.`, v.richiesto && `Riferimento ${v.richiesto}.`,
          "Confronta il rilievo con il regolamento comunale applicabile."].filter(Boolean).join(" "),
        posizione: v.livelloId && v.localeId ? { livelloId: v.livelloId, etichetta: v.oggetto, locali: [v.localeId] } : undefined,
      });
      continue;
    }
    esiti.push({
      area: tecnico ? "Disegno" : "Igiene", priorita: v.codice === "interferenza" ? "problema" : "dato",
      titolo: v.oggetto, piano: v.livello,
      descrizione: tecnico ? v.messaggio : `Controllo indicativo dal disegno per ${{ altezza: "altezza utile", superficie: "superficie", bagno: "dotazione del bagno", alloggio: "superficie dell’alloggio" }[v.codice as "altezza" | "superficie" | "bagno" | "alloggio"]}.`,
      verifica: tecnico ? undefined : [v.valore ? `Indicazione del modello ${v.valore}.` : "Riscontra il dato sul rilievo.", "Confronta le misure effettive e il regolamento comunale applicabile."].join(" "),
      fonte: tecnico ? undefined : FONTI.igiene,
    });
  }

  const altezza = dati.altezzaAntincendio;
  const autorimessa = dati.autorimessaCoperta;
  if (eNumero(altezza, 0) && altezza > 24) esiti.push({
    area: "Antincendio", priorita: "tecnico", titolo: "Attività 77 da inquadrare", fonte: FONTI.antincendio,
    descrizione: `Altezza antincendio indicata ${valore.format(altezza)} m. Per edifici a uso civile, l’attività 77 riguarda le altezze superiori a 24 m.`,
    verifica: "Verifica con il professionista antincendio il dato della pratica e l’inquadramento dell’edificio.",
  });
  if (eNumero(autorimessa, 0) && autorimessa > 300) esiti.push({
    area: "Antincendio", priorita: "tecnico", titolo: "Attività 75 da inquadrare", fonte: FONTI.antincendio,
    descrizione: `Autorimessa coperta indicata ${valore.format(autorimessa)} m², oltre la soglia di 300 m² dell’attività 75.`,
    verifica: "Verifica la superficie coperta complessiva e la pratica dell’autorimessa.",
  });
  const misureMancanti = [
    !eNumero(altezza, 0) && "altezza antincendio dell’intero edificio",
    !eNumero(autorimessa, 0) && "superficie coperta complessiva dell’eventuale autorimessa",
  ].filter(Boolean);
  esiti.push({
    area: "Antincendio", priorita: "dato", titolo: "Percorsi e dati dell’edificio", fonte: FONTI.esodo,
    descrizione: "Servono destinazioni d’uso, affollamento previsto, percorsi completi verso luogo sicuro e compartimentazioni.",
    verifica: misureMancanti.length
      ? `Per l’assoggettabilità mancano ${misureMancanti.join(" e ")}.`
      : "Riscontra i dati inseriti nella pratica dell’edificio e verifica le attività applicabili.",
  });
  if (ambito.startsWith("progetto:")) {
    const pianiEsodo = esodoDellaVariante(documento, ambito.slice("progetto:".length));
    for (const piano of pianiEsodo.filter(p => p.riscontro)) {
      esiti.push({
        area: "Antincendio", titolo: STATI_ESODO[piano.stato], piano: piano.livello.nome,
        priorita: piano.stato === "da_rinnovare" || piano.stato === "criticita" ? "tecnico" : "dato",
        descrizione: [piano.fonte?.titolo ?? "Tavola da collegare", piano.riscontro?.esodo?.simulazione && "Simulazione"].filter(Boolean).join(" · "),
        verifica: piano.stato === "da_rinnovare" ? "Rivedi il disegno e la tavola collegata in «Vie d’esodo» prima di registrare un nuovo riscontro."
          : piano.riscontro?.riferimento,
      });
    }
  }

  const aperte = verificheDelDocumento(documento).filter(v => !verificaConfermata(documento, v));
  if (aperte.length) esiti.push({
    area: "Documenti", priorita: "dato", titolo: "Verifica della tavola", descrizione: `${aperte.length} riscontri sul documento o sul rilievo sono aperti.`,
    verifica: "Apri «Confronta foto e pianta» per leggere le voci e registrare quelle supportate dalla fonte.",
  });
  if (!documento.urbanistica?.comune || documento.urbanistica.intervento || documento.urbanistica.attiDiscordanti) esiti.push({
    area: "Documenti", priorita: "dato", titolo: "Atti edilizi e regole locali", fonte: FONTI.urbanistica,
    descrizione: "Verifica stato legittimo, destinazione autorizzata e regole comunali nell’intervento selezionato.",
    verifica: "Apri «Regole urbanistiche» e collega tavole assentite e fonti applicabili.",
  });

  const ordine = { problema: 0, tecnico: 1, dato: 2 };
  return esiti.sort((a, b) => ordine[a.priorita] - ordine[b.priorita]);
}
