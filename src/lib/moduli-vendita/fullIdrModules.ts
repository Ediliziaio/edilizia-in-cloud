import { completeModulePhotography } from "./modulePhotography";
import type { IdrTemplatePdf, IdrProgetto, IdrComputoVoce, IdrProgettoMedia } from "@/types/termoidraulico";
import type { IdrCoverFields } from "@/components/termoidraulico/coverPresets";
import type { TetEditorialPair } from "./fullTettiFactory";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { IDR_REMAINING_EDITORIAL } from "./idrRemainingEditorial";
import { IDR_PHOTO_CORRECTIONS } from "./idrPhotoCorrections";
import { DATI_CONTO_TERMICO_DIMOSTRATIVI } from "@/lib/contoTermico/anteprima";
import { DATI_FULL_ELECTRIC_DIMOSTRATIVI } from "@/lib/fullElectric/anteprima";

export const FULL_IDR_MODULES = ["caldaia", "pompa-calore", "ibrido", "radiante", "terminali", "idrico", "acqua-calda", "manutenzione", "conto-termico", "full-electric"] as const;
export type FullIdrModuleId = typeof FULL_IDR_MODULES[number];
export const isFullIdrModuleId = (id: string): id is FullIdrModuleId => FULL_IDR_MODULES.some(v => v === id);
export const IDR_MODULE_TITLES = { caldaia: "Sostituzione caldaia", "pompa-calore": "Pompa di calore", ibrido: "Sistema ibrido", radiante: "Riscaldamento a pavimento", terminali: "Radiatori e terminali", idrico: "Impianto idrico-sanitario", "acqua-calda": "Acqua calda sanitaria", manutenzione: "Riparazione e manutenzione", "conto-termico": "Conto Termico 3.0", "full-electric": "Casa Full Electric" };
export const IDR_EDITORIAL = {
  ...IDR_REMAINING_EDITORIAL,
  ibrido: {
    hero: "Due tecnologie.\nUn comfort coordinato.", subtitle: "Pompa di calore, caldaia e regolazione: una configurazione da progettare come un unico sistema.",
    cover: "/module-art/termoidraulica-ibrido-cover-v2.jpg", detail: "/pdf-stock/termoidraulico/pompa-di-calore.jpg",
    scope: "Sono compresi soltanto generatori, regolazione e collegamenti elencati. Terminali, rete gas, alimentazione elettrica, scarichi, canna fumaria e opere murarie non sono implicitamente rinnovati. Compatibilità e logiche di funzionamento richiedono una configurazione verificata.",
    specs: [["Generatori compatibili", "Pompa di calore e caldaia vengono identificate per modello, ruolo e caratteristiche della configurazione."], ["Regolazione condivisa", "Priorità, temperature e passaggio tra generatori si definiscono nel progetto e nella messa in servizio."], ["Terminali e distribuzione", "Radiatori o sistema radiante, temperature richieste e rete esistente vanno valutati prima della scelta."], ["Collocazione", "Spazio interno, posizione esterna, accessi, scarichi e alimentazioni devono essere confermati sul posto."]] as TetEditorialPair[],
    stages: [["Analisi della casa", "Raccogliamo fabbisogni, consumi e caratteristiche dell'impianto esistente."], ["Configurazione del sistema", "Confrontiamo generatori, terminali, regolazione e opere accessorie."], ["Installazione coordinata", "Programmiamo posa, collegamenti e interruzioni delle utenze concordate."], ["Avviamento e consegna", "Verifichiamo le funzioni previste e spieghiamo comandi, documenti e assistenza."]] as TetEditorialPair[],
    faq: [["Posso mantenere la caldaia esistente?", "Solo se il progetto e la compatibilità dei componenti lo consentono. Non basta affiancare una pompa di calore."], ["Funziona con i radiatori?", "Occorre verificare fabbisogno, dimensionamento e temperature di lavoro dell'impianto reale."], ["Chi sceglie quale generatore usare?", "La logica dipende dalla regolazione e dalla configurazione concordata. Le modalità vanno spiegate alla consegna."], ["Produce anche acqua calda sanitaria?", "Solo nella configurazione descritta. Accumulo, priorità e collegamenti sanitari devono essere indicati."], ["Quanto risparmierò?", "Serve un confronto documentato con consumi, tariffe e condizioni d'uso. Nessuna percentuale è garantita dal solo termine ibrido."], ["Serve un adeguamento elettrico?", "La disponibilità e le caratteristiche dell'alimentazione si verificano sul posto; eventuali opere vanno quotate."], ["Sono compresi tutti i ripristini?", "Soltanto quelli elencati, distinguendo opere idrauliche, elettriche, murarie e finiture."], ["Come sarà gestita l'assistenza?", "La proposta deve indicare referente, documenti dei componenti e servizi inclusi, senza presumere un abbonamento manutentivo."]] as TetEditorialPair[],
    rows: [["Sistema", "Sistema ibrido: pompa di calore, caldaia e regolazione della configurazione dimostrativa", 6500], ["Installazione", "Posizionamento e collegamenti delle sole apparecchiature indicate", 1800], ["Avviamento", "Configurazione, riscontro delle funzioni previste e spiegazione dei comandi", 420]] as [string, string, number][],
  },
  "acqua-calda": {
    hero: "Acqua calda.\nPensata per la tua giornata.", subtitle: "Produzione, accumulo e distribuzione: scelte commisurate alle abitudini e allo spazio disponibile.",
    cover: "/module-art/termoidraulica-acqua-calda-cover-v2.jpg", detail: "/module-art/termoidraulica-acqua-calda-comfort.jpg",
    scope: "L'offerta riguarda l'apparecchio e i collegamenti descritti. Rete di distribuzione, ricircolo, predisposizioni elettriche, scarichi e opere murarie richiedono voci specifiche. La foto di un accumulo non implica che quel modello o volume sia compreso.",
    specs: [["Fabbisogno quotidiano", "Numero di utilizzatori, punti serviti e contemporaneità dei prelievi guidano la scelta, senza adottare litraggi standard per tutti."], ["Produzione e accumulo", "Tecnologia, volume utile, potenza e tempi di ripristino devono essere quelli della scheda del prodotto proposto."], ["Spazio e collegamenti", "Ingombri, accessibilità per manutenzione, alimentazione e collegamenti si verificano rispetto al luogo reale."], ["Uso e regolazione", "Comandi, temperature e funzioni previste vengono concordati e spiegati secondo le istruzioni del prodotto."]] as TetEditorialPair[],
    stages: [["Le tue abitudini", "Raccogliamo numero di utilizzatori, punti serviti, orari e caratteristiche della rete."], ["Scelta dell'apparecchio", "Confermiamo tecnologia, capacità, posizione, dotazioni e collegamenti inclusi."], ["Installazione programmata", "Concordiamo interruzione dell'acqua, rimozioni previste e collegamenti."], ["Verifiche e istruzioni", "Controlliamo le funzioni previste e consegniamo indicazioni d'uso e riferimenti."]] as TetEditorialPair[],
    faq: [["Quale capacità mi serve?", "Dipende da utilizzatori, contemporaneità dei prelievi, temperatura e tecnologia. Il valore va scelto con i dati reali."], ["È uno scaldacqua a pompa di calore?", "Solo se la tecnologia è specificata nella fornitura. L'immagine illustrativa non identifica il modello."], ["Avrò acqua calda immediata a ogni rubinetto?", "Distanze e distribuzione influiscono sull'attesa. Il ricircolo non è incluso automaticamente."], ["Posso riutilizzare i collegamenti?", "Compatibilità e condizioni dei collegamenti esistenti devono essere verificate prima dell'installazione."], ["Sono previsti lavori elettrici?", "L'alimentazione necessaria e le eventuali predisposizioni devono risultare nel perimetro dell'offerta."], ["Chi rimuove il vecchio apparecchio?", "Smontaggio, trasporto e gestione del rimosso sono inclusi solo se elencati."], ["Quanto consumerà?", "Il risultato dipende dal prodotto e dall'uso. I dati di scheda non equivalgono a un costo fisso garantito per la tua casa."], ["Quale manutenzione serve?", "Si seguono le istruzioni del modello scelto. Eventuali servizi periodici vanno descritti separatamente."]] as TetEditorialPair[],
    rows: [["Apparecchio", "Acqua calda sanitaria: apparecchio e dotazioni della configurazione dimostrativa", 1600], ["Installazione", "Posizionamento e raccordi sui soli punti indicati", 480], ["Consegna", "Verifica delle funzioni previste e istruzioni d'uso", 180]] as [string, string, number][],
  },
};

export function createFullIdrTemplate(base: IdrTemplatePdf, id: FullIdrModuleId): IdrTemplatePdf {
  const c = IDR_EDITORIAL[id];
  const contextPhoto = "context" in c ? c.context : c.cover.replace("-v2.jpg", ".jpg");
  const items = (pairs: readonly TetEditorialPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const block = (titolo: string, intro: string, pairs: readonly TetEditorialPair[], photo?: string, excluded: readonly TetEditorialPair[] = []) => ({
    occhiello: IDR_MODULE_TITLES[id], titolo, intro, voci: pairs.map(([titolo, testo]) => ({ titolo, testo, icona: "verifica" })),
    escluse: excluded.map(([titolo, testo]) => ({ titolo, testo })), foto: photo ? [photo] : [], senzaFoto: !photo,
    nota: photo ? "Immagine illustrativa: non è un'installazione aziendale né uno schema esecutivo. Modello e dotazioni sono quelli dell'offerta." : null,
  });
  const result: IdrTemplatePdf & IdrCoverFields & { pdf_cover_hero: string | null; pdf_cover_subhero: string | null; pdf_cover_subhero_template: string | null; pdf_cover_eyebrow: string; pdf_blocchi: Record<string, unknown> } = {
    ...structuredClone(base), id: `local-termoidraulica-${id}`,
    cover_title: c.hero, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    pdf_cover_hero: null, pdf_cover_subhero: null, pdf_cover_subhero_template: null, pdf_cover_image_url: c.cover,
    pdf_cover_eyebrow: IDR_MODULE_TITLES[id].toUpperCase(), pdf_cover_bg_color: "#263e3d", pdf_cover_text_color: "#ffffff",
    pdf_cover_overlay_opacity: 70, pdf_cover_overlay_style: "gradient", pdf_cover_text_vertical: "bottom", pdf_cover_text_align: "left",
    pdf_cover_title_size: 35, pdf_cover_subtitle_size: 13, pdf_cover_eyebrow_size: 10, pdf_cover_decoration_style: "none", pdf_cover_logo_position: "top_left", pdf_cover_show_decoration: false, pdf_cover_show_client_card: true,
    color_primary: base.color_primary || "#264d4a", color_accent: base.color_accent || "#a77943",
    condizioni_legali_attivo: false, condizioni_legali_testo: null, modulo_recesso_attivo: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: 30,
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    esigenze: items(c.specs.slice(0, 3)), soluzione: items(c.specs.slice(1)),
    usp: items("usp" in c && c.usp ? c.usp : [["Scelte documentate", c.specs[1][1]], ["Perimetro chiaro", c.scope], ["Consegna accompagnata", c.stages[3][1]]]),
    percorso: items(c.stages), cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    garanzie: items("garanzie" in c && c.garanzie ? c.garanzie : [["Prodotti riconoscibili", "Modelli e dotazioni elencati con documenti e condizioni applicabili."], ["Compatibilità prima dell'ordine", c.specs[2][1]], ["Verifica della fornitura", c.stages[3][1]], ["Assistenza definita", "Conserva contatti e documenti; manutenzione e servizi aggiuntivi sono quelli concordati."]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })), testimonianze: [], gallery_lavori: [], finanziamento_promo: null, pdf_pagine_libere: [],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: true })),
    pdf_blocchi: {
      modulo_edizione: 2, modulo_intervento: id,
      modulo_foto: [...new Set([c.cover, c.detail, contextPhoto])].map(url => ({ url, nome: `${IDR_MODULE_TITLES[id]} · illustrativa` })),
      comeFunziona: block("La configurazione. *Scelta per te*.", c.subtitle, c.specs, c.detail),
      compreso: block("Un perimetro chiaro. *Voce per voce*.", c.scope, c.rows.map(([cap, text]) => [cap, text.replace("dimostrativa", "concordata")] as const), undefined, [["Opere non elencate", c.scope], ["Servizi successivi", "Manutenzione periodica, reperibilità e consumabili non sono compresi salvo indicazione esplicita."]]),
      protezione: block("Preparare gli spazi. *Organizzare i lavori*.", "Accessi e interruzioni si concordano prima di intervenire.", [["Passaggi e appoggi", "Identificare percorsi di movimentazione, aree interessate e superfici da proteggere."], ["Utenze", "Comunicare quali servizi saranno interrotti e concordare il programma."], ["Rimozioni", "Distinguere parti conservate, apparecchi rimossi e gestione dei materiali."], ["Ripristini", "Delimitare gli interventi su pareti, pavimenti e finiture nella proposta."]]),
      controlli: block("La consegna. *Funzione per funzione*.", "I riscontri riguardano componenti e lavorazioni effettivamente previsti.", c.specs),
      documenti: block("Le informazioni. *Da conservare*.", "Documentazione riferita all'intervento effettivo, secondo applicabilità.", [["Fornitura", "Riepilogo di modelli, componenti e attività eseguite."], ["Uso", "Istruzioni dei produttori e spiegazione delle impostazioni concordate."], ["Intervento", "Documentazione tecnica e dichiarazioni applicabili alle opere effettuate."], ["Assistenza", "Condizioni di garanzia e contatti per segnalazioni e servizi concordati."]]),
      diario: block("Le fasi. *Rese riconoscibili*.", "Se concordate, le foto reali accompagnano l'intervento; le immagini del modello restano illustrative.", [["Prima", c.stages[0][1]], ["Durante", c.stages[2][1]], ["Dopo", c.stages[3][1]]]),
      ...Object.fromEntries(["computo", "compreso", "percorso", "tempi", "garanzie", "domande", "chiusura", "investimento", "chiSiamo"].map(p => [`pagina_${p}`, { senzaFoto: true }])),
      pagina_investimento: { foto: [contextPhoto] },
    } as Record<string, unknown>,
  };
  if (id in IDR_REMAINING_EDITORIAL) {
    const protectionPhoto = "/pdf-stock/comune/protezione-ambienti.jpg";
    result.pdf_blocchi.protezione = { ...(result.pdf_blocchi.protezione as Record<string, unknown>), foto: [protectionPhoto], senzaFoto: false, nota: "Immagine illustrativa: le protezioni effettive sono definite per le sole aree interessate." };
    result.pdf_blocchi.modulo_foto = [...(result.pdf_blocchi.modulo_foto as { url: string; nome: string }[]), { url: protectionPhoto, nome: "Organizzazione e protezione · illustrativa" }];
  }
  // Preserve the original full-page process photograph when changing only the
  // panoramic configuration image. The helper otherwise derives it from p4.
  result.pdf_blocchi.diario = { ...(result.pdf_blocchi.diario as Record<string, unknown>), foto: [c.detail], senzaFoto: false, nota: "Immagine illustrativa: non documenta un lavoro aziendale, una verifica eseguita o l'immobile del cliente. Le attività incluse sono quelle della proposta." };
  // Explicit module choices must precede the shared fallback and defaults snapshot.
  for (const correction of IDR_PHOTO_CORRECTIONS.filter(photo => photo.moduleId === id)) {
    result.pdf_blocchi[correction.key] = {
      ...(result.pdf_blocchi[correction.key] as Record<string, unknown>),
      foto: correction.newUrl ? [correction.newUrl] : [], senzaFoto: !correction.newUrl,
      ...(!correction.key.startsWith("pagina_") ? { nota: "Immagine illustrativa dei componenti e degli spazi interessati: non documenta una verifica eseguita, un lavoro aziendale o una configurazione esecutiva." } : {}),
    };
  }
  result.pdf_blocchi = completeModulePhotography(result.pdf_blocchi, "termoidraulico");
  result.pdf_blocchi.modulo_defaults = structuredClone(result.pdf_blocchi);
  return result;
}

export function buildIdrModulePreview(companyId: string, template: IdrTemplatePdf, id: FullIdrModuleId) {
  const c = IDR_EDITORIAL[id];
  const progetto: IdrProgetto = { id: "preview", company_id: companyId, code: "IDR-DEMO", stato: "bozza", tipo_intervento: IDR_MODULE_TITLES[id], tipo_generatore: id === "ibrido" ? "ibrido" : null, numero_terminali: null,
    cliente_nome: "Cliente", cliente_cognome: "dimostrativo", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: id === "conto-termico" || id === "full-electric" ? 10 : 22, detrazione_pct: 0, totale_imponibile: 0, totale: 0,
    note: "ANTEPRIMA DIMOSTRATIVA: prodotti, prezzi e IVA sono esempi da definire. Non è un'offerta da inviare.",
    // Conto Termico e Casa Full Electric hanno i loro numeri: senza, l'anteprima
    // mostrerebbe contributo, energia e bollette a 0.
    ...(id === "conto-termico" ? { conto_termico: DATI_CONTO_TERMICO_DIMOSTRATIVI } : {}),
    ...(id === "full-electric" ? { full_electric: DATI_FULL_ELECTRIC_DIMOSTRATIVI } : {}) };
  const computo: IdrComputoVoce[] = c.rows.map(([capitolo_nome, descrizione, price], i): IdrComputoVoce => ({ id: `demo-${i}`, progetto_id: "preview", company_id: companyId, ordine: i, capitolo_nome, descrizione, unita_misura: "corpo", quantita: 1, prezzo_unitario: price, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: price, margine_eur: price, margine_pct: 100, listino_voce_id: null }));
  return { progetto, computo, media: [] as IdrProgettoMedia[], template };
}
