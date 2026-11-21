import { calendarioAzienda, lavorativiTra, spostaLavorativi, type ImpostazioniCalendario } from "../silvio-commessa/calendario.ts";
import { aggiungiGiorni, dataVera } from "../silvio-commessa/date.ts";

interface DateRiga {
  id: string;
  inizio: string | null;
  fine: string | null;
}

interface Fase extends DateRiga {
  nome: string;
  stato: string;
  percentuale: number;
  completata_il: string | null;
}

interface Sottofase extends DateRiga {
  fase: string;
  iniziata: boolean;
}

export interface DatiCronoprogramma extends ImpostazioniCalendario {
  versione: string;
  commessa: { titolo: string; inizio: string | null; fine: string | null; indirizzo: string | null; consegna?: string | null };
  fasi: Fase[];
  sottofasi: Sottofase[];
}

export interface RitardoDichiarato {
  giorni: number;
  solari: boolean;
  fase: string | null;
}

interface CambioFase extends DateRiga {
  nome: string;
  prima: { inizio: string | null; fine: string | null };
}

export interface PropostaCronoprogramma {
  versione: string;
  fine: string;
  fasi: DateRiga[];
  sottofasi: DateRiga[];
}

const nomeFase = (nome: string) => nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ultimaData = (date: unknown[]) => date.filter(dataVera).sort().at(-1) ?? null;
const completata = (f: Fase) => f.stato === "completata" || !!f.completata_il || f.percentuale >= 100;
const daIniziare = (f: Fase) => (f.stato === "da_iniziare" || f.stato === "da_fare") && !(f.percentuale > 0);

export function proponiRitardoCronoprogramma(dati: DatiCronoprogramma, ritardo: RitardoDichiarato):
  { errore: string } | { piano: PropostaCronoprogramma; finePrima: string; cambi: CambioFase[]; daVerificare: string[] } {
  const finePrima = ultimaData([dati.commessa.fine, ...dati.fasi.map(f => f.fine)]);
  if (!finePrima) return { errore: "Imposta una fine lavori prevista o data le fasi nel cronoprogramma, poi indica il ritardo." };
  const cal = calendarioAzienda(dati, dati.commessa.indirizzo);
  const sposta = (giorno: string, n: number) => {
    const data = spostaLavorativi(giorno, n, cal);
    return dataVera(data) && lavorativiTra(giorno, data, cal) === n ? data : null;
  };
  const nuovaFine = (giorno: string) => ritardo.solari ? aggiungiGiorni(giorno, ritardo.giorni) : sposta(giorno, ritardo.giorni);
  const calendarioNonDisponibile = { errore: "Verifica le chiusure nel calendario aziendale. Non trovo abbastanza giorni lavorativi per calcolare il ritardo." };

  const piano: PropostaCronoprogramma = { versione: dati.versione, fine: finePrima, fasi: [], sottofasi: [] };
  const cambi: CambioFase[] = [];
  const daVerificare: string[] = [];
  if (!ritardo.fase) {
    const fine = nuovaFine(finePrima);
    return fine ? { piano: { ...piano, fine }, finePrima, cambi, daVerificare } : calendarioNonDisponibile;
  }

  const chiave = nomeFase(ritardo.fase);
  const esatte = dati.fasi.filter(f => nomeFase(f.nome) === chiave);
  const trovate = esatte.length ? esatte : dati.fasi.filter(f => chiave && (" " + nomeFase(f.nome) + " ").includes(" " + chiave + " "));
  if (trovate.length !== 1) {
    return { errore: trovate.length ? `Quale fase intendi? Indica il nome completo fra ${trovate.slice(0, 5).map(f => f.nome).join(", ")}.`
      : "Non trovo la fase indicata. Usa il nome che compare nelle Lavorazioni." };
  }
  const [fase] = trovate;
  if (completata(fase)) return { errore: `«${fase.nome}» risulta completata. Indica la fase ancora aperta che sta slittando.` };
  if (!dataVera(fase.fine)) return { errore: `Imposta prima la fine prevista di «${fase.nome}» nelle Lavorazioni.` };
  const fineFase = nuovaFine(fase.fine);
  if (!fineFase) return calendarioNonDisponibile;

  const registra = (f: Fase, inizio: string | null, fine: string) => {
    piano.fasi.push({ id: f.id, inizio, fine });
    cambi.push({ id: f.id, nome: f.nome, inizio, fine, prima: { inizio: f.inizio, fine: f.fine } });
  };
  registra(fase, fase.inizio, fineFase);

  // Una successiva va spostata quando partiva dopo la fine originaria di una
  // fase spostata e adesso entra in conflitto. Le sovrapposizioni già previste
  // sono lavoro in parallelo, quindi non fanno scattare la ripianificazione.
  const successive = dati.fasi.filter(f => f.inizio && f.inizio > fase.fine!).sort((a, b) => a.inizio!.localeCompare(b.inizio!));
  for (const futura of successive) {
    const prima = futura.inizio!;
    const blocco = ultimaData(cambi.filter(f => f.prima.fine && f.prima.fine < prima && f.fine! >= prima).map(f => f.fine));
    if (!blocco) continue;
    const datate = dati.sottofasi.filter(s => s.fase === futura.id && (s.inizio || s.fine || s.iniziata));
    if (!daIniziare(futura) || completata(futura) || !dataVera(futura.fine) ||
        datate.some(s => s.iniziata || !dataVera(s.inizio) || !dataVera(s.fine))) {
      daVerificare.push(futura.nome);
      continue;
    }
    const inizio = sposta(blocco, 1);
    if (!inizio) return calendarioNonDisponibile;
    const giorni = lavorativiTra(prima, inizio, cal);
    const fine = sposta(futura.fine, giorni);
    if (!fine) return calendarioNonDisponibile;
    const sottofasi = datate.map(s => ({ id: s.id, inizio: sposta(s.inizio!, giorni), fine: sposta(s.fine!, giorni) }));
    if (fine < inizio || sottofasi.some(s => !s.inizio || !s.fine || s.inizio < inizio || s.fine > fine)) {
      daVerificare.push(futura.nome);
      continue;
    }
    registra(futura, inizio, fine);
    piano.sottofasi.push(...sottofasi);
  }
  piano.fine = ultimaData([finePrima, ...piano.fasi.map(f => f.fine)])!;
  return { piano, finePrima, cambi, daVerificare };
}
