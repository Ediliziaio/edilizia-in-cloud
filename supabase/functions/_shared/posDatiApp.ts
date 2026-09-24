/**
 * Prepara un POS dai dati che l'app ha già: commessa (committente, indirizzo
 * del cantiere, descrizione, date), anagrafica dell'impresa, figure della
 * sicurezza, lavoratori assegnati alla commessa con la loro formazione, mezzi e
 * subappaltatori della commessa.
 *
 * Gira nel server con la chiave di servizio, perché chi scrive il POS deve
 * poter mettere dentro la formazione dei lavoratori anche se non ha il
 * permesso del Personale: quei dati nel POS ci vanno per legge (Allegato XV,
 * 3.2.1 lettera l). Chi chiama ha già verificato azienda e permesso.
 *
 * Niente AI qui: quello che non c'è resta vuoto, e il controllo di completezza
 * lo segnala. Mai un nome, un numero o una data inventati.
 */
import {
  type AddettoEmergenze, type ContestoPos, type DirigentePos, type PosContenuto, type PrepostoPos, type RigaFormazione,
  MANSIONI_PREDEFINITE, posVuoto,
} from "./posModello.ts";

export type { ContestoPos };

// deno-lint-ignore no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nomeDi = (nome: unknown, cognome: unknown) => [s(nome), s(cognome)].filter(Boolean).join(" ");
const chiaveNome = (n: string) => n.toLowerCase().replace(/\s+/g, " ").trim();

export { MANSIONI_PREDEFINITE } from "./posModello.ts";

/** «Via Mazzini 14, 22100 Como (CO)» → via, località, provincia. */
export function dividiIndirizzo(indirizzo: string): { via: string; localita: string; provincia: string } {
  const testo = indirizzo.trim();
  if (!testo) return { via: "", localita: "", provincia: "" };
  const provinciaMatch = testo.match(/\(([A-Za-z]{2})\)\s*$/) ?? testo.match(/[\s,]([A-Z]{2})\s*$/);
  const provincia = provinciaMatch ? provinciaMatch[1].toUpperCase() : "";
  const senzaProv = provinciaMatch ? testo.slice(0, provinciaMatch.index).replace(/[\s,]+$/, "") : testo;
  const parti = senzaProv.split(",").map((p) => p.trim()).filter(Boolean);
  if (parti.length < 2) return { via: senzaProv, localita: "", provincia };
  const localita = parti[parti.length - 1].replace(/^\d{5}\s+/, "");
  return { via: parti.slice(0, -1).join(", "), localita, provincia };
}

function giorniTra(da: string, a: string): number {
  const d1 = Date.parse(`${da}T12:00:00Z`);
  const d2 = Date.parse(`${a}T12:00:00Z`);
  return Number.isFinite(d1) && Number.isFinite(d2) ? Math.round((d2 - d1) / 86_400_000) : 0;
}

function dataIt(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Dagli attestati dell'app, quali caselle della formazione sono documentate. */
export function formazioneDaAttestati(titoli: string[], formazioneCompletata: boolean): Pick<RigaFormazione, "base" | "rischi_specifici" | "dpi_terza_categoria"> {
  const testo = titoli.join(" | ").toLowerCase();
  return {
    base: formazioneCompletata || /generale|base|\b4\s*(h|ore)\b/.test(testo),
    rischi_specifici: formazioneCompletata || /specific|rischio\s+(alto|medio|basso)|\b(8|12)\s*(h|ore)\b/.test(testo),
    dpi_terza_categoria: /dpi|terza\s+categoria|3\s*°?\s*cat|anticaduta|imbracatur|lavori\s+in\s+quota|funi/.test(testo),
  };
}


export interface PosPreparato {
  contenuto: PosContenuto;
  contesto: ContestoPos;
  order: Row;
}

export async function preparaPosDaApp(db: Db, companyId: string, orderId: string): Promise<PosPreparato> {
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, company_id, order_code, description, work_description, tipo_lavoro, work_address, indirizzo_lavori, client_name, client_company, client_address, client_phone, client_email, work_start_date, work_end_date, expected_date, capomastro_user_id, deleted_at")
    .eq("id", orderId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (orderErr) throw new Error(`Commessa non leggibile: ${orderErr.message}`);
  if (!order || order.deleted_at) throw new Error("Commessa non trovata in questa azienda");

  const [anag, company, figureRes, oeRes, campoRes, mezziRes, subRes] = await Promise.all([
    db.from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia, telefono, email, pec")
      .eq("company_id", companyId).maybeSingle(),
    db.from("companies").select("name").eq("id", companyId).maybeSingle(),
    db.from("sicurezza_figure").select("*").eq("company_id", companyId).eq("attivo", true).order("created_at"),
    db.from("order_employees").select("employee_id").eq("order_id", orderId),
    db.from("order_campo_assignments").select("user_id, role_type, is_capocantiere").eq("order_id", orderId).eq("company_id", companyId),
    db.from("mezzi").select("id, nome, tipo, targa, su_mezzo_id").eq("company_id", companyId).eq("assegnato_order_id", orderId).is("deleted_at", null),
    db.from("subappaltatori_sicurezza").select("ragione_sociale, tipo_lavori, durc_scadenza").eq("company_id", companyId).eq("order_id", orderId),
  ]);

  const avvisi: string[] = [];
  const pos = posVuoto();

  // ── Opera ────────────────────────────────────────────────────────────────
  pos.opera.committente = {
    nominativo: s(order.client_company) || s(order.client_name),
    codice_fiscale: "",
    indirizzo: s(order.client_address),
    telefono: s(order.client_phone),
    email: s(order.client_email),
  };
  const indirizzoCantiere = s(order.work_address) || s(order.indirizzo_lavori);
  pos.opera.cantiere = dividiIndirizzo(indirizzoCantiere);
  if (!indirizzoCantiere) avvisi.push("La commessa non ha l'indirizzo del cantiere: scrivilo nel POS o nella commessa.");
  pos.opera.descrizione_attivita = [s(order.tipo_lavoro), s(order.work_description) || s(order.description)]
    .filter(Boolean).join(" — ");
  pos.opera.data_inizio = s(order.work_start_date);
  pos.opera.data_fine = s(order.work_end_date) || s(order.expected_date);

  // ── Impresa ──────────────────────────────────────────────────────────────
  const a = (anag.data ?? {}) as Row;
  const via = [s(a.indirizzo_via), s(a.indirizzo_numero_civico)].filter(Boolean).join(" ");
  const comune = [s(a.indirizzo_cap), s(a.indirizzo_comune), s(a.indirizzo_provincia) ? `(${s(a.indirizzo_provincia)})` : ""]
    .filter(Boolean).join(" ");
  pos.impresa.ragione_sociale = s(a.ragione_sociale) || s(company.data?.name);
  pos.impresa.partita_iva = s(a.partita_iva);
  pos.impresa.sede_legale = {
    indirizzo: [via, comune].filter(Boolean).join(", "),
    telefono: s(a.telefono),
    email: s(a.email) || s(a.pec),
  };
  if (pos.opera.data_inizio && pos.opera.data_fine) {
    pos.impresa.durata_oltre_200_giorni = giorniTra(pos.opera.data_inizio, pos.opera.data_fine) > 200;
  }

  // ── Figure della sicurezza ───────────────────────────────────────────────
  const figure = (figureRes.data ?? []) as Row[];
  const conRuolo = (r: string) => figure.filter((f) => f.ruolo === r);
  const mansioni = (f: Row) => s(f.mansioni_sicurezza) || MANSIONI_PREDEFINITE[s(f.ruolo)] || "";
  const datore = conRuolo("datore_lavoro")[0];
  pos.impresa.datore_lavoro = datore ? s(datore.nominativo) : "";

  const dirigenti: DirigentePos[] = [
    ...conRuolo("direttore_tecnico").map((f) => ({ nominativo: s(f.nominativo), ruolo: "direttore_tecnico" as const, mansioni_sicurezza: mansioni(f) })),
    ...conRuolo("dirigente").map((f) => ({ nominativo: s(f.nominativo), ruolo: "altro" as const, mansioni_sicurezza: mansioni(f) })),
  ];
  const preposti: PrepostoPos[] = [
    ...conRuolo("capocantiere").map((f) => ({ nominativo: s(f.nominativo), ruolo: "capocantiere" as const, ruolo_altro: "", mansioni_sicurezza: mansioni(f) })),
    ...conRuolo("preposto").map((f) => ({ nominativo: s(f.nominativo), ruolo: "altro" as const, ruolo_altro: "Preposto", mansioni_sicurezza: mansioni(f) })),
  ];

  const rspp = conRuolo("rspp")[0];
  if (rspp) {
    const nome = s(rspp.nominativo);
    pos.rspp = {
      nominativo: nome,
      mansioni_sicurezza: mansioni(rspp),
      svolto_da: datore && chiaveNome(nome) === chiaveNome(s(datore.nominativo)) ? "datore" : rspp.esterno ? "esterno" : "interno",
    };
  }
  const medico = conRuolo("medico_competente")[0];
  if (medico) pos.medico_competente = { previsto: true, nominativo: s(medico.nominativo), mansioni_sicurezza: mansioni(medico) };
  const rls = conRuolo("rls")[0] ?? conRuolo("rlst")[0];
  if (rls) pos.rls = { tipo: rls.ruolo === "rlst" ? "rlst" : "rls", nominativo: s(rls.nominativo), mansioni_sicurezza: mansioni(rls) };

  const addetti = new Map<string, AddettoEmergenze>();
  for (const f of [...conRuolo("addetto_antincendio"), ...conRuolo("addetto_primo_soccorso")]) {
    const k = chiaveNome(s(f.nominativo));
    const cur = addetti.get(k) ?? { nominativo: s(f.nominativo), antincendio: false, primo_soccorso: false, mansioni_sicurezza: "" };
    if (f.ruolo === "addetto_antincendio") cur.antincendio = true;
    if (f.ruolo === "addetto_primo_soccorso") cur.primo_soccorso = true;
    cur.mansioni_sicurezza = [cur.mansioni_sicurezza, mansioni(f)].filter(Boolean).join(" ");
    addetti.set(k, cur);
  }
  pos.emergenze.addetti = [...addetti.values()];

  if (!figure.length) avvisi.push("Non ci sono figure della sicurezza: compilale una volta in Sicurezza cantiere › Figure, e ogni POS le riprende.");

  // ── Lavoratori della commessa ────────────────────────────────────────────
  const employeeIds = [...new Set(((oeRes.data ?? []) as Row[]).map((r) => s(r.employee_id)).filter(Boolean))];
  const campo = (campoRes.data ?? []) as Row[];
  const userIds = [...new Set([...campo.map((r) => s(r.user_id)), s(order.capomastro_user_id)].filter(Boolean))];

  const [empRes, hrByUser, profRes] = await Promise.all([
    employeeIds.length
      ? db.from("employees").select("id, first_name, last_name, qualifica, livello_inquadramento, user_id, formazione_sicurezza_completed, formazione_sicurezza_data, formazione_sicurezza_scadenza").in("id", employeeIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? db.from("hr_profili").select("id, user_id, employee_id, nome, cognome, mansione").eq("company_id", companyId).in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length ? db.from("profiles").select("id, first_name, last_name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const employees = (empRes.data ?? []) as Row[];
  const hrUtenti = (hrByUser.data ?? []) as Row[];
  const profili = new Map(((profRes.data ?? []) as Row[]).map((p) => [s(p.id), p]));

  // Profili del personale anche per chi arriva da order_employees (per gli attestati).
  const hrByEmp = employeeIds.length
    ? ((await db.from("hr_profili").select("id, user_id, employee_id, nome, cognome, mansione").eq("company_id", companyId).in("employee_id", employeeIds)).data ?? []) as Row[]
    : [];

  interface Persona { nome: string; qualifica: string; hrId: string | null; completata: boolean; nota: string; }
  const persone = new Map<string, Persona>();
  const aggiungi = (p: Persona) => {
    if (!p.nome) return;
    const k = chiaveNome(p.nome);
    const cur = persone.get(k);
    persone.set(k, cur ? { ...cur, hrId: cur.hrId ?? p.hrId, qualifica: cur.qualifica || p.qualifica, completata: cur.completata || p.completata } : p);
  };
  for (const e of employees) {
    const hr = hrByEmp.find((h) => h.employee_id === e.id);
    aggiungi({
      nome: nomeDi(e.first_name, e.last_name),
      qualifica: s(e.qualifica) || s(hr?.mansione) || s(e.livello_inquadramento),
      hrId: hr ? s(hr.id) : null,
      completata: e.formazione_sicurezza_completed === true,
      nota: e.formazione_sicurezza_scadenza ? `formazione sicurezza fino al ${dataIt(s(e.formazione_sicurezza_scadenza))}` : "",
    });
  }
  const capocantiereUser = new Set<string>([
    ...campo.filter((c) => c.is_capocantiere === true).map((c) => s(c.user_id)),
    s(order.capomastro_user_id),
  ].filter(Boolean));
  for (const c of campo) {
    if (c.role_type && !["employee", "operaio", "capocantiere"].includes(s(c.role_type))) continue;
    const hr = hrUtenti.find((h) => h.user_id === c.user_id);
    const prof = profili.get(s(c.user_id));
    aggiungi({
      nome: hr ? nomeDi(hr.nome, hr.cognome) : nomeDi(prof?.first_name, prof?.last_name),
      qualifica: s(hr?.mansione) || (c.is_capocantiere ? "Capocantiere" : "Operaio"),
      hrId: hr ? s(hr.id) : null,
      completata: false,
      nota: "",
    });
  }

  // Capocantiere della commessa: vince su quello generico dell'impresa.
  const nomiCapo = [...capocantiereUser].map((u) => {
    const hr = hrUtenti.find((h) => h.user_id === u);
    const prof = profili.get(u);
    return hr ? nomeDi(hr.nome, hr.cognome) : nomeDi(prof?.first_name, prof?.last_name);
  }).filter(Boolean);
  if (nomiCapo.length) {
    const generico = preposti.find((p) => p.ruolo === "capocantiere");
    const altri = preposti.filter((p) => p.ruolo !== "capocantiere");
    pos.preposti = [
      ...nomiCapo.map((n) => ({ nominativo: n, ruolo: "capocantiere" as const, ruolo_altro: "", mansioni_sicurezza: generico?.mansioni_sicurezza || MANSIONI_PREDEFINITE.capocantiere })),
      ...altri,
    ];
  } else {
    pos.preposti = preposti;
  }
  pos.dirigenti = dirigenti;

  const elenco = [...persone.values()];
  if (!elenco.length) avvisi.push("Nessun lavoratore è assegnato alla commessa: aggiungili alla commessa o scrivili nel POS.");

  // Numero e qualifica
  const perQualifica = new Map<string, number>();
  for (const p of elenco) {
    const q = p.qualifica || "Operaio";
    perQualifica.set(q, (perQualifica.get(q) ?? 0) + 1);
  }
  pos.lavoratori = [...perQualifica.entries()].map(([qualifica, numero]) => ({ qualifica, numero, note: "" }));

  // Formazione: attestati di sicurezza dal Personale
  const hrIds = elenco.map((p) => p.hrId).filter((x): x is string => !!x);
  const attestatiRes = hrIds.length
    ? await db.from("hr_documenti").select("hr_profilo_id, titolo, ente, data_scadenza").eq("company_id", companyId).eq("categoria", "corso_sicurezza").in("hr_profilo_id", hrIds)
    : { data: [] };
  const attestati = (attestatiRes.data ?? []) as Row[];
  pos.formazione = elenco.map((p) => {
    const suoi = attestati.filter((d) => p.hrId && d.hr_profilo_id === p.hrId);
    const titoli = suoi.map((d) => s(d.titolo));
    const flags = formazioneDaAttestati(titoli, p.completata);
    const elencoAttestati = [
      ...suoi.map((d) => [s(d.titolo), s(d.ente), d.data_scadenza ? `scad. ${dataIt(s(d.data_scadenza))}` : ""].filter(Boolean).join(", ")),
      p.nota,
    ].filter(Boolean).join("; ");
    return {
      nominativo: p.nome,
      qualifica: p.qualifica || "Operaio",
      ...flags,
      rischi_cantiere: false,
      altro: "",
      attestati: elencoAttestati,
    };
  });

  // ── Contesto per le schede delle lavorazioni ─────────────────────────────
  const mezzi = ((mezziRes.data ?? []) as Row[]).map((m) => ({ nome: s(m.nome), tipo: s(m.tipo), targa: s(m.targa) || null }));
  const subappaltatori = ((subRes.data ?? []) as Row[]).map((r) => ({
    ragione_sociale: s(r.ragione_sociale),
    tipo_lavori: s(r.tipo_lavori),
    durc_scadenza: s(r.durc_scadenza) || null,
  }));

  return { contenuto: pos, contesto: { mezzi, subappaltatori, avvisi }, order };
}

/** Colonne «vecchie» di pos_documents tenute allineate per la lista e per chi le legge ancora. */
export function colonneRiassunto(pos: PosContenuto) {
  const indirizzo = [pos.opera.cantiere.via, pos.opera.cantiere.localita, pos.opera.cantiere.provincia].filter(Boolean).join(", ");
  return {
    // La colonna è obbligatoria nella tabella.
    tipo_lavori: pos.opera.descrizione_attivita || "Da specificare",
    // Anche questa è obbligatoria nella tabella.
    indirizzo_cantiere: indirizzo || "Da specificare",
    data_inizio: pos.opera.data_inizio || null,
    data_fine_prevista: pos.opera.data_fine || null,
    numero_lavoratori: pos.lavoratori.reduce((t, r) => t + (r.numero || 0), 0) || null,
    responsabile_sicurezza: pos.rspp.nominativo || null,
  };
}
