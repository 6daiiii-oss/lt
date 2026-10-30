import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, fixtures, product } from './helpers.js';
let isolated,db,app,server,base,accounts,config,services;
before(async()=>{
  isolated=await isolatedDatabase();
  db=await import('../server/db.js');await db.migrate();
  ({config}=await import('../server/config.js'));
  services=await import('../server/payments.js');
  app=(await import('../server/app.js')).createApp({testing:true});
  server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
beforeEach(async()=>{
  await db.query('TRUNCATE users,organizations RESTART IDENTITY CASCADE');
  config.coverageRegions=[];config.feedOrigins=[];config.sandboxBps=0;config.smsProvider='sandbox';config.production=false;config.purchasesEnabled=true;
  accounts=await fixtures(db);
});
after(async()=>{if(server){await new Promise(resolve=>server.close(resolve));}if(db)await db.pool.end();if(isolated)await isolated.drop();});
async function request(method,path,body,user,headers={}) {
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:config.origin,...(user?{Cookie:user.cookie,'X-CSRF-Token':user.csrf,...(user.orgId?{'X-Organization-Id':user.orgId}:{})}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const data=await response.json();return {status:response.status,data,headers:response.headers};
}
const post=(path,body,user,headers)=>request('POST',path,body,user,headers);

test('fichas de exhibición no son inventario ni se pueden comprar aun con compras habilitadas',async()=>{
 const listing=await request('GET','/products');assert.equal(listing.data.total,0);
 assert.equal((await post('/cart/items',{product_id:'exh-01',quantity:1,expected_price_cents:100},accounts.buyerA)).status,422);
 assert.equal((await post('/favorites',{product_id:'exh-01'},accounts.buyerA)).status,422);
 assert.equal((await db.query('SELECT count(*) AS n FROM cart_items')).rows[0].n,'0');
 assert.equal((await db.query('SELECT count(*) AS n FROM products')).rows[0].n,'0');
});

test('favoritos lista productos y marcas sin ambigüedad SQL y mantiene aislamiento entre tiendas',async()=>{
 const p=await product(db,accounts.sellerA,{name:'Producto guardado'});
 assert.equal((await request('GET','/favorites',undefined)).status,401);
 assert.equal((await request('GET','/favorites',undefined,accounts.sellerA)).status,403);
 assert.equal((await post('/favorites',{product_id:p.id},accounts.buyerA)).status,201);
 assert.equal((await post('/favorites',{brand_id:accounts.sellerB.brandId},accounts.buyerA)).status,201);
 const own=await request('GET','/favorites',undefined,accounts.buyerA);assert.equal(own.status,200);assert.equal(own.data.length,2);assert.ok(own.data.some(f=>f.product_name==='Producto guardado'));assert.ok(own.data.some(f=>f.brand_name==='DEMO Marca B'));
 assert.deepEqual((await request('GET','/favorites',undefined,accounts.buyerB)).data,[]);
 assert.equal((await request('GET','/favorites',undefined,accounts.buyerB,{'X-Organization-Id':accounts.buyerA.orgId})).status,403);
 await request('DELETE','/favorites/'+own.data[0].id,undefined,accounts.buyerB);
 assert.equal((await request('GET','/favorites',undefined,accounts.buyerA)).data.length,2);
 await request('DELETE','/favorites/'+own.data[0].id,undefined,accounts.buyerA);
 assert.equal((await request('GET','/favorites',undefined,accounts.buyerA)).data.length,1);
});
test('el carrito comprueba la dirección elegida y explica la región que impide comprar',async()=>{
  const p=await product(db,accounts.sellerA);await putInCart(accounts.buyerA,p);
  await db.query("UPDATE brands SET shipping_regions=ARRAY['arequipa'] WHERE id=$1",[accounts.sellerA.brandId]);
  const cart=await request('GET','/cart?address_id='+accounts.buyerA.addressId,undefined,accounts.buyerA);
  assert.equal(cart.data.eligible,false);assert.match(cart.data.groups[0].issues[0],/no envía a Lima/);
  assert.match(cart.data.groups[0].issues[0],/Arequipa/);
  const blocked=await checkout(accounts.buyerA);assert.equal(blocked.status,422);
  assert.match(blocked.data.message,/no envía a Lima/);assert.ok(Array.isArray(blocked.data.details));
  assert.equal((await db.query('SELECT count(*) FROM checkouts')).rows[0].count,'0');
  assert.equal((await request('GET','/cart?address_id='+accounts.buyerB.addressId,undefined,accounts.buyerA)).status,404);
  await db.query("UPDATE brands SET shipping_regions=ARRAY['lima'] WHERE id=$1",[accounts.sellerA.brandId]);
  assert.equal((await request('GET','/cart?address_id='+accounts.buyerA.addressId,undefined,accounts.buyerA)).data.eligible,true);
  assert.equal((await checkout(accounts.buyerA)).status,201);
});
test('regiones de envío y dirección rechazan texto libre inválido y aceptan tildes',async()=>{
  const body={name:'Marca de prueba',story:'',location:'Lima',min_order_cents:0,shipping_cents:0,shipping_regions:['ww'],preparation_days:2,shipping_policy:'Entrega coordinada.',return_policy:'Problemas sujetos a revisión.',terms_approved:true};
  assert.equal((await request('PUT','/seller/brand',body,accounts.sellerA)).status,422);
  assert.equal((await request('PUT','/seller/brand',{...body,shipping_regions:['Áncash','Lima']},accounts.sellerA)).status,200);
  assert.deepEqual((await db.query('SELECT shipping_regions FROM brands WHERE id=$1',[accounts.sellerA.brandId])).rows[0].shipping_regions,['ancash','lima']);
  const address={recipient:'Persona de prueba',line1:'Calle de ejemplo',district:'Distrito de ejemplo',region:'ww',phone:'999999999'};
  assert.equal((await post('/organizations/me/addresses',address,accounts.buyerA)).status,422);
  assert.equal((await post('/organizations/me/addresses',{...address,region:'Áncash'},accounts.buyerA)).data.region,'Áncash');
});
test('las cuentas rápidas de demo nunca habilitan acceso en la base normal',async()=>{
  const info=await request('GET','/demo/info');assert.equal(info.data.enabled,false);
  assert.equal((await post('/demo/login',{role:'admin'})).status,404);
  const before=config.demo;config.demo=true;
  try {assert.equal((await post('/demo/login',{role:'admin'})).status,404);}finally{config.demo=before;}
});
test('publicación distingue negocio aprobado de condiciones pendientes y publica tras confirmarlas',async()=>{
  const seller=accounts.sellerA,p=await product(db,seller);
  await db.query("UPDATE products SET status='pending' WHERE id=$1",[p.id]);
  await db.query('UPDATE brands SET terms_approved=false WHERE id=$1',[seller.brandId]);
  const review={status:'published',reason:'Producto revisado'};
  const blocked=await post('/admin/catalog/'+p.id+'/review',review,accounts.admin);
  assert.equal(blocked.status,422);assert.equal(blocked.data.code,'brand_terms_required');
  assert.match(blocked.data.message,/ya está aprobada/);
  assert.equal((await request('GET','/products/'+p.id)).status,404);
  const catalog=(await request('GET','/admin/catalog',undefined,accounts.admin)).data;
  assert.equal(catalog.find(item=>item.id===p.id).terms_approved,false);
  const updated=await request('PUT','/seller/brand',{name:'Marca de prueba',story:'',location:'Lima',min_order_cents:0,shipping_cents:300,shipping_regions:['lima'],preparation_days:2,shipping_policy:'Despacho en dos días.',return_policy:'Reportar faltantes o daños para revisión.',terms_approved:true},seller);
  assert.equal(updated.status,200);
  await db.query("UPDATE organizations SET status='pending' WHERE id=$1",[seller.orgId]);
  assert.equal((await post('/admin/catalog/'+p.id+'/review',review,accounts.admin)).data.code,'seller_not_approved');
  await db.query("UPDATE organizations SET status='approved' WHERE id=$1",[seller.orgId]);
  assert.equal((await post('/admin/catalog/'+p.id+'/review',review,accounts.admin)).status,200);
  assert.equal((await request('GET','/products/'+p.id)).status,200);
});
test('precio final sin recargo: edición conserva precios y compradores no ven comisión ni precio base',async()=>{
  const {priceForBuyer}=await import('../server/pricing.js');
  assert.equal(priceForBuyer(10000),10000);assert.equal(priceForBuyer(105),105);assert.equal(priceForBuyer(1),1);
  const input={name:'Prueba de precios',sku:'PRICE-1',category_id:'hogar',wholesale_cents:10000,moq:1,stock:10,submit_for_review:true};
  assert.equal((await post('/seller/products',input,accounts.buyerA)).status,403);
  const created=await post('/seller/products',input,accounts.sellerA);assert.equal(created.status,201);
  const pid=created.data.id;
  const own=(await request('GET','/seller/products',undefined,accounts.sellerA)).data.find(p=>p.id===pid);
  assert.equal(own.wholesale_cents,10000);assert.equal(own.customer_price_cents,10000);
  assert.equal((await request('PUT','/seller/products/'+pid,input,accounts.sellerA)).status,200);
  await db.query("UPDATE products SET status='published',published_at=now() WHERE id=$1",[pid]);
  const publicProduct=(await request('GET','/products/'+pid)).data;
  assert.equal(publicProduct.wholesale_cents,10000);assert.equal('supplier_cents' in publicProduct,false);
  await putInCart(accounts.buyerA,{id:pid,moq:1,wholesale_cents:10000});
  const c=await checkout(accounts.buyerA);assert.equal(c.status,201);
  const oid=(await db.query('SELECT id FROM orders WHERE purchase_id=$1',[c.data.purchase_id])).rows[0].id;
  for(const data of [(await request('GET','/orders',undefined,accounts.buyerA)).data[0],(await request('GET','/orders/'+oid,undefined,accounts.buyerA)).data]) {
    assert.equal('commission_cents' in data,false);assert.equal('commission_bps' in data,false);
    assert.equal(JSON.stringify(data).includes('supplier_'),false);assert.equal(JSON.stringify(data).includes('commission'),false);
  }
  const seller=(await request('GET','/orders/'+oid,undefined,accounts.sellerA)).data;
  assert.equal(seller.commission_cents,700);assert.equal(seller.subtotal_cents,10000);
});
test('SMS local: titular, intentos persistentes, reuso, cooldown y verificación obligatoria',async()=>{
  const user=accounts.buyerA;
  const p=await product(db,accounts.sellerA);await putInCart(user,p);
  await db.query('UPDATE users SET phone_verified_at=NULL WHERE id=$1',[user.userId]);
  assert.equal((await checkout(user)).data.code,'phone_unverified');
  assert.equal((await post('/auth/phone/send',{phone:'123456'},user)).status,422);
  const sent=await post('/auth/phone/send',{phone:'+51 987 654 321'},user);assert.equal(sent.status,201);
  assert.equal('code' in sent.data,false);
  assert.equal((await post('/auth/phone/send',{phone:'+51987654321'},user)).status,429);
  const other=(await request('GET','/dev/sms',undefined,accounts.buyerB)).data;assert.deepEqual(other,[]);
  const sms=(await request('GET','/dev/sms',undefined,user)).data[0];
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},accounts.buyerB)).status,422);
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:'000000'},user)).status,422);
  assert.equal((await db.query('SELECT attempts FROM phone_verifications WHERE id=$1',[sent.data.id])).rows[0].attempts,1);
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},user)).status,200);
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},user)).status,422);
  assert.equal((await request('GET','/me',undefined,user)).data.user.phone,'+51987654321');
  assert.equal((await checkout(user)).status,201);
  config.production=true;
  assert.equal((await request('GET','/dev/sms',undefined,user)).status,404);
  assert.equal((await post('/auth/phone/send',{phone:'+51987654322'},user)).status,503);
});
test('SMS bloquea tras 5 intentos y rechaza códigos caducados; marcas sin celular no crean productos',async()=>{
  const user=accounts.sellerA;
  await db.query('UPDATE users SET phone_verified_at=NULL WHERE id=$1',[user.userId]);
  assert.equal((await post('/seller/products',{},user)).data.code,'phone_unverified');
  const sent=(await post('/auth/phone/send',{phone:'+51987654322'},user)).data;
  const sms=(await request('GET','/dev/sms',undefined,user)).data[0];
  for(let n=0;n<5;n++)assert.equal((await post('/auth/phone/verify',{id:sent.id,code:'000000'},user)).status,422);
  assert.equal((await post('/auth/phone/verify',{id:sent.id,code:sms.code},user)).status,422);
  await db.query("UPDATE phone_verifications SET attempts=0,expires_at=now()-interval '1 second' WHERE id=$1",[sent.id]);
  assert.equal((await post('/auth/phone/verify',{id:sent.id,code:sms.code},user)).status,422);
});
test('cambio de contraseña requiere contraseña actual y revoca todas las sesiones',async()=>{
  const user=accounts.buyerA,newPassword='Nueva-password-segura-2026';
  assert.equal((await post('/auth/password',{currentPassword:'incorrecta',password:newPassword},user)).status,422);
  assert.equal((await post('/auth/password',{currentPassword:user.password,password:newPassword},user)).status,200);
  assert.equal((await request('GET','/me',undefined,user)).data.user,null);
  assert.equal((await post('/auth/login',{email:user.email,password:user.password})).status,401);
  assert.equal((await post('/auth/login',{email:user.email,password:newPassword})).status,200);
});
test('adaptador Twilio usa Verify y vincula la comprobación al SID; transporte simulado sin SMS reales',async()=>{
  const originalFetch=globalThis.fetch,keys=['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID'];
  const previous=keys.map(k=>process.env[k]),calls=[];
  process.env.TWILIO_ACCOUNT_SID='AC'+'0'.repeat(32);process.env.TWILIO_AUTH_TOKEN='test-only-token';process.env.TWILIO_VERIFY_SERVICE_SID='VA'+'0'.repeat(32);
  config.smsProvider='twilio';
  globalThis.fetch=async(url,options)=>{
    if(!String(url).startsWith('https://verify.twilio.com/'))return originalFetch(url,options);
    calls.push({url,body:Object.fromEntries(options.body),authorization:options.headers.Authorization});
    return Response.json(String(url).endsWith('/VerificationCheck')?{status:'approved'}:{sid:'VE'+'1'.repeat(32),status:'pending'});
  };
  try {
    const user=accounts.buyerA;
    const sent=await post('/auth/phone/send',{phone:'+51987654324'},user);assert.equal(sent.status,201);
    assert.equal((await request('GET','/dev/sms',undefined,user)).status,404);
    assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:'123456'},user)).status,200);
    assert.equal(calls.length,2);assert.equal(calls[0].body.Channel,'sms');assert.equal(calls[0].body.To,'+51987654324');
    assert.equal(calls[1].body.VerificationSid,'VE'+'1'.repeat(32));assert.equal(calls[1].body.Code,'123456');
    assert.ok(calls[0].authorization.startsWith('Basic '));
  }finally {
    globalThis.fetch=originalFetch;config.smsProvider='sandbox';
    keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  }
});
async function putInCart(buyer,p,n=p.moq) {const r=await post('/cart/items',{product_id:p.id,quantity:n,expected_price_cents:p.wholesale_cents},buyer);assert.equal(r.status,201,JSON.stringify(r.data));}
async function checkout(buyer,key=randomUUID()) {return (await import('./legacy-checkout-fixture.js')).legacyCheckout(buyer,key);}
async function legacyCartItem(buyer,p){const cart=await (await import('../server/commerce.js')).ensureCart(db,buyer.orgId);await db.query('INSERT INTO cart_items(cart_id,product_id,quantity,quoted_price_cents) VALUES($1,$2,$3,$4)',[cart,p.id,p.moq,p.wholesale_cents]);}
async function paidOrder({twoBrands=false}={}) {
  const a=await product(db,accounts.sellerA,{moq:6,pack_multiple:6,wholesale_cents:250});await putInCart(accounts.buyerA,a);
  let b;
  if(twoBrands){b=await product(db,accounts.sellerB,{moq:3,pack_multiple:3,wholesale_cents:400});await legacyCartItem(accounts.buyerA,b);}
  const result=await checkout(accounts.buyerA);assert.equal(result.status,201,JSON.stringify(result.data));
  if(twoBrands){assert.equal((await post('/payments/sandbox/'+result.data.payment_attempt_id+'/simulate',{outcome:'approved'},accounts.buyerA)).data.code,'mixed_suppliers');const amount=(await db.query('SELECT total_cents FROM checkouts WHERE id=$1',[result.data.checkout_id])).rows[0].total_cents;await services.applyPaymentEvent({event_id:randomUUID(),attempt_id:result.data.payment_attempt_id,kind:'approved',amount_cents:amount,occurred_at:new Date().toISOString()});}else{const approved=await post('/payments/sandbox/'+result.data.payment_attempt_id+'/simulate',{outcome:'approved'},accounts.buyerA);assert.equal(approved.status,200,JSON.stringify(approved.data));}
  const orders=(await db.query('SELECT * FROM orders WHERE purchase_id=$1 ORDER BY brand_id',[result.data.purchase_id])).rows;
  return {a,b,checkout:result.data,orders};
}

test('estadísticas diarias respetan fechas de Perú, pagos y aislamiento del proveedor',async()=>{
 await paidOrder({twoBrands:true});
 await db.query("UPDATE orders SET created_at=CASE WHEN brand_id=$1 THEN '2026-01-01T04:59:59Z'::timestamptz ELSE '2026-01-01T05:00:00Z'::timestamptz END",[accounts.sellerA.brandId]);
 const unpaid=await product(db,accounts.sellerA,{wholesale_cents:9999,moq:1});await putInCart(accounts.buyerA,unpaid);const pending=await checkout(accounts.buyerA);assert.equal(pending.status,201);await db.query("UPDATE orders SET created_at='2026-01-01T04:59:59Z' WHERE purchase_id=$1",[pending.data.purchase_id]);
 const endpoint='/seller/analytics?from=2025-12-31&to=2025-12-31';const own=await request('GET',endpoint,undefined,accounts.sellerA);assert.equal(own.status,200);assert.equal(own.data.orders,1);assert.equal(own.data.gross_products_cents,1500);assert.deepEqual(own.data.daily,[{date:'2025-12-31',gross_products_cents:1500,orders:1}]);
 assert.deepEqual((await request('GET',endpoint,undefined,accounts.sellerB)).data.daily,[]);
 assert.deepEqual((await request('GET','/seller/analytics?from=2026-01-01&to=2026-01-01',undefined,accounts.sellerA)).data.daily,[]);
 assert.equal((await request('GET','/seller/analytics?from=2026-01-01&to=2026-01-01',undefined,accounts.sellerB)).data.daily[0].gross_products_cents,1200);
 assert.equal((await request('GET',endpoint,undefined,accounts.buyerA)).status,403);assert.equal((await request('GET',endpoint,undefined)).status,401);
});
test('instalación vacía: cero productos, pedidos, reseñas y métricas comerciales',async()=>{
  assert.equal((await request('GET','/products')).data.total,0);
  assert.equal((await request('GET','/categories')).data.length,6);
  const summary=await request('GET','/admin/summary',undefined,accounts.admin);assert.equal(summary.status,200);assert.equal(Number(summary.data.gmv_cents),0);assert.equal(summary.data.orders,0);
});
test('MOQ, múltiplos, precio, mínimo de marca y margen sin PVP/base comparable',async()=>{
  const {margin,validateQuantity}=await import('../server/lib.js');
  assert.equal(margin(250,null),null);assert.equal(margin(250,0),null);assert.equal(margin(250,500,true),50);assert.equal(margin(250,500,false),null);
  assert.throws(()=>validateQuantity({moq:6,pack_multiple:3,wholesale_cents:0},6));
  const p=await product(db,accounts.sellerA,{moq:6,pack_multiple:3});
  for(const quantity of [-1,0,5,7,6.5])assert.equal((await post('/cart/items',{product_id:p.id,quantity,expected_price_cents:p.wholesale_cents},accounts.buyerA)).status,422);
  await putInCart(accounts.buyerA,p,6);await db.query('UPDATE brands SET min_order_cents=99999 WHERE id=$1',[accounts.sellerA.brandId]);
  assert.equal((await checkout(accounts.buyerA)).status,422);
  await db.query('UPDATE products SET retail_cents=NULL WHERE id=$1',[p.id]);assert.equal((await request('GET','/products/'+p.id)).data.margin_percent,null);
  await db.query('UPDATE products SET retail_cents=500,same_tax_basis=false WHERE id=$1',[p.id]);assert.equal((await request('GET','/products/'+p.id)).data.margin_percent,null);
});
test('regresión histórica: compras multiproveedor existentes conservan importes e idempotencia',async()=>{
  const a=await product(db,accounts.sellerA,{moq:6,pack_multiple:6,wholesale_cents:250});
  const b=await product(db,accounts.sellerB,{moq:3,pack_multiple:3,wholesale_cents:400});
  await putInCart(accounts.buyerA,a);assert.equal((await post('/cart/items',{product_id:b.id,quantity:b.moq,expected_price_cents:b.wholesale_cents},accounts.buyerA)).status,409);await legacyCartItem(accounts.buyerA,b);
  const key=randomUUID(),result=await checkout(accounts.buyerA,key);assert.equal(result.status,201,JSON.stringify(result.data));
  const replay=await checkout(accounts.buyerA,key);assert.equal(replay.status,200);assert.equal(replay.data.checkout_id,result.data.checkout_id);
  const orders=(await db.query('SELECT * FROM orders WHERE purchase_id=$1',[result.data.purchase_id])).rows;assert.equal(orders.length,2);
  const total=orders.reduce((s,o)=>s+o.total_cents,0);assert.equal(total,3500);
  assert.equal((await db.query('SELECT total_cents FROM purchases WHERE id=$1',[result.data.purchase_id])).rows[0].total_cents,total);
  assert.equal((await db.query('SELECT count(*) FROM inventory_reservations')).rows[0].count,'2');
});
test('dos checkouts concurrentes sobre el último stock: solo una reserva elegible',async()=>{
  const p=await product(db,accounts.sellerA,{stock:6,moq:6,pack_multiple:6});
  await putInCart(accounts.buyerA,p);await putInCart(accounts.buyerB,p);
  const results=await Promise.all([checkout(accounts.buyerA),checkout(accounts.buyerB)]);
  assert.equal(results.filter(r=>r.status===201).length,1,JSON.stringify(results));
  assert.equal(results.filter(r=>r.status===422||r.status===409).length,1);
  const inventory=(await db.query('SELECT total,reserved FROM inventory WHERE product_id=$1',[p.id])).rows[0];assert.deepEqual(inventory,{total:6,reserved:6});
});
test('pago fallido/caducado libera stock una sola vez y un pago tardío entra en excepción sin sobreventa',async()=>{
  const p=await product(db,accounts.sellerA,{stock:10,moq:5});await putInCart(accounts.buyerA,p);
  const c=(await checkout(accounts.buyerA)).data;
  const failed={event_id:randomUUID(),attempt_id:c.payment_attempt_id,kind:'failed',amount_cents:1550,occurred_at:new Date().toISOString()};
  const first=await services.applyPaymentEvent(failed);assert.equal(first.state,'failed');
  assert.equal((await services.applyPaymentEvent(failed)).duplicate,true);
  await services.expireCheckout(c.checkout_id,{force:true});
  assert.deepEqual((await db.query('SELECT total,reserved FROM inventory WHERE product_id=$1',[p.id])).rows[0],{total:10,reserved:0});
  const late=await services.applyPaymentEvent({...failed,event_id:randomUUID(),kind:'approved'});assert.equal(late.state,'exception');
  assert.deepEqual((await db.query('SELECT total,reserved FROM inventory WHERE product_id=$1',[p.id])).rows[0],{total:10,reserved:0});
  assert.equal((await db.query(`SELECT count(*) FROM inventory_movements WHERE kind='released'`)).rows[0].count,'1');
});
test('worker expira reservas; webhooks duplicados/desordenados y reembolsos no duplican movimientos',async()=>{
  const {a,checkout:c,orders}=await paidOrder();
  const later=await post('/payments/sandbox/'+c.payment_attempt_id+'/simulate',{outcome:'failed'},accounts.buyerA);assert.equal(later.data.ignored,true);
  await post('/payments/sandbox/'+c.payment_attempt_id+'/simulate',{outcome:'approved'},accounts.buyerA);
  assert.equal((await db.query(`SELECT count(*) FROM inventory_movements WHERE product_id=$1 AND kind='sold'`,[a.id])).rows[0].count,'1');
  const input={amount_cents:100,reason:'Prueba de devolución parcial autorizada',reference:'sandbox:'+randomUUID()};
  assert.equal((await post('/admin/orders/'+orders[0].id+'/refund',input,accounts.admin)).status,200);
  assert.equal((await post('/admin/orders/'+orders[0].id+'/refund',input,accounts.admin)).data.duplicate,true);
  assert.equal((await db.query('SELECT refunded_cents FROM orders WHERE id=$1',[orders[0].id])).rows[0].refunded_cents,100);
  assert.equal((await db.query(`SELECT count(*) FROM ledger_entries WHERE kind='refund'`)).rows[0].count,'1');
  await putInCart(accounts.buyerB,a);const expiry=(await checkout(accounts.buyerB)).data;
  await db.query(`UPDATE checkouts SET expires_at=now()-interval '1 minute' WHERE id=$1`,[expiry.checkout_id]);await services.expireReservations();await services.expireReservations();
  assert.equal((await db.query('SELECT state FROM checkouts WHERE id=$1',[expiry.checkout_id])).rows[0].state,'expired');
  assert.equal((await db.query('SELECT reserved FROM inventory WHERE product_id=$1',[a.id])).rows[0].reserved,0);
});
test('confirmación del frontend, importe alterado y webhook sin firma nunca confirman pago',async()=>{
  const p=await product(db,accounts.sellerA);await putInCart(accounts.buyerA,p);const c=(await checkout(accounts.buyerA)).data;
  const event={event_id:randomUUID(),attempt_id:c.payment_attempt_id,kind:'approved',amount_cents:1,occurred_at:new Date().toISOString()};
  assert.equal((await post('/webhooks/sandbox',event,undefined)).status,401);
  const raw=Buffer.from(JSON.stringify(event)),ts=String(Math.floor(Date.now()/1000));
  assert.equal((await post('/webhooks/sandbox',raw.toString(),undefined,{'X-Lote-Timestamp':ts,'X-Lote-Signature':services.signWebhook(raw,ts)})).status,422);
  assert.equal((await db.query('SELECT state FROM checkouts WHERE id=$1',[c.checkout_id])).rows[0].state,'pending');
  assert.equal((await post('/checkout/'+c.checkout_id+'/success',{paid:true},accounts.buyerA)).status,404);
  event.amount_cents=550;const valid=Buffer.from(JSON.stringify(event));
  assert.equal((await post('/webhooks/sandbox',valid.toString(),undefined,{'X-Lote-Timestamp':ts,'X-Lote-Signature':services.signWebhook(valid,ts)})).status,200);
});
test('cambio de comisión no altera snapshots ni liquidaciones históricas',async()=>{
  await db.query(`INSERT INTO commission_rules(basis_points,effective_at,approved_by) VALUES(350,now()-interval '1 day',$1)`,[accounts.admin.userId]);
  const {orders}=await paidOrder();assert.equal(orders[0].commission_bps,700);assert.equal(orders[0].commission_cents,105);
  await post('/admin/commissions',{brand_id:null,basis_points:1500,effective_at:new Date().toISOString()},accounts.admin);
  const old=(await db.query('SELECT commission_bps,commission_cents FROM orders WHERE id=$1',[orders[0].id])).rows[0];assert.deepEqual(old,{commission_bps:700,commission_cents:105});
});
test('aislamiento: dos marcas y dos tiendas; CSRF y origen; API de proveedor queda ligada a su organización',async()=>{
  const p=await product(db,accounts.sellerA);const {orders}=await paidOrder();
  assert.equal((await request('GET','/admin/orders?state=cancelled',undefined,accounts.admin)).data.length,0);
  assert.equal((await request('GET','/admin/orders?state=confirmed&payment_state=approved',undefined,accounts.admin)).data.length,1);
  assert.equal((await request('GET','/orders/'+orders[0].id,undefined,accounts.buyerB)).status,404);
  assert.equal((await request('GET','/orders/'+orders[0].id,undefined,accounts.sellerB)).status,404);
  assert.equal((await request('GET','/seller/products',undefined,accounts.sellerA,{'X-Organization-Id':accounts.sellerB.orgId})).status,403);
  assert.equal((await request('PUT','/seller/products/'+p.id,{},accounts.sellerB)).status,404);
  assert.equal((await post('/seller/products',{},accounts.sellerA,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await post('/auth/login',{email:accounts.sellerA.email,password:accounts.sellerA.password},undefined,{Origin:'https://evil.invalid'})).status,403);
  const key=(await post('/seller/api-keys',{label:'Integración de prueba'},accounts.sellerA)).data;
  const headers={Authorization:'Bearer '+key.token,'Idempotency-Key':randomUUID(),'X-Organization-Id':accounts.sellerB.orgId};
  const payload={products:[{name:'DEMO API',sku:'API-1',category_id:'hogar',wholesale_cents:100,moq:1,stock:5,brand_id:accounts.sellerB.brandId}],dry_run:false,confirm:true};
  const upsert=await post('/seller/catalog/upsert',payload,undefined,headers);assert.equal(upsert.status,200,JSON.stringify(upsert.data));
  assert.equal((await db.query(`SELECT brand_id FROM products WHERE sku='API-1'`)).rows[0].brand_id,accounts.sellerA.brandId);
  assert.equal((await request('GET','/admin/orders',undefined,undefined,{Authorization:'Bearer '+key.token})).status,403);
  const publicBrand=await request('GET','/brands/'+accounts.sellerA.brandId);assert.ok(!('contact_email' in publicBrand.data));assert.ok(!('payout_encrypted' in publicBrand.data));
});
test('recompra muestra cambios y revalida precio, stock y publicación antes de añadir',async()=>{
  const {a,orders}=await paidOrder();
  const original=(await post('/orders/'+orders[0].id+'/reorder',{confirm:false},accounts.buyerA)).data;
  await db.query('UPDATE products SET wholesale_cents=300 WHERE id=$1',[a.id]);
  assert.equal((await post('/orders/'+orders[0].id+'/reorder',{confirm:true,quote_hash:original.quote_hash},accounts.buyerA)).status,409);
  const updated=(await post('/orders/'+orders[0].id+'/reorder',{confirm:false},accounts.buyerA)).data;
  assert.equal(updated.items[0].previous_price_cents,250);assert.equal(updated.items[0].current_price_cents,300);assert.equal(updated.items[0].changed,true);
  await db.query(`UPDATE products SET status='archived' WHERE id=$1`,[a.id]);
  const removed=(await post('/orders/'+orders[0].id+'/reorder',{confirm:false},accounts.buyerA)).data;assert.ok(removed.items[0].issues.length);
  assert.equal((await post('/orders/'+orders[0].id+'/reorder',{confirm:true,quote_hash:removed.quote_hash},accounts.buyerA)).status,422);
});
test('reseña requiere compra entregada, pertenece a la tienda y no se duplica; incidencia conserva historia',async()=>{
  const {orders}=await paidOrder(),o=orders[0],item=(await db.query('SELECT id FROM order_items WHERE order_id=$1',[o.id])).rows[0];
  const review={order_item_id:item.id,rating:5,body:'Experiencia de prueba con compra entregada.'};
  assert.equal((await post('/reviews',review,accounts.buyerA)).status,403);
  assert.equal((await post('/seller/orders/'+o.id+'/fulfillment',{state:'shipped',delivery_mode:'home',delivery_details:'Dirección de prueba',shipped_at:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),carrier:'Demo',tracking_code:'DEMO-1'},accounts.sellerA)).status,409);
  assert.equal((await post('/seller/orders/'+o.id+'/fulfillment',{state:'preparing'},accounts.sellerA)).status,200);
  assert.equal((await post('/seller/orders/'+o.id+'/fulfillment',{state:'shipped',delivery_mode:'home',delivery_details:'Dirección de prueba',shipped_at:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),carrier:'Demo',tracking_code:'DEMO-1'},accounts.sellerA)).status,200);
  assert.equal((await post('/orders/'+o.id+'/delivery',{},accounts.buyerA)).status,200);
  assert.equal((await post('/reviews',review,accounts.buyerB)).status,403);
  assert.equal((await post('/reviews',review,accounts.buyerA)).status,201);
  assert.equal((await post('/reviews',review,accounts.buyerA)).status,409);
  const incident=await post('/orders/'+o.id+'/incidents',{reason:'Embalaje',description:'Consulta de prueba sobre el embalaje recibido.'},accounts.buyerA);assert.equal(incident.status,201);
  assert.equal((await request('GET','/incidents/'+incident.data.id,undefined,accounts.sellerB)).status,404);
  assert.equal((await db.query('SELECT state FROM orders WHERE id=$1',[o.id])).rows[0].state,'delivered');
});
test('CSV: comillas UTF-8, duplicados, negativos, MOQ incompatible, archivo roto y dry run sin publicación',async()=>{
  const head='name,sku,category_id,wholesale_cents,retail_cents,moq,pack_multiple,stock,same_tax_basis\n';
  const csv=head+'"Vaso, ""alto""",CSV-1,hogar,250,500,6,3,100,true\n';
  const staged=await post('/seller/imports',csv,accounts.sellerA,{'Content-Type':'text/csv'});assert.equal(staged.status,201,JSON.stringify(staged.data));assert.equal(staged.data.state,'staged');
  assert.equal((await db.query('SELECT count(*) FROM products')).rows[0].count,'0');
  const details=(await request('GET','/seller/imports/'+staged.data.id,undefined,accounts.sellerA)).data;assert.equal(details.rows[0].data.name,'Vaso, "alto"');
  for(const body of [head+'Malo,X,hogar,-1,,1,1,2,false\n',head+'Malo,X,hogar,250,,7,3,2,false\n',head+'Uno,X,hogar,100,,1,1,2,false\nDos,X,hogar,100,,1,1,2,false\n']) {
    const invalid=await post('/seller/imports',body,accounts.sellerA,{'Content-Type':'text/csv'});assert.equal(invalid.data.state,'invalid');assert.equal((await post('/seller/imports/'+invalid.data.id+'/publish',{confirm:true},accounts.sellerA)).status,422);
  }
  assert.equal((await post('/seller/imports',head+'"rota',accounts.sellerA,{'Content-Type':'text/csv'})).status,422);
  assert.equal((await post('/seller/imports/'+staged.data.id+'/publish',{confirm:true},accounts.sellerB)).status,404);
  assert.equal((await post('/seller/imports/'+staged.data.id+'/publish',{confirm:true},accounts.sellerA)).status,200);
  assert.equal((await request('GET','/products')).data.total,0,'Primera publicación aún requiere moderación');
  assert.equal((await db.query('SELECT count(*) FROM products')).rows[0].count,'1');
});
test('sincronización incremental idempotente, stock antiguo no sobrescribe, ausencias no borran y SSRF bloqueado',async()=>{
  const {synchronizeSource,publicAddress,fetchAuthorizedFeed}=await import('../server/sources.js');
  const source=(await db.query(`INSERT INTO catalog_sources(brand_id,url,approved,enabled,category_map) VALUES($1,'https://feed.example/catalog',true,true,'{"Homeware":"hogar"}') RETURNING *`,[accounts.sellerA.brandId])).rows[0];
  const row={name:'DEMO Fuente',sku:'SYNC-1',category:'Homeware',wholesale_cents:250,moq:1,stock:20,external_id:'source-1',updated_at:new Date(Date.now()-5000).toISOString()};
  const get=async()=>({mode:'incremental',products:[row]});assert.equal((await synchronizeSource(source,get)).rows,1);
  await synchronizeSource(source,get);assert.equal((await db.query(`SELECT count(*) FROM products WHERE sku='SYNC-1'`)).rows[0].count,'1');
  row.stock=99;row.updated_at=new Date(Date.now()-10000).toISOString();await synchronizeSource(source,get);
  assert.equal((await db.query(`SELECT total FROM inventory i JOIN products p ON p.id=i.product_id WHERE p.sku='SYNC-1'`)).rows[0].total,20);
  await synchronizeSource(source,async()=>({mode:'incremental',products:[]}));assert.equal((await db.query('SELECT count(*) FROM products')).rows[0].count,'1');
  const invalid=await synchronizeSource(source,async()=>({mode:'incremental',products:[{...row,stock:-1}]}));assert.equal(invalid.failed,true);
  assert.equal((await db.query(`SELECT count(*) FROM import_jobs WHERE state='invalid' AND source_id=$1`,[source.id])).rows[0].count,'1');
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  config.feedOrigins=['https://127.0.0.1'];await assert.rejects(()=>fetchAuthorizedFeed({url:'https://127.0.0.1/feed'}),e=>e.status===403);
});
test('tokens de correo de un uso y expiración; recuperación revoca sesiones, sin exposición entre cuentas',async()=>{
  const signup=await post('/auth/register',{terms_accepted:true,terms_version:'2026-10-22.1',email:'new@demo.invalid',password:'Demo-only-password-123',name:'DEMO Nueva',businessName:'DEMO Nuevo negocio',phone:'+51987654329',kind:'buyer'});assert.equal(signup.status,201,JSON.stringify(signup.data));
  const cookie=signup.headers.get('set-cookie').split(';')[0];const me=await request('GET','/me',undefined,{cookie,csrf:''});
  const user={cookie,csrf:me.data.csrfToken,orgId:me.data.organizationId};
  await post('/auth/resend',{},user);
  const mails=(await request('GET','/dev/mail',undefined,user)).data;const raw=new URL(mails[0].body.match(/http[^\s]+/)[0]).searchParams.get('token');
  const verification=await post('/auth/verify',{token:raw},user);assert.equal(verification.status,200,JSON.stringify(verification.data));assert.equal((await post('/auth/verify',{token:raw},user)).status,400);
  const other=(await request('GET','/dev/mail',undefined,accounts.buyerB)).data;assert.equal(other.length,0);
  await post('/auth/forgot',{email:'new@demo.invalid'});
  const expiredMail=(await db.query(`SELECT m.body FROM mail_outbox m WHERE subject='Recupera tu acceso a Lote' ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const expired=new URL(expiredMail.body.split('\n').find(line=>line.startsWith('http'))).searchParams.get('token');
  await db.query(`UPDATE account_tokens SET expires_at=now()-interval '1 minute' WHERE purpose='reset'`);
  assert.equal((await post('/auth/reset',{token:expired,password:'New-demo-password-456'},user)).status,400);
  await post('/auth/forgot',{email:'new@demo.invalid'});
  const resetMail=(await db.query(`SELECT body FROM mail_outbox WHERE subject='Recupera tu acceso a Lote' ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const reset=new URL(resetMail.body.match(/http[^\s]+/)[0]).searchParams.get('token');
  assert.equal((await post('/auth/reset',{token:reset,password:'New-demo-password-456'},user)).status,200);
  assert.equal((await request('GET','/me',undefined,user)).data.user,null);
  assert.equal((await post('/auth/reset',{token:reset,password:'New-demo-password-456'})).status,400);
  assert.equal((await post('/auth/login',{email:'new@demo.invalid',password:'New-demo-password-456'})).status,200);
});
test('antes del pago se revalidan precio/condiciones y se exige revisión sin consumir la reserva',async()=>{
  const p=await product(db,accounts.sellerA);await putInCart(accounts.buyerA,p);const c=(await checkout(accounts.buyerA)).data;
  await db.query('UPDATE products SET wholesale_cents=300 WHERE id=$1',[p.id]);
  assert.equal((await post('/payments/sandbox/'+c.payment_attempt_id+'/simulate',{outcome:'approved'},accounts.buyerA)).status,409);
  assert.equal((await db.query('SELECT state FROM checkouts WHERE id=$1',[c.checkout_id])).rows[0].state,'expired');
  assert.deepEqual((await db.query('SELECT total,reserved FROM inventory WHERE product_id=$1',[p.id])).rows[0],{total:100,reserved:0});
  assert.equal((await db.query('SELECT count(*) FROM payment_events')).rows[0].count,'0');
});
test('cancelación autorizada antes del despacho reembolsa y repone una sola vez; entregados no se reponen',async()=>{
  const {a,orders}=await paidOrder();
  const input={reason:'Cancelación revisada antes de preparar el envío.',reference:randomUUID(),restock:true};
  assert.equal((await post('/admin/orders/'+orders[0].id+'/cancel',input,accounts.buyerA)).status,403);
  assert.equal((await post('/admin/orders/'+orders[0].id+'/cancel',input,accounts.admin)).status,200);
  assert.equal((await post('/admin/orders/'+orders[0].id+'/cancel',input,accounts.admin)).data.duplicate,true);
  assert.equal((await db.query('SELECT total FROM inventory WHERE product_id=$1',[a.id])).rows[0].total,100);
  assert.equal((await db.query(`SELECT count(*) FROM inventory_movements WHERE kind='restock'`)).rows[0].count,'1');
  assert.equal((await db.query('SELECT state FROM orders WHERE id=$1',[orders[0].id])).rows[0].state,'cancelled');
});
test('liquidaciones requieren entrega, ausencia de incidencias, transiciones y evidencia sandbox',async()=>{
  const {orders}=await paidOrder(),o=orders[0];
  const input={brand_id:accounts.sellerA.brandId,order_ids:[o.id]};
  assert.equal((await post('/admin/settlements',input,accounts.admin)).status,422);
  await post('/seller/orders/'+o.id+'/fulfillment',{state:'preparing'},accounts.sellerA);
  await post('/seller/orders/'+o.id+'/fulfillment',{state:'shipped',delivery_mode:'home',delivery_details:'Dirección de prueba',shipped_at:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),carrier:'DEMO',tracking_code:'DEMO-2'},accounts.sellerA);
  await post('/orders/'+o.id+'/delivery',{},accounts.buyerA);
  const created=await post('/admin/settlements',input,accounts.admin);assert.equal(created.status,201,JSON.stringify(created.data));
  const s=created.data;assert.equal(s.amount_cents,o.total_cents-o.commission_cents);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'paid'},accounts.admin)).status,409);
  const incident=await post('/orders/'+o.id+'/incidents',{reason:'Revisión',description:'Revisar la evidencia antes de avanzar la liquidación.'},accounts.buyerA);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'eligible'},accounts.admin)).status,409);
  await post('/admin/incidents/'+incident.data.id+'/resolve',{state:'resolved',resolution:'Evidencia de prueba revisada y caso resuelto.'},accounts.admin);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'eligible'},accounts.admin)).status,200);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'scheduled'},accounts.admin)).status,200);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'paid'},accounts.admin)).status,400);
  assert.equal((await post('/admin/settlements/'+s.id+'/state',{state:'paid',reference:'sandbox:'+randomUUID(),evidence:'Simulación conciliada en la prueba automatizada.'},accounts.admin)).status,200);
  assert.equal((await post('/admin/orders/'+o.id+'/cancel',{reference:randomUUID(),reason:'No permitido luego de entrega',restock:true},accounts.admin)).status,409);
});
test('imágenes se decodifican, normalizan y mantienen privadas; otra organización no puede leer documentos',async()=>{
  const {default:sharp}=await import('sharp');
  async function upload(data,user) {
    const r=await fetch(base+'/api/uploads?purpose=verification',{method:'POST',headers:{Origin:config.origin,Cookie:user.cookie,'X-CSRF-Token':user.csrf,'X-Organization-Id':user.orgId,'Content-Type':'image/png'},body:data});
    return {status:r.status,data:await r.json()};
  }
  assert.equal((await upload(Buffer.from('not an image'),accounts.sellerA)).status,422);
  const image=await sharp({create:{width:8,height:8,channels:3,background:'#173f35'}}).png().toBuffer();
  const attachment=await upload(image,accounts.sellerA);assert.equal(attachment.status,201);
  assert.equal((await request('GET','/attachments/'+attachment.data.id,undefined,accounts.sellerB)).status,404);
  const publicResponse=await fetch(base+'/media/'+attachment.data.id);assert.equal(publicResponse.status,404);
  const privateResponse=await fetch(base+'/api/attachments/'+attachment.data.id,{headers:{Cookie:accounts.sellerA.cookie}});assert.equal(privateResponse.status,200);assert.equal(privateResponse.headers.get('content-type'),'image/webp');
});


test('7%: only an eligible delivery establishes same-buyer same-brand recurrence',async()=>{
  const p=await product(db,accounts.sellerA,{wholesale_cents:100000,moq:1,stock:20});
  await putInCart(accounts.buyerA,p);
  const first=await checkout(accounts.buyerA);assert.equal(first.status,201);
  const firstOrder=(await db.query('SELECT * FROM orders WHERE purchase_id=$1',[first.data.purchase_id])).rows[0];
  assert.equal(firstOrder.commission_bps,700);assert.equal(firstOrder.commission_cents,7000);
  await services.applyPaymentEvent({event_id:randomUUID(),attempt_id:first.data.payment_attempt_id,kind:'approved',amount_cents:firstOrder.total_cents,occurred_at:new Date().toISOString()});
  await db.query("UPDATE orders SET state='delivered' WHERE id=$1",[firstOrder.id]);
  await putInCart(accounts.buyerA,p);
  const repeat=await checkout(accounts.buyerA);assert.equal(repeat.status,201);
  const repeated=(await db.query('SELECT * FROM orders WHERE purchase_id=$1',[repeat.data.purchase_id])).rows[0];
  assert.equal(repeated.commission_bps,700);assert.equal(repeated.commission_cents,7000);
  assert.equal(repeated.policy_snapshot.fees.recurrent,true);
  await putInCart(accounts.buyerB,p);
  const other=await checkout(accounts.buyerB);
  assert.equal((await db.query('SELECT commission_bps FROM orders WHERE purchase_id=$1',[other.data.purchase_id])).rows[0].commission_bps,700);
  // Cancel pending repeat and fully refund original: it must no longer qualify.
  await services.expireCheckout(repeat.data.checkout_id,{force:true});
  await db.query('UPDATE orders SET refunded_cents=total_cents WHERE id=$1',[firstOrder.id]);
  const fresh=await checkout(accounts.buyerA);assert.equal(fresh.status,201);
  const freshOrder=(await db.query('SELECT commission_bps,policy_snapshot FROM orders WHERE purchase_id=$1',[fresh.data.purchase_id])).rows[0];
  assert.equal(freshOrder.commission_bps,700);assert.equal(freshOrder.policy_snapshot.fees.recurrent,false);
});

test('new seller read models require seller role and isolate buyers/shipments/incidents',async()=>{
  for(const endpoint of ['/seller/shipments','/seller/incidents','/seller/buyers']) {
    assert.equal((await request('GET',endpoint,undefined,accounts.buyerA)).status,403);
    assert.deepEqual((await request('GET',endpoint,undefined,accounts.sellerB)).data,[]);
  }
  for(const endpoint of ['/admin/finance','/admin/logistics','/admin/launch-readiness']) {
    assert.equal((await request('GET',endpoint,undefined,accounts.sellerA)).status,403);
    assert.equal((await request('GET',endpoint,undefined,accounts.admin)).status,200);
  }
});

test('phone-only registration: unverified email can create multiple products after OTP; no shortcuts',async()=>{
  const signup=await post('/auth/register',{terms_accepted:true,terms_version:'2026-10-22.1',email:'phoneonly@demo.invalid',password:'Phone-only-password-123',name:'Persona',businessName:'Marca nueva',phone:'987654328',kind:'seller',tax_id:'20123456789'});
  assert.equal(signup.status,201,JSON.stringify(signup.data));
  const cookie=signup.headers.get('set-cookie').split(';')[0],me=(await request('GET','/me',undefined,{cookie,csrf:''})).data;
  const user={cookie,csrf:me.csrfToken,orgId:me.organizationId};
  assert.equal(me.user.verified_at,null);assert.equal(me.user.phone_verified_at,null);
  assert.equal((await db.query('SELECT count(*) FROM mail_outbox WHERE user_id=$1',[me.user.id])).rows[0].count,'0');
  assert.equal((await post('/seller/products',{},user)).data.code,'phone_unverified');
  const sent=await post('/auth/phone/send',{phone:'987654328'},user);assert.equal(sent.status,201,JSON.stringify(sent.data));
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:'000000'},user)).status,422);
  const sms=(await request('GET','/dev/sms',undefined,user)).data[0];
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},accounts.buyerA)).status,422);
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},user)).status,200);
  assert.equal((await post('/auth/phone/verify',{id:sent.data.id,code:sms.code},user)).status,422);
  const updated=(await request('GET','/me',undefined,user)).data;
  assert.equal(updated.user.verified_at,null);assert.ok(updated.user.phone_verified_at);
  await post('/auth/forgot',{email:'phoneonly@demo.invalid'});
  assert.equal((await db.query('SELECT count(*) FROM mail_outbox WHERE user_id=$1',[me.user.id])).rows[0].count,'0');
  for(const n of [1,2])assert.equal((await post('/seller/products',{name:'Producto '+n,sku:'NEW-'+n,category_id:'hogar',wholesale_cents:2500,moq:2,stock:20,description:'Descripción clara del producto',submit_for_review:true},user)).status,201);
  const own=(await request('GET','/seller/products',undefined,user)).data;assert.equal(own.length,2);assert.ok(own.every(p=>p.status==='pending'));
  assert.equal((await request('GET','/products')).data.products.some(p=>own.some(o=>o.id===p.id)),false);
  const org=(await request('GET','/organizations/me',undefined,user)).data;assert.equal(org.tax_id,'20123456789');
});

test('compras cerradas: no se añade al carrito, reserva ni recompra por API',async()=>{
  config.purchasesEnabled=false;
  const p=await product(db,accounts.sellerA);
  for(const [path,body] of [
    ['/cart/items',{product_id:p.id,quantity:1,expected_price_cents:p.wholesale_cents}],
    ['/checkout',{}],
    ['/orders/'+randomUUID()+'/reorder',{confirm:true}]
  ]) {
    const result=await post(path,body,accounts.buyerA);
    assert.equal(result.status,409);assert.match(result.data.message,/No disponible/);
  }
  const me=await request('GET','/me',undefined,accounts.buyerA);
  assert.equal(me.data.purchasesEnabled,false);
  assert.equal((await db.query('SELECT count(*) FROM cart_items')).rows[0].count,'0');
  assert.equal((await db.query('SELECT count(*) FROM checkouts')).rows[0].count,'0');
});
