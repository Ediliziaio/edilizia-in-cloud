/**
 * SettingsTariffe — preset cataloghi + standard tariffe seed
 * Estratto da SettingsTariffe.tsx (MP-IMP-001 Fase 4).
 */
import {
  Sparkles, HardHat, Hammer, Wrench, ClipboardList, Bath,
  Sun, PaintBucket, Cloud, Construction, Shovel, Waves,
} from "lucide-react";
import type { Vertical } from "@/hooks/useVertical";
import type { PresetId, TariffaSeed } from "./types";

/**
 * Mappa il `vertical` dell'azienda ai `PresetId` di tariffe da pre-selezionare.
 * Invocata solo alla prima apertura del dialog quando `existing.length === 0`.
 */
export function getDefaultPresetForVerticalTariffe(vertical: Vertical): PresetId {
  switch (vertical) {
    case "serramentista":
    case "tende_da_sole":
    case "vetrate":
      return "serramentista";
    case "tetti":
      return "tetti_ripasso";
    case "bagno":
      return "bagno";
    case "ristrutturazione":
      return "edile";
    case "caldaie":
    case "clima":
      return "impiantista";
    case "generico":
    default:
      return "essenziale";
  }
}

/**
 * Catalogo tariffe standard pre-compilato. Ogni riga ha uno o più tag `presets`
 * che permettono all'admin di importare in blocco solo le tariffe coerenti con
 * il proprio mestiere. I prezzi sono riferimenti di mercato IT 2025 al netto
 * IVA — ogni azienda dovrà calibrarli.
 */
export const STANDARD_TARIFFE: TariffaSeed[] = [
  // ─── POSA ──────────────────────────────────────────────────────────────────
  { nome: "Posa finestra singola", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Finestra battente o scorrevole fino a 120×140 cm, regolazione completa", presets: ["essenziale", "serramentista"] },
  { nome: "Posa portafinestra scorrevole", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 120, costo_interno: 80, descrizione: "Portafinestra scorrevole fino a 2 ante, registrazione carrelli", presets: ["serramentista"] },
  { nome: "Posa alzante-scorrevole", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 220, costo_interno: 160, descrizione: "Sistema alzante-scorrevole grande luce, movimentazione + registrazione", presets: ["serramentista"] },
  { nome: "Posa porta interna", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 65, costo_interno: 40, descrizione: "Porta interna battente, cerniere + maniglia + regolazione", presets: ["essenziale", "serramentista"] },
  { nome: "Posa porta blindata", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Blindata classe 3+, fissaggio + registrazione serrature", presets: ["serramentista"] },
  { nome: "Posa persiana", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 95, costo_interno: 60, descrizione: "Persiana battente in legno o alluminio, cardini + registro", presets: ["serramentista"] },
  { nome: "Posa tapparella motorizzata", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 110, costo_interno: 70, descrizione: "Tapparella + motore tubolare + cablaggio + programmazione finecorsa", presets: ["serramentista"] },
  { nome: "Posa cassonetto coibentato", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 75, costo_interno: 45, descrizione: "Cassonetto monoblocco pre-assemblato (non include muratura)", presets: ["serramentista"] },
  { nome: "Posa zanzariera", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 45, costo_interno: 28, descrizione: "Zanzariera verticale o laterale a rullo", presets: ["serramentista"] },
  { nome: "Posa pavimento ceramica", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Ceramica o gres con colla cementizia su sottofondo pronto", presets: ["essenziale", "edile"] },
  { nome: "Posa battiscopa", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Battiscopa in legno, MDF o ceramica — taglio + silicone", presets: ["edile"] },
  { nome: "Posa rivestimento bagno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 22, costo_interno: 14, descrizione: "Ceramica a parete o mosaico, stuccatura inclusa", presets: ["essenziale", "edile"] },
  { nome: "Posa cappotto termico", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 25, costo_interno: 16, descrizione: "Cappotto EPS/XPS con rasatura base + rete", presets: ["essenziale", "edile"] },

  // ─── MANODOPERA ────────────────────────────────────────────────────────────
  { nome: "Manodopera generica", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 45, costo_interno: 30, descrizione: "Aiuto operaio orario per piccole lavorazioni", presets: ["essenziale", "impiantista", "edile"] },
  { nome: "Manodopera specializzata", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 60, costo_interno: 40, descrizione: "Operaio qualificato con abilitazioni (es. patentino saldatore)", presets: ["serramentista", "impiantista", "edile"] },
  { nome: "Ora straordinaria", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 70, costo_interno: 50, descrizione: "Oltre l'orario ordinario o notturna (+50% rispetto base)", presets: ["serramentista", "impiantista", "edile"] },
  { nome: "Giornata operaio", tipo: "manodopera", unita_fatturazione: "gg", prezzo_vendita: 320, costo_interno: 220, descrizione: "Giornata di 8 ore — operaio base con attrezzatura personale", presets: ["edile"] },

  // ─── LOGISTICA ─────────────────────────────────────────────────────────────
  { nome: "Trasporto fisso cantiere", tipo: "trasporto", unita_fatturazione: "a_corpo", prezzo_vendita: 65, costo_interno: 40, descrizione: "Consegna singola in cantiere (zona locale entro 30 km)", presets: ["essenziale", "serramentista", "edile", "impiantista"] },
  { nome: "Trasporto al km", tipo: "trasporto", unita_fatturazione: "km", prezzo_vendita: 0.8, costo_interno: 0.5, descrizione: "Consegna extra-zona, fatturazione al km A/R", presets: ["essenziale", "serramentista", "edile", "impiantista"] },
  { nome: "Tiro al piano", tipo: "tiro_piano", unita_fatturazione: "piano", prezzo_vendita: 12, costo_interno: 8, piano_base: 1, prezzo_piano_aggiuntivo: 5, descrizione: "Base + extra per piano senza ascensore", presets: ["essenziale", "serramentista", "edile"] },
  { nome: "Tiro al piano con autoscala", tipo: "tiro_piano", unita_fatturazione: "piano", prezzo_vendita: 60, costo_interno: 45, piano_base: 1, prezzo_piano_aggiuntivo: 25, descrizione: "Autoscala + operatore per cantieri 4+ piani", presets: ["serramentista", "edile"] },
  { nome: "Smaltimento serramento", tipo: "smaltimento", unita_fatturazione: "pz", prezzo_vendita: 22, costo_interno: 15, descrizione: "Rimozione serramento esistente + conferimento in discarica", presets: ["serramentista"] },
  { nome: "Smaltimento porta", tipo: "smaltimento", unita_fatturazione: "pz", prezzo_vendita: 35, costo_interno: 22, descrizione: "Rimozione porta + telaio esistenti con sigillatura provvisoria", presets: ["serramentista"] },
  { nome: "Smaltimento materiale edile", tipo: "smaltimento", unita_fatturazione: "mc", prezzo_vendita: 95, costo_interno: 70, descrizione: "Materiale di risulta al metro cubo (calcinacci, imballi)", presets: ["edile"] },

  // ─── NOLO ──────────────────────────────────────────────────────────────────
  { nome: "Trabattello giornaliero", tipo: "nolo", unita_fatturazione: "gg", prezzo_vendita: 55, costo_interno: 35, descrizione: "Noleggio trabattello standard fino a 6 m", presets: ["essenziale", "edile", "impiantista"] },
  { nome: "Ponteggio mq/sett", tipo: "nolo", unita_fatturazione: "mq", prezzo_vendita: 9, costo_interno: 6, descrizione: "Ponteggio al mq settimanale (solo noleggio)", presets: ["essenziale", "edile"] },
  { nome: "Ponteggio completo mq/mese", tipo: "ponteggio", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 20, descrizione: "Ponteggio + montaggio + smontaggio + PIMUS al mq/mese", presets: ["edile"] },
  { nome: "Nolo minipala a caldo", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 75, costo_interno: 55, descrizione: "Minipala con operatore abilitato", presets: ["edile"] },
  { nome: "Nolo generatore", tipo: "nolo", unita_fatturazione: "gg", prezzo_vendita: 40, costo_interno: 25, descrizione: "Gruppo elettrogeno da cantiere 5–10 kVA", presets: ["edile", "impiantista"] },

  // ─── FINITURE ──────────────────────────────────────────────────────────────
  { nome: "Lattoneria soglia finestra", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 18, costo_interno: 11, descrizione: "Soglia esterna in alluminio verniciato a misura", presets: ["serramentista"] },
  { nome: "Lattoneria scossalina", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 22, costo_interno: 13, descrizione: "Scossalina superiore alluminio/rame con piegatura a sagoma", presets: ["serramentista", "edile"] },
  { nome: "Lattoneria canale di gronda", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 28, costo_interno: 17, descrizione: "Canale di gronda in lamiera zincata con pluviali", presets: ["edile"] },
  { nome: "Sigillatura silicone perimetrale", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 4, costo_interno: 2.2, descrizione: "Silicone neutro + nastro primer perimetrale", presets: ["essenziale", "serramentista"] },
  { nome: "Sigillatura poliuretanica", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Schiuma poliuretanica alta densità per tenuta aria/acqua", presets: ["serramentista"] },
  { nome: "Contorno cartongesso", tipo: "contorno", unita_fatturazione: "ml", prezzo_vendita: 14, costo_interno: 8, descrizione: "Rivestimento cartongesso perimetrale + rasatura + angolari", presets: ["serramentista"] },
  { nome: "Contorno intonachino", tipo: "contorno", unita_fatturazione: "ml", prezzo_vendita: 11, costo_interno: 6, descrizione: "Intonachino di ripristino perimetrale dopo smontaggio", presets: ["serramentista", "edile"] },
  { nome: "Falso telaio acciaio zincato", tipo: "falso_telaio", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Controtelaio standard in acciaio zincato + fissaggi", presets: ["serramentista"] },
  { nome: "Falso telaio in legno", tipo: "falso_telaio", unita_fatturazione: "pz", prezzo_vendita: 65, costo_interno: 40, descrizione: "Controtelaio in legno d'abete sezione 7×2,5 cm", presets: ["serramentista"] },

  // ─── SERVIZI TECNICI ───────────────────────────────────────────────────────
  { nome: "Sopralluogo tecnico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 80, costo_interno: 50, descrizione: "Rilievo misure + verifica vincoli tecnici in cantiere", presets: ["serramentista", "servizi", "edile"] },
  { nome: "Sopralluogo condominio", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 150, costo_interno: 100, descrizione: "Sopralluogo con accesso condominiale + relazione", presets: ["serramentista", "servizi"] },
  { nome: "Progettazione esecutiva", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 350, costo_interno: 200, descrizione: "Disegni esecutivi + capitolato tecnico", presets: ["servizi"] },
  { nome: "Direzione lavori", tipo: "progettazione", unita_fatturazione: "gg", prezzo_vendita: 280, costo_interno: 180, descrizione: "Direzione lavori in cantiere con SAL", presets: ["servizi"] },
  { nome: "Pratica CIL", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 250, costo_interno: 150, descrizione: "Comunicazione Inizio Lavori comunale", presets: ["servizi", "serramentista"] },
  { nome: "Pratica Ecobonus/Superbonus", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 900, costo_interno: 550, descrizione: "Asseverazione tecnica + comunicazione ENEA + visti", presets: ["servizi", "serramentista"] },
  { nome: "Certificazione energetica APE", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "APE post-intervento (unità abitativa)", presets: ["servizi"] },

  // ─── RISTRUTTURAZIONE BAGNO ─────────────────────────────────────────────────
  { nome: "Demolizione bagno completo", tipo: "manodopera", unita_fatturazione: "a_corpo", prezzo_vendita: 950, costo_interno: 650, descrizione: "Demolizione rivestimenti parete + pavimento bagno fino a 6 mq", presets: ["bagno", "edile"] },
  { nome: "Rimozione sanitari esistenti", tipo: "smaltimento", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "Smontaggio vasca/piatto doccia + wc + bidet + lavabo con conferimento", presets: ["bagno"] },
  { nome: "Posa piatto doccia filo pavimento", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 220, costo_interno: 140, descrizione: "Piatto doccia integrato a pavimento con sifone e impermeabilizzazione", presets: ["bagno"] },
  { nome: "Posa sanitari completi", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 320, costo_interno: 200, descrizione: "Installazione wc + bidet + lavabo + miscelatori con collegamenti", presets: ["bagno"] },
  { nome: "Posa miscelatore incasso", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Miscelatore a incasso doccia o vasca con staffa e collaudo", presets: ["bagno"] },
  { nome: "Posa box doccia", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Box doccia cristallo temperato 6/8 mm con profili e guarnizioni", presets: ["bagno"] },
  { nome: "Posa mosaico bagno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 35, descrizione: "Mosaico vetro o ceramica parete doccia, stuccatura epossidica inclusa", presets: ["bagno"] },
  { nome: "Impermeabilizzazione doccia", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Guaina liquida cementizia piatto doccia + fascia perimetrale", presets: ["bagno", "edile"] },
  { nome: "Stuccatura epossidica", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 8, descrizione: "Stuccatura epossidica antimacchia per rivestimenti bagno/cucina", presets: ["bagno"] },
  { nome: "Posa scaldasalviette", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 120, costo_interno: 75, descrizione: "Termoarredo scaldasalviette con attacco idraulico e valvole", presets: ["bagno", "impiantista"] },

  // ─── FOTOVOLTAICO ──────────────────────────────────────────────────────────
  { nome: "Sopralluogo fotovoltaico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 150, costo_interno: 90, descrizione: "Rilievo tetto + verifica ombreggiamenti + dimensionamento preliminare", presets: ["fotovoltaico", "servizi"] },
  { nome: "Progettazione impianto FV", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 450, costo_interno: 280, descrizione: "Schema unifilare + relazione tecnica + calcolo producibilità PVGIS", presets: ["fotovoltaico", "servizi"] },
  { nome: "Posa struttura FV su tetto", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 45, costo_interno: 28, descrizione: "Staffe e profili alluminio complanari a tetto per modulo FV", presets: ["fotovoltaico"] },
  { nome: "Posa modulo fotovoltaico", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 55, costo_interno: 35, descrizione: "Installazione pannello 400-450 Wp, fissaggio morsetti + allineamento", presets: ["fotovoltaico"] },
  { nome: "Cablaggio stringa FV", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Cavo solare 6 mm² + connettori MC4 + passaggio canalina", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Posa inverter stringa", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Inverter 3-6 kW con sezionatore DC + quadro AC + messa a terra", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Posa sistema di accumulo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 450, costo_interno: 300, descrizione: "Batteria litio 5-10 kWh con BMS e integrazione inverter ibrido", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Pratica GSE Scambio sul Posto", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 350, costo_interno: 200, descrizione: "Richiesta convenzione GSE SSP + documentazione TICA", presets: ["fotovoltaico", "servizi"] },
  { nome: "Pratica E-Distribuzione", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 280, costo_interno: 180, descrizione: "Preventivo connessione + comunicazione fine lavori E-Distribuzione", presets: ["fotovoltaico", "servizi"] },

  // ─── PITTURA ────────────────────────────────────────────────────────────────
  { nome: "Preparazione fondo parete", tipo: "manodopera", unita_fatturazione: "mq", prezzo_vendita: 5, costo_interno: 3, descrizione: "Carteggiatura, spolvero e applicazione fondo isolante prima di pittura", presets: ["pittura"] },
  { nome: "Rasatura parete", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 11, costo_interno: 7, descrizione: "Rasatura a gesso o calce per fondi irregolari, doppia mano", presets: ["pittura", "edile"] },
  { nome: "Stuccatura crepe e fori", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 85, costo_interno: 55, descrizione: "Stuccatura puntuale crepe, fori chiodi e imperfezioni localizzate", presets: ["pittura"] },
  { nome: "Tinteggiatura interna", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 8, costo_interno: 4.5, descrizione: "Due mani di pittura lavabile idropittura traspirante", presets: ["pittura", "essenziale"] },
  { nome: "Tinteggiatura esterna", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 9, descrizione: "Pittura al silossanico o acrilsilossanico facciata esterna", presets: ["pittura", "edile"] },
  { nome: "Verniciatura infissi legno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 32, costo_interno: 20, descrizione: "Sverniciatura + primer + smalto finestra/persiana (entrambi i lati)", presets: ["pittura", "serramentista"] },
  { nome: "Decorativo effetto spatolato", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 16, descrizione: "Applicazione pittura decorativa a spatola, due tonalità", presets: ["pittura"] },
  { nome: "Protezione mobili e pavimenti", tipo: "manodopera", unita_fatturazione: "a_corpo", prezzo_vendita: 95, costo_interno: 55, descrizione: "Telonatura pavimenti + protezione mobili + mascheratura infissi", presets: ["pittura"] },

  // ─── RIPASSO TETTI ─────────────────────────────────────────────────────────
  { nome: "Sopralluogo copertura", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 120, costo_interno: 75, descrizione: "Verifica stato manto + elementi di lattoneria + relazione fotografica", presets: ["tetti_ripasso", "tetti_rifacimento", "servizi"] },
  { nome: "Ripasso coppi esistenti", tipo: "manodopera", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Rimozione + ricollocazione coppi per riallineamento falda", presets: ["tetti_ripasso"] },
  { nome: "Sostituzione coppi rotti", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 8, costo_interno: 4, descrizione: "Sostituzione puntuale coppo rotto o mancante (materiale escluso)", presets: ["tetti_ripasso"] },
  { nome: "Pulizia canali e pluviali", tipo: "manodopera", unita_fatturazione: "ml", prezzo_vendita: 4, costo_interno: 2.5, descrizione: "Rimozione foglie e detriti da canali di gronda + lavaggio pluviali", presets: ["tetti_ripasso"] },
  { nome: "Impermeabilizzazione lattoneria", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 9, costo_interno: 5, descrizione: "Sigillatura giunti scossaline e raccordi camino con bitume-poliuretano", presets: ["tetti_ripasso"] },
  { nome: "Sigillatura comignolo", tipo: "sigillatura", unita_fatturazione: "pz", prezzo_vendita: 140, costo_interno: 85, descrizione: "Risanamento raccordo camino-manto con fascia autoadesiva + malta", presets: ["tetti_ripasso"] },
  { nome: "Trattamento antimuschio", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Applicazione biocida antimuschio su coppi + risciacquo a bassa pressione", presets: ["tetti_ripasso"] },

  // ─── RIFACIMENTO TETTI ─────────────────────────────────────────────────────
  { nome: "Rimozione manto esistente", tipo: "smaltimento", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 8, descrizione: "Smontaggio coppi/tegole esistenti e conferimento in discarica", presets: ["tetti_rifacimento"] },
  { nome: "Rimozione amianto (sub-appalto)", tipo: "smaltimento", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 40, descrizione: "Bonifica eternit con ditta iscritta albo gestori — piano di lavoro ASL", presets: ["tetti_rifacimento", "servizi"] },
  { nome: "Posa freno al vapore", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 8, costo_interno: 4, descrizione: "Telo traspirante/freno vapore sottotegola con nastri di sigillatura", presets: ["tetti_rifacimento"] },
  { nome: "Posa isolante tetto", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 22, costo_interno: 14, descrizione: "Pannello isolante XPS/lana roccia sp. 10-12 cm posato tra listelli", presets: ["tetti_rifacimento", "edile"] },
  { nome: "Posa listelli ventilazione", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 9, costo_interno: 5, descrizione: "Listellatura doppio orditura per camera di ventilazione sotto manto", presets: ["tetti_rifacimento"] },
  { nome: "Posa manto coppi nuovo", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 18, descrizione: "Posa coppi o tegole canadesi (esclusi coppi di colmo)", presets: ["tetti_rifacimento"] },
  { nome: "Lattoneria tetto completa", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 32, costo_interno: 20, descrizione: "Scossaline + canali + pluviali alluminio o rame preverniciato", presets: ["tetti_rifacimento"] },
  { nome: "Posa lucernario", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Velux o equivalente con raccordi di tenuta e rivestimenti interni", presets: ["tetti_rifacimento"] },
  { nome: "Sigillatura comignoli nuovi", tipo: "sigillatura", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Rifacimento raccordo camino/manto nuovo con piombo e fascia EPDM", presets: ["tetti_rifacimento"] },
  { nome: "Noleggio ponteggio per tetto", tipo: "ponteggio", unita_fatturazione: "mq", prezzo_vendita: 32, costo_interno: 22, descrizione: "Ponteggio perimetrale + parasassi + PIMUS per lavori copertura", presets: ["tetti_rifacimento"] },

  // ─── SCAVI ─────────────────────────────────────────────────────────────────
  { nome: "Sopralluogo geotecnico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "Rilievo quote + verifica terreno + individuazione sottoservizi", presets: ["scavi", "servizi"] },
  { nome: "Scavo sbancamento generale", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 14, costo_interno: 9, descrizione: "Sbancamento con escavatore fino a 2 m di profondità, terreno normale", presets: ["scavi", "edile"] },
  { nome: "Scavo fondazione continua", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 28, costo_interno: 18, descrizione: "Scavo fondazione a sezione obbligata per travi rovesce o cordoli", presets: ["scavi", "edile"] },
  { nome: "Scavo pozzo nero o fossa", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 38, costo_interno: 25, descrizione: "Scavo fossa per vasca biologica, pozzetto perdente o Imhoff", presets: ["scavi"] },
  { nome: "Trasporto terra a discarica", tipo: "trasporto", unita_fatturazione: "mc", prezzo_vendita: 22, costo_interno: 15, descrizione: "Carico e trasporto terra di risulta con autocarro ribaltabile", presets: ["scavi"] },
  { nome: "Reinterro e costipamento", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 9, costo_interno: 5, descrizione: "Reinterro con terra a strati + costipamento a piastra vibrante", presets: ["scavi"] },
  { nome: "Nolo escavatore cingolato", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 90, costo_interno: 65, descrizione: "Escavatore 3-6 t con operatore abilitato", presets: ["scavi", "edile"] },
  { nome: "Nolo autocarro ribaltabile", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 75, costo_interno: 55, descrizione: "Autocarro 3,5 t o 35 q con autista per trasporto materiali", presets: ["scavi", "edile"] },
  { nome: "Smaltimento terra contaminata", tipo: "smaltimento", unita_fatturazione: "mc", prezzo_vendita: 140, costo_interno: 100, descrizione: "Conferimento terra di scavo con analisi chimiche al mc", presets: ["scavi", "servizi"] },

  // ─── REALIZZAZIONE PISCINE ─────────────────────────────────────────────────
  { nome: "Sopralluogo piscina", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 250, costo_interno: 150, descrizione: "Rilievo area + verifica allacciamenti + studio esposizione", presets: ["piscine", "servizi"] },
  { nome: "Progettazione piscina", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 1400, costo_interno: 900, descrizione: "Progetto esecutivo piscina inclusa idraulica di filtraggio", presets: ["piscine", "servizi"] },
  { nome: "Scavo vasca piscina", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 24, costo_interno: 15, descrizione: "Scavo vasca piscina con sagomatura pareti e fondo", presets: ["piscine", "scavi"] },
  { nome: "Armatura pareti piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 35, descrizione: "Rete elettrosaldata + ferri di parete + casseri per getto cls", presets: ["piscine"] },
  { nome: "Impermeabilizzazione piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 45, costo_interno: 28, descrizione: "Doppia guaina cementizia bicomponente + angolari rinforzati", presets: ["piscine"] },
  { nome: "Posa rivestimento mosaico piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 75, costo_interno: 48, descrizione: "Mosaico vetro o gres 2,5×2,5 cm con colla + stucco specifico piscine", presets: ["piscine"] },
  { nome: "Impianto filtraggio piscina", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 1800, costo_interno: 1200, descrizione: "Pompa + filtro a sabbia + skimmer + bocchette + tubazioni PVC", presets: ["piscine", "impiantista"] },
  { nome: "Illuminazione subacquea LED", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Faro LED a bassa tensione con nicchia stagna e trasformatore", presets: ["piscine", "impiantista"] },
  { nome: "Pratica edilizia piscina", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 800, costo_interno: 480, descrizione: "SCIA o permesso di costruire + deposito al genio civile se richiesto", presets: ["piscine", "servizi"] },
  { nome: "Bordo sfioratore skimmer", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 95, costo_interno: 60, descrizione: "Bordo piscina in gres antiscivolo con canale sfioratore perimetrale", presets: ["piscine"] },
];

/**
 * Definizione dei preset cataloghi. Ogni preset raggruppa tariffe coerenti
 * con un mestiere/profilo aziendale tipico.
 */
export const PRESET_CATALOGHI: Array<{
  id: PresetId;
  nome: string;
  descrizione: string;
  icon: typeof Sparkles;
  iconClass: string;
}> = [
  { id: "essenziale", nome: "Essenziale", descrizione: "Set base universale: posa, manodopera, trasporto, tiro piano, smaltimento. Parti da qui se sei incerto.", icon: Sparkles, iconClass: "bg-primary/10 text-primary" },
  { id: "serramentista", nome: "Serramentista completo", descrizione: "Posa finestre, porte, persiane, tapparelle + finiture (lattoneria, sigillatura, contorno, falso telaio) + pratiche bonus.", icon: HardHat, iconClass: "bg-emerald-100 text-emerald-700" },
  { id: "edile", nome: "Edile generico", descrizione: "Posa pavimenti e rivestimenti, cappotto termico, ponteggi, noli, smaltimento materiale, manodopera specializzata.", icon: Hammer, iconClass: "bg-orange-100 text-orange-700" },
  { id: "impiantista", nome: "Impiantista", descrizione: "Manodopera a ore (generica + specializzata), trasporti, nolo trabattello e generatore per interventi impianti.", icon: Wrench, iconClass: "bg-blue-100 text-blue-700" },
  { id: "servizi", nome: "Servizi tecnici", descrizione: "Sopralluoghi, progettazione, direzione lavori, pratiche Ecobonus/Superbonus, APE.", icon: ClipboardList, iconClass: "bg-indigo-100 text-indigo-700" },
  { id: "bagno", nome: "Ristrutturazione bagno", descrizione: "Demolizione, rimozione sanitari, impermeabilizzazione, posa piatto doccia, sanitari, box e rivestimenti completi.", icon: Bath, iconClass: "bg-cyan-100 text-cyan-700" },
  { id: "fotovoltaico", nome: "Fotovoltaico", descrizione: "Sopralluogo + progetto, posa struttura, moduli, cablaggio, inverter, accumulo, pratiche GSE e E-Distribuzione.", icon: Sun, iconClass: "bg-yellow-100 text-yellow-700" },
  { id: "pittura", nome: "Pittura e decorazioni", descrizione: "Preparazione fondi, rasatura, stuccatura, tinteggiature interne/esterne, verniciature infissi e decorativi.", icon: PaintBucket, iconClass: "bg-fuchsia-100 text-fuchsia-700" },
  { id: "tetti_ripasso", nome: "Ripasso tetti", descrizione: "Manutenzione coperture: ripasso coppi, sostituzioni puntuali, pulizia canali, antimuschio, sigillature.", icon: Cloud, iconClass: "bg-sky-100 text-sky-700" },
  { id: "tetti_rifacimento", nome: "Rifacimento tetti", descrizione: "Rimozione manto (incluso amianto), freno vapore, isolante, listelli ventilazione, nuovo manto, lattoneria e lucernari.", icon: Construction, iconClass: "bg-stone-200 text-stone-700" },
  { id: "scavi", nome: "Scavi a terra", descrizione: "Sbancamento, fondazioni, scavi puntuali, nolo escavatore, trasporto terra e reinterro.", icon: Shovel, iconClass: "bg-amber-100 text-amber-700" },
  { id: "piscine", nome: "Realizzazione piscine", descrizione: "Progetto + scavo + armatura + impermeabilizzazione + rivestimento mosaico + impianto di filtraggio e illuminazione.", icon: Waves, iconClass: "bg-teal-100 text-teal-700" },
];
