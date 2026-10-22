import { Router } from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { config } from './config.js';
import { exampleProduct, exampleBrand, exampleProducts, exampleBrandList } from './demo-catalog.js';
import { id, parse, requireThat } from './lib.js';
export const catalogRouter=Router();
export const catalogFrom=`FROM products p JOIN brands b ON b.id=p.brand_id JOIN organizations o ON o.id=b.organization_id JOIN inventory i ON i.product_id=p.id JOIN categories c ON c.id=p.category_id`;
export const catalogColumns=`p.id,p.name,p.description,p.sku,p.variant,p.specifications,p.category_id,p.wholesale_cents,p.retail_cents,p.moq,p.pack_multiple,p.published_at,
 b.id AS brand_id,b.name AS brand_name,b.min_order_cents,b.shipping_cents,b.shipping_regions,b.location,b.preparation_days,b.shipping_policy,b.return_policy,
 i.total-i.reserved AS available,i.source_updated_at,
 CASE WHEN p.retail_cents>0 AND p.same_tax_basis THEN round((p.retail_cents-p.wholesale_cents)*100.0/p.retail_cents,2) END AS margin_percent,
 (SELECT json_agg(json_build_object('url',pi.url,'alt',pi.alt) ORDER BY position) FROM product_images pi WHERE pi.product_id=p.id) AS images`;
export const visible=`p.status='published' AND o.status='approved' AND b.terms_approved=true`;
catalogRouter.get('/categories',async(req,res)=>res.json((await query(`SELECT c.*,count(p.id) FILTER(WHERE p.status='published' AND o.status='approved' AND b.terms_approved) ::int AS product_count
 FROM categories c LEFT JOIN products p ON p.category_id=c.id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN organizations o ON o.id=b.organization_id GROUP BY c.id
 ORDER BY CASE coalesce(c.parent_id,c.id) WHEN 'hogar' THEN 1 WHEN 'belleza' THEN 2 WHEN 'moda' THEN 3 WHEN 'tecnologia' THEN 4 WHEN 'regalos' THEN 5 WHEN 'juguetes' THEN 6 ELSE 7 END,c.parent_id NULLS FIRST,c.name`)).rows));
catalogRouter.get('/products',async(req,res)=>{
  const f=parse(z.object({q:z.string().max(100).optional(),category:z.string().max(60).optional(),brand:z.union([id,z.literal('demo-vendo')]).optional(),
    min_price:z.coerce.number().int().nonnegative().optional(),max_price:z.coerce.number().int().nonnegative().optional(),max_moq:z.coerce.number().int().positive().optional(),
    max_brand_min:z.coerce.number().int().nonnegative().optional(),min_margin:z.coerce.number().min(-10000).max(100).optional(),
    available:z.enum(['true','false']).optional(),selection:z.enum(['new','small','margin']).optional(),
    sort:z.enum(['date','price','price-desc','margin','moq']).default('date'),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(48).default(24)}),req.query);
  const values=[],where=[visible],bind=(value)=>{values.push(value);return `$${values.length}`;};
  if(f.q) {
    const terms=f.q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim().split(/\s+/).filter(Boolean).slice(0,10);
    for(const term of terms) {
      const literal=term.replace(/[\\%_]/g,'\\$&');
      where.push(`translate(lower(concat_ws(' ',p.name,b.name,c.name,p.sku)), 'áéíóúüñ', 'aeiouun') LIKE ${bind('%'+literal+'%')}`);
    }
  }
  if(f.category) where.push(`(p.category_id=${bind(f.category)} OR c.parent_id=$${values.length})`);
  if(f.brand) { if(f.brand==='demo-vendo') where.push('FALSE'); else where.push(`p.brand_id=${bind(f.brand)}`); }
  if(f.min_price!==undefined) where.push(`p.wholesale_cents>=${bind(f.min_price)}`);
  if(f.max_price!==undefined) where.push(`p.wholesale_cents<=${bind(f.max_price)}`);
  if(f.max_moq) where.push(`p.moq<=${bind(f.max_moq)}`);
  if(f.max_brand_min!==undefined) where.push(`b.min_order_cents<=${bind(f.max_brand_min)}`);
  if(f.min_margin!==undefined) where.push(`p.retail_cents>0 AND p.same_tax_basis AND (p.retail_cents-p.wholesale_cents)*100.0/p.retail_cents>=${bind(f.min_margin)}`);
  if(f.available==='true') where.push(`i.total-i.reserved>0 AND i.source_updated_at>now()-${bind(config.stockMaxAgeHours)}*interval '1 hour'`);
  if(f.selection==='new') where.push(`p.published_at>now()-${bind(config.newDays)}*interval '1 day'`);
  if(f.selection==='small') where.push('p.moq<=12');
  if(f.selection==='margin') where.push('p.retail_cents>0 AND p.same_tax_basis');
  const order={date:'p.published_at DESC',price:'p.wholesale_cents', 'price-desc':'p.wholesale_cents DESC',margin:'margin_percent DESC NULLS LAST',moq:'p.moq'}[f.selection==='margin'&&!req.query.sort?'margin':f.sort];
  const base=`${catalogFrom} WHERE ${where.join(' AND ')}`;
  const realTotal=Number((await query(`SELECT count(*) ${base}`,values)).rows[0].count);
  // Los artículos comerciales se muestran primero; ejemplos solo en lugares restantes.
  const examples=config.publicDemoCatalog?exampleProducts(f):[];
  const offset=(f.page-1)*f.limit;
  const realTake=Math.max(0,Math.min(f.limit,realTotal-offset));
  let rows=[];
  if(realTake) {
    const argumentsForPage=[...values,realTake,offset];
    rows=(await query(`SELECT ${catalogColumns} ${base} ORDER BY ${order},p.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,argumentsForPage)).rows;
  }
  const demoStart=Math.max(0,offset-realTotal);
  if(rows.length<f.limit)rows.push(...examples.slice(demoStart,demoStart+f.limit-rows.length));
  const total=realTotal+examples.length;
  res.json({products:rows,total,page:f.page,pages:Math.ceil(total/f.limit),stockMaxAgeHours:config.stockMaxAgeHours,newDays:config.newDays});
});
catalogRouter.get('/products/:id',async(req,res)=>{
  const sample=config.publicDemoCatalog&&exampleProduct(req.params.id);
  if(sample)return res.json({...sample,stockMaxAgeHours:config.stockMaxAgeHours});
  const p=(await query(`SELECT ${catalogColumns} ${catalogFrom} WHERE ${visible} AND p.id=$1`,[id.parse(req.params.id)])).rows[0];
  requireThat(p,'Producto no disponible.',404);res.json({...p,stockMaxAgeHours:config.stockMaxAgeHours});
});
catalogRouter.get('/products/:id/reviews',async(req,res)=>{
  if(config.publicDemoCatalog&&exampleProduct(req.params.id))return res.json([]);
  res.json((await query(`SELECT r.id,r.rating,r.body,r.created_at,o.name AS store_name FROM reviews r JOIN order_items oi ON oi.id=r.order_item_id JOIN organizations o ON o.id=r.buyer_id
    JOIN products p ON p.id=oi.product_id JOIN brands b ON b.id=p.brand_id JOIN organizations seller ON seller.id=b.organization_id
    WHERE oi.product_id=$1 AND r.status='published' AND p.status='published' AND seller.status='approved' ORDER BY r.created_at DESC LIMIT 100`,[id.parse(req.params.id)])).rows);
});
const publicBrandColumns=`b.id,b.name,b.story,b.location,b.min_order_cents,b.shipping_cents,b.shipping_regions,b.preparation_days,b.shipping_policy,b.return_policy,o.status AS commercial_status`;
catalogRouter.get('/brands',async(req,res)=>{
  const search=z.string().max(100).parse(req.query.q||'');
  const brands=(await query(`SELECT ${publicBrandColumns},count(p.id)::int AS product_count FROM brands b JOIN organizations o ON o.id=b.organization_id LEFT JOIN products p ON p.brand_id=b.id AND p.status='published'
    WHERE o.status='approved' AND b.terms_approved AND translate(lower(b.name),'áéíóúüñ','aeiouun') LIKE $1 GROUP BY b.id,o.status ORDER BY b.name LIMIT 100`,['%'+search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[\\%_]/g,'\\$&')+'%'])).rows;
  res.json(config.publicDemoCatalog?[...brands,...exampleBrandList(search)]:brands);
});
catalogRouter.get('/brands/:id',async(req,res)=>{
  const sample=config.publicDemoCatalog&&exampleBrand(req.params.id);
  if(sample)return res.json(sample);
  const brand=(await query(`SELECT ${publicBrandColumns} FROM brands b JOIN organizations o ON o.id=b.organization_id WHERE b.id=$1 AND o.status='approved' AND b.terms_approved`,[id.parse(req.params.id)])).rows[0];
  requireThat(brand,'Marca no disponible.',404);
  const ratings=(await query(`SELECT r.id,r.rating,r.body,r.created_at FROM reviews r JOIN order_items oi ON oi.id=r.order_item_id JOIN orders ord ON ord.id=oi.order_id WHERE ord.brand_id=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 50`,[brand.id])).rows;
  res.json({...brand,reviews:ratings});
});
