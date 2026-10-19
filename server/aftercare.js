import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { authenticated, orgRole, verified } from './auth.js';
import { accessibleOrder } from './commerce.js';
import { audit, id, notify, parse, requireThat, text } from './lib.js';
export const aftercareRouter=Router();
aftercareRouter.use(authenticated);
aftercareRouter.post('/orders/:id/delivery',verified,orgRole('buyer'),async(req,res)=>{
  await tx(async db=>{
    const order=await accessibleOrder(db,req,id.parse(req.params.id),{lock:true});requireThat(order.buyer_id===req.org.id,'Pedido ajeno.',404);requireThat(order.state==='shipped','Solo puedes confirmar un pedido enviado.',409);
    await db.query(`UPDATE orders SET state='delivered' WHERE id=$1`,[order.id]);
    await db.query(`UPDATE shipments SET delivered_at=now(),delivery_reference=$2 WHERE order_id=$1`,[order.id,`receipt-confirmed-by:${req.user.id}`]);
    await db.query(`INSERT INTO order_events(order_id,actor_id,event) VALUES($1,$2,'fulfillment.delivered_by_buyer')`,[order.id,req.user.id]);
    await notify(db,order.seller_id,'delivery','La tienda confirmó la entrega.',`/panel/pedidos/${order.id}`);
  });res.json({message:'Entrega confirmada.'});
});
aftercareRouter.post('/reviews',verified,orgRole('buyer'),async(req,res)=>{
  const input=parse(z.object({order_item_id:id,rating:z.number().int().min(1).max(5),body:z.string().trim().min(10).max(2000)}),req.body);
  const result=await tx(async db=>{
    const item=(await db.query(`SELECT oi.id,o.buyer_id,o.state,p.payment_state FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN purchases p ON p.id=o.purchase_id WHERE oi.id=$1 FOR UPDATE OF o`,[input.order_item_id])).rows[0];
    requireThat(item?.buyer_id===req.org.id&&item.state==='delivered'&&['approved','partially_refunded','refunded'].includes(item.payment_state),'Solo puedes reseñar una compra entregada de tu tienda.',403);
    const review=(await db.query('INSERT INTO reviews(order_item_id,buyer_id,rating,body) VALUES($1,$2,$3,$4) RETURNING id',[item.id,req.org.id,input.rating,input.body])).rows[0];
    await audit(db,req,'review.created',review.id);return review;
  });res.status(201).json({...result,message:'Reseña enviada a moderación.'});
});
aftercareRouter.post('/orders/:id/incidents',verified,async(req,res)=>{
  const input=parse(z.object({reason:text,description:z.string().trim().min(10).max(4000)}),req.body);
  const result=await tx(async db=>{
    const order=await accessibleOrder(db,req,id.parse(req.params.id));
    const incident=(await db.query('INSERT INTO incidents(order_id,created_by,reason,description) VALUES($1,$2,$3,$4) RETURNING id',[order.id,req.user.id,input.reason,input.description])).rows[0];
    await notify(db,req.org.id===order.buyer_id?order.seller_id:order.buyer_id,'incident','Se abrió una incidencia en un pedido.',`/incidencias/${incident.id}`);
    await audit(db,req,'incident.opened',incident.id);return incident;
  });res.status(201).json(result);
});
aftercareRouter.get('/incidents/:id',async(req,res)=>{
  const incident=(await query('SELECT * FROM incidents WHERE id=$1',[id.parse(req.params.id)])).rows[0];requireThat(incident,'Incidencia no encontrada.',404);await accessibleOrder({query},req,incident.order_id);
  res.json({...incident,messages:(await query('SELECT id,message,created_at,user_id FROM incident_messages WHERE incident_id=$1 ORDER BY created_at',[incident.id])).rows,evidence:(await query('SELECT id,mime,size FROM attachments WHERE incident_id=$1',[incident.id])).rows});
});
aftercareRouter.post('/incidents/:id/messages',verified,async(req,res)=>{
  const {message}=parse(z.object({message:z.string().trim().min(1).max(4000)}),req.body);
  const i=(await query('SELECT * FROM incidents WHERE id=$1',[id.parse(req.params.id)])).rows[0];requireThat(i,'Incidencia no encontrada.',404);const order=await accessibleOrder({query},req,i.order_id);
  await tx(async db=>{await db.query('INSERT INTO incident_messages(incident_id,user_id,message) VALUES($1,$2,$3)',[i.id,req.user.id,message]);await notify(db,req.org?.id===order.buyer_id?order.seller_id:order.buyer_id,'incident','Nueva respuesta en una incidencia.',`/incidencias/${i.id}`);});res.status(201).json({message:'Respuesta guardada.'});
});
