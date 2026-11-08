/**
 * Le foto del giornale per il cliente del portale. Il bucket foto-cantiere resta chiuso
 * al cliente: qui si firmano lato server le foto delle sole pagine firmate e visibili,
 * dopo aver controllato che la commessa sia proprio sua.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { BUCKET_FOTO_GIORNALE, comeLeggereFotoGiornale, indirizziFotoGiornale } from "../_shared/fotoGiornale.ts";

const SCADENZA_SECONDI = 60 * 60;
const MAX_GIORNATE = 60;

interface RigaFoto {
  id: string;
  url: string | null;
  storage_path: string | null;
  giornale_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ error: "Metodo non permesso" }, 405);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autorizzato" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Non autorizzato" }, 401);

    const body = await req.json().catch(() => ({}));
    if (!body?.order_id || typeof body.order_id !== "string") return json({ error: "order_id obbligatorio" }, 400);

    // Commessa inesistente o di un altro: stessa risposta, non si dice quale delle due.
    const { data: commessa } = await supabase.from("orders").select("id, company_id, customer_id").eq("id", body.order_id).maybeSingle();
    if (!commessa || commessa.customer_id !== user.id) return json({ error: "Non autorizzato: accesso negato" }, 403);

    const comeUtente = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: bloccato } = await comeUtente.rpc("utente_bloccato");
    if (bloccato === true) return json({ error: "Non autorizzato: accesso negato" }, 403);

    const { data: pagine, error: errPagine } = await supabase.from("giornale_lavori").select("id")
      .eq("order_id", commessa.id).eq("company_id", commessa.company_id)
      .eq("visibile_cliente", true).eq("stato", "firmata")
      .order("data_lavori", { ascending: false }).limit(MAX_GIORNATE);
    if (errPagine) return json({ error: "Errore nel caricamento" }, 500);
    const ids = ((pagine ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (!ids.length) return json({ link: {} });

    const { data: foto, error: errFoto } = await supabase.from("giornale_foto").select("id, url, storage_path, giornale_id").in("giornale_id", ids);
    if (errFoto) return json({ error: "Errore nel caricamento" }, 500);

    // Si firma solo dentro la cartella di questa commessa, qualunque cosa ci sia scritto nella riga.
    const cartella = `${commessa.company_id}/${commessa.id}/`;
    const leggibili = ((foto ?? []) as RigaFoto[]).filter((f) => {
      const modo = comeLeggereFotoGiornale(f);
      return modo?.tipo === "diretto" || (modo?.tipo === "firma" && modo.path.startsWith(cartella) && !modo.path.includes(".."));
    });
    const indirizzi = await indirizziFotoGiornale(leggibili, async (paths) => {
      const { data, error } = await supabase.storage.from(BUCKET_FOTO_GIORNALE).createSignedUrls(paths, SCADENZA_SECONDI);
      if (error || !data) return paths.map((): null => null);
      return paths.map((_, i) => data[i]?.signedUrl ?? null);
    });

    const link: Record<string, string> = {};
    leggibili.forEach((f, i) => { if (indirizzi[i]) link[f.id] = indirizzi[i]; });
    return json({ link });
  } catch (e) {
    console.error("giornale-foto-cliente error:", e);
    return json({ error: "Errore interno" }, 500);
  }
});
