import { api } from './api.js';
import { area, check, esc, field, formEnd, inputMoney, money, notice, onForm, select, toast, toCents } from './ui.js';
import { pageHeader } from './layout.js';
import { navigate } from './router.js';

export function productEditor(p,categories) {
  const photos=(p.images||[]).map(im=>({...im}));
  return {html:`${pageHeader('Productos',p.id?'Editar producto':'Añadir un producto','Empieza con el nombre, el precio y cuántas unidades tienes. Lo demás es opcional.')}
  <section class="card"><form data-form="product" class="form-grid">
  <h2 class="full">1. Datos del producto</h2>
  ${field('name','Nombre del producto','text',p.name||'','required maxlength="500"')}
  ${select('category_id','Categoría',categories.map(c=>[c.id,c.name]),p.category_id)}
  ${field('wholesale','Tu precio por unidad (S/)','number',p.id?inputMoney(p.wholesale_cents):'','min="0.01" step="0.01" required')}
  <div class="field"><span>El cliente pagará por unidad</span><output id="price-preview" aria-live="polite"></output><small>Precio final con IGV incluido. Lote descuenta su comisión al proveedor; el envío se suma aparte.</small></div>
  <h2 class="full">2. Unidades disponibles y compra mínima</h2>
  <div>${field('stock','¿Cuántas unidades tienes para vender?','number',p.total??0,`min="${p.reserved||0}" max="1000000" step="1" required`)}<p class="small muted">Ejemplo: si tienes 1100 unidades guardadas, escribe 1100 aquí.</p></div>
  <div>${field('moq','¿Desde cuántas unidades puede comprar el cliente?','number',p.moq??1,'min="1" max="1000000" step="1" required')}<p class="small muted">Deja 1 si puede comprar una sola unidad. Este campo NO es la cantidad que tienes.</p></div>
  <p class="notice full" id="quantity-preview" aria-live="polite"></p>
  <h2 class="full">3. Fotos del producto</h2>
  <div class="full stack"><p class="small">Añade hasta 8 fotos. La primera será la portada. Puedes cambiarla o quitar fotos antes de guardar.</p><label class="field"><span>Añadir fotos desde tu computadora</span><input id="product-files" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p id="upload-state" class="small" role="status"></p><div id="photo-editor" class="photo-editor"></div>
  <details><summary>También puedes añadir una foto desde un enlace</summary><div class="actions">${field('photo_url','Enlace de la foto','url','','placeholder="https://…"')}<button type="button" class="button secondary" id="add-photo-url">Añadir foto del enlace</button></div></details></div>
  <div class="full">${area('description','Descripción (opcional)',p.description||'')}</div>
  <details class="full card"><summary>Más opciones (opcional): color, características y venta por paquetes</summary><div class="form-grid">
  ${field('variant','Color, tamaño o presentación (opcional)','text',p.variant||'')}
  ${field('sku','Código del producto (se crea automáticamente si lo dejas vacío)','text',p.sku||'',`maxlength="100" ${p.id?'readonly':''}`)}
  ${field('retail','Precio sugerido de reventa (S/, opcional)','number',p.retail_cents?inputMoney(p.retail_cents):'','min="0.01" step="0.01"')}
  <div>${field('pack_multiple','¿Se vende en grupos de cuántas unidades?','number',p.pack_multiple??1,'min="1" max="1000000" step="1" required')}<p class="small muted">Deja 1 para vender unidades sueltas. Si solo vendes cajas de 6, escribe 6.</p></div>
  <div class="full"><h3>Características (opcional)</h3><p class="small">Escribe una característica y su detalle, por ejemplo Material y Algodón.</p><div id="spec-rows" class="stack"></div><button type="button" class="text-button" id="add-spec">Añadir característica</button></div>
  <div class="full">${check('same_tax_basis','El precio de reventa corresponde a la misma unidad e incluye los mismos impuestos que mi precio.',p.same_tax_basis)}${check('active','Mantener este producto disponible',p.id?p.status!=='archived':true)}</div></div></details>
  <div class="full">${check('submit_for_review','Enviar a Lote para que revise y publique el producto',p.id?p.status==='pending':true)}${formEnd('Guardar producto')}</div>
  </form></section>`,bind(){
    const form=document.querySelector('[data-form=product]'),price=form.elements.wholesale,minimum=form.elements.moq,stock=form.elements.stock,pack=form.elements.pack_multiple;
    const explain=()=>{
      const n=Number(minimum.value),available=Number(stock.value),step=Number(pack.value);
      try {const base=toCents(price.value);document.querySelector('#price-preview').textContent=money(base);}catch{document.querySelector('#price-preview').textContent='Escribe tu precio';}
      document.querySelector('#quantity-preview').textContent=`Tienes ${available} unidades en total${p.reserved?` (${p.reserved} reservadas)`:''}. Cada pedido empieza desde ${n} unidad${n===1?'':'es'}${step>1?`, en grupos de ${step}`:''}.`+(available>0&&n>available?' El mínimo supera las unidades disponibles: nadie podrá comprar todavía.':'')+(n>=100?' Revisa el mínimo: ¿es lo que debe comprar cada cliente o lo que tienes guardado?':'');
    };
    [price,minimum,stock,pack].forEach(el=>el.addEventListener('input',explain));explain();
    let uploading=false;
    const renderPhotos=()=>{document.querySelector('#photo-editor').innerHTML=photos.length?photos.map((im,i)=>`<article class="photo-tile"><img src="${esc(im.url)}" alt="Vista previa de la foto ${i+1}"><p>${i===0?'Portada':'Foto '+(i+1)}</p><div class="actions">${i?`<button type="button" class="text-button" data-cover="${i}">Usar de portada</button>`:''}<button type="button" class="text-button" data-remove="${i}" aria-label="Quitar foto ${i+1}">Quitar</button></div></article>`).join(''):'<p class="small muted">Aquí verás tus fotos antes de guardar.</p>';
      document.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{photos.unshift(...photos.splice(Number(b.dataset.cover),1));renderPhotos();});
      document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{photos.splice(Number(b.dataset.remove),1);renderPhotos();});
    };renderPhotos();
    document.querySelector('#product-files').addEventListener('change',async event=>{
      const input=event.target,files=[...input.files],status=document.querySelector('#upload-state');
      if(!files.length)return;
      if(uploading||photos.length+files.length>8){status.textContent='Puedes guardar hasta 8 fotos. Quita una antes de añadir más.';input.value='';return;}
      uploading=true;input.disabled=true;form.querySelector('button[type=submit]').disabled=true;
      const errors=[];
      try {for(const [index,file] of files.entries()) {
        status.textContent=`Subiendo foto ${index+1} de ${files.length}…`;
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5242880){errors.push(file.name+': usa JPG, PNG o WebP de hasta 5 MB.');continue;}
        try {const r=await api('/uploads?purpose=product',{method:'POST',body:file,headers:{'Content-Type':file.type}});photos.push({url:r.url,alt:form.elements.name.value||'Foto del producto'});renderPhotos();}catch(e){errors.push(file.name+': '+e.message);}
      }status.textContent=errors.length?errors.join(' '):'Fotos listas. Guarda el producto para conservar los cambios.';}
      finally {uploading=false;input.disabled=false;input.value='';form.querySelector('button[type=submit]').disabled=false;}
    });
    document.querySelector('#add-photo-url').onclick=()=>{const input=form.elements.photo_url,value=input.value.trim();try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error();if(photos.length>=8)throw new Error('Solo puedes añadir 8 fotos.');photos.push({url:value,alt:form.elements.name.value||'Foto del producto'});input.value='';renderPhotos();}catch{toast('Usa un enlace HTTPS válido. Se permiten hasta 8 fotos.');}};
    const addSpec=(key='',value='')=>{const row=document.createElement('div');row.className='spec-row';row.innerHTML=field('spec_key','Característica','text',key,'maxlength="80" placeholder="Material"')+field('spec_value','Detalle','text',value,'maxlength="500" placeholder="Algodón"')+'<button type="button" class="text-button">Quitar característica</button>';row.querySelector('button').onclick=()=>row.remove();document.querySelector('#spec-rows').append(row);};
    Object.entries(p.specifications||{}).forEach(([k,v])=>addSpec(k,v));document.querySelector('#add-spec').onclick=()=>addSpec();
    onForm('product',async d=>{
      if(uploading)throw new Error('Espera a que terminen de subir las fotos.');
      if(Number(d.moq)%Number(d.pack_multiple)!==0)throw new Error('El mínimo por compra debe coincidir con los grupos que vendes. Por ejemplo: grupos de 6 y mínimo 6 o 12.');
      const specs=Object.create(null);
      for(const row of document.querySelectorAll('.spec-row')){const key=row.querySelector('[name=spec_key]').value.trim(),value=row.querySelector('[name=spec_value]').value.trim();if(!key&&!value)continue;if(!key||!value)throw new Error('Completa la característica y su detalle, o quita esa fila.');if(Object.hasOwn(specs,key))throw new Error('Cada característica debe tener un nombre diferente.');specs[key]=value;}
      const body={name:d.name,sku:d.sku.trim()||'LOTE-'+crypto.randomUUID().slice(0,8).toUpperCase(),variant:d.variant,category_id:d.category_id,description:d.description,specifications:specs,wholesale_cents:toCents(d.wholesale),retail_cents:d.retail?toCents(d.retail):null,moq:Number(d.moq),pack_multiple:Number(d.pack_multiple),stock:Number(d.stock),same_tax_basis:!!d.same_tax_basis,active:!!d.active,submit_for_review:!!d.submit_for_review,images:photos.map(im=>({url:im.url,alt:d.name}))};
      await api('/seller/products'+(p.id?'/'+p.id:''),{method:p.id?'PUT':'POST',body});toast('Producto guardado.');navigate('/panel/productos');
    });
  }};
}

