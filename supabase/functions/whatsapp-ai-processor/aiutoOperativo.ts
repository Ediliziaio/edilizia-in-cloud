const testoComando = (testo: string) => testo.trim().toLowerCase().replace(/[?!.\s]+$/, "");

export function chiedeAiutoOperativo(testo: string): boolean {
  return /^(?:\/?aiuto|\/?menu|funzioni|cosa puoi fare|cosa posso fare su whatsapp)$/.test(testoComando(testo));
}

export function chiedeCantieriDiOggi(testo: string): boolean {
  return /^(?:dove (?:lavoro|vado) oggi|(?:quali sono )?i miei cantieri di oggi|cantieri di oggi)$/.test(testoComando(testo));
}

export function guidaOperativa(strumenti: ReadonlySet<string>, ruolo: string, cronoprogramma = false): string {
  const righe: string[] = [];
  if (strumenti.has("carica_ddt")) righe.push("• Per una bolla, manda la foto e un vocale con il cantiere. «Le mie bolle» mostra lo stato dell’ultimo invio.");
  if (strumenti.has("crea_rapportino")) righe.push("• Racconta lavori e ore, anche con un vocale nella tua lingua. Se compili per la squadra, puoi dire «Marco 8 ore, Francesco 6 ore».");
  if (strumenti.has("crea_attivita_ufficio")) righe.push("• «Chiedi ad Acquisti tre controtelai per domani»");
  if (strumenti.has("elenca_miei_cantieri_oggi") && ruolo === "operaio") righe.push("• «Dove lavoro oggi?»");
  if (cronoprogramma) righe.push("• «Finiamo in ritardo di 3 giorni al cantiere Rossi» prepara le nuove date del cronoprogramma.");
  if (strumenti.has("crea_segnalazione")) righe.push("• «Apri un ticket di assistenza. La serratura è bloccata al cantiere Rossi»");
  if (strumenti.has("segnala_mezzo")) righe.push("• «Segnala un guasto sul furgone AB123CD. La spia motore è accesa»");
  if (strumenti.has("carica_scontrino")) righe.push("• Fotografa lo scontrino e dimmi se hai pagato tu o l’azienda.");
  if (strumenti.has("apri_fatture_cliente")) righe.push("• «Mandami le fatture del cliente Rossi»");
  if (strumenti.has("get_quadro_incassi") || strumenti.has("scadenze_fatture")) righe.push("• «Quanto devo incassare questo mese?»");
  if (strumenti.has("crea_preventivo_ai")) righe.push("• Per un preventivo, detta cliente, lavori, misure e aliquota IVA verificata. Puoi chiedere il PDF qui.");
  if (strumenti.has("crea_preventivo_ai") && strumenti.has("salva_preventivo_bozza")) {
    righe.push("• «Riprendi preventivo» apre le bozze. Per cambiare il computo, allega il nuovo file con «Sostituisci PDF» e il codice della bozza.");
  }
  return righe.length ? ["*Cosa puoi fare qui*", ...righe].join("\n") : "Descrivi quello che ti serve e preparo la richiesta.";
}
