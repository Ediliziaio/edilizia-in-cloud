import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as headers from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { extractPdfWithCoverage } from "../_shared/pdfExtraction.ts";
import { erroreAiPerUtente } from "../_shared/erroriAi.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import { creaHandlerBollettaFv, type DipendenzeBollettaFv } from "./handler.ts";
serveConMetriche(
  "fv-leggi-bolletta",
  creaHandlerBollettaFv({
    headers,
    requireAuth,
    requireCompanyAccess,
    aiRouterComplete,
    extractPdfWithCoverage,
    erroreAiPerUtente,
    utente: (req) =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: req.headers.get("Authorization")! },
          },
        },
      ) as unknown as ReturnType<DipendenzeBollettaFv["utente"]>,
  }),
);
