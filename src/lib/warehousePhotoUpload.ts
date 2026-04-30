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

  const geo = await getOptionalGeoPosition();
  const folder = orderId ?? "magazzino";

  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("image/")) {
      result.skipped.push(file.name);
      continue;
    }

    const path = `${companyId}/${folder}/${context}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("foto-cantiere")
      .upload(path, file, { contentType: file.type });

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
}: {
  file: File;
  orderIds: string[];
  userId: string;
  supplierName?: string | null;
  insertedAt: string;
}) {
  const uploaded: string[] = [];
  const failed: string[] = [];
  const safeName = sanitizeFileName(file.name);

  for (const orderId of orderIds) {
    const filePath = `orders/${orderId}/ddt-arrivo-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("order-attachments")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      failed.push(orderId);
      continue;
    }

    const label = supplierName ? `DDT arrivo merce - ${supplierName}` : "DDT arrivo merce";
    const { error: dbError } = await supabase.from("order_attachments").insert({
      order_id: orderId,
      file_name: `${label} - ${file.name}`,
      file_url: filePath,
      file_type: file.type || "application/octet-stream",
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
