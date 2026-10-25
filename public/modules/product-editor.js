import { api } from './api.js';
import { area, check, fieldFailure, esc, field, formEnd, inputMoney, money, notice, onForm, select, toast, toCents } from './ui.js';
import { pageHeader } from './layout.js';
import { navigate } from './router.js';

export function productEditor(p,categories,{onboarding=false}={}) {
  const photos=(p.images||[]).map(im=>({...im})),draftSku=p.sku||'LOTE-'+crypto.randomUUID().slice(0,8).toUpperCase();
  return {html:`${pageHeader('Productos',p.id?'Editar producto':'Añadir un producto','Añade una foto y los datos principales. Puedes completar los detalles después.')}
  <p><a class="link-under" href="/panel/productos">← Volver a mis productos</a></p><section class="card"><form data-form="product" class="form-grid">
  <h2 class="full">1. Fotos del producto</h2>
  <div class="full stack"><p class="small">Añade hasta 8 fotos. La primera será la portada. Puedes cambiarla o quitar fotos antes de guardar.</p><label class="field"><span>Añadir fotos desde tu dispositivo</span><input id="product-files" name="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p id="upload-state" class="small" role="status"></p><div id="photo-editor" class="photo-editor"></div>
  <details><summary>También puedes añadir una foto desde un enlace</summary><div class="actions">${field('photo_url','Enlace de la foto','url','','placeholder="https://…"')}<button type="button" class="button secondary" id="add-photo-url">Añadir foto del enlace</button></div></details></div>
  <h2 class="full">2. Datos del producto</h2>
  ${field('name','Nombre del producto','text',p.name||'','required maxlength="500"')}
  ${select('category_id','Categoría',[['','Selecciona una categoría'],...categories.map(c=>[c.id,c.name])],p.category_id||'')}
  ${field('wholesale','Tu precio por unidad (S/)','number',p.id?inputMoney(p.wholesale_cents):'','min="0.01" step="0.01" required')}
  <div>${field('retail','Precio sugerido de reventa (S/, opcional)','number',p.retail_cents?inputMoney(p.retail_cents):'','min="0.01" step="0.01" placeholder="Ej.: 35.00"')}<p class="small muted">Precio orientativo para las tiendas. No obliga a revender a ese importe.</p></div>
  <details class="full"><summary>Comparar precios e impuestos (opcional)</summary>
    <p class="small"><b>Precio que pagará la tienda:</b> <output id="price-preview" aria-live="polite"></output>. Precio final por unidad con IGV incluido; Vendo descuenta su comisión al proveedor. Envío aparte.</p>
    <p class="small muted" id="resale-preview" aria-live="polite"></p>
    ${check('same_tax_basis','Ambos precios corresponden a la misma unidad e incluyen los mismos impuestos (para calcular una diferencia comparable).',p.same_tax_basis)}
  </details>
  <h2 class="full">3. Unidades disponibles y compra mínima</h2>
  <div>${field('stock','¿Cuántas unidades tienes para vender?','number',p.total??0,`min="${p.reserved||0}" max="1000000" step="1" required`)}<p class="small muted">Ejemplo: si tienes 1100 unidades guardadas, escribe 1100 aquí.</p></div>
  <div>${field('moq','Mínimo de unidades por compra','number',p.moq??1,'min="1" max="1000000" step="1" required')}<p class="small muted">Deja 1 si puede comprar una sola unidad. Este campo NO es la cantidad que tienes.</p></div>
  <p class="notice full" id="quantity-preview" aria-live="polite"></p>
  <details class="full"><summary>Descripción (opcional)</summary>${area('description','Descripción del producto',p.description||'','placeholder="Describe qué incluye, material, tamaño, colores y presentación. Ejemplo: caja de 6 tazas de cerámica de 250 ml, color blanco."')}</details>
  <details class="full card"><summary>Más opciones (opcional): color, material, medidas y peso</summary><div class="form-grid">
  ${field('detail_color','Color','text',p.specifications?.Color||'','maxlength="100" placeholder="Ej.: Negro"')}
  ${field('detail_material','Material','text',p.specifications?.Material||'','maxlength="100" placeholder="Ej.: Algodón"')}
  <div class="full"><h3>Medidas (en centímetros)</h3><p class="small muted">Completa cada lado por separado. Deja vacío el que no corresponda.</p></div>
  ${field('detail_length','Largo (cm)','number',p.specifications?.['Largo (cm)']||'','min="0.01" max="100000" step="any" inputmode="decimal" placeholder="Ej.: 30"')}
  ${field('detail_width','Ancho (cm)','number',p.specifications?.['Ancho (cm)']||'','min="0.01" max="100000" step="any" inputmode="decimal" placeholder="Ej.: 20"')}
  ${field('detail_height','Alto (cm)','number',p.specifications?.['Alto (cm)']||'','min="0.01" max="100000" step="any" inputmode="decimal" placeholder="Ej.: 10"')}
  ${field('detail_weight','Peso (kg)','number',p.specifications?.['Peso (kg)']||'','min="0.001" max="100000" step="any" inputmode="decimal" placeholder="Ej.: 0.5"')}
  <div class="full"><h3>Características adicionales (opcional)</h3><p class="small">Agrega otros detalles del producto que no aparezcan arriba, como impermeabilidad o compatibilidad.</p><div id="spec-rows" class="stack"></div><button type="button" class="text-button" id="add-spec">Añadir característica</button></div>
  <div class="full">${check('active','Mantener este producto disponible',p.id?p.status!=='archived':true)}</div></div></details>
  <div class="full">${check('submit_for_review','Enviar a Vendo para que revise y publique el producto',p.id?p.status==='pending':true)}${formEnd(onboarding?'Guardar y seguir con mi catálogo':'Guardar producto')}</div>
  </form></section>`,bind(){
    const form=document.querySelector('[data-form=product]'),price=form.elements.wholesale,retail=form.elements.retail,sameTaxBasis=form.elements.same_tax_basis,minimum=form.elements.moq,stock=form.elements.stock,packCount=p.pack_multiple??1;
    form.elements.category_id.required=true;
    const explain=()=>{
      const n=Number(minimum.value),available=Number(stock.value),step=packCount;
      let base=null;
       try {base=toCents(price.value);document.querySelector('#price-preview').textContent=money(base);}catch{document.querySelector('#price-preview').textContent='Escribe tu precio';}
       const resaleInfo=document.querySelector('#resale-preview');
       if(!retail.value.trim())resaleInfo.textContent='Puedes indicar un precio sugerido de reventa para ayudar a las tiendas a comparar.';
       else {
         try {
           const suggested=toCents(retail.value);
           resaleInfo.textContent=base===null?'Completa tu precio por unidad para poder comparar.':
             !sameTaxBasis.checked?'Si ambos precios incluyen los mismos impuestos y unidades, marca la casilla para mostrar la diferencia bruta.':
             suggested<base?'Aviso: el precio sugerido es menor que el precio mayorista. Revisa si es correcto.':
             'Diferencia bruta orientativa por unidad: '+money(suggested-base)+' (antes de otros gastos).';
         }catch{resaleInfo.textContent='Indica un precio de reventa válido con hasta dos decimales.';}
       }
      document.querySelector('#quantity-preview').textContent=`Tienes ${available} unidades en total${p.reserved?` (${p.reserved} reservadas)`:''}. Cada pedido empieza desde ${n} unidad${n===1?'':'es'}${step>1?`, en grupos de ${step}`:''}.`+(available>0&&n>available?' El mínimo supera las unidades disponibles: nadie podrá comprar todavía.':'')+(n>=100?' Revisa el mínimo: ¿es lo que debe comprar cada cliente o lo que tienes guardado?':'');
    };
    [price,retail,minimum,stock].forEach(el=>el.addEventListener('input',explain));sameTaxBasis.addEventListener('change',explain);explain();
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
    const standardSpecs=['Color','Material','Largo (cm)','Ancho (cm)','Alto (cm)','Peso (kg)'];
    Object.entries(p.specifications||{}).filter(([key])=>!standardSpecs.includes(key)).forEach(([k,v])=>addSpec(k,v));
    document.querySelector('#add-spec').onclick=()=>addSpec();
    onForm('product',async d=>{
      if(uploading)throw new Error('Espera a que terminen de subir las fotos.');
      if(Number(d.moq)%packCount!==0)throw fieldFailure('moq','El mínimo debe ser un múltiplo de '+packCount+' unidades, según la presentación guardada.');
      const specs=Object.create(null);
      for(const row of document.querySelectorAll('.spec-row')){const key=row.querySelector('[name=spec_key]').value.trim(),value=row.querySelector('[name=spec_value]').value.trim();if(!key&&!value)continue;if(!key||!value)throw new Error('Completa la característica y su detalle, o quita esa fila.');if(standardSpecs.some(name=>name.toLocaleLowerCase('es')===key.toLocaleLowerCase('es')))throw new Error('Esa característica ya tiene un campo separado. Utiliza su campo correspondiente.');if(Object.hasOwn(specs,key))throw new Error('Cada característica debe tener un nombre diferente.');specs[key]=value;}
      for(const [input,key] of [['detail_color','Color'],['detail_material','Material']]){const value=d[input]?.trim();if(value)specs[key]=value;}
      for(const [input,key] of [['detail_length','Largo (cm)'],['detail_width','Ancho (cm)'],['detail_height','Alto (cm)'],['detail_weight','Peso (kg)']]){
        const value=d[input]?.trim();if(!value)continue;
        const n=Number(value);
        if(!Number.isFinite(n)||n<=(0)||n>100000)throw new Error('Revisa '+key+': debe ser un número positivo.');
        specs[key]=String(n);
      }
      const body={name:d.name,sku:draftSku,variant:p.variant||'',category_id:d.category_id,description:d.description,specifications:specs,wholesale_cents:toCents(d.wholesale),retail_cents:d.retail?toCents(d.retail):null,moq:Number(d.moq),pack_multiple:packCount,stock:Number(d.stock),same_tax_basis:!!d.same_tax_basis,active:!!d.active,submit_for_review:!!d.submit_for_review,images:photos.map(im=>({url:im.url,alt:d.name}))};
      const saved=await api('/seller/products'+(p.id?'/'+p.id:''),{method:p.id?'PUT':'POST',body});navigate('/panel/producto-guardado?id='+encodeURIComponent(saved.id));
    },{fieldMap:{wholesale_cents:"wholesale",retail_cents:"retail"}});
  }};
}

