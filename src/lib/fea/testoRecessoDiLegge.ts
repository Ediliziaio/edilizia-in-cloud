/**
 * Il testo sul diritto di recesso (14 giorni, art. 52 del Codice del consumo) che il cliente PRIVATO legge nella
 * pagina di firma con il codice (`/firma-fea/…`, passo «Diritto di recesso»), prima di firmare, quando l'azienda
 * non ha scritto il suo (`fea_configurazione.testo_recesso_b2c` vuoto).
 *
 * È lo stesso `RECESSO_FALLBACK` di `src/pages/public/FirmaDocumento.tsx`: qui serve solo a MOSTRARLO al titolare
 * nella pagina «Firma elettronica», come suggerimento del campo. Non lo si salva mai al posto suo: un campo vuoto
 * resta `null` nel database e il cliente legge il testo di legge. Un test (`firmaRecessoTesto.test.tsx`) controlla
 * che le due copie restino uguali; chi cambia il testo di legge le cambia entrambe.
 */
export const TESTO_RECESSO_DI_LEGGE =
  "Hai diritto di recedere dal presente contratto entro 14 giorni senza dover fornire alcuna motivazione. Il periodo di recesso scade dopo 14 giorni dalla conclusione del contratto. Per esercitare il diritto di recesso sei tenuto a informare l'azienda della tua decisione mediante una dichiarazione esplicita (ad es. una lettera inviata per posta o un'email).";

/**
 * La frase che la pagina «Firma elettronica» metteva da sola nel campo e salvava a ogni salvataggio, anche toccando
 * solo l'interruttore. Non parla di recesso: se un'azienda l'avesse salvata, il cliente la leggerebbe sotto il titolo
 * «Diritto di recesso» AL POSTO dell'informativa dei 14 giorni. La pagina la riconosce per avvisare il titolare.
 */
export const FRASE_SALVATA_PER_SBAGLIO =
  "Il cliente dichiara di aver letto il documento, di accettarne il contenuto e di autorizzare l'uso della firma elettronica avanzata con verifica OTP.";

/** Stesso testo a meno di spazi e a capo (nel database può essere stato incollato con altri spazi). */
export function eLaFraseSalvataPerSbaglio(testo: string | null | undefined): boolean {
  const normalizza = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return normalizza(testo ?? "") === normalizza(FRASE_SALVATA_PER_SBAGLIO);
}
