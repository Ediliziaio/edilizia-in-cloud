/** Caratteri forniti dall'app: nessun caricamento richiesto all'azienda. */
export const FONT_DOCUMENTO_IDS = ["helvetica", "times", "courier", "lato", "ptsans", "ptserif", "carlito", "caladea", "garamond", "personalizzato"] as const;
export type FontDocumento = typeof FONT_DOCUMENTO_IDS[number];
export const FONT_DOCUMENTO = [
  { id: "helvetica", nome: "Helvetica", stile: "Moderno", css: "Arial, sans-serif", normale: "", grassetto: "" },
  { id: "times", nome: "Times", stile: "Classico", css: "Georgia, serif", normale: "", grassetto: "" },
  { id: "courier", nome: "Courier", stile: "Tecnico", css: "monospace", normale: "", grassetto: "" },
  { id: "lato", nome: "Lato", stile: "Contemporaneo", css: "'EIC Lato', sans-serif", normale: "/fonts/preventivi/lato/Regular.ttf", grassetto: "/fonts/preventivi/lato/Bold.ttf" },
  { id: "ptsans", nome: "PT Sans", stile: "Essenziale", css: "'EIC PT Sans', sans-serif", normale: "/fonts/preventivi/ptsans/Regular.ttf", grassetto: "/fonts/preventivi/ptsans/Bold.ttf" },
  { id: "ptserif", nome: "PT Serif", stile: "Editoriale", css: "'EIC PT Serif', serif", normale: "/fonts/preventivi/ptserif/Regular.ttf", grassetto: "/fonts/preventivi/ptserif/Bold.ttf" },
  { id: "carlito", nome: "Carlito", stile: "Lineare", css: "'EIC Carlito', sans-serif", normale: "/fonts/preventivi/carlito/Regular.ttf", grassetto: "/fonts/preventivi/carlito/Bold.ttf" },
  { id: "caladea", nome: "Caladea", stile: "Formale", css: "'EIC Caladea', serif", normale: "/fonts/preventivi/caladea/Regular.ttf", grassetto: "/fonts/preventivi/caladea/Bold.ttf" },
  { id: "garamond", nome: "EB Garamond", stile: "Elegante", css: "'EIC EB Garamond', serif", normale: "/fonts/preventivi/garamond/Regular.ttf", grassetto: "" },
] as const;
export const fontDelDocumento = (id: string | null | undefined) => FONT_DOCUMENTO.find(f => f.id === id);
export const fontStandard = (id: string | null | undefined): id is "helvetica" | "times" | "courier" => !id || ["helvetica", "times", "courier"].includes(id);
export const cssFontDocumento = FONT_DOCUMENTO.filter(f => f.normale).map(f => `@font-face{font-family:'EIC ${f.nome}';src:url('${f.normale}') format('truetype');font-style:normal;font-weight:400;font-display:swap}`).join("\n");
