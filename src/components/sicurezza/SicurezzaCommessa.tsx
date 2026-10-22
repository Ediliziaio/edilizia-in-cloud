/**
 * La vista «Sicurezza» della commessa: cosa deve esserci in questo cantiere e
 * cosa manca (lista di controllo), il POS, i documenti caricati e i verbali.
 * Ogni voce mancante ha il suo pulsante: «Carica» apre il caricamento già sul
 * tipo giusto, il POS si prepara con un clic dai dati dell'app.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, FileUp, HardHat, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreaPos, usePosElenco } from "@/hooks/usePos";
import { useDocumentiSicurezza } from "@/hooks/useDocumentiSicurezza";
import { daSistemare, listaControlloCommessa, type VoceControllo } from "@/lib/sicurezza/documentiSicurezza";
import { CaricaDocumentoSicurezzaDialog, DocumentiSicurezza, type PresetCaricamento } from "./DocumentiSicurezza";

const oggiRoma = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

const STILE: Record<VoceControllo["stato"], { icona: typeof CheckCircle2; cls: string; testo: string }> = {
  ok: { icona: CheckCircle2, cls: "text-green-600", testo: "A posto" },
  manca: { icona: AlertTriangle, cls: "text-red-600", testo: "Manca" },
  scaduto: { icona: AlertTriangle, cls: "text-red-600", testo: "Scaduto" },
  in_scadenza: { icona: Clock, cls: "text-amber-600", testo: "In scadenza" },
  in_corso: { icona: Clock, cls: "text-amber-600", testo: "Da completare" },
};

export function SicurezzaCommessa({ companyId, orderId }: { companyId: string; orderId: string }) {
  const navigate = useNavigate();
  const oggi = oggiRoma();
  const { data: tuttiPos = [], isLoading: caricoPos } = usePosElenco();
  const pos = tuttiPos.filter((p) => p.order_id === orderId);
  const creaPos = useCreaPos();
  const { data: documenti = [], isLoading: caricoDoc } = useDocumentiSicurezza(companyId, orderId);
  const [preset, setPreset] = useState<PresetCaricamento | null>(null);

  const { data: subappaltatori = [], isLoading: caricoSub } = useQuery({
    queryKey: ["sicurezza-commessa-sub", companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subappaltatori_sicurezza").select("id, ragione_sociale, durc_scadenza")
        .eq("company_id", companyId).eq("order_id", orderId).order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ponteggi montati adesso sul cantiere: servono il PiMUS.
  const { data: ponteggiMontati = false } = useQuery({
    queryKey: ["sicurezza-commessa-ponteggi", companyId, orderId, oggi],
    queryFn: async () => {
      const { data, error } = await supabase.from("mezzi_allocazioni")
        .select("al, mezzo:mezzi!mezzi_allocazioni_mezzo_id_fkey(nome, tipo, deleted_at)")
        .eq("company_id", companyId).eq("order_id", orderId);
      if (error) throw error;
      return ((data ?? []) as Array<{ al: string | null; mezzo: { nome: string | null; tipo: string | null; deleted_at: string | null } | null }>)
        .some((a) => a.mezzo && !a.mezzo.deleted_at && (!a.al || a.al > oggi) && /ponteg/i.test(`${a.mezzo.nome ?? ""} ${a.mezzo.tipo ?? ""}`));
    },
  });

  const { data: verbali = [] } = useQuery({
    queryKey: ["sicurezza-commessa-verbali", companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("verbali_sicurezza").select("id, data, tipo, esito, redatto_da")
        .eq("company_id", companyId).eq("order_id", orderId).order("data", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const caricamento = caricoPos || caricoDoc || caricoSub;
  const voci = listaControlloCommessa({ oggi, documenti, pos, subappaltatori, ponteggiMontati });
  const aperte = daSistemare(voci);

  const preparaPos = async () => {
    try {
      const r = await creaPos.mutateAsync({ orderId, ruoloImpresa: "affidataria_esecutrice" });
      navigate(`/azienda/sicurezza-cantiere/pos/${r.pos_id}`, { state: { avvisi: r.avvisi } });
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  const azione = (v: VoceControllo) => {
    if (v.nelPos) {
      return pos[0]
        ? <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/azienda/sicurezza-cantiere/pos/${pos[0].id}`)}>Apri il POS</Button>
        : <Button size="sm" className="h-8" onClick={preparaPos} disabled={creaPos.isPending}>
            {creaPos.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Prepara il POS
          </Button>;
    }
    if (v.stato === "ok") return null;
    return (
      <Button size="sm" variant={v.stato === "manca" ? "default" : "outline"} className="h-8 gap-1"
        onClick={() => setPreset({ tipo: v.tipo, subappaltatoreId: v.subappaltatoreId ?? null })}>
        <FileUp className="h-3.5 w-3.5" />{v.stato === "manca" ? "Carica" : "Aggiorna"}
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />Documenti di sicurezza del cantiere
            {!caricamento && (aperte
              ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{aperte} da sistemare</Badge>
              : <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Tutto in regola</Badge>)}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {subappaltatori.length
              ? `Ci sono ${subappaltatori.length} imprese in subappalto: servono anche PSC, coordinatori, notifica e i documenti di ogni impresa.`
              : "Una sola impresa in cantiere. Se aggiungi un subappaltatore, la lista si allunga da sola."}
          </p>
        </CardHeader>
        <CardContent>
          {caricamento ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="divide-y rounded-lg border">
              {voci.map((v) => {
                const s = STILE[v.stato];
                const Icona = s.icona;
                return (
                  <div key={v.chiave} className="flex items-center gap-3 px-3 py-2.5">
                    <Icona className={cn("h-5 w-5 shrink-0", s.cls)} aria-label={s.testo} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{v.titolo}</p>
                      <p className="text-xs text-muted-foreground">{v.dettaglio ? `${v.dettaglio} · ` : ""}{v.perche}</p>
                    </div>
                    {azione(v)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><HardHat className="h-5 w-5 text-primary" />Archivio documenti</CardTitle>
          <p className="text-xs text-muted-foreground">Quelli di questa commessa e quelli che valgono per tutta l'azienda.</p>
        </CardHeader>
        <CardContent><DocumentiSicurezza companyId={companyId} orderId={orderId} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-5 w-5 text-primary" />Verbali di sicurezza</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {verbali.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun verbale per questa commessa.</p>
          ) : verbali.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{v.data ? v.data.split("-").reverse().join("/") : "—"}</span>
              <Badge variant="outline" className="capitalize">{(v.tipo ?? "verbale").replace(/_/g, " ")}</Badge>
              {v.esito && <span className="text-muted-foreground">{v.esito}</span>}
              {v.redatto_da && <span className="text-xs text-muted-foreground">· {v.redatto_da}</span>}
            </div>
          ))}
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => navigate("/azienda/sicurezza-cantiere?tab=verbali")}>
            Tutti i verbali e le scadenze
          </Button>
        </CardContent>
      </Card>

      <CaricaDocumentoSicurezzaDialog companyId={companyId} orderId={orderId} open={!!preset}
        onOpenChange={(v) => { if (!v) setPreset(null); }} preset={preset ?? undefined} />
    </div>
  );
}
