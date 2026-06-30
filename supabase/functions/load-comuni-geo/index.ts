import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// One-shot loader del dataset comuni ISTAT in public.it_comuni.
// Scarica public/data/comuni-istat.json dal frontend e fa bulk-insert via service role.
// Idempotente: se la tabella è già popolata (>=8000), non fa nulla.
Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { count } = await supabase
    .from("it_comuni")
    .select("*", { count: "exact", head: true });
  if ((count ?? 0) >= 8000) {
    return Response.json({ ok: true, already: count });
  }

  const res = await fetch("https://admin.ediliziaincloud.com/data/comuni-istat.json");
  if (!res.ok) {
    return Response.json({ ok: false, error: `fetch ${res.status}` }, { status: 502 });
  }
  const data = (await res.json()) as string[][];
  const rows = data
    .filter((r) => r && r[0] && r[2])
    .map((r) => ({
      comune: r[0],
      cap: r[1] || null,
      sigla: r[2],
      provincia: r[3] || null,
      regione: r[4] || null,
    }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const { error } = await supabase.from("it_comuni").insert(chunk);
    if (error) {
      return Response.json({ ok: false, error: error.message, inserted }, { status: 500 });
    }
    inserted += chunk.length;
  }
  return Response.json({ ok: true, inserted });
});
