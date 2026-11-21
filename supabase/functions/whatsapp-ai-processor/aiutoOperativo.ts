const testoComando = (testo: string) => testo.trim().toLowerCase().replace(/[?!.\s]+$/, "");

export function chiedeAiutoOperativo(testo: string): boolean {
  return /^(?:\/?aiuto|\/?menu|funzioni|cosa puoi fare|cosa posso fare su whatsapp)$/.test(testoComando(testo));
}

export function chiedeCantieriDiOggi(testo: string): boolean {
  return /^(?:dove (?:lavoro|vado) oggi|(?:quali sono )?i miei cantieri di oggi|cantieri di oggi)$/.test(testoComando(testo));
}

export function guidaOperativa(strumenti: ReadonlySet<string>, ruolo: string): string {
  const righe: string[] = [];
  if (strumenti.has("carica_ddt")) righe.push("• Per una bolla, manda la foto e un vocale con il cantiere.");
  if (strumenti.has("crea_rapportino")) righe.push("• Racconta lavori e ore, anche con un vocale nella tua lingua.");
  if (strumenti.has("crea_attivita_ufficio")) righe.push("• «Chiedi ad Acquisti tre controtelai per domani»");
  if (strumenti.has("elenca_miei_cantieri_oggi") && ruolo === "operaio") righe.push("• «Dove lavoro oggi?»");
  if (strumenti.has("crea_segnalazione")) righe.push("• Segnala un problema e allega una foto se aiuta a capirlo.");
  if (strumenti.has("apri_fatture_cliente")) righe.push("• «Mandami le fatture del cliente Rossi»");
  if (strumenti.has("get_quadro_incassi") || strumenti.has("scadenze_fatture")) righe.push("• «Quanto devo incassare questo mese?»");
  if (strumenti.has("crea_preventivo_ai")) righe.push("• Per un preventivo, descrivi l’intervento, le misure e il cliente.");
  return righe.length ? ["*Cosa puoi fare qui*", ...righe].join("\n") : "Descrivi quello che ti serve e preparo la richiesta.";
}
