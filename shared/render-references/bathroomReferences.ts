/**
 * Foto di riferimento condivise per il bagno: una tabella per ogni scelta del form
 * (tipo di doccia, vetro, profilo, piatto, soffione, vasca, mobile, lavabo, specchio,
 * sanitari, placca, rubinetti, effetto delle piastrelle). Sono le foto del set del
 * titolare (04/10/2026, manifest scripts/render-references/manifest.json, modulo
 * «bagno»), più una foto vecchia dove il set non ne ha (mobile a terra classico).
 *
 * Il 05/10/2026 sono entrate le foto degli elementi aggiunti il giorno prima, che il
 * render riceveva solo a parole (docs/render-foto-da-generare/bagno.md): termoarredo,
 * nicchia e scarico della doccia, parete sopravasca, illuminazione. Non sono nel
 * manifest (che resta il set da 310): i test le controllano dalle tabelle. Due non sono
 * ancora arrivate (canalina, parete girevole): stanno in SENZA_FOTO col motivo.
 *
 * Forma in bianco e nero («-BN.webp»): il modello copia la costruzione, colore e
 * finitura arrivano dal testo, e l'etichetta non nomina né l'uno né l'altra.
 * Materia a colori (vetro, finiture, colori, piani, effetti piastrella): lì il
 * colore è l'informazione. Ogni etichetta dice quale sola cosa prendere dalla foto
 * (regola «una foto = un'informazione»): il resto dell'inquadratura non è un'istruzione.
 *
 * Il prodotto dell'azienda (catalogo render) ha la precedenza: occupa i suoi slot e,
 * se copre lo stesso elemento, la foto generica di quell'elemento non viene allegata.
 *
 * Mappa manifest → codice: le chiavi del manifest coincidono con quelle del form
 * (doccia_vetro = doccia.box_vetro, vasca_rubinetto = vasca.rubinetteria_vasca,
 * placca_stile = sanitari.piastra_wc, lavabo_tipo = vanity.lavabo, …) tranne:
 *  - effetti «ardesia» / «pietra_ardesia»: nel codice «pietra_ardesia» è l'ardesia a
 *    spacco con forte rilievo, «ardesia» la piastrella liscia a spacco naturale. Il
 *    manifest le ha invertite: Ardesia-Naturale-Color-Carbone (a spacco, a rilievo) va
 *    a pietra_ardesia; Piastrelle-In-Ardesia-Antracite-Opaca (lastre piane) resta fuori,
 *    doppione di «ardesia».
 *  - doccia frontale: Box-Doccia-Frontale-Con-Porta-Battente (primo file del manifest)
 *    ha un fianco in vetro, cioè è un box ad angolo; si usa Box-Doccia-Cromato-Con-Porta-In-Vetro,
 *    che è un fronte unico tra due pareti.
 *  - vetro serigrafato: Vetro-Doccia-Serigrafato-A-Sfumatura è una doccia intera
 *    (rubinetti, parete, piatto); si usa Vetro-Doccia-Puntinato-Sfumato, il solo vetro.
 */
import type { SharedReferenceImage } from "./referenceUrl.ts";
import {
  BLACK_AND_WHITE_RULE,
  listReferencePaths,
  pickReferences,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";

export const BATHROOM_FOLDER = "bathroom";

const foto = (filename: string, text: string, bn?: boolean): PhotoEntry =>
  bn === undefined ? { folder: BATHROOM_FOLDER, filename, text } : { folder: BATHROOM_FOLDER, filename, text, bn };

// ── Doccia ─────────────────────────────────────────────────────────────────

/** doccia.tipo — FORMA. */
export const SHOWER_TYPE_PHOTOS: PhotoTable = {
  walk_in: foto("Box-Doccia-Walk-In-Con-Profilo-Nero-BN.webp", "walk-in shower: one fixed glass panel on a slim wall profile with a stabiliser bar, open entry with no door, floor-level base"),
  nicchia_box: foto("Box-Doccia-In-Nicchia-Con-Vetro-Trasparente-BN.webp", "alcove shower: recess between two side walls closed by one framed glass front with two sliding panels"),
  frontale_box: foto("Box-Doccia-Cromato-Con-Porta-In-Vetro-BN.webp", "frontal enclosure: one straight glass front with a hinged door and a fixed panel, set between walls, no side glass"),
  angolare: foto("Box-Doccia-Angolare-In-Vetro-BN.webp", "corner enclosure: two framed glass sides meeting at 90 degrees on a square tray, hinged door on the front side"),
  semicircolare: foto("Box-Doccia-Semicircolare-In-Vetro-Curvo-BN.webp", "quadrant corner enclosure: curved glass front with two curved sliding doors on a matching quarter-round tray"),
};

/** doccia.box_vetro — MATERIA. */
export const SHOWER_GLASS_PHOTOS: PhotoTable = {
  trasparente: foto("Pannello-Doccia-In-Vetro-Extrachiaro.webp", "extra-clear tempered glass: fully see-through, thin clean edge"),
  satinato: foto("Vetro-Satinato-Per-Box-Doccia.webp", "satin frosted glass: uniform milky translucency, shapes behind it blurred"),
  fume: foto("Pannello-Doccia-In-Vetro-Fume-Traslucido.webp", "smoked glass: grey translucent tint that still shows the wall behind it"),
  serigrafato: foto("Vetro-Doccia-Puntinato-Sfumato.webp", "screen-printed glass: clear panel with a fine dot pattern, dense at the top and fading to clear"),
};

/** doccia.profilo — MATERIA. */
export const SHOWER_PROFILE_PHOTOS: PhotoTable = {
  cromato: foto("Angolo-Di-Porta-Doccia-In-Vetro-Cromato.webp", "polished chrome corner profile and base trim holding two glass panels, mirror-like reflections"),
  nero_opaco: foto("Angolo-Doccia-In-Vetro-Con-Profilo-Nero.webp", "matte black square-section frame at the corner of a glass enclosure, flat non-reflective finish"),
  oro_spazzolato: foto("Angolo-Doccia-In-Vetro-Con-Oro-Spazzolato.webp", "brushed gold square-section frame at the corner of a glass enclosure, fine satin grain"),
  senza_profilo: foto("Porta-Doccia-In-Vetro-Senza-Cornice.webp", "frameless glass: bare glass edges joined only by small hinges and a bar handle, no frame"),
};

/** doccia.piatto — FORMA. */
export const SHOWER_TRAY_PHOTOS: PhotoTable = {
  filo_pavimento: foto("Doccia-Walk-In-Moderna-Con-Canalina-Lineare-BN.webp", "flush-to-floor shower: the floor runs into the shower with no step and no tray edge"),
  rialzato_3cm: foto("Piatto-Doccia-Bianco-Rialzato-Bordo-Sottile-BN.webp", "low rectangular shower tray with a thin edge about 3 cm high and a round drain"),
  rialzato_5cm: foto("Piatto-Doccia-Bianco-Rialzato-BN.webp", "rectangular shower tray raised about 5 cm, with a visible upright edge and a round drain"),
  pietra: foto("Piatto-Doccia-In-Resina-Effetto-Pietra-BN.webp", "slim rectangular tray with a textured stone-like relief on its surface and a square grate drain"),
};

/** doccia.soffione — FORMA. */
export const SHOWER_HEAD_PHOTOS: PhotoTable = {
  a_parete: foto("Soffione-Doccia-Rotondo-Con-Miscelatore-BN.webp", "round shower head on a wall arm, with a separate exposed bar mixer below it"),
  pioggia_soffitto: foto("Soffione-Doccia-Quadrato-A-Soffitto-BN.webp", "large square rain shower head hanging from a short ceiling arm"),
  colonna_completa: foto("Colonna-Doccia-Completa-Con-Soffione-BN.webp", "exposed shower column: riser pipe with overhead rain head, hand shower on a slider and bar mixer at the bottom"),
  combinato: foto("Sistema-Doccia-Completo-Con-Soffione-A-Pioggia-BN.webp", "combined system: round rain head on a ceiling arm plus a separate slide rail with hand shower and exposed mixer"),
};

/**
 * doccia.nicchia — FORMA. «nessuna» non ha foto: non c'è niente da mostrare.
 * Le due foto mostrano anche gli accessori della doccia accanto alla nicchia: l'etichetta dice di copiare solo lei.
 */
export const SHOWER_NICHE_PHOTOS: PhotoTable = {
  verticale: foto("Nicchia-Doccia-Verticale-Con-Ripiano-BN.webp", "recessed vertical shower niche about twice as tall as wide, one thin shelf at mid-height, lined with the wall tiles, tile frame edges cut at 45 degrees, empty"),
  orizzontale: foto("Nicchia-Doccia-Orizzontale-Lunga-BN.webp", "long low recessed shower niche about 2.5 times as wide as high, one open compartment, lined with the wall tiles, tile frame edges cut at 45 degrees, empty"),
};

/**
 * doccia.scarico — FORMA. La canalina lineare non ha ancora la sua foto (Canalina-Doccia-Lineare-A-Filo-Parete,
 * da rigenerare): sta in SENZA_FOTO. Una canalina su un piatto semicircolare diventa piletta (vedi scaricoEffettivo).
 */
export const SHOWER_DRAIN_PHOTOS: PhotoTable = {
  piletta: foto("Piletta-Doccia-Quadrata-A-Filo-BN.webp", "square point drain about 10 cm wide with a flat grate of small square holes, set flush in a smooth shower floor that slopes gently towards it"),
};

// ── Vasca ──────────────────────────────────────────────────────────────────

/** vasca.tipo — FORMA. */
export const BATHTUB_TYPE_PHOTOS: PhotoTable = {
  freestanding_ovale: foto("Vasca-Ovale-Freestanding-Con-Rubinetto-BN.webp", "oval freestanding bathtub: one continuous rounded shell standing free on the floor, away from the walls"),
  freestanding_rettangolare: foto("Vasca-Freestanding-Rettangolare-Dai-Bordi-Morbidi-BN.webp", "rectangular freestanding bathtub with soft rounded corners and a thin rim, standing free on the floor"),
  back_to_wall: foto("Vasca-Back-To-Wall-Con-Rubinetto-A-Parete-BN.webp", "back-to-wall bathtub: one straight side flush against the wall, the rest a continuous curved shell to the floor"),
  incassata: foto("Vasca-Incassata-Con-Rivestimento-Piastrellato-BN.webp", "built-in bathtub set into a recess between three walls, its front closed by a tiled apron"),
  angolare: foto("Vasca-Angolare-Incassata-Con-Pannello-Piastrellato-BN.webp", "bathtub built into a room corner: two sides against the walls, the open sides closed by a tiled apron"),
};

/** vasca.materiale — MATERIA. */
export const BATHTUB_MATERIAL_PHOTOS: PhotoTable = {
  solid_surface: foto("Superficie-Bianca-Vellutata-Per-Vasca.webp", "solid-surface mineral material: smooth velvety matte surface, uniform, no shine"),
  ghisa_smaltata: foto("Smalto-Bianco-Lucido-Su-Ghisa.webp", "enamelled cast iron: thick glassy glossy enamel with soft deep reflections"),
};

/** vasca.rubinetteria_vasca — FORMA. */
export const BATHTUB_FAUCET_PHOTOS: PhotoTable = {
  a_parete: foto("Rubinetto-Cromato-Da-Parete-Per-Vasca-BN.webp", "wall-mounted bath mixer: spout and two handles coming straight out of the wall, nothing on the tub rim"),
  a_pavimento: foto("Colonna-Rubinetto-Cromata-Con-Doccetta-BN.webp", "floor-standing bath filler: tall column rising from the floor with a curved spout and a hand shower"),
  bordo_vasca: foto("Miscelatore-Cromato-A-Tre-Fori-BN.webp", "deck-mounted bath mixer on the tub rim: lever, spout and pull-out hand shower in a row"),
};

/**
 * vasca.parete_doccia — FORMA. «nessuna» non ha foto (vasca aperta); la parete girevole non è ancora arrivata
 * (Parete-Vasca-Girevole-In-Vetro, da rigenerare): sta in SENZA_FOTO. Su una vasca freestanding la parete non si monta.
 */
export const BATH_SCREEN_PHOTOS: PhotoTable = {
  fissa: foto("Parete-Vasca-Fissa-In-Vetro-BN.webp", "fixed glass bath screen on the tub rim at the tap end: one narrow clear panel, slim wall-side profile, other edges frameless, hand shower on a slide rail"),
};

// ── Mobile, lavabo, specchio ───────────────────────────────────────────────

/** vanity.stile — FORMA. */
export const VANITY_STYLE_PHOTOS: PhotoTable = {
  sospeso_moderno: foto("Mobile-Bagno-Sospeso-Con-Lavabo-Integrato-BN.webp", "wall-hung vanity with two deep drawers and an integrated basin top, floating off the floor"),
  sospeso_minimal: foto("Mobile-Bagno-Sospeso-Con-Lavabo-Ultrapiatto-BN.webp", "slim wall-hung vanity: one low drawer under a thin integrated basin top, floating off the floor"),
  // Il set del titolare non ha il mobile classico: foto vecchia, davvero in scala di grigi (scarto 1).
  a_terra_classico: foto("Mobile-Bagno-A-Terra-Classico-Piano-Marmo.webp", "floor-standing classic vanity: framed shaker doors and drawers on short feet, undermount basin set into the top", true),
  a_terra_industrial: foto("Mobile-Bagno-Industriale-Nero-Con-Doppio-Lavabo-BN.webp", "floor-standing industrial vanity: open metal frame on legs holding a drawer unit, vessel basins on the top"),
};

/** vanity.piano — MATERIA. */
export const VANITY_TOP_PHOTOS: PhotoTable = {
  quarzo: foto("Piano-In-Quarzo-Grigio-Chiaro-Lucidato.webp", "engineered quartz: fine uniform speckled grain, polished, no veining"),
};

/** vanity.lavabo — FORMA. */
export const BASIN_PHOTOS: PhotoTable = {
  integrato: foto("Mobile-Bagno-Sospeso-Con-Lavabo-Integrato-BN.webp", "integrated basin: the bowl is moulded into one continuous top with the counter, no separate bowl"),
  appoggio_ovale: foto("Lavabo-Ovale-In-Ceramica-Bianca-BN.webp", "oval vessel basin sitting on top of the counter, thin rim, tall single-lever mixer beside it"),
  appoggio_rettangolare: foto("Lavabo-Rettangolare-Bianco-Da-Appoggio-BN.webp", "rectangular vessel basin with thin walls sitting on top of the counter, tall mixer beside it"),
  semincasso: foto("Lavabo-Semincasso-In-Ceramica-Bianca-BN.webp", "semi-recessed basin: the bowl is set into the top and projects beyond the front of the cabinet"),
};

/** vanity.specchio — FORMA. */
export const MIRROR_PHOTOS: PhotoTable = {
  retroilluminato: foto("Specchio-Rettangolare-Con-Luce-LED-BN.webp", "rectangular frameless mirror with a soft LED glow all around its edges from behind"),
  specchiera_contenitore: foto("Specchiera-Bagno-Con-Anta-Aperta-BN.webp", "mirror cabinet: shallow wall box whose doors are mirrors, shelves inside"),
  tondo: foto("Specchio-Rotondo-Senza-Cornice-BN.webp", "round frameless wall mirror with a thin edge, no lighting"),
  verticale: foto("Specchio-Verticale-Con-Cornice-Sottile-BN.webp", "tall narrow full-height mirror with a thin frame, hung vertically on the wall"),
};

// ── Sanitari ───────────────────────────────────────────────────────────────

/** sanitari.tipo_wc — FORMA. */
export const TOILET_PHOTOS: PhotoTable = {
  sospeso: foto("WC-Sospeso-In-Ceramica-Bianca-BN.webp", "wall-hung WC: compact rounded bowl with slim seat and lid, fixed to the wall and floating off the floor"),
  rimless_sospeso: foto("WC-Sospeso-Bianco-Senza-Bordo-BN.webp", "wall-hung rimless WC: open bowl with no inner rim, fixed to the wall and floating off the floor"),
  a_terra: foto("WC-Monoblocco-Bianco-Ceramica-Lucida-BN.webp", "floor-standing WC: rounded bowl on its own pedestal foot resting on the floor"),
};

/** sanitari.tipo_bidet — FORMA. */
export const BIDET_PHOTOS: PhotoTable = {
  sospeso: foto("Bidet-Sospeso-In-Ceramica-Bianca-Lucida-BN.webp", "wall-hung bidet: rounded bowl fixed to the wall and floating off the floor, single-hole mixer on top"),
  a_terra: foto("Bidet-Bianco-Con-Miscelatore-BN.webp", "floor-standing bidet: rounded bowl on its own pedestal foot, single-hole mixer on top"),
};

/** sanitari.piastra_wc — FORMA. */
export const FLUSH_PLATE_PHOTOS: PhotoTable = {
  rettangolare_sottile: foto("Placca-WC-A-Doppio-Scarico-BN.webp", "rectangular flush plate with two side-by-side rectangular buttons, flush with the wall"),
  tonda_soft: foto("Placca-WC-Arrotondata-Con-Doppio-Pulsante-BN.webp", "flush plate with rounded corners and two round buttons, one large and one small"),
  vetro_minimal: foto("Placca-WC-In-Vetro-A-Sfioramento-BN.webp", "thin flat glass-look flush plate with two round touch rings, very low profile"),
};

/** sanitari.colore — MATERIA. Le tre foto mostrano un WC sospeso: vanno solo con sanitari sospesi. */
export const SANITARY_COLOUR_PHOTOS: PhotoTable = {
  bianco: foto("WC-Sospeso-In-Ceramica-Bianca.webp", "white vitreous ceramic with a glossy glaze and soft reflections"),
  grigio_chiaro: foto("WC-Sospeso-In-Ceramica-Grigio-Chiaro.webp", "light grey ceramic with a soft satin glaze"),
  nero_opaco: foto("WC-Sospeso-Nero-Opaco.webp", "matte black ceramic with a velvety non-reflective glaze"),
};

// ── Rubinetteria ───────────────────────────────────────────────────────────

/** rubinetteria.stile — FORMA. */
export const FAUCET_STYLE_PHOTOS: PhotoTable = {
  quadro_moderno: foto("Miscelatore-Lavabo-Cromato-Dal-Profilo-Squadrato-BN.webp", "square-profile single-lever basin mixer: flat rectangular body, flat spout and flat lever"),
  tondo_classico: foto("Miscelatore-Lavabo-Classico-Cromato-BN.webp", "classic rounded single-lever mixer: cylindrical body, curved arched spout, shaped lever"),
  industrial: foto("Rubinetto-Lavabo-Industriale-In-Metallo-Scuro-BN.webp", "industrial faucet built from threaded pipe sections, elbows and joints, with a side lever handle"),
  vintage_crosshead: foto("Rubinetto-Lavabo-Vintage-Cromato-A-Croce-BN.webp", "vintage two-handle mixer: cross-head handles either side of a tall swan-neck spout"),
};

/** rubinetteria.finitura — MATERIA. */
export const FAUCET_FINISH_PHOTOS: PhotoTable = {
  cromo: foto("Miscelatore-Da-Lavabo-Cromato-Moderno.webp", "polished chrome: mirror-like reflective metal"),
  nero_opaco: foto("Miscelatore-Da-Lavabo-Nero-Opaco.webp", "matte black: flat non-reflective black metal"),
  oro_spazzolato: foto("Miscelatore-Lavabo-Oro-Champagne-Spazzolato.webp", "brushed champagne gold: warm satin metal with fine brushing"),
  oro_rosa: foto("Miscelatore-Lavabo-Moderno-In-Oro-Rosa.webp", "brushed rose gold: warm pinkish copper-toned satin metal"),
  acciaio_spazzolato: foto("Miscelatore-Monocomando-In-Acciaio-Spazzolato.webp", "brushed stainless steel: cool satin metal with fine brushing"),
};

// ── Termoarredo e illuminazione (aggiunti al form il 04/10/2026) ───────────

/**
 * termoarredo.tipo — FORMA. Le cinque finiture (bianco, nero, antracite, cromo, acciaio) non hanno foto: sono colori
 * che il testo dice bene, e la foto di forma è comunque in bianco e nero.
 */
export const TOWEL_WARMER_PHOTOS: PhotoTable = {
  scaletta: foto("Termoarredo-A-Scaletta-BN.webp", "ladder towel warmer: two vertical side collectors joined by many thin round horizontal bars, wall brackets, small angled valves at the base of both collectors"),
  piastra_design: foto("Termoarredo-A-Piastra-Design-BN.webp", "flat-panel towel warmer: one smooth vertical plate standing slightly off the wall, a single slim towel bar across its front, valves at the bottom corners"),
  tubi_verticali: foto("Termoarredo-A-Tubi-Verticali-BN.webp", "vertical-tube towel warmer: a row of slim round vertical tubes joined by top and bottom collectors, one towel bar across the front, valves at the base"),
};

/** illuminazione_tipo — FORMA. Le foto mostrano il corpo illuminante dentro un bagno: l'etichetta dice di copiare solo lui. */
export const LIGHTING_PHOTOS: PhotoTable = {
  faretti_incasso: foto("Faretti-A-Incasso-Soffitto-Bagno-BN.webp", "recessed ceiling downlights: six small round fixtures set flush in a flat smooth ceiling, three evenly spaced rows of two, no stepped false ceiling"),
  led_lineare: foto("Profilo-LED-Lineare-A-Soffitto-Bagno-BN.webp", "continuous linear LED set in a slim recessed profile along the edge where the flat smooth ceiling meets the wall, giving soft indirect light"),
  applique_specchio: foto("Applique-Ai-Lati-Dello-Specchio-BN.webp", "pair of slim vertical wall lights, one on each side of a rectangular wall mirror above the washbasin, mounted at mirror height"),
  plafoniera: foto("Plafoniera-Tonda-A-Soffitto-Bagno-BN.webp", "single slim round ceiling light with a flat disc diffuser and thin rim, sitting almost flush on a flat smooth ceiling"),
};

// ── Piastrelle (parete e pavimento: stessa libreria di effetti) ────────────

/** piastrelle_parete.effetto / pavimento.effetto — MATERIA. */
export const TILE_EFFECT_PHOTOS: PhotoTable = {
  marmo_carrara: foto("Piastrelle-In-Marmo-Carrara-Lucido.webp", "Carrara marble: white ground with soft grey veining, polished"),
  marmo_calacatta: foto("Piastrelle-In-Marmo-Calacatta-Venato.webp", "Calacatta marble: warm white ground with bold grey and gold veins, polished"),
  marmo_sahara_noir: foto("Piastrelle-Sahara-Noir-Lucide-Con-Venature-Oro-Ocra.webp", "Sahara Noir marble: deep black with gold-ochre veins, polished"),
  marmo_marquinia: foto("Piastrelle-In-Marmo-Marquinia-Griglia-2x2.webp", "Nero Marquinia marble: black with thin crisp white veins, polished"),
  marmo_verde_guatemala: foto("Piastrelle-In-Marmo-Verde-Guatemala.webp", "Verde Guatemala marble: deep green stone with dense light veining, polished"),
  marmo_statuario: foto("Piastrelle-In-Marmo-Statuario.webp", "Statuario marble: bright white with broad dramatic grey veins, polished"),
  marmo_emperador: foto("Piastrelle-In-Marmo-Emperador-Lucidato.webp", "Emperador marble: warm brown with cream crackle veining, polished"),
  cemento_grigio: foto("Piastrelle-Effetto-Cemento-Grigio-Opaco.webp", "grey concrete-effect porcelain: matte, with soft cloudy trowel variation"),
  cemento_bianco: foto("Piastrelle-Effetto-Cemento-Nuvolato.webp", "light concrete-effect porcelain: off-white matte with soft cloudy patches"),
  cemento_antracite: foto("Piastrelle-Antracite-Effetto-Cemento.webp", "anthracite concrete-effect porcelain: dark matte with a subtle cloudy texture"),
  legno_rovere_chiaro: foto("Piastrelle-Effetto-Legno-Rovere-Chiaro.webp", "light oak wood-effect planks: natural straight grain, matte"),
  legno_rovere_scuro: foto("Piastrelle-In-Gres-Effetto-Rovere-Scuro.webp", "dark oak wood-effect planks: deep brown grain with small knots"),
  legno_wenge: foto("Piastrelle-Effetto-Legno-Wenge-Sfalsate.webp", "wenge wood-effect planks: very dark brown with a fine dense grain"),
  ardesia: foto("Piastrelle-In-Ardesia-Grigio-Scuro.webp", "slate tiles: dark charcoal natural cleft surface with a layered texture"),
  pietra_ardesia: foto("Ardesia-Naturale-Color-Carbone.webp", "split-face slate: irregular charcoal stone pieces with deep relief and broken edges"),
  travertino: foto("Piastrelle-Di-Travertino-Beige-Naturale.webp", "travertine: warm beige limestone with banded veins and small natural pores"),
  basalto: foto("Piastrelle-In-Basalto-Scuro.webp", "basalt: dark grey volcanic stone with a very fine compact grain, matte"),
  mosaico_esagoni: foto("Mosaico-Esagonale-Bianco-Lucido.webp", "hexagonal mosaic: small glossy hexagons with a visible grout grid"),
  mosaico_penny: foto("Mosaico-Penny-Round-Bianco-Con-Fughe-Taupe.webp", "penny round mosaic: small glossy discs set in contrasting grout"),
  zellige: foto("Piastrelle-Zellige-Azzurro-Verde-Artigianali.webp", "zellige: small handmade glazed squares with an uneven glossy surface and varying tones"),
  cotto_toscano: foto("Piastrelle-In-Cotto-Toscano-Artigianali.webp", "Tuscan cotto: handmade terracotta squares with warm tonal variation"),
  resina_spatolata: foto("Microcemento-Spatolato-Dalle-Delicate-Sfumature.webp", "trowelled microcement: seamless continuous surface with soft cloudy variation"),
};

/** Ogni tabella con il campo del form che la sceglie (per i test e per le miniature del form). */
export const BATHROOM_PHOTO_TABLES = {
  "doccia.tipo": SHOWER_TYPE_PHOTOS,
  "doccia.box_vetro": SHOWER_GLASS_PHOTOS,
  "doccia.profilo": SHOWER_PROFILE_PHOTOS,
  "doccia.piatto": SHOWER_TRAY_PHOTOS,
  "doccia.soffione": SHOWER_HEAD_PHOTOS,
  "doccia.nicchia": SHOWER_NICHE_PHOTOS,
  "doccia.scarico": SHOWER_DRAIN_PHOTOS,
  "vasca.tipo": BATHTUB_TYPE_PHOTOS,
  "vasca.materiale": BATHTUB_MATERIAL_PHOTOS,
  "vasca.rubinetteria_vasca": BATHTUB_FAUCET_PHOTOS,
  "vasca.parete_doccia": BATH_SCREEN_PHOTOS,
  "vanity.stile": VANITY_STYLE_PHOTOS,
  "vanity.piano": VANITY_TOP_PHOTOS,
  "vanity.lavabo": BASIN_PHOTOS,
  "vanity.specchio": MIRROR_PHOTOS,
  "sanitari.tipo_wc": TOILET_PHOTOS,
  "sanitari.tipo_bidet": BIDET_PHOTOS,
  "sanitari.piastra_wc": FLUSH_PLATE_PHOTOS,
  "sanitari.colore": SANITARY_COLOUR_PHOTOS,
  "rubinetteria.stile": FAUCET_STYLE_PHOTOS,
  "rubinetteria.finitura": FAUCET_FINISH_PHOTOS,
  "termoarredo.tipo": TOWEL_WARMER_PHOTOS,
  "illuminazione_tipo": LIGHTING_PHOTOS,
  "piastrelle.effetto": TILE_EFFECT_PHOTOS,
} as const satisfies Record<string, PhotoTable>;

/**
 * Opzioni vere del form senza foto, col motivo. Il test controlla che ogni opzione
 * abbia una foto o stia qui.
 */
export const SENZA_FOTO: Record<string, Record<string, string>> = {
  "doccia.nicchia": {
    nessuna: "nessuna nicchia: non c'è niente da mostrare, il testo dice di lasciare le pareti piane",
  },
  "doccia.scarico": {
    canalina: "foto non ancora consegnata (Canalina-Doccia-Lineare-A-Filo-Parete, da rigenerare): per ora le parole; quando arriva entra in SHOWER_DRAIN_PHOTOS e questa voce si toglie",
  },
  "vasca.parete_doccia": {
    nessuna: "nessuna parete: la vasca resta aperta, non c'è niente da mostrare",
    girevole: "foto non ancora consegnata (Parete-Vasca-Girevole-In-Vetro, da rigenerare): per ora le parole; quando arriva entra in BATH_SCREEN_PHOTOS e questa voce si toglie",
  },
  "vasca.materiale": {
    acrilico_bianco: "il set non ha una foto dell'acrilico; «white acrylic, smooth glossy» è una finitura che il modello conosce",
    pietra: "il set non ha una foto della vasca in pietra; le foto di pietra del set sono piastrelle con fughe, che su una vasca porterebbero i giunti",
  },
  "vanity.piano": {
    marmo_bianco: "il set non ha un piano in marmo: le foto di marmo sono piastrelle con fughe, che su un top in un pezzo solo porterebbero i giunti",
    marmo_nero: "come marmo_bianco: le foto di marmo nero del set sono piastrelle con fughe",
    legno: "le foto di legno del set sono listoni da pavimento con le giunte: su un top porterebbero le fughe",
    ceramica: "piano liscio in tinta unita: bastano le parole",
  },
  "piastrelle.effetto": {
    mono_bianco: "tinta unita: il colore lo dicono le parole, una foto aggiungerebbe solo un formato e una fuga che non sono stati scelti",
    mono_nero: "tinta unita: bastano le parole",
    mono_grigio: "tinta unita: bastano le parole",
    mono_verde_salvia: "tinta unita: bastano le parole",
    mono_blu_navy: "tinta unita: bastano le parole",
    mono_terracotta: "tinta unita: bastano le parole",
    mono_greige: "tinta unita: bastano le parole",
  },
  "sanitari.piastra_wc_colore": {
    bianco: "colore di un oggetto piccolo (la placca): bastano le parole, e la forma arriva già dalla foto della placca",
    nero_opaco: "colore della placca: bastano le parole",
    cromo: "colore della placca: bastano le parole",
    acciaio_spazzolato: "colore della placca: bastano le parole",
    oro_rosa: "colore della placca: bastano le parole",
    ottone_spazzolato: "colore della placca: bastano le parole",
  },
};

// ── Cosa copiare, quando la foto mostra più di una cosa ─────────────────────

const BN = BLACK_AND_WHITE_RULE;
const COPIA = {
  vasca: `Copy only the tub body (shape, rim, how it meets the walls or the floor), not the faucet in the photo — ${BN}`,
  mobile: `Copy only the cabinet construction (mounting, drawers, legs), not the basin count or the objects on it — ${BN}`,
  wcATerra: `Copy only the floor-standing bowl and its foot; the cistern follows the written specification, not the tank in the photo — ${BN}`,
  pianoDoccia: `Copy only the floor-level construction (no step, no raised edge), not the room around it — ${BN}`,
  // Con uno scarico scelto nel form, quello della foto del piatto (canalina, o tondo, o con griglia) non vale: lo dice il testo.
  pianoDocciaSenzaScarico: `Copy only the floor-level construction (no step, no raised edge), not the drain or the room around it — ${BN}`,
  piattoSenzaScarico: `Copy only the tray body (outline and edge height), not its drain: the drain follows the written drain specification — ${BN}`,
  scarico: `Copy only the drain (its shape, the flat grate flush with the floor, the gentle slope towards it), not the floor, walls or tiles around it — ${BN}`,
  nicchia: `Copy only the recessed niche (its proportions, the shelf if any, the mitred tile edges), not the shower fittings, glass or wall tiles in the photo; the wall finish follows the written specification — ${BN}`,
  pareteVasca: `Copy only the glass screen and the hand shower on its slide rail, not the tub, taps or tiles in the photo; the tub follows the bathtub type — ${BN}`,
  termoarredo: `Copy only the towel warmer's construction (collectors, bars or plate, valves, brackets), not the room around it; its size and position follow the written specification — ${BN}`,
  luci: {
    faretti_incasso: `Copy only the ceiling downlights (small round fixtures flush in a flat ceiling, in a regular layout), not the room, glass or mirror in the photo; how many follows the room size — ${BN}`,
    led_lineare: `Copy only the continuous LED line in its slim recessed profile along the ceiling edge, not the furniture, lit niche, under-cabinet glow or other lights in the photo — ${BN}`,
    applique_specchio: `Copy only the two slim wall lights, one on each side of the mirror, not the mirror, vanity or basin in the photo; those follow the written specification — ${BN}`,
    plafoniera: `Copy only the single slim round ceiling light, not the shower glass, mirror or walls at the edges of the photo — ${BN}`,
  } as Record<string, string>,
  specchiera: `Copy the shape and construction only, with the doors closed — ${BN}`,
  vetro: "Copy only the glass transparency and texture; the enclosure layout comes from the shower type",
  profilo: "Copy only the frame finish and how slim it is; the enclosure layout comes from the shower type",
  materialeVasca: "Copy only the surface (sheen and texture); the tub shape comes from the bathtub type",
  piano: "Copy only the top surface (grain and sheen); the vanity shape comes from the written specification",
  ceramica: "Copy only the ceramic colour and sheen; the fixture shape comes from the written specification",
  finituraRubinetti: "Copy only the metal finish (tone, sheen, brushing); the faucet shape comes from the written specification",
  piastrelle: "Copy only the material look (veining, grain, texture, tone variation); tile size, laying pattern and grout come from the written specification",
} as const;

// ── Scelta delle foto ──────────────────────────────────────────────────────

/**
 * Priorità (più basso = più importante). Le condivise sono al massimo 3 e le immagini in
 * tutto 4, col catalogo dell'azienda davanti: quando cambiano tante cose insieme entrano
 * prima quelle che occupano più immagine e che il modello sbaglia di più a parole.
 *  - 10-19 struttura che cambia la sagoma della stanza: tipo di doccia (anche la
 *    conversione vasca→doccia), tipo di vasca.
 *  - 20-29 superfici grandi: il rivestimento a parete prima del pavimento, perché in una
 *    foto di bagno le pareti occupano molta più immagine del pavimento e circondano doccia
 *    e vasca. Se parete e pavimento hanno lo stesso effetto la foto è una sola, per tutti e due.
 *  - 30-39 volumi: mobile, WC, bidet.
 *  - 40-59 dettagli: vetro e profilo del box (il vetro è grande), piatto, soffione, materiale e
 *    rubinetto della vasca, lavabo, specchio, piano, colore dei sanitari, placca, stile e finitura
 *    dei rubinetti; poi (05/10/2026) gli elementi aggiunti, dal più grande al più piccolo:
 *    termoarredo, parete sopravasca, illuminazione, nicchia, scarico. Il bianco dei sanitari va
 *    per ultimo: è il colore che il modello sbaglia di rado.
 */
export const BATHROOM_REFERENCE_PRIORITY = {
  doccia_tipo: 10,
  vasca_tipo: 11,
  piastrelle_parete: 20,
  piastrelle_pavimento: 21,
  mobile_stile: 30,
  wc_tipo: 31,
  bidet_tipo: 32,
  doccia_vetro: 40,
  doccia_profilo: 41,
  doccia_piatto: 42,
  doccia_soffione: 43,
  vasca_materiale: 44,
  vasca_rubinetto: 45,
  lavabo_tipo: 46,
  specchio_tipo: 47,
  mobile_piano: 48,
  sanitari_colore: 49,
  placca_stile: 50,
  rubinetto_stile: 51,
  rubinetto_finitura: 52,
  termoarredo_tipo: 54,
  vasca_parete: 55,
  illuminazione_tipo: 56,
  doccia_nicchia: 57,
  doccia_scarico: 58,
  sanitari_colore_bianco: 59,
} as const;

type Gruppo = Exclude<keyof typeof BATHROOM_REFERENCE_PRIORITY, "sanitari_colore_bianco">;

/**
 * Categorie del catalogo render (render_catalog_assets.categoria) → elementi che la foto
 * del prodotto dell'azienda già mostra: la foto generica dello stesso elemento non si allega
 * (due foto diverse dello stesso oggetto si contraddicono, e lo slot serve a un altro elemento).
 */
const CATALOGO_COPRE: Record<string, readonly Gruppo[]> = {
  box_doccia: ["doccia_tipo", "doccia_vetro", "doccia_profilo"],
  piatto_doccia: ["doccia_piatto"],
  soffione: ["doccia_soffione"],
  vasca: ["vasca_tipo", "vasca_materiale"],
  mobile_bagno: ["mobile_stile", "mobile_piano"],
  lavabo: ["lavabo_tipo"],
  specchio: ["specchio_tipo"],
  wc: ["wc_tipo", "sanitari_colore"],
  bidet: ["bidet_tipo"],
  rubinetteria: ["rubinetto_stile", "rubinetto_finitura"],
  piastrella_parete: ["piastrelle_parete"],
  pavimento: ["piastrelle_pavimento"],
};

interface Sezione { attivo?: boolean | null }

type FlagSostituzione = "piastrelle_parete" | "pavimento" | "doccia" | "vasca" | "mobile_bagno" | "sanitari" | "rubinetteria" | "termoarredo" | "illuminazione";

/** I campi del form (legacy_config del payload v2) che decidono le foto. Tutto opzionale: arriva da JSON salvato. */
export interface BathroomReferenceConfig {
  sostituzione?: Partial<Record<FlagSostituzione, unknown>> | null;
  doccia?: (Sezione & { tipo?: string; box_vetro?: string; profilo?: string; piatto?: string; soffione?: string; nicchia?: string; scarico?: string }) | null;
  vasca?: (Sezione & { tipo?: string; materiale?: string; rubinetteria_vasca?: string; parete_doccia?: string }) | null;
  /** Termoarredo: `azione` decide se si monta un modello nuovo (sostituisci, aggiungi) o si toglie (rimuovi). */
  termoarredo?: (Sezione & { azione?: string; tipo?: string }) | null;
  /** Una chiave di LIGHTING_PHOTOS, o un testo libero delle sessioni vecchie (nessuna foto). Non ha una sezione «attivo»: conta l'interruttore `sostituzione.illuminazione`. */
  illuminazione_tipo?: string | null;
  vanity?: (Sezione & { stile?: string; piano?: string; lavabo?: string; specchio?: string }) | null;
  sanitari?: (Sezione & {
    azione_wc?: string; tipo_wc?: string; azione_bidet?: string; tipo_bidet?: string;
    colore?: string; piastra_wc?: string;
  }) | null;
  rubinetteria?: (Sezione & { finitura?: string; stile?: string }) | null;
  piastrelle_parete?: (Sezione & { effetto?: string }) | null;
  pavimento?: (Sezione & { effetto?: string }) | null;
}

export interface BathroomReferenceOptions {
  /** Categorie del catalogo dell'azienda già allegate a questo render. */
  categorieCatalogo?: readonly string[];
}

const WC_SOSPESI = new Set(["sospeso", "rimless_sospeso"]);

/** Le vasche che stanno libere dalle pareti: su una freestanding la parete sopravasca non si monta (stessa regola di inferBathScreenRule). */
const VASCHE_FREESTANDING = new Set(["freestanding_ovale", "freestanding_rettangolare"]);

/**
 * Lo scarico che il prompt costruisce davvero, o undefined se il form non ne indica uno. Una canalina lineare
 * non segue il bordo curvo di un piatto semicircolare: il builder (inferShowerDrainType) scrive «piletta»,
 * e la foto deve dire lo stesso.
 */
function scaricoEffettivo(scarico: string | undefined, tipoDoccia: string | undefined): "canalina" | "piletta" | undefined {
  if (scarico !== "canalina" && scarico !== "piletta") return undefined;
  return scarico === "canalina" && tipoDoccia === "semicircolare" ? "piletta" : scarico;
}

/** Cosa copiare dalla foto del piatto: con uno scarico scelto nel form, quello della foto (tondo, a griglia, canalina) non vale. */
function copiaPiatto(piatto: string | undefined, scaricoScelto: boolean): string | undefined {
  if (piatto === "filo_pavimento") return scaricoScelto ? COPIA.pianoDocciaSenzaScarico : COPIA.pianoDoccia;
  return scaricoScelto ? COPIA.piattoSenzaScarico : undefined;
}

/**
 * Le foto condivise per un render bagno, già etichettate e ordinate (max 3). Stesso
 * gating del builder del prompt (buildBathroomRenderConfig): una sezione cambia solo se
 * `sostituzione.<sezione>` E `<sezione>.attivo` sono veri. Prima bastava uno dei due: una
 * sezione spenta nel prompt poteva comunque mandare la sua foto.
 */
export function collectBathroomReferenceImages(
  config: BathroomReferenceConfig | Record<string, unknown>,
  opzioni: BathroomReferenceOptions = {},
): SharedReferenceImage[] {
  const c = (config ?? {}) as BathroomReferenceConfig;
  const s = (c.sostituzione ?? {}) as Record<string, unknown>;
  const cambia = (flag: FlagSostituzione, sezione: Sezione | null | undefined): boolean => s[flag] === true && sezione?.attivo === true;
  const coperti = new Set<Gruppo>((opzioni.categorieCatalogo ?? []).flatMap((cat) => CATALOGO_COPRE[cat] ?? []));

  const candidate: ReferenceCandidate[] = [];
  const aggiungi = (gruppo: Gruppo, role: string, table: PhotoTable, key: string | null | undefined, copy?: string, priority?: number) => {
    if (!key || coperti.has(gruppo)) return;
    const entry = table[key];
    if (!entry) return;
    candidate.push({ priority: priority ?? BATHROOM_REFERENCE_PRIORITY[gruppo], role, key, entry, ...(copy ? { copy } : {}) });
  };

  if (cambia("doccia", c.doccia)) {
    const d = c.doccia!;
    aggiungi("doccia_tipo", "SHOWER TYPE TARGET", SHOWER_TYPE_PHOTOS, d.tipo);
    aggiungi("doccia_vetro", "SHOWER GLASS TARGET", SHOWER_GLASS_PHOTOS, d.box_vetro, COPIA.vetro);
    aggiungi("doccia_profilo", "SHOWER PROFILE FINISH TARGET", SHOWER_PROFILE_PHOTOS, d.profilo, COPIA.profilo);
    const scarico = scaricoEffettivo(d.scarico, d.tipo);
    aggiungi("doccia_piatto", "SHOWER TRAY TARGET", SHOWER_TRAY_PHOTOS, d.piatto, copiaPiatto(d.piatto, scarico !== undefined));
    aggiungi("doccia_soffione", "SHOWER HEAD TARGET", SHOWER_HEAD_PHOTOS, d.soffione);
    // Nicchia nella parete e scarico: il builder li scrive solo quando il form li indica («nessuna» = pareti piane, niente foto).
    aggiungi("doccia_nicchia", "SHOWER NICHE TARGET", SHOWER_NICHE_PHOTOS, d.nicchia, COPIA.nicchia);
    aggiungi("doccia_scarico", "SHOWER DRAIN TARGET", SHOWER_DRAIN_PHOTOS, scarico, COPIA.scarico);
  }

  if (cambia("vasca", c.vasca)) {
    const v = c.vasca!;
    aggiungi("vasca_tipo", "BATHTUB TYPE TARGET", BATHTUB_TYPE_PHOTOS, v.tipo, COPIA.vasca);
    aggiungi("vasca_materiale", "BATHTUB MATERIAL TARGET", BATHTUB_MATERIAL_PHOTOS, v.materiale, COPIA.materialeVasca);
    aggiungi("vasca_rubinetto", "BATHTUB FAUCET TARGET", BATHTUB_FAUCET_PHOTOS, v.rubinetteria_vasca);
    // Parete sopravasca: solo su una vasca contro parete (su una freestanding il builder scrive «nessuna parete»).
    if (!VASCHE_FREESTANDING.has(v.tipo ?? "")) {
      aggiungi("vasca_parete", "BATH SCREEN TARGET", BATH_SCREEN_PHOTOS, v.parete_doccia, COPIA.pareteVasca);
    }
  }

  // Termoarredo: la foto parte solo quando si monta un modello nuovo (sostituisci, aggiungi); «rimuovi» non ha forma da mostrare.
  // Senza un tipo valido il builder descrive la scaletta (buildTowelWarmerSpec): la foto segue.
  if (cambia("termoarredo", c.termoarredo)) {
    const t = c.termoarredo!;
    if (t.azione === "sostituisci" || t.azione === "aggiungi") {
      const tipo = t.tipo && Object.prototype.hasOwnProperty.call(TOWEL_WARMER_PHOTOS, t.tipo) ? t.tipo : "scaletta";
      aggiungi("termoarredo_tipo", "TOWEL WARMER TARGET", TOWEL_WARMER_PHOTOS, tipo, COPIA.termoarredo);
    }
  }

  // Illuminazione: nessuna sezione «attivo», basta l'interruttore e un tipo scelto (come lighting.replace nel builder).
  // Un testo libero delle sessioni vecchie non è una chiave: nessuna foto.
  if (s.illuminazione === true) {
    const luce = c.illuminazione_tipo?.trim();
    if (luce && Object.prototype.hasOwnProperty.call(LIGHTING_PHOTOS, luce)) {
      aggiungi("illuminazione_tipo", "LIGHTING TARGET", LIGHTING_PHOTOS, luce, COPIA.luci[luce]);
    }
  }

  // Parete e pavimento leggono la stessa libreria: con lo stesso effetto la foto è una sola.
  const parete = cambia("piastrelle_parete", c.piastrelle_parete) && !coperti.has("piastrelle_parete")
    ? c.piastrelle_parete?.effetto : undefined;
  const pavimento = cambia("pavimento", c.pavimento) && !coperti.has("piastrelle_pavimento")
    ? c.pavimento?.effetto : undefined;
  if (parete && parete === pavimento) {
    aggiungi("piastrelle_parete", "WALL AND FLOOR TILE EFFECT TARGET", TILE_EFFECT_PHOTOS, parete, COPIA.piastrelle);
  } else {
    aggiungi("piastrelle_parete", "WALL TILE EFFECT TARGET", TILE_EFFECT_PHOTOS, parete, COPIA.piastrelle);
    aggiungi("piastrelle_pavimento", "FLOOR TILE EFFECT TARGET", TILE_EFFECT_PHOTOS, pavimento, COPIA.piastrelle);
  }

  if (cambia("mobile_bagno", c.vanity)) {
    const m = c.vanity!;
    aggiungi("mobile_stile", "VANITY STYLE TARGET", VANITY_STYLE_PHOTOS, m.stile, COPIA.mobile);
    aggiungi("lavabo_tipo", "WASHBASIN TYPE TARGET", BASIN_PHOTOS, m.lavabo);
    // Lo specchio cambia con il mobile; senza scelta il builder mette il retroilluminato.
    const specchio = m.specchio || "retroilluminato";
    aggiungi("specchio_tipo", "MIRROR TYPE TARGET", MIRROR_PHOTOS, specchio, specchio === "specchiera_contenitore" ? COPIA.specchiera : undefined);
    aggiungi("mobile_piano", "VANITY TOP MATERIAL TARGET", VANITY_TOP_PHOTOS, m.piano, COPIA.piano);
  }

  if (cambia("sanitari", c.sanitari)) {
    const sa = c.sanitari!;
    const wcNuovo = sa.azione_wc === "sostituisci";
    const bidetNuovo = sa.azione_bidet === "sostituisci" || sa.azione_bidet === "aggiungi";
    const tipoBidet = sa.tipo_bidet || "sospeso";
    if (wcNuovo) aggiungi("wc_tipo", "TOILET TYPE TARGET", TOILET_PHOTOS, sa.tipo_wc, sa.tipo_wc === "a_terra" ? COPIA.wcATerra : undefined);
    if (bidetNuovo) aggiungi("bidet_tipo", "BIDET TYPE TARGET", BIDET_PHOTOS, tipoBidet);
    // La placca c'è solo col WC sospeso nuovo (stessa regola del builder).
    if (wcNuovo && WC_SOSPESI.has(sa.tipo_wc ?? "")) {
      aggiungi("placca_stile", "FLUSH PLATE TARGET", FLUSH_PLATE_PHOTOS, sa.piastra_wc || "rettangolare_sottile");
    }
    // Le foto del colore mostrano un WC sospeso: con un sanitario nuovo a terra spingerebbero la forma sbagliata.
    const nuoviSospesi = [wcNuovo ? WC_SOSPESI.has(sa.tipo_wc ?? "") : null, bidetNuovo ? tipoBidet === "sospeso" : null]
      .filter((x): x is boolean => x !== null);
    if (nuoviSospesi.length > 0 && nuoviSospesi.every(Boolean)) {
      const prio = sa.colore === "bianco" ? BATHROOM_REFERENCE_PRIORITY.sanitari_colore_bianco : undefined;
      aggiungi("sanitari_colore", "SANITARY CERAMIC COLOUR TARGET", SANITARY_COLOUR_PHOTOS, sa.colore, COPIA.ceramica, prio);
    }
  }

  if (cambia("rubinetteria", c.rubinetteria)) {
    const r = c.rubinetteria!;
    aggiungi("rubinetto_stile", "FAUCET STYLE TARGET", FAUCET_STYLE_PHOTOS, r.stile);
    aggiungi("rubinetto_finitura", "FAUCET FINISH TARGET", FAUCET_FINISH_PHOTOS, r.finitura, COPIA.finituraRubinetti);
  }

  return pickReferences(candidate);
}

/** Tutti i percorsi «cartella/file» dichiarati (per i test sull'esistenza dei file e delle miniature). */
export function listBathroomReferencePaths(): string[] {
  return listReferencePaths(...Object.values(BATHROOM_PHOTO_TABLES));
}
