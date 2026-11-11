import {
  salvaCollegamentoDdt,
  type DdtCollegabile,
} from "@/lib/fatturazione/collegaDdt";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateShort } from "@/lib/formatters";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CollegaDdtFattura({
  fatturaId,
  companyId,
  fornitoreId,
  onSalvato,
}: {
  fatturaId: string;
  companyId: string;
  fornitoreId?: string | null;
  onSalvato?: () => void;
}) {
  const qc = useQueryClient();
  const [ricerca, setRicerca] = useState("");
  const [riferimento, setRiferimento] = useState(false);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const termine = useDebounce(ricerca.trim(), 250);
  const q = useQuery<DdtCollegabile[]>({
    queryKey: [
      "fattura-ddt-disponibili",
      companyId,
      fatturaId,
      fornitoreId,
      termine,
    ],
    enabled: !riferimento,
    queryFn: async () => {
      let query = db
        .from("ddt_ricezione")
        .select(
          "id,numero_ddt,data_ricezione,supplier_id,suppliers(name),destinazione",
        )
        .eq("company_id", companyId)
        .order("data_ricezione", { ascending: false })
        .order("id")
        .limit(51);
      if (fornitoreId) query = query.eq("supplier_id", fornitoreId);
      if (termine)
        query = query.ilike("numero_ddt", `%${termine.replace(/[%_]/g, "")}%`);
      const { data: righe, error } = await query;
      if (error) throw error;
      return righe ?? [];
    },
  });
  const salva = useMutation({
    mutationFn: (d?: DdtCollegabile) =>
      salvaCollegamentoDdt({
        companyId,
        fatturaId,
        ddtId: d?.id,
        numero: d?.numero_ddt ?? numero,
        data: d?.data_ricezione?.slice(0, 10) ?? (data || null),
      }),
    onSuccess: async () => {
      toast.success("DDT collegato alla fattura");
      await Promise.all(
        [
          "fattura-collegamenti",
          "fattura-confronto",
          "fatture-ricevute",
          "fattura-ricevuta-riepilogo",
        ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      onSalvato?.();
    },
    onError: (e) =>
      toast.error("DDT non collegato", {
        description: messaggioSalvataggio(e),
      }),
  });
  return (
    <div className="space-y-3">
      <div
        className="flex gap-2"
        role="group"
        aria-label="Tipo di collegamento DDT"
      >
        <Button
          size="sm"
          variant={riferimento ? "ghost" : "secondary"}
          onClick={() => setRiferimento(false)}
          disabled={salva.isPending}
        >
          DDT caricati
        </Button>
        <Button
          size="sm"
          variant={riferimento ? "secondary" : "ghost"}
          onClick={() => setRiferimento(true)}
          disabled={salva.isPending}
        >
          Solo riferimento
        </Button>
      </div>
      {riferimento ? (
        <>
          <p className="text-xs text-muted-foreground">
            Registra numero e data se la bolla non è stata caricata. Potrai
            collegare l’originale in seguito.
          </p>
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            maxLength={100}
            placeholder="Numero DDT"
            aria-label="Numero DDT"
          />
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-label="Data DDT"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!numero.trim() || salva.isPending}
            onClick={() => salva.mutate(undefined)}
          >
            Salva riferimento
          </Button>
        </>
      ) : (
        <>
          <Input
            aria-label="Cerca DDT per numero"
            placeholder="Cerca il numero DDT…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {fornitoreId
              ? "Bolle del fornitore della fattura."
              : "Bolle dell’azienda: controlla il fornitore prima di collegare."}
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {q.isFetching ? (
              <p role="status" className="p-2 text-xs">
                Cerco i DDT…
              </p>
            ) : q.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {messaggioSalvataggio(q.error)}{" "}
                <button className="underline" onClick={() => void q.refetch()}>
                  Riprova
                </button>
              </p>
            ) : !q.data?.length ? (
              <p className="p-2 text-xs text-muted-foreground">
                Nessun DDT trovato. Carica la bolla o registra il solo
                riferimento.
              </p>
            ) : (
              q.data.slice(0, 50).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={salva.isPending}
                  onClick={() => salva.mutate(d)}
                  className="block w-full rounded-md border p-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-medium">
                    {d.numero_ddt || "Senza numero"}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateShort(d.data_ricezione)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {d.suppliers?.name || "Fornitore da associare"} ·{" "}
                    {d.destinazione === "cantiere"
                      ? "Consegna in cantiere"
                      : d.destinazione === "magazzino"
                        ? "Magazzino"
                        : "Destinazione da verificare"}
                  </span>
                </button>
              ))
            )}
          </div>
          {(q.data?.length ?? 0) > 50 && (
            <p className="text-xs text-muted-foreground">
              Primi 50 DDT: cerca il numero per trovare gli altri.
            </p>
          )}
        </>
      )}
      {salva.isError && (
        <p role="alert" className="text-xs text-destructive">
          {messaggioSalvataggio(salva.error)}
        </p>
      )}
      {salva.isPending && (
        <p role="status" className="text-xs">
          Salvataggio in corso…
        </p>
      )}
    </div>
  );
}
