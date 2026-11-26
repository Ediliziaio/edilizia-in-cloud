export interface TextUnit {key:string;page:number|null;section:string;label:string;text:string;characters:number;method:string;needs_visual_review:boolean;reading_complete:boolean;available:boolean;text_sha256?:string;review?:TextReview|null;stale_reviews?:number;previous_reviews?:TextReview[]}
export interface TextReview {id:string;status:'controllato'|'problema';note:string;revision:number;reviewed_at:string;reviewed_by:string;unit_key:string;extracted_sha256:string}
export interface TextMatch {start:number;end:number}
export function readingUnits(chunks?:{page?:number|null;section?:string;text?:string;method?:string;needs_visual_review?:boolean}[],coverage?:{total_pages?:number|null;completed_pages?:number[];status?:string;partial?:boolean}):TextUnit[];
export function textMatches(text:string,query:string,limit?:number):TextMatch[];
export function searchReading(units:TextUnit[],query:string):{key:string;label:string;count:number;capped:boolean;snippet:string}[];
export function readingExport(document:{name:string;version:number;sha256:string},units:TextUnit[]):string;
export function unitCitation(document:{name:string;version:number;sha256:string},unit:TextUnit,quote?:string):string;
