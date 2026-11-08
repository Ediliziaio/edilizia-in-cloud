/**
 * «Eventi della giornata» sulla pagina del giornale: consegne, problemi, sospensioni…
 * In bozza si aggiungono e si tolgono; un problema si chiude (con una nota) o si riapre
 * anche dopo la firma. Le stesse regole le impone il trigger trg_giornale_eventi_guardia.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Eye, Loader2, MessageSquare, PauseCircle, PlayCircle, Plus, RotateCcw, ShieldAlert, StickyNote, Trash2, Truck, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DettaTesto } from "@/components/campo/DettaTesto";
import { messaggioErroreGiornale } from "@/lib/campo/statoGiornale";
import {
  ETICHETTA_EVENTO, TIPI_EVENTO, oraBreve, ordinaEventi, problemaAperto, puoAggiungereEvento, regoleEvento, tipoEventoValido,
  type EventoGiornale, type EventoProposto, type TipoEvento,
} from "../../../supabase/functions/_shared/eventiGiornale";

/** Tabella nuova, non ancora nei tipi generati. */
const dbSenzaTipi = supabase as unknown as SupabaseClient;

const ICONE: Record<TipoEvento, LucideIcon> = {
  consegna: Truck, problema: AlertTriangle, sospensione: PauseCircle, ripresa: PlayCircle,
  istruzione: MessageSquare, sopralluogo: Eye, sicurezza: ShieldAlert, nota: StickyNote,
};

const icona = (tipo: string): LucideIcon => (tipoEventoValido(tipo) ? ICONE[tipo] : ClipboardList);
const etichetta = (tipo: string) => (tipoEventoValido(tipo) ? ETICHETTA_EVENTO[tipo] : tipo);
const dataOra = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM/yyyy HH:mm");
};

export const chiaveEventi = (giornaleId: string | undefined) => ["giornale-eventi", giornaleId];

interface Props {
  companyId: string;
  orderId: string;
  giornaleId?: string;
  statoPagina: string;
  haPermesso: boolean;
  eventi: EventoGiornale[];
  nomi: Record<string, string>;
  proposti: EventoProposto[];
  onTogliProposto: (p: EventoProposto) => void;
}

export function EventiGiornale({ companyId, orderId, giornaleId, statoPagina, haPermesso, eventi, nomi, proposti, onTogliProposto }: Props) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoEvento>("nota");
  const [ora, setOra] = useState("");
  const [testo, setTesto] = useState("");
  const [faseId, setFaseId] = useState("");
  const [chiudendo, setChiudendo] = useState<string | null>(null);
  const [notaChiusura, setNotaChiusura] = useState("");

  const puoAggiungere = puoAggiungereEvento(statoPagina, haPermesso);
  const aggiorna = () => queryClient.invalidateQueries({ queryKey: chiaveEventi(giornaleId) });

  const { data: fasi = [] } = useQuery({
    queryKey: ["giornale-fasi-commessa", orderId],
    queryFn: async () => {
      const { data, error } = await dbSenzaTipi.from("order_work_phases").select("id, name").eq("order_id", orderId).order("position");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: puoAggiungere && !!orderId,
  });

  const aggiungi = useMutation({
    mutationFn: async () => {
      if (!giornaleId) throw new Error("Salva la pagina prima di aggiungere un evento.");
      const pulito = testo.trim();
      if (!pulito) throw new Error("Scrivi il testo dell'evento.");
      const { error } = await dbSenzaTipi.from("giornale_eventi").insert({
        company_id: companyId, giornale_id: giornaleId, tipo, testo: pulito, ora: ora || null, fase_id: faseId || null,
      });
      if (error) throw new Error(messaggioErroreGiornale(error));
    },
    onSuccess: () => { setTesto(""); setOra(""); setFaseId(""); aggiorna(); },
    onError: (e: Error) => toast.error("Evento non salvato", { description: e.message }),
  });

  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dbSenzaTipi.from("giornale_eventi").delete().eq("id", id);
      if (error) throw new Error(messaggioErroreGiornale(error));
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error("Evento non tolto", { description: e.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato, nota }: { id: string; stato: "aperto" | "chiuso"; nota?: string }) => {
      // Data e autore della chiusura li scrive il database.
      const { error } = await dbSenzaTipi.from("giornale_eventi").update({ stato, nota_chiusura: nota ?? null }).eq("id", id);
      if (error) throw new Error(messaggioErroreGiornale(error));
    },
    onSuccess: () => { setChiudendo(null); setNotaChiusura(""); aggiorna(); },
    onError: (e: Error) => toast.error("Problema non aggiornato", { description: e.message }),
  });

  const nessuno = eventi.length === 0 && proposti.length === 0;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Eventi della giornata
      </p>

      {nessuno && <p className="text-xs text-muted-foreground">Nessun evento.</p>}

      {(eventi.length > 0 || proposti.length > 0) && (
        <ul className="space-y-2">
          {ordinaEventi(eventi).map((e) => {
            const Icona = icona(e.tipo);
            const regole = regoleEvento(e, statoPagina, haPermesso);
            const aperto = problemaAperto(e);
            return (
              <li key={e.id} className="rounded-md bg-muted/60 p-2">
                <div className="flex items-start gap-2">
                  <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{etichetta(e.tipo)}</span>
                      {e.ora && <span className="tabular-nums">{oraBreve(e.ora)}</span>}
                      {e.tipo === "problema" && (aperto
                        ? <Badge variant="outline" className="border-red-300 text-red-700">Aperto</Badge>
                        : <Badge variant="secondary" className="bg-green-100 text-green-700">Chiuso</Badge>)}
                      {e.autore_id && nomi[e.autore_id] && <span>{nomi[e.autore_id]}</span>}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{e.testo}</p>
                    {e.tipo === "problema" && !aperto && (
                      <p className="text-xs text-muted-foreground">
                        Chiuso il {dataOra(e.chiuso_il)}{e.chiuso_da && nomi[e.chiuso_da] ? ` da ${nomi[e.chiuso_da]}` : ""}: {e.nota_chiusura}
                      </p>
                    )}
                    {chiudendo === e.id && (
                      <div className="space-y-2 pt-1">
                        <Label htmlFor={`chiusura-${e.id}`} className="text-xs">Come si è risolto</Label>
                        <Textarea id={`chiusura-${e.id}`} rows={2} maxLength={2000} className="resize-none" value={notaChiusura} onChange={(v) => setNotaChiusura(v.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!notaChiusura.trim() || cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: e.id, stato: "chiuso", nota: notaChiusura.trim() })}>
                            {cambiaStato.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Chiudi il problema
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setChiudendo(null); setNotaChiusura(""); }}>Annulla</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {regole.puoChiudere && chiudendo !== e.id && (
                      <Button size="sm" variant="outline" onClick={() => { setChiudendo(e.id); setNotaChiusura(""); }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Chiudi
                      </Button>
                    )}
                    {regole.puoRiaprire && (
                      <Button size="sm" variant="ghost" disabled={cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: e.id, stato: "aperto" })}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Riapri
                      </Button>
                    )}
                    {regole.puoEliminare && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Togli l'evento: ${e.testo}`} disabled={togli.isPending} onClick={() => togli.mutate(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {proposti.map((p) => {
            const Icona = icona(p.tipo);
            return (
              <li key={p.ddt_id ?? p.ticket_id} className="flex items-start gap-2 rounded-md border border-dashed p-2">
                <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{etichetta(p.tipo)}</span> · da salvare</p>
                  <p className="whitespace-pre-wrap text-sm">{p.testo}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Scarta la proposta: ${p.testo}`} onClick={() => onTogliProposto(p)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {puoAggiungere && (giornaleId ? (
        <div className="space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEvento)}>
                <SelectTrigger aria-label="Tipo di evento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_EVENTO.map((t) => <SelectItem key={t} value={t}>{ETICHETTA_EVENTO[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="evento_ora">Ora (facoltativa)</Label>
              <Input id="evento_ora" type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
            </div>
          </div>
          {fasi.length > 0 && (
            <div className="space-y-1">
              <Label>Fase (facoltativa)</Label>
              <Select value={faseId || "__nessuna__"} onValueChange={(v) => setFaseId(v === "__nessuna__" ? "" : v)}>
                <SelectTrigger aria-label="Fase della commessa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nessuna__">Nessuna</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="evento_testo">Cosa è successo</Label>
            <Textarea id="evento_testo" rows={2} maxLength={5000} className="resize-none" value={testo} onChange={(e) => setTesto(e.target.value)} />
            <DettaTesto value={testo} onChange={setTesto} companyId={companyId} contesto="giornale" campo="note" etichetta="Evento della giornata" disabled={aggiungi.isPending} />
          </div>
          <Button size="sm" onClick={() => aggiungi.mutate()} disabled={aggiungi.isPending || !testo.trim()}>
            {aggiungi.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Aggiungi evento
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Salva la pagina per aggiungere altri eventi.</p>
      ))}
    </div>
  );
}
