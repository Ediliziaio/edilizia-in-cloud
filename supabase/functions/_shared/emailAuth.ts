/**
 * Analisi SPF / DKIM / DMARC — logica PURA (niente rete): riceve i record TXT
 * già risolti e dice non solo se ci sono, ma se sono GIUSTI. "Presente" non
 * basta: due SPF sul dominio = permerror, `+all` = chiunque può spedire a
 * nome tuo, casella Gmail senza include Google = firma inutile.
 * Condivisa dalla edge (Deno) e dai test (vitest): zero import di runtime.
 */

export type StatoRecord = "ok" | "assente" | "errato" | "debole";

export interface EsitoRecord {
  stato: StatoRecord;
  record: string | null;
  problemi: string[];
}

/** Provider di posta dedotto dagli MX: decide quale include SPF ci aspettiamo. */
export type ProviderPosta = "google" | "microsoft" | "aruba" | "register" | "ovh" | "zoho" | "proton" | "altro";

export const INCLUDE_ATTESO: Record<Exclude<ProviderPosta, "altro">, { include: string; selettori: string[] }> = {
  google:    { include: "_spf.google.com",             selettori: ["google"] },
  microsoft: { include: "spf.protection.outlook.com",  selettori: ["selector1", "selector2"] },
  aruba:     { include: "_spf.aruba.it",               selettori: ["aruba", "default", "dkim"] },
  register:  { include: "spf.register.it",             selettori: ["default", "dkim"] },
  ovh:       { include: "mx.ovh.com",                  selettori: ["ovhmo", "default"] },
  zoho:      { include: "zoho.eu",                     selettori: ["zoho", "zmail"] },
  proton:    { include: "_spf.protonmail.ch",          selettori: ["protonmail", "protonmail2", "protonmail3"] },
};

export function providerDaMx(mxHosts: string[]): ProviderPosta {
  const h = mxHosts.map((x) => x.toLowerCase()).join(" ");
  if (/google\.com|googlemail\.com/.test(h)) return "google";
  if (/outlook\.com|protection\.outlook|office365/.test(h)) return "microsoft";
  if (/aruba/.test(h)) return "aruba";
  if (/register\.it|registerit/.test(h)) return "register";
  if (/ovh\.net|ovh\.com/.test(h)) return "ovh";
  if (/zoho/.test(h)) return "zoho";
  if (/protonmail|proton\.me/.test(h)) return "proton";
  return "altro";
}

/** Provider dalla connessione configurata (vince sugli MX quando è esplicito). */
export function providerDaConnessione(provider: string | null | undefined, host: string | null | undefined): ProviderPosta | null {
  const p = (provider ?? "").toLowerCase();
  const h = (host ?? "").toLowerCase();
  if (/gmail|google/.test(p) || /gmail\.com|googlemail/.test(h)) return "google";
  if (/microsoft|outlook|office/.test(p) || /outlook\.|office365/.test(h)) return "microsoft";
  if (/aruba/.test(h)) return "aruba";
  if (/register\.it/.test(h)) return "register";
  if (/ovh/.test(h)) return "ovh";
  if (/zoho/.test(h)) return "zoho";
  if (/proton/.test(h)) return "proton";
  return null;
}

export function analizzaSpf(txt: string[], providerAtteso: ProviderPosta | null): EsitoRecord {
  const spf = txt.filter((t) => /^v=spf1\b/i.test(t.trim()));
  if (spf.length === 0) return { stato: "assente", record: null, problemi: ["Nessun record SPF: chiunque può spedire a nome del tuo dominio e le tue email finiscono in spam."] };
  const problemi: string[] = [];
  if (spf.length > 1) problemi.push(`Ci sono ${spf.length} record SPF: lo standard ne ammette UNO solo, così com'è il controllo fallisce (permerror). Uniscili in un unico record.`);
  const rec = spf[0];
  const termini = rec.trim().split(/\s+/).slice(1);
  const all = termini.find((t) => /^[+\-~?]?all$/i.test(t));
  if (!all) problemi.push("Manca il meccanismo finale `all` (di solito `~all` o `-all`): il record non dice cosa fare con i server non elencati.");
  else if (/^\+?all$/i.test(all)) problemi.push("`+all` autorizza QUALSIASI server a spedire come te: è come non avere SPF. Usa `~all` o `-all`.");
  // Limite RFC 7208: massimo 10 lookup DNS (include, a, mx, ptr, exists, redirect).
  const lookup = termini.filter((t) => /^[+\-~?]?(include:|a\b|a:|mx\b|mx:|ptr|exists:|redirect=)/i.test(t)).length;
  if (lookup > 10) problemi.push(`${lookup} meccanismi con lookup DNS: oltre 10 il controllo fallisce (permerror). Riduci gli include.`);
  if (providerAtteso && providerAtteso !== "altro") {
    const inc = INCLUDE_ATTESO[providerAtteso].include;
    if (!rec.toLowerCase().includes(inc.toLowerCase())) {
      problemi.push(`La casella è su ${etichettaProvider(providerAtteso)} ma l'SPF non contiene \`include:${inc}\`: le email spedite da quella casella NON sono autorizzate.`);
    }
  }
  return { stato: problemi.length > 0 ? "errato" : "ok", record: rec, problemi };
}

export function analizzaDkim(risultati: Array<{ selettore: string; txt: string[] }>): EsitoRecord & { selettore: string | null } {
  // Il primo selettore con un record è quello "vivo"; poi lo si controlla.
  for (const r of risultati) {
    const rec = r.txt.find((t) => /v=DKIM1|k=rsa|k=ed25519|p=/i.test(t));
    if (!rec) continue;
    const p = rec.match(/\bp=([^;\s]*)/i);
    if (!p || p[1].trim() === "") {
      return { stato: "errato", record: rec, selettore: r.selettore, problemi: [`Il record DKIM (selettore ${r.selettore}) ha la chiave pubblica vuota: la firma è stata revocata o il record è incompleto.`] };
    }
    return { stato: "ok", record: rec, selettore: r.selettore, problemi: [] };
  }
  return { stato: "assente", record: null, selettore: null, problemi: ["Nessuna firma DKIM trovata con i selettori noti: attivala nel pannello del provider di posta e pubblica il record che ti dà."] };
}

export function analizzaDmarc(txt: string[]): EsitoRecord & { policy: string | null } {
  const dm = txt.filter((t) => /^v=DMARC1\b/i.test(t.trim()));
  if (dm.length === 0) return { stato: "assente", record: null, policy: null, problemi: ["Nessun record DMARC: i destinatari non sanno cosa fare con le email che falliscono SPF/DKIM, e tu non ricevi i report."] };
  const problemi: string[] = [];
  if (dm.length > 1) problemi.push("Più record DMARC sul dominio: ne è ammesso uno solo, il controllo viene ignorato.");
  const rec = dm[0];
  const policy = rec.match(/\bp=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;
  if (!policy) {
    problemi.push("Il record DMARC non ha una policy valida (`p=none|quarantine|reject`): è come non averlo.");
    return { stato: "errato", record: rec, policy: null, problemi };
  }
  if (problemi.length > 0) return { stato: "errato", record: rec, policy, problemi };
  if (policy === "none") return { stato: "debole", record: rec, policy, problemi: ["Policy `p=none`: va bene per iniziare (solo monitoraggio), ma non protegge da chi si spaccia per te. Quando i report sono puliti passa a `quarantine`, poi `reject`."] };
  return { stato: "ok", record: rec, policy, problemi: [] };
}

export function etichettaProvider(p: ProviderPosta): string {
  return ({ google: "Google Workspace / Gmail", microsoft: "Microsoft 365 / Outlook", aruba: "Aruba", register: "Register.it", ovh: "OVH", zoho: "Zoho", proton: "Proton", altro: "il tuo provider" } as Record<ProviderPosta, string>)[p];
}
