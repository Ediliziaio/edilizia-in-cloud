/**
 * «Chi fa cosa» nell'app di cantiere, scritto a partire dalle regole VERE dell'azienda.
 *
 * Perché una funzione e non un testo fisso: le regole si cambiano nella stessa pagina,
 * e un testo scritto a mano diventa falso al primo cambio. Le decisioni passano da
 * `flussoPersona`, la stessa che usa l'app degli operai: se cambia lì, cambia qui.
 * Modulo puro: niente React, niente Supabase.
 */
import { flussoPersona, oreInTesto, type RegoleCampo } from "@/lib/campo/regoleCampo";
import { giorniIndietroValidi } from "@/lib/campo/workDay";

export type RuoloChiFaCosa = "operaio" | "capo" | "ufficio" | "giornale";

export interface BloccoChiFaCosa {
  ruolo: RuoloChiFaCosa;
  titolo: string;
  righe: string[];
  /** Dove si fa la cosa descritta (assegnare i capi, approvare, aprire il giornale). */
  link?: { testo: string; to: string };
}

export function chiFaCosa(regole: RegoleCampo, opzioni: { bozzaSerale?: boolean } = {}): BloccoChiFaCosa[] {
  // Le stesse domande che si fa l'app: un operaio in un cantiere con responsabile, e il responsabile stesso.
  const operaio = flussoPersona(regole, { esisteCapo: true });
  const capo = flussoPersona(regole, { isCapocantiere: true, esisteCapo: true });
  const misto = regole.chiCompila === "ore_proprie";
  const giorni = giorniIndietroValidi(regole.giorniIndietro);

  const righeOperaio: string[] = [];
  if (operaio.soloTimbratura) {
    righeOperaio.push("Timbra entrata e uscita. Non scrive il rapportino: lo fa il responsabile.");
    righeOperaio.push("Può aggiungere foto e segnalare problemi dal cantiere.");
  } else if (operaio.soloOre) {
    righeOperaio.push("Manda solo le sue ore della giornata.");
    righeOperaio.push("Lavori, foto e materiali li scrive il responsabile.");
  } else {
    righeOperaio.push("Scrive il suo rapportino: ore, lavori fatti, foto e materiali.");
  }
  if (regole.chiCompila !== "ognuno") {
    righeOperaio.push("Nei cantieri senza responsabile scrive il suo rapportino completo.");
  }
  if (regole.oreDalle === "timbrature" && !misto) {
    righeOperaio.push("Le ore che timbra diventano la proposta per il rapportino di squadra.");
  }
  righeOperaio.push("Vede solo le commesse a cui è assegnato e i suoi rapportini.");

  const righeCapo: string[] = [];
  if (regole.chiCompila === "ognuno") {
    righeCapo.push("Scrive il suo rapportino e può aggiungere la squadra con le ore di ognuno.");
  } else {
    righeCapo.push("Scrive il rapportino del cantiere: lavori, avanzamento delle fasi, materiali, mezzi e foto.");
  }
  if (capo.registraSquadra) {
    righeCapo.push(regole.oreDalle === "timbrature"
      ? "Le ore della squadra partono da quelle timbrate: lui le controlla, aggiunge chi non ha timbrato e corregge."
      : "Segna chi era in cantiere e scrive a mano le ore di ognuno.");
    if (regole.avvisoScostamentoMinuti != null) {
      righeCapo.push(`Se le ore scritte e quelle timbrate differiscono di più di ${oreInTesto(regole.avvisoScostamentoMinuti / 60)}, vede un avviso.`);
    }
  } else {
    righeCapo.push("Conferma solo le sue ore: ogni operaio manda le proprie.");
  }
  righeCapo.push("Capocantiere e caposquadra si scelgono commessa per commessa, tra le persone assegnate e nelle squadre.");

  const righeUfficio = [
    "Approva i rapportini chi può modificare le commesse: il titolare e l'ufficio con quel permesso.",
    "Chi è dell'ufficio non approva i propri rapportini: lo fa un collega o il titolare.",
    "Quando approva, le ore entrano nella manodopera della commessa e l'avanzamento delle fasi si aggiorna.",
    "Se rifiuta, scrive il motivo e il rapportino torna a chi l'ha scritto.",
    giorni === 0
      ? "Le giornate passate le sistema l'ufficio: dall'app si manda solo il giorno stesso."
      : `Le giornate più vecchie di ${giorni === 1 ? "ieri" : `${giorni} giorni`} le sistema l'ufficio.`,
  ];

  const righeGiornale = [
    "Lo vede chi ha il permesso «Giornale Lavori». Lo scrive e lo corregge chi ce l'ha non in sola lettura; il titolare sempre.",
    "È il diario ufficiale del cantiere, firmato dal capocantiere.",
    "I rapportini sono la base da cui si scrive, ma non lo sostituiscono.",
    ...(opzioni.bozzaSerale === undefined ? [] : [opzioni.bozzaSerale
      ? "Ogni sera si prepara da sola una bozza per i cantieri con lavoro registrato: la controlla e la firma una persona."
      : "La bozza serale è spenta: la pagina si prepara dal giornale con «Prepara dalla giornata»."]),
  ];

  return [
    { ruolo: "operaio", titolo: "Operaio", righe: righeOperaio },
    { ruolo: "capo", titolo: "Caposquadra e capocantiere", righe: righeCapo, link: { testo: "Assegna persone e responsabili nelle commesse", to: "/azienda/ordini" } },
    { ruolo: "ufficio", titolo: "Ufficio e titolare", righe: righeUfficio, link: { testo: "Rapportini da approvare nelle commesse", to: "/azienda/ordini" } },
    { ruolo: "giornale", titolo: "Giornale dei lavori", righe: righeGiornale, link: { testo: "Apri il giornale dei lavori", to: "/azienda/giornale-lavori" } },
  ];
}
