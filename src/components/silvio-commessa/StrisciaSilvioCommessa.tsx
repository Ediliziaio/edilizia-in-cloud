/**
 * La striscia in testa a una commessa che Silvio ha preparato: «Silvio ha preparato N cose»,
 * con «Annulla tutto» finché nessuno ci ha lavorato sopra (3.4, punto 8; 3.5).
 * Il rifiuto dell'annullamento arriva coi nomi delle tabelle: qui diventa parole.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Undo2, X } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { annullaSilvio, ErroreBozza, messaggioErrore, type ClientBozze } from "@/lib/silvio-commessa/bozze";
import { rifiutoInParole } from "./presentazione";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";

// Le tabelle di Silvio non sono ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbVero = supabase as any;

interface Preparato { bozzaId: string; modo: "crea" | "completa"; cose: number }

/** La bozza che ha scritto su questa commessa, e quante righe ha registrato. Null se nessuna. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leggiPreparatoDaSilvio(orderId: string, db: any = dbVero): Promise<Preparato | null> {
  const { data, error } = await db.from("commessa_bozze").select("id, modo, stato, eseguita_il")
    .eq("order_id", orderId).neq("stato", "bozza").order("eseguita_il", { ascending: false }).limit(1).maybeSingle();
  // Senza la migrazione la tabella non c'è: la striscia semplicemente non compare.
  if (error || !data) return null;
  const { count } = await db.from("commessa_bozze_scritture").select("id", { count: "exact", head: true }).eq("bozza_id", data.id);
  return { bozzaId: data.id, modo: data.modo === "completa" ? "completa" : "crea", cose: count ?? 0 };
}

export function StrisciaSilvioCommessa({ orderId, companyId, puoModificare, db = dbVero }: {
  orderId: string; companyId: string | null | undefined; puoModificare: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
}) {
  const attivo = useCreaConSilvioAttivo(companyId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chiusa, setChiusa] = useState(false);
  const [conferma, setConferma] = useState(false);
  const [annullando, setAnnullando] = useState(false);
  const [rifiuto, setRifiuto] = useState<string | null>(null);
  const preparato = useQuery({
    queryKey: ["silvio-commessa", "preparato", orderId],
    enabled: attivo && !!orderId,
    retry: false,
    queryFn: () => leggiPreparatoDaSilvio(orderId, db),
  });
  const p = preparato.data;
  if (!attivo || chiusa || !p) return null;

  const annulla = async () => {
    setAnnullando(true);
    setRifiuto(null);
    try {
      const esito = await annullaSilvio(p.bozzaId, db as ClientBozze);
      setConferma(false);
      if (esito.commessa_tolta) navigate("/azienda/ordini");
      else await queryClient.invalidateQueries();
    } catch (e) {
      setRifiuto(rifiutoInParole(e instanceof ErroreBozza ? e.message : messaggioErrore(e)));
    } finally {
      setAnnullando(false);
    }
  };

  return (
    <div className="mx-0 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm sm:mx-6"
      role="region" aria-label="Preparato da Silvio">
      <Sparkles className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
      <p className="min-w-0 flex-1 text-orange-950">
        {p.modo === "crea" ? "Silvio ha preparato" : "Silvio ha aggiunto"} <strong>{p.cose} {p.cose === 1 ? "cosa" : "cose"}</strong> in questa commessa.
      </p>
      {puoModificare && (
        <Button type="button" size="sm" variant="outline" className="h-11 gap-1 bg-white sm:h-8" onClick={() => setConferma(true)}>
          <Undo2 className="h-4 w-4" aria-hidden />Annulla tutto
        </Button>
      )}
      <button type="button" className="grid h-11 w-11 place-items-center rounded text-orange-700 hover:bg-orange-100 sm:h-8 sm:w-8" aria-label="Nascondi" onClick={() => setChiusa(true)}>
        <X className="h-4 w-4" />
      </button>
      {rifiuto && !conferma && <p role="alert" className="w-full text-xs text-red-800">{rifiuto}</p>}

      <AlertDialog open={conferma} onOpenChange={(o) => { if (!annullando) setConferma(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare tutto quello che ha fatto Silvio?</AlertDialogTitle>
            <AlertDialogDescription>
              {p.modo === "crea"
                ? "La commessa sparisce, con fasi, rate, righe e documenti che Silvio ha preparato. La bozza torna com'era: puoi ricrearla."
                : "Tolgo quello che Silvio ha aggiunto; quello che c'era prima resta com'era."}
              {" "}Si può solo finché nessuno ci ha lavorato sopra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rifiuto && <p role="alert" className="text-sm text-red-800">{rifiuto}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={annullando}>Tieni tutto</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={annullando} onClick={() => void annulla()}>
              {annullando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Annulla tutto
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
