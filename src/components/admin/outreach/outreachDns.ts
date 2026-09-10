/**
 * I record DNS giusti per il provider delle caselle del dominio.
 *
 * SPF: l'`include` del provider che spedisce davvero — non quello di un altro
 * servizio. DKIM: dipende dal provider; Register (SecureMail) non firma la
 * posta del dominio del cliente, e va detto chiaro invece di indicare un
 * selettore che non esisterà mai.
 */
export function istruzioniDns(dominio: string, hostSmtp: Array<string | null>, providers: string[] = []): {
  provider: string; spf: string; dkimTipo: "TXT" | "CNAME"; dkimHost: string; dkimValore: string; notaDkim: string; doveDns: string | null;
} {
  const hosts = hostSmtp.map((h) => String(h ?? "").toLowerCase());
  const prov = providers.map((p) => String(p ?? "").toLowerCase());
  const ha = (...pezzi: string[]) => hosts.some((h) => pezzi.some((p) => h.includes(p)));
  if (ha("securemail.pro", "register.it")) {
    return {
      provider: "Register.it (SecureMail)", doveDns: "pannello Register → DNS",
      spf: "v=spf1 include:spf.webapps.net ~all",
      dkimTipo: "TXT", dkimHost: `<selettore>._domainkey.${dominio}`, dkimValore: "(solo se Register offre DKIM per la casella)",
      notaDkim: "Register firma la sua posta con d=register.it, NON con il tuo dominio: cerca «DKIM» nel pannello della casella SecureMail. Se non c'è, DKIM allineato non è possibile da qui — per il cold serve un provider che firmi il tuo dominio (Google Workspace, Microsoft 365) o un relay dedicato.",
    };
  }
  if (ha("aruba")) {
    return {
      provider: "Aruba", doveDns: "pannello Aruba → DNS",
      spf: "v=spf1 include:_spf.aruba.it ~all",
      dkimTipo: "TXT", dkimHost: `<selettore>._domainkey.${dominio}`, dkimValore: "(chiave dal pannello Aruba, se attivo)",
      notaDkim: "Aruba attiva DKIM su richiesta per le caselle a pagamento: chiedilo dal pannello, poi pubblica il selettore che ti dà.",
    };
  }
  if (ha("gmail", "google") || prov.includes("gmail") || prov.includes("google")) {
    return {
      provider: "Google Workspace", doveDns: null,
      spf: "v=spf1 include:_spf.google.com ~all",
      dkimTipo: "TXT", dkimHost: `google._domainkey.${dominio}`, dkimValore: "(chiave da Admin Console → App → Gmail → Autentica email)",
      notaDkim: "In Admin Console generi la chiave DKIM (2048 bit), la pubblichi come TXT e poi premi «Avvia autenticazione».",
    };
  }
  if (ha("outlook", "office365", "microsoft") || prov.includes("outlook")) {
    return {
      provider: "Microsoft 365", doveDns: null,
      spf: "v=spf1 include:spf.protection.outlook.com ~all",
      dkimTipo: "CNAME", dkimHost: `selector1._domainkey.${dominio}`, dkimValore: `selector1-<dominio-con-trattini>._domainkey.<tenant>.onmicrosoft.com`,
      notaDkim: "Due CNAME (selector1 e selector2) dal centro Microsoft Defender → Email authentication → DKIM, poi «Enable».",
    };
  }
  return {
    provider: "Elastic Email", doveDns: null,
    spf: "v=spf1 a mx include:_spf.elasticemail.com ~all",
    dkimTipo: "TXT", dkimHost: `api._domainkey.${dominio}`, dkimValore: "(valore DKIM dal pannello Elastic Email)",
    notaDkim: "Il valore DKIM lo genera Elastic Email quando aggiungi il dominio nel loro pannello.",
  };
}
