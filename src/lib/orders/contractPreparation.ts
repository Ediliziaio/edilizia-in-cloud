import { contractImponibile, contractToInstallments, type ContractExtract } from "./contractExtract";
import { fasiPerCommessa, type FaseModello, type ModelloFasi } from "./modelliFasi";

export interface StoredContractFile { bucket: string; path: string; name: string; mime: string }


export function storedContractFromDraft(value: unknown, companyId: string): StoredContractFile | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (s.bucket !== "order-attachments" || typeof s.path !== "string" || !s.path.startsWith(`${companyId}/`) || s.path.includes("..") || s.path.length > 2048 || typeof s.name !== "string" || !s.name || s.name.length > 255 || typeof s.mime !== "string") return null;
  return {bucket:s.bucket, path:s.path, name:s.name, mime:s.mime};
}

export interface OfficeStep { nome: string; controlli: string[] }
export interface ContractPreparation {
  extract: ContractExtract;
  organizzazione: "interventi_su_ordine" | "lavoro_singolo";
  motivo: string;
  standardId: string | null;
  standardNome: string | null;
  ufficio: OfficeStep[];
  cantiere: FaseModello[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ufficioRicorrente: OfficeStep[] = [
  { nome: "Affidamento e quota di competenza", controlli: ["Verificare contratto applicativo, CIG e SIL", "Confermare quota e lavorazioni di competenza dell’azienda", "Confermare destinatario delle fatture e rapporti con la mandataria"] },
  { nome: "Documenti e sicurezza", controlli: ["Verificare disponibilità e validità dei documenti richiesti", "Verificare prescrizioni di sicurezza e gestione della viabilità per ogni intervento"] },
  { nome: "Programmazione degli interventi", controlli: ["Acquisire PED e ordini effettivi", "Confermare tratti, progressive, quantità e scadenze", "Organizzare ogni intervento con le proprie lavorazioni, persone e mezzi"] },
  { nome: "Misure, contabilità e SAL", controlli: ["Raccogliere misure e rapportini per intervento", "Verificare contabilità e SAL con la mandataria o il committente", "Confermare pagamenti di competenza dell’azienda"] },
  { nome: "Ultimazione e collaudo", controlli: ["Raccogliere verbali e controlli previsti", "Verificare eventuali prescrizioni residue"] },
  { nome: "Saldo e chiusura del contratto", controlli: ["Verificare contabilità finale e saldo", "Archiviare documenti e chiudere gli adempimenti"] },
];

/** Selezione solo tra gli standard dell'azienda caricati. Una parità non diventa una scelta arbitraria. */
export function prepareContract(extract: ContractExtract, modelli: readonly ModelloFasi[]): ContractPreparation {
  const testo = norm(`${extract.descrizione_lavori} ${extract.summary}`);
  const ricorrente = extract.natura_documento !== "offerta_fornitore" && /manutenzione ricorrente|interventi (?:su |a )ordin|pluriennal/.test(testo);
  const stradale = /strad|viabilita|bitum|fresatur|pavimentazion/.test(testo);
  const ranked = extract.natura_documento === "offerta_fornitore" ? [] : modelli.map(m => {
    const nome = norm(m.nome);
    let score = 0;
    if (ricorrente && /ricorrente/.test(nome)) score += 8;
    if (ricorrente && /anas/.test(testo) && /anas/.test(nome)) score += 5;
    if (!ricorrente && /fresatur|bitumatur/.test(testo) && /fresatur|bitumatur/.test(nome)) score += 8;
    if (stradale && /strad|viabilita/.test(nome)) score += 3;
    // Gli altri settori usano solo corrispondenze esplicite, mai un default universale.
    for (const parola of ["tetto", "bagno", "serramenti", "fotovoltaico", "ristrutturazione"]) {
      if (testo.includes(parola) && nome.includes(parola)) score += 5;
    }
    return { m, score };
  }).filter(x => x.score >= 3).sort((a,b) => b.score-a.score);
  const modello = ranked.length && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].m : null;
  return {
    extract, organizzazione: ricorrente ? "interventi_su_ordine" : "lavoro_singolo",
    motivo: ricorrente
      ? "Il documento descrive manutenzione ricorrente o interventi su ordinazione: il contratto raccoglie più interventi. Verifica questa organizzazione prima di usarla."
      : "Proposta per un singolo lavoro; verifica che il documento non riguardi interventi ricorrenti.",
    standardId: modello?.id ?? null, standardNome: modello?.nome ?? null,
    ufficio: ricorrente ? ufficioRicorrente.map(s => ({ ...s, controlli: [...s.controlli] })) : [],
    // Il contratto ricorrente non ordina automaticamente tutte le lavorazioni del catalogo.
    cantiere: ricorrente ? [] : modello ? fasiPerCommessa(modello) : [],
  };
}

export interface Confirmation { key: string; testo: string }
export interface ConfirmedValues { cliente?: boolean; importo?: boolean; iva?: boolean; rate?: boolean }
const fieldLabels: Record<string,string> = {
  quota_azienda_eur: "Quota economica e lavorazioni di competenza dell’azienda nel raggruppamento",
  iva_pct: "Aliquota e regime IVA", data_fine_lavori: "Data di fine lavori",
};
export const readableContractWarning = (s: string) => {
  if (fieldLabels[s]) return fieldLabels[s];
  if (s.includes("data_documento")) return "Verificare la data effettiva del documento e della stipula.";
  if (s.includes("data_fine_lavori")) return "Fine lavori ricavata dalla durata: confermare la data operativa prima di usarla.";
  if (s.includes("modalita_pagamento")) return "Modalità di pagamento non dichiarata: da confermare.";
  if (s.includes("anticipazione_pct")) return "Percentuale dell’anticipazione da verificare nei documenti richiamati.";
  return s;
};

export function contractConfirmations(p: ContractPreparation, confermati: ConfirmedValues = {}): Confirmation[] {
  const ex = p.extract;
  const a = ex.appalto_pubblico;
  const out: Confirmation[] = [];
  if (!confermati.cliente) out.push({ key: "cliente", testo: a?.ruolo_azienda_importatrice === "mandante" ? "Confermare il cliente di fatturazione: committente o mandataria del raggruppamento" : "Confermare l’anagrafica del cliente" });
  if (confermati.importo === false || (confermati.importo === undefined && contractImponibile(ex) == null)) out.push({ key: "importo", testo: a?.presente ? "Confermare importo e lavorazioni spettanti all’azienda; il totale dell’appalto non è il suo ricavo" : "Confermare l’importo del lavoro" });
  if (confermati.iva === false || (confermati.iva === undefined && ex.iva_pct == null)) out.push({ key: "iva", testo: "Confermare aliquota e regime IVA: nessuna aliquota predefinita applicata" });
  if (confermati.rate === false || (confermati.rate === undefined && contractToInstallments(ex, contractImponibile(ex) ?? 0).length === 0)) out.push({ key: "rate", testo: "Confermare condizioni e piano dei pagamenti; nessuna rata o scadenza precompilata" });
  if (!p.standardId) out.push({ key: "standard", testo: "Scegliere uno standard: nessuna corrispondenza univoca tra quelli dell’azienda" });
  if (a?.presente && a.importo_totale_appalto_eur != null) out.push({ key: "totale-appalto", testo: "Verificare il totale del raggruppamento, il ribasso e l’inclusione degli oneri di sicurezza: l’importo estratto dall’AI richiede controllo" });
  if (p.organizzazione === "interventi_su_ordine") out.push({ key: "interventi", testo: "Acquisire ordini di intervento e PED: tratti/km, quantità, date, squadre e mezzi si definiscono per ogni intervento" });
  if (!ex.data_fine_lavori || p.organizzazione === "interventi_su_ordine") out.push({ key: "date", testo: "Confermare date operative e fine lavori; la durata contrattuale non è la durata in giorni lavorativi del cantiere" });
  const extra = [...(a?.informazioni_da_confermare ?? []), ...ex.warnings].map(readableContractWarning);
  for (const testo of [...new Set(extra)]) {
    if (/quota|aliquota|\biva\b|\brate\b/i.test(testo)) continue;
    if (testo.trim()) out.push({ key: `fonte-${out.length}`, testo });
  }
  return out;
}

export function contractPreparationNotes(p: ContractPreparation, confermati: ConfirmedValues = {}): string {
  const a = p.extract.appalto_pubblico;
  return [
    "IMPORTAZIONE CONTRATTO — PROPOSTA DA VERIFICARE",
    p.organizzazione === "interventi_su_ordine" ? "Organizzazione: contratto ricorrente con interventi su ordine." : "Organizzazione: singolo lavoro.",
    `Standard: ${p.standardNome ?? "da scegliere"}.`,
    ...(a?.presente ? [`Riferimenti: ${[a.contratto_applicativo && `Applicativo ${a.contratto_applicativo}`, a.cig && `CIG ${a.cig}`, a.cig_derivato && `CIG derivato ${a.cig_derivato}`, a.sil && `SIL ${a.sil}`].filter(Boolean).join(" · ")}.`, ...(a.importo_totale_appalto_eur != null ? [`Importo complessivo appalto/RTI letto dall’AI, DA VERIFICARE con ribasso e oneri di sicurezza: ${a.importo_totale_appalto_eur.toLocaleString("it-IT")} EUR; non attribuito automaticamente all’azienda.`] : [])] : []),
    "DA CONFERMARE", ...contractConfirmations(p, confermati).map(x => `- ${x.testo}`),
    ...(p.ufficio.length ? ["ADEMPIMENTI UFFICIO (attività separate dall’avanzamento del cantiere)", ...p.ufficio.map(x => `- ${x.nome}: ${x.controlli.join("; ")}`)] : []),
    "Descrizione dal contratto:", p.extract.descrizione_lavori,
  ].join("\n");
}
