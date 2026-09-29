/**
 * «Copia configurazione su…»: dopo aver configurato il modello di un intervento,
 * il titolare lo copia su altri interventi. La copia è INDIPENDENTE — sono record
 * JSON separati per chiave in modelli_libreria_azienda (vedi archivioModelli.ts):
 * modificare la copia non tocca l'originale.
 *
 * Due modi:
 *  - STESSO TIPO (stessa forma di template): si copia TUTTO, riscrivendo solo
 *    l'identità (id/company/modulo, e `pdf_blocchi.modulo_intervento` dove esiste
 *    — obbligatorio per fotovoltaico, elettrico e piscine, che lo validano).
 *  - TIPO DIVERSO: si parte dai valori predefiniti del tipo di destinazione e si
 *    sovrappongono SOLO i campi comuni certi (anagrafica, branding, testi
 *    generali) che esistono con lo stesso nome sul tipo di destinazione. Le parti
 *    tecniche restano ai valori predefiniti. Mai una copia grezza JSON tra tipi
 *    diversi: l'`assertRecord` della destinazione la rifiuterebbe.
 *
 * `copiaStessoTipo` e `copiaCampiComuni` sono pure e testabili. Il resto (registro
 * load/save/createDefault) usa le funzioni per-area già esistenti e passa dalla
 * stessa porta online del salvataggio normale, quindi l'avviso MODELLO_NON_ONLINE
 * scatta come sempre se l'online non va.
 */
import { findSerramentiTemplateModule, createSerramentiModuleTemplate, type SerramentiTemplateModuleId } from "./serramentiTemplateModules";
import { loadLocalSerramentiTemplate, saveLocalSerramentiTemplate } from "./localSerramentiTemplates";
import { findTettiTemplateModule, createTettiModuleTemplate, type TettiTemplateModuleId } from "./tettiTemplateModules";
import { loadLocalTettiTemplate, saveLocalTettiTemplate } from "./localTettiTemplates";
import { isFullFvModuleId, createFullFvTemplate, type FullFvModuleId } from "./fullFvModules";
import { loadLocalFvTemplate, saveLocalFvTemplate } from "./localFvTemplates";
import { isFullRstModuleId, createFullRstTemplate, type FullRstModuleId } from "./fullRstModules";
import { loadLocalRstTemplate, saveLocalRstTemplate } from "./localRstTemplates";
import { isFullBgnModuleId, createFullBgnTemplate, type FullBgnModuleId } from "./fullBgnModules";
import { loadLocalBgnTemplate, saveLocalBgnTemplate } from "./localBgnTemplates";
import { isFullIdrModuleId, createFullIdrTemplate, type FullIdrModuleId } from "./fullIdrModules";
import { loadLocalIdrTemplate, saveLocalIdrTemplate } from "./localIdrTemplates";
import { isFullClmModuleId, createFullClmTemplate, type FullClmModuleId } from "./fullClmModules";
import { loadLocalClmTemplate, saveLocalClmTemplate } from "./localClmTemplates";
import { isFullEltModuleId, createFullEltTemplate, type FullEltModuleId } from "./fullEltModules";
import { loadLocalEltTemplate, saveLocalEltTemplate } from "./localEltTemplates";
import { isFullPavModuleId, createFullPavTemplate, type FullPavModuleId } from "./fullPavModules";
import { loadLocalPavTemplate, saveLocalPavTemplate } from "./localPavTemplates";
import { isFullPscModuleId, createFullPscTemplate, type FullPscModuleId } from "./fullPscModules";
import { loadLocalPscTemplate, saveLocalPscTemplate } from "./localPscTemplates";
import { loadModuleDocument, saveModuleDocument } from "./localModuleDocuments";
import { createModuleDocument, type ModuleDocument } from "./moduleDocuments";
import { archivioModelliAzienda } from "./archivioModelli";
import type { BgnTemplatePdf } from "@/types/bagni";
import type { ClmTemplatePdf } from "@/types/climatizzazione";
import type { EleTemplatePdf } from "@/types/elettrico";
import type { PisTemplatePdf } from "@/types/piscine";
import type { IdrTemplatePdf } from "@/types/termoidraulico";
import type { RstTemplatePdf } from "@/types/ristrutturazione";
import type { TetTemplatePdf } from "@/types/tetti";
import type { FvTemplate } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";

type PortaStorage = Pick<Storage, "getItem" | "setItem">;

/** Anagrafica dell'azienda, come la costruisce la libreria per il documento essenziale. */
export interface AnagraficaDocumento { name: string; address: string; email: string; phone: string }

/** I tipi di modello, uno per forma di template. `documento` è il fallback essenziale. */
export type TipoModello =
  | "serramenti" | "tetti" | "fv" | "rst" | "bgn"
  | "idr" | "clm" | "elt" | "pav" | "psc" | "documento";

/** Un modello caricato: la data dell'ultimo salvataggio e il template grezzo. */
export interface ModelloCaricato { savedAt: string; template: unknown }

/**
 * Che tipo di modello ha l'intervento (area, modulo). Rispecchia ESATTAMENTE
 * l'instradamento della libreria (ModuleTemplateLibrary): stessa area, stesse
 * guardie `isFull*`/`find*`. Se nessuna combacia è il documento essenziale.
 */
export function risolviTipoModello(areaId: string, moduleId: string): TipoModello {
  if (areaId === "serramenti" && findSerramentiTemplateModule(moduleId)) return "serramenti";
  if (areaId === "tetti" && findTettiTemplateModule(moduleId)) return "tetti";
  if (areaId === "fotovoltaico" && isFullFvModuleId(moduleId)) return "fv";
  if ((areaId === "ristrutturazioni" || areaId === "pareti-soffitti" || areaId === "pergole" || areaId === "facciate") && isFullRstModuleId(moduleId)) return "rst";
  if (areaId === "bagni" && isFullBgnModuleId(moduleId)) return "bgn";
  if (areaId === "termoidraulica" && isFullIdrModuleId(moduleId)) return "idr";
  if (areaId === "climatizzazione" && isFullClmModuleId(moduleId)) return "clm";
  if (areaId === "elettrico" && isFullEltModuleId(moduleId)) return "elt";
  if ((areaId === "pavimenti" || areaId === "giardini") && isFullPavModuleId(moduleId)) return "pav";
  if (areaId === "piscine" && isFullPscModuleId(moduleId)) return "psc";
  return "documento";
}

/** Prefisso dell'`id` del template locale, per tipo (vedi gli `assertRecord` per-area). */
const PREFISSO_ID: Record<Exclude<TipoModello, "documento">, string> = {
  serramenti: "local-serramenti", tetti: "local-tetti", fv: "local-fotovoltaico",
  rst: "local-ristrutturazioni", bgn: "local-bagni", idr: "local-termoidraulica",
  clm: "local-climatizzazione", elt: "local-elettrico", pav: "local-pavimenti", psc: "local-piscine",
};

const eObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/**
 * Riscrive l'identità del template sulla destinazione, in loco:
 *  - documento: companyId / areaId / moduleId;
 *  - altri: company_id, id = `<prefisso>-<modulo>`, e — dove esiste —
 *    `pdf_blocchi.modulo_intervento` (e la copia in `modulo_defaults`).
 * Fotovoltaico, elettrico e piscine validano `modulo_intervento`: senza questo
 * passaggio il salvataggio della copia verrebbe rifiutato.
 */
export function applicaIdentita(tipo: TipoModello, template: unknown, companyId: string, areaId: string, moduleId: string): unknown {
  if (!eObj(template)) return template;
  if (tipo === "documento") {
    template.companyId = companyId;
    template.areaId = areaId;
    template.moduleId = moduleId;
    return template;
  }
  template.company_id = companyId;
  template.id = `${PREFISSO_ID[tipo]}-${moduleId}`;
  const blocchi = template.pdf_blocchi;
  if (eObj(blocchi)) {
    if ("modulo_intervento" in blocchi) blocchi.modulo_intervento = moduleId;
    const def = blocchi.modulo_defaults;
    if (eObj(def) && "modulo_intervento" in def) def.modulo_intervento = moduleId;
  }
  return template;
}

/**
 * STESSO TIPO: clona a fondo il template sorgente (copia indipendente) e riscrive
 * solo l'identità sulla destinazione. Copia TUTTO — stesso tipo, stessa forma.
 */
export function copiaStessoTipo<T>(sorgente: T, tipo: TipoModello, destAreaId: string, destModuleId: string, companyId: string): T {
  const clone = structuredClone(sorgente);
  applicaIdentita(tipo, clone, companyId, destAreaId, destModuleId);
  return clone;
}

/**
 * TIPO DIVERSO: parte dai valori predefiniti della destinazione (`baseDestinazione`,
 * già con la sua identità e le sue parti tecniche) e vi sovrappone SOLO i campi in
 * `campiComuni` che la sorgente possiede davvero. Ogni valore è clonato: la copia
 * è indipendente. Le parti tecniche della destinazione restano intatte.
 */
export function copiaCampiComuni<D>(sorgente: Record<string, unknown>, baseDestinazione: D, campiComuni: readonly string[]): D {
  const dest = structuredClone(baseDestinazione) as Record<string, unknown>;
  for (const campo of campiComuni) {
    if (Object.prototype.hasOwnProperty.call(sorgente, campo) && sorgente[campo] !== undefined) {
      dest[campo] = structuredClone(sorgente[campo]);
    }
  }
  return dest as D;
}

// ── Campi comuni per tipo di destinazione ────────────────────────────────────
// Solo campi CERTI: anagrafica, branding e testi generali che vivono, con lo
// stesso nome e lo stesso senso, sul tipo di destinazione. Le parti tecniche
// (esigenze, soluzione, percorso, cronoprogramma, computo, pdf_blocchi, ordine
// pagine, gallery lavori) NON sono qui: restano ai valori predefiniti.
const ANAGRAFICA = ["ragione_sociale", "indirizzo_completo", "telefono", "email", "partita_iva"] as const;
/** Layout/stile della copertina (marchio), NON i testi/immagine della cover (specifici del modulo). */
const COVER_STILE = [
  "pdf_cover_bg_color", "pdf_cover_text_color", "pdf_cover_text_align", "pdf_cover_text_vertical",
  "pdf_cover_overlay_opacity", "pdf_cover_overlay_style", "pdf_cover_title_size", "pdf_cover_subtitle_size",
  "pdf_cover_eyebrow_size", "pdf_cover_logo_size", "pdf_cover_logo_position",
  "pdf_cover_show_client_card", "pdf_cover_show_decoration", "pdf_cover_decoration_style",
] as const;
const COMUNI_EDILE = [
  ...ANAGRAFICA,
  "color_primary", "color_secondary", "color_accent", "color_text", "font_family",
  "logo_url", "cover_logo_url", "chi_siamo", "chi_siamo_foto_url",
  "usp", "garanzie", "testimonianze", "faq",
  "condizioni_legali_testo", "condizioni_legali_attivo", "payment_terms_text", "validity_text",
  "show_chi_siamo", "show_garanzie",
  ...COVER_STILE,
] as const;
// Tetti usa `cover_*` (non `pdf_cover_*`) per la copertina: fuori dai campi comuni,
// così una copia cross-tipo non ci porta uno stile di cover di un'altra forma.
const COMUNI_TETTI = [
  ...ANAGRAFICA,
  "color_primary", "color_secondary", "color_accent", "color_text", "font_family",
  "logo_url", "cover_logo_url", "chi_siamo", "chi_siamo_foto_url",
  "usp", "garanzie", "testimonianze", "faq",
  "condizioni_legali_testo", "condizioni_legali_attivo", "payment_terms_text", "validity_text",
  "show_chi_siamo", "show_garanzie",
] as const;
const COMUNI_FV = [
  "ragione_sociale", "logo_url", "pdf_cover_logo_url",
  "colore_primario", "colore_accento", "chi_siamo_titolo", "foto_team_url",
  "usp", "garanzie_conversione", "faq_items", "recensioni",
  "condizioni_legali_testo", "condizioni_legali_attivo",
  ...COVER_STILE,
] as const;
const COMUNI_SERRAMENTI = [
  ...ANAGRAFICA,
  "logo_url", "colore_primario", "pdf_font_family",
  "chi_siamo_titolo", "chi_siamo_testo", "chi_siamo_foto_url",
  "perche_noi_default", "garanzie", "faq_items", "testimonianze_default",
  "condizioni_legali_testo", "condizioni_legali_attivo",
  ...COVER_STILE,
  "pdf_cover_title_color", "pdf_cover_subtitle_color", "pdf_cover_eyebrow_color", "pdf_cover_logo_url",
] as const;

/** Voce del registro: leggere, salvare, creare i predefiniti e i campi comuni del tipo. */
interface VoceRegistro {
  carica(companyId: string, areaId: string, moduleId: string, storage?: PortaStorage): ModelloCaricato | null;
  salva(companyId: string, areaId: string, moduleId: string, template: unknown, expectedSavedAt: string | null, storage?: PortaStorage): void;
  creaDefault(companyId: string, areaId: string, moduleId: string, anagrafica: AnagraficaDocumento): unknown;
  campiComuni: readonly string[];
}

const REGISTRO: Record<TipoModello, VoceRegistro> = {
  serramenti: {
    carica: (co, _a, m, s) => { const r = loadLocalSerramentiTemplate(co, m as SerramentiTemplateModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalSerramentiTemplate(co, m as SerramentiTemplateModuleId, t as Parameters<typeof saveLocalSerramentiTemplate>[2], exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createSerramentiModuleTemplate({ company_id: co }, m as SerramentiTemplateModuleId),
    campiComuni: COMUNI_SERRAMENTI,
  },
  tetti: {
    carica: (co, _a, m, s) => { const r = loadLocalTettiTemplate(co, m as TettiTemplateModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalTettiTemplate(co, m as TettiTemplateModuleId, t as TetTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createTettiModuleTemplate({ company_id: co } as TetTemplatePdf, m as TettiTemplateModuleId),
    campiComuni: COMUNI_TETTI,
  },
  fv: {
    carica: (co, _a, m, s) => { const r = loadLocalFvTemplate(co, m as FullFvModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalFvTemplate(co, m as FullFvModuleId, t as Parameters<typeof saveLocalFvTemplate>[2], exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullFvTemplate({} as FvTemplate, co, m as FullFvModuleId),
    campiComuni: COMUNI_FV,
  },
  rst: {
    carica: (co, _a, m, s) => { const r = loadLocalRstTemplate(co, m as FullRstModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalRstTemplate(co, m as FullRstModuleId, t as RstTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullRstTemplate({ company_id: co } as RstTemplatePdf, m as FullRstModuleId),
    campiComuni: COMUNI_EDILE,
  },
  bgn: {
    carica: (co, _a, m, s) => { const r = loadLocalBgnTemplate(co, m as FullBgnModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalBgnTemplate(co, m as FullBgnModuleId, t as BgnTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullBgnTemplate({ company_id: co } as BgnTemplatePdf, m as FullBgnModuleId),
    campiComuni: COMUNI_EDILE,
  },
  idr: {
    carica: (co, _a, m, s) => { const r = loadLocalIdrTemplate(co, m as FullIdrModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalIdrTemplate(co, m as FullIdrModuleId, t as IdrTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullIdrTemplate({ company_id: co } as IdrTemplatePdf, m as FullIdrModuleId),
    campiComuni: COMUNI_EDILE,
  },
  clm: {
    carica: (co, _a, m, s) => { const r = loadLocalClmTemplate(co, m as FullClmModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalClmTemplate(co, m as FullClmModuleId, t as ClmTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullClmTemplate({ company_id: co } as ClmTemplatePdf, m as FullClmModuleId),
    campiComuni: COMUNI_EDILE,
  },
  elt: {
    carica: (co, _a, m, s) => { const r = loadLocalEltTemplate(co, m as FullEltModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalEltTemplate(co, m as FullEltModuleId, t as EleTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullEltTemplate({ company_id: co } as EleTemplatePdf, m as FullEltModuleId),
    campiComuni: COMUNI_EDILE,
  },
  pav: {
    carica: (co, _a, m, s) => { const r = loadLocalPavTemplate(co, m as FullPavModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalPavTemplate(co, m as FullPavModuleId, t as Parameters<typeof saveLocalPavTemplate>[2], exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullPavTemplate({ company_id: co }, m as FullPavModuleId),
    campiComuni: COMUNI_EDILE,
  },
  psc: {
    carica: (co, _a, m, s) => { const r = loadLocalPscTemplate(co, m as FullPscModuleId, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.template } : null; },
    salva: (co, _a, m, t, exp, s) => { saveLocalPscTemplate(co, m as FullPscModuleId, t as PisTemplatePdf, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, _a, m) => createFullPscTemplate({ company_id: co } as PisTemplatePdf, m as FullPscModuleId),
    campiComuni: COMUNI_EDILE,
  },
  documento: {
    carica: (co, a, m, s) => { const r = loadModuleDocument(co, a, m, s ?? archivioModelliAzienda); return r ? { savedAt: r.savedAt, template: r.document } : null; },
    salva: (_co, _a, _m, t, exp, s) => { saveModuleDocument(t as ModuleDocument, exp, s ?? archivioModelliAzienda); },
    creaDefault: (co, a, m, anagrafica) => createModuleDocument(co, a, m, anagrafica),
    // Il documento essenziale ha una forma tutta sua (company annidata, title,
    // color): nessun campo condivide nome con gli altri tipi, quindi una copia
    // cross-tipo con un modulo essenziale non porta nulla (vedi classificaCopia).
    campiComuni: [],
  },
};

/**
 * Che copia è possibile dalla sorgente alla destinazione:
 *  - "completa": stesso tipo, si copia tutto;
 *  - "comune": tipi diversi ma con campi comuni (azienda, branding, testi generali);
 *  - "no": un lato è il documento essenziale e l'altro no — nessun campo in comune.
 */
export function classificaCopia(tipoSorgente: TipoModello, tipoDest: TipoModello): "completa" | "comune" | "no" {
  if (tipoSorgente === tipoDest) return "completa";
  if (tipoSorgente === "documento" || tipoDest === "documento") return "no";
  return "comune";
}

/** Carica il modello di un intervento (o null). Rilancia se la copia locale è illeggibile. */
export function caricaModello(companyId: string, areaId: string, moduleId: string, storage?: PortaStorage): ModelloCaricato | null {
  return REGISTRO[risolviTipoModello(areaId, moduleId)].carica(companyId, areaId, moduleId, storage);
}

/** C'è un modello salvato per questo intervento? Non rilancia (una copia illeggibile conta come «presente»). */
export function haModelloSalvato(companyId: string, areaId: string, moduleId: string, storage?: PortaStorage): boolean {
  try { return caricaModello(companyId, areaId, moduleId, storage) !== null; }
  catch { return true; }
}

/** Esito della copia su una singola destinazione. */
export interface EsitoCopia {
  areaId: string;
  moduleId: string;
  esito: "copiato" | "saltato" | "errore";
  messaggio?: string;
}

/**
 * Copia la configurazione della sorgente su una destinazione. Decide da sé stesso
 * tipo vs tipo diverso. Non sovrascrive una destinazione già configurata se
 * `sovrascrivi` è falso. Il salvataggio passa dalla porta online consueta.
 */
export function copiaConfigurazioneSuModulo(opts: {
  companyId: string;
  anagrafica: AnagraficaDocumento;
  sorgente: { areaId: string; moduleId: string; tipo: TipoModello; template: unknown };
  destinazione: { areaId: string; moduleId: string };
  sovrascrivi: boolean;
  storage?: PortaStorage;
}): EsitoCopia {
  const { companyId, anagrafica, sorgente, destinazione, sovrascrivi, storage } = opts;
  const base: EsitoCopia = { areaId: destinazione.areaId, moduleId: destinazione.moduleId, esito: "copiato" };
  try {
    const tipoDest = risolviTipoModello(destinazione.areaId, destinazione.moduleId);
    const modo = classificaCopia(sorgente.tipo, tipoDest);
    if (modo === "no") return { ...base, esito: "saltato", messaggio: "Il modulo essenziale non condivide impostazioni con questo tipo di modello." };

    const voce = REGISTRO[tipoDest];
    const esistente = voce.carica(companyId, destinazione.areaId, destinazione.moduleId, storage);
    if (esistente && !sovrascrivi) return { ...base, esito: "saltato", messaggio: "Modello già configurato: non sovrascritto." };

    let template: unknown;
    if (modo === "completa") {
      template = copiaStessoTipo(sorgente.template, tipoDest, destinazione.areaId, destinazione.moduleId, companyId);
    } else {
      const predefinito = voce.creaDefault(companyId, destinazione.areaId, destinazione.moduleId, anagrafica);
      template = copiaCampiComuni(sorgente.template as Record<string, unknown>, predefinito, voce.campiComuni);
      applicaIdentita(tipoDest, template, companyId, destinazione.areaId, destinazione.moduleId);
    }
    voce.salva(companyId, destinazione.areaId, destinazione.moduleId, template, esistente?.savedAt ?? null, storage);
    return base;
  } catch (e) {
    return { ...base, esito: "errore", messaggio: e instanceof Error ? e.message : String(e) };
  }
}
