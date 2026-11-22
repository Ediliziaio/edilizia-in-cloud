import { dataAdiacente, minuti, partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";

export const oraDaMinuti = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const fineGiornata = 24 * 60;
const mattina = 9 * 60;

export function fasciaInizialeVicini(data: string, adesso: Date, dalle?: string, alle?: string) {
  const oggi = partiNelFuso(adesso);
  const corrente = minuti(oggi.ora)!;
  const da = minuti(dalle);
  const a = minuti(alle);
  const durata = da != null && a != null && a > da && a < fineGiornata ? a - da : 60;
  const giorno = data < oggi.giorno ? oggi.giorno : data;
  if (data === giorno && da != null && da >= 0 && da + durata < fineGiornata &&
      (giorno > oggi.giorno || da > corrente)) {
    return { giorno, inizio: oraDaMinuti(da), fine: oraDaMinuti(da + durata) };
  }
  const inizio = giorno === oggi.giorno ? Math.ceil((corrente + 1) / 15) * 15 : mattina;
  if (inizio + durata < fineGiornata) {
    return { giorno, inizio: oraDaMinuti(inizio), fine: oraDaMinuti(inizio + durata) };
  }
  const inizioDomani = mattina + durata < fineGiornata ? mattina : 0;
  return { giorno: dataAdiacente(giorno, 1), inizio: oraDaMinuti(inizioDomani), fine: oraDaMinuti(inizioDomani + durata) };
}

export function erroreFasciaVicini(giorno: string, inizio: string, fine: string, adesso: Date) {
  const oggi = partiNelFuso(adesso);
  if (!giorno || !inizio || !fine) return "Completa giorno, ora di inizio e ora di fine.";
  if (giorno < oggi.giorno || giorno > dataAdiacente(oggi.giorno, 365)) return "Scegli un giorno entro i prossimi 365 giorni.";
  if (inizio >= fine) return "L’ora di fine deve essere successiva a quella di inizio.";
  if (giorno === oggi.giorno && inizio <= oggi.ora) return "Scegli un orario successivo a quello attuale.";
  return "";
}
