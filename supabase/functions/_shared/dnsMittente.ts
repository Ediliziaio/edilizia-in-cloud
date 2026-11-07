// Il DNS dei domini da cui spediamo (07/11/2026).
//
// Qui solo le regole, senza rete: email-platform-setup (azione dns_mittente)
// legge i record da Cloudflare e chiede a questo modulo cosa manca.
//
// Perché esiste. Nella lista di blocco di Elastic sei destinatari buoni
// risultavano rifiutati con «Sender address rejected: Domain not found»:
// mkt.ediliziaincloud.com e mkt.marketingedile.com non hanno né MX né A, e i
// server che controllano il dominio del mittente (reject_unknown_sender_domain)
// lo trovano inesistente. SPF e DKIM erano a posto: non bastano.
//
// Regole, prudenti: si aggiunge solo ciò che manca, niente si sovrascrive.
//   · MX: se il sottodominio non ha né MX né A / AAAA / CNAME, gli si danno
//     gli MX del dominio principale. Così il dominio del mittente esiste per
//     chi lo controlla, e le risposte arrivano allo stesso server di posta.
//     Se il sottodominio ha già un indirizzo (A, CNAME) non serve: per quel
//     controllo basta. Un CNAME esclude comunque altri record sullo stesso nome.
//   · DMARC: se il dominio principale ne ha uno, il sottodominio lo eredita e
//     non si tocca. Se non c'è da nessuna parte, se ne aggiunge uno in sola
//     osservazione (p=none): non fa rifiutare nessuna email.

export interface RecordDns {
  type: string;
  name: string;
  content: string;
  priority?: number;
}

export interface StatoDns {
  sottodominio: RecordDns[];
  apice: RecordDns[];
  dmarcSottodominio: RecordDns[];
  dmarcApice: RecordDns[];
}

export const DMARC_OSSERVAZIONE = "v=DMARC1; p=none; adkim=r; aspf=r";

const di = (lista: RecordDns[], tipo: string) => lista.filter((r) => r.type.toUpperCase() === tipo);
const eDmarc = (r: RecordDns) => r.type.toUpperCase() === "TXT" && /^"?v=dmarc1/i.test(r.content.trim());

export function pianoDnsMittente(sottodominio: string, stato: StatoDns): { da_aggiungere: RecordDns[]; note: string[] } {
  const da_aggiungere: RecordDns[] = [];
  const note: string[] = [];

  const haMx = di(stato.sottodominio, "MX").length > 0;
  const haIndirizzo = ["A", "AAAA", "CNAME"].some((t) => di(stato.sottodominio, t).length > 0);
  if (haMx) {
    note.push("MX già presente: niente da fare");
  } else if (haIndirizzo) {
    note.push("nessun MX, ma il nome ha già un indirizzo (A/AAAA/CNAME): per il controllo del mittente basta");
  } else {
    const mxApice = di(stato.apice, "MX");
    if (mxApice.length === 0) {
      note.push("nessun MX sul dominio principale da copiare: va deciso a mano a quale server mandare le risposte");
    } else {
      for (const r of mxApice) {
        da_aggiungere.push({ type: "MX", name: sottodominio, content: r.content, priority: r.priority ?? 10 });
      }
      note.push(`MX copiati dal dominio principale (${mxApice.length})`);
    }
  }

  if (stato.dmarcSottodominio.some(eDmarc)) {
    note.push("DMARC del sottodominio già presente: niente da fare");
  } else if (stato.dmarcApice.some(eDmarc)) {
    note.push("DMARC ereditato dal dominio principale: niente da fare");
  } else {
    da_aggiungere.push({ type: "TXT", name: `_dmarc.${sottodominio}`, content: DMARC_OSSERVAZIONE });
    note.push("nessun DMARC: aggiunto in sola osservazione (p=none)");
  }

  return { da_aggiungere, note };
}
