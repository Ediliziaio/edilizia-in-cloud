/**
 * Spese dal cantiere (24/11/2026): gli scontrini mandati dagli operai dall'app (`campo_spese`).
 * Sta in Personale → Richieste, accanto a ferie e permessi: approva o non approvare (con il motivo). L'operaio
 * riceve l'avviso a ogni decisione (trigger sul database). Si vede solo se c'è qualcosa.
 * Approvata, la spesa diventa da sola un costo (sul cantiere, se c'è) e, se l'ha pagata l'operaio, una voce
 * della sua nota spese del mese in Tesoreria: il rimborso si fa lì, col movimento della banca (24/11/2026).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Check, ExternalLink, ImageIcon, Loader2, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { COLONNE_SPESA, STATI_SPESA, TIPI_SPESA, euro, totaliSpese, type Spesa, type StatoSpesa } from "@/lib/campo/spese";

export function SpeseCantiereUfficio() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const qc = useQueryClient();
  const [tutte, setTutte] = useState(false);

  const spese = useQuery({
    queryKey: ["ufficio-spese-cantiere", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("campo_spese").select(COLONNE_SPESA)
        .eq("company_id", companyId!).neq("stato", "rimborsata")
        .order("giorno", { ascending: false }).limit(200);
      if (error) throw error;
      const righe = (data ?? []) as unknown as Spesa[];
      const ids = [...new Set(righe.map(r => r.user_id))];
      const ordini = [...new Set(righe.map(r => r.order_id).filter((x): x is string => !!x))];
      const [persone, cantieri] = await Promise.all([
        ids.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", ids) : Promise.resolve({ data: [] }),
        ordini.length ? supabase.from("orders").select("id, order_code").in("id", ordini) : Promise.resolve({ data: [] }),
      ]);
      const nomi = new Map((persone.data ?? []).map((p: { id: string; first_name: string | null; last_name: string | null }) =>
        [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Operaio"]));
      const codici = new Map((cantieri.data ?? []).map((o: { id: string; order_code: string | null }) => [o.id, o.order_code ?? ""]));
      return righe.map(r => ({ ...r, chi: nomi.get(r.user_id) ?? "Operaio", cantiere: r.order_id ? codici.get(r.order_id) ?? null : null }));
    },
  });

  const decidi = useMutation({
    mutationFn: async ({ s, stato, nota }: { s: Spesa; stato: StatoSpesa; nota?: string | null }) => {
      const { error } = await supabase.from("campo_spese").update({
        stato, nota_ufficio: nota ?? s.nota_ufficio, deciso_da: user?.id ?? null,
        deciso_il: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", s.id).eq("stato", s.stato);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.stato === "approvata"
        ? (v.s.pagata_con === "soldi_miei" ? "Approvata: costo registrato e voce aggiunta alla nota spese del mese" : "Approvata: costo registrato")
        : v.stato === "rimborsata" ? "Segnata come rimborsata" : "Spesa non approvata");
      void qc.invalidateQueries({ queryKey: ["ufficio-spese-cantiere"] });
    },
    onError: () => toast.error("Non sono riuscito a salvare. Riprova."),
  });

  const apriFoto = async (path: string) => {
    const finestra = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("campo-spese").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { finestra?.close(); toast.error("Foto non disponibile"); return; }
    (finestra ?? window).location.assign(data.signedUrl);
  };

  const righe = spese.data ?? [];
  if (spese.isLoading || righe.length === 0) return null;
  const totali = totaliSpese(righe);
  const visibili = tutte ? righe : righe.filter(r => r.stato === "inviata");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Receipt className="size-4" aria-hidden="true" />Spese dal cantiere</h3>
            <p className="text-xs text-muted-foreground">
              Da approvare {euro(totali.inAttesa)} · approvate da rimborsare {euro(totali.daRimborsare)}.
              Approvata, la spesa va nei costi del cantiere e, se l’ha pagata l’operaio, nella sua nota spese del mese in Tesoreria.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTutte(v => !v)}>{tutte ? "Solo da approvare" : "Mostra anche le approvate"}</Button>
        </div>
        {visibili.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna spesa da approvare.</p>
        ) : (
          <ul className="divide-y">
            {visibili.map(s => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {s.chi} · {euro(Number(s.importo))} · {TIPI_SPESA.find(x => x.value === s.tipo)?.label ?? s.tipo}
                    <Badge variant="secondary" className="ms-2 text-[10px]">{STATI_SPESA[s.stato]}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(`${s.giorno}T12:00:00`), "d MMM yyyy", { locale: it })}
                    {s.cantiere ? ` · ${s.cantiere}` : ""}
                    {s.pagata_con === "carta_aziendale" ? " · carta aziendale" : " · pagata dall'operaio"}
                    {s.descrizione ? ` · ${s.descrizione}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.foto_path && (
                    <Button variant="outline" size="sm" onClick={() => void apriFoto(s.foto_path!)}><ImageIcon className="me-1 size-4" />Scontrino</Button>
                  )}
                  {s.stato === "inviata" && (<>
                    <Button variant="outline" size="sm" disabled={decidi.isPending}
                      onClick={() => { const nota = window.prompt("Perché non la approvi? (lo legge l'operaio)"); if (nota !== null) decidi.mutate({ s, stato: "rifiutata", nota: nota.trim() || null }); }}>
                      <X className="me-1 size-4" />Non approvare
                    </Button>
                    <Button size="sm" disabled={decidi.isPending} onClick={() => decidi.mutate({ s, stato: "approvata" })}>
                      {decidi.isPending ? <Loader2 className="me-1 size-4 animate-spin" /> : <Check className="me-1 size-4" />}Approva
                    </Button>
                  </>)}
                  {s.stato === "approvata" && s.pagata_con === "soldi_miei" && (s.expense_report_id ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/azienda/tesoreria?tab=note-spese"><ExternalLink className="me-1 size-4" />Rimborso in Note spese</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={decidi.isPending} onClick={() => decidi.mutate({ s, stato: "rimborsata" })}>Segna rimborsata</Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
