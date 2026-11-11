import { useQuery } from "@tanstack/react-query";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import {
  numeroDocumento as numero,
  recordDocumento as rec,
  type RigaBollaConfronto,
  type RigaConfronto,
} from "@/lib/fatturazione/confrontoDocumenti";
import {
  originaleDaRiferimento,
  originaliBolla,
  type OriginaleConfronto,
} from "@/lib/fatturazione/originaliConfronto";

type RigaDb = Record<string, unknown>;
export interface DocumentoConfronto {
  id: string;
  tipo: "ddt" | "oda";
  numero: string;
  data: string | null;
  fornitore: string;
  collegato: boolean;
  righe: RigaConfronto[];
  bolle: RigaBollaConfronto[];
  dati: RigaDb;
  avviso: string | null;
}
// PostgREST limita ogni risposta: i DDT con più pagine non devono perdere le ultime righe.
async function tutte(
  query: () => {
    range: (
      a: number,
      b: number,
    ) => PromiseLike<{ data: RigaDb[] | null; error: unknown }>;
  },
): Promise<RigaDb[]> {
  const result: RigaDb[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await query().range(i, i + 999);
    if (error) throw error;
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return result;
  }
}
export function useConfrontoFattura(
  companyId: string,
  fatturaId: string,
  ordineIds: string[],
) {
  const ordini = [...new Set(ordineIds)].sort();
  return useQuery({
    queryKey: ["fattura-confronto", companyId, fatturaId, ordini.join(",")],
    staleTime: 20_000,
    queryFn: async () => {
      const legami = await tutte(() => db.from("fattura_ddt").select("id,numero_ddt,data_ddt,ddt_ricezione_id").eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).order("id"));
      const bolleCollegate = legami.map(l => l.ddt_ricezione_id).filter(Boolean);
      const daBolle = bolleCollegate.length ? await tutte(() => db.from("ddt_ordini_collegati").select("id,purchase_order_id").eq("company_id", companyId).in("ddt_id", bolleCollegate).order("id")) : [];
      const ordiniEffettivi = [...new Set([...ordini, ...daBolle.map(l => String(l.purchase_order_id))])].sort();
      const [ordiniDb, ddtDaOrdini] = await Promise.all([
        ordiniEffettivi.length ? tutte(() => db.from("purchase_orders").select("id,oda_number,created_at,attachment_url,supplier_id,status,suppliers(name)").eq("company_id", companyId).in("id", ordiniEffettivi).order("id")) : [],
        ordiniEffettivi.length ? tutte(() => db.from("ddt_ordini_collegati").select("id,ddt_id").eq("company_id", companyId).in("purchase_order_id", ordiniEffettivi).order("id")) : [],
      ]);
      const collegati = new Set(
        legami.map((l) => l.ddt_ricezione_id).filter(Boolean),
      );
      const ddtIds = [
        ...new Set([...collegati, ...ddtDaOrdini.map((d) => d.ddt_id)]),
      ];
      const [ddtDb, righeDdt, righeOda, valori, altre] = await Promise.all([
        ddtIds.length
          ? tutte(() =>
              db
                .from("ddt_ricezione")
                .select(
                  "id,numero_ddt,data_ricezione,supplier_id,purchase_order_id,destinazione,stato,ddt_file_url,ddt_file_name,ddt_file_mime,ddt_file_bucket,attachments,suppliers(name)",
                )
                .eq("company_id", companyId)
                .in("id", ddtIds)
                .order("id"),
            )
          : [],
        ddtIds.length
          ? tutte(() =>
              db
                .from("ddt_righe")
                .select(
                  "id,ddt_ricezione_id,codice_articolo,descrizione,unita_misura,quantita,prezzo_unitario,importo",
                )
                .eq("company_id", companyId)
                .in("ddt_ricezione_id", ddtIds)
                .order("posizione")
                .order("id"),
            )
          : [],
        ordiniEffettivi.length
          ? tutte(() =>
              db
                .from("purchase_order_items")
                .select(
                  "id,purchase_order_id,description,sku,unit_of_measure,quantity,unit_price,price_pending,discount_percent,line_total",
                )
                .eq("company_id", companyId)
                .in("purchase_order_id", ordiniEffettivi)
                .order("sort_order")
                .order("id"),
            )
          : [],
        ddtIds.length
          ? tutte(() =>
              db
                .from("ddt_valorizzazioni")
                .select("riga_id,fattura_id,quantita,ddt_id")
                .eq("company_id", companyId)
                .in("ddt_id", ddtIds)
                .order("id"),
            )
          : [],
        ddtIds.length
          ? tutte(() =>
              db
                .from("fattura_ddt")
                .select("id,ddt_ricezione_id,fattura_ricevuta_id")
                .eq("company_id", companyId)
                .in("ddt_ricezione_id", ddtIds)
                .neq("fattura_ricevuta_id", fatturaId)
                .order("id"),
            )
          : [],
      ]);
      const documenti: DocumentoConfronto[] = ddtDb.map((d) => {
        const id = String(d.id),
          precedenti = valori.filter(
            (v) => v.ddt_id === id && v.fattura_id !== fatturaId,
          );
        // Un'altra fattura solo referenziata non prova quanta merce sia già stata fatturata.
        const incerto = altre.some(
          (l) =>
            l.ddt_ricezione_id === id &&
            !precedenti.some((v) => v.fattura_id === l.fattura_ricevuta_id),
        );
        const bolle = righeDdt
          .filter((r) => r.ddt_ricezione_id === id)
          .map(
            (r): RigaBollaConfronto => ({
              id: String(r.id),
              documentoId: id,
              descrizione: String(r.descrizione ?? ""),
              codice: r.codice_articolo ? String(r.codice_articolo) : null,
              um: r.unita_misura ? String(r.unita_misura) : null,
              quantita: numero(r.quantita),
              prezzo: numero(r.prezzo_unitario),
              importo: numero(r.importo),
              giaFatturata: precedenti
                .filter((v) => v.riga_id === r.id)
                .reduce((s, v) => s + (numero(v.quantita) ?? 0), 0),
              residuoIncerto: incerto,
            }),
          );
        return {
          id,
          tipo: "ddt",
          numero: String(d.numero_ddt || "DDT senza numero"),
          data: d.data_ricezione ? String(d.data_ricezione) : null,
          fornitore: String(rec(d.suppliers).name ?? "Fornitore da associare"),
          collegato: collegati.has(d.id),
          righe: bolle,
          bolle,
          dati: d,
          avviso: incerto
            ? "Collegato anche ad altre fatture: quantità già fatturate da controllare."
            : d.stato !== "conforme" && d.stato !== "verificato"
              ? "La verifica fisica della consegna si gestisce nella scheda DDT."
              : null,
        };
      });
      for (const o of ordiniDb)
        documenti.push({
          id: String(o.id),
          tipo: "oda",
          numero: String(o.oda_number ?? "Ordine"),
          data: o.created_at ? String(o.created_at).slice(0, 10) : null,
          fornitore: String(rec(o.suppliers).name ?? "Fornitore"),
          collegato: true,
          dati: o,
          bolle: [],
          avviso: null,
          righe: righeOda
            .filter((r) => r.purchase_order_id === o.id)
            .map((r) => ({
              id: String(r.id),
              descrizione: String(r.description ?? ""),
              codice: r.sku ? String(r.sku) : null,
              um: r.unit_of_measure ? String(r.unit_of_measure) : null,
              quantita: numero(r.quantity),
              prezzo:
                r.price_pending || numero(r.unit_price) == null
                  ? null
                  : numero(r.unit_price)! *
                    (1 - (numero(r.discount_percent) ?? 0) / 100),
              importo: r.price_pending ? null : numero(r.line_total),
            })),
        });
      return {
        documenti,
        riferimenti: legami.filter((l) => !l.ddt_ricezione_id),
        nonDisponibili: [...collegati].filter(
          (id) => !ddtDb.some((d) => d.id === id),
        ).length,
      };
    },
  });
}
export function useOriginaliConfronto(
  companyId: string,
  documento: DocumentoConfronto | undefined,
) {
  return useQuery<OriginaleConfronto[]>({
    queryKey: [
      "fattura-confronto-originali",
      companyId,
      documento?.tipo,
      documento?.id,
    ],
    enabled: !!documento,
    staleTime: 30_000,
    queryFn: async () => {
      if (!documento) return [];
      if (documento.tipo === "ddt") {
        const jobs = await tutte(() =>
          db
            .from("ddt_document_jobs")
            .select("id,files")
            .eq("company_id", companyId)
            .eq("ddt_id", documento.id)
            .order("id"),
        );
        return originaliBolla(companyId, documento.dati, jobs);
      }
      const file = originaleDaRiferimento(
        documento.dati.attachment_url,
        "order-attachments",
      );
      const files: OriginaleConfronto[] = file ? [{...file,tipo:"fornitore",etichetta:"Allegato fornitore"}] : [];
      const conferme = await tutte(() => db.from("controlli_documento_fornitore")
        .select("id,file_path,file_nome,stato,accettato_il,created_at,impronta_ordine,originale_path,originale_mime")
        .eq("company_id",companyId).eq("purchase_order_id",documento.id).eq("tipo","conferma")
        .order("created_at",{ascending:false}).order("id"));
      const {data:baseAttuale}=conferme.some(c=>c.accettato_il)?await db.rpc("controllo_documento_base",{p_po:documento.id,p_rfq:null}):{data:null};
      for (const c of conferme) {
        const lettura = originaleDaRiferimento(c.file_path,"order-attachments",String(c.file_nome || "Conferma del fornitore"),String(c.file_path||'').endsWith('.pdf')?'application/pdf':String(c.file_path||'').endsWith('.png')?'image/png':'image/jpeg');
        const originale=c.originale_path?originaleDaRiferimento(c.originale_path,'order-attachments',String(c.file_nome),c.originale_mime):null;
        const f=originale&&lettura?{...originale,previewPath:lettura.path,previewMime:lettura.mime}:lettura;
        const etichetta=c.accettato_il?(c.impronta_ordine&&c.impronta_ordine===baseAttuale?.impronta?'Approvata':'Approvata su versione precedente'):c.stato==='errore'?'Lettura da riprovare':'Ricevuta';
        if (f) files.push({...f,tipo:"fornitore",controlloId:String(c.id),etichetta:`${etichetta} · ${String(c.created_at).slice(0,10).split("-").reverse().join("/")}`});
      }
      const eventi = await tutte(() =>
        db
          .from("procurement_document_events")
          .select("id,payload,created_at")
          .eq("company_id", companyId)
          .eq("purchase_order_id", documento.id)
          .eq("kind", "email")
          .eq("operation", "sent")
          .order("created_at", { ascending: false })
          .order("id"),
      );
      for (const e of eventi) {
        const p = rec(e.payload);
        for (const a of Array.isArray(p.attachments) ? p.attachments : []) {
          const f = rec(a);
          const originale = originaleDaRiferimento(
            f.storage_path,
            String(f.bucket || "email-attachments"),
            String(f.filename || "PDF ordine inviato"),
            f.mime,
          );
          if (originale) files.push({...originale,id:`${originale.id}:${e.id}`,tipo:"inviato",eventoId:String(e.id),etichetta:`Inviato · ${String(e.created_at).slice(0,10).split("-").reverse().join("/")}`});
        }
      }
      return [...new Map(files.map((f) => [f.id, f])).values()];
    },
  });
}
