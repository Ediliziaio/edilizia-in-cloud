/**
 * I modelli di partenza: l'azienda ne sceglie uno e lo adatta, così arriva a un modulo pronto in un minuto.
 * Sono promemoria di lavoro, non documenti a norma.
 */
import { SCHEMA_COME_OGGI, type CampoModulo, type ModuloSchema } from "../../../supabase/functions/_shared/moduliCantiere";

export interface PresetModulo { id: string; nome: string; schema: ModuloSchema }

const campo = (chiave: string, etichetta: string, tipo: CampoModulo["tipo"], extra: Partial<CampoModulo> = {}): CampoModulo => ({
  chiave, etichetta, tipo, obbligatorio: false, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno", ...extra,
});
const rapportino = (campi: CampoModulo[]): ModuloSchema => ({ ...SCHEMA_COME_OGGI, campi });
const verbale = (voci: string[]): ModuloSchema => ({ ...SCHEMA_COME_OGGI, voci, dal_cantiere: true });
const DOCUMENTI = "Documenti e istruzioni consegnati";
const PULIZIA = "Pulizia e ripristino degli ambienti";

export const PRESET_RAPPORTINO: PresetModulo[] = [
  { id: "edile", nome: "Edile", schema: rapportino([
    campo("sicurezza_verificata", "Sicurezza verificata", "boolean"),
    campo("problemi_riscontrati", "Problemi riscontrati", "textarea"),
  ]) },
  { id: "serramenti", nome: "Serramenti", schema: rapportino([
    campo("pezzi_posati", "Pezzi posati", "number", { unita: "pz", livello: "fase" }),
    campo("misure_da_ricontrollare", "Misure da ricontrollare", "textarea"),
    campo("sigillatura_eseguita", "Sigillatura eseguita", "boolean"),
  ]) },
  { id: "impianti", nome: "Impianti", schema: rapportino([
    campo("prova_eseguita", "Prova eseguita", "boolean"),
    campo("esito_prova", "Esito prova", "select", { opzioni: ["Positivo", "Negativo", "Da ripetere"] }),
    campo("codice_impianto", "Codice impianto", "text"),
  ]) },
];

export const PRESET_VERBALE: PresetModulo[] = [
  { id: "generico", nome: "Generico", schema: verbale(["Lavorazioni previste e finiture", "Funzionamento delle parti installate", PULIZIA, DOCUMENTI]) },
  { id: "serramenti", nome: "Serramenti", schema: verbale(["Apertura e chiusura ante", "Tenuta e guarnizioni", "Sigillature e finiture", "Vetri integri", "Ferramenta e maniglie", DOCUMENTI]) },
  { id: "fotovoltaico", nome: "Fotovoltaico", schema: verbale(["Moduli e fissaggi", "Quadri e protezioni", "Inverter in funzione", "Messa a terra", "Monitoraggio attivo", DOCUMENTI]) },
  { id: "impianti", nome: "Impianti", schema: verbale(["Prova di funzionamento", "Prova di tenuta", "Regolazioni e parametri", PULIZIA, DOCUMENTI]) },
];
