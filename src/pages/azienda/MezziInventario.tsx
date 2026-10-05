/**
 * /azienda/mezzi/inventario — inventario di attrezzi e mezzi con lo scanner.
 *
 * Si avvia un giro (cosa: attrezzature, mezzi o tutto, eventualmente una
 * categoria; dove: ciò che risulta in magazzino, oppure tutto), poi si leggono
 * le etichette una dopo l'altra: lo scanner si riapre da solo. Per i ponteggi e
 * le altre attrezzature a quantità si scrive quanto se n'è contato. A destra
 * quello che manca ancora, e alla chiusura chi manca può diventare una
 * segnalazione «non trovato» per l'ufficio; chi è stato trovato in magazzino ma
 * risultava altrove torna in magazzino anche nei dati.
 *
 * Il conto vero lo fa il database (mezzi_inventario_conta / _chiudi): qui si
 * mostra lo stesso elenco di attesi per vedere a che punto si è.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronRight, CircleDashed, ClipboardCheck, Loader2, Plus, ScanLine, Search, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAnnullaConta, useChiudiInventario, useContaInventario, useCreaInventario, useInventari, useInventario, useMezzi,
  useMezziCategorie, useMezziDisponibilita, type EsitoConta,
} from "@/hooks/useMezzi";
import {
  classeDi, formatData, formatQuantita, giornoItaliano, leggiCodiceScansionato, numeroLetto, oggiIso, unitaBreve,
  type MezzoConAssegnazione, type MezzoDisponibilita, type MezzoInventario,
} from "@/types/mezzi";
import { cn } from "@/lib/utils";

const TUTTE = "__tutte__";

export default function MezziInventario() {
  const { id } = useParams<{ id: string }>();
  return id ? <GiroDiConta id={id} /> : <ElencoInventari />;
}

// ── Elenco e nuovo giro ──────────────────────────────────────────────────────

function ElencoInventari() {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const { data: inventari = [], isLoading } = useInventari();
  const [nuovo, setNuovo] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-4 max-sm:space-y-3">
      <Link to="/azienda/manodopera?tab=mezzi&vista=attrezzature" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Attrezzature
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight max-sm:text-lg">Inventario</h1>
          <p className="text-sm text-muted-foreground max-sm:hidden">
            Leggi le etichette di quello che trovi: alla fine sai cosa manca, e l'ufficio riceve l'elenco.
          </p>
        </div>
        {puoModificare && (
          <Button onClick={() => setNuovo(true)} className="shrink-0 gap-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600">
            <Plus className="h-4 w-4" />Nuovo giro
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : inventari.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground max-sm:py-5">
          <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-40 max-sm:hidden" />
          Nessun inventario fatto finora.
        </div>
      ) : (
        <ul className="space-y-2">
          {inventari.map((i) => (
            <li key={i.id}>
              <Link
                to={`/azienda/mezzi/inventario/${i.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/30"
              >
                <ClipboardCheck className={cn("h-5 w-5 shrink-0", i.chiuso_at ? "text-muted-foreground" : "text-orange-600")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.titolo}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatData(giornoItaliano(i.created_at))} · {i.contati} {i.contati === 1 ? "contato" : "contati"}
                    {i.dove === "magazzino" ? " · in magazzino" : " · ovunque"}
                  </span>
                </span>
                <Badge variant="outline" className={cn("shrink-0 text-[11px]", i.chiuso_at ? "" : "border-orange-200 bg-orange-50 text-orange-800")}>
                  {i.chiuso_at ? "Chiuso" : "In corso"}
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nuovo && <DialogNuovoGiro onClose={() => setNuovo(false)} onCreato={(id) => navigate(`/azienda/mezzi/inventario/${id}`)} />}
    </div>
  );
}

function DialogNuovoGiro({ onClose, onCreato }: { onClose: () => void; onCreato: (id: string) => void }) {
  const crea = useCreaInventario();
  const { data: categorie = [] } = useMezziCategorie();
  const oggi = oggiIso();
  const [titolo, setTitolo] = useState(`Inventario del ${formatData(oggi)}`);
  const [classe, setClasse] = useState<"attrezzatura" | "mezzo" | "tutto">("attrezzatura");
  const [categoria, setCategoria] = useState(TUTTE);
  const [dove, setDove] = useState<MezzoInventario["dove"]>("magazzino");

  const avvia = async () => {
    try {
      const id = await crea.mutateAsync({
        titolo,
        classe: classe === "tutto" ? null : classe,
        categoria_id: classe === "attrezzatura" && categoria !== TUTTE ? categoria : null,
        dove,
      });
      onCreato(id);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo giro di inventario</DialogTitle>
          <DialogDescription>Scegli cosa contare: l'elenco di quello che manca si costruisce da qui.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-titolo">Nome</Label>
            <Input id="inv-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-classe">Cosa</Label>
              <Select value={classe} onValueChange={(v) => setClasse(v as typeof classe)}>
                <SelectTrigger id="inv-classe"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attrezzatura">Attrezzature</SelectItem>
                  <SelectItem value="mezzo">Mezzi</SelectItem>
                  <SelectItem value="tutto">Tutto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-categoria">Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria} disabled={classe !== "attrezzatura"}>
                <SelectTrigger id="inv-categoria"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTE}>Tutte</SelectItem>
                  {categorie.filter((c) => c.classe === "attrezzatura").map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dove</Label>
            <div className="grid grid-cols-1 gap-2">
              {([
                ["magazzino", "In magazzino", "Si aspetta solo quello che risulta in magazzino (non in cantiere, non in carico a qualcuno)."],
                ["ovunque", "Ovunque", "Si aspetta tutto: per un giro dei cantieri, o per un controllo completo."],
              ] as const).map(([v, label, testo]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDove(v)}
                  aria-pressed={dove === v}
                  className={cn("rounded-lg border px-3 py-2 text-left transition-colors", dove === v ? "border-orange-400 bg-orange-50" : "hover:bg-muted/50")}
                >
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{testo}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={avvia} disabled={!titolo.trim() || crea.isPending}>
            {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Inizia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Il giro di conta ─────────────────────────────────────────────────────────

/** Gli attesi come li calcola il database (_mezzi_inventario_atteso). */
function attesi(
  inv: MezzoInventario,
  mezzi: MezzoConAssegnazione[],
  disponibilita: Map<string, MezzoDisponibilita> | undefined,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const m of mezzi) {
    const classe = m.classe ?? classeDi(m.tipo);
    if (inv.classe && classe !== inv.classe) continue;
    if (inv.categoria_id && m.categoria_id !== inv.categoria_id) continue;
    if (m.gestione === "quantita") {
      const d = disponibilita?.get(m.id);
      const totale = Number(m.quantita_totale ?? 0);
      const libero = d ? d.disponibile : totale;
      if (inv.dove === "magazzino") {
        if (libero > 0) out.set(m.id, libero);
      } else {
        out.set(m.id, totale);
      }
      continue;
    }
    if (inv.dove === "ovunque") {
      out.set(m.id, null);
    } else if (m.stato !== "in_officina" && !m.assegnato_order_id && !m.assegnato_hr_profilo_id && !m.su_mezzo_id) {
      out.set(m.id, null);
    }
  }
  return out;
}

function GiroDiConta({ id }: { id: string }) {
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const { data, isLoading, error, refetch } = useInventario(id);
  const { data: mezzi = [] } = useMezzi();
  const { data: disponibilita } = useMezziDisponibilita();
  const conta = useContaInventario(id);
  const annulla = useAnnullaConta(id);
  const [scanner, setScanner] = useState(false);
  const [continua, setContinua] = useState(true);
  const [cerca, setCerca] = useState("");
  // daScanner: finita la conta si riapre la fotocamera solo se si stava scansionando.
  const [chiedi, setChiedi] = useState<{ mezzoId: string; nome: string; unita: string | null; atteso: number | null; daScanner: boolean } | null>(null);
  const [chiusura, setChiusura] = useState(false);
  const [ultimo, setUltimo] = useState<{ testo: string; tono: "ok" | "info" | "errore" } | null>(null);
  const riaprire = useRef<number | null>(null);

  const inv = data?.inventario ?? null;
  const conte = useMemo(() => data?.conte ?? [], [data]);
  const aperto = !!inv && !inv.chiuso_at && puoModificare;
  const perId = useMemo(() => new Map(mezzi.map((m) => [m.id, m])), [mezzi]);
  const contati = useMemo(() => new Map(conte.map((c) => [c.mezzo_id, c])), [conte]);
  const attesiMap = useMemo(() => (inv ? attesi(inv, mezzi, disponibilita) : new Map<string, number | null>()), [inv, mezzi, disponibilita]);

  const daTrovare = [...attesiMap.keys()].filter((mid) => !contati.has(mid)).map((mid) => perId.get(mid)!).filter(Boolean);
  const trovati = conte.filter((c) => attesiMap.has(c.mezzo_id));
  const fuoriElenco = conte.filter((c) => !attesiMap.has(c.mezzo_id));
  const percentuale = attesiMap.size ? Math.round((trovati.length / attesiMap.size) * 100) : 0;

  const riapriScanner = useCallback(() => {
    if (!continua) return;
    if (riaprire.current) window.clearTimeout(riaprire.current);
    riaprire.current = window.setTimeout(() => setScanner(true), 700);
  }, [continua]);

  const esito = useCallback((r: EsitoConta, nome: string) => {
    if (r.esito === "sconosciuto") {
      setUltimo({ testo: `${r.codice ?? "Codice"}: non è un attrezzo dell'azienda.`, tono: "errore" });
    } else if (r.esito === "gia_contato") {
      setUltimo({ testo: `${nome}: già contato.`, tono: "info" });
    } else {
      setUltimo({
        testo: `${nome}: ${r.esito === "aggiornato" ? "quantità corretta" : "trovato"}${r.atteso === false ? " (non era nell'elenco: risultava altrove)" : ""}.`,
        tono: r.atteso === false ? "info" : "ok",
      });
    }
  }, []);

  const letto = useCallback(
    async (testo: string) => {
      const c = leggiCodiceScansionato(testo);
      if (!c) {
        setUltimo({ testo: "Non riconosco questo codice.", tono: "errore" });
        riapriScanner();
        return;
      }
      try {
        const r = await conta.mutateAsync({ codice: c.codice });
        const nome = r.mezzo?.nome ?? c.codice;
        // Un ponteggio a quantità: prima di andare avanti, quanto se n'è contato.
        if (r.mezzo && r.mezzo.gestione === "quantita" && r.esito === "contato") {
          setChiedi({ mezzoId: r.mezzo.id, nome, unita: r.mezzo.unita_misura, atteso: attesiMap.get(r.mezzo.id) ?? null, daScanner: true });
          return;
        }
        esito(r, nome);
        riapriScanner();
      } catch {
        riapriScanner();
      }
    },
    [conta, esito, riapriScanner, attesiMap],
  );

  // Allo scanner va una funzione che non cambia: se cambiasse a ogni rendering,
  // la fotocamera si spegnerebbe e riaccenderebbe mentre si inquadra.
  const lettoRef = useRef<(testo: string) => Promise<void>>(letto);
  useEffect(() => {
    lettoRef.current = letto;
  }, [letto]);
  const suLettura = useCallback((t: string): void => {
    void lettoRef.current(t);
  }, []);

  const segnaAMano = async (m: MezzoConAssegnazione) => {
    if (m.gestione === "quantita") {
      setChiedi({ mezzoId: m.id, nome: m.nome, unita: m.unita_misura ?? null, atteso: attesiMap.get(m.id) ?? null, daScanner: false });
      return;
    }
    try {
      const r = await conta.mutateAsync({ mezzoId: m.id });
      esito(r, m.nome);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  const cercati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return daTrovare;
    return daTrovare.filter((m) => [m.nome, m.codice, m.marca, m.modello].some((v) => v?.toLowerCase().includes(q)));
  }, [cerca, daTrovare]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !inv) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{error ? "Non riesco a caricare l'inventario." : "Questo inventario non c'è."}</p>
        <div className="flex justify-center gap-2">
          {error && <Button variant="outline" onClick={() => refetch()}>Riprova</Button>}
          <Button asChild><Link to="/azienda/mezzi/inventario">Inventari</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24 max-sm:space-y-3">
      <Link to="/azienda/mezzi/inventario" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Inventari
      </Link>

      <div className="rounded-2xl border bg-card p-4 max-sm:p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight max-sm:text-base">{inv.titolo}</h1>
            <p className="text-sm text-muted-foreground max-sm:text-xs">
              {inv.classe === "attrezzatura" ? "Attrezzature" : inv.classe === "mezzo" ? "Mezzi" : "Mezzi e attrezzature"}
              {inv.dove === "magazzino" ? " · in magazzino" : " · ovunque"}
              {inv.chiuso_at ? ` · chiuso il ${formatData(giornoItaliano(inv.chiuso_at))}` : ""}
            </p>
          </div>
          {aperto && (
            <Button variant="outline" onClick={() => setChiusura(true)} className="shrink-0">Chiudi il giro</Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={percentuale} className="h-2 flex-1 bg-slate-100" indicatorClassName="bg-emerald-500" aria-label={`${percentuale}% trovato`} />
          <span className="shrink-0 text-sm font-medium tabular-nums">{trovati.length} / {attesiMap.size}</span>
        </div>
      </div>

      {aperto && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button onClick={() => setScanner(true)} className="h-12 flex-1 gap-2 text-base" disabled={conta.isPending}>
              {conta.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
              Scansiona
            </Button>
            <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={continua} onCheckedChange={(c) => setContinua(!!c)} />
              <span>Una dopo l'altra</span>
            </label>
          </div>
          {ultimo && (
            <p
              role="status"
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                ultimo.tono === "ok" && "bg-emerald-50 text-emerald-800",
                ultimo.tono === "info" && "bg-amber-50 text-amber-900",
                ultimo.tono === "errore" && "bg-red-50 text-red-800",
              )}
            >
              {ultimo.testo}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-2" aria-labelledby="da-trovare">
          <h2 id="da-trovare" className="flex items-center gap-2 text-sm font-semibold">
            <CircleDashed className="h-4 w-4 text-amber-600" />Da trovare ({daTrovare.length})
          </h2>
          {daTrovare.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per segnarlo a mano" className="pl-9" aria-label="Cerca tra quelli da trovare" />
            </div>
          )}
          {daTrovare.length === 0 ? (
            <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Trovato tutto.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {cercati.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[m.codice, m.gestione === "quantita" ? `attesi ${formatQuantita(attesiMap.get(m.id) ?? 0, m.unita_misura)}` : null,
                        m.assegnato_commessa ?? m.assegnato_persona ?? (m.su_mezzo_nome ? `su ${m.su_mezzo_nome}` : null)]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {aperto && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => segnaAMano(m)} disabled={conta.isPending} title="Trovato, senza etichetta">
                      Trovato
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="trovati">
          <h2 id="trovati" className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />Trovati ({trovati.length + fuoriElenco.length})
          </h2>
          {trovati.length + fuoriElenco.length === 0 ? (
            <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Ancora niente.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {[...fuoriElenco, ...trovati].map((c) => {
                const m = perId.get(c.mezzo_id);
                const fuori = !attesiMap.has(c.mezzo_id);
                const atteso = attesiMap.get(c.mezzo_id) ?? null;
                const manca = m?.gestione === "quantita" && atteso != null && c.quantita != null && c.quantita < atteso;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m?.nome ?? "Attrezzo"}</span>
                      <span className={cn("block truncate text-xs", fuori || manca ? "text-amber-700" : "text-muted-foreground")}>
                        {[
                          m?.codice,
                          c.quantita != null ? `contati ${formatQuantita(c.quantita, m?.unita_misura)}${atteso != null ? ` su ${formatQuantita(atteso, m?.unita_misura)}` : ""}` : null,
                          fuori ? `non atteso: risultava ${m?.assegnato_commessa ?? m?.assegnato_persona ?? (m?.su_mezzo_nome ? `su ${m.su_mezzo_nome}` : "altrove")}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {aperto && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => annulla.mutate(c.id)} aria-label={`Togli ${m?.nome ?? "la conta"}`} title="Togli (contato per sbaglio)">
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <BarcodeScanner open={scanner} onOpenChange={setScanner} onScan={suLettura} />

      {chiedi && (
        <DialogQuantita
          {...chiedi}
          onClose={() => setChiedi(null)}
          onConferma={async (q) => {
            try {
              const r = await conta.mutateAsync({ mezzoId: chiedi.mezzoId, quantita: q });
              esito(r.esito === "gia_contato" ? { ...r, esito: "aggiornato" } : r, chiedi.nome);
              setChiedi(null);
              if (chiedi.daScanner) riapriScanner();
            } catch {
              // l'errore lo mostra la mutation
            }
          }}
          inAttesa={conta.isPending}
        />
      )}

      {chiusura && inv && (
        <DialogChiusura
          inventarioId={inv.id}
          dove={inv.dove}
          mancanti={daTrovare.length + trovati.filter((c) => {
            const m = perId.get(c.mezzo_id);
            const atteso = attesiMap.get(c.mezzo_id) ?? null;
            return m?.gestione === "quantita" && atteso != null && (c.quantita ?? 0) < atteso;
          }).length}
          altrove={fuoriElenco.filter((c) => {
            const m = perId.get(c.mezzo_id);
            return m && m.gestione !== "quantita" && (m.assegnato_order_id || m.assegnato_hr_profilo_id || m.su_mezzo_id)
              && !["furgone", "autocarro", "autovettura"].includes(m.tipo);
          }).length}
          onClose={() => setChiusura(false)}
        />
      )}
    </div>
  );
}

function DialogQuantita({ nome, unita, atteso, onClose, onConferma, inAttesa }: {
  nome: string; unita: string | null; atteso: number | null; onClose: () => void; onConferma: (q: number) => void; inAttesa: boolean;
}) {
  const [valore, setValore] = useState(atteso != null ? String(atteso).replace(".", ",") : "");
  const n = numeroLetto(valore);
  const valido = n != null && n >= 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quanti ne hai contati?</DialogTitle>
          <DialogDescription>
            {nome}{atteso != null ? ` · dovrebbero essercene ${formatQuantita(atteso, unita)}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="conta-quantita">{unitaBreve(unita) || "Quantità"}</Label>
          <Input id="conta-quantita" inputMode="decimal" value={valore} onChange={(e) => setValore(e.target.value)} className="h-12 text-lg" autoFocus />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => valido && onConferma(n!)} disabled={!valido || inAttesa}>
            {inAttesa && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogChiusura({ inventarioId, dove, mancanti, altrove, onClose }: {
  inventarioId: string; dove: MezzoInventario["dove"]; mancanti: number; altrove: number; onClose: () => void;
}) {
  const chiudi = useChiudiInventario(inventarioId);
  const [segnala, setSegnala] = useState(mancanti > 0);
  const [riporta, setRiporta] = useState(dove === "magazzino" && altrove > 0);

  const conferma = async () => {
    try {
      await chiudi.mutateAsync({ segnalaMancanti: segnala, riportaInMagazzino: riporta });
      onClose();
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chiudere il giro?</DialogTitle>
          <DialogDescription>Dopo non si possono più aggiungere conte.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mancanti > 0 ? (
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={segnala} onCheckedChange={(c) => setSegnala(!!c)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Segnala all'ufficio i {mancanti} che mancano</span>
                <span className="block text-xs text-muted-foreground">Una segnalazione «non si trova» per ciascuno (per i ponteggi, la quantità che manca).</span>
              </span>
            </label>
          ) : (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />Non manca niente.
            </p>
          )}
          {dove === "magazzino" && altrove > 0 && (
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={riporta} onCheckedChange={(c) => setRiporta(!!c)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Segna in magazzino i {altrove} trovati qui</span>
                <span className="block text-xs text-muted-foreground">Risultavano in cantiere o in carico a qualcuno: si aggiorna dove sono.</span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={conferma} disabled={chiudi.isPending}>
            {chiudi.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Chiudi il giro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
