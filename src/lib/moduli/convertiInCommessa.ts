/**
 * Preventivo di modulo → commessa, per Fotovoltaico e Ristrutturazione.
 *
 * Serramenti la conversione ce l'ha dal maggio 2026 (RPC sr_converti_in_ordine).
 * Fotovoltaico aveva la colonna `fv_progetti.ordine_id` dall'ottobre 2026 senza
 * che nessuno la scrivesse mai, e Ristrutturazione non aveva nemmeno quella:
 * un preventivo accettato restava lì e la commessa si rifaceva a mano.
 *
 * Qui si passa da `create_order_atomic`, la stessa RPC della nuova commessa e
 * del simulatore: testata, righe e storico stato nascono insieme o non nasce
 * niente. La riga del modulo viene poi legata alla commessa nei due sensi,
 * così la conversione non può ripetersi per sbaglio.
 */
import { supabase } from "@/integrations/supabase/client";
import { testoIndirizzo } from "@/lib/preventivatore/indirizzoLavori";

export interface EsitoConversione {
  orderId: string;
  righe: number;
  /** La commessa c'è ma qualcosa non è passato (cliente e indirizzo non scritti): lo si dice a chi ha cliccato. */
  avviso?: string | null;
}

export interface RigaCommessa {
  name: string;
  description: string | null;
  quantity: number;
  status: string;
  position: number;
  unit_price: number;
  purchase_price: number;
  vat_rate: number;
}

/**
 * Un'aliquota può arrivare come frazione (0,10) o come percentuale (10). Lo 0 è
 * un'aliquota vera (reverse charge, esenzione): diventava 22%.
 */
function aliquotaInPercentuale(valore: unknown, predefinita = 22): number {
  if (valore == null || valore === "") return predefinita;
  const n = Number(valore);
  if (!Number.isFinite(n) || n < 0) return predefinita;
  return n > 0 && n <= 1 ? Math.round(n * 10000) / 100 : n;
}

/** L'imponibile da un totale IVA inclusa. */
function scorporaIva(totaleIvato: number, aliquota: number): number {
  return arrotonda(totaleIvato / (1 + aliquota / 100));
}

function arrotonda(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// "always": anche a quattro cifre il punto delle migliaia (vedi formatCount).
const QUANTITA_IT = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 3,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);
const EURO_IT = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

/** L'unità come si scrive: mq → m², mc → m³; le altre restano com'erano. */
function unitaLeggibile(unita: string | null | undefined): string {
  const u = String(unita ?? "").trim();
  if (u === "mq") return "m²";
  if (u === "mc") return "m³";
  return u;
}

/**
 * Quantità, prezzo e costo della riga di commessa da quelli PER UNITÀ di una
 * riga di preventivo (05/10/2026).
 *
 * `order_items.quantity` è un intero (create_order_atomic fa `::integer`, e
 * nove viste dipendono dalla colonna): una quantità con decimali — 85,5 m² di
 * una ristrutturazione, 7,5 ore di manodopera del fotovoltaico — faceva fallire
 * tutta la conversione. Con i decimali la riga diventa 1 × il totale di riga,
 * col costo di riga, e la quantità vera va in testa alla descrizione
 * («85,5 m² × 30,00 €»). Il totale della commessa non cambia.
 */
export function quantitaPerCommessa(riga: {
  quantita: number;
  prezzoUnitario: number;
  costoUnitario: number;
  unita?: string | null;
  descrizione?: string | null;
}): Pick<RigaCommessa, "quantity" | "unit_price" | "purchase_price" | "description"> {
  const quantita = Number(riga.quantita);
  const prezzo = Number(riga.prezzoUnitario) || 0;
  const costo = Number(riga.costoUnitario) || 0;
  const descrizione = riga.descrizione?.trim() || null;
  if (Number.isInteger(quantita)) {
    return { quantity: quantita, unit_price: arrotonda(prezzo), purchase_price: arrotonda(costo), description: descrizione };
  }
  const unita = unitaLeggibile(riga.unita);
  const quanto = `${QUANTITA_IT.format(quantita)}${unita ? ` ${unita}` : ""} × ${EURO_IT.format(prezzo)}`;
  return {
    quantity: 1,
    unit_price: arrotonda(quantita * prezzo),
    purchase_price: arrotonda(quantita * costo),
    description: descrizione ? `${quanto} · ${descrizione}` : quanto,
  };
}

/**
 * Stato di partenza della commessa. `create_order_atomic` scrive lo storico
 * stati, e quella riga non ammette uno stato nullo: senza questo la
 * conversione falliva con un errore di vincolo incomprensibile per l'utente.
 */
async function statoInizialeCommessa(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("order_statuses")
    .select("id, is_default, position")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function prossimoCodiceCommessa(companyId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "prossimo_numero_commessa" as never,
    { p_company_id: companyId } as never,
  );
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * Il cliente della commessa. `orders.customer_id` punta a `profiles(id)`, l'account di un cliente del portale;
 * il preventivo di modulo tiene in `cliente_id` un CONTATTO del CRM. Passarlo com'era violava la chiave esterna
 * per ogni preventivo con un contatto collegato: in produzione 14 preventivi lo hanno, 0 conversioni sono mai
 * riuscite. Il contatto sa a quale profilo corrisponde; se non ne ha uno la commessa nasce senza `customer_id`
 * e nome e recapiti stanno nei campi `client_*` (`campiClienteCommessa`), come nella conversione del preventivo
 * generico e nell'automazione «crea cantiere».
 */
async function profiloClienteDelContatto(contattoId: string | null | undefined): Promise<string | null> {
  if (!contattoId) return null;
  const { data } = await supabase
    .from("marketing_contacts")
    .select("customer_profile_id")
    .eq("id", contattoId)
    .maybeSingle();
  return (data as { customer_profile_id?: string | null } | null)?.customer_profile_id ?? null;
}

interface DatiClientePreventivo {
  nome?: string | null;
  cognome?: string | null;
  email?: string | null;
  telefono?: string | null;
  /** «Via Roma 1, 10121 Torino (TO)», o vuoto. */
  indirizzoLavori?: string | null;
}

/**
 * Nome, recapiti e indirizzo dei lavori del preventivo, come si scrivono sulla commessa: la RPC
 * `create_order_atomic` non ha queste colonne, e senza la scheda diceva «Cliente non disponibile» e il calendario
 * non aveva l'indirizzo. L'indirizzo va in `indirizzo_lavori` e `work_address`, come fa «Nuova commessa».
 * Niente campi vuoti: non si cancella ciò che non c'è.
 */
function campiClienteCommessa(c: DatiClientePreventivo): Record<string, string> {
  const campi: Record<string, string> = {};
  const pulito = (v: string | null | undefined) => (v ?? "").trim();
  const nome = [pulito(c.nome), pulito(c.cognome)].filter(Boolean).join(" ");
  if (nome) campi.client_name = nome;
  if (pulito(c.email)) campi.client_email = pulito(c.email);
  if (pulito(c.telefono)) campi.client_phone = pulito(c.telefono);
  if (pulito(c.indirizzoLavori)) {
    campi.indirizzo_lavori = pulito(c.indirizzoLavori);
    campi.work_address = pulito(c.indirizzoLavori);
  }
  return campi;
}

/**
 * Un aggiornamento che non dà errore ma non cambia nessuna riga: l'`update` di PostgREST con `.select()` risponde con
 * una lista vuota. Succede quando le regole di accesso non fanno vedere la riga a chi scrive: per il ruolo «solo assegnati»
 * la commessa appena creata non è «sua» (can_see_order) e l'UPDATE passa senza errore e senza scrivere niente.
 * (Una risposta senza lista non dice niente: non conta come «nessuna riga».)
 */
const nessunaRigaAggiornata = (righe: unknown): boolean => Array.isArray(righe) && righe.length === 0;

/**
 * Dopo la RPC: quello che la RPC non scrive (cliente, indirizzo dei lavori, legame col preventivo) e il legame
 * inverso sul preventivo. Il preventivo si lega SEMPRE alla commessa, anche se cliente e indirizzo non si
 * riescono a scrivere (se ne avvisa): senza il legame un secondo clic ne creerebbe un'altra.
 *
 * «Non si riescono a scrivere» vale anche per l'aggiornamento che non dà errore ma non cambia nessuna riga (vedi
 * nessunaRigaAggiornata): prima si guardava solo l'errore, e per il ruolo «solo assegnati» cliente e indirizzo non
 * si scrivevano e l'avviso non compariva.
 */
async function legaCommessaAlPreventivo(params: {
  orderId: string;
  progettoId: string;
  tabella: "fv_progetti" | "rst_progetti";
  colonnaCommessa: "fv_progetto_id" | "rst_progetto_id";
  cliente: DatiClientePreventivo;
}): Promise<string | null> {
  const { data: righeCommessa, error: errCommessa } = await supabase
    .from("orders")
    .update({ [params.colonnaCommessa]: params.progettoId, ...campiClienteCommessa(params.cliente) } as never)
    .eq("id", params.orderId)
    .select("id");
  const commessaNonScritta = Boolean(errCommessa) || nessunaRigaAggiornata(righeCommessa);
  // Il legame sul preventivo: se manca, il bottone resterebbe acceso e il preventivo si convertirebbe due volte.
  const { data: righeLink, error: errLink } = await supabase
    .from(params.tabella)
    .update({ ordine_id: params.orderId } as never)
    .eq("id", params.progettoId)
    .select("id");
  if (errLink) throw new Error(`Commessa creata ma non collegata al preventivo: ${errLink.message}`);
  if (nessunaRigaAggiornata(righeLink)) {
    throw new Error("Commessa creata ma non collegata al preventivo: il preventivo non risulta modificabile da te (nessuna riga aggiornata).");
  }
  return commessaNonScritta
    ? "La commessa è stata creata, ma cliente e indirizzo dei lavori non sono stati scritti: aggiungili dalla scheda della commessa."
    : null;
}

/** Chiama la RPC atomica e restituisce l'id della commessa creata. */
async function creaCommessa(params: {
  companyId: string;
  userId: string;
  descrizione: string;
  totale: number;
  aliquotaIva: number;
  clienteId: string | null;
  note: string | null;
  righe: RigaCommessa[];
}): Promise<string> {
  const [codice, statoIniziale] = await Promise.all([
    prossimoCodiceCommessa(params.companyId),
    statoInizialeCommessa(params.companyId),
  ]);
  if (!statoIniziale) {
    throw new Error("L'azienda non ha ancora gli stati commessa: impostali in Commesse → Stati e riprova.");
  }
  const totale = arrotonda(params.totale);

  const { data, error } = await supabase.rpc("create_order_atomic" as never, {
    p_order_data: {
      company_id: params.companyId,
      customer_id: params.clienteId,
      order_code: codice,
      description: params.descrizione,
      // Imponibile: il PDF della commessa ci aggiunge l'IVA di vat_rate.
      total_amount: totale,
      // Acconto e saldo si impostano dalla commessa: qui non inventiamo un
      // piano di pagamento che il preventivo di modulo non contiene.
      deposit_amount: 0,
      balance_amount: totale,
      payment_type: "standard",
      current_status_id: statoIniziale,
      vat_rate: params.aliquotaIva,
      internal_notes: params.note,
    },
    p_items: params.righe,
    p_salesperson: null,
    p_user_id: params.userId,
    p_installments: [],
  } as never);

  if (error) throw new Error(error.message);
  const esito = data as { id?: string; success?: boolean } | null;
  if (!esito?.id) throw new Error("La commessa non è stata creata");
  return esito.id;
}

/** Quando il modulo non ha righe di dettaglio, la commessa nasce con una riga sola. */
function rigaRiepilogo(descrizione: string, totale: number, aliquota: number): RigaCommessa[] {
  return [{
    name: descrizione.slice(0, 120),
    description: "Importo complessivo del preventivo: il dettaglio si aggiunge qui.",
    quantity: 1,
    status: "da_ordinare",
    position: 0,
    unit_price: arrotonda(totale),
    purchase_price: 0,
    vat_rate: aliquota,
  }];
}

// ─────────────────────────── Fotovoltaico ───────────────────────────

export async function convertiFvInCommessa(progettoId: string, userId: string): Promise<EsitoConversione> {
  const { data: progetto, error } = await supabase
    .from("fv_progetti")
    .select("id, company_id, numero, titolo, stato, cliente_id, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, indirizzo, comune, cap, provincia, prezzo_vendita_iva_inclusa, prezzo_vendita_manuale, iva_aliquota, ordine_id")
    .eq("id", progettoId)
    .single();
  if (error || !progetto) throw new Error("Preventivo fotovoltaico non trovato");
  if (progetto.ordine_id) throw new Error("Questo preventivo è già diventato una commessa");

  const aliquota = aliquotaInPercentuale(progetto.iva_aliquota, 10);
  // Nella commessa total_amount è l'imponibile e l'IVA si aggiunge da vat_rate.
  // Il prezzo manuale è già imponibile; prezzo_vendita_iva_inclusa no: prima
  // finiva così com'era, e l'IVA si contava due volte.
  const manuale = Number(progetto.prezzo_vendita_manuale ?? 0);
  const totale = manuale > 0
    ? arrotonda(manuale)
    : scorporaIva(Number(progetto.prezzo_vendita_iva_inclusa ?? 0), aliquota);
  if (totale <= 0) throw new Error("Il preventivo non ha un prezzo di vendita: completalo prima di creare la commessa");

  const [componenti, servizi, manodopera] = await Promise.all([
    supabase.from("fv_componenti_progetto")
      .select("categoria, descrizione, marca, modello, quantita, prezzo_unitario_netto, prezzo_unitario_vendita, ordinamento")
      .eq("progetto_id", progettoId).order("ordinamento", { ascending: true }),
    supabase.from("fv_servizi_progetto")
      .select("tipo, descrizione, quantita, prezzo_netto, prezzo_vendita, ordinamento")
      .eq("progetto_id", progettoId).order("ordinamento", { ascending: true }),
    supabase.from("fv_manodopera_progetto")
      .select("descrizione, ore, tariffa_oraria_netta, tariffa_oraria_vendita, ordinamento")
      .eq("progetto_id", progettoId).order("ordinamento", { ascending: true }),
  ]);

  // Prezzi e costi qui sono per unità (per ora la manodopera): con una quantità
  // con decimali la riga diventa 1 × il totale (quantitaPerCommessa).
  const righe: RigaCommessa[] = [];
  for (const c of componenti.data ?? []) {
    const nome = [c.marca, c.modello].filter(Boolean).join(" ").trim() || String(c.descrizione ?? "Componente");
    righe.push({
      name: nome.slice(0, 120),
      ...quantitaPerCommessa({
        quantita: Number(c.quantita) || 1,
        prezzoUnitario: Number(c.prezzo_unitario_vendita ?? c.prezzo_unitario_netto),
        costoUnitario: Number(c.prezzo_unitario_netto),
        descrizione: c.descrizione && c.descrizione !== nome ? String(c.descrizione) : (c.categoria ? String(c.categoria) : null),
      }),
      status: "da_ordinare",
      position: righe.length,
      vat_rate: aliquota,
    });
  }
  for (const s of servizi.data ?? []) {
    righe.push({
      name: String(s.descrizione ?? s.tipo ?? "Servizio").slice(0, 120),
      ...quantitaPerCommessa({
        quantita: Number(s.quantita) || 1,
        prezzoUnitario: Number(s.prezzo_vendita ?? s.prezzo_netto),
        costoUnitario: Number(s.prezzo_netto),
        descrizione: s.tipo ? String(s.tipo) : null,
      }),
      status: "da_ordinare",
      position: righe.length,
      vat_rate: aliquota,
    });
  }
  for (const m of manodopera.data ?? []) {
    righe.push({
      name: String(m.descrizione ?? "Manodopera").slice(0, 120),
      ...quantitaPerCommessa({
        quantita: Number(m.ore) || 1,
        prezzoUnitario: Number(m.tariffa_oraria_vendita ?? m.tariffa_oraria_netta),
        costoUnitario: Number(m.tariffa_oraria_netta),
        unita: "h",
        descrizione: "Manodopera",
      }),
      status: "da_ordinare",
      position: righe.length,
      vat_rate: aliquota,
    });
  }

  // Le righe devono sommare al totale. Col prezzo a corpo (anche senza listino,
  // con righe a 0 €) o con uno sconto non tornavano: la differenza diventa una
  // riga sua, e la commessa dice quanto vale ogni cosa.
  const sommaRighe = arrotonda(righe.reduce((s, r) => s + r.unit_price * r.quantity, 0));
  const differenza = arrotonda(totale - sommaRighe);
  const soglia = manuale > 0 ? 0.01 : 0.5; // sotto 50 cent è l'arrotondamento dello scorporo IVA
  if (righe.length > 0 && Math.abs(differenza) >= soglia) {
    righe.push({
      name: manuale > 0 ? "Prezzo a corpo" : differenza < 0 ? "Sconto commerciale" : "Adeguamento al totale del preventivo",
      description: manuale > 0
        ? "Differenza tra il prezzo a corpo del preventivo e le righe di dettaglio."
        : differenza < 0
          ? "Sconto concesso nel preventivo."
          : null,
      quantity: 1,
      status: "da_ordinare",
      position: righe.length,
      unit_price: differenza,
      purchase_price: 0,
      vat_rate: aliquota,
    });
  }

  const descrizione = String(progetto.titolo ?? "").trim() || `Impianto fotovoltaico ${progetto.numero}`;
  const luogo = [progetto.indirizzo, progetto.comune].filter(Boolean).join(", ");

  const orderId = await creaCommessa({
    companyId: progetto.company_id,
    userId,
    descrizione,
    totale,
    aliquotaIva: aliquota,
    // `cliente_id` è un contatto del CRM, `orders.customer_id` un profilo: vedi profiloClienteDelContatto.
    clienteId: await profiloClienteDelContatto(progetto.cliente_id as string | null),
    note: `Da preventivo fotovoltaico ${progetto.numero}${luogo ? ` — ${luogo}` : ""}`,
    righe: righe.length > 0 ? righe : rigaRiepilogo(descrizione, totale, aliquota),
  });

  // Legame nei due sensi: la commessa ricorda il preventivo e il preventivo la
  // commessa, così il bottone non può creare un doppione. Con loro, cliente e
  // indirizzo dei lavori, che la RPC non scrive.
  const avviso = await legaCommessaAlPreventivo({
    orderId,
    progettoId,
    tabella: "fv_progetti",
    colonnaCommessa: "fv_progetto_id",
    cliente: {
      nome: progetto.cliente_nome,
      cognome: progetto.cliente_cognome,
      email: progetto.cliente_email,
      telefono: progetto.cliente_telefono,
      indirizzoLavori: testoIndirizzo({ indirizzo: progetto.indirizzo, citta: progetto.comune, cap: progetto.cap, provincia: progetto.provincia }),
    },
  });

  return { orderId, righe: righe.length, avviso };
}

// ────────────────────────── Ristrutturazione ──────────────────────────

export async function convertiRstInCommessa(progettoId: string, userId: string): Promise<EsitoConversione> {
  const { data: progetto, error } = await supabase
    .from("rst_progetti")
    .select("id, company_id, code, stato, note, cliente_id, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cantiere_indirizzo, cantiere_citta, cantiere_cap, cantiere_provincia, totale, totale_imponibile, iva_pct, prezzo_manuale, ordine_id")
    .eq("id", progettoId)
    .single();
  if (error || !progetto) throw new Error("Preventivo ristrutturazione non trovato");
  if ((progetto as { ordine_id?: string | null }).ordine_id) throw new Error("Questo preventivo è già diventato una commessa");

  const aliquota = aliquotaInPercentuale(progetto.iva_pct, 22);
  // Imponibile, come le altre commesse: `totale` è IVA inclusa.
  const totale = Number(progetto.totale_imponibile ?? 0) > 0
    ? arrotonda(progetto.totale_imponibile)
    : scorporaIva(Number(progetto.totale ?? 0), aliquota);
  if (totale <= 0) throw new Error("Il computo è vuoto: completalo prima di creare la commessa");

  const { data: voci } = await supabase
    .from("rst_computo_voci")
    .select("capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario, sconto_pct, importo, costo_materiali, costo_manodopera, ordine")
    .eq("progetto_id", progettoId)
    .order("ordine", { ascending: true });

  const righe: RigaCommessa[] = (voci ?? []).map((v, idx) => {
    // Una voce senza quantità (0, mancante) non porta importo nel preventivo: nella commessa resta una
    // riga a 0 €, non «1 × il suo prezzo» (06/10/2026: la commessa si riempiva di una riga che nel
    // preventivo non c'era, compensata da uno «Sconto commerciale» che nessuno aveva concesso).
    const quantitaVera = Number(v.quantita);
    const contata = Number.isFinite(quantitaVera) && quantitaVera > 0;
    const quantita = contata ? quantitaVera : 1;
    return {
      name: String(v.descrizione ?? "Voce di computo").slice(0, 120),
      // I costi del computo sono già per unità (calcTotaliComputo li moltiplica
      // per la quantità), come li vuole la commessa. 05/10/2026: qui si
      // dividevano di nuovo per la quantità — 50 m² a 30 €/m² di costo
      // diventavano 0,60 €/m², e la commessa mostrava un margine del 99%.
      ...quantitaPerCommessa({
        quantita,
        prezzoUnitario: contata ? Number(v.prezzo_unitario) : 0,
        costoUnitario: contata ? (Number(v.costo_materiali) || 0) + (Number(v.costo_manodopera) || 0) : 0,
        unita: v.unita_misura,
        // Con i decimali l'unità è già davanti, nella quantità.
        descrizione: (Number.isInteger(quantita)
          ? [v.capitolo_nome, v.unita_misura].filter(Boolean).join(" · ")
          : v.capitolo_nome) || null,
      }),
      status: "da_ordinare",
      position: idx,
      vat_rate: aliquota,
    };
  });

  // Le righe devono sommare al totale, come nel fotovoltaico. Col prezzo scritto
  // a mano le righe possono essere a 0 €, e con lo sconto globale (o quello di
  // riga) non tornavano: la differenza diventa una riga sua.
  const manuale = Number(progetto.prezzo_manuale ?? 0);
  const sommaRighe = arrotonda(righe.reduce((s, r) => s + r.unit_price * r.quantity, 0));
  const differenza = arrotonda(totale - sommaRighe);
  const soglia = manuale > 0 ? 0.01 : 0.5; // sotto 50 cent è l'arrotondamento dello scorporo IVA
  if (righe.length > 0 && Math.abs(differenza) >= soglia) {
    righe.push({
      name: manuale > 0 ? "Prezzo a corpo" : differenza < 0 ? "Sconto commerciale" : "Adeguamento al totale del preventivo",
      description: manuale > 0
        ? "Differenza tra il prezzo scritto nel preventivo e le righe del computo."
        : differenza < 0
          ? "Sconto concesso nel preventivo."
          : null,
      quantity: 1,
      status: "da_ordinare",
      position: righe.length,
      unit_price: differenza,
      purchase_price: 0,
      vat_rate: aliquota,
    });
  }

  const descrizione = String(progetto.note ?? "").trim().split("\n")[0].slice(0, 120)
    || `Ristrutturazione ${progetto.code ?? ""}`.trim();
  const luogo = [progetto.cantiere_indirizzo, progetto.cantiere_citta].filter(Boolean).join(", ");

  const orderId = await creaCommessa({
    companyId: progetto.company_id,
    userId,
    descrizione,
    totale,
    aliquotaIva: aliquota,
    // `cliente_id` è un contatto del CRM, `orders.customer_id` un profilo: vedi profiloClienteDelContatto.
    clienteId: await profiloClienteDelContatto(progetto.cliente_id as string | null),
    note: `Da preventivo ristrutturazione ${progetto.code ?? ""}${luogo ? ` — ${luogo}` : ""}`.trim(),
    righe: righe.length > 0 ? righe : rigaRiepilogo(descrizione, totale, aliquota),
  });

  const avviso = await legaCommessaAlPreventivo({
    orderId,
    progettoId,
    tabella: "rst_progetti",
    colonnaCommessa: "rst_progetto_id",
    cliente: {
      nome: progetto.cliente_nome,
      cognome: progetto.cliente_cognome,
      email: progetto.cliente_email,
      telefono: progetto.cliente_telefono,
      indirizzoLavori: testoIndirizzo({
        indirizzo: progetto.cantiere_indirizzo,
        citta: progetto.cantiere_citta,
        cap: progetto.cantiere_cap,
        provincia: progetto.cantiere_provincia,
      }),
    },
  });

  return { orderId, righe: righe.length, avviso };
}
