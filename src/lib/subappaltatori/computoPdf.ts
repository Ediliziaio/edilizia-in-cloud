import { pdf } from "@react-pdf/renderer";
import { ComputoSubappaltoPDF, type DatiComputoSubappalto } from "@/components/subappaltatori/ComputoSubappaltoPDF";

export const generaPdfComputoSubappalto = (dati: DatiComputoSubappalto) => pdf(ComputoSubappaltoPDF({ dati })).toBlob();
