import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {showcaseProducts} from '../public/modules/showcase-data.js';
import {findShowcase} from '../public/modules/showcase.js';
test('exhibición contiene 20 ejemplos sin inventario comercial y fotos cuadradas verificables',async()=>{
 const sources=JSON.parse(await readFile(new URL('../docs/EXHIBICION_FUENTES.json',import.meta.url)));
 assert.equal(showcaseProducts.length,20);assert.equal(new Set(showcaseProducts.map(p=>p.id)).size,20);
 let photos=0;
 for(const p of showcaseProducts){
  assert.equal(p.is_showcase,true);assert.ok(p.description.length>80);
  for(const key of ['price','wholesale_cents','stock','available','brand_id','moq'])assert.equal(p[key],undefined);
  const source=sources.products.find(s=>s.sourceId===p.source_id);assert.ok(source);
  for(const im of p.images){
   assert.ok(im.url.startsWith('/images/exhibicion/'+p.source_id+'/'));
   const bytes=await readFile(new URL('../public'+im.url,import.meta.url)),metadata=await sharp(bytes).metadata();
   assert.equal(metadata.width,1000);assert.equal(metadata.height,1000);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),source.assets.find(a=>a.url===im.url).sha256);photos++;
  }
 }
 assert.equal(photos,30);
});
test('exhibición respeta búsqueda y categoría sin simular filtros de ofertas',()=>{
 assert.equal(findShowcase(new URLSearchParams({q:'LÁBIAL'})).length,1);
 assert.equal(findShowcase(new URLSearchParams({category:'moda'})).length,5);
 for(const key of ['brand','min_price','max_price','max_moq','max_brand_min','min_margin','available','selection'])assert.equal(findShowcase(new URLSearchParams({[key]:'1'})).length,0);
});
