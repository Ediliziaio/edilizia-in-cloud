import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { dispatchVoiceCampaign } from "../_shared/voiceCampaignDispatch.ts";
serveConMetricheRapida("voice-campaign-dispatch", async req => {
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    return Response.json(await dispatchVoiceCampaign(createClient(url, key), url, key));
  } catch (error) {
    console.error("[voice-campaign-dispatch]", error);
    return Response.json({ error: "Esecuzione non completata; nessun tentativo automatico duplicato" }, { status: 500 });
  }
});
