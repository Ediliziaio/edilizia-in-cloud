import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { ComputoSubappaltoPDF, type DatiComputoSubappalto } from "@/components/subappaltatori/ComputoSubappaltoPDF";

export const generaPdfComputoSubappalto = (dati: DatiComputoSubappalto) => pdf(createElement(ComputoSubappaltoPDF, { dati })).toBlob();
