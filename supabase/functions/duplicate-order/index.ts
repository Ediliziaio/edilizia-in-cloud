import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const { source_order_id } = await req.json();

    if (!source_order_id) {
      return errorResponse("source_order_id is required", 400);
    }

    // 1. Fetch source order
    const { data: sourceOrder, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", source_order_id)
      .single();

    if (orderErr || !sourceOrder) {
      return errorResponse("Order not found", 404);
    }

    // 2. Verify user belongs to same company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile || profile.company_id !== sourceOrder.company_id) {
      return errorResponse("Forbidden: not authorized for this company", 403);
    }

    // 3. Get first status by position
    const { data: firstStatus } = await supabaseAdmin
      .from("order_statuses")
      .select("id")
      .eq("company_id", sourceOrder.company_id)
      .order("position", { ascending: true })
      .limit(1)
      .single();

    // 4. Fetch source items
    const { data: sourceItems } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", source_order_id)
      .order("position");

    // 5. Fetch source installments
    const { data: sourceInstallments } = await supabaseAdmin
      .from("order_installments")
      .select("*")
      .eq("order_id", source_order_id)
      .order("position");

    // 6. Generate new order code
    const timestamp = Date.now().toString(36).toUpperCase();
    const newOrderCode = `DUP-${timestamp}`;

    // 7. Create new order (reset dates and payments)
    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      order_code: _oc,
      current_status_id: _cs,
      deposit_paid,
      deposit_paid_date,
      deposit_2_paid,
      deposit_2_paid_date,
      balance_paid,
      balance_paid_date,
      financing_paid,
      financing_paid_date,
      assigned_to: _at,
      ...orderFields
    } = sourceOrder;

    const { data: newOrder, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        ...orderFields,
        order_code: newOrderCode,
        current_status_id: firstStatus?.id || sourceOrder.current_status_id,
        deposit_paid: false,
        deposit_paid_date: null,
        deposit_2_paid: false,
        deposit_2_paid_date: null,
        balance_paid: false,
        balance_paid_date: null,
        financing_paid: false,
        financing_paid_date: null,
      })
      .select("id")
      .single();

    if (insertErr || !newOrder) {
      return errorResponse("Failed to create duplicate order: " + (insertErr?.message || "unknown"), 500);
    }

    const newOrderId = newOrder.id;

    // 8. Insert status history
    await supabaseAdmin
      .from("order_status_history")
      .insert({
        order_id: newOrderId,
        status_id: firstStatus?.id || sourceOrder.current_status_id,
        changed_by: userId,
      });

    // 9. Copy items (without stock_item_id, reset status)
    if (sourceItems && sourceItems.length > 0) {
      const newItems = sourceItems.map((item: any) => {
        const {
          id: _iid,
          order_id: _oid,
          created_at: _ica,
          stock_item_id: _sid,
          is_paid: _ip,
          paid_date: _pd,
          deposit_paid: _dp,
          deposit_paid_date: _dpd,
          balance_paid: _bp,
          balance_paid_date: _bpd,
          ...itemFields
        } = item;
        return {
          ...itemFields,
          order_id: newOrderId,
          stock_item_id: null,
          status: "da_ordinare",
          is_paid: false,
          paid_date: null,
          deposit_paid: false,
          deposit_paid_date: null,
          balance_paid: false,
          balance_paid_date: null,
        };
      });
      await supabaseAdmin.from("order_items").insert(newItems);
    }

    // 10. Copy installments (reset paid status)
    if (sourceInstallments && sourceInstallments.length > 0) {
      const newInstallments = sourceInstallments.map((inst: any) => ({
        order_id: newOrderId,
        position: inst.position,
        label: inst.label,
        type: inst.type,
        amount: inst.amount,
        is_paid: false,
        paid_date: null,
        expected_date: inst.expected_date,
      }));
      await supabaseAdmin.from("order_installments").insert(newInstallments);
    }

    return jsonResponse({ id: newOrderId, order_code: newOrderCode });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("duplicate-order error:", err);
    return errorResponse("Internal server error", 500);
  }
});
