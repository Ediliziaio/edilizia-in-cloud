/** Non cambiare il documento sul quale un cliente sta completando la firma. */
export async function preventivoFirmaAttiva(db: any, companyId: string, tipo: "fv" | "sr", progettoId: string): Promise<boolean> {
  let colonna = "fv_progetto_id";
  let documentoId = progettoId;
  if (tipo === "sr") {
    const { data, error } = await db.from("quotes").select("id").eq("company_id", companyId).eq("source", `modulo:sr:${progettoId}`).maybeSingle();
    if (error) throw new Error("Impossibile verificare la firma del preventivo.");
    if (!data) return false;
    colonna = "quote_id";
    documentoId = data.id;
  }
  const { data, error } = await db.from("signature_requests").select("id").eq("company_id", companyId).eq(colonna, documentoId)
    .in("status", ["pending", "otp_verified"]).gt("expires_at", new Date().toISOString()).limit(1);
  if (error) throw new Error("Impossibile verificare le richieste di firma.");
  return !!data?.length;
}
