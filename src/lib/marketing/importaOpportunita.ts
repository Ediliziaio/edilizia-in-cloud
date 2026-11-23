/**
 * I campi del contatto nell'importazione delle opportunità: chi importa opportunità
 * crea anche il loro contatto, e deve poterne riempire città e campi personalizzati.
 * Valgono solo per i contatti nuovi: un contatto già presente non viene riscritto.
 */
import { normalizeTagList } from "@/lib/marketingTags";
import { formeTelefono, telefonoInternazionale } from "@/lib/contactUtils";
import { aLotti, perOgniLotto } from "@/lib/lottiDiId";
import { creaImportazioneProgrammata, descriviProgrammazione, fineStimata, formatoData } from "@/lib/importazione/programmata";
import { numeroRiga, type AnteprimaImport, type EsitoImportazione, type OpzioniImport, type RigaDaRivedere } from "@/lib/importazione/tipi";
import type { ImportField } from "@/components/shared/CSVImportDialog";

const PREFISSO_CUSTOM = "contact_custom_";

export function campiContattoImport(campiPersonalizzati: ReadonlyArray<{ id: string; name: string }>): ImportField[] {
  return [
    { key: "contact_company_name", label: "Azienda Contatto", required: false },
    { key: "contact_city", label: "Città Contatto", required: false },
    { key: "contact_province", label: "Provincia Contatto", required: false },
    ...campiPersonalizzati.map((f) => ({
      key: `${PREFISSO_CUSTOM}${f.id}`,
      label: `${f.name} (contatto)`,
      required: false,
      type: "text" as const,
    })),
  ];
}

/** Quello che dalla riga va sul contatto nuovo, oltre a nome, email e telefono. */
export function datiContattoDaRiga(riga: Record<string, string>) {
  return {
    company_name: riga.contact_company_name?.trim() || null,
    city: riga.contact_city?.trim() || null,
    province: riga.contact_province?.trim() || null,
    source: riga.source?.trim() || "importazione",
  };
}

/** I valori dei campi personalizzati del contatto presenti nella riga. */
export function valoriCustomContatto(riga: Record<string, string>, contactId: string) {
  return Object.entries(riga).flatMap(([chiave, valore]) => {
    const testo = valore?.trim();
    return chiave.startsWith(PREFISSO_CUSTOM) && testo
      ? [{ contact_id: contactId, field_id: chiave.slice(PREFISSO_CUSTOM.length), value: testo }]
      : [];
  });
}

// ── L'importazione vera (23/11/2026): spostata qui dalla pagina, con anteprima,
// etichette, automazioni e importazione a scaglioni come per i contatti.


interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabella: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (nome: string, argomenti: Record<string, unknown>) => any;
}

export interface ContestoOpportunita {
  db: Db;
  companyId: string;
  pipelineId: string;
  faseId: string;
  /** Le colonne dei campi personalizzati dell'opportunità, `custom_<id>`. */
  customKeys: string[];
  /** Per dire quale campo del contatto non è stato salvato. */
  nomeCampoContatto: (id: string) => string;
}

interface OpportunitaPronta {
  riga: number;
  row: Record<string, string>;
  contatto: { first_name: string; last_name: string | null; email: string | null; phone: string | null };
  valore: number;
}

function preparaOpportunita(rows: Record<string, string>[]) {
  const errori: RigaDaRivedere[] = [];
  const pronte: OpportunitaPronta[] = [];
  let senzaContatto = 0;
  rows.forEach((r, i) => {
    const riga = numeroRiga(r, i);
    const valore = r.value?.trim() ? Number(r.value.replace(",", ".")) : 0;
    if (!Number.isFinite(valore) || valore < 0) {
      errori.push({ riga, motivo: "valore economico non valido" });
      return;
    }
    const email = r.contact_email?.trim().toLowerCase() || null;
    const phone = r.contact_phone?.trim() ? telefonoInternazionale(r.contact_phone) : null;
    if (!email && !phone) senzaContatto++;
    pronte.push({
      riga, row: r, valore,
      contatto: { first_name: r.contact_first_name?.trim() || "Senza nome", last_name: r.contact_last_name?.trim() || null, email, phone },
    });
  });
  return { pronte, errori, senzaContatto };
}

/** I contatti già presenti per email o telefono: id per chiave. */
async function contattiEsistenti(ctx: ContestoOpportunita, pronte: OpportunitaPronta[]) {
  const perEmail = new Map<string, string>();
  const perTelefono = new Map<string, string>();
  const emails = [...new Set(pronte.map((p) => p.contatto.email).filter(Boolean) as string[])];
  const phones = [...new Set(pronte.map((p) => p.contatto.phone).filter(Boolean) as string[])];
  for (const lotto of aLotti(emails, 100)) {
    const { data, error } = await ctx.db.rpc("contatti_per_email", { p_company_id: ctx.companyId, p_emails: lotto });
    if (error) throw error;
    for (const c of (data ?? []) as { id: string; email: string }[]) if (!perEmail.has(c.email.toLowerCase())) perEmail.set(c.email.toLowerCase(), c.id);
  }
  for (const lotto of aLotti(phones, 20)) {
    const { data, error } = await ctx.db.from("marketing_contacts").select("id, phone").eq("company_id", ctx.companyId).is("deleted_at", null).in("phone", lotto.flatMap(formeTelefono));
    if (error) throw error;
    for (const c of (data ?? []) as { id: string; phone: string }[]) {
      const k = telefonoInternazionale(c.phone);
      if (!perTelefono.has(k)) perTelefono.set(k, c.id);
    }
  }
  return (c: OpportunitaPronta["contatto"]) =>
    (c.email && perEmail.get(c.email)) || (c.phone && perTelefono.get(c.phone)) || null;
}

export async function anteprimaOpportunita(ctx: ContestoOpportunita, rows: Record<string, string>[]): Promise<AnteprimaImport> {
  const { pronte, errori, senzaContatto } = preparaOpportunita(rows);
  const trova = await contattiEsistenti(ctx, pronte);
  const conContatto = pronte.filter((p) => trova(p.contatto)).length;
  // Per le opportunità «nuovi» sono le opportunità; «aggiornati» i contatti già presenti a cui si collegano.
  return { righe: rows.length, nuovi: pronte.length, aggiornati: conContatto, saltati: 0, doppi: 0, nonValide: errori.length, senzaContatto };
}

const testoRiga = (r: RigaDaRivedere) => `Riga ${r.riga}: ${r.motivo}`;

export async function importaOpportunita(ctx: ContestoOpportunita, rows: Record<string, string>[], opzioni: OpzioniImport): Promise<EsitoImportazione> {
  const { pronte, errori } = preparaOpportunita(rows);
  const etichetteExtra = normalizeTagList(opzioni.etichette ?? []);
  const nonRiuscito: string[] = [];
  const fatto: string[] = [];
  const contattiImportati: string[] = [];
  let success = 0;
  const tagsDi = (r: Record<string, string>) => normalizeTagList([...(r.tags ? r.tags.split(",") : []), ...etichetteExtra]);
  const customOpp = (r: Record<string, string>) =>
    ctx.customKeys.filter((k) => r[k]?.trim()).map((k) => ({ field_id: k.replace("custom_", ""), value: r[k].trim() }));
  const fine = (extra: Partial<EsitoImportazione> = {}): EsitoImportazione => ({
    success, creati: success, errors: errori.map(testoRiga), fatto, nonRiuscito,
    righeDaRivedere: [...errori].sort((a, b) => a.riga - b.riga), ...extra,
  });

  if (opzioni.programmazione) {
    const p = opzioni.programmazione;
    if (pronte.length) {
      await creaImportazioneProgrammata(ctx.db, {
        companyId: ctx.companyId, oggetto: "opportunita", nomeFile: opzioni.nomeFile, modalita: "create",
        pipelineId: ctx.pipelineId, faseId: ctx.faseId, automazioni: opzioni.automazioni ?? [], programmazione: p,
        righe: pronte.map(({ riga, row, contatto, valore }) => ({
          riga,
          contatto: { ...contatto, first_name: row.contact_first_name?.trim() || "", ...datiContattoDaRiga(row) },
          forme: contatto.phone ? formeTelefono(contatto.phone) : [],
          custom_contatto: valoriCustomContatto(row, "").map(({ field_id, value }) => ({ field_id, value })),
          opportunita: { name: row.name?.trim() || `Opportunità riga ${riga}`, value: valore, source: row.source?.trim() || "importazione", tags: tagsDi(row), notes: row.notes?.trim() || null },
          custom: customOpp(row),
        })),
      });
    }
    if (!pronte.length) return fine({});
    const quando = fineStimata(pronte.length, p);
    return fine({ programmata: { totale: pronte.length, descrizione: descriviProgrammazione(p), fine: quando ? formatoData(quando) : null } });
  }

  let trova: Awaited<ReturnType<typeof contattiEsistenti>>;
  try {
    trova = await contattiEsistenti(ctx, pronte);
  } catch {
    return { ...fine(), errors: [...errori.map(testoRiga), "Impossibile verificare i contatti esistenti. Riprova l’importazione."] };
  }
  const creatiOra = new Map<string, string>();
  for (const p of pronte) {
    const r = p.row;
    try {
      const chiave = p.contatto.email ?? p.contatto.phone ?? "";
      let contactId = trova(p.contatto) ?? (chiave ? creatiOra.get(chiave) ?? null : null);
      let contattoNuovo = false;
      if (!contactId) {
        const { data: nuovo, error } = await ctx.db.from("marketing_contacts")
          .insert({ company_id: ctx.companyId, ...p.contatto, ...datiContattoDaRiga(r) }).select("id").single();
        if (error) throw error;
        contactId = nuovo.id as string;
        contattoNuovo = true;
        if (chiave) creatiOra.set(chiave, contactId);
      }
      const { data: opp, error: oErr } = await ctx.db.from("marketing_opportunities").insert({
        company_id: ctx.companyId, pipeline_id: ctx.pipelineId, stage_id: ctx.faseId, contact_id: contactId,
        name: r.name?.trim() || `Opportunità riga ${p.riga}`, value: p.valore,
        source: r.source?.trim() || "importazione", tags: tagsDi(r), notes: r.notes?.trim() || null,
      }).select("id").single();
      if (oErr) throw oErr;
      success++;
      contattiImportati.push(contactId);
      // Dopo l'opportunità, uno alla volta: un valore rifiutato non deve far perdere gli altri.
      if (contattoNuovo) {
        for (const valore of valoriCustomContatto(r, contactId)) {
          const { error: vErr } = await ctx.db.from("marketing_contact_field_values").insert(valore);
          if (vErr) nonRiuscito.push(`Riga ${p.riga}: campo «${ctx.nomeCampoContatto(valore.field_id)}» del contatto non salvato (${vErr.message}). L'opportunità è creata: non reimportare il file o la creeresti due volte.`);
        }
      }
      const valori = customOpp(r).map((v) => ({ opportunity_id: opp.id, ...v }));
      if (valori.length) {
        const { error: cErr } = await ctx.db.from("marketing_opportunity_field_values").insert(valori);
        if (cErr) nonRiuscito.push(`Riga ${p.riga}: i campi personalizzati dell'opportunità non sono stati salvati (${cErr.message}). L'opportunità è creata: non reimportare il file o la creeresti due volte.`);
      }
    } catch (err) {
      errori.push({ riga: p.riga, motivo: (err as { message?: string })?.message || "errore sconosciuto" });
    }
  }

  if (etichetteExtra.length && success) {
    fatto.push(`${etichetteExtra.length === 1 ? "Etichetta" : "Etichette"} ${etichetteExtra.map((e) => `«${e}»`).join(", ")} su ${success} opportunità`);
  }
  const contattiUnici = [...new Set(contattiImportati)];
  for (const flusso of opzioni.automazioni ?? []) {
    if (!contattiUnici.length) break;
    let iscritti = 0;
    try {
      await perOgniLotto(contattiUnici, async (lotto) => {
        const { data, error } = await ctx.db.rpc("enroll_entities_in_flow", { p_flow_id: flusso.id, p_entity_ids: lotto, p_entity_type: "contact" });
        if (error) throw error;
        iscritti += ((data ?? {}) as { enrolled?: number }).enrolled ?? 0;
      });
      fatto.push(`${iscritti} contatti entrati nell'automazione «${flusso.nome}»`);
    } catch {
      nonRiuscito.push(`Automazione «${flusso.nome}»: ${iscritti ? `entrati ${iscritti} contatti, poi si è fermata` : "i contatti non sono entrati"}. Riprova dalla lista contatti.`);
    }
  }
  return fine();
}
