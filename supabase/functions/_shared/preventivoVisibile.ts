/**
 * Chi chiama può vedere questo preventivo? E modificarlo? (26/09/2026)
 *
 * Lo decide la RLS di quotes, letta con un client che porta il token di chi
 * chiama e non il service role: è la stessa regola dell'app. Il permesso sui
 * Preventivi o sulle Commesse, solo gli assegnati per chi vede solo i suoi, il
 * titolare, il super admin; mai l'utente bloccato né il cliente esterno del
 * portale. requireCompanyAccess guarda soltanto l'azienda: bastava esserne parte
 * per avere il PDF di qualsiasi suo preventivo.
 *
 * Modificare è di più che vedere: la risposta la dà preventivo_modificabile, che
 * legge la riga con un blocco e così passa anche dalla policy di modifica
 * (q_upd_preventivi). Serve a chi scrive sul preventivo col service role, come
 * send-quote-signature.
 *
 * Senza import: il client lo crea chi chiama, e la regola si prova con vitest.
 */

interface RispostaRiga {
  data: unknown;
  error: unknown;
}

export interface ClienteDiChiChiama {
  from(tabella: "quotes"): {
    select(colonne: "id"): {
      eq(colonna: "id", valore: string): { maybeSingle(): PromiseLike<RispostaRiga> };
    };
  };
}

export interface ClienteRpcDiChiChiama {
  rpc(funzione: "preventivo_modificabile", argomenti: { p_quote_id: string }): PromiseLike<RispostaRiga>;
}

export async function preventivoVisibile(client: ClienteDiChiChiama, quoteId: string): Promise<boolean> {
  if (!quoteId) return false;
  const { data, error } = await client.from("quotes").select("id").eq("id", quoteId).maybeSingle();
  return !error && Boolean(data);
}

export async function preventivoModificabile(client: ClienteRpcDiChiChiama, quoteId: string): Promise<boolean> {
  if (!quoteId) return false;
  const { data, error } = await client.rpc("preventivo_modificabile", { p_quote_id: quoteId });
  return !error && data === true;
}
