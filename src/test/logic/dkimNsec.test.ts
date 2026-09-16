import { describe, it, expect } from "vitest";
import { selettoriDaNsec } from "../../../supabase/functions/_shared/dkimNsec";

// Risposta vera di dns.google del 16/09/2026 a
// «zzzzzz._domainkey.thermodmr.eu TXT» con do=1 (firme accorciate).
const AUTHORITY_THERMODMR = [
  { name: "thermodmr.eu.", type: 6, data: "ns1.register.it. hostmaster.register.it. 2026091003 10800 3600 604800 86400" },
  { name: "thermodmr.eu.", type: 46, data: "soa 13 2 900 1790208000 1788393600 25327 thermodmr.eu. duwJz2fCONE62v9S==" },
  { name: "key-la4nd14ln9._domainkey.thermodmr.eu.", type: 47, data: "_autodiscover._tcp.thermodmr.eu. TXT RRSIG NSEC" },
  { name: "key-la4nd14ln9._domainkey.thermodmr.eu.", type: 46, data: "nsec 13 4 86400 1790208000 1788393600 25327 thermodmr.eu. OPAGwKlY==" },
  { name: "_dmarc.thermodmr.eu.", type: 47, data: "key-la4nd14ln9._domainkey.thermodmr.eu. TXT RRSIG NSEC" },
];

describe("selettoriDaNsec — il selettore DKIM di Register senza copiarlo a mano", () => {
  it("legge il selettore dal record NSEC, una volta sola", () => {
    expect(selettoriDaNsec(AUTHORITY_THERMODMR, "thermodmr.eu")).toEqual(["key-la4nd14ln9"]);
  });

  it("ignora i record di altri domini e i nomi a più livelli", () => {
    const authority = [
      { name: "key-abc._domainkey.altro.it.", type: 47, data: "_dmarc.altro.it. TXT" },
      { name: "a.b._domainkey.thermodmr.eu.", type: 47, data: "_dmarc.thermodmr.eu. TXT" },
    ];
    expect(selettoriDaNsec(authority, "thermodmr.eu")).toEqual([]);
  });

  it("zona senza DNSSEC: nessun NSEC, nessun selettore", () => {
    expect(selettoriDaNsec([{ name: "mktedile.me.", type: 6, data: "ns1.register.it." }], "mktedile.me")).toEqual([]);
    expect(selettoriDaNsec(undefined, "mktedile.me")).toEqual([]);
  });
});
