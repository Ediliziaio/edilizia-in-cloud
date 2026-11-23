/**
 * L'importazione dei contatti da file (CRM → Contatti → Importa).
 *
 * Tre momenti, con la stessa preparazione delle righe:
 * - `anteprimaContatti`: cosa succederà, senza scrivere niente;
 * - `importaContatti` subito: a blocchi da 500, così un file grande non si ferma tutto
 *   per un blocco andato male;
 * - `importaContatti` a scaglioni: le righe vanno in coda sul server (programmata.ts).
 */
import { normalizeTagList } from "@/lib/marketingTags";
import { formeTelefono, telefonoInternazionale } from "@/lib/contactUtils";
import { aLotti, perOgniLotto } from "@/lib/lottiDiId";
import { creaImportazioneProgrammata, descriviProgrammazione, fineStimata, formatoData } from "@/lib/importazione/programmata";
import { numeroRiga, type AnteprimaImport, type EsitoImportazione, type OpzioniImport, type RigaDaRivedere } from "@/lib/importazione/tipi";

interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabella: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (nome: string, argomenti: Record<string, unknown>) => any;
}

export interface ContestoContatti {
  db: Db;
  companyId: string;
  /** Le colonne dei campi personalizzati, `custom_<id>`. */
  customKeys: string[];
}

interface DatiContatto {
  company_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  city: string | null;
  province: string | null;
  tags: string[];
  notes: string | null;
  source: string;
}

export interface ContattoPronto {
  riga: number;
  row: Record<string, string>;
  /** Il nome c'era nel file: «Senza nome» non deve sovrascrivere il nome di un contatto già presente. */
  nomeVero: boolean;
  data: DatiContatto;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOTTO_INSERIMENTO = 500;

/** Legge le righe, scarta le email sbagliate e i doppioni dentro il file. */
export function preparaContatti(rows: Record<string, string>[], opzioni: OpzioniImport, companyId: string) {
  const etichetteExtra = normalizeTagList(opzioni.etichette ?? []);
  const errori: RigaDaRivedere[] = [];
  const avvisi: RigaDaRivedere[] = [];
  let senzaContatto = 0;
  const letti: ContattoPronto[] = [];

  rows.forEach((r, idx) => {
    const riga = numeroRiga(r, idx);
    let firstName = r.first_name?.trim() || "";
    let lastName = r.last_name?.trim() || "";
    if (!firstName && r.fullname?.trim()) {
      const parts = r.fullname.trim().split(/\s+/);
      firstName = parts[0];
      lastName = lastName || parts.slice(1).join(" ");
    }
    const email = r.email?.trim().toLowerCase() || null;
    const phone = r.phone?.trim() || null;
    if (email && !EMAIL.test(email)) {
      errori.push({ riga, motivo: `email «${email}» non valida` });
      return;
    }
    if (!email && !phone) senzaContatto++;
    letti.push({
      riga,
      row: r,
      nomeVero: !!firstName,
      data: {
        company_id: companyId,
        first_name: firstName || "Senza nome",
        last_name: lastName || null,
        phone: phone ? telefonoInternazionale(phone) : null,
        email,
        company_name: r.company_name?.trim() || null,
        city: r.city?.trim() || null,
        province: r.province?.trim() || null,
        tags: normalizeTagList([...(r.tags ? r.tags.split(",") : []), ...etichetteExtra]),
        notes: r.notes?.trim() || null,
        source: r.source?.trim() || "importazione",
      },
    });
  });

  // Doppioni nel file: si tiene la prima riga e lo si dice una volta sola per riga.
  const primaPerEmail = new Map<string, number>();
  const primaPerTelefono = new Map<string, number>();
  const pronti = letti.filter((p) => {
    const emailKey = p.data.email?.toLowerCase();
    const phoneKey = p.data.phone;
    const primaEmail = emailKey ? primaPerEmail.get(emailKey) : undefined;
    const primaTelefono = phoneKey ? primaPerTelefono.get(phoneKey) : undefined;
    const doppia = primaEmail !== undefined || (!emailKey && primaTelefono !== undefined);
    if (doppia) {
      const prima = (primaEmail ?? primaTelefono)!;
      const motivi = [primaEmail !== undefined && "stessa email", primaTelefono === prima && "stesso telefono"].filter(Boolean).join(" e ");
      avvisi.push({ riga: p.riga, motivo: `è lo stesso contatto della riga ${prima} (${motivi}), importato una volta sola` });
      return false;
    }
    if (emailKey) primaPerEmail.set(emailKey, p.riga);
    if (phoneKey && !primaPerTelefono.has(phoneKey)) primaPerTelefono.set(phoneKey, p.riga);
    return true;
  });

  return { pronti, errori, avvisi, senzaContatto, etichetteExtra };
}

/** Come si riconosce lo stesso contatto: l'email, altrimenti il telefono. */
export const chiaveContatto = (d: { email: string | null; phone: string | null }) =>
  d.email ? `email:${d.email.toLowerCase()}` : d.phone ? `phone:${d.phone}` : null;

/** I contatti già presenti che corrispondono alle righe, con le loro etichette. */
export async function cercaEsistenti(ctx: ContestoContatti, pronti: ContattoPronto[]) {
  const perChiave = new Map<string, string>();
  const etichette = new Map<string, string[]>();
  const emails = [...new Set(pronti.map((p) => p.data.email).filter(Boolean) as string[])];
  const phones = [...new Set(pronti.map((p) => p.data.phone).filter(Boolean) as string[])];
  for (const lotto of aLotti(emails, 100)) {
    const { data, error } = await ctx.db.from("marketing_contacts")
      .select("id, email, tags").eq("company_id", ctx.companyId).is("deleted_at", null).in("email", lotto);
    if (error) throw error;
    for (const e of (data ?? []) as { id: string; email: string | null; tags: string[] | null }[]) {
      if (e.email) {
        perChiave.set(`email:${e.email.toLowerCase()}`, e.id);
        etichette.set(e.id, e.tags ?? []);
      }
    }
  }
  // Lo stesso numero può essere salvato con o senza +39: si cercano tutte le forme.
  for (const lotto of aLotti(phones, 20)) {
    const { data, error } = await ctx.db.from("marketing_contacts")
      .select("id, phone, tags").eq("company_id", ctx.companyId).is("deleted_at", null).in("phone", lotto.flatMap(formeTelefono));
    if (error) throw error;
    for (const e of (data ?? []) as { id: string; phone: string | null; tags: string[] | null }[]) {
      if (e.phone) {
        perChiave.set(`phone:${telefonoInternazionale(e.phone)}`, e.id);
        etichette.set(e.id, e.tags ?? []);
      }
    }
  }
  return { perChiave, etichette };
}

/** Cosa succederà premendo «Importa». */
export async function anteprimaContatti(ctx: ContestoContatti, rows: Record<string, string>[], opzioni: OpzioniImport): Promise<AnteprimaImport> {
  const { pronti, errori, avvisi, senzaContatto } = preparaContatti(rows, opzioni, ctx.companyId);
  const base = { righe: rows.length, doppi: avvisi.length, nonValide: errori.length, senzaContatto };
  if (opzioni.mode === "create") return { ...base, nuovi: pronti.length, aggiornati: 0, saltati: 0 };
  const { perChiave } = await cercaEsistenti(ctx, pronti);
  const trovati = pronti.filter((p) => {
    const k = chiaveContatto(p.data);
    return !!k && perChiave.has(k);
  }).length;
  const nonTrovati = pronti.length - trovati;
  return opzioni.mode === "update"
    ? { ...base, nuovi: 0, aggiornati: trovati, saltati: nonTrovati }
    : { ...base, nuovi: nonTrovati, aggiornati: trovati, saltati: 0 };
}

const valoriCustom = (ctx: ContestoContatti, row: Record<string, string>) =>
  ctx.customKeys.filter((k) => row[k]?.trim()).map((k) => ({ field_id: k.replace("custom_", ""), value: row[k].trim() }));

const testo = (r: RigaDaRivedere) => `Riga ${r.riga}: ${r.motivo}`;

export async function importaContatti(ctx: ContestoContatti, rows: Record<string, string>[], opzioni: OpzioniImport): Promise<EsitoImportazione> {
  const mode = opzioni.mode || "create";
  const { pronti, errori, avvisi, etichetteExtra } = preparaContatti(rows, opzioni, ctx.companyId);
  const fatto: string[] = [];
  const nonRiuscito: string[] = [];
  const idsImportati: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const fine = (extra: Partial<EsitoImportazione> = {}): EsitoImportazione => ({
    success: created + updated,
    errors: errori.map(testo),
    creati: created,
    aggiornati: updated,
    saltati: skipped,
    avvisi: avvisi.map(testo),
    fatto,
    nonRiuscito,
    righeDaRivedere: [...avvisi, ...errori].sort((a, b) => a.riga - b.riga),
    ...extra,
  });

  if (pronti.length === 0) {
    const esito = fine();
    return errori.length || avvisi.length ? esito : { ...esito, errors: ["Nessun contatto valido da importare"] };
  }

  // A scaglioni: le righe vanno in coda sul server, che le fa entrare un gruppo alla volta.
  if (opzioni.programmazione) {
    const p = opzioni.programmazione;
    await creaImportazioneProgrammata(ctx.db, {
      companyId: ctx.companyId,
      oggetto: "contatti",
      nomeFile: opzioni.nomeFile,
      modalita: mode,
      automazioni: opzioni.automazioni ?? [],
      programmazione: p,
      righe: pronti.map(({ riga, row, nomeVero, data }) => {
        const { company_id: _azienda, ...contatto } = data;
        return {
          riga,
          contatto: { ...contatto, first_name: nomeVero ? contatto.first_name : "" },
          forme: data.phone ? formeTelefono(data.phone) : [],
          custom: valoriCustom(ctx, row),
        };
      }),
    });
    const quando = fineStimata(pronti.length, p);
    return fine({ programmata: { totale: pronti.length, descrizione: descriviProgrammazione(p), fine: quando ? formatoData(quando) : null } });
  }

  const inserisci = async (lista: ContattoPronto[]) => {
    for (const lotto of aLotti(lista, LOTTO_INSERIMENTO)) {
      const { data, error } = await ctx.db.from("marketing_contacts").insert(lotto.map((p) => p.data)).select("id");
      if (error) {
        // Un blocco andato male non ferma gli altri: le sue righe si possono scaricare e riprovare.
        for (const p of lotto) errori.push({ riga: p.riga, motivo: `non importato (${error.message})` });
        continue;
      }
      const nuovi = (data ?? []) as { id: string }[];
      created += nuovi.length;
      idsImportati.push(...nuovi.map((c) => c.id));
      const valori = nuovi.flatMap((c, i) => valoriCustom(ctx, lotto[i].row).map((v) => ({ contact_id: c.id, ...v })));
      if (valori.length) {
        const { error: errValori } = await ctx.db.from("marketing_contact_field_values").insert(valori);
        if (errValori) nonRiuscito.push(`Campi personalizzati di alcuni contatti nuovi non salvati: ${errValori.message}`);
      }
    }
  };

  if (mode === "create") {
    await inserisci(pronti);
  } else {
    let esistenti: Awaited<ReturnType<typeof cercaEsistenti>>;
    try {
      esistenti = await cercaEsistenti(ctx, pronti);
    } catch {
      return { ...fine(), errors: [...errori.map(testo), "Impossibile verificare i contatti esistenti. Riprova l’importazione."] };
    }
    const daCreare: ContattoPronto[] = [];
    for (const p of pronti) {
      const k = chiaveContatto(p.data);
      const existingId = k ? esistenti.perChiave.get(k) : undefined;
      if (!existingId) {
        if (mode === "upsert") daCreare.push(p);
        else skipped++;
        continue;
      }
      // Si aggiorna solo quello che il file dice: un campo vuoto non cancella quello che c'è.
      const { company_id: _azienda, ...campi } = p.data;
      const updateData: Record<string, unknown> = Object.fromEntries(
        Object.entries(campi).filter(([, v]) => v !== null && v !== undefined && v !== ""),
      );
      if (!p.nomeVero) delete updateData.first_name;
      if (!p.row.source?.trim()) delete updateData.source;
      if (p.data.tags.length) {
        // Le etichette si aggiungono a quelle che il contatto ha già; con due righe sullo stesso
        // contatto (una per email, una per telefono) la seconda parte da quelle della prima.
        updateData.tags = normalizeTagList([...(esistenti.etichette.get(existingId) ?? []), ...p.data.tags]);
        esistenti.etichette.set(existingId, updateData.tags as string[]);
      } else delete updateData.tags;
      updateData.updated_at = new Date().toISOString();
      const { error } = await ctx.db.from("marketing_contacts").update(updateData).eq("id", existingId).eq("company_id", ctx.companyId);
      if (error) {
        errori.push({ riga: p.riga, motivo: `non aggiornato (${error.message})` });
        continue;
      }
      updated++;
      idsImportati.push(existingId);
      for (const v of valoriCustom(ctx, p.row)) {
        await ctx.db.from("marketing_contact_field_values").upsert({ contact_id: existingId, ...v }, { onConflict: "contact_id,field_id" });
      }
    }
    await inserisci(daCreare);
  }

  const idsUnici = [...new Set(idsImportati)];
  if (etichetteExtra.length && idsUnici.length) {
    fatto.push(`${etichetteExtra.length === 1 ? "Etichetta" : "Etichette"} ${etichetteExtra.map((e) => `«${e}»`).join(", ")} su ${idsUnici.length} contatti`);
  }
  // Le automazioni scelte: i contatti importati partono dal primo passaggio.
  for (const flusso of opzioni.automazioni ?? []) {
    if (!idsUnici.length) break;
    let iscritti = 0;
    try {
      await perOgniLotto(idsUnici, async (lotto) => {
        const { data, error } = await ctx.db.rpc("enroll_entities_in_flow", {
          p_flow_id: flusso.id, p_entity_ids: lotto, p_entity_type: "contact",
        });
        if (error) throw error;
        iscritti += ((data ?? {}) as { enrolled?: number }).enrolled ?? 0;
      });
      fatto.push(`${iscritti} contatti entrati nell'automazione «${flusso.nome}»`);
    } catch {
      nonRiuscito.push(`Automazione «${flusso.nome}»: ${iscritti ? `entrati ${iscritti} contatti, poi si è fermata` : "i contatti non sono entrati"}. Riprova dalla lista contatti con «Aggiungi ad automazione».`);
    }
  }

  return fine();
}
