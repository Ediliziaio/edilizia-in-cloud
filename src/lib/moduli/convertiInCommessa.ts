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

export interface EsitoConversione {
  orderId: string;
  righe: number;
}

interface RigaCommessa {
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
    .select("id, company_id, numero, titolo, stato, cliente_id, cliente_nome, cliente_cognome, indirizzo, comune, prezzo_vendita_iva_inclusa, prezzo_vendita_manuale, iva_aliquota, ordine_id")
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

  const righe: RigaCommessa[] = [];
  for (const c of componenti.data ?? []) {
    const nome = [c.marca, c.modello].filter(Boolean).join(" ").trim() || String(c.descrizione ?? "Componente");
    righe.push({
      name: nome.slice(0, 120),
      description: c.descrizione && c.descrizione !== nome ? String(c.descrizione) : (c.categoria ? String(c.categoria) : null),
      quantity: Number(c.quantita) || 1,
      status: "da_ordinare",
      position: righe.length,
      unit_price: arrotonda(c.prezzo_unitario_vendita ?? c.prezzo_unitario_netto),
      purchase_price: arrotonda(c.prezzo_unitario_netto),
      vat_rate: aliquota,
    });
  }
  for (const s of servizi.data ?? []) {
    righe.push({
      name: String(s.descrizione ?? s.tipo ?? "Servizio").slice(0, 120),
      description: s.tipo ? String(s.tipo) : null,
      quantity: Number(s.quantita) || 1,
      status: "da_ordinare",
      position: righe.length,
      unit_price: arrotonda(s.prezzo_vendita ?? s.prezzo_netto),
      purchase_price: arrotonda(s.prezzo_netto),
      vat_rate: aliquota,
    });
  }
  for (const m of manodopera.data ?? []) {
    righe.push({
      name: String(m.descrizione ?? "Manodopera").slice(0, 120),
      description: "Manodopera",
      quantity: Number(m.ore) || 1,
      status: "da_ordinare",
      position: righe.length,
      unit_price: arrotonda(m.tariffa_oraria_vendita ?? m.tariffa_oraria_netta),
      purchase_price: arrotonda(m.tariffa_oraria_netta),
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
    clienteId: (progetto.cliente_id as string | null) ?? null,
    note: `Da preventivo fotovoltaico ${progetto.numero}${luogo ? ` — ${luogo}` : ""}`,
    righe: righe.length > 0 ? righe : rigaRiepilogo(descrizione, totale, aliquota),
  });

  // Legame nei due sensi: la commessa ricorda il preventivo e il preventivo la
  // commessa, così il bottone non può creare un doppione.
  await supabase.from("orders").update({ fv_progetto_id: progettoId } as never).eq("id", orderId);
  const { error: errLink } = await supabase.from("fv_progetti").update({ ordine_id: orderId } as never).eq("id", progettoId);
  if (errLink) throw new Error(`Commessa creata ma non collegata al preventivo: ${errLink.message}`);

  return { orderId, righe: righe.length };
}

// ────────────────────────── Ristrutturazione ──────────────────────────

export async function convertiRstInCommessa(progettoId: string, userId: string): Promise<EsitoConversione> {
  const { data: progetto, error } = await supabase
    .from("rst_progetti")
    .select("id, company_id, code, stato, note, cliente_id, cliente_nome, cliente_cognome, cantiere_indirizzo, cantiere_citta, totale, totale_imponibile, iva_pct, ordine_id")
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
    const quantita = Number(v.quantita) || 1;
    // I costi del computo sono per riga: la commessa li vuole per unità.
    const costoRiga = (Number(v.costo_materiali) || 0) + (Number(v.costo_manodopera) || 0);
    return {
      name: String(v.descrizione ?? "Voce di computo").slice(0, 120),
      description: [v.capitolo_nome, v.unita_misura].filter(Boolean).join(" · ") || null,
      quantity: quantita,
      status: "da_ordinare",
      position: idx,
      unit_price: arrotonda(v.prezzo_unitario),
      purchase_price: arrotonda(quantita > 0 ? costoRiga / quantita : costoRiga),
      vat_rate: aliquota,
    };
  });

  const descrizione = String(progetto.note ?? "").trim().split("\n")[0].slice(0, 120)
    || `Ristrutturazione ${progetto.code ?? ""}`.trim();
  const luogo = [progetto.cantiere_indirizzo, progetto.cantiere_citta].filter(Boolean).join(", ");

  const orderId = await creaCommessa({
    companyId: progetto.company_id,
    userId,
    descrizione,
    totale,
    aliquotaIva: aliquota,
    clienteId: (progetto.cliente_id as string | null) ?? null,
    note: `Da preventivo ristrutturazione ${progetto.code ?? ""}${luogo ? ` — ${luogo}` : ""}`.trim(),
    righe: righe.length > 0 ? righe : rigaRiepilogo(descrizione, totale, aliquota),
  });

  await supabase.from("orders").update({ rst_progetto_id: progettoId } as never).eq("id", orderId);
  const { error: errLink } = await supabase.from("rst_progetti").update({ ordine_id: orderId } as never).eq("id", progettoId);
  if (errLink) throw new Error(`Commessa creata ma non collegata al preventivo: ${errLink.message}`);

  return { orderId, righe: righe.length };
}
