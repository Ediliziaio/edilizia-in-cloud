/**
 * WhatsApp Locale — Campagne a freddo (piattaforma).
 *
 * Crea una campagna, carica i destinatari da un filtro sui contatti, avvia.
 * Da lì in poi il dispatcher (cron ogni 10 min in fascia diurna) manda al
 * ritmo consentito dai numeri: warm-up, cap giornaliero e settimanale,
 * throttle fra un invio e l'altro, rotazione sul numero meno carico.
 *
 * Il ritmo NON si imposta qui, di proposito: si governa dai cap dei singoli
 * numeri (Impostazioni → WhatsApp Locale). Due posti che decidono la stessa
 * cosa finiscono sempre per contraddirsi.
 *
 * Il follow-up parte solo verso chi NON ha risposto: alla prima risposta il
 * destinatario esce dalla coda. Insistere con chi ti ha già risposto è il
 * modo più rapido di farsi segnalare come spam.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Play, Pause, Users, Send, MessageCircle, AlertTriangle } from "lucide-react";

interface Riepilogo {
  id: string;
  nome: string;
  stato: string;
  followup_dopo_giorni: number;
  ha_followup: boolean;
  totali: number;
  da_inviare: number;
  inviati: number;
  followup_inviati: number;
  risposti: number;
  saltati: number;
  falliti: number;
  created_at: string;
  avviata_at: string | null;
}

const STATO_BADGE: Record<string, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "bg-slate-100 text-slate-700" },
  in_corso: { label: "In corso", className: "bg-emerald-100 text-emerald-700" },
  in_pausa: { label: "In pausa", className: "bg-amber-100 text-amber-700" },
  completata: { label: "Completata", className: "bg-blue-100 text-blue-700" },
  annullata: { label: "Annullata", className: "bg-slate-100 text-slate-500" },
};

export default function AdminWhatsappLocaleCampagne() {
  const qc = useQueryClient();
  const [creaAperto, setCreaAperto] = useState(false);
  const [listaPer, setListaPer] = useState<Riepilogo | null>(null);

  // Nuova campagna
  const [nome, setNome] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [followup, setFollowup] = useState("");
  const [followupGiorni, setFollowupGiorni] = useState(3);

  // Caricamento lista
  const [fTags, setFTags] = useState("");
  const [fCitta, setFCitta] = useState("");
  const [fProvincia, setFProvincia] = useState("");
  const [fLimite, setFLimite] = useState("");

  const { data: campagne = [], isLoading } = useQuery({
    queryKey: ["openwa-campagne"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("openwa_campagne_riepilogo");
      if (error) throw error;
      return (data ?? []) as Riepilogo[];
    },
    refetchInterval: 60_000,
  });

  // Capacità del pool: senza numeri collegati una campagna non parte, e va
  // detto PRIMA di crearla invece di lasciarla ferma senza spiegazioni.
  const { data: numeri = [] } = useQuery({
    queryKey: ["openwa-numeri-capacita"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("openwa_numbers")
        .select("id, numero, stato, daily_cap, daily_sent, daily_sent_date");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; numero: string; stato: string; daily_cap: number }>;
    },
  });

  const connessi = useMemo(() => numeri.filter((n) => n.stato === "connected"), [numeri]);
  const capacitaGiorno = useMemo(
    () => connessi.reduce((s, n) => s + (n.daily_cap ?? 0), 0),
    [connessi],
  );

  const filtriRpc = useMemo(() => {
    const tags = fTags.split(",").map((t) => t.trim()).filter(Boolean);
    return {
      p_tags: tags.length ? tags : null,
      p_citta: fCitta.trim() || null,
      p_provincia: fProvincia.trim() || null,
      p_source: null,
      p_limite: fLimite.trim() ? Number(fLimite) : null,
    };
  }, [fTags, fCitta, fProvincia, fLimite]);

  const { data: anteprima, isFetching: anteprimaInCorso } = useQuery({
    queryKey: ["openwa-anteprima", filtriRpc],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("openwa_campagna_anteprima", filtriRpc);
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!listaPer,
  });

  const crea = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("openwa_campagne").insert({
        nome: nome.trim(),
        messaggio: messaggio.trim(),
        followup_messaggio: followup.trim() || null,
        followup_dopo_giorni: followupGiorni,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna creata", { description: "Ora carica i destinatari, poi avviala." });
      setCreaAperto(false);
      setNome(""); setMessaggio(""); setFollowup(""); setFollowupGiorni(3);
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Creazione non riuscita", { description: e.message }),
  });

  const caricaLista = useMutation({
    mutationFn: async (campagnaId: string) => {
      const { data, error } = await supabase.rpc("openwa_campagna_carica_lista", {
        p_campagna_id: campagnaId, ...filtriRpc,
      });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(`${n} destinatari aggiunti`, {
        description: n === 0 ? "Nessun contatto nuovo: erano già tutti in lista." : undefined,
      });
      setListaPer(null);
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Caricamento non riuscito", { description: e.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const patch: Record<string, unknown> = { stato, updated_at: new Date().toISOString() };
      if (stato === "in_corso") patch.avviata_at = new Date().toISOString();
      const { error } = await supabase.from("openwa_campagne").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["openwa-campagne"] }),
    onError: (e: Error) => toast.error("Operazione non riuscita", { description: e.message }),
  });

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campagne WhatsApp Locale</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messaggi a freddo con follow-up automatico. Il ritmo lo impongono i cap dei numeri,
            non la campagna.
          </p>
        </div>
        <Button onClick={() => setCreaAperto(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuova campagna
        </Button>
      </div>

      {/* Capacità: la prima cosa da sapere prima di lanciare qualcosa */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <MessageCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          {connessi.length === 0 ? (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                <strong>Nessun numero collegato.</strong> Le campagne restano ferme finché non
                colleghi almeno un numero da <em>Impostazioni → WhatsApp Locale</em>.
              </span>
            </div>
          ) : (
            <span className="text-sm">
              <strong>{connessi.length}</strong> {connessi.length === 1 ? "numero collegato" : "numeri collegati"} ·
              capacità massima <strong>{capacitaGiorno} messaggi/giorno</strong>
              <span className="text-muted-foreground">
                {" "}— un numero appena collegato invia meno finché il warm-up non lo porta a regime.
              </span>
            </span>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : campagne.length === 0 ? (
        <Card className="p-10 text-center">
          <Send className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">Nessuna campagna</p>
          <p className="text-sm text-muted-foreground mt-1">
            Creane una, carica i destinatari da un filtro sui contatti e avviala.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campagne.map((c) => {
            const badge = STATO_BADGE[c.stato] ?? { label: c.stato, className: "bg-slate-100" };
            const contattati = c.inviati + c.followup_inviati + c.risposti;
            const pct = c.totali > 0 ? Math.round((contattati / c.totali) * 100) : 0;
            const tassoRisposta = contattati > 0 ? Math.round((c.risposti / contattati) * 100) : null;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{c.nome}</span>
                      <Badge className={badge.className} variant="secondary">{badge.label}</Badge>
                      {c.ha_followup && (
                        <Badge variant="outline" className="text-xs">
                          follow-up a {c.followup_dopo_giorni} giorni
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.totali} destinatari · {c.da_inviare} da contattare · {c.inviati} contattati ·{" "}
                      {c.followup_inviati} risollecitati · <strong>{c.risposti} risposte</strong>
                      {tassoRisposta !== null && ` (${tassoRisposta}%)`}
                      {c.saltati > 0 && ` · ${c.saltati} saltati`}
                      {c.falliti > 0 && ` · ${c.falliti} falliti`}
                    </p>
                    {c.totali > 0 && (
                      <div className="mt-2 h-1.5 w-64 max-w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setListaPer(c)}>
                      <Users className="h-4 w-4 mr-1.5" /> Destinatari
                    </Button>
                    {c.stato === "in_corso" ? (
                      <Button variant="outline" size="sm"
                        onClick={() => cambiaStato.mutate({ id: c.id, stato: "in_pausa" })}>
                        <Pause className="h-4 w-4 mr-1.5" /> Pausa
                      </Button>
                    ) : (c.stato === "bozza" || c.stato === "in_pausa") ? (
                      <Button size="sm"
                        disabled={c.da_inviare === 0 && c.inviati === 0}
                        title={c.totali === 0 ? "Carica prima i destinatari" : undefined}
                        onClick={() => cambiaStato.mutate({ id: c.id, stato: "in_corso" })}>
                        <Play className="h-4 w-4 mr-1.5" /> Avvia
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Nuova campagna ── */}
      <Dialog open={creaAperto} onOpenChange={setCreaAperto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova campagna</DialogTitle>
            <DialogDescription>
              Il messaggio supporta le varianti <code>{"{ciao|salve}"}</code> — a ogni invio ne
              esce una a caso, così i messaggi non sono tutti identici.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome campagna</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Imprese edili Veneto — settembre" />
            </div>
            <div>
              <Label htmlFor="msg">Primo messaggio</Label>
              <Textarea id="msg" rows={4} value={messaggio} onChange={(e) => setMessaggio(e.target.value)}
                placeholder="{Ciao|Salve} {{nome}}, ..." />
            </div>
            <div>
              <Label htmlFor="fu">Follow-up (facoltativo)</Label>
              <Textarea id="fu" rows={3} value={followup} onChange={(e) => setFollowup(e.target.value)}
                placeholder="Lascia vuoto per non risollecitare" />
              <p className="text-xs text-muted-foreground mt-1">
                Parte solo verso chi <strong>non ha risposto</strong>.
              </p>
            </div>
            <div>
              <Label htmlFor="fug">Dopo quanti giorni</Label>
              <Input id="fug" type="number" min={1} max={30} value={followupGiorni}
                onChange={(e) => setFollowupGiorni(Number(e.target.value))} className="w-28" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreaAperto(false)}>Annulla</Button>
            <Button disabled={!nome.trim() || !messaggio.trim() || crea.isPending}
              onClick={() => crea.mutate()}>
              {crea.isPending ? "Creo…" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Carica destinatari ── */}
      <Dialog open={!!listaPer} onOpenChange={(o) => !o && setListaPer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Destinatari — {listaPer?.nome}</DialogTitle>
            <DialogDescription>
              Filtra i contatti della piattaforma. Chi è già in lista non viene aggiunto due volte,
              e chi ha chiesto di non essere contattato è sempre escluso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tags">Tag (separati da virgola)</Label>
              <Input id="tags" value={fTags} onChange={(e) => setFTags(e.target.value)}
                placeholder="edilizia, veneto" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="citta">Città</Label>
                <Input id="citta" value={fCitta} onChange={(e) => setFCitta(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="prov">Provincia</Label>
                <Input id="prov" value={fProvincia} onChange={(e) => setFProvincia(e.target.value)}
                  placeholder="VI" />
              </div>
            </div>
            <div>
              <Label htmlFor="lim">Quanti al massimo</Label>
              <Input id="lim" type="number" min={1} value={fLimite}
                onChange={(e) => setFLimite(e.target.value)} placeholder="tutti" className="w-40" />
            </div>

            <Card className="p-3 bg-muted/40">
              <p className="text-sm">
                {anteprimaInCorso ? "Conto…" : (
                  <>
                    <strong>{anteprima ?? 0}</strong> contatti corrispondono.
                    {typeof anteprima === "number" && anteprima > 0 && capacitaGiorno > 0 && (
                      <span className="text-muted-foreground">
                        {" "}Al ritmo attuale servono circa{" "}
                        <strong>{Math.ceil(anteprima / capacitaGiorno)} giorni</strong> per contattarli tutti.
                      </span>
                    )}
                  </>
                )}
              </p>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListaPer(null)}>Annulla</Button>
            <Button disabled={!anteprima || caricaLista.isPending}
              onClick={() => listaPer && caricaLista.mutate(listaPer.id)}>
              {caricaLista.isPending ? "Carico…" : `Aggiungi ${anteprima ?? 0} destinatari`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
