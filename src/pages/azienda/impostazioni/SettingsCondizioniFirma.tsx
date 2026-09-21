/**
 * SettingsCondizioniFirma — cosa il cliente deve accettare quando firma un preventivo.
 *
 * Ogni impresa ha il suo contratto: qui decide con parole sue le clausole che
 * il cliente approva a parte (vessatorie, art. 1341 c.c. c.2) e può riscrivere
 * i testi informativi che mostriamo al momento della firma.
 *
 * REGOLA: se non configura nulla, al cliente non viene fatta approvare nessuna
 * clausola vessatoria e restano i testi di sistema. Le clausole tipo qui sotto
 * sono una PROPOSTA da adattare, non un default che scatta da solo.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ETICHETTA_CATEGORIA,
  CATEGORIE_CLAUSOLA,
  useQuoteClauses,
  type CategoriaClausola,
  type QuoteClause,
  type TipoLegale,
} from "@/hooks/useQuoteClauses";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Gavel, Plus, Trash2, ShieldAlert, FileSignature, Info, Sparkles } from "lucide-react";
import {
  CLAUSOLE_VESSATORIE_TIPO,
  testoCondizioni,
  testoInizioAnticipato,
  testoPrivacy,
  testoRecesso,
} from "../../../../supabase/functions/_shared/quoteLegal";

/** Categoria consigliata per ciascuna clausola tipo proposta. */
const CATEGORIA_PER_CODICE: Record<string, CategoriaClausola> = {
  foro: "custom",
  limite_responsabilita: "exclusions",
  penale_ritardo: "penalties",
  decadenza_vizi: "warranty",
  recesso_azienda: "cancellation",
};

const TESTI_DI_SISTEMA: Record<TipoLegale, { titolo: string; aiuto: string; testo: string }> = {
  condizioni: {
    titolo: "Accettazione delle condizioni",
    aiuto: "La spunta con cui il cliente accetta le condizioni della tua offerta.",
    testo: testoCondizioni(),
  },
  privacy: {
    titolo: "Informativa privacy",
    aiuto: "Come tratti i dati del cliente per eseguire il contratto.",
    testo: testoPrivacy(),
  },
  recesso: {
    titolo: "Diritto di ripensamento",
    aiuto:
      "I 14 giorni previsti per i clienti privati. Se non dai l'informativa, per legge il termine si allunga a 12 mesi.",
    testo: testoRecesso(),
  },
  inizio_anticipato: {
    titolo: "Richiesta di iniziare subito",
    aiuto: "Serve se il cliente vuole che i lavori partano prima dei 14 giorni.",
    testo: testoInizioAnticipato(),
  },
};

export default function SettingsCondizioniFirma() {
  const permissions = usePermissions();
  // La pagina si apre con «Vedi» su Listino & prezzi (route in companyRoutes.tsx),
  // ma modificare le clausole serve «Modifica»: prima usava lo stesso permesso
  // della vista, e chi aveva solo «Vedi» trovava i campi attivi ma il
  // salvataggio veniva rifiutato dal database (21/09/2026).
  const puoModificare = permissions.isAdmin || permissions.canEditSettingsPricing;
  const { vessatorie, testiLegali, isLoading, error, salva, elimina } = useQuoteClauses();

  const [bozza, setBozza] = useState<Record<string, Partial<QuoteClause>>>({});
  const patch = useCallback((id: string, campi: Partial<QuoteClause>) => {
    setBozza((prev) => ({ ...prev, [id]: { ...prev[id], ...campi } }));
  }, []);
  const valore = useCallback(
    <K extends keyof QuoteClause>(c: QuoteClause, campo: K): QuoteClause[K] =>
      (bozza[c.id]?.[campo] ?? c[campo]) as QuoteClause[K],
    [bozza],
  );

  const salvaRiga = useCallback(
    async (c: QuoteClause) => {
      const modifiche = bozza[c.id];
      if (!modifiche) return;
      try {
        await salva.mutateAsync({ id: c.id, ...modifiche });
        setBozza((prev) => {
          const { [c.id]: _rimossa, ...resto } = prev;
          return resto;
        });
        toast.success("Clausola salvata");
      } catch (e) {
        toast.error("Non sono riuscito a salvare la clausola", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [bozza, salva],
  );

  const aggiungiVessatoria = useCallback(async () => {
    try {
      await salva.mutateAsync({
        title: "Nuova clausola da approvare",
        content: "",
        category: "custom",
        active: true,
        sort_order: (vessatorie.length + 1) * 10,
        applicable_to: { vessatoria: true },
      });
      toast.success("Clausola aggiunta", { description: "Scrivi il testo e salvala." });
    } catch (e) {
      toast.error("Non sono riuscito ad aggiungere la clausola", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [salva, vessatorie.length]);

  /** Propone le clausole tipo dell'appalto edile: l'azienda le adatta e decide se tenerle. */
  const proponiTipo = useCallback(async () => {
    const giaPresenti = new Set(vessatorie.map((c) => c.title.trim().toLowerCase()));
    const daCreare = CLAUSOLE_VESSATORIE_TIPO.filter(
      (t) => !giaPresenti.has(t.titolo.trim().toLowerCase()),
    );
    if (daCreare.length === 0) {
      toast.info("Le clausole tipo sono già tutte presenti");
      return;
    }
    try {
      for (const [i, t] of daCreare.entries()) {
        await salva.mutateAsync({
          title: t.titolo,
          content: t.testo,
          category: CATEGORIA_PER_CODICE[t.codice] ?? "custom",
          active: false, // disattive finché l'azienda non le rilegge e le attiva
          sort_order: (vessatorie.length + i + 1) * 10,
          applicable_to: { vessatoria: true },
        });
      }
      toast.success(`${daCreare.length} clausole proposte`, {
        description: "Sono disattive: rileggile, adattale al tuo contratto e attivale.",
      });
    } catch (e) {
      toast.error("Non sono riuscito a creare le clausole proposte", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [salva, vessatorie]);

  const rimuovi = useCallback(
    async (c: QuoteClause) => {
      try {
        await elimina.mutateAsync(c.id);
        toast.success("Clausola eliminata");
      } catch (e) {
        toast.error("Non sono riuscito a eliminare la clausola", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [elimina],
  );

  const testoPersonalizzato = useMemo(() => {
    const mappa = new Map<TipoLegale, QuoteClause>();
    for (const c of testiLegali) {
      const tipo = c.applicable_to?.tipo_legale;
      if (tipo) mappa.set(tipo, c);
    }
    return mappa;
  }, [testiLegali]);

  const salvaTesto = useCallback(
    async (tipo: TipoLegale, testo: string) => {
      const esistente = testoPersonalizzato.get(tipo);
      const pulito = testo.trim();
      try {
        if (esistente && !pulito) {
          await elimina.mutateAsync(esistente.id);
          toast.success("Testo ripristinato a quello di sistema");
          return;
        }
        if (!pulito) return;
        await salva.mutateAsync({
          id: esistente?.id,
          title: TESTI_DI_SISTEMA[tipo].titolo,
          content: pulito,
          category: tipo === "recesso" || tipo === "inizio_anticipato" ? "cancellation" : "custom",
          active: true,
          sort_order: 900,
          applicable_to: { tipo_legale: tipo },
        });
        toast.success("Testo salvato");
      } catch (e) {
        toast.error("Non sono riuscito a salvare il testo", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [elimina, salva, testoPersonalizzato],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">
            Non sono riuscito a caricare le clausole contrattuali.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>Riprova</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Gavel className="mt-0.5 h-5 w-5 text-amber-600" />
        <div>
          <h1 className="text-lg font-semibold">Condizioni e firma dei preventivi</h1>
          <p className="text-sm text-muted-foreground">
            Decidi cosa il cliente accetta quando firma online. Vale per tutti i preventivi della tua azienda.
          </p>
        </div>
      </div>

      {/* ── Clausole da approvare a parte ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Clausole da approvare a parte
              </CardTitle>
              <CardDescription>
                Penali, limiti di responsabilità, decadenze e foro competente valgono solo se il cliente
                le approva con una spunta dedicata (art. 1341 c.c.). Quelle attive qui compaiono nella
                pagina di firma.
              </CardDescription>
            </div>
            {puoModificare && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={proponiTipo} disabled={salva.isPending}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Proponi clausole tipo
                </Button>
                <Button size="sm" onClick={aggiungiVessatoria} disabled={salva.isPending}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Aggiungi
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vessatorie.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Nessuna clausola da approvare</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Il cliente firmerà accettando condizioni e privacy. Se il tuo contratto ha penali o
                limiti di responsabilità, aggiungili qui: altrimenti non sono opponibili.
              </p>
              {puoModificare && (
                <Button variant="outline" size="sm" className="mt-3" onClick={proponiTipo}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Parti dalle clausole tipo
                </Button>
              )}
            </div>
          ) : (
            vessatorie.map((c) => {
              const modificata = !!bozza[c.id];
              return (
                <div key={c.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      value={String(valore(c, "title") ?? "")}
                      onChange={(e) => patch(c.id, { title: e.target.value })}
                      disabled={!puoModificare}
                      className="h-9 max-w-sm flex-1 font-medium"
                      aria-label="Titolo della clausola"
                    />
                    <Select
                      value={String(valore(c, "category") ?? "custom")}
                      onValueChange={(v) => patch(c.id, { category: v as CategoriaClausola })}
                      disabled={!puoModificare}
                    >
                      <SelectTrigger className="h-9 w-[230px]" aria-label="Tipo di clausola">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIE_CLAUSOLA.map((cat) => (
                          <SelectItem key={cat} value={cat}>{ETICHETTA_CATEGORIA[cat]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`attiva-${c.id}`}
                        checked={!!valore(c, "active")}
                        onCheckedChange={(v) => patch(c.id, { active: v })}
                        disabled={!puoModificare}
                      />
                      <Label htmlFor={`attiva-${c.id}`} className="text-xs text-muted-foreground">
                        {valore(c, "active") ? "Mostrata al cliente" : "Non mostrata"}
                      </Label>
                    </div>
                  </div>
                  <Textarea
                    value={String(valore(c, "content") ?? "")}
                    onChange={(e) => patch(c.id, { content: e.target.value })}
                    disabled={!puoModificare}
                    rows={3}
                    placeholder="Scrivi la clausola come compare nel tuo contratto…"
                    aria-label="Testo della clausola"
                  />
                  {!String(valore(c, "content") ?? "").trim() && (
                    <p className="text-xs text-amber-700">
                      Senza testo la clausola non viene mostrata al cliente.
                    </p>
                  )}
                  {puoModificare && (
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rimuovi(c)}
                        disabled={elimina.isPending}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Elimina
                      </Button>
                      <Button size="sm" onClick={() => salvaRiga(c)} disabled={!modificata || salva.isPending}>
                        {modificata ? "Salva modifiche" : "Salvata"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Testi mostrati al momento della firma ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-blue-600" />
            Testi mostrati al momento della firma
          </CardTitle>
          <CardDescription>
            Puoi riscriverli con parole tue. Se lasci il campo vuoto usiamo il testo di sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(Object.keys(TESTI_DI_SISTEMA) as TipoLegale[]).map((tipo) => (
            <TestoLegaleEditor
              key={tipo}
              tipo={tipo}
              personalizzato={testoPersonalizzato.get(tipo)?.content ?? ""}
              disabilitato={!puoModificare || salva.isPending}
              onSalva={(testo) => salvaTesto(tipo, testo)}
            />
          ))}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Di ogni firma conserviamo il testo esatto che il cliente ha letto, con data, ora, indirizzo IP e
        impronta del documento: se il preventivo viene modificato dopo, l'impronta lo dimostra.
      </p>
    </div>
  );
}

/** Editor di un singolo testo informativo, con confronto sul testo di sistema. */
function TestoLegaleEditor({
  tipo,
  personalizzato,
  disabilitato,
  onSalva,
}: {
  tipo: TipoLegale;
  personalizzato: string;
  disabilitato: boolean;
  onSalva: (testo: string) => void;
}) {
  const meta = TESTI_DI_SISTEMA[tipo];
  const [testo, setTesto] = useState(personalizzato);
  // Il valore arriva dal server: se cambia sotto (salvataggio, refetch) riallineo.
  const [ultimoDalServer, setUltimoDalServer] = useState(personalizzato);
  if (personalizzato !== ultimoDalServer) {
    setUltimoDalServer(personalizzato);
    setTesto(personalizzato);
  }

  const modificato = testo.trim() !== personalizzato.trim();
  const usaSistema = !personalizzato.trim();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-medium">{meta.titolo}</Label>
        <Badge variant={usaSistema ? "secondary" : "default"} className="text-[10px] font-normal">
          {usaSistema ? "testo di sistema" : "testo tuo"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{meta.aiuto}</p>
      <Textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        disabled={disabilitato}
        rows={3}
        placeholder={meta.testo}
        aria-label={meta.titolo}
      />
      {!disabilitato && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onSalva(testo)} disabled={!modificato}>
            {modificato ? "Salva testo" : "Salvato"}
          </Button>
          {!usaSistema && (
            <Button variant="ghost" size="sm" onClick={() => { setTesto(""); onSalva(""); }}>
              Torna al testo di sistema
            </Button>
          )}
          {usaSistema && (
            <Button variant="ghost" size="sm" onClick={() => setTesto(meta.testo)}>
              Parti dal testo di sistema
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
