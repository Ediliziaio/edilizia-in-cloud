/** Adattatore locale: solo PVGIS pubblico, tramite proxy su loopback. Nessun database. */
export const supabase = { functions: { invoke: async (name: string, options?: { body?: Record<string, unknown> }) => {
  if (name !== "fv-pvgis-fetch") throw new Error("Servizio remoto disattivato nell’anteprima locale");
  const b = options?.body ?? {};
  const response=await fetch("/api/fv-stima",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
  const data = await response.json();
  return response.ok ? { data, error: null as Error | null } : { data: null, error: new Error(data.error ?? "Stima non disponibile") };
} } };
export function captureVelocityEvent() {}
export function captureVelocityError() {}
export function setSentryUserContext() {}
export async function initSentry() {}
