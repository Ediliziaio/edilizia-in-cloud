/**
 * «Abbina al listino» (10/11/2026, lotto 3 di docs/piano-subappalto-computo-listino.md).
 *
 * Le voci della commessa senza voce del listino aziendale: senza quel ponte il prezzo della ditta
 * non arriva al contratto. Il programma propone (stesso codice, come l'ultima volta, stessa
 * descrizione), la persona conferma o sceglie, e l'abbinamento si ricorda per le commesse dopo.
 * Una voce che nel listino non c'è si può aggiungere al listino con un clic, se si ha il permesso.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizzaUnita } from "@/lib/prezzario/confronto";
import {
  chiaveDescrizione, proponiAbbinamenti, riepilogoProposte, unitaDelListino, unitaPerListino,
  type AbbinamentoRicordato, type MotivoProposta, type VoceDaAbbinare, type VoceListinoAbbinabile,
} from "@/lib/subappaltatori/abbinamentoListino";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface VoceCommessaDaAbbinare extends VoceDaAbbinare { phase_id: string; quantita: number; importo: number | null }

const MOTIVO: Record<MotivoProposta, string> = { codice: "stesso codice", ricordato: "come l'ultima volta", descrizione: "stessa descrizione" };

export function AbbinaListinoDialog({ orderId, companyId, codiceCommessa, voci, fasi, listino, onChiudi, onFatto }: {
  orderId: string; companyId: string; codiceCommessa?: string | null;
  voci: VoceCommessaDaAbbinare[]; fasi: Array<{ id: string; name: string }>;
  listino: VoceListinoAbbinabile[]; onChiudi: () => void; onFatto: () => void;
}) {
  const { canEditSettingsPricing } = usePermissions();
  const qc = useQueryClient();
  const ricordati = useQuery({
    queryKey: ["abbinamenti-voce-computo", companyId],
    queryFn: async (): Promise<AbbinamentoRicordato[]> => {
      const { data, error } = await db.from("product_aliases").select("alias_normalized, tariffa_id")
        .eq("company_id", companyId).eq("learned_from", "voce_computo").limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const aziendali = useMemo(() => listino.filter((t) => !t.external_team_id && !t.subappaltatore_id), [listino]);
  const perId = useMemo(() => new Map(aziendali.map((t) => [t.id, t])), [aziendali]);
  const daFare = useMemo(() => voci.filter((v) => !v.tariffa_id), [voci]);
  const proposte = useMemo(() => proponiAbbinamenti(daFare, listino, ricordati.data ?? []), [daFare, listino, ricordati.data]);
  const riepilogo = riepilogoProposte(proposte);

  // Scelta per voce: la proposta finché la persona non la cambia. Spuntate: le sicure.
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [spunte, setSpunte] = useState<Record<string, boolean>>({});
  const [cercaVoce, setCercaVoce] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");
  const [nuove, setNuove] = useState<Record<string, string>>({});

  const sceltaDi = (id: string) => scelte[id] ?? nuove[id] ?? proposte.find((p) => p.voceId === id)?.tariffaId ?? "";
  const spuntata = (id: string) => spunte[id] ?? !!proposte.find((p) => p.voceId === id)?.sicura;
  const daApplicare = daFare.filter((v) => spuntata(v.id) && sceltaDi(v.id));

  const trovate = cerca.trim().length < 2 ? [] : aziendali
    .filter((t) => `${t.codice ?? ""} ${t.nome}`.toLowerCase().includes(cerca.trim().toLowerCase())).slice(0, 8);

  const applica = useMutation({
    mutationFn: async () => {
      const righe = daApplicare.map((v) => ({ voce_id: v.id, tariffa_id: sceltaDi(v.id), chiave: chiaveDescrizione(v.descrizione) }));
      const { data, error } = await db.rpc("voci_abbina_listino", { p_order: orderId, p_abbinamenti: righe, p_ricorda: true });
      if (error) throw error;
      return data as { collegate: number };
    },
    onSuccess: (esito) => {
      toast.success(`${esito.collegate} ${esito.collegate === 1 ? "voce collegata" : "voci collegate"} al listino.`);
      void qc.invalidateQueries({ queryKey: ["abbinamenti-voce-computo", companyId] });
      onFatto();
    },
    onError: (e: Error) => toast.error(e.message || "Abbinamento non riuscito."),
  });

  /** Una voce che nel listino non c'è: diventa una voce del listino, col suo codice e il prezzo venduto. */
  const aggiungi = useMutation({
    mutationFn: async (v: VoceCommessaDaAbbinare) => {
      const u = unitaPerListino(v.unita);
      if (!u) throw new Error(`Il listino non ha l'unità «${v.unita ?? ""}»: scegli una voce esistente.`);
      const venduto = v.quantita > 0 && v.importo ? Math.round((v.importo / v.quantita) * 10000) / 10000 : null;
      const { data, error } = await db.from("tariffe_aziendali").insert({
        company_id: companyId, tipo: "altro", nome: v.descrizione.trim().slice(0, 500), ...u,
        codice: v.origine_codice?.trim() || null, prezzo_vendita: venduto, prezzo_costo: 0,
        fonte: codiceCommessa ? `Dalla commessa ${codiceCommessa}` : "Dalla commessa",
      }).select("id").single();
      if (error) throw error;
      return { voceId: v.id, tariffaId: data.id as string };
    },
    onSuccess: ({ voceId, tariffaId }) => {
      setNuove((n) => ({ ...n, [voceId]: tariffaId }));
      setSpunte((s) => ({ ...s, [voceId]: true }));
      void qc.invalidateQueries({ queryKey: ["listino-manodopera-voci", companyId] });
      toast.success("Voce aggiunta al listino: ora si collega con «Collega».");
    },
    onError: (e: Error) => toast.error(e.message || "Voce non aggiunta."),
  });

  const nomeFase = (id: string) => fasi.find((f) => f.id === id)?.name ?? "";
  const nomeNuova = (id: string) => voci.find((v) => nuove[v.id] === id)?.descrizione;

  return (
    <Dialog open onOpenChange={(o) => !o && !applica.isPending && onChiudi()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Collega le voci al listino</DialogTitle>
          <DialogDescription>
            {daFare.length} voci della commessa non hanno la voce del listino: senza, il prezzo della ditta non le trova.
            {" "}{riepilogo.sicure} si collegano da sole, {riepilogo.daGuardare} sono da guardare (unità diverse), {riepilogo.daScegliere} da scegliere a mano.
            L'abbinamento si ricorda: la prossima commessa con la stessa voce lo propone.
          </DialogDescription>
        </DialogHeader>

        {ricordati.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Caricamento…</p> : (
          <ul className="divide-y rounded-md border">
            {daFare.map((v) => {
              const p = proposte.find((x) => x.voceId === v.id);
              const scelta = sceltaDi(v.id);
              const t = scelta ? perId.get(scelta) : null;
              const diverse = !!t && normalizzaUnita(unitaDelListino(t.unita)) !== normalizzaUnita(v.unita);
              return (
                <li key={v.id} className="flex items-start gap-2 px-3 py-2">
                  <Checkbox checked={spuntata(v.id) && !!scelta} disabled={!scelta} aria-label={`Collega ${v.descrizione}`}
                    onCheckedChange={(c) => setSpunte((s) => ({ ...s, [v.id]: c === true }))} className="mt-1" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm">{v.origine_codice && <span className="mr-1 text-xs text-muted-foreground">{v.origine_codice}</span>}{v.descrizione}</p>
                    <p className="text-[11px] text-muted-foreground">{nomeFase(v.phase_id)} · {v.quantita.toLocaleString("it-IT")} {v.unita ?? ""}</p>
                    {scelta ? (
                      <p className="flex flex-wrap items-center gap-1 text-xs">
                        <span>→ {t?.nome ?? nomeNuova(scelta) ?? "voce nuova del listino"}</span>
                        {t && <span className="text-muted-foreground">({t.unita === "a_corpo" ? "a corpo" : t.unita})</span>}
                        {p?.motivo && p.tariffaId === scelta && <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">{MOTIVO[p.motivo]}</Badge>}
                        {diverse && <Badge variant="outline" className="h-4 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-normal text-amber-900">unità diverse</Badge>}
                      </p>
                    ) : <p className="text-xs text-amber-800">Da scegliere</p>}
                    {cercaVoce === v.id && (
                      <div className="space-y-1">
                        <Input autoFocus value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nel listino" className="h-8" aria-label={`Cerca nel listino per ${v.descrizione}`} />
                        {trovate.map((x) => (
                          <button key={x.id} type="button" className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                            onClick={() => { setScelte((s) => ({ ...s, [v.id]: x.id })); setSpunte((s) => ({ ...s, [v.id]: true })); setCercaVoce(null); setCerca(""); }}>
                            {x.codice && <span className="mr-1 text-muted-foreground">{x.codice}</span>}{x.nome} <span className="text-muted-foreground">({x.unita})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setCercaVoce(cercaVoce === v.id ? null : v.id); setCerca(""); }}>
                      {scelta ? "Cambia" : "Scegli"}
                    </Button>
                    {!scelta && canEditSettingsPricing && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={aggiungi.isPending || !unitaPerListino(v.unita)}
                        title={unitaPerListino(v.unita) ? "La voce diventa una voce del listino" : `Il listino non ha l'unità «${v.unita ?? ""}»`}
                        onClick={() => aggiungi.mutate(v)}>
                        <Plus className="mr-1 h-3 w-3" />Al listino
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {daFare.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Tutte le voci sono già collegate al listino.</li>}
          </ul>
        )}

        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-sm text-muted-foreground">{daApplicare.length} da collegare</span>
          <Button variant="ghost" disabled={applica.isPending} onClick={onChiudi}>Chiudi</Button>
          <Button disabled={applica.isPending || daApplicare.length === 0} onClick={() => applica.mutate()}>
            {applica.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Collega {daApplicare.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
