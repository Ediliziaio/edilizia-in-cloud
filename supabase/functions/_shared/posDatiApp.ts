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
  type AddettoEmergenze, type ContestoPos, type DirigentePos, type PosContenuto, type PrepostoPos,
  MANSIONI_PREDEFINITE, posVuoto,
} from "./posModello.ts";

import { risolviAddettiPropriPos } from "./posAddetti.ts";

export type { ContestoPos };

// deno-lint-ignore no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nomeDi = (nome: unknown, cognome: unknown) => [s(nome), s(cognome)].filter(Boolean).join(" ");

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

export interface PosPreparato {
  contenuto: PosContenuto;
  contesto: ContestoPos;
  order: Row;
  fonti: Record<string, unknown>;
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

  const [anag, company, figureRes, oeRes, campoRes, mezziRes, subRes, montatiRes, fasiRes, incarichiRes, contrattiRes, assegnazioniEsterneRes] = await Promise.all([
    db.from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia, telefono, email, pec")
      .eq("company_id", companyId).maybeSingle(),
    db.from("companies").select("name").eq("id", companyId).maybeSingle(),
    db.from("sicurezza_figure").select("*").eq("company_id", companyId).eq("attivo", true).order("created_at"),
    db.from("order_employees").select("employee_id").eq("order_id", orderId),
    db.from("order_campo_assignments").select("user_id, role_type, is_capocantiere").eq("order_id", orderId).eq("company_id", companyId),
    db.from("mezzi").select("id, nome, tipo, targa, su_mezzo_id").eq("company_id", companyId).eq("assegnato_order_id", orderId).is("deleted_at", null),
    db.from("subappaltatori_sicurezza").select("id, ragione_sociale, tipo_lavori, durc_scadenza").eq("company_id", companyId).eq("order_id", orderId),
    // Ponteggi, transenne e altre attrezzature a quantità montati sul cantiere (dal 05/10/2026).
    db.from("mezzi_allocazioni")
      .select("quantita, dal, al, mezzo:mezzi!mezzi_allocazioni_mezzo_id_fkey(nome, tipo, unita_misura, deleted_at)")
      .eq("company_id", companyId).eq("order_id", orderId),
    // Le fasi di lavoro della commessa: dicono cosa si fa davvero in cantiere.
    db.from("order_work_phases").select("id, name, position").eq("company_id", companyId).eq("order_id", orderId).order("position"),
    db.from("sicurezza_incarichi").select("*").eq("company_id",companyId).eq("order_id",orderId).order("dal",{ascending:false}),
    db.from("contratti_subappalto").select("subappaltatore_id,stato").eq("company_id",companyId).eq("order_id",orderId),
    db.from("subappaltatori_assegnazioni").select("subappaltatore_id,dal,al").eq("company_id",companyId).eq("order_id",orderId),
  ]);

  for(const [fonte,res] of Object.entries({anagrafica:anag,azienda:company,figure:figureRes,operai:oeRes,assegnazioni:campoRes,mezzi:mezziRes,imprese:subRes,attrezzature:montatiRes,fasi:fasiRes,incarichi:incarichiRes,contratti:contrattiRes,assegnazioni_esterne:assegnazioniEsterneRes})) {
    if(res?.error) throw new Error(`Fonte POS non disponibile (${fonte}): ${res.error.message}`);
  }
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const riferimento = s(order.work_start_date) || oggi;
  const avvisi: string[] = [];
  const impreseDirette=(subRes.data??[]) as Row[];
  const idsDiretti=new Set(impreseDirette.map(i=>s(i.id)).filter(Boolean));
  const altriSubIds=[...new Set([
    ...((contrattiRes.data??[]) as Row[]).filter(c=>c.stato!=='annullato').map(c=>s(c.subappaltatore_id)),
    ...((assegnazioniEsterneRes.data??[]) as Row[]).filter(a=>s(a.dal)<=riferimento&&(!a.al||s(a.al)>=riferimento)).map(a=>s(a.subappaltatore_id)),
  ].filter(id=>id&&!idsDiretti.has(id)))];
  const altreImprese=altriSubIds.length?await db.from('subappaltatori_sicurezza').select('id,ragione_sociale,tipo_lavori,durc_scadenza').eq('company_id',companyId).in('id',altriSubIds):{data:[]};
  if(altreImprese.error) throw new Error(`Imprese collegate non disponibili: ${altreImprese.error.message}`);
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
  const fasi = [...new Set(((fasiRes?.data ?? []) as Row[]).map((f) => s(f.name)).filter(Boolean))];
  pos.opera.descrizione_attivita = [
    [s(order.tipo_lavoro), s(order.work_description) || s(order.description)].filter(Boolean).join(" — "),
    fasi.length ? `Fasi di lavoro: ${fasi.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
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
  const incarichi = ((incarichiRes.data??[]) as Row[]).filter(i=>!i.subappaltatore_id&&s(i.dal)<=riferimento&&(!i.al||s(i.al)>=riferimento)&&i.stato==='documentato');
  const ruoliLocali = new Set(incarichi.map(i=>s(i.ruolo)));
  const globali = ((figureRes.data??[]) as Row[]).filter(f=>!ruoliLocali.has(s(f.ruolo))&&(!f.scadenza||s(f.scadenza)>=riferimento));
  const figure = [...incarichi,...globali];
  if(globali.length) avvisi.push("Figure aziendali riprese come proposte: verifica nomine, validità e pertinenza al cantiere; registra gli incarichi sulla commessa.");
  if(((incarichiRes.data??[]) as Row[]).some(i=>!i.subappaltatore_id&&i.stato==='proposto')) avvisi.push("La commessa contiene nomine ancora da verificare: non sono riprese come incarichi documentati nel POS.");
  const responsabileLavori=incarichi.find(i=>i.ruolo==='responsabile_lavori');
  if(responsabileLavori) pos.opera.responsabile_lavori={nominativo:s(responsabileLavori.nominativo),codice_fiscale:'',indirizzo:'',telefono:s(responsabileLavori.telefono),email:s(responsabileLavori.email)};
  const identitaFigura=(f:Row|undefined):string|null=>{
    if(!f)return null;
    if(s(f.hr_profilo_id))return `hr:${s(f.hr_profilo_id)}`;
    const fonte=f.figura_id?((figureRes.data??[]) as Row[]).find(x=>x.id===f.figura_id):null;
    if(fonte&&s(fonte.hr_profilo_id))return `hr:${s(fonte.hr_profilo_id)}`;
    if(s(f.figura_id))return `figura:${s(f.figura_id)}`;
    return s(f.id)?`figura:${s(f.id)}`:null;
  };
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
      svolto_da: datore && !!identitaFigura(datore) && identitaFigura(datore) === identitaFigura(rspp) ? "datore" : rspp.esterno ? "esterno" : "interno",
    };
  }
  const medico = conRuolo("medico_competente")[0];
  if (medico) pos.medico_competente = { previsto: true, nominativo: s(medico.nominativo), mansioni_sicurezza: mansioni(medico) };
  const rls = conRuolo("rls")[0] ?? conRuolo("rlst")[0];
  if (rls) pos.rls = { tipo: rls.ruolo === "rlst" ? "rlst" : "rls", nominativo: s(rls.nominativo), mansioni_sicurezza: mansioni(rls) };

  const addetti = new Map<string, AddettoEmergenze>();
  for (const [indice,f] of [...conRuolo("addetto_antincendio"), ...conRuolo("addetto_primo_soccorso")].entries()) {
    const k = identitaFigura(f) ?? `non-identificato:${indice}`;
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

  const [empRes, empByUser, hrByUser] = await Promise.all([
    employeeIds.length
      ? db.from("employees").select("id, first_name, last_name, qualifica, livello_inquadramento, user_id, role_type, formazione_sicurezza_completed, formazione_sicurezza_data, formazione_sicurezza_scadenza").eq("company_id",companyId).in("id", employeeIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? db.from("employees").select("id, first_name, last_name, qualifica, livello_inquadramento, user_id, role_type, formazione_sicurezza_completed, formazione_sicurezza_data, formazione_sicurezza_scadenza").eq("company_id",companyId).in("user_id",userIds)
      : Promise.resolve({data:[]}),
    userIds.length
      ? db.from("hr_profili").select("id, user_id, employee_id, nome, cognome, mansione").eq("company_id", companyId).in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  for(const res of [empRes,empByUser,hrByUser]) if(res?.error) throw new Error(`Anagrafica lavoratori non disponibile: ${res.error.message}`);
  const employees = [...new Map([...((empRes.data ?? []) as Row[]),...((empByUser.data ?? []) as Row[])].map(e=>[s(e.id),e])).values()];
  const idsDaControllare = employees.map(e=>s(e.id));
  const hrUtenti = (hrByUser.data ?? []) as Row[];

  // Profili del personale anche per chi arriva da order_employees (per gli attestati).
  const hrEmpRes = idsDaControllare.length
    ? await db.from("hr_profili").select("id, user_id, employee_id, nome, cognome, mansione").eq("company_id", companyId).in("employee_id", idsDaControllare)
    : {data:[]};
  if(hrEmpRes.error) throw new Error(`Profili HR non disponibili: ${hrEmpRes.error.message}`);
  const hrByEmp = (hrEmpRes.data??[]) as Row[];

  const risolti = risolviAddettiPropriPos(employees, campo, [...hrByEmp, ...hrUtenti], employeeIds);
  avvisi.push(...risolti.avvisi);
  const capocantiereUser = new Set<string>([
    ...campo.filter(c => c.is_capocantiere === true && (!c.role_type || ["employee", "operaio", "capocantiere"].includes(s(c.role_type)))).map(c => s(c.user_id)),
    s(order.capomastro_user_id),
  ].filter(Boolean));

  // Capocantiere della commessa: vince su quello generico dell'impresa.
  const nomiCapo = [...capocantiereUser].map((u) => {
    const candidati = [...new Map([...hrUtenti,...hrByEmp].filter(h => h.user_id === u).map(h => [s(h.id),h])).values()];
    if(candidati.length !== 1 || !risolti.persone.some(p => p.hrId === candidati[0].id)) return "";
    return nomeDi(candidati[0].nome, candidati[0].cognome);
  }).filter(Boolean);
  if (nomiCapo.length && !ruoliLocali.has("capocantiere")) {
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

  const elenco = risolti.persone;
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
    ? await db.from("hr_documenti").select("id, hr_profilo_id, titolo, ente, data_scadenza").eq("company_id", companyId).eq("categoria", "corso_sicurezza").in("hr_profilo_id", hrIds)
    : { data: [] };
  if(attestatiRes.error) throw new Error(`Attestati non disponibili: ${attestatiRes.error.message}`);
  const attestati = (attestatiRes.data ?? []) as Row[];
  if(elenco.length) avvisi.push("Formazione da verificare sui documenti: titoli e flag storici non attestano validità, contenuto o pertinenza. Conferma le voci nell’editor dopo il controllo.");
  pos.formazione = elenco.map((p) => {
    const suoi = attestati.filter((d) => p.hrId && d.hr_profilo_id === p.hrId);
    const elencoAttestati = [
      ...suoi.map((d) => [s(d.titolo), s(d.ente), d.data_scadenza ? `scad. ${dataIt(s(d.data_scadenza))}` : ""].filter(Boolean).join(", ")),
      p.nota,
    ].filter(Boolean).join("; ");
    return {
      ...(p.hrId ? {riferimento_addetto:{tipo:"hr" as const,id:p.hrId}} : {}),
      nominativo: p.nome,
      qualifica: p.qualifica || "Operaio",
      // Unstructured titles and historical HR flags remain references for human review.
      base: false, rischi_specifici: false, dpi_terza_categoria: false,
      rischi_cantiere: false,
      altro: "",
      attestati: elencoAttestati,
      verificata: false,
    };
  });

  // Un corso non equivale a una nomina: nessun addetto viene designato per parole nel titolo.
  if(!pos.emergenze.addetti.length&&attestati.length) avvisi.push("Verifica le designazioni degli addetti alle emergenze nella commessa. Gli attestati non costituiscono una nomina.");

  // Turni di lavoro: l'orario più comune di chi lavora sulla commessa.
  if (!pos.opera.turni_lavoro && hrIds.length) {
    const { data: orari, error: orariError } = await db.from("hr_profili").select("orario_inizio, orario_fine, pausa_pranzo_minuti, giorni_lavorativi").eq("company_id",companyId).in("id", hrIds);
    if(orariError) throw new Error(`Orari non disponibili: ${orariError.message}`);
    const conti = new Map<string, { n: number; testo: string }>();
    for (const o of (orari ?? []) as Row[]) {
      const inizio = s(o.orario_inizio).slice(0, 5);
      const fine = s(o.orario_fine).slice(0, 5);
      if (!inizio || !fine) continue;
      const giorni = Array.isArray(o.giorni_lavorativi) ? (o.giorni_lavorativi as string[]) : [];
      const settimana = giorni.join(",") === "Lun,Mar,Mer,Gio,Ven" ? "dal lunedì al venerdì"
        : giorni.join(",") === "Lun,Mar,Mer,Gio,Ven,Sab" ? "dal lunedì al sabato"
        : giorni.length ? giorni.join(", ") : "";
      const pausa = Number(o.pausa_pranzo_minuti) > 0 ? ` con pausa di ${Number(o.pausa_pranzo_minuti)} minuti` : "";
      const testo = `Turno unico diurno dalle ${inizio} alle ${fine}${pausa}${settimana ? `, ${settimana}` : ""}.`;
      const k = testo;
      conti.set(k, { n: (conti.get(k)?.n ?? 0) + 1, testo });
    }
    const piuComune = [...conti.values()].sort((x, y) => y.n - x.n)[0];
    if (piuComune) pos.opera.turni_lavoro = piuComune.testo;
  }

  // ── Contesto per le schede delle lavorazioni ─────────────────────────────
  const mezzi = ((mezziRes.data ?? []) as Row[]).map((m) => ({ nome: s(m.nome), tipo: s(m.tipo), targa: s(m.targa) || null }));
  // Le opere provvisionali contano nel POS (ponteggi: PiMUS): ci vanno con quanto è montato adesso.
  const unita: Record<string, string> = { mq: "m²", mc: "m³", ml: "m", pz: "pz", kg: "kg" };
  const montatiPerNome = new Map<string, { nome: string; tipo: string; quantita: number; unita: string }>();
  for (const a of (montatiRes.data ?? []) as Row[]) {
    const m = a.mezzo as Row | null;
    if (!m || m.deleted_at || (a.dal && s(a.dal)>riferimento) || (a.al && s(a.al)<riferimento)) continue;
    const nome = s(m.nome);
    const cur = montatiPerNome.get(nome) ?? { nome, tipo: s(m.tipo), quantita: 0, unita: unita[s(m.unita_misura)] ?? s(m.unita_misura) };
    cur.quantita += Number(a.quantita) || 0;
    montatiPerNome.set(nome, cur);
  }
  for (const g of montatiPerNome.values()) {
    const q = String(Math.round(g.quantita * 100) / 100).replace(".", ",");
    mezzi.push({ nome: `${g.nome} (${q} ${g.unita} montati)`, tipo: g.tipo, targa: null });
  }
  const subappaltatori = [...impreseDirette,...((altreImprese.data??[]) as Row[])].map((r) => ({
    ragione_sociale: s(r.ragione_sociale),
    tipo_lavori: s(r.tipo_lavori),
    durc_scadenza: s(r.durc_scadenza) || null,
  }));

  const riferimenti = (righe: Row[], campi: string[]) => righe.map(r => Object.fromEntries(campi.filter(k => r[k] !== undefined).map(k => [k,r[k]])));
  const fonti = {
    riferimento_periodo: riferimento,
    figure_candidati: riferimenti((figureRes.data??[]) as Row[],["id","ruolo","scadenza","updated_at"]),
    incarichi: riferimenti((incarichiRes.data??[]) as Row[],["id","ruolo","stato","dal","al","figura_id","subappaltatore_id","updated_at"]),
    dipendenti: riferimenti(employees,["id","user_id","qualifica","livello_inquadramento"]),
    profili_hr: riferimenti([...hrByEmp,...((hrByUser.data??[]) as Row[])],["id","user_id","employee_id","mansione"]),
    assegnazioni_campo: riferimenti(campo,["user_id","role_type","is_capocantiere"]),
    attestati: riferimenti(attestati,["id","hr_profilo_id","titolo","ente","data_scadenza"]),
    mezzi: riferimenti((mezziRes.data??[]) as Row[],["id","nome","tipo","targa"]),
    fasi: riferimenti((fasiRes.data??[]) as Row[],["id","name","position"]),
    imprese: riferimenti([...impreseDirette,...((altreImprese.data??[]) as Row[])],["id","ragione_sociale","tipo_lavori","durc_scadenza"]),
  };
  return { contenuto: pos, contesto: { mezzi, subappaltatori, fasi, avvisi }, order, fonti };
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
