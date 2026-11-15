// Clienti che sembrano una Pubblica Amministrazione ma non sono segnati PA
// (vista anagrafiche_pa_da_confermare, lotto 1, 15/11/2026). Niente si cambia da solo:
// si apre la scheda, si sceglie il tipo con «Modifica» e il cliente esce dall'elenco.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Landmark, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PaDaConfermare() {
  const companyId = useEffectiveCompanyId();
  const navigate = useNavigate();
  const [aperto, setAperto] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["anagrafiche-pa-da-confermare", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafiche_pa_da_confermare")
        .select("id, denominazione, codice_sdi, motivo")
        .eq("company_id", companyId!)
        .order("denominazione");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  if (data.length === 0) return null;

  return (
    <Alert className="border-violet-200 bg-violet-50/60">
      <Landmark className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {data.length === 1 ? "Un cliente sembra un ente pubblico" : `${data.length} clienti sembrano enti pubblici`}
        <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto" onClick={() => setAperto(!aperto)}>
          {aperto ? "Nascondi" : "Vedi chi"} <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${aperto ? "rotate-180" : ""}`} />
        </Button>
      </AlertTitle>
      <AlertDescription className="text-sm">
        Sono segnati come azienda o privato: la fattura parte nel formato dei privati (FPR12) e non come PA. Apri la scheda,
        premi «Modifica» e scegli il tipo giusto: chi confermi esce dall'elenco.
        {aperto && (
          <ul className="mt-2 divide-y rounded-md border bg-white">
            {data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/40 flex flex-wrap items-baseline gap-x-2"
                  onClick={() => navigate(`/azienda/documenti/anagrafiche/${r.id}`)}
                >
                  <span className="font-medium">{r.denominazione || "—"}</span>
                  {r.codice_sdi && <span className="font-mono text-xs">{r.codice_sdi}</span>}
                  <span className="text-xs text-muted-foreground">{r.motivo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
