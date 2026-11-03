import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {showcaseProducts} from '../public/modules/showcase-data.js';
import {findShowcase,homeShowcase} from '../public/modules/showcase.js';
test('exhibición contiene 100 ejemplos sin inventario comercial y fotos cuadradas verificables',async()=>{
 const sources=JSON.parse(await readFile(new URL('../docs/EXHIBICION_FUENTES.json',import.meta.url)));
 assert.equal(showcaseProducts.length,100);assert.equal(new Set(showcaseProducts.map(p=>p.id)).size,100);
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
 assert.equal(photos,127);
});
test('exhibición respeta búsqueda y categoría sin simular filtros de ofertas',()=>{
 assert.equal(findShowcase(new URLSearchParams({q:'LÁBIAL'})).length,1);
 assert.equal(findShowcase(new URLSearchParams({category:'moda'})).length,17);
 for(const key of ['brand','min_price','max_price','max_moq','max_brand_min','min_margin','available','selection'])assert.equal(findShowcase(new URLSearchParams({[key]:'1'})).length,0);
});

test('portada variada y categorías de regalos y hobbies con imágenes',()=>{
 const home=homeShowcase().slice(0,16);assert.equal(new Set(home.map(p=>p.category_id)).size,6);
 for(const category of ['regalos','juguetes'])assert.ok(findShowcase(new URLSearchParams({category})).length>=8);
});
