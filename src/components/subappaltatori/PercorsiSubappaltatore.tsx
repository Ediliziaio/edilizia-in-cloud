import { ClipboardList, FileCheck2, List, NotebookTabs, UsersRound, WalletCards } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PercorsiSubappaltatore({ mostraListino }: { mostraListino: boolean }) {
  const t = useT();
  const sezioni = [
    { id: "anagrafica", nome: "Panoramica", Icona: NotebookTabs },
    { id: "lavori", nome: t("Commesse e contratti"), Icona: ClipboardList },
    { id: "operai", nome: t("Operai e squadre"), Icona: UsersRound },
    { id: "documenti", nome: t("Documenti e sicurezza"), Icona: FileCheck2 },
    { id: "contabilita", nome: "Contabilità", Icona: WalletCards },
    ...(mostraListino ? [{ id: "listino", nome: "Listino", Icona: List }] : []),
  ];
  // Telefono: una riga di pillole che scorre, come tutte le schede (era una griglia 2×3 di caselle).
  return <TabsList aria-label={t("Scheda del subappaltatore")} className="grid h-auto w-full grid-cols-2 justify-start gap-1 rounded-lg border p-1 sm:flex sm:overflow-x-auto max-sm:flex max-sm:border-0">
    {sezioni.map(({ id, nome, Icona }) => <TabsTrigger key={id} value={id} className="min-w-0 shrink-0 justify-start gap-1.5 whitespace-normal px-2 py-2 text-left max-sm:whitespace-nowrap max-sm:text-sm">
      <Icona className="size-4 shrink-0 max-sm:hidden" aria-hidden="true" />{nome}
    </TabsTrigger>)}
  </TabsList>;
}
