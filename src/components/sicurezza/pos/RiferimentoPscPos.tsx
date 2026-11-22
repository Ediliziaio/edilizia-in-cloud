import { UniformSelect } from "@/components/ui/uniform-select";
import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { identificaPsc, usePscCommessa } from "@/hooks/usePscCommessa";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { CaricaDocumentoSicurezzaDialog } from "@/components/sicurezza/DocumentiSicurezza";
import {
  type RiferimentoPsc,
  stessaFontePsc,
} from "../../../../supabase/functions/_shared/posPsc";
export function RiferimentoPscPos(
  { companyId, orderId, valore, ro, onChange, ambitoCommessa }: {
    companyId: string;
    orderId: string;
    valore?: RiferimentoPsc;
    ro: boolean;
    onChange: (r: RiferimentoPsc | undefined) => void;
    ambitoCommessa?: boolean;
  },
) {
  const docs = usePscCommessa(companyId, orderId);
  const perms = usePermissions();
  const qc = useQueryClient();
  const formId = useId();
  const [selezione, setSelezione] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [ultimoCaricamento, setUltimoCaricamento] = useState<string[]>([]);
  const [rev, setRev] = useState("");
  const [carica, setCarica] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [riscontro, setRiscontro] = useState("");
  const corrente = docs.data?.find((d) =>
    d.archivio === valore?.archivio && d.id === valore?.id
  );
  const modificato = !!valore && !!docs.data &&
    (!corrente || !stessaFontePsc(valore, corrente));
  const altre =
    docs.data?.filter((d) =>
      d.archivio !== valore?.archivio || d.id !== valore?.id
    ) || [];
  const chiaveFonte = (d: NonNullable<typeof corrente>) => `${d.archivio}:${d.id}`;
  const nuovaFonte = ultimoCaricamento.length === 1
    ? docs.data?.find(d => d.archivio === "sicurezza_documenti" && d.file_path === ultimoCaricamento[0])
    : undefined;
  const selezioneCorrente = selezione || (nuovaFonte && chiaveFonte(nuovaFonte)) || "";
  const fonte = docs.data?.find(d => chiaveFonte(d) === selezioneCorrente);
  const normalizza = (testo: string) => testo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termini = normalizza(ricerca.trim()).split(/\s+/).filter(Boolean);
  const visibili = docs.data?.filter(d => {
    const testo = normalizza([d.titolo, d.file_name, d.data_documento, d.revisione].join(" "));
    return chiaveFonte(d) === selezioneCorrente || termini.every(t => testo.includes(t));
  });

  const solaLettura = ro || !perms.canViewSicurezzaCantiere ||
    perms.solaLettura;
  const controlla = async () => {
    if (!corrente || !valore || modificato) return;
    setBusy(true);
    setErrore("");
    setRiscontro("");
    try {
      const r = await identificaPsc(corrente, valore.revisione);
      setRiscontro(
        r.sha256 === valore.sha256
          ? "L’originale disponibile coincide con il file scelto. La verifica tecnica delle prescrizioni resta distinta."
          : "Il contenuto del file è cambiato: riesamina il PSC e scegli nuovamente il riferimento.",
      );
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Controllo non riuscito");
    } finally {
      setBusy(false);
    }
  };
  const collega = async () => {
    if (!fonte || solaLettura) return;
    setBusy(true);
    setErrore("");
    setRiscontro("");
    try {
      onChange(await identificaPsc(fonte, fonte.revisione || rev));
      setSelezione("");
      setUltimoCaricamento([]);
      setRev("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Collegamento non riuscito");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />PSC di riferimento della commessa
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={docs.isFetching || busy}
          onClick={() => {
            setRiscontro("");
            void docs.refetch();
          }}
        >
          <RefreshCw className="mr-1 h-3 w-3" />Aggiorna elenco
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Scegli il file effettivamente consultato. Il collegamento identifica
        l’originale e la revisione dichiarata; non approva il PSC o la coerenza
        del POS.
      </p>
      {docs.isPending && (
        <p role="status" className="text-sm">Lettura dei PSC della commessa…</p>
      )}
      {docs.isError && (
        <p role="alert" className="text-sm text-red-700">
          Elenco non disponibile. Non è possibile stabilire se il PSC sia
          aggiornato: riprova.
        </p>
      )}
      {valore
        ? (
          <div className="space-y-2 rounded-md border bg-white p-3">
            <p className="text-sm font-medium">{valore.titolo}</p>
            <p className="text-xs text-muted-foreground">
              Revisione {valore.revisione} ·{" "}
              {valore.data_documento || "Data non indicata"} ·{" "}
              {valore.file_name}
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer">
                Identificazione del file scelto
              </summary>
              <p className="mt-1 break-all font-mono">
                SHA-256: {valore.sha256}
              </p>
              <p className="mt-1">
                Archivio: {valore.archivio} · ID {valore.id}
              </p>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!corrente || modificato || busy}
                onClick={() => {
                  const bucket = valore.archivio === "sicurezza_documenti"
                    ? "sicurezza-documenti"
                    : "fascicoli-cantiere";
                  void apriFileRiservato(bucket, valore.file_path).catch((e) =>
                    setErrore(
                      e instanceof Error ? e.message : "Originale non apribile",
                    )
                  );
                }}
              >
                Apri originale disponibile
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!corrente || modificato || busy}
                onClick={() => void controlla()}
              >
                Confronta impronta
              </Button>
              {!solaLettura && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onChange(undefined);
                    setRiscontro("");
                  }}
                >
                  Scollega riferimento
                </Button>
              )}
            </div>
          </div>
        )
        : (
          <p className="text-sm text-amber-800">
            {ambitoCommessa ? "Nessun originale PSC scelto per la commessa." : "Nessun originale PSC collegato a questa bozza."}
          </p>
        )}
      {modificato && (
        <p role="alert" className="text-sm text-amber-800">
          Il riferimento scelto è cambiato o non è più disponibile negli archivi
          accessibili. Riesamina il riferimento prima di usarlo.
        </p>
      )}
      {!!valore && altre.length > 0 && (
        <p className="text-xs text-amber-800">
          Sono presenti altri {altre.length}{" "}
          PSC nella commessa. Confrontali: il caricamento più recente non
          identifica automaticamente la revisione vigente.
        </p>
      )}
      {!solaLettura && !docs.isError && (
        <div className="space-y-2">
          {(docs.data?.length ?? 0) > 1 && <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input type="search" className="h-9 pl-9" aria-label="Cerca un PSC della commessa" placeholder="Cerca per titolo, nome file o revisione"
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>}
          {ultimoCaricamento.length > 0 && <p role="status" className="text-xs text-muted-foreground">
            {nuovaFonte ? "PSC caricato. Controlla la revisione e usa il riferimento." : "Caricamento completato. Scegli il PSC dall’elenco aggiornato."}
          </p>}
          {termini.length > 0 && visibili?.length === 0 && <p className="text-xs text-muted-foreground">Nessun PSC corrisponde alla ricerca.</p>}
          <div className="flex flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`${formId}-originale`} className="text-xs">
                Originale da collegare
              </Label>
              <UniformSelect
                id={`${formId}-originale`}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                disabled={busy || docs.isPending}
                value={selezioneCorrente}
                onChange={(e) => {
                  setUltimoCaricamento([]);
                  setSelezione(e.target.value);
                  setRev("");
                  setRiscontro("");
                }}
              >
                <option value="">Scegli un PSC della commessa</option>
                {visibili?.map((d) => (
                  <option
                    key={chiaveFonte(d)}
                    value={chiaveFonte(d)}
                  >
                    {d.titolo} · {d.data_documento || "senza data"}
                    {d.revisione ? ` · rev. ${d.revisione}` : ""}
                  </option>
                ))}
              </UniformSelect>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-end"
              disabled={busy}
              onClick={() => setCarica(true)}
            >
              Carica PSC
            </Button>
          </div>
          {fonte && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Label htmlFor={`${formId}-revisione`} className="text-xs">
                  Revisione riportata sul documento
                </Label>
                <Input
                  id={`${formId}-revisione`}
                  value={fonte.revisione || rev}
                  disabled={busy || !!fonte.revisione}
                  onChange={(e) => setRev(e.target.value)}
                  placeholder="Es. 02 del 20/10/2026"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy || !(fonte.revisione || rev).trim()}
                onClick={() => void collega()}
              >
                {busy ? "Lettura originale…" : "Usa questo riferimento"}
              </Button>
            </div>
          )}
          {docs.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Carica il PSC con ambito questa commessa. I documenti generici
              aziendali sono esclusi.
            </p>
          )}
        </div>
      )}
      {errore && <p role="alert" className="text-sm text-red-700">{errore}</p>}
      {riscontro && (
        <p role="status" className="text-sm text-amber-800">{riscontro}</p>
      )}
      {!solaLettura && (
        <CaricaDocumentoSicurezzaDialog
          companyId={companyId}
          orderId={orderId}
          preset={{ tipo: "psc" }}
          soloPsc
          open={carica}
          onCaricati={percorsi => {
            setSelezione("");
            setRev("");
            setRicerca("");
            setUltimoCaricamento(percorsi);
          }}
          onOpenChange={(v) => {
            setCarica(v);
            if (!v) {
              void qc.invalidateQueries({
                queryKey: ["psc-commessa", companyId, orderId],
              });
            }
          }}
        />
      )}
    </div>
  );
}
