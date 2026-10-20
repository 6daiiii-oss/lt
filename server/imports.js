import { priceForBuyer } from './pricing.js';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import { config } from './config.js';
import { audit, cents, hash, id, parse, quantity, requireThat, text } from './lib.js';

const imageUrl=z.string().max(2000).refine(v=>{try{return /^\/media\/[a-f0-9-]{36}$/.test(v)||(/^https:\/\//.test(v)&&!new URL(v).username&&!new URL(v).password);}catch{return false;}},'Usa una URL HTTPS autorizada o una imagen subida a Lote.');
export const productSchema=z.object({
 name:text,sku:z.string().trim().min(1).max(100),category_id:z.string().min(1).max(60),variant:z.string().trim().max(150).default(''),
 description:z.string().max(10000).default(''),specifications:z.record(z.string().max(80),z.string().max(500)).default({}),
 wholesale_cents:cents.refine(v=>v>0),retail_cents:cents.refine(v=>v>0).nullable().default(null),same_tax_basis:z.boolean().default(false),
 moq:quantity,pack_multiple:quantity.default(1),stock:z.number().int().min(0).max(1_000_000),
 updated_at:z.iso.datetime().optional(),images:z.array(z.object({url:imageUrl,alt:text})).max(8).default([]),
 external_id:z.string().max(150).optional(),active:z.boolean().default(true),submit_for_review:z.boolean().default(false)
}).refine(p=>p.moq%p.pack_multiple===0,{message:'MOQ debe ser múltiplo del empaque.',path:['moq']});
export async function upsertProduct(db,brandId,input,{sourceId=null}={}) {
  const p=parse(productSchema,input),updatedAt=p.updated_at?new Date(p.updated_at):new Date();
  requireThat(updatedAt.getTime()<=Date.now()+1000,'Timestamp de stock futuro.');
  const brand=(await db.query('SELECT id,organization_id FROM brands WHERE id=$1 FOR UPDATE',[brandId])).rows[0];
  requireThat(brand,'Marca no encontrada.',404);
  for(const image of p.images.filter(i=>i.url.startsWith('/media/'))) requireThat((await db.query('SELECT 1 FROM attachments WHERE id=$1 AND organization_id=$2 AND public',[image.url.slice(7),brand.organization_id])).rowCount,'La imagen subida no pertenece a tu marca.',403);
  const old=(await db.query(`SELECT p.*,i.reserved,i.source_updated_at FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.brand_id=$1 AND p.sku=$2 FOR UPDATE OF p,i`,[brandId,p.sku])).rows[0];
  if(old&&p.updated_at&&new Date(old.source_updated_at)>=updatedAt) return {id:old.id,ignored:true};
  if(sourceId) {
    requireThat(p.external_id,'El feed requiere external_id estable.');
    const mapping=(await db.query('SELECT * FROM source_products WHERE source_id=$1 AND external_id=$2',[sourceId,p.external_id])).rows[0];
    requireThat(!mapping||mapping.product_id===old?.id,'No se puede reasignar external_id a otro SKU.',409);
  }
  const localDelta=Number((await db.query(`SELECT coalesce(sum(quantity),0) AS n FROM inventory_movements WHERE product_id=$1 AND kind IN ('sold','restock') AND created_at>$2`,[old?.id||null,updatedAt])).rows[0].n);
  const effectiveStock=p.stock+localDelta;
  requireThat(effectiveStock>=(old?.reserved||0),'El stock informado no cubre reservas locales. Requiere conciliación.',409,'stock_reconciliation');
  let status=p.active?(p.submit_for_review?'pending':'draft'):'archived';
  if(old?.status==='blocked') status='blocked';
  const sensitive=old&&['name','sku','category_id','variant','description','wholesale_cents','retail_cents','same_tax_basis','moq','pack_multiple'].some(key=>p[key]!== (key==='wholesale_cents'?old.supplier_cents:old[key]));
  if(old?.status==='published'&&p.active) status=sensitive?'pending':'published';
  if(old&&JSON.stringify(p.specifications)!==JSON.stringify(old.specifications)&&old.status==='published') status='pending';
  const values=[brandId,p.category_id,p.name,p.description,p.sku,p.variant,p.specifications,priceForBuyer(p.wholesale_cents),p.retail_cents,p.same_tax_basis,p.moq,p.pack_multiple,status];
  values.push(p.wholesale_cents);
  const row=old?(await db.query(`UPDATE products SET category_id=$2,name=$3,description=$4,sku=$5,variant=$6,specifications=$7,wholesale_cents=$8,retail_cents=$9,same_tax_basis=$10,moq=$11,pack_multiple=$12,status=$13,supplier_cents=$14,updated_at=now() WHERE id=$15 AND brand_id=$1 RETURNING *`,[...values,old.id])).rows[0]
    :(await db.query(`INSERT INTO products(brand_id,category_id,name,description,sku,variant,specifications,wholesale_cents,retail_cents,same_tax_basis,moq,pack_multiple,status,supplier_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,values)).rows[0];
  await db.query(`INSERT INTO inventory(product_id,total,source_updated_at) VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET total=$2,source_updated_at=$3,updated_at=now()`,[row.id,effectiveStock,updatedAt]);
  await db.query(`INSERT INTO inventory_movements(product_id,kind,quantity,reference) VALUES($1,'source_snapshot',$2,$3)`,[row.id,effectiveStock,`source:${row.id}:${crypto.randomUUID()}`]);
  const priorImages=(await db.query('SELECT url,alt FROM product_images WHERE product_id=$1 ORDER BY position',[row.id])).rows;
  if(JSON.stringify(priorImages)!==JSON.stringify(p.images)) {
    await db.query('DELETE FROM product_images WHERE product_id=$1',[row.id]);
    for(const [position,image] of p.images.entries()) await db.query('INSERT INTO product_images(product_id,url,alt,position) VALUES($1,$2,$3,$4)',[row.id,image.url,image.alt,position]);
    if(old?.status==='published') {await db.query(`UPDATE products SET status='pending' WHERE id=$1`,[row.id]);row.status='pending';}
  }
  if(sourceId) await db.query(`INSERT INTO source_products(source_id,external_id,product_id,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,external_id) DO UPDATE SET updated_at=$4`,[sourceId,p.external_id,row.id,updatedAt]);
  return {id:row.id,status:row.status};
}
export const csvColumns=['name','sku','category_id','variant','description','wholesale_cents','retail_cents','moq','pack_multiple','stock','same_tax_basis','updated_at','image_url','external_id','active'];
export function csvRows(csv) {
  requireThat(Buffer.byteLength(csv)<=config.importMaxBytes,'Archivo CSV demasiado grande.',413);
  let rows;
  try {rows=parseCsv(csv,{columns:headers=>{requireThat(headers.includes('sku')&&headers.includes('name'),'Faltan cabeceras name/sku.');requireThat(new Set(headers).size===headers.length,'Cabeceras duplicadas.');requireThat(headers.every(h=>csvColumns.includes(h)),'Cabeceras desconocidas.');return headers;},bom:true,skip_empty_lines:true,max_record_size:64000,relax_column_count:false});}
  catch(e){requireThat(false,e.status?e.message:'CSV mal formado; revisa comillas y número de columnas.',422,'csv');}
  requireThat(rows.length>0&&rows.length<=config.importMaxRows,`Debe haber entre 1 y ${config.importMaxRows} filas.`,422);
  return rows.map(row=>{
    const result={...row,submit_for_review:true};
    for(const key of ['wholesale_cents','retail_cents','moq','pack_multiple','stock']) {
      if(key==='retail_cents'&&!row[key]) result[key]=null;
      else result[key]=/^\d+$/.test(row[key]||'')?Number(row[key]):Number.NaN;
    }
    result.same_tax_basis=row.same_tax_basis==='true';result.active=row.active!=='false';
    if(row.same_tax_basis&&!['true','false'].includes(row.same_tax_basis)) result.same_tax_basis='invalid';
    if(row.active&&!['true','false'].includes(row.active)) result.active='invalid';
    result.images=row.image_url?[{url:row.image_url,alt:row.name}]:[];
    if(!row.updated_at) delete result.updated_at;
    if(!row.external_id) delete result.external_id;
    return result;
  });
}
export async function stageImport(db,req,rows,{key=null,sourceId=null}={}) {
  requireThat(rows.length>0&&rows.length<=config.importMaxRows,'Cantidad de filas fuera de límite.',422);
  const brandId=req.org.brand_id,requestHash=hash(JSON.stringify(rows));
  if(key) {
    const existing=(await db.query('SELECT * FROM import_jobs WHERE brand_id=$1 AND idempotency_key=$2',[brandId,key])).rows[0];
    if(existing) {requireThat(existing.request_hash===requestHash,'Clave reutilizada con datos distintos.',409);return existing;}
  }
  const categories=new Set((await db.query('SELECT id FROM categories')).rows.map(c=>c.id));
  const seen=new Set();
  const validated=rows.map((data,index)=>{
    const parsed=productSchema.safeParse(data),errors=[];
    if(!parsed.success) errors.push(...parsed.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`));
    if(!categories.has(data.category_id)) errors.push('Categoría no reconocida.');
    if(seen.has(data.sku)) errors.push('SKU duplicado dentro del lote.');seen.add(data.sku);
    return {row:index+2,data:parsed.success?parsed.data:JSON.parse(JSON.stringify(data)),errors};
  });
  const job=(await db.query(`INSERT INTO import_jobs(brand_id,created_by,state,row_count,source_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[brandId,req.user?.id||null,validated.some(r=>r.errors.length)?'invalid':'staged',rows.length,sourceId,key,requestHash])).rows[0];
  for(const row of validated) await db.query('INSERT INTO import_rows(job_id,row_number,data,errors) VALUES($1,$2,$3,$4)',[job.id,row.row,row.data,JSON.stringify(row.errors)]);
  await audit(db,req,'import.staged',job.id,{rows:rows.length,state:job.state});return job;
}
export async function applyImport(db,req,jobId,{sourceId=null}={}) {
  const job=(await db.query('SELECT * FROM import_jobs WHERE id=$1 AND brand_id=$2 FOR UPDATE',[jobId,req.org.brand_id])).rows[0];
  requireThat(job,'Lote no encontrado.',404);
  if(job.state==='applied') return {id:job.id,reused:true};
  requireThat(job.state==='staged','El lote tiene errores. Corrige el archivo y vuelve a previsualizar.',422);
  const rows=(await db.query('SELECT data FROM import_rows WHERE job_id=$1 ORDER BY row_number',[job.id])).rows;
  const results=[];
  for(const row of rows) results.push(await upsertProduct(db,req.org.brand_id,{...row.data,submit_for_review:true},{sourceId}));
  await db.query(`UPDATE import_jobs SET state='applied',applied_at=now() WHERE id=$1`,[job.id]);
  await audit(db,req,'import.applied',job.id,{rows:rows.length,source:sourceId});
  return {id:job.id,results,message:'Lote aplicado de forma atómica. Los productos nuevos y cambios sensibles requieren revisión.'};
}
