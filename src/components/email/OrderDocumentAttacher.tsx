import { useOrderDocuments } from "@/hooks/useOrderDocuments";
import { Loader2, Paperclip, Check } from "lucide-react";

export interface OrderDocumentAttacherProps {
  orderId: string;
  alreadyAttached: string[]; // array of file_url already attached
  onAttach: (doc: { name: string; size: number | null; mime: string | null; file_url: string; bucket: string }) => void;
  onDetach: (fileUrl: string) => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function OrderDocumentAttacher({ orderId, alreadyAttached, onAttach, onDetach }: OrderDocumentAttacherProps) {
  const { data: docs = [], isLoading, isError, refetch } = useOrderDocuments(orderId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Caricamento documenti commessa…
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        <Paperclip className="h-3.5 w-3.5" />
        Documenti commessa
      </div>

      {isError ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="italic">Impossibile caricare i documenti.</span>
          <button
            type="button"
            className="text-blue-600 hover:text-blue-800 font-medium"
            onClick={() => refetch()}
          >
            Riprova
          </button>
        </div>
      ) : docs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          Nessun documento collegato alla commessa.
        </p>
      ) : (
        <ul className="space-y-1">
          {docs.map((doc) => {
            const attached = alreadyAttached.includes(doc.file_url);
            return (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] bg-white"
              >
                <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="truncate font-medium">{doc.file_name}</span>
                  {doc.file_size && (
                    <span className="text-muted-foreground shrink-0">{formatSize(doc.file_size)}</span>
                  )}
                </div>
                {attached ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-emerald-600 hover:text-rose-600 font-medium shrink-0 text-[11px]"
                    onClick={() => onDetach(doc.file_url)}
                    title="Rimuovi allegato"
                  >
                    <Check className="h-3.5 w-3.5" /> Rimuovi
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-800 font-medium shrink-0 text-[11px]"
                    onClick={() => onAttach({ name: doc.file_name, size: doc.file_size, mime: doc.file_type, file_url: doc.file_url, bucket: "order-attachments" })}
                    title="Allega"
                  >
                    Allega
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
