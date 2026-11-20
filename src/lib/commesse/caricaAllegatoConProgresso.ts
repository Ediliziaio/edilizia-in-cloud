import { supabase } from "@/integrations/supabase/client";

export function oggettoGiaCaricato(errore: unknown) {
  const risposta = errore as { statusCode?: number; code?: string; message?: string } | undefined;
  return /^(Duplicate|ResourceAlreadyExists|KeyAlreadyExists)$/i.test(risposta?.code ?? "") ||
    ((risposta?.statusCode === 400 || risposta?.statusCode === 409) && /already exists/i.test(risposta.message ?? ""));
}

/** Usa gli stessi permessi dell'upload SDK, esponendo i byte inviati dal browser. */
export async function caricaAllegatoConProgresso(bucket: string, percorso: string, file: File, progresso: (percentuale: number) => void) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Accedi di nuovo per caricare i documenti");
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "");
  const path = percorso.split("/").map(encodeURIComponent).join("/");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total) progresso(Math.floor(event.loaded / event.total * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const risposta = xhr.response as { message?: string; statusCode?: string | number; error?: string; code?: string } | null;
      reject(Object.assign(new Error(risposta?.message ?? `Caricamento rifiutato (${xhr.status})`), {
        statusCode: Number(risposta?.statusCode) || xhr.status,
        code: risposta?.code ?? risposta?.error,
      }));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timeout")));
    xhr.addEventListener("abort", () => reject(new Error("Caricamento interrotto")));
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path}`);
    xhr.responseType = "json";
    xhr.timeout = 240_000;
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("x-upsert", "false");
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}
