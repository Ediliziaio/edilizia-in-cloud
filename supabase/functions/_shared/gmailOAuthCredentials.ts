/**
 * Credenziali OAuth del collegamento Gmail.
 *
 * Gmail va in un progetto Google Cloud suo: i suoi scope sono «restricted» e,
 * nello stesso progetto di Calendar, Ads e Business Profile, costringerebbero
 * tutta la verifica dell'app a passare dalla valutazione di sicurezza CASA.
 * Per questo ha nomi propri: GOOGLE_GMAIL_CLIENT_ID e GOOGLE_GMAIL_CLIENT_SECRET.
 *
 * Finché non sono impostati entrambi si usano GOOGLE_OAUTH_CLIENT_ID/SECRET,
 * come prima. Quelle NON vanno sostituite con il client del progetto nuovo: le
 * leggono anche google-ads-list-from-account e google-crm-conversion-sync.
 *
 * Un token si rinnova solo con il client che l'ha emesso: passando al progetto
 * nuovo, le caselle Gmail già collegate vanno ricollegate.
 */
export function credenzialiGmail(): {
  clientId: string | undefined;
  clientSecret: string | undefined;
  nomeId: string;
  nomeSecret: string;
} {
  const id = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET");
  if (id && secret) {
    return { clientId: id, clientSecret: secret, nomeId: "GOOGLE_GMAIL_CLIENT_ID", nomeSecret: "GOOGLE_GMAIL_CLIENT_SECRET" };
  }
  return {
    clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"),
    nomeId: "GOOGLE_OAUTH_CLIENT_ID",
    nomeSecret: "GOOGLE_OAUTH_CLIENT_SECRET",
  };
}
