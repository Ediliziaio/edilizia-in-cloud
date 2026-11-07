import type {VariationDraft} from "./variationDraft";
export interface VariationContext {
  currentNet?: number; vatRate?: number; customerName?: string; orderCode?: string;
  companyName?:string; companyDetails?:string; customerAddress?:string; siteAddress?:string;
  documentHeading?:string; primaryColor?:string;
  /** Per mandare la firma elettronica col codice OTP (06/11/2026). */
  customerEmail?:string;
}
/** Explicitly cleared fields stay cleared: do not silently restore a different party on the PDF. */
export function variationDocumentContext(draft:VariationDraft,context:VariationContext):VariationContext {
  return {...context,companyName:draft.documentCompanyName?.trim() ?? context.companyName,
    companyDetails:draft.documentCompanyDetails?.trim() ?? context.companyDetails,
    customerName:draft.documentCustomerName?.trim() ?? context.customerName,
    customerAddress:draft.documentCustomerDetails?.trim() ?? context.customerAddress,
    documentHeading:draft.documentHeading,primaryColor:draft.documentColor};
}
/** L'impresa sul documento: sede, poi i dati fiscali e i contatti. Si possono cambiare nel modulo. */
export function dettagliImpresa(a:{indirizzo_completo?:string|null;partita_iva?:string|null;telefono?:string|null;email?:string|null}|null):string|undefined {
  if(!a)return undefined;
  const contatti=[a.partita_iva&&`P.IVA ${a.partita_iva}`,a.telefono&&`Tel. ${a.telefono}`,a.email].filter(Boolean).join(" - ");
  return [a.indirizzo_completo,contatti].filter(Boolean).join("\n") || undefined;
}
