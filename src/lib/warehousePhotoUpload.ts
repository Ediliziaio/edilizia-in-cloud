import { validateWarehouseFile, MAX_WAREHOUSE_PHOTOS } from "@/lib/magazzino/allegatiMagazzino";
import { supabase } from "@/integrations/supabase/client";

type WarehousePhotoContext = "arrival_product" | "loaded_goods";

interface UploadWarehousePhotosArgs {
  files: File[];
  companyId: string;
  userId: string;
  orderId?: string | null;
  context: WarehousePhotoContext;
  description: string;
}

interface UploadWarehousePhotosResult {
  uploaded: string[];
  failed: string[];
  skipped: string[];
}

async function getOptionalGeoPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function uploadWarehousePhotos({
  files,
  companyId,
  userId,
  orderId,
  context,
  description,
}: UploadWarehousePhotosArgs): Promise<UploadWarehousePhotosResult> {
  const result: UploadWarehousePhotosResult = {
    uploaded: [],
    failed: [],
    skipped: [],
  };

  if (files.length === 0) return result;

  if (files.length > MAX_WAREHOUSE_PHOTOS) throw new Error("Carica al massimo 10 foto alla volta.");
  if (orderId) await verifyOrderScope(companyId, [orderId]);
  const geo = await getOptionalGeoPosition();
  const folder = orderId ?? "magazzino";

  for (const [index, file] of files.entries()) {
    let mime: string;
    try { mime = await validateWarehouseFile(file, true); } catch { result.failed.push(file.name); continue; }

    const path = `${companyId}/${folder}/${context}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("foto-cantiere")
      .upload(path, file, { contentType: mime, upsert: false });

    if (uploadError) {
      result.failed.push(file.name);
      continue;
    }

    const { error: metadataError } = await supabase.from("foto_cantiere").insert({
      company_id: companyId,
      order_id: orderId ?? null,
      uploaded_by: userId,
      storage_path: path,
      latitudine: geo?.coords.latitude ?? null,
      longitudine: geo?.coords.longitude ?? null,
      accuracy_meters: geo?.coords.accuracy ?? null,
      taken_at: new Date().toISOString(),
      descrizione: description,
      tags: ["magazzino", context],
    });

    if (metadataError) {
      await supabase.storage.from("foto-cantiere").remove([path]);
      result.failed.push(file.name);
      continue;
    }

    result.uploaded.push(path);
  }

  return result;
}

export async function uploadWarehouseDDTToOrders({
  file,
  orderIds,
  userId,
  supplierName,
  insertedAt,
  companyId,
}: {
  file: File;
  orderIds: string[];
  userId: string;
  supplierName?: string | null;
  insertedAt: string;
  companyId: string;
}) {
  const uploaded: string[] = [];
  const failed: string[] = [];
  const mime = await validateWarehouseFile(file);
  await verifyOrderScope(companyId, orderIds);
  const safeName = sanitizeFileName(file.name);

  for (const orderId of orderIds) {
    const filePath = `orders/${orderId}/ddt-arrivo-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("order-attachments")
      .upload(filePath, file, { contentType: mime, upsert: false });

    if (uploadError) {
      failed.push(orderId);
      continue;
    }

    const label = supplierName ? `DDT arrivo merce - ${supplierName}` : "DDT arrivo merce";
    const { error: dbError } = await supabase.from("order_attachments").insert({
      order_id: orderId,
      file_name: `${label} - ${file.name}`,
      file_url: filePath,
      file_type: mime,
      file_size: file.size,
      uploaded_by: userId,
      visible_to_customer: false,
    });

    if (dbError) {
      await supabase.storage.from("order-attachments").remove([filePath]);
      failed.push(orderId);
      continue;
    }

    uploaded.push(`${orderId}:${insertedAt}`);
  }

  return { uploaded, failed };
}

async function verifyOrderScope(companyId: string, ids: string[]) {
  if (!companyId || !ids.length) throw new Error("Seleziona una commessa accessibile per allegare il documento.");
  const unique=[...new Set(ids)];
  const {data,error}=await supabase.from("orders").select("id").eq("company_id",companyId).in("id",unique).is("deleted_at",null);
  if(error)throw error;
  if(data?.length!==unique.length)throw new Error("Una commessa non appartiene all’azienda selezionata o non è accessibile.");
}
