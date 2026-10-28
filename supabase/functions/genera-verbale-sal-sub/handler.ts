import { Buffer } from "node:buffer";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import {
  type RigaSalSub,
  type VerbaleSalSub,
  verificaVerbaleSalSub,
} from "../_shared/verbaleSalSub.ts";
import { pdfVerbaleSalSub } from "../_shared/verbaleSalSubPdf.ts";
import { PDFDocument } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
const BUCKET = "verbali-sal-sub";
const hash = async (b: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(b).buffer),
    ),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
class Errore extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
const singolo = async (q: any, label: string) => {
  const r = await q.maybeSingle();
  if (r.error) throw new Errore(`Lettura ${label} non riuscita`, 503);
  if (!r.data) throw new Errore(`${label} non disponibile`, 404);
  return r.data;
};
async function elenco(q: any, label: string) {
  const r = await q.limit(1001);
  if (r.error || !r.data || r.data.length > 1000) {
    throw new Errore(`${label} non verificabile`, 503);
  }
  return r.data;
}
export function creaGestore(
  deps: {
    client: typeof createClient;
    accesso: typeof verifyCompanyAccess;
    pdf: typeof pdfVerbaleSalSub;
  } = {
    client: createClient,
    accesso: verifyCompanyAccess,
    pdf: pdfVerbaleSalSub,
  },
) {
  return async (req: Request) => {
    const headers = {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers });
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), { status, headers });
    if (req.method !== "POST") {
      return json({ error: "Metodo non consentito" }, 405);
    }
    let caricati: string[] = [];
    const db = deps.client(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    try {
      const bearer = req.headers.get("Authorization");
      if (!bearer?.startsWith("Bearer ")) {
        throw new Errore("Accesso richiesto", 401);
      }
      const auth = await db.auth.getUser(bearer.slice(7));
      if (auth.error || !auth.data.user) {
        throw new Errore("Sessione non valida", 401);
      }
      const u = auth.data.user.id;
      const input = await req.json();
      const mode = input.mode ?? "anteprima";
      if (
        !["anteprima", "archivia", "apri"].includes(mode) ||
        !uuid(input.company_id)
      ) throw new Errore("Richiesta non valida");
      try {
        await deps.accesso(db, u, input.company_id);
      } catch {
        throw new Errore("Azienda non accessibile", 403);
      }
      for (
        const permission of [
          "can_view_subappaltatori_amministrazione",
          "can_view_costs",
        ]
      ) {
        const p = await db.rpc("has_permission_for_company", {
          _user_id: u,
          _permission: permission,
          _company_id: input.company_id,
        });
        if (p.error || p.data !== true) {
          throw new Errore(
            "Non hai il permesso di consultare i verbali economici del subappalto",
            403,
          );
        }
      }
      if (mode === "archivia") {
        const w = await db.rpc("has_permission_for_company", {
          _user_id: u,
          _permission: "can_edit_orders",
          _company_id: input.company_id,
        });
        if (w.error || w.data !== true) {
          throw new Errore(
            "Non hai il permesso di archiviare documenti della commessa",
            403,
          );
        }
      }
      const link = async (r: any) => {
        const obj = await db.storage.from(BUCKET).download(r.pdf_path);
        if (
          obj.error || !obj.data ||
          await hash(new Uint8Array(await obj.data.arrayBuffer())) !==
            r.pdf_sha256
        ) {
          throw new Errore(
            "Originale PDF non disponibile o impronta non coerente",
            409,
          );
        }
        const signed = await db.storage.from(BUCKET).createSignedUrl(
          r.pdf_path,
          300,
        );
        if (signed.error || !signed.data?.signedUrl) {
          throw new Errore("Apertura originale non riuscita", 503);
        }
        let zip_url = null;
        if (r.pacchetto_path) {
          const originalZip = await db.storage.from(BUCKET).download(
            r.pacchetto_path,
          );
          if (
            originalZip.error || !originalZip.data ||
            await hash(new Uint8Array(await originalZip.data.arrayBuffer())) !==
              r.pacchetto_sha256
          ) {
            throw new Errore(
              "Pacchetto originale non disponibile o impronta non coerente",
              409,
            );
          }
          const z = await db.storage.from(BUCKET).createSignedUrl(
            r.pacchetto_path,
            300,
          );
          if (z.error) throw new Errore("Pacchetto non disponibile", 503);
          zip_url = z.data?.signedUrl;
        }
        return {
          id: r.id,
          pdf_url: signed.data.signedUrl,
          zip_url,
          sha256: r.pdf_sha256,
          created_at: r.created_at,
        };
      };
      if (mode === "apri") {
        if (!uuid(input.verbale_id)) throw new Errore("Verbale non valido");
        return json(
          await link(
            await singolo(
              db.from("sal_sub_verbali").select("*").eq("id", input.verbale_id)
                .eq("company_id", input.company_id),
              "Verbale",
            ),
          ),
        );
      }
      if (
        !uuid(input.sal_id) || !uuid(input.richiesta_id) ||
        typeof input.periodo_dal !== "string" ||
        typeof input.periodo_al !== "string" ||
        !Array.isArray(input.allegati) || input.allegati.length > 10 ||
        input.allegati.some((x: unknown) => !uuid(x)) ||
        new Set(input.allegati).size !== input.allegati.length ||
        typeof input.nota_verbale !== "string" ||
        input.nota_verbale.length > 6000
      ) throw new Errore("Completa periodo e dati del verbale");
      const chiave = await hash(
        strToU8(
          JSON.stringify({
            sal_id: input.sal_id,
            periodo_dal: input.periodo_dal,
            periodo_al: input.periodo_al,
            nota_verbale: input.nota_verbale,
            allegati: [...input.allegati].sort(),
          }),
        ),
      );
      if (mode === "archivia") {
        const old = await db.from("sal_sub_verbali").select("*").eq(
          "company_id",
          input.company_id,
        ).eq("richiesta_id", input.richiesta_id).maybeSingle();
        if (old.error) throw new Errore("Archivio non disponibile", 503);
        if (old.data) {
          if (old.data.richiesta_sha256 !== chiave) {
            throw new Errore(
              "La richiesta è già usata per un altro contenuto",
              409,
            );
          }
          return json(await link(old.data));
        }
      }
      const sal = await singolo(
        db.from("sal_subappaltatori").select(
          "id,company_id,contratto_id,order_id,subappaltatore_id,numero_sal,data_emissione,stato,importo_lordo,ritenuta_pct,ritenuta_importo,importo_netto,note,note_contestazione,data_pagamento,payment_reference,payment_method",
        ).eq("id", input.sal_id).eq("company_id", input.company_id),
        "SAL",
      );
      const contratto = await singolo(
        db.from("contratti_subappalto").select(
          "id,company_id,order_id,subappaltatore_id,numero_contratto,descrizione_lavori,importo_contrattuale,oneri_sicurezza,modalita_pagamento,responsabile_impresa,referente_subappaltatore,ritenuta_garanzia_pct,durata_garanzia_mesi,garanzie,data_fine_effettiva,data_fine_prevista",
        ).eq("id", sal.contratto_id).eq("company_id", input.company_id).eq(
          "order_id",
          sal.order_id,
        ).eq("subappaltatore_id", sal.subappaltatore_id),
        "Contratto",
      );
      const [sub, commessa, azienda, precedenti, registroGaranzie] =
        await Promise.all([
          singolo(
            db.from("subappaltatori_sicurezza").select(
              "ragione_sociale,piva,indirizzo,responsabile",
            ).eq("id", sal.subappaltatore_id).eq(
              "company_id",
              input.company_id,
            ),
            "Impresa subappaltatrice",
          ),
          singolo(
            db.from("orders").select(
              "id,company_id,order_code,description,work_address",
            ).eq("id", sal.order_id).eq("company_id", input.company_id).is(
              "deleted_at",
              null,
            ),
            "Commessa",
          ),
          singolo(
            db.from("anagrafica_azienda").select(
              "ragione_sociale,partita_iva,indirizzo_via,indirizzo_numero_civico,indirizzo_cap,indirizzo_comune,indirizzo_provincia",
            ).eq("company_id", input.company_id),
            "Anagrafica azienda",
          ),
          elenco(
            db.from("sal_subappaltatori").select(
              "id,numero_sal,stato,importo_lordo,importo_netto,ritenuta_importo",
            ).eq("company_id", input.company_id).eq(
              "contratto_id",
              sal.contratto_id,
            ).lte("numero_sal", sal.numero_sal).order("numero_sal"),
            "Storico SAL",
          ),
          elenco(
            db.from("ritenute_garanzia").select(
              "id,company_id,contratto_id,order_id,sal_id,importo,stato,data_svincolo_prevista,data_svincolo_effettiva,fideiussione,note",
            ).eq("company_id", input.company_id).eq(
              "contratto_id",
              sal.contratto_id,
            ).eq("direzione", "passiva").order("id"),
            "Registro garanzie",
          ),
        ]);
      if (
        precedenti.some((s: RigaSalSub) =>
          s.numero_sal === sal.numero_sal && s.id !== sal.id
        )
      ) {
        throw new Errore(
          "Numerazione SAL duplicata: riconcilia lo storico",
          409,
        );
      }
      const d: VerbaleSalSub = {
        versione: "sal-sub-verbale-3",
        generato_il: new Date().toISOString(),
        periodo_dal: input.periodo_dal,
        periodo_al: input.periodo_al,
        nota_verbale: input.nota_verbale,
        sal,
        contratto,
        sub,
        commessa,
        impresa: {
          ragione_sociale: azienda.ragione_sociale,
          partita_iva: azienda.partita_iva,
          indirizzo: [
            azienda.indirizzo_via,
            azienda.indirizzo_numero_civico,
            azienda.indirizzo_cap,
            azienda.indirizzo_comune,
            azienda.indirizzo_provincia,
          ].filter(Boolean).join(" "),
        },
        precedenti: precedenti.filter((s: RigaSalSub) => s.id !== sal.id),
        allegati: [],
        garanzie: registroGaranzie.filter((g: any) =>
          g.sal_id && precedenti.some((s: RigaSalSub) => s.id === g.sal_id)
        ),
        garanzie_non_attribuite: registroGaranzie.filter((g: any) =>
          !g.sal_id
        ).length,
      };
      const misure = await elenco(
        db.from("subappalto_misure").select(
          "id,company_id,contratto_id,quadro_id,voce_id,data_rilievo,quantita_dichiarata,quantita_riconosciuta,prezzo_unitario,importo_riconosciuto,stato,riferimento,nota_verifica,verificato_da,verificato_il",
        ).eq("sal_id", sal.id).order("data_rilievo").order("id"),
        "Misure SAL",
      );
      d.lavori = [];
      if (misure.length) {
        const ids = [...new Set(misure.map((m: any) => m.quadro_id))];
        const quadri = await elenco(
          db.from("subappalto_quadri_lavori").select("id,revisione,voci").eq(
            "company_id",
            input.company_id,
          ).eq("contratto_id", contratto.id).in("id", ids),
          "Base lavori SAL",
        );
        for (const m of misure) {
          const q = quadri.find((q: any) => q.id === m.quadro_id);
          const v = q?.voci?.find((v: any) => v.id === m.voce_id);
          if (
            !v || m.company_id !== input.company_id ||
            m.contratto_id !== contratto.id || m.stato !== "riconosciuta"
          ) {
            throw new Errore(
              "Fonte misurata non disponibile o non riconosciuta",
              409,
            );
          }
          d.lavori.push({
            misura_id: m.id,
            quadro_id: q.id,
            revisione_quadro: q.revisione,
            voce_id: m.voce_id,
            descrizione: v.descrizione,
            base: v.base,
            unita: v.unita,
            data_rilievo: m.data_rilievo,
            quantita_dichiarata: Number(m.quantita_dichiarata),
            quantita_riconosciuta: Number(m.quantita_riconosciuta),
            prezzo_unitario: Number(m.prezzo_unitario),
            importo: Number(m.importo_riconosciuto),
            riferimento: m.riferimento,
            nota_verifica: m.nota_verifica,
            verificato_da: m.verificato_da,
            verificato_il: m.verificato_il,
          });
        }
      }
      verificaVerbaleSalSub(d);
      const files: Record<string, Uint8Array> = {};
      const daAccodare: PDFDocument[] = [];
      let dimensione = 0;
      if (input.allegati.length) {
        const p = await db.rpc("has_permission_for_company", {
          _user_id: u,
          _permission: "can_view_sicurezza_cantiere",
          _company_id: input.company_id,
        });
        if (p.error || p.data !== true) {
          throw new Errore(
            "Non hai il permesso di allegare documenti dal fascicolo",
            403,
          );
        }
        const docs = await elenco(
          db.from("sicurezza_fascicolo").select(
            "id,titolo,file_name,file_path,stato,revisione",
          ).eq("company_id", input.company_id).eq("order_id", sal.order_id).eq(
            "subappaltatore_id",
            sal.subappaltatore_id,
          ).is("operaio_id", null).is("incarico_id", null).in("tipo", [
            "contratto",
            "sal",
            "verbale",
            "altro",
          ]).in("id", input.allegati).order("id"),
          "Allegati",
        );
        if (docs.length !== input.allegati.length) {
          throw new Errore(
            "Uno degli allegati non è pertinente o non è disponibile",
            403,
          );
        }
        for (const a of docs) {
          if (!a.file_path?.startsWith(`${input.company_id}/`)) {
            throw new Errore("Percorso allegato non valido");
          }
          const f = await db.storage.from("fascicoli-cantiere").download(
            a.file_path,
          );
          if (f.error || !f.data) {
            throw new Errore(`Originale non disponibile: ${a.titolo}`, 409);
          }
          dimensione += f.data.size;
          if (dimensione > 20 * 1024 * 1024) {
            throw new Errore("Gli allegati superano 20 MB");
          }
          const bytes = new Uint8Array(await f.data.arrayBuffer());
          const sig = new TextDecoder().decode(bytes.subarray(0, 5));
          let doc: PDFDocument;
          let formato: string;
          if (sig === "%PDF-") {
            doc = await PDFDocument.load(bytes);
            formato = "pdf";
          } else if (
            (bytes[0] === 0xff && bytes[1] === 0xd8) ||
            (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
              bytes[3] === 0x47)
          ) {
            doc = await PDFDocument.create();
            const img = bytes[0] === 0xff
              ? await doc.embedJpg(bytes)
              : await doc.embedPng(bytes);
            if (img.width * img.height > 40000000) {
              throw new Errore("Immagine troppo grande");
            }
            const page = doc.addPage([595.28, 841.89]);
            const scale = Math.min(515 / img.width, 760 / img.height);
            page.drawImage(img, {
              x: (595.28 - img.width * scale) / 2,
              y: (841.89 - img.height * scale) / 2,
              width: img.width * scale,
              height: img.height * scale,
            });
            formato = bytes[0] === 0xff ? "jpg" : "png";
          } else {throw new Errore(
              `Formato non supportato per ${a.titolo}: usa PDF, JPG o PNG`,
            );}
          if (
            doc.getPageCount() > 100 ||
            daAccodare.reduce((n, p) => n + p.getPageCount(), 0) +
                  doc.getPageCount() > 150
          ) throw new Errore("Troppi fogli negli allegati");
          const nome = `allegati/${d.allegati.length + 1}-${a.id}.${formato}`;
          files[nome] = bytes;
          daAccodare.push(doc);
          d.allegati.push({
            ...a,
            sha256: await hash(bytes),
            pagine: doc.getPageCount(),
            formato,
          });
        }
      }
      const { generato_il: _, ...contenutoSenzaData } = d;
      const fonteHash = await hash(strToU8(JSON.stringify(contenutoSenzaData)));
      if (mode === "archivia" && input.anteprima_sha256 !== fonteHash) {
        throw new Errore(
          "I dati sono cambiati o l'anteprima manca: aggiorna l'anteprima prima di archiviare",
          409,
        );
      }
      const cover = await deps.pdf(d);
      const composto = await PDFDocument.load(cover);
      for (const a of daAccodare) {
        const pagine = await composto.copyPages(a, a.getPageIndices());
        pagine.forEach((p) => composto.addPage(p));
      }
      const bytes = await composto.save();
      if (bytes.length > 28 * 1024 * 1024) {
        throw new Errore("Il PDF composto supera 28 MB");
      }
      const digest = await hash(bytes);
      if (mode === "anteprima") {
        return json({
          pdf_base64: Buffer.from(bytes).toString("base64"),
          sha256: digest,
          anteprima_sha256: fonteHash,
          bozza: !["verificato", "pagato"].includes(sal.stato),
          avvisi: verificaVerbaleSalSub(d).garanzie.avvisi,
        });
      }
      // No approvazioni o pagamenti: si conserva un originale del riepilogo letto.
      const recordId = crypto.randomUUID(),
        base = `${input.company_id}/${sal.id}/${recordId}`;
      files["verbale-con-allegati.pdf"] = bytes;
      files["manifest.json"] = strToU8(
        JSON.stringify(
          {
            versione: d.versione,
            sal_id: sal.id,
            sha256_pdf: digest,
            generato_il: d.generato_il,
            allegati: d.allegati.map(({ file_path, ...a }) => a),
          },
          null,
          2,
        ),
      );
      const zip = zipSync(files, { level: 1 });
      if (zip.length > 30 * 1024 * 1024) {
        throw new Errore("Il pacchetto supera 30 MB");
      }
      for (
        const [path, file, mime] of [
          [`${base}.pdf`, bytes, "application/pdf"],
          [`${base}.zip`, zip, "application/zip"],
        ] as const
      ) {
        const up = await db.storage.from(BUCKET).upload(path, file, {
          contentType: mime,
          upsert: false,
        });
        if (up.error) throw new Errore("Archiviazione file non riuscita", 503);
        caricati.push(path);
      }
      const r = await db.from("sal_sub_verbali").insert({
        id: recordId,
        company_id: input.company_id,
        sal_id: sal.id,
        contratto_id: sal.contratto_id,
        order_id: sal.order_id,
        subappaltatore_id: sal.subappaltatore_id,
        richiesta_id: input.richiesta_id,
        richiesta_sha256: chiave,
        snapshot: d,
        pdf_path: `${base}.pdf`,
        pdf_sha256: digest,
        pacchetto_path: `${base}.zip`,
        pacchetto_sha256: await hash(zip),
        created_by: u,
      }).select("*").single();
      if (r.error) {
        await db.storage.from(BUCKET).remove(caricati);
        caricati = [];
        if (r.error.code === "23505") {
          const old = await singolo(
            db.from("sal_sub_verbali").select("*").eq(
              "company_id",
              input.company_id,
            ).eq("richiesta_id", input.richiesta_id),
            "Verbale già generato",
          );
          if (old.richiesta_sha256 !== chiave) {
            throw new Errore("Richiesta già usata", 409);
          }
          return json(await link(old));
        }
        throw new Errore("Registrazione verbale non riuscita", 503);
      }
      caricati = [];
      return json(await link(r.data));
    } catch (e) {
      if (caricati.length) await db.storage.from(BUCKET).remove(caricati);
      return json({
        error: e instanceof Errore
          ? e.message
          : "Generazione verbale non riuscita: verifica dati e allegati",
      }, e instanceof Errore ? e.status : 400);
    }
  };
}
