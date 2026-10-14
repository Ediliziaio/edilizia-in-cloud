import type {VariationDraft} from "./variationDraft";
export interface VariationContext {
  currentNet?: number; vatRate?: number; customerName?: string; orderCode?: string;
  companyName?:string; companyDetails?:string; customerAddress?:string; siteAddress?:string;
  documentHeading?:string; primaryColor?:string;
}
/** Explicitly cleared fields stay cleared: do not silently restore a different party on the PDF. */
export function variationDocumentContext(draft:VariationDraft,context:VariationContext):VariationContext {
  return {...context,companyName:draft.documentCompanyName?.trim() ?? context.companyName,
    companyDetails:draft.documentCompanyDetails?.trim() ?? context.companyDetails,
    customerName:draft.documentCustomerName?.trim() ?? context.customerName,
    customerAddress:draft.documentCustomerDetails?.trim() ?? context.customerAddress,
    documentHeading:draft.documentHeading,primaryColor:draft.documentColor};
}
