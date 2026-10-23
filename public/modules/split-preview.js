import { api } from './api.js';
import { field,select,formEnd,onForm,money,table,notice,toCents,esc } from './ui.js';
export function splitPreview(brands){
 if(!brands.length)return '';
 return `<section class="card section"><h2>Reparto entre proveedores</h2><p>Comprueba una compra de varias marcas. Esta simulación no crea pedidos, no cobra y no mueve fondos.</p><form data-form="split-preview" class="stack"><div id="split-rows" class="stack"></div><button class="text-button" type="button" id="add-split-row">Añadir otro proveedor</button>${field('split_processing','Procesamiento total cotizado al comprador (S/)','number','0','min="0" max="1000000" step="0.01" required')}${formEnd('Calcular reparto')}</form><div id="split-result" class="section" aria-live="polite"></div></section>`;
}
export function bindSplitPreview(brands){
 const target=document.querySelector('#split-rows');if(!target)return;
 function add(){if(target.children.length>=brands.length)return;const row=document.createElement('fieldset');row.className='form-grid split-row';const legend=document.createElement('legend');legend.textContent='Proveedor '+(target.children.length+1);row.append(legend);const fields=document.createElement('div');fields.className='full form-grid';fields.innerHTML=select('split_seller','Proveedor',brands.map(b=>[b.id,b.name]),brands[target.children.length].id)+field('split_products','Productos (S/)','number','1000','min="0.01" max="1000000" step="0.01" required')+field('split_shipping','Envío (S/)','number','0','min="0" max="1000000" step="0.01" required');row.append(fields);const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Quitar proveedor';remove.onclick=()=>{row.remove();};row.append(remove);target.append(row);}
 add();document.querySelector('#add-split-row').onclick=add;
 onForm('split-preview',async d=>{
  const sellers=[...target.querySelectorAll('.split-row')].map(row=>({seller_id:row.querySelector('[name=split_seller]').value,products_cents:toCents(row.querySelector('[name=split_products]').value),shipping_cents:toCents(row.querySelector('[name=split_shipping]').value)}));
  const result=await api('/admin/split-preview',{method:'POST',body:{sellers,processing_cents:toCents(d.split_processing)}});
  document.querySelector('#split-result').innerHTML=notice('Total del comprador: '+money(result.buyer_cents)+' · Vendo: '+money(result.platform_cents)+' · Procesamiento: '+money(result.processor_cents))+table(['Proveedor','Productos','Envío','Comisión con IGV','Recibe el proveedor'],result.sellers.map(s=>`<tr><td>${esc(brands.find(b=>b.id===s.seller_id)?.name||'Proveedor')}</td><td>${money(s.products_cents)}</td><td>${money(s.shipping_cents)}</td><td>${money(s.commission_cents)}</td><td>${money(s.seller_cents)}</td></tr>`))+notice('Reparto orientativo. La ejecución está bloqueada hasta contratar una pasarela que soporte el modelo.');
 });
}
