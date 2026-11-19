import { validateWarehouseFile, warehouseDocumentReference } from '@/lib/magazzino/allegatiMagazzino';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { movementOutcomeUnknown, warehouseCapabilities, warehouseRequestScope, warehouseRequestStorage, WarehouseRequestSlot } from '@/lib/magazzino/protocolloMovimenti';
import { useWarehouseOperation } from './useWarehouseOperations';

export interface CreateGoodsReceiptInput {
  order_item_id: string;
  /** ID del magazzino di destinazione. Obbligatorio post-migration Magazzino V2. */
  warehouse_id: string;
  /** Opzionale: lega questa ricezione a una testata DDT già esistente. */
  ddt_ricezione_id?: string;
  supplier_id?: string;
  quantity_received: number;
  ddt_number?: string;
  ddt_photo?: File;
  quality_check_status: 'ok' | 'damaged' | 'partial' | 'pending';
  quality_notes?: string;
  notes?: string;
}

export function useGoodsReceipt() {
  const { effectiveCompany, user: actor } = useAuth();
  const operation = useWarehouseOperation("goods-receive");
  const flight = useRef(false);
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const { mutateAsync: createGoodsReceipt, isPending: isCreating } = useMutation({
    mutationFn: async (input: CreateGoodsReceiptInput) => {
      if (!effectiveCompany?.id) throw new Error('Seleziona un’azienda.');

      if (flight.current) throw new Error("Ricezione già in corso.");
      flight.current = true;
      let uploadedPath: string | null = null;
      try {
      const photoMime = input.ddt_photo ? await validateWarehouseFile(input.ddt_photo) : undefined;
      const capabilities = await warehouseCapabilities(effectiveCompany.id);
      const user = await supabase.auth.getUser();
      if (user.error) throw user.error;
      if (!user.data.user?.id || (actor?.id && user.data.user.id !== actor.id)) throw new Error('Sessione cambiata: accedi di nuovo prima di registrare la ricezione.');

      const pending = new WarehouseRequestSlot(warehouseRequestScope(effectiveCompany.id, actor?.id, "goods-receive"), warehouseRequestStorage()).pendingRequest();
      let ddt_photo_url = capabilities.idempotent_goods_receipts && pending
        ? (pending.payload.p_ddt_photo_url as string | null) : null;

      // Nessuna ricezione viene dichiarata riuscita se il suo allegato non è salvato.
      if (input.ddt_photo && !pending) {
        const {data: line,error: lineError}=await supabase.from('order_items').select('id,order:orders!inner(company_id)').eq('id',input.order_item_id).eq('order.company_id',effectiveCompany.id).maybeSingle();
        if(lineError)throw lineError;
        if(!line)throw new Error('Posizione di acquisto non accessibile per questa azienda.');
        setUploadProgress(10);
        const fileName = `${crypto.randomUUID()}_${input.ddt_photo.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
        const filePath = `${effectiveCompany.id}/${input.order_item_id}/${fileName}`;
        const {error: uploadError}=await supabase.storage.from('goods_receipts').upload(filePath,input.ddt_photo,{upsert:false,contentType:photoMime});
        if(uploadError)throw new Error('Allegato non caricato. La ricezione non è stata registrata: riprova.');
        uploadedPath=filePath;
        ddt_photo_url=warehouseDocumentReference('goods_receipts',filePath);
        setUploadProgress(90);
      }

      // P2 FIX wave 4: usa RPC atomica insert_goods_receipt_atomic
      // per evitare che il receipt venga creato senza l'update su
      // order_items o senza il timeline event. PL/pgSQL garantisce
      // rollback se qualcosa fallisce.
      setUploadProgress(95);
      const args = {
          p_order_item_id: input.order_item_id, p_warehouse_id: input.warehouse_id,
          p_quantity_received: input.quantity_received, p_quality_check_status: input.quality_check_status,
          p_supplier_id: input.supplier_id || null, p_ddt_number: input.ddt_number || null,
          p_ddt_photo_url: ddt_photo_url, p_ddt_ricezione_id: input.ddt_ricezione_id || null,
          p_quality_notes: input.quality_notes || null, p_notes: input.notes || null,
      };
      const response: {data: unknown; error: {message: string} | null} = capabilities.idempotent_goods_receipts
        ? { data: (await operation.mutateAsync({rpc: "warehouse_goods_receipt_v3", payload: args}) as {receipt_id: string}).receipt_id, error: null }
        : await supabase.rpc("insert_goods_receipt_atomic", args);
      const { data: receiptId, error: rpcError } = response;

      if (rpcError) throw rpcError;
      if (!receiptId) throw new Error("RPC insert_goods_receipt_atomic non ha restituito id");

      setUploadProgress(100);
      return { id: receiptId as string };
      } catch(error) {
        // Se la risposta può essere persa dopo il commit, conserva il file per il recupero.
        if(uploadedPath && !movementOutcomeUnknown(error)) {
          try {const {error:removeError}=await supabase.storage.from('goods_receipts').remove([uploadedPath]);if(removeError)toast.warning('Allegato da verificare: la pulizia del caricamento non è riuscita.');}
          catch {toast.warning('Allegato da verificare: la pulizia del caricamento non è riuscita.');}
        }
        throw error;
      } finally { flight.current = false; }
    },
    onSuccess: () => {
      toast.success('Ricezione registrata ✓');
      for (const key of [['warehouse'], ['order-items'], ['purchase-orders'], ['goods-receipts']]) void queryClient.invalidateQueries({ queryKey: key });
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('useGoodsReceipt error:', error);
      toast.error(`Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      setUploadProgress(0);
    },
  });

  return { createGoodsReceipt, isCreating, uploadProgress };
}
