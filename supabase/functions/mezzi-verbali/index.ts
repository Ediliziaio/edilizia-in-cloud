import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import {
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";
import {
  registraVerbaleTecnico,
  normalizzaParametriVerbale,
  uuidVerbale,
  validaPathVerbale,
  ErroreVerbaleTecnico,
} from "../_shared/mezziVerbaliTecnici.ts";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST")
      return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin: db } = await requireAuth(req, cors);
    const parsed = await req.json().catch(() => ({}));
    const body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    const company = body.company_id,
      mezzo = body.mezzo_id,
      manutenzione = body.manutenzione_id;
    if (![company, mezzo, manutenzione].every(uuidVerbale))
      return errorResponse("Scegli azienda, macchina e intervento", 400, cors);
    await requireCompanyAccess(db, userId, company, cors);
    if (body.azione === "prepara") {
      const { data: fonte, error } = await db.rpc("mezzi_verbale_fonte", {
        _company: company,
        _mezzo: mezzo,
        _manutenzione: manutenzione,
        _autore: userId,
      });
      if (error) throw error;
      if (!fonte?.foto)
        throw new ErroreVerbaleTecnico("Fonte non disponibile", 404);
      validaPathVerbale(fonte.path, company, mezzo);
      const { data: link, error: err } = await db.storage
        .from("mezzi-documenti")
        .createSignedUrl(fonte.path, 300);
      if (err || !link?.signedUrl)
        throw new ErroreVerbaleTecnico("Originale non disponibile", 503);
      return jsonResponse(
        { ok: true, fonte: fonte.foto, url: link.signedUrl },
        200,
        cors,
      );
    }
    if (body.azione !== "registra")
      return errorResponse("Azione non riconosciuta", 400, cors);
    const ricevuta = await registraVerbaleTecnico(db, userId, {
      companyId: company,
      mezzoId: mezzo,
      manutenzioneId: manutenzione,
      richiestaId: body.richiesta_id,
      impronta: body.impronta,
      parametri: normalizzaParametriVerbale(body.parametri),
    });
    return jsonResponse({ ok: true, ricevuta }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const errore = e as { code?: string; message?: string };
    const stato =
      e instanceof ErroreVerbaleTecnico
        ? e.status
        : errore?.code === "42501"
          ? 403
          : errore?.code === "40001" || errore?.code === "55P03"
            ? 409
            : 400;
    return errorResponse(
      typeof errore?.message === "string"
        ? errore.message
        : "Registrazione non completata: riprova con la stessa richiesta",
      stato,
      cors,
    );
  }
});
