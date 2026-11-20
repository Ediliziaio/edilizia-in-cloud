import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { getCorsHeaders } from "../_shared/headers.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANTEPRIME: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif",
};

interface Documento {
  id: string;
  nome: string;
  tipo: string;
  mime: string;
  byte: number;
  percorso: string;
}

function haAnteprima(doc: Documento) {
  const formato = doc.nome.split(".").pop()?.toLowerCase();
  return Boolean(formato && ANTEPRIME[formato] === doc.mime);
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const headers = { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers, status });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ errore: "Metodo non consentito" }, 405);

  const body = await req.json().catch(() => null);
  const token = body?.token;
  const id = body?.id;
  const azione = body?.azione;
  if (typeof token !== "string" || !UUID.test(token) ||
      (id == null ? azione != null : typeof id !== "string" || !UUID.test(id) || !["apri", "scarica"].includes(azione))) {
    return json({ errore: "Codice non valido" }, 400);
  }

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.rpc("leggi_qr_cantiere", { p_token: token, p_documento: id ?? null });
    if (error) throw error;
    if (!data) return json({ errore: "Questo QR non è più attivo." }, 404);
    const documenti = data.documenti as Documento[];
    if (id == null) return json({ codice: data.codice, documenti: documenti.map(doc => ({
      id: doc.id, nome: doc.nome, tipo: doc.tipo, byte: doc.byte, anteprima: haAnteprima(doc),
    })) });

    const doc = documenti[0];
    if (!doc || (azione === "apri" && !haAnteprima(doc))) return json({ errore: "Documento non disponibile." }, 404);
    const bucket = sb.storage.from("order-attachments");
    if (azione === "apri") {
      const { data: info } = await bucket.info(doc.percorso);
      if (info?.contentType !== doc.mime) return json({ errore: "Anteprima non disponibile. Scarica il file." }, 409);
    }
    const { data: firmato, error: errFirma } = await bucket.createSignedUrl(
      doc.percorso, 60, { download: azione === "scarica" ? doc.nome : false },
    );
    if (errFirma || !firmato) return json({ errore: "Documento non disponibile." }, 404);
    return json({ url: firmato.signedUrl });
  } catch {
    return json({ errore: "Servizio temporaneamente non disponibile." }, 503);
  }
});
