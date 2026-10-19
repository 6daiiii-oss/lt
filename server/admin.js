import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { config } from './config.js';
import { admin, authenticated } from './auth.js';
import { audit, decrypt, id, notify, parse, requireThat, sumMoney, text } from './lib.js';
import { settingsSchema } from './settings.js';
export const adminRouter=Router();adminRouter.use(authenticated,admin);
adminRouter.get('/summary',async(req,res)=>{
  const counts=(await query(`SELECT (SELECT count(*) FROM business_verifications WHERE status='pending')::int AS verifications,
   (SELECT count(*) FROM products WHERE status='pending')::int AS catalog_pending,(SELECT count(*) FROM incidents WHERE state IN ('open','in_review'))::int AS incidents,
   (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM checkouts WHERE state='exception')::int AS reconciliation,
   (SELECT coalesce(sum(ord.subtotal_cents),0) FROM orders ord JOIN purchases p ON p.id=ord.purchase_id WHERE p.payment_state IN ('approved','partially_refunded','refunded'))::bigint AS gmv_cents`)).rows[0];res.json(counts);
});
adminRouter.get('/organizations',async(req,res)=>res.json((await query('SELECT id,kind,name,legal_name,tax_id,business_type,contact_email,phone,origin_address,status,status_reason,payout_encrypted IS NOT NULL AS has_payout_details FROM organizations ORDER BY created_at DESC LIMIT 500')).rows));
adminRouter.post('/organizations/:id/status',async(req,res)=>{
  const input=parse(z.object({status:z.enum(['approved','rejected','suspended','pending']),reason:text}),req.body);
  await tx(async db=>{
    const org=(await db.query('UPDATE organizations SET status=$2,status_reason=$3 WHERE id=$1 RETURNING id',[id.parse(req.params.id),input.status,input.reason])).rows[0];requireThat(org,'Organización no encontrada.',404);
    await audit(db,req,'organization.status',org.id,input);await notify(db,org.id,'verification',`Estado de negocio actualizado: ${input.status}.`,'/cuenta/perfil');
  });res.json({message:'Estado actualizado. Se conserva el historial de pedidos; se restringen compras/catálogo si no está aprobado.'});
});
adminRouter.get('/organizations/:id/payout',async(req,res)=>{
  const org=(await query('SELECT id,payout_encrypted FROM organizations WHERE id=$1',[id.parse(req.params.id)])).rows[0];requireThat(org,'Organización no encontrada.',404);
  await audit({query},req,'payout.viewed',org.id);res.json({details:decrypt(org.payout_encrypted)});
});
adminRouter.get('/verifications',async(req,res)=>res.json((await query(`SELECT v.*,o.name,o.kind,o.legal_name,o.tax_id,o.business_type,o.origin_address,
  (SELECT json_agg(json_build_object('id',a.id,'mime',a.mime)) FROM attachments a WHERE a.organization_id=o.id AND NOT a.public AND a.incident_id IS NULL) AS documents
  FROM business_verifications v JOIN organizations o ON o.id=v.organization_id ORDER BY v.created_at DESC LIMIT 300`)).rows));
adminRouter.post('/verifications/:id/review',async(req,res)=>{
  const input=parse(z.object({status:z.enum(['approved','rejected','correction']),reason:text}),req.body);
  await tx(async db=>{
    const v=(await db.query(`UPDATE business_verifications SET status=$2,reason=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING *`,[id.parse(req.params.id),input.status,input.reason,req.user.id])).rows[0];requireThat(v,'Solicitud no pendiente.',409);
    await db.query('UPDATE organizations SET status=$2,status_reason=$3 WHERE id=$1',[v.organization_id,input.status==='correction'?'pending':input.status,input.reason]);
    await audit(db,req,'verification.reviewed',v.id,input);await notify(db,v.organization_id,'verification','Tu solicitud comercial recibió una respuesta.','/cuenta/perfil');
  });res.json({message:'Revisión guardada.'});
});
adminRouter.get('/catalog',async(req,res)=>res.json((await query(`SELECT p.*,b.name AS brand_name,o.status AS seller_status FROM products p JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id ORDER BY (p.status='pending') DESC,p.updated_at DESC LIMIT 500`)).rows));
adminRouter.post('/catalog/:id/review',async(req,res)=>{
  const input=parse(z.object({status:z.enum(['published','blocked','pending']),reason:text}),req.body);
  await tx(async db=>{
    const p=(await db.query(`SELECT p.id,o.status,b.terms_approved FROM products p JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id WHERE p.id=$1 FOR UPDATE OF p`,[id.parse(req.params.id)])).rows[0];requireThat(p,'Producto no encontrado.',404);
    if(input.status==='published') requireThat(p.status==='approved'&&p.terms_approved,'La marca requiere verificación y condiciones completas.',422);
    await db.query(`UPDATE products SET status=$2,review_reason=$3,published_at=CASE WHEN $2='published' THEN coalesce(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=$1`,[p.id,input.status,input.reason]);await audit(db,req,'catalog.reviewed',p.id,input);
  });res.json({message:'Moderación guardada.'});
});
adminRouter.post('/categories',async(req,res)=>{
  const v=parse(z.object({id:z.string().regex(/^[a-z0-9-]{1,60}$/),name:text,parent_id:z.string().max(60).nullable().default(null)}),req.body);
  requireThat(v.id!==v.parent_id,'Categoría circular.');
  if(v.parent_id) requireThat((await query('SELECT 1 FROM categories WHERE id=$1 AND parent_id IS NULL',[v.parent_id])).rowCount,'Solo se admite categoría y subcategoría.');
  if(v.parent_id) requireThat(!(await query('SELECT 1 FROM categories WHERE parent_id=$1',[v.id])).rowCount,'Una categoría con subcategorías no puede convertirse en subcategoría.');
  await query('INSERT INTO categories(id,name,parent_id) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,parent_id=$3',[v.id,v.name,v.parent_id]);await audit({query},req,'category.upsert',v.id);res.status(201).json(v);
});
adminRouter.get('/orders',async(req,res)=>{
  const input=parse(z.object({q:z.string().max(100).default(''),state:z.string().max(40).optional(),payment_state:z.string().max(40).optional(),from:z.iso.date().optional(),to:z.iso.date().optional()}),req.query);
  res.json((await query(`SELECT o.*,b.name AS brand_name,buyer.name AS buyer_name,p.payment_state,c.state AS checkout_state FROM orders o JOIN brands b ON b.id=o.brand_id JOIN organizations buyer ON buyer.id=o.buyer_id JOIN purchases p ON p.id=o.purchase_id JOIN checkouts c ON c.id=p.checkout_id
   WHERE (o.id::text ILIKE $1 OR b.name ILIKE $1 OR buyer.name ILIKE $1) AND ($2::text IS NULL OR o.state=$2) AND ($3::text IS NULL OR p.payment_state=$3)
   AND ($4::date IS NULL OR o.created_at>=($4::date::timestamp AT TIME ZONE 'America/Lima')) AND ($5::date IS NULL OR o.created_at<(($5::date+1)::timestamp AT TIME ZONE 'America/Lima')) ORDER BY o.created_at DESC LIMIT 300`,['%'+input.q+'%',input.state||null,input.payment_state||null,input.from||null,input.to||null])).rows);
});
adminRouter.get('/payments',async(req,res)=>res.json((await query(`SELECT pa.*,c.state AS checkout_state,c.expires_at,(SELECT json_agg(json_build_object('product_id',product_id,'quantity',quantity,'state',state)) FROM inventory_reservations WHERE checkout_id=c.id) AS reservations FROM payment_attempts pa JOIN checkouts c ON c.id=pa.checkout_id ORDER BY pa.created_at DESC LIMIT 300`)).rows));
adminRouter.get('/commissions',async(req,res)=>res.json((await query('SELECT * FROM commission_rules ORDER BY effective_at DESC LIMIT 200')).rows));
adminRouter.post('/commissions',async(req,res)=>{
  const input=parse(z.object({brand_id:id.nullable().default(null),basis_points:z.number().int().min(0).max(10000),effective_at:z.iso.datetime()}),req.body);
  const result=await tx(async db=>{const r=(await db.query('INSERT INTO commission_rules(brand_id,basis_points,effective_at,approved_by) VALUES($1,$2,$3,$4) RETURNING *',[input.brand_id,input.basis_points,input.effective_at,req.user.id])).rows[0];await audit(db,req,'commission.created',r.id,{...input,sandbox:true});return r;});res.status(201).json(result);
});
adminRouter.get('/incidents',async(req,res)=>res.json((await query(`SELECT i.*,b.name AS brand_name FROM incidents i JOIN orders o ON o.id=i.order_id JOIN brands b ON b.id=o.brand_id ORDER BY i.created_at DESC LIMIT 300`)).rows));
adminRouter.post('/incidents/:id/resolve',async(req,res)=>{
  const input=parse(z.object({state:z.enum(['in_review','resolved','rejected']),resolution:text,assigned_to:id.optional()}),req.body);
  const actor=input.assigned_to||req.user.id;requireThat((await query('SELECT 1 FROM users WHERE id=$1 AND is_admin',[actor])).rowCount,'Responsable inválido.');
  await tx(async db=>{
    const i=(await db.query('UPDATE incidents SET state=$2,resolution=$3,assigned_to=$4 WHERE id=$1 RETURNING *',[id.parse(req.params.id),input.state,input.resolution,actor])).rows[0];requireThat(i,'Incidencia no encontrada.',404);
    const o=(await db.query('SELECT o.buyer_id,b.organization_id AS seller_id FROM orders o JOIN brands b ON b.id=o.brand_id WHERE o.id=$1',[i.order_id])).rows[0];
    await notify(db,o.buyer_id,'incident','Actualización de incidencia.',`/incidencias/${i.id}`);await notify(db,o.seller_id,'incident','Actualización de incidencia.',`/incidencias/${i.id}`);await audit(db,req,'incident.resolved',i.id,input);
  });res.json({message:'Resolución registrada. Los reembolsos se autorizan en una acción separada.'});
});
adminRouter.get('/reviews',async(req,res)=>res.json((await query('SELECT r.*,oi.snapshot FROM reviews r JOIN order_items oi ON oi.id=r.order_item_id ORDER BY r.created_at DESC LIMIT 300')).rows));
adminRouter.post('/reviews/:id/moderate',async(req,res)=>{
  const input=parse(z.object({status:z.enum(['published','hidden']),reason:text}),req.body);
  await query('UPDATE reviews SET status=$2,moderation_reason=$3 WHERE id=$1',[id.parse(req.params.id),input.status,input.reason]);await audit({query},req,'review.moderated',req.params.id,input);res.json({message:'Moderación guardada.'});
});
adminRouter.get('/settlements',async(req,res)=>res.json((await query(`SELECT s.*,b.name AS brand_name FROM settlements s JOIN brands b ON b.id=s.brand_id ORDER BY s.created_at DESC LIMIT 300`)).rows));
adminRouter.get('/settlements/candidates',async(req,res)=>res.json((await query(`SELECT o.*,b.name AS brand_name,(SELECT sum(amount_cents) FROM ledger_entries WHERE order_id=o.id)::bigint AS net_cents FROM orders o JOIN brands b ON b.id=o.brand_id JOIN purchases p ON p.id=o.purchase_id
  WHERE o.state='delivered' AND p.payment_state IN ('approved','partially_refunded','refunded') AND NOT EXISTS(SELECT 1 FROM settlement_orders WHERE order_id=o.id) AND NOT EXISTS(SELECT 1 FROM incidents WHERE order_id=o.id AND state IN ('open','in_review')) ORDER BY o.created_at`)).rows));
adminRouter.post('/settlements',async(req,res)=>{
  const input=parse(z.object({brand_id:id,order_ids:z.array(id).min(1).max(100)}),req.body);requireThat(new Set(input.order_ids).size===input.order_ids.length,'Pedidos duplicados.');
  const result=await tx(async db=>{
    const orders=(await db.query(`SELECT o.* FROM orders o JOIN purchases p ON p.id=o.purchase_id WHERE o.id=ANY($1::uuid[]) AND o.brand_id=$2 AND o.state='delivered' AND p.payment_state IN ('approved','partially_refunded','refunded') AND NOT EXISTS(SELECT 1 FROM incidents WHERE order_id=o.id AND state IN ('open','in_review')) ORDER BY o.id FOR UPDATE OF o`,[input.order_ids,input.brand_id])).rows;
    requireThat(orders.length===input.order_ids.length,'Pedidos no elegibles para liquidación.',422);
    const amount=Number((await db.query('SELECT coalesce(sum(amount_cents),0) AS n FROM ledger_entries WHERE order_id=ANY($1::uuid[])',[input.order_ids])).rows[0].n);sumMoney([amount]);
    const row=(await db.query('INSERT INTO settlements(brand_id,amount_cents,orders_snapshot) VALUES($1,$2,$3) RETURNING *',[input.brand_id,amount,JSON.stringify(orders.map(o=>({id:o.id,total_cents:o.total_cents,commission_cents:o.commission_cents,refunded_cents:o.refunded_cents})))])).rows[0];
    for(const o of orders) await db.query('INSERT INTO settlement_orders(settlement_id,order_id) VALUES($1,$2)',[row.id,o.id]);await audit(db,req,'settlement.created',row.id,{amount_cents:amount,orders:input.order_ids,sandbox:true});return row;
  });res.status(201).json(result);
});
adminRouter.post('/settlements/:id/state',async(req,res)=>{
  const input=parse(z.object({state:z.enum(['eligible','scheduled','paid','cancelled']),reference:z.string().max(150).optional(),evidence:z.string().max(1000).optional()}),req.body);
  await tx(async db=>{
    const s=(await db.query('SELECT * FROM settlements WHERE id=$1 FOR UPDATE',[id.parse(req.params.id)])).rows[0];requireThat(s,'Liquidación no encontrada.',404);
    const allowed={pending:['eligible','cancelled'],eligible:['scheduled','cancelled'],scheduled:['paid'],paid:[],cancelled:[]};requireThat(allowed[s.state].includes(input.state),'Transición de liquidación inválida.',409);
    if(input.state!=='cancelled') {
      const orders=(await db.query(`SELECT o.* FROM settlement_orders so JOIN orders o ON o.id=so.order_id WHERE so.settlement_id=$1 ORDER BY o.id FOR UPDATE OF o`,[s.id])).rows;
      requireThat(orders.length>0&&orders.every(o=>o.state==='delivered'),'Los pedidos dejaron de ser elegibles.',409);
      const active=(await db.query(`SELECT 1 FROM incidents WHERE order_id=ANY($1::uuid[]) AND state IN ('open','in_review') LIMIT 1`,[orders.map(o=>o.id)])).rowCount;
      requireThat(!active,'Una incidencia abierta impide avanzar la liquidación.',409);
      const net=Number((await db.query(`SELECT coalesce(sum(amount_cents),0) AS n FROM ledger_entries WHERE order_id=ANY($1::uuid[])`,[orders.map(o=>o.id)])).rows[0].n);
      requireThat(net===s.amount_cents,'Los movimientos cambiaron. Cancela y prepara una nueva liquidación.',409);
    }
    if(input.state==='paid') {requireThat(!config.production,'Transferencia real no integrada.',503);requireThat(/^sandbox:[\w-]{8,}$/.test(input.reference||'')&&(input.evidence||'').length>=8,'Requiere referencia sandbox:… y evidencia de simulación.');}
    await db.query('UPDATE settlements SET state=$2,payment_reference=$3,evidence_note=$4,paid_at=CASE WHEN $2=\'paid\' THEN now() ELSE paid_at END WHERE id=$1',[s.id,input.state,input.reference||null,input.evidence||null]);
    if(input.state==='cancelled') await db.query('DELETE FROM settlement_orders WHERE settlement_id=$1',[s.id]);
    await audit(db,req,'settlement.state',s.id,{state:input.state,reference:input.reference,sandbox:true});
  });res.json({message:'Estado de liquidación sandbox actualizado.'});
});
adminRouter.get('/settings',async(req,res)=>res.json({reservationMinutes:config.reservationMinutes,stockMaxAgeHours:config.stockMaxAgeHours,newDays:config.newDays,importMaxRows:config.importMaxRows,coverageRegions:config.coverageRegions||[]}));
adminRouter.put('/settings',async(req,res)=>{
  const input=parse(settingsSchema,req.body);
  await tx(async db=>{for(const [key,value] of Object.entries(input)) await db.query('INSERT INTO platform_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,updated_by=$3,updated_at=now()',[key,JSON.stringify(value),req.user.id]);await audit(db,req,'settings.updated','platform',input);});Object.assign(config,input);res.json({message:'Configuración guardada.'});
});
adminRouter.get('/audit',async(req,res)=>res.json((await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300')).rows));
adminRouter.get('/sync-runs',async(req,res)=>res.json((await query('SELECT r.*,s.brand_id FROM sync_runs r JOIN catalog_sources s ON s.id=r.source_id ORDER BY r.started_at DESC LIMIT 200')).rows));
adminRouter.get('/sources',async(req,res)=>res.json((await query('SELECT s.*,b.name AS brand_name FROM catalog_sources s JOIN brands b ON b.id=s.brand_id ORDER BY s.created_at DESC LIMIT 300')).rows));
adminRouter.post('/sources/:id/approve',async(req,res)=>{
  const input=parse(z.object({approved:z.boolean(),enabled:z.boolean()}),req.body);
  const source=(await query('SELECT * FROM catalog_sources WHERE id=$1',[id.parse(req.params.id)])).rows[0];requireThat(source,'Fuente no encontrada.',404);
  requireThat(config.feedOrigins.includes(new URL(source.url).origin),'Origen no autorizado por el operador.');
  await query('UPDATE catalog_sources SET approved=$2,enabled=$3 WHERE id=$1',[source.id,input.approved,input.approved&&input.enabled]);await audit({query},req,'source.approved',source.id,input);res.json({message:'Fuente revisada.'});
});
