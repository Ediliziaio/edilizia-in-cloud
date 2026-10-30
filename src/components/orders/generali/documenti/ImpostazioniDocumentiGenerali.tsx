// src/components/orders/generali/documenti/ImpostazioniDocumentiGenerali.tsx
// Impostazioni → Cartelle documenti, sezione «Documenti richiesti nelle commesse generali»:
// l'elenco di partenza di ogni tipo acceso, che l'azienda cambia (dove va, se è obbligatorio,
// se scade), accorcia (toglie quello che non usa) o allunga (voci sue). Ogni modifica si salva
// subito. Compare solo se l'azienda ha acceso almeno un tipo di commessa generale.
import { useState } from "react";
import { Loader2, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { messaggioDocumenti, useModificaVoceDocumento, useVociDocumentiAzienda, type ModificaVoce } from "@/hooks/useGeneraleDocumenti";
import { usePermissions } from "@/hooks/usePermissions";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { etichettaAmbito, vociDelModello, type AmbitoVoce, type VoceDocumento } from "@/lib/orders/generali/documenti";

export function ImpostazioniDocumentiGenerali() {
  const { modelli } = useImpostazioniCommesseGenerali();
  if (modelli.length === 0) return null;
  return <Elenco modelli={modelli} />;
}

function Elenco({ modelli }: { modelli: ModelloGenerale[] }) {
  const permissions = usePermissions();
  const { righe, isLoading, isError, refetch } = useVociDocumentiAzienda();
  const modifica = useModificaVoceDocumento();
  const [scelto, setScelto] = useState<ModelloGenerale>(modelli[0]);
  const modello = modelli.includes(scelto) ? scelto : modelli[0];
  const [nuova, setNuova] = useState("");
  const [ambitoNuova, setAmbitoNuova] = useState<AmbitoVoce>("generale");
  const canEdit = !permissions.isLoading && Boolean(permissions.isAdmin || permissions.canEditSettingsOrders) && !isLoading && !isError;
  const busy = modifica.isPending;

  const voci = vociDelModello(modello, righe);
  const attive = voci.filter((v) => !v.tolta);
  const tolte = voci.filter((v) => v.tolta);

  const salva = (m: ModificaVoce, fatto?: string, dopo?: () => void) => {
    if (!canEdit || busy) return;
    modifica.mutate(m, {
      onSuccess: () => { if (fatto) toast.success(fatto); dopo?.(); },
      onError: (e) => toast.error("Modifica non salvata", { description: messaggioDocumenti(e, "Riprova tra poco.") }),
    });
  };
  const cambia = (v: VoceDocumento, patch: Extract<ModificaVoce, { tipo: "cambia" }>["patch"], fatto?: string) =>
    salva({ tipo: "cambia", modello, chiave: v.id, patch }, fatto);
  const aggiungi = () => {
    if (!nuova.trim()) return;
    salva(
      { tipo: "aggiungi", modello, nome: nuova, ambito: ambitoNuova, obbligatoria: true, conScadenza: false },
      `«${nuova.trim()}» aggiunto`,
      () => setNuova(""),
    );
  };

  return (
    <SezioneImpostazione
      id="documenti-generali"
      titolo="Documenti richiesti nelle commesse generali"
      descrizione="La checklist della scheda Documenti di ogni commessa generale. Un file caricato nella generale o in una sua commessa spunta la voce giusta."
      ambito={<Badge variant="secondary">{attive.length} voci</Badge>}
      azione={busy ? <span role="status" className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Salvataggio…</span> : <span>Si salva subito</span>}
    >
      {modelli.length > 1 && (
        <div className="px-4 py-2.5">
          <Tabs value={modello} onValueChange={(v) => setScelto(v as ModelloGenerale)}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              {modelli.map((m) => <TabsTrigger key={m} value={m}>{DEFINIZIONI_MODELLI[m].nome}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>
      )}

      {isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm text-destructive">
          Non riesco a leggere le scelte dell'azienda: nessuna modifica verrà salvata.
          <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
        </div>
      ) : (
        <div className="px-4 py-3">
          <table className="block w-full text-sm md:table">
            <caption className="sr-only">Documenti richiesti per {DEFINIZIONI_MODELLI[modello].nome}</caption>
            <thead className="hidden md:table-header-group">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-2 text-left font-medium">Documento</th>
                <th className="px-2 py-2 text-left font-medium">Dove</th>
                <th className="px-2 py-2 text-center font-medium">Obbligatorio</th>
                <th className="px-2 py-2 text-center font-medium">Scade</th>
                {canEdit && <th className="py-2 pl-2"><span className="sr-only">Azioni</span></th>}
              </tr>
            </thead>
            <tbody className="block space-y-2 md:table-row-group md:space-y-0 md:divide-y">
              {attive.map((v) => (
                <tr key={v.id} className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border p-2.5 md:table-row md:rounded-none md:border-0 md:p-0">
                  <td className="col-span-2 min-w-0 py-1.5 md:pr-2">
                    <span className="break-words">{v.nome}</span>
                    {v.personale && <span className="ml-1.5 text-xs text-muted-foreground">aggiunto da voi</span>}
                    {v.cambiata && canEdit && (
                      <button type="button" disabled={busy} onClick={() => salva({ tipo: "come_partenza", modello, chiave: v.id }, `«${v.nome}» come all'inizio`)}
                        className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" /> come all'inizio
                      </button>
                    )}
                  </td>
                  <td className="col-span-2 py-1 md:px-2 md:py-1.5">
                    <Select value={v.ambito} disabled={!canEdit || busy} onValueChange={(a) => cambia(v, { ambito: a as AmbitoVoce })}>
                      <SelectTrigger className="h-8 w-full md:w-52" aria-label={`Dove serve «${v.nome}»`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generale">{etichettaAmbito(modello, "generale")}</SelectItem>
                        <SelectItem value="figlia">{etichettaAmbito(modello, "figlia")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="flex items-center justify-between gap-1 py-1 md:table-cell md:px-2 md:py-1.5 md:text-center">
                    <span className="text-xs md:hidden">Obbligatorio</span>
                    <Switch checked={v.obbligatoria} disabled={!canEdit || busy} onCheckedChange={(x) => cambia(v, { obbligatoria: x })} aria-label={`«${v.nome}» obbligatorio`} />
                  </td>
                  <td className="flex items-center justify-between gap-1 py-1 md:table-cell md:px-2 md:py-1.5 md:text-center">
                    <span className="text-xs md:hidden">Scade</span>
                    <Switch checked={v.conScadenza} disabled={!canEdit || busy} onCheckedChange={(x) => cambia(v, { con_scadenza: x })} aria-label={`«${v.nome}» ha una scadenza`} />
                  </td>
                  {canEdit && (
                    <td className="col-span-2 flex justify-end md:table-cell md:py-1.5 md:pl-2 md:text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy} onClick={() => cambia(v, { tolta: true }, `«${v.nome}» tolto dall'elenco`)} aria-label={`Togli «${v.nome}»`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {attive.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nessun documento richiesto: la scheda Documenti mostra solo l'archivio.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
          <Input
            id="nuovo-documento-generale"
            placeholder="Altro documento, es. Certificato antincendio"
            aria-label="Nuovo documento richiesto"
            maxLength={120}
            disabled={busy}
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") aggiungi(); }}
            className="h-9"
          />
          <div className="flex gap-2">
            <Select value={ambitoNuova} disabled={busy} onValueChange={(a) => setAmbitoNuova(a as AmbitoVoce)}>
              <SelectTrigger className="h-9 flex-1 sm:w-52" aria-label="Dove serve il nuovo documento"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="generale">{etichettaAmbito(modello, "generale")}</SelectItem>
                <SelectItem value="figlia">{etichettaAmbito(modello, "figlia")}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={aggiungi} disabled={!nuova.trim() || busy} className="h-9 shrink-0">
              <Plus className="mr-1 h-4 w-4" /> Aggiungi
            </Button>
          </div>
        </div>
      )}

      {tolte.length > 0 && (
        <div className="px-4 py-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Tolti dall'elenco: non compaiono nelle commesse generali.</p>
          <ul className="flex flex-wrap gap-1.5">
            {tolte.map((v) => (
              <li key={v.id}>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!canEdit || busy}
                  onClick={() => cambia(v, { tolta: false }, `«${v.nome}» rimesso`)} aria-label={`Rimetti «${v.nome}»`}>
                  {canEdit && <Undo2 className="mr-1 h-3 w-3" />} {v.nome}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SezioneImpostazione>
  );
}
