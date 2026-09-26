/**
 * Chi chiama può vedere questo preventivo? (26/09/2026)
 *
 * Lo decide la RLS di quotes, letta con un client che porta il token di chi
 * chiama e non il service role: è la stessa regola dell'app. Il permesso sui
 * Preventivi o sulle Commesse, solo gli assegnati per chi vede solo i suoi, il
 * titolare, il super admin; mai l'utente bloccato né il cliente esterno del
 * portale. requireCompanyAccess guarda soltanto l'azienda: bastava esserne parte
 * per avere il PDF di qualsiasi suo preventivo.
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

export async function preventivoVisibile(client: ClienteDiChiChiama, quoteId: string): Promise<boolean> {
  if (!quoteId) return false;
  const { data, error } = await client.from("quotes").select("id").eq("id", quoteId).maybeSingle();
  return !error && Boolean(data);
}
