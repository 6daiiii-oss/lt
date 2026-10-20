import pg from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function isolatedDatabase(prefix='lote_test') {
  if(process.env.NODE_ENV==='production')throw new Error('Pruebas prohibidas en producción.');
  const base=new URL(process.env.DATABASE_URL||'');
  const name=prefix+'_'+randomBytes(6).toString('hex');
  if(!/^lote_(?:test|ui_test|demo)_[a-f0-9]+$/.test(name))throw new Error('Nombre aislado no válido.');
  const admin=new pg.Client({connectionString:base.href});await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  base.pathname='/'+name;process.env.DATABASE_URL=base.href;
  process.env.STORAGE_DIR=resolve('.runtime',name,'uploads');
  return {name,async retain(){await admin.end();},async drop(){await admin.query(`DROP DATABASE "${name}"`);await admin.end();await rm(resolve('.runtime',name),{recursive:true,force:true});}};
}
export async function fixtures(db,{withProducts=false}={}) {
  const {digest,passwordHash,token}=await import('../server/lib.js');
  const password='Demo-'+randomBytes(12).toString('hex'),encoded=await passwordHash(password);
  const accounts={};
  for(const [key,kind] of [['sellerA','seller'],['sellerB','seller'],['buyerA','buyer'],['buyerB','buyer'],['admin','admin']]) {
    const email=`${key.toLowerCase()}@demo.invalid`;
    const user=(await db.query('INSERT INTO users(email,name,password_hash,verified_at,is_admin) VALUES($1,$2,$3,now(),$4) RETURNING id',[email,`DEMO ${key}`,encoded,kind==='admin'])).rows[0];
    await db.query('UPDATE users SET phone=$2,phone_verified_at=now() WHERE id=$1',[user.id,'+519'+String(Object.keys(accounts).length+1).padStart(8,'0')]);
    const account={email,password,userId:user.id};
    if(kind!=='admin') {
      const org=(await db.query(`INSERT INTO organizations(kind,name,legal_name,business_type,contact_email,phone,status) VALUES($1,$2,$2,'DEMO',$3,'000000000','approved') RETURNING id`,[kind,`DEMO ${key}`,email])).rows[0];
      await db.query(`INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'owner')`,[user.id,org.id]);account.orgId=org.id;
      if(kind==='seller') account.brandId=(await db.query(`INSERT INTO brands(organization_id,name,story,location,min_order_cents,shipping_cents,shipping_regions,shipping_policy,return_policy,terms_approved)
        VALUES($1,$2,'Marca de demostración en base aislada.','Lima',0,$3,ARRAY['lima'],'Despacho ilustrativo de sandbox.','Incidencias sujetas a revisión; condiciones de demostración.',true) RETURNING id`,[org.id,`DEMO Marca ${key==='sellerA'?'A':'B'}`,key==='sellerA'?300:500])).rows[0].id;
      account.addressId=(await db.query(`INSERT INTO addresses(organization_id,recipient,line1,district,region,phone) VALUES($1,'DEMO Recepción','Dirección de prueba 123','Miraflores','Lima','000000000') RETURNING id`,[org.id])).rows[0].id;
    }
    const raw=token(),csrf=token();await db.query(`INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')`,[digest(raw),user.id,csrf]);
    Object.assign(account,{cookie:'lote_session='+raw,csrf});accounts[key]=account;
  }
  if(withProducts) {
    accounts.productA=await product(db,accounts.sellerA,{name:'DEMO Vaso',sku:'DEMO-A',wholesale_cents:250,moq:6,pack_multiple:6});
    accounts.productB=await product(db,accounts.sellerB,{name:'DEMO Cuaderno',sku:'DEMO-B',wholesale_cents:400,moq:3,pack_multiple:3});
  }
  return accounts;
}
export async function product(db,seller,overrides={}) {
  const {upsertProduct}=await import('../server/imports.js');
  const input={name:'DEMO Producto',sku:randomUUID(),category_id:'hogar',wholesale_cents:250,retail_cents:500,same_tax_basis:true,moq:1,pack_multiple:1,stock:100,submit_for_review:true,...overrides};
  const p=await upsertProduct(db,seller.brandId,input);
  await db.query(`UPDATE products SET status='published',published_at=now() WHERE id=$1`,[p.id]);return {...input,supplier_cents:input.wholesale_cents,wholesale_cents:(await import('../server/pricing.js')).priceForBuyer(input.wholesale_cents),id:p.id};
}
