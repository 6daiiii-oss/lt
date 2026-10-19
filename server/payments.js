import { Router } from 'express';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, tx } from './db.js';
import { config } from './config.js';
import { admin, authenticated, orgRole, verified } from './auth.js';
import { audit, cents, equal, hash, id, notify, parse, requireThat, text } from './lib.js';
import { lockBuyer } from './commerce.js';

export async function releaseReservations(db,checkoutId) {
  const rows=(await db.query(`SELECT * FROM inventory_reservations WHERE checkout_id=$1 AND state='pending' ORDER BY product_id FOR UPDATE`,[checkoutId])).rows;
  for(const r of rows) {
    await db.query('UPDATE inventory SET reserved=reserved-$2,updated_at=now() WHERE product_id=$1',[r.product_id,r.quantity]);
    await db.query(`UPDATE inventory_reservations SET state='released' WHERE id=$1`,[r.id]);
    await db.query(`INSERT INTO inventory_movements(product_id,checkout_id,kind,quantity,reference) VALUES($1,$2,'released',$3,$4) ON CONFLICT(reference) DO NOTHING`,[r.product_id,checkoutId,r.quantity,`release:${r.id}`]);
  }
}
async function cancelPendingOrders(db,checkoutId,event) {
  const orders=(await db.query(`UPDATE orders SET state='cancelled' WHERE purchase_id IN(SELECT id FROM purchases WHERE checkout_id=$1) AND state='awaiting_payment' RETURNING id`,[checkoutId])).rows;
  for(const o of orders) await db.query('INSERT INTO order_events(order_id,event) VALUES($1,$2)',[o.id,event]);
}
export async function expireCheckout(checkoutId,{force=false}={}) {
  return tx(async db=>{
    const initial=(await db.query('SELECT organization_id FROM checkouts WHERE id=$1',[checkoutId])).rows[0];if(!initial) return;
    await lockBuyer(db,initial.organization_id);
    const c=(await db.query('SELECT * FROM checkouts WHERE id=$1 FOR UPDATE',[checkoutId])).rows[0];
    if(c.state!=='pending'||(!force&&new Date(c.expires_at)>new Date())) return;
    await releaseReservations(db,c.id);
    await db.query(`UPDATE checkouts SET state='expired' WHERE id=$1`,[c.id]);
    await db.query(`UPDATE purchases SET payment_state='expired' WHERE checkout_id=$1`,[c.id]);
    await db.query(`UPDATE payment_attempts SET state='expired' WHERE checkout_id=$1 AND state='pending'`,[c.id]);
    await cancelPendingOrders(db,c.id,'checkout.expired');
    await notify(db,c.organization_id,'payment','La reserva de tu compra caducó. Puedes revisar el carrito.','/carrito');
  });
}
export async function expireReservations() {
  const rows=(await query(`SELECT id FROM checkouts WHERE state='pending' AND expires_at<=now() ORDER BY expires_at LIMIT 100`)).rows;
  for(const row of rows) await expireCheckout(row.id);
}
export function signWebhook(raw,timestamp) { return createHmac('sha256',config.webhookSecret).update(`${timestamp}.`).update(raw).digest('hex'); }
export const paymentEventSchema=z.object({event_id:z.string().min(8).max(150),attempt_id:id,kind:z.enum(['approved','failed','expired','refund']),amount_cents:cents,occurred_at:z.iso.datetime(),order_id:id.optional(),refund_id:z.string().min(8).max(150).optional(),reason:z.string().max(1000).optional(),cancel_order:z.boolean().optional(),restock:z.boolean().optional()});
async function paymentInventory(db,checkoutId) {
  return (await db.query(`SELECT r.*,p.status,p.wholesale_cents,i.total,i.reserved,i.source_updated_at,o.status AS seller_status,b.terms_approved,b.shipping_cents,b.min_order_cents,b.shipping_policy,b.return_policy,b.shipping_regions,
    oi.unit_price_cents,ord.shipping_cents AS frozen_shipping,ord.policy_snapshot
    FROM inventory_reservations r JOIN products p ON p.id=r.product_id JOIN inventory i ON i.product_id=r.product_id
    JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id
    JOIN order_items oi ON oi.product_id=p.id JOIN orders ord ON ord.id=oi.order_id JOIN purchases pur ON pur.id=ord.purchase_id
    WHERE r.checkout_id=$1 AND pur.checkout_id=$1 ORDER BY r.product_id FOR UPDATE OF r,i,p,b,o`,[checkoutId])).rows;
}
function validPayment(c,reservations,buyerStatus) {
  const region=c.address_snapshot.region.trim().toLocaleLowerCase('es-PE');
  return buyerStatus==='approved'&&c.state==='pending'&&new Date(c.expires_at)>new Date()&&reservations.length>0
    &&(!config.coverageRegions.length||config.coverageRegions.includes(region))
    &&reservations.every(r=>r.state==='pending'&&r.status==='published'&&r.seller_status==='approved'&&r.terms_approved&&r.shipping_regions.includes(region)
      &&r.wholesale_cents===r.unit_price_cents&&r.shipping_cents===r.frozen_shipping&&r.min_order_cents===r.policy_snapshot.minimum_cents
      &&r.shipping_policy===r.policy_snapshot.shipping&&r.return_policy===r.policy_snapshot.returns
      &&Date.now()-new Date(r.source_updated_at).getTime()<=config.stockMaxAgeHours*3600_000);
}
export async function applyPaymentEvent(untrusted) {
  const event=parse(paymentEventSchema,untrusted),payloadHash=hash(JSON.stringify(event));
  requireThat(new Date(event.occurred_at).getTime()<=Date.now()+300000,'Fecha de evento inválida.');
  return tx(async db=>{
    const initial=(await db.query(`SELECT pa.*,c.organization_id FROM payment_attempts pa JOIN checkouts c ON c.id=pa.checkout_id WHERE pa.id=$1`,[event.attempt_id])).rows[0];
    requireThat(initial,'Intento desconocido.',404);
    const buyer=await lockBuyer(db,initial.organization_id);
    const c=(await db.query('SELECT * FROM checkouts WHERE id=$1 FOR UPDATE',[initial.checkout_id])).rows[0];
    const previous=(await db.query(`SELECT payload_hash FROM payment_events WHERE provider='sandbox' AND event_id=$1`,[event.event_id])).rows[0];
    if(previous) {requireThat(previous.payload_hash===payloadHash,'ID de evento reutilizado con contenido diferente.',409);return {duplicate:true};}
    requireThat(event.kind==='refund'||event.amount_cents===initial.amount_cents,'Importe de evento no coincide.',422);
    await db.query(`INSERT INTO payment_events(provider,event_id,attempt_id,kind,occurred_at,payload_hash) VALUES('sandbox',$1,$2,$3,$4,$5)`,[event.event_id,event.attempt_id,event.kind,event.occurred_at,payloadHash]);
    if(event.kind==='refund') {
      requireThat(event.order_id&&event.refund_id,'Falta referencia de reembolso.');
      const existing=(await db.query('SELECT id FROM ledger_entries WHERE reference=$1',[`refund:${event.refund_id}`])).rows[0];
      if(existing) return {duplicate:true};
      const order=(await db.query(`SELECT ord.* FROM orders ord JOIN purchases p ON p.id=ord.purchase_id WHERE ord.id=$1 AND p.checkout_id=$2 FOR UPDATE OF ord`,[event.order_id,c.id])).rows[0];
      requireThat(order&&(['approved','partially_refunded','exception'].includes(c.state)||(c.state==='refunded'&&event.cancel_order)),'Pedido no reembolsable.',422);
      if(event.cancel_order) requireThat(['confirmed','preparing'].includes(order.state),'Solo se cancela con reposición antes del despacho.',409);
      requireThat(!((await db.query(`SELECT 1 FROM settlement_orders WHERE order_id=$1`,[order.id])).rowCount),'Cancela primero la liquidación pendiente/elegible; una liquidación programada/pagada requiere conciliación externa.',409);
      requireThat((event.amount_cents>0||(event.cancel_order&&order.refunded_cents===order.total_cents))&&event.amount_cents<=order.total_cents-order.refunded_cents,'Importe de reembolso inválido.',422);
      if(event.cancel_order) requireThat(event.amount_cents===order.total_cents-order.refunded_cents,'La cancelación requiere reembolso íntegro del saldo.');
      const refunded=order.refunded_cents+event.amount_cents;
      const commissionReturn=Math.floor(order.commission_cents*refunded/order.total_cents)-Math.floor(order.commission_cents*order.refunded_cents/order.total_cents);
      await db.query('UPDATE orders SET refunded_cents=$2 WHERE id=$1',[order.id,refunded]);
      await db.query(`INSERT INTO ledger_entries(order_id,kind,amount_cents,reference) VALUES($1,'refund',$2,$3),($1,'adjustment',$4,$5)`,[order.id,-event.amount_cents,`refund:${event.refund_id}`,commissionReturn,`commission-return:${event.refund_id}`]);
      await db.query(`INSERT INTO order_events(order_id,event,details) VALUES($1,'payment.refunded',$2)`,[order.id,{amount_cents:event.amount_cents,reason:event.reason||'',reference:event.refund_id,sandbox:true,restocked:false}]);
      if(event.cancel_order) {
        if(event.restock) {
          const items=(await db.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id',[order.id])).rows;
          for(const item of items) {
            const movement=await db.query(`INSERT INTO inventory_movements(product_id,checkout_id,kind,quantity,reference) VALUES($1,$2,'restock',$3,$4) ON CONFLICT(reference) DO NOTHING RETURNING id`,[item.product_id,c.id,item.quantity,`restock:${order.id}:${item.product_id}`]);
            if(movement.rowCount) await db.query('UPDATE inventory SET total=total+$2,updated_at=now() WHERE product_id=$1',[item.product_id,item.quantity]);
          }
        }
        await db.query(`UPDATE orders SET state='cancelled' WHERE id=$1`,[order.id]);
        await db.query(`INSERT INTO order_events(order_id,event,details) VALUES($1,'fulfillment.cancelled',$2)`,[order.id,{reason:event.reason,restocked:!!event.restock,sandbox:true}]);
      }
      const total=Number((await db.query('SELECT coalesce(sum(refunded_cents),0) AS n FROM orders WHERE purchase_id=$1',[order.purchase_id])).rows[0].n);
      const state=total===c.total_cents?'refunded':'partially_refunded';
      await db.query('UPDATE checkouts SET state=$2 WHERE id=$1',[c.id,state]);
      await db.query('UPDATE purchases SET payment_state=$2 WHERE checkout_id=$1',[c.id,state]);
      await notify(db,c.organization_id,'refund','Se registró un reembolso sandbox.',`/pedidos/${order.id}`);
      return {state};
    }
    if(['approved','partially_refunded','refunded'].includes(c.state)) return {ignored:true,state:c.state};
    if(event.kind==='approved') {
      const reservations=await paymentInventory(db,c.id);
      const valid=validPayment(c,reservations,buyer.status);
      await db.query(`UPDATE payment_attempts SET state='approved' WHERE id=$1`,[event.attempt_id]);
      if(!valid) {
        await releaseReservations(db,c.id);
        await db.query(`UPDATE checkouts SET state='exception' WHERE id=$1`,[c.id]);
        await db.query(`UPDATE purchases SET payment_state='exception' WHERE checkout_id=$1`,[c.id]);
        await db.query(`UPDATE orders SET state='payment_exception' WHERE purchase_id IN(SELECT id FROM purchases WHERE checkout_id=$1)`,[c.id]);
        const held=(await db.query('SELECT * FROM orders WHERE purchase_id IN(SELECT id FROM purchases WHERE checkout_id=$1)',[c.id])).rows;
        for(const o of held) {
          for(const [kind,amount] of [['products',o.subtotal_cents],['shipping',o.shipping_cents],['commission',-o.commission_cents]]) await db.query('INSERT INTO ledger_entries(order_id,kind,amount_cents,reference) VALUES($1,$2,$3,$4) ON CONFLICT(reference) DO NOTHING',[o.id,kind,amount,`${kind}:${o.id}`]);
          await db.query(`INSERT INTO order_events(order_id,event,details) VALUES($1,'payment.exception',$2)`,[o.id,{event_id:event.event_id,sandbox:true}]);
        }
        await audit(db,{},'payment.late_or_changed',c.id,{event_id:event.event_id});
        await notify(db,c.organization_id,'payment','Pago sandbox recibido sin reserva válida: requiere conciliación.','/pedidos');
        return {state:'exception'};
      }
      for(const r of reservations) {
        await db.query('UPDATE inventory SET total=total-$2,reserved=reserved-$2,updated_at=now() WHERE product_id=$1',[r.product_id,r.quantity]);
        await db.query(`UPDATE inventory_reservations SET state='consumed' WHERE id=$1`,[r.id]);
        await db.query(`INSERT INTO inventory_movements(product_id,checkout_id,kind,quantity,reference) VALUES($1,$2,'sold',$3,$4)`,[r.product_id,c.id,-r.quantity,`sold:${r.id}`]);
      }
      await db.query(`UPDATE checkouts SET state='approved' WHERE id=$1`,[c.id]);
      await db.query(`UPDATE purchases SET payment_state='approved' WHERE checkout_id=$1`,[c.id]);
      const orders=(await db.query(`UPDATE orders SET state='confirmed' WHERE purchase_id IN(SELECT id FROM purchases WHERE checkout_id=$1) RETURNING *`,[c.id])).rows;
      for(const order of orders) {
        for(const [kind,amount] of [['products',order.subtotal_cents],['shipping',order.shipping_cents],['commission',-order.commission_cents]]) await db.query('INSERT INTO ledger_entries(order_id,kind,amount_cents,reference) VALUES($1,$2,$3,$4)',[order.id,kind,amount,`${kind}:${order.id}`]);
        await db.query(`INSERT INTO order_events(order_id,event,details) VALUES($1,'payment.approved',$2)`,[order.id,{event_id:event.event_id,sandbox:true}]);
        const seller=(await db.query('SELECT organization_id FROM brands WHERE id=$1',[order.brand_id])).rows[0].organization_id;
        await notify(db,seller,'order','Nuevo pedido sandbox confirmado.',`/panel/pedidos/${order.id}`);
      }
      await db.query('DELETE FROM cart_items WHERE cart_id IN(SELECT id FROM carts WHERE organization_id=$1)',[c.organization_id]);
      await notify(db,c.organization_id,'payment','Compra sandbox confirmada.','/pedidos');
      return {state:'approved'};
    }
    if(c.state==='pending') {
      await releaseReservations(db,c.id);
      await db.query('UPDATE checkouts SET state=$2 WHERE id=$1',[c.id,event.kind]);
      await db.query('UPDATE payment_attempts SET state=$2 WHERE id=$1',[event.attempt_id,event.kind]);
      await db.query('UPDATE purchases SET payment_state=$2 WHERE checkout_id=$1',[c.id,event.kind]);
      await cancelPendingOrders(db,c.id,`payment.${event.kind}`);
      await notify(db,c.organization_id,'payment','El intento sandbox terminó sin confirmar la compra. Tu stock fue liberado.','/carrito');
    }
    return {state:event.kind};
  });
}
export const paymentRouter=Router();
export async function receiveSignedWebhook(raw,timestamp,signature) {
  requireThat(typeof timestamp==='string'&&/^\d+$/.test(timestamp)&&Math.abs(Date.now()/1000-Number(timestamp))<=300,'Firma expirada.',401);
  requireThat(Buffer.isBuffer(raw)&&equal(signature,signWebhook(raw,timestamp)),'Firma inválida.',401);
  let payload;try{payload=JSON.parse(raw.toString());}catch{requireThat(false,'JSON inválido.');}
  return applyPaymentEvent(payload);
}
paymentRouter.post('/webhooks/sandbox',async(req,res)=>{
  res.json(await receiveSignedWebhook(req.body,req.headers['x-lote-timestamp'],req.headers['x-lote-signature']));
});
paymentRouter.post('/checkout/:id/cancel',authenticated,verified,orgRole('buyer'),async(req,res)=>{
  const c=(await query(`SELECT id,state FROM checkouts WHERE id=$1 AND organization_id=$2`,[id.parse(req.params.id),req.org.id])).rows[0];
  requireThat(c&&c.state==='pending','No existe un checkout pendiente.',409);
  await expireCheckout(c.id,{force:true});res.json({message:'Reserva cancelada; no se realizó ningún cobro real.'});
});
paymentRouter.post('/payments/sandbox/:id/simulate',authenticated,verified,orgRole('buyer',{approved:true}),async(req,res)=>{
  requireThat(!config.production,'La simulación interactiva está deshabilitada en producción.',403);
  const {outcome}=parse(z.object({outcome:z.enum(['approved','failed','expired'])}),req.body);
  const attempt=(await query('SELECT pa.* FROM payment_attempts pa JOIN checkouts c ON c.id=pa.checkout_id WHERE pa.id=$1 AND c.organization_id=$2',[id.parse(req.params.id),req.org.id])).rows[0];
  requireThat(attempt,'Intento no encontrado.',404);
  if(outcome==='approved') {
    const eligible=await tx(async db=>{
      const buyer=await lockBuyer(db,req.org.id);
      const c=(await db.query('SELECT * FROM checkouts WHERE id=$1 FOR UPDATE',[attempt.checkout_id])).rows[0];
      if(['approved','partially_refunded','refunded'].includes(c.state))return true;
      return validPayment(c,await paymentInventory(db,c.id),buyer.status);
    });
    if(!eligible) {await expireCheckout(attempt.checkout_id,{force:true});requireThat(false,'Cambió la reserva, el precio o las condiciones. Revisa tu bolsa antes de iniciar otro pago sandbox.',409,'payment_review_required');}
  }
  const payload={event_id:`sandbox:${attempt.id}:${outcome}`,attempt_id:attempt.id,kind:outcome,amount_cents:attempt.amount_cents,occurred_at:attempt.created_at.toISOString()};
  // This is the sandbox provider adapter; it delivers its server-generated event through the same signature verifier.
  const raw=Buffer.from(JSON.stringify(payload)),timestamp=String(Math.floor(Date.now()/1000));
  res.json(await receiveSignedWebhook(raw,timestamp,signWebhook(raw,timestamp)));
});
paymentRouter.post('/admin/orders/:id/refund',authenticated,admin,async(req,res)=>{
  requireThat(!config.production,'Reembolso real no integrado.',503);
  const input=parse(z.object({amount_cents:cents,reason:text,reference:z.string().min(8).max(100)}),req.body);
  const order=(await query(`SELECT ord.id,pa.id AS attempt_id FROM orders ord JOIN purchases p ON p.id=ord.purchase_id JOIN payment_attempts pa ON pa.checkout_id=p.checkout_id WHERE ord.id=$1`,[id.parse(req.params.id)])).rows[0];
  requireThat(order,'Pedido no encontrado.',404);
  const previous=(await query('SELECT order_id,amount_cents FROM ledger_entries WHERE reference=$1',[`refund:${input.reference}`])).rows[0];
  if(previous) {requireThat(previous.order_id===order.id&&previous.amount_cents===-input.amount_cents,'Referencia reutilizada con otro reembolso.',409);return res.json({duplicate:true});}
  const result=await applyPaymentEvent({event_id:`refund:${input.reference}`,attempt_id:order.attempt_id,kind:'refund',amount_cents:input.amount_cents,occurred_at:new Date().toISOString(),order_id:order.id,refund_id:input.reference,reason:input.reason});
  await audit({query},req,'refund.sandbox',order.id,{reference:input.reference,amount_cents:input.amount_cents});res.json(result);
});
paymentRouter.post('/admin/orders/:id/cancel',authenticated,admin,async(req,res)=>{
  requireThat(!config.production,'Cancelación con reembolso real no integrada.',503);
  const input=parse(z.object({reason:text,reference:z.string().min(8).max(100),restock:z.boolean()}),req.body);
  const order=(await query(`SELECT ord.*,pa.id AS attempt_id,pa.created_at AS attempted_at FROM orders ord JOIN purchases p ON p.id=ord.purchase_id JOIN payment_attempts pa ON pa.checkout_id=p.checkout_id WHERE ord.id=$1`,[id.parse(req.params.id)])).rows[0];requireThat(order,'Pedido no encontrado.',404);
  const previous=(await query('SELECT order_id FROM ledger_entries WHERE reference=$1',[`refund:cancel:${input.reference}`])).rows[0];
  if(previous) {requireThat(previous.order_id===order.id,'Referencia usada en otro pedido.',409);return res.json({duplicate:true});}
  const result=await applyPaymentEvent({event_id:`cancel:${input.reference}`,attempt_id:order.attempt_id,kind:'refund',order_id:order.id,refund_id:`cancel:${input.reference}`,amount_cents:order.total_cents-order.refunded_cents,occurred_at:order.attempted_at.toISOString(),reason:input.reason,cancel_order:true,restock:input.restock});
  await audit({query},req,'order.cancelled.sandbox',order.id,{reference:input.reference,restock:input.restock});res.json(result);
});
