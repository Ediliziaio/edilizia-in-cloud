export type Role = 'admin' | 'editor' | 'reviewer' | 'viewer';
export type Stage = 'in_valutazione' | 'in_preparazione' | 'in_revisione' | 'pronta' | 'presentata' | 'non_partecipare' | 'ritirata' | 'esito';
export type Category = 'fonte' | 'amministrativa' | 'tecnica' | 'economica' | 'ricevuta';
export type RequirementStatus = 'compatibile' | 'evidenza_mancante' | 'incompatibilita' | 'da_verificare' | 'non_applicabile';
export interface Company {updated_at?:string; id: string; name: string; profile: Record<string,string> }
export interface Member { company_id: string; user_id: string; role: Role; company: Company }
export interface Tender {
 id:string; company_id:string; title:string; authority:string; territory:string; base_amount:number;
 official_id:string|null; official_url:string|null; kind:string; deadline_date:string|null; deadline_time:string|null;
 timezone:string;deadline_utc_offset?:number|null; description:string; source:string; revision:number; created_at:string;
}
export interface Lot { id:string; company_id:string; tender_id:string; code:string; title:string; amount:number }
export interface Participation {
 id:string; company_id:string; tender_id:string; stage:Stage; decision:'approfondisci'|'partecipa'|'non_partecipare';
 technical_review_note?:string;decision_reason:string; responsible:string; outcome:string; revision:number; created_at:string;
}
export interface Evidence {
 id:string; company_id:string; title:string; kind:string; value:string; source:string; verified_on:string;
 expires_on:string|null; status:string; responsible:string; revision:number;
}
export interface GareDocument {
 revision?:number;
 source_parent_id?:string|null;source_parent_sha256?:string|null;source_entry?:string|null;
 id:string; company_id:string; tender_id:string; participation_id:string|null; lot_id:string|null;
 name:string; storage_path:string; sha256:string; size_bytes:number; category:Category; document_kind:string;
 version:number; previous_id:string|null; mandatory:boolean; signature_required:boolean; signature_declared:boolean;
 status:'bozza'|'in_verifica'|'approvato'; approved_by:string|null; approved_at:string|null; created_at:string;
 archived?:boolean;archive_reason?:string;preview_path?:string|null;preview_sha256?:string|null;generation_snapshot?:Record<string,unknown>;template_contract_id?:string|null;
 ai_job_id?:string|null;ai_draft_id?:string|null;unresolved_fields?:number;
}
export interface Requirement {lot_id?:string|null;kind?:string;applicability?:string;threshold?:string;unit?:string;reference_period?:string;expected_proof?:string;
 id:string; company_id:string; participation_id:string; description:string; mandatory:boolean;
 status:RequirementStatus; evidence_id:string|null; source_document_id:string|null; source_page:number|null;
 source_section:string;source_quote?:string; note:string; reviewed_by:string|null; revision:number;
}
export interface GareTask {assignee_id?:string|null;lot_id?:string|null;
 id:string; company_id:string; participation_id:string; title:string; kind:string; due_date:string; due_time:string|null;
 responsible:string; completed:boolean; mandatory:boolean; revision:number;
}
export interface ExportManifest { schema_version:number; draft:boolean; participation:Participation; tender:Tender; documents:GareDocument[]; requirements:Requirement[]; evidence:Evidence[]; lots:Lot[];evidence_files?:EvidenceFile[];technical_criteria?:TechnicalCriterion[] }
export interface GareExport { id:string; company_id:string; participation_id:string; draft:boolean; manifest:ExportManifest; created_at:string; created_by:string }
export interface Submission { id:string; participation_id:string; export_id:string; receipt_id:string|null; submitted_at:string; protocol:string; created_at:string }
export interface Audit { details?:{source_document_id?:string};id:number; company_id:string; actor:string|null; entity_type:string; entity_id:string; action:string; created_at:string }
export interface Workspace {
 companyAssets?:CompanyAsset[];preparationRuns?:PreparationRun[];journeys?:GuidedJourney[];companyFacts?:CompanyFact[];communications?:GareCommunication[];technicalLibrary?:TechnicalLibraryEntry[];submissionLots?:SubmissionLot[];
 tenders:Tender[]; lots:Lot[]; participations:Participation[]; evidence:Evidence[]; documents:GareDocument[];
 requirements:Requirement[]; tasks:GareTask[]; exports:GareExport[]; submissions:Submission[];
 participationLots:{company_id:string;participation_id:string;lot_id:string}[]; audit:Audit[];
 documentRequests:DocumentRequest[];drafts:AiDraft[];
 technicalCriteria:TechnicalCriterion[];evidenceFiles:EvidenceFile[];economicScenarios:EconomicScenario[];savedSearches:{id:string;name:string;filters:Record<string,string>;last_checked_at?:string|null;matched_ids?:string[]}[];preferences:{id:string;tender_id:string;state:'saved'|'not_relevant'|'neutral';reason:string}[];
}
export interface EconomicScenario {id:string;company_id:string;participation_id:string;title:string;input:import('./economics').EconomicInput;revision:number;updated_at:string}
export interface Citation {document_id:string;document_name:string;quote:string;page:number|null;section:string;version:number;sha256:string;grounded:boolean}
export interface AiRequirement {id:string;description:string;mandatory:boolean;note:string;evidence_id:string|null;suggested_evidence_id?:string|null;citation:Citation}
export interface AiDocumentProposal {id:string;title:string;category:'amministrativa'|'tecnica'|'economica';mandatory:boolean;signature_required:boolean;citation:Citation}
export interface AiDeadline {validation_notes?:string[];proposed_date?:string|null;proposed_time?:string|null;id:string;title:string;kind:string;date:string|null;time:string|null;citation:Citation}
export interface AiResult {analysis_checkpoint?:{completed:number};technical_criteria?:{id:string;code:string;title:string;max_points:string;limits:string;citation:Citation}[];summary?:string;answer?:string;requirements?:AiRequirement[];required_documents?:AiDocumentProposal[];deadlines?:AiDeadline[];criteria?:string[];risks?:string[];missing_documents?:string[];warnings?:string[];uncertainties?:string[];next_actions?:string[];citations?:Citation[];changes?:{description:string;impact:string;citation:Citation;before_citation?:Citation|null;after_citation?:Citation|null;comparison_verified?:boolean}[];sections?:{heading:string;text:string;citations:Citation[]}[];draft_id?:string;coverage?:{name:string;segments:number;total_pages:number|null;pages_read:number;partial:boolean;needs_visual_review?:boolean;kind?:string;members?:number;imported_members?:number}[]}
export interface AiJob {id:string;company_id:string;participation_id:string;action:'analizza'|'rispondi'|'bozza'|'confronta';model:string;status:'queued'|'running'|'done'|'error'|'cancelled'|'interrupted';progress:number;message:string;error:string|null;input:{question?:string;goal?:string};result:AiResult|null;usage:{input_tokens?:number;output_tokens?:number;duration_ms?:number};created_at:string;updated_at:string;source_snapshot:{id:string;name:string;version:number;sha256:string}[]}
export interface AiDraft {id:string;company_id:string;participation_id:string;job_id:string;title:string;category:'amministrativa'|'tecnica'|'economica';body:string;source_snapshot:{id:string;name:string;sha256:string;version:number}[];fact_snapshot?:{impresa?:Record<string,string>;evidenze?:Pick<Evidence,'id'|'revision'|'title'|'value'|'status'|'verified_on'|'expires_on'|'source'>[]};missing_fields:string[];revision:number;created_at:string;updated_at:string}
export interface DocumentRequest {lot_id?:string|null;responsible?:string;due_date?:string|null;id:string;company_id:string;participation_id:string;title:string;category:'amministrativa'|'tecnica'|'economica';mandatory:boolean;signature_required:boolean;source_document_id:string|null;source_page:number|null;source_section:string;source_quote:string;fulfilled_by:string|null;ai_job_id:string|null;ai_candidate_id:string|null;revision:number}
export const stageLabels:Record<Stage,string> = { in_valutazione:'In valutazione', in_preparazione:'In preparazione', in_revisione:'In revisione', pronta:'Pronta per caricamento', presentata:'Presentata', non_partecipare:'Non partecipare', ritirata:'Ritirata', esito:'Esito' };
export const requirementLabels:Record<RequirementStatus,string> = { compatibile:'Documentato compatibile', evidenza_mancante:'Evidenza mancante', incompatibilita:'Possibile incompatibilità', da_verificare:'Interpretazione da verificare', non_applicabile:'Non applicabile' };
export const categoryLabels:Record<Category,string> = {fonte:'Documenti sorgente',amministrativa:'Busta amministrativa',tecnica:'Offerta tecnica',economica:'Offerta economica',ricevuta:'Ricevuta di presentazione'};

export interface TechnicalCriterion {id:string;company_id:string;participation_id:string;parent_id:string|null;code:string;title:string;max_points:number|null;source_document_id:string;source_locator:string;source_quote:string;proposal:string;evidence_id:string|null;commitments:string;limits:string;mandatory:boolean;status:string;review_note:string;reviewed_by:string|null;revision:number}
export interface EvidenceFile {id:string;company_id:string;evidence_id:string;name:string;storage_path:string;sha256:string;size_bytes:number;version:number;previous_id:string|null;created_at:string}

export interface JourneyParty {id:string;name:string;tax_id:string;role:string;signer:string;power_source:string;lot_ids:string[];confirmed:boolean}
export interface JourneyExtra {id:string;title:string;stage:'valutazione'|'preparazione'|'portale'|'esito';mandatory:boolean;lot_id:string|null;party_id:string|null;source_document_id:string|null;source_locator:string;depends_on:string[];kind:'manual'|'document';due_date?:string;responsible?:string}
export interface JourneyConfirmation {status:'todo'|'waiting'|'done'|'na';note:string;at?:string;document_id?:string|null}
export interface JourneyConfig {kind:'gara_aperta'|'invito'|'manifestazione'|'albo';phase:'interesse'|'offerta'|'iscrizione';platform:'da_verificare'|'acquistinrete'|'sintel'|'sater'|'altro';portal_url:string;form:'singola'|'rti'|'consorzio'|'avvalimento'|'subappalto';rolling:boolean;expected_categories:Category[];parties:JourneyParty[];lot_data:Record<string,{cig:string;cpv:string;instructions:string}>;plan_confirmed:boolean;review_note:string;source_snapshot:{id:string;sha256:string}[];analysis_job_ids?:string[];started_at:string;confirmed_at?:string}
export interface GuidedJourney {id:string;company_id:string;participation_id:string;configuration:JourneyConfig;confirmations:Record<string,JourneyConfirmation>;selected_document_ids:string[];extras:JourneyExtra[];revision:number;created_at:string;updated_at:string}
export interface CompanyFact {id:string;company_id:string;key:string;label:string;value:string;source:string;verified_on:string;expires_on:string|null;status:'in_verifica'|'confermato'|'non_applicabile';revision:number;updated_at:string}
export interface GareCommunication {id:string;company_id:string;participation_id:string;lot_id:string|null;kind:'chiarimento'|'rettifica'|'integrazione'|'comunicazione'|'esito'|'ritiro';title:string;body:string;source_document_id:string|null;due_date:string|null;due_time:string|null;responsible:string;status:'aperta'|'in_attesa'|'chiusa';blocking:boolean;reply:string;revision:number;created_at:string}
export interface TechnicalLibraryEntry {id:string;company_id:string;title:string;tags:string;body:string;evidence_ids:string[];status:'bozza'|'approvato';review_note:string;reviewed_by:string|null;revision:number;updated_at:string}
export interface SubmissionLot {receipt_id?:string|null;id:string;company_id:string;participation_id:string;submission_id:string;lot_id:string;phase:JourneyConfig['phase'];state:'dichiarata'|'con_ricevuta'|'ritirata'|'sostituita';reason:string;revision:number;updated_at:string}

export interface CompanyAsset {id:string;company_id:string;subject_id?:string|null;source_replaced?:boolean;kind:'qualification'|'experience'|'person'|'equipment'|'authority'|'economic'|'registration'|'certification'|'cel'|'insurance';title:string;entity_name:string;entity_tax_id:string;data:Record<string,string>;evidence_id:string|null;source_file_id:string|null;source_sha256:string|null;source_locator:string;source_quote:string;status:'in_verifica'|'confermato'|'archiviato';verified_on:string|null;expires_on:string|null;review_note:string;reviewed_by:string|null;revision:number;created_at:string;updated_at:string}
export interface PreparationRun {id:string;company_id:string;participation_id:string;status:'queued'|'running'|'waiting_review'|'done'|'error'|'interrupted'|'cancelled';progress:number;message:string;error:string|null;snapshot:{sources:{id:string;sha256:string;name:string}[];subjects?:{id:string;revision:number;status:string}[];assets?:{id:string;revision:number}[]};steps:Record<string,{status:string;detail?:string;job_ids?:string[]}>;result:{form_proposals?:{contract_id:string;proposals:import('./dossier/FormAssistance').FormProposal[];warnings:string[]}[];dgue_inventory?:{source_id:string;name:string;questions:number;criteria:number;lots:{id:string}[];can_generate:boolean}[];inventory?:{id:string;name:string;kind:string;review:string}[];contracts?:{id:string;source_document_id:string;name:string;fields:{key:string;label:string;supported:boolean;required:boolean;type?:string;options?:string[];location?:string}[];mapping:Record<string,string>}[];questions?:{id:string;title:string;detail:string;area:string}[];matches?:{requirement_id:string;description:string;candidates:{id:string;title:string;status:string;reasons:string[]}[]}[];analysis_ids?:string[];technical?:{id:string;code:string;title:string;max_points:string;limits:string;citation:Citation}[];review?:{severity:string;description:string;offer_quote:string;citation?:Citation;verified?:boolean}[];warnings?:string[];draft_ids?:string[];usage?:Record<string,number>};revision:number;created_at:string;updated_at:string}
