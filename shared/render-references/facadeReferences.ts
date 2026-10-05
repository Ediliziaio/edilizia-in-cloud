/**
 * Foto di riferimento della facciata: una per ogni elemento che il render cambia.
 *
 * - RIVESTIMENTO (materia, a colori): pietra o mattone vero — superficie, rilievo,
 *   variazione di tono, misura del modulo.
 * - POSA del rivestimento (forma, in bianco e nero): come sono disposti i pezzi.
 *   Si allega solo se la foto del materiale non mostra già quella posa.
 * - FINITURA dell'intonaco (materia, a colori): grana e rilievo; il colore lo dà il testo.
 * - DAVANZALI (forma, in bianco e nero): il profilo (lamiera piegata con testate); materiale
 *   e colore arrivano dal testo. Per ora solo l'alluminio ha la foto.
 * - GRONDE e pluviali (materia): le foto stanno in roofs/ e vengono dal tetto.
 *
 * Una foto si allega solo se l'elemento cambia: stesso gating dei blocchi del prompt
 * (shared/render-facciata/facciataRenderConfig.ts) — `rivestimento.attivo`,
 * `intonaco.attivo`, `elementi.davanzali.azione === "sostituisci"`,
 * `elementi.gronde.azione === "sostituisci"`.
 *
 * Il wizard salva il payload v2: i campi del form stanno sotto `legacy_config`, ed è
 * quello che generate-facade-render passa qui.
 */
import {
  BLACK_AND_WHITE_RULE,
  listReferencePaths,
  MAX_SHARED_REFERENCES,
  pickReferences,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";
import { GUTTER_MATERIAL_PHOTOS } from "./roofReferences.ts";

export const FACADE_FOLDER = "facades";

const f = (filename: string, text: string): PhotoEntry => ({ folder: FACADE_FOLDER, filename, text });

/** Finitura dell'intonaco (materia): grana e rilievo. Sono foto quasi neutre: il colore lo detta il testo. */
export const PLASTER_FINISH_PHOTOS: PhotoTable = {
  liscio: f("Intonaco-Esterno-Grigio-Chiaro-Liscio.webp", "smooth exterior render: flat even surface with a very fine sand grain, no visible relief and no trowel marks"),
  rasato: f("Superficie-Dintonaco-Grigio-Caldo.webp", "skim-coated render: smooth, slightly cloudy surface with faint soft trowel sweeps and almost no grain"),
  graffiato_fine: f("Intonaco-Esterno-Finemente-Graffiato.webp", "fine scratched render: dense even small-grain texture with tiny drag scratches, uniform at wall scale"),
  graffiato_medio: f("Dettaglio-Macro-Dellintonaco-Graffiato.webp", "medium scratched render: coarser grain with clearly visible random grooves dragged by the aggregate"),
  bucciato: f("Macro-Dellintonaco-Effetto-Buccia-Darancia.webp", "orange-peel render: tight regular pattern of small rounded bumps and dimples, soft even relief"),
  strutturato_grosso: f("Texture-Ruvida-Di-Intonaco-Esterno.webp", "heavy textured render: coarse lumpy relief with deep shadow pockets between thick blobs of aggregate"),
  rustico: f("Intonaco-Rustico-Spatolato-In-Primo-Piano.webp", "rustic hand-trowelled render: sweeping curved trowel strokes with raised rough ridges and smoother hollows"),
  veneziana: f("Intonaco-Veneziano-Levigato-E-Luminoso.webp", "Venetian polished plaster: smooth layered cloudy marbling with a soft sheen and no relief"),
  bugnato: f("Dettaglio-Fotorealistico-Di-Bugnato-In-Pietra.webp", "rusticated ashlar (bugnato): large rectangular blocks in staggered courses with rough raised faces and deep recessed channels"),
};

/** Materiale del rivestimento (materia): il colore della foto è parte dell'informazione. */
export const CLADDING_PHOTOS: PhotoTable = {
  pietra_serena: f("Pietra-Serena-Toscana-In-Blocchi-Modulari.webp", "Pietra Serena sandstone: sawn rectangular slabs with fine even grain and faint veining, thin tight joints"),
  travertino: f("Rivestimento-Esterno-In-Travertino-Beige.webp", "travertine: sawn slabs with horizontal banding and scattered natural pores, thin tight joints"),
  arenaria_beige: f("Facciata-In-Arenaria-Beige.webp", "sandstone: rock-faced blocks of varied length with warm sandy layering and rough split faces, thin recessed joints"),
  luserna: f("Rivestimento-In-Gneiss-Grigio-Di-Luserna.webp", "Luserna gneiss: long flat split stones dry-laid in rough courses, sparkling grain, small filler stones in deep joints"),
  marmo_bianco: f("Facciata-In-Marmo-Bianco-Venato.webp", "veined marble: large flat slabs with fine branching veins, crisp edges and hairline joints"),
  porfido: f("Facciata-In-Porfido-A-Opus-Incertum.webp", "porphyry: irregular stones with crystalline grain and mixed red-brown to violet tones, set in visible mortar joints"),
  splitface_grigio: f("Rivestimento-In-Pietra-Grigia-A-Secco.webp", "split-face stone strips: thin units with rough broken faces, dry-stacked in tight horizontal courses with deep shadows"),
  pietra_rustica: f("Muro-Rustico-In-Pietra-Naturale.webp", "rustic rubble stone: rounded and irregular stones of mixed sizes and earthy tones, roughly coursed in recessed mortar"),
  cotto_rosso: f("Facciata-In-Mattoni-Di-Terracotta-Rossa.webp", "terracotta facing brick: smooth red-orange units with slight tone variation and recessed light mortar joints"),
  clinker_rosso: f("Facciata-In-Clinker-Rosso-Scuro.webp", "dark red clinker brick: dense fired units with crisp edges and flamed tone variation, recessed dark joints"),
  clinker_grigio: f("Mattoni-Grigi-Con-Fughe-Antracite.webp", "grey clinker brick: dense mottled units with crisp edges and recessed dark joints"),
  clinker_beige: f("Mattoni-Clinker-Beige-In-Posa-A-Correre.webp", "sand clinker brick: speckled dense units with crisp edges and recessed light joints"),
  cotto_mattone: f("Parete-In-Mattoni-Antichi.webp", "old handmade brick: irregular worn units with strong tone variation and uneven, slightly raked mortar joints"),
  laterizio_bianco: f("Parete-Di-Mattoni-Bianchi.webp", "light-toned brick: slightly irregular units with softly rounded edges and recessed joints"),
};

/** Posa del rivestimento (forma, B/N): disposizione dei pezzi, non il materiale né la misura. */
export const CLADDING_PATTERN_PHOTOS: PhotoTable = {
  corsi_regolari: f("Mattoni-Clinker-Beige-In-Posa-A-Correre-BN.webp", "regular courses: units of equal height on straight continuous bed joints, each vertical joint centred on the unit below"),
  corsi_sfalsati: f("Rivestimento-Esterno-In-Pietra-Grigia-BN.webp", "staggered courses: long strips of equal height and unequal length, vertical joints offset at random from row to row"),
  listelli_orizzontali: f("Rivestimento-In-Pietra-Grigia-A-Secco-BN.webp", "horizontal strips: thin elongated units dry-stacked in tight horizontal bands, joints barely visible, strong linear shadows"),
  opus_incertum: f("Rivestimento-In-Pietra-A-Opus-Incertum-BN.webp", "opus incertum: irregular polygonal stones of mixed sizes fitted together, no continuous horizontal or vertical joints"),
};

/**
 * La posa che la foto del materiale mostra già. Se l'utente sceglie proprio questa, la foto
 * della posa sarebbe un doppione e si risparmia il posto; se ne sceglie un'altra (porfido a
 * corsi regolari, travertino a opus incertum) la foto della posa corregge quella del materiale.
 * Materiali assenti (arenaria, luserna, marmo, pietra rustica): la loro foto non mostra
 * nessuna delle quattro pose, quindi la posa scelta ha sempre la sua foto.
 */
export const CLADDING_PATTERN_IN_PHOTO: Partial<Record<string, string>> = {
  cotto_rosso: "corsi_regolari",
  clinker_rosso: "corsi_regolari",
  clinker_grigio: "corsi_regolari",
  clinker_beige: "corsi_regolari",
  cotto_mattone: "corsi_regolari",
  laterizio_bianco: "corsi_regolari",
  pietra_serena: "corsi_sfalsati",
  travertino: "corsi_sfalsati",
  porfido: "opus_incertum",
  splitface_grigio: "listelli_orizzontali",
};

/** Le gronde della facciata usano le foto del tetto (roofs/): stessa tabella, stesse chiavi. */
export const FACADE_GUTTER_PHOTOS: PhotoTable = GUTTER_MATERIAL_PHOTOS;

/**
 * Davanzali (forma, B/N), per `elementi.davanzali.materiale`: la foto mostra il profilo piegato
 * con le testate, non il materiale. Pietra e marmo sono lastre (materia) e restano senza foto.
 */
export const FACADE_SILL_PHOTOS: PhotoTable = {
  alluminio: f("Davanzale-In-Alluminio-Piegato-BN.webp", "folded window sill: thin plate sloping outward with a deep vertical front return, closed end caps and an upturned back edge tucked under the window frame"),
};

/**
 * Opzioni del form senza foto, con il motivo (il test controlla che ogni opzione stia o in
 * una tabella o qui). Le foto da far generare sono in docs/render-foto-da-generare/facciata-tetto.md.
 */
export const FACADE_SENZA_FOTO: Record<string, string> = {
  "davanzali.pietra": "nessuna foto nel set: il davanzale è piccolo e le parole (lastra con gocciolatoio) bastano finché non arriva la foto",
  "davanzali.marmo": "nessuna foto nel set (vedi davanzali.pietra)",
  "zoccolatura.intonaco": "nessuna foto nel set: fascia di intonaco più resistente, la dicono colore e altezza",
  "zoccolatura.pietra": "nessuna foto nel set: le foto dei rivestimenti mostrano pareti intere, non una fascia di zoccolo",
  "zoccolatura.ceramica": "nessuna foto nel set",
  "persiane.vernicia": "non serve: si riverniciano le persiane che sono già nella foto, cambia solo il colore, che arriva dal testo",
};

/** I campi del form (legacy_config) che decidono le foto. */
export interface FacadeReferenceConfig {
  tipo_intervento?: string | null;
  intonaco?: { attivo?: boolean | null; finitura?: string | null } | null;
  rivestimento?: { attivo?: boolean | null; tipo?: string | null; posa?: string | null } | null;
  elementi?: {
    davanzali?: { azione?: string | null; materiale?: string | null } | null;
    gronde?: { azione?: string | null; materiale?: string | null } | null;
  } | null;
}

/**
 * Ordine (facciata: 3 foto condivise, nessun catalogo azienda):
 *  10 materiale del rivestimento — la superficie più caratterizzante, difficile da dire a parole;
 *  20 posa del rivestimento — la geometria di quella stessa superficie (forma), solo se la foto
 *     del materiale non la mostra già;
 *  30 finitura dell'intonaco — superficie grande ma di solito a rilievo basso: il testo regge meglio;
 *  35 davanzali — dettaglio piccolo ma ripetuto sotto ogni finestra, e di forma: senza foto il modello
 *     disegna una lastra invece del profilo piegato con le testate; prima delle gronde, come nel form;
 *  40 gronde e pluviali — dettaglio di bordo.
 */
const PRIORITA = { rivestimento: 10, posa: 20, intonaco: 30, davanzali: 35, gronde: 40 } as const;

const COPY_RIVESTIMENTO = "Copy the material only — surface, relief, colour variation and unit size; the laying pattern, the joint colour and the zones come from the written specification";
const COPY_POSA = `Copy only how the units are laid (joint layout and offsets), not their size — ${BLACK_AND_WHITE_RULE}`;
const COPY_DAVANZALI = `Copy only the sill itself: its folded profile, front return, end caps and slope; ignore the window, the wall and the surroundings of this sample — the windows and their sizes stay as in the source photo; ${BLACK_AND_WHITE_RULE}`;
const COPY_GRONDE = "Copy the gutter and downpipe profile, material and joints only, along the eaves of the source photo; the colour comes from the written specification";

export function collectFacadeReferenceImages(config: FacadeReferenceConfig): SharedReferenceImage[] {
  const candidates: ReferenceCandidate[] = [];

  const riv = config.rivestimento;
  if (riv?.attivo === true && riv.tipo && CLADDING_PHOTOS[riv.tipo]) {
    candidates.push({ priority: PRIORITA.rivestimento, role: "CLADDING MATERIAL TARGET", key: riv.tipo, entry: CLADDING_PHOTOS[riv.tipo], copy: COPY_RIVESTIMENTO });
    const posa = riv.posa || "corsi_regolari"; // stesso default del testo (facciataRenderConfig.buildCladdingSpec)
    if (CLADDING_PATTERN_PHOTOS[posa] && CLADDING_PATTERN_IN_PHOTO[riv.tipo] !== posa) {
      candidates.push({ priority: PRIORITA.posa, role: "CLADDING LAYING PATTERN TARGET", key: posa, entry: CLADDING_PATTERN_PHOTOS[posa], copy: COPY_POSA });
    }
  }

  const intonaco = config.intonaco;
  if (intonaco?.attivo === true && intonaco.finitura && PLASTER_FINISH_PHOTOS[intonaco.finitura]) {
    candidates.push({ priority: PRIORITA.intonaco, role: "PLASTER FINISH TARGET", key: intonaco.finitura, entry: PLASTER_FINISH_PHOTOS[intonaco.finitura] });
  }

  const davanzali = config.elementi?.davanzali;
  if (davanzali?.azione === "sostituisci" && davanzali.materiale && FACADE_SILL_PHOTOS[davanzali.materiale]) {
    candidates.push({ priority: PRIORITA.davanzali, role: "WINDOW SILL TARGET", key: davanzali.materiale, entry: FACADE_SILL_PHOTOS[davanzali.materiale], copy: COPY_DAVANZALI });
  }

  const gronde = config.elementi?.gronde;
  if (gronde?.azione === "sostituisci" && gronde.materiale && FACADE_GUTTER_PHOTOS[gronde.materiale]) {
    candidates.push({ priority: PRIORITA.gronde, role: "GUTTER MATERIAL TARGET", key: gronde.materiale, entry: FACADE_GUTTER_PHOTOS[gronde.materiale], copy: COPY_GRONDE });
  }

  return pickReferences(candidates, MAX_SHARED_REFERENCES);
}

/** Tutti i file dichiarati («facades/…» e le gronde in «roofs/…»), per i test di esistenza. */
export function listFacadeReferencePaths(): string[] {
  return listReferencePaths(PLASTER_FINISH_PHOTOS, CLADDING_PHOTOS, CLADDING_PATTERN_PHOTOS, FACADE_SILL_PHOTOS, FACADE_GUTTER_PHOTOS);
}
