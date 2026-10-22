/**
 * Scomposizioni: come una voce di computo (o un simbolo di tavola) diventa
 * materiali da comprare. Es. 1 «punto presa» = 1 scatola 503, 1 frutto,
 * 1 placca, 18 m di cavo, 15 m di corrugato. Le proposte dell'AI arrivano
 * spente: le approva chi valida i materiali.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Componente {
  id?: string;
  descrizione: string;
  specifiche: string | null;
  unita_misura: string;
  quantita_per_unita: number;
  sfrido_percentuale: number;
  categoria: string | null;
  ordine?: number;
}
interface Scomp {
  id?: string;
  nome: string;
  codice_prezzario: string | null;
  parole_chiave: string[];
  unita_misura: string | null;
  categoria: string | null;
  attiva: boolean;
  origine: "manuale" | "ai";
  note: string | null;
  approvata_il?: string | null;
  componenti: Componente[];
}

const vuota = (): Scomp => ({
  nome: "", codice_prezzario: null, parole_chiave: [], unita_misura: "cad", categoria: null, attiva: true, origine: "manuale", note: null,
  componenti: [{ descrizione: "", specifiche: null, unita_misura: "pz", quantita_per_unita: 1, sfrido_percentuale: 0, categoria: null }],
});

export default function ScomposizioniVoce() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const { canEditOrders, canValidateBom } = usePermissions();
  const puoScrivere = !!(canEditOrders || canValidateBom);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<"tutte" | "da_approvare">("tutte");
  const [cerca, setCerca] = useState("");
  const [modifica, setModifica] = useState<Scomp | null>(null);

  const elenco = useQuery({
    queryKey: ["scomposizioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scomposizioni_voce")
        .select("id, nome, codice_prezzario, parole_chiave, unita_misura, categoria, attiva, origine, note, approvata_il, componenti:scomposizioni_voce_componenti(id, descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria, ordine)")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        componenti: [...((s as { componenti?: Componente[] }).componenti ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)),
      })) as Scomp[];
    },
  });

  const daApprovare = (elenco.data ?? []).filter((s) => s.origine === "ai" && !s.attiva && !s.approvata_il);
  const visibili = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return (filtro === "da_approvare" ? daApprovare : elenco.data ?? []).filter((s) =>
      !t || s.nome.toLowerCase().includes(t) || (s.codice_prezzario ?? "").toLowerCase().includes(t) || s.parole_chiave.some((p) => p.toLowerCase().includes(t)));
  }, [elenco.data, filtro, cerca, daApprovare]);

  const salva = useMutation({
    mutationFn: async (s: Scomp) => {
      const testata = {
        company_id: companyId, nome: s.nome.trim(), codice_prezzario: s.codice_prezzario?.trim() || null,
        parole_chiave: s.parole_chiave.map((p) => p.trim()).filter(Boolean), unita_misura: s.unita_misura || null,
        categoria: s.categoria || null, attiva: s.attiva, note: s.note,
      };
      let id = s.id;
      if (id) {
        const { error } = await supabase.from("scomposizioni_voce").update(testata).eq("id", id);
        if (error) throw error;
        const { error: e2 } = await supabase.from("scomposizioni_voce_componenti").delete().eq("scomposizione_id", id);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from("scomposizioni_voce").insert(testata).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const componenti = s.componenti.filter((c) => c.descrizione.trim() && Number(c.quantita_per_unita) > 0);
      if (componenti.length) {
        const { error } = await supabase.from("scomposizioni_voce_componenti").insert(componenti.map((c, i) => ({
          scomposizione_id: id!, company_id: companyId, ordine: i, descrizione: c.descrizione.trim(), specifiche: c.specifiche || null,
          unita_misura: c.unita_misura || "pz", quantita_per_unita: Number(c.quantita_per_unita), sfrido_percentuale: Number(c.sfrido_percentuale) || 0,
          categoria: c.categoria || null,
        })));
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Scomposizione salvata"); setModifica(null); qc.invalidateQueries({ queryKey: ["scomposizioni"] }); },
    onError: (e) => toast.error("Non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const attiva = useMutation({
    mutationFn: async (p: { id: string; attiva: boolean }) => {
      const { error } = await supabase.from("scomposizioni_voce").update({ attiva: p.attiva }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scomposizioni"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scomposizioni_voce").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scomposizioni"] }),
  });

  const aggiornaComp = (i: number, patch: Partial<Componente>) =>
    modifica && setModifica({ ...modifica, componenti: modifica.componenti.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:underline"><ArrowLeft className="h-3 w-3" /> Indietro</button>
          <h1 className="text-xl font-semibold">Scomposizioni in materiali</h1>
          <p className="text-sm text-slate-600">Per ogni lavorazione del computo (o simbolo delle tavole), i materiali da comprare per una unità.</p>
        </div>
        {puoScrivere && <Button onClick={() => setModifica(vuota())}><Plus className="mr-1.5 h-4 w-4" /> Nuova scomposizione</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-white p-0.5 text-sm">
          <button type="button" className={`rounded px-3 py-1 ${filtro === "tutte" ? "bg-slate-900 text-white" : ""}`} onClick={() => setFiltro("tutte")}>Tutte</button>
          <button type="button" className={`rounded px-3 py-1 ${filtro === "da_approvare" ? "bg-slate-900 text-white" : ""}`} onClick={() => setFiltro("da_approvare")}>
            Proposte dall'AI da approvare ({daApprovare.length})
          </button>
        </div>
        <Input className="h-9 w-64" placeholder="Cerca per nome, codice, parola" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>

      {elenco.isLoading ? <p className="text-sm text-slate-500">Carico…</p> : visibili.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">
          {filtro === "da_approvare" ? "Nessuna proposta da approvare." : "Nessuna scomposizione. Creane una, o falle proporre all'AI da «Genera dal computo e dalle tavole» in una commessa."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibili.map((s) => (
            <li key={s.id} className="rounded-lg border bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.nome}
                    {s.origine === "ai" && <span className="ml-2 inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 text-[11px] text-violet-800"><Sparkles className="h-3 w-3" /> AI</span>}
                    {!s.attiva && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{s.origine === "ai" && !s.approvata_il ? "Da approvare" : "Spenta"}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.codice_prezzario ? `Codice ${s.codice_prezzario}` : `Parole: ${s.parole_chiave.join(", ")}`} · per 1 {s.unita_misura ?? "unità"}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {s.componenti.map((c) => `${c.quantita_per_unita.toLocaleString("it-IT")} ${c.unita_misura} ${c.descrizione}${c.sfrido_percentuale ? ` (+${c.sfrido_percentuale}%)` : ""}`).join(" · ") || "Nessun componente"}
                  </p>
                  {s.note && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{s.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.origine === "ai" && !s.attiva && canValidateBom && (
                    <Button size="sm" className="h-8" onClick={() => attiva.mutate({ id: s.id!, attiva: true })}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approva</Button>
                  )}
                  {puoScrivere && !(s.origine === "ai" && !s.approvata_il) && (
                    <Switch checked={s.attiva} onCheckedChange={(v) => attiva.mutate({ id: s.id!, attiva: v })} aria-label={`Usa ${s.nome}`} />
                  )}
                  {puoScrivere && <Button size="sm" variant="outline" className="h-8" onClick={() => setModifica(s)}>Modifica</Button>}
                  {puoScrivere && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Elimina ${s.nome}`} onClick={() => elimina.mutate(s.id!)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!modifica} onOpenChange={(o) => !o && setModifica(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{modifica?.id ? "Modifica scomposizione" : "Nuova scomposizione"}</DialogTitle></DialogHeader>
          {modifica && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1"><span className="font-medium">Nome</span>
                  <Input value={modifica.nome} onChange={(e) => setModifica({ ...modifica, nome: e.target.value })} placeholder="Punto presa 10/16 A" /></label>
                <label className="space-y-1"><span className="font-medium">Codice di prezzario (esatto)</span>
                  <Input value={modifica.codice_prezzario ?? ""} onChange={(e) => setModifica({ ...modifica, codice_prezzario: e.target.value })} placeholder="es. EL.05.010" /></label>
                <label className="space-y-1"><span className="font-medium">Parole chiave (separate da virgola)</span>
                  <Input value={modifica.parole_chiave.join(", ")} onChange={(e) => setModifica({ ...modifica, parole_chiave: e.target.value.split(",") })} placeholder="punto presa" /></label>
                <label className="space-y-1"><span className="font-medium">Unità della voce</span>
                  <Input value={modifica.unita_misura ?? ""} onChange={(e) => setModifica({ ...modifica, unita_misura: e.target.value })} placeholder="cad, m, mq" /></label>
              </div>
              <div>
                <p className="mb-1 font-medium">Materiali per 1 {modifica.unita_misura || "unità"}</p>
                <div className="space-y-1.5">
                  {modifica.componenti.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_5rem_4rem_4rem_auto] gap-1.5 sm:grid-cols-[2fr_1.5fr_5rem_4rem_4rem_auto]">
                      <Input aria-label="Materiale" value={c.descrizione} onChange={(e) => aggiornaComp(i, { descrizione: e.target.value })} placeholder="Scatola 503" />
                      <Input aria-label="Specifiche" className="hidden sm:block" value={c.specifiche ?? ""} onChange={(e) => aggiornaComp(i, { specifiche: e.target.value })} placeholder="Specifiche" />
                      <Input aria-label="Quantità per unità" inputMode="decimal" value={String(c.quantita_per_unita)} onChange={(e) => aggiornaComp(i, { quantita_per_unita: Number(e.target.value.replace(",", ".")) || 0 })} />
                      <Input aria-label="Unità" value={c.unita_misura} onChange={(e) => aggiornaComp(i, { unita_misura: e.target.value })} />
                      <Input aria-label="Sfrido %" inputMode="decimal" value={String(c.sfrido_percentuale)} onChange={(e) => aggiornaComp(i, { sfrido_percentuale: Number(e.target.value.replace(",", ".")) || 0 })} title="Sfrido %" />
                      <Button size="icon" variant="ghost" aria-label="Togli" onClick={() => setModifica({ ...modifica, componenti: modifica.componenti.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setModifica({ ...modifica, componenti: [...modifica.componenti, { ...vuota().componenti[0] }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi materiale
                </Button>
                <p className="mt-1 text-xs text-slate-500">Colonne: materiale · specifiche · quantità per unità · unità · sfrido %.</p>
              </div>
              <label className="block space-y-1"><span className="font-medium">Note</span>
                <Textarea rows={2} value={modifica.note ?? ""} onChange={(e) => setModifica({ ...modifica, note: e.target.value })} /></label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModifica(null)}>Annulla</Button>
            <Button disabled={!modifica?.nome.trim() || salva.isPending || (!modifica?.codice_prezzario?.trim() && !modifica?.parole_chiave.some((p) => p.trim()))}
              onClick={() => modifica && salva.mutate(modifica)}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
