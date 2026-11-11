import { useNavigate,useParams } from "react-router-dom";
import { useControlloDocumento } from "@/hooks/useControlloDocumento";
import { ConfrontoConfermaOrdineDialog } from "@/components/orders/ConfrontoConfermaOrdineDialog";
/** I link già inviati riaprono lo stesso confronto usato nella scheda ordine. */
export default function ControlloDocumentoFornitore() {
 const {id}=useParams();const navigate=useNavigate();const q=useControlloDocumento(id);
 if(q.caricamento) return <p role="status" className="p-6 text-sm">Caricamento controllo…</p>;
 const c=q.controllo;
 if(!c) return <p role="alert" className="p-6 text-sm">Controllo non disponibile per questa azienda.</p>;
 const obiettivo=c.purchase_order_id?{purchaseOrderId:c.purchase_order_id}:{rfqSupplierId:c.rfq_supplier_id!};
 return <ConfrontoConfermaOrdineDialog companyId={c.company_id} obiettivo={obiettivo} inizialeId={c.id} onClose={()=>c.purchase_order_id?navigate(`/azienda/ordini-acquisto/${c.purchase_order_id}`):navigate(-1)}/>;
}
