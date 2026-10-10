/**
 * SettingsCondizioniFirma — cosa il cliente deve accettare quando firma un preventivo dal link.
 *
 * Ogni impresa ha il suo contratto: qui decide con parole sue le clausole che
 * il cliente approva a parte (vessatorie, art. 1341 c.c. c.2) e può riscrivere
 * i testi informativi che mostriamo al momento della firma.
 *
 * VALE per i preventivi che il cliente firma dal link del preventivo (`quote-sign`): il preventivo generico e i
 * preventivatori (serramenti, bagni, tetti, ristrutturazioni…). NON vale per il preventivo fotovoltaico, gli ordini e i
 * documenti di cantiere: si firmano con il codice (`fea-documento-pubblico`) e leggono altro
 * (`fea_configurazione`, condizioni standard del settore: `_shared/clausoleFirma.ts`).
 *
 * REGOLA: se non configura nulla, al cliente non viene fatta approvare nessuna
 * clausola vessatoria e restano i testi di sistema. Le clausole tipo qui sotto
 * sono una PROPOSTA da adattare, non un default che scatta da solo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ETICHETTA_CATEGORIA,
  CATEGORIE_CLAUSOLA,
  useQuoteClauses,
  type CategoriaClausola,
  type QuoteClause,
  type TipoLegale,
} from "@/hooks/useQuoteClauses";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { queryKeys } from "@/lib/queryKeys";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const queryClient = useQueryClient();

  const [bozza, setBozza] = useState<Record<string, Partial<QuoteClause>>>({});
  // Quale dei quattro testi informativi ha una modifica non salvata (lo dice ciascun editor).
  const [testiModificati, setTestiModificati] = useState<Partial<Record<TipoLegale, boolean>>>({});
  const segnaTestoModificato = useCallback((tipo: TipoLegale, modificato: boolean) => {
    setTestiModificati((prev) => (!!prev[tipo] === modificato ? prev : { ...prev, [tipo]: modificato }));
  }, []);
  // Ricaricamento e link interni chiedono conferma se c'è del testo scritto e non salvato.
  useSettingsDraftGuard(Object.keys(bozza).length > 0 || Object.values(testiModificati).some(Boolean));
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
        toast.error("Non sono riuscito a salvare la clausola", { description: userErrorMessage(e) });
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
      toast.error("Non sono riuscito ad aggiungere la clausola", { description: userErrorMessage(e) });
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
      toast.error("Non sono riuscito a creare le clausole proposte", { description: userErrorMessage(e) });
    }
  }, [salva, vessatorie]);

  const rimuovi = useCallback(
    async (c: QuoteClause) => {
      try {
        await elimina.mutateAsync(c.id);
        toast.success("Clausola eliminata");
      } catch (e) {
        toast.error("Non sono riuscito a eliminare la clausola", { description: userErrorMessage(e) });
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
        toast.error("Non sono riuscito a salvare il testo", { description: userErrorMessage(e) });
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
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.quoteClauses.all })}>
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {!puoModificare && (
        <Alert>
          <AlertDescription>
            Stai consultando le condizioni: le cambia chi ha il permesso «Listino &amp; Prezzi» in modifica.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-3">
        <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Decidi cosa accetta il cliente quando firma un preventivo dal link che riceve. Vale per il preventivo
            generico e per i preventivatori (serramenti, bagni, tetti, ristrutturazioni…).
          </p>
          <p>
            Il preventivo fotovoltaico, gli ordini e i documenti di cantiere si firmano con il codice e non leggono queste
            clausole: il loro testo sul diritto di ripensamento si scrive in{" "}
            <Link to="/azienda/impostazioni/firma-elettronica#ripensamento" className="text-primary underline">
              Firma elettronica
            </Link>
            .
          </p>
        </div>
      </div>

      {/* ── Clausole da approvare a parte ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
                <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Clausole da approvare a parte
              </h2>
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
                      className="h-9 min-w-[14rem] max-w-sm flex-1 font-medium"
                      aria-label="Titolo della clausola"
                    />
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
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1">Altre opzioni</summary>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Label htmlFor={`tipo-${c.id}`} className="text-xs">Tipo di clausola</Label>
                      <Select
                        value={String(valore(c, "category") ?? "custom")}
                        onValueChange={(v) => patch(c.id, { category: v as CategoriaClausola })}
                        disabled={!puoModificare}
                      >
                        <SelectTrigger id={`tipo-${c.id}`} className="h-9 w-[230px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIE_CLAUSOLA.map((cat) => (
                            <SelectItem key={cat} value={cat}>{ETICHETTA_CATEGORIA[cat]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="basis-full">Un'etichetta per tenere in ordine le clausole: il cliente non la vede.</p>
                    </div>
                  </details>
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
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <FileSignature className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Testi mostrati al momento della firma
          </h2>
          <CardDescription>
            Puoi riscriverli con parole tue. Se lasci il campo vuoto usiamo il testo di sistema. Valgono per i preventivi
            firmati dal link.
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
              onModificato={segnaTestoModificato}
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
  onModificato,
}: {
  tipo: TipoLegale;
  personalizzato: string;
  disabilitato: boolean;
  onSalva: (testo: string) => void;
  /** Dice alla pagina se c'è testo scritto e non salvato (per avvisare prima di uscire). Deve essere stabile. */
  onModificato: (tipo: TipoLegale, modificato: boolean) => void;
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
  useEffect(() => { onModificato(tipo, modificato); }, [tipo, modificato, onModificato]);
  useEffect(() => () => onModificato(tipo, false), [tipo, onModificato]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`testo-${tipo}`} className="text-sm font-medium">{meta.titolo}</Label>
        <Badge variant={usaSistema ? "secondary" : "default"} className="text-[10px] font-normal">
          {usaSistema ? "testo di sistema" : "testo tuo"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{meta.aiuto}</p>
      <Textarea
        id={`testo-${tipo}`}
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        disabled={disabilitato}
        rows={3}
        placeholder={meta.testo}
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
