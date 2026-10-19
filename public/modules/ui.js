export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const arrow='<svg class="arrow-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 15 15 5M5 5h10v10"/></svg>';
export const money=value=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(value||0)/100);
export const date=value=>value?new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const short=id=>String(id).slice(0,8).toUpperCase();
export const labels={pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado',correction:'Requiere corrección',suspended:'Suspendido',draft:'Borrador',published:'Publicado',blocked:'Bloqueado',archived:'Archivado',awaiting_payment:'Pendiente de pago',confirmed:'Confirmado',preparing:'En preparación',shipped:'Enviado',delivered:'Entregado',cancelled:'Cancelado',expired:'Caducado',failed:'Fallido',exception:'En conciliación',payment_exception:'En conciliación',refunded:'Reembolsado',partially_refunded:'Reembolso parcial',open:'Abierta',in_review:'En revisión',resolved:'Resuelta',eligible:'Elegible',scheduled:'Programada',paid:'Pagada (sandbox)',staged:'Validado',invalid:'Con errores',applied:'Aplicado',hidden:'Oculta',succeeded:'Completado',running:'En ejecución'};
export const badge=s=>`<span class="badge ${['approved','published','delivered','succeeded','applied'].includes(s)?'positive':['blocked','failed','invalid','suspended','exception','payment_exception'].includes(s)?'negative':''}">${esc(labels[s]||s)}</span>`;
export const button=(label,href,secondary=false)=>`<a class="button ${secondary?'secondary':''}" href="${esc(href)}">${esc(label)} ${arrow}</a>`;
export function empty(title,copy,action='') {return `<div class="empty"><span class="empty-symbol" aria-hidden="true">L.</span><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;}
export function notice(copy,type='info') {return `<div class="notice ${type}" role="${type==='error'?'alert':'note'}">${esc(copy)}</div>`;}
let fieldSequence=0;
export function field(name,label,type='text',value='',extra='') {const fid='f-'+name+'-'+(++fieldSequence);return `<label class="field" for="${esc(fid)}"><span>${esc(label)}</span><input id="${esc(fid)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
export function area(name,label,value='',extra='') {return `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="4" ${extra}>${esc(value)}</textarea></label>`;}
export function select(name,label,options,value='') {const fid='f-'+name+'-'+(++fieldSequence);return `<div class="field"><label for="${esc(fid)}">${esc(label)}</label><select id="${esc(fid)}" name="${esc(name)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;}
export const check=(name,label,checked=false)=>`<label class="check"><input type="checkbox" name="${esc(name)}" ${checked?'checked':''}> <span>${esc(label)}</span></label>`;
export const formEnd=(label)=>`<div class="form-message" role="alert" tabindex="-1"></div><button class="button" type="submit">${esc(label)}</button>`;
export function errorText(e) {let detail='';if(Array.isArray(e.details))detail=e.details.map(d=>typeof d==='string'?d:`${d.field||''}: ${d.message||''}`).join(' · ');return `${e.message}${detail?' '+detail:''}`;}
export function toast(message) {const el=document.querySelector('#toast');el.textContent=message;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,6000);}
export function onForm(name,handler) {
  const form=document.querySelector(`[data-form="${name}"]`);if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(form)),buttons=[...form.querySelectorAll('button[type=submit]')],message=form.querySelector('.form-message');
    if(message)message.textContent='';buttons.forEach(b=>b.disabled=true);form.setAttribute('aria-busy','true');
    try {await handler(data,form);}catch(e){if(message){message.textContent=errorText(e);message.focus();}else toast(errorText(e));}
    finally{buttons.forEach(b=>b.disabled=false);form.removeAttribute('aria-busy');}
  });
}
export function onAction(name,handler) {document.querySelectorAll(`[data-action="${name}"]`).forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await handler(el);}catch(e){toast(errorText(e));}finally{el.disabled=false;}}));}
export const numbers=(data,keys)=>{for(const k of keys)data[k]=Number(data[k]);return data;};
export function toCents(value) {const raw=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error('Usa un importe con hasta dos decimales.');const [whole,fraction='']=raw.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
export const inputMoney=value=>(Number(value||0)/100).toFixed(2);
export function cards(products) {return `<div class="product-grid">${products.map(p=>`<article class="product-card"><a href="/productos/${esc(p.id)}" class="product-art">${p.images?.[0]?`<img src="${esc(p.images[0].url)}" alt="${esc(p.images[0].alt)}" loading="lazy">`:'<span class="image-placeholder">L.<small>Imagen no disponible</small></span>'}</a><div class="product-info"><a class="muted small" href="/marcas/${esc(p.brand_id)}">${esc(p.brand_name)}</a><h3><a href="/productos/${esc(p.id)}">${esc(p.name)}</a></h3><div class="price">${money(p.wholesale_cents)}<span>/ unidad</span></div><p class="small">Mín. ${p.moq} unidades · ${p.available>0?'Stock: '+p.available:'Sin stock'}</p><div class="product-foot"><span>PVP sug. ${p.retail_cents?money(p.retail_cents):'Sin referencia'}</span><b>${p.margin_percent!==null&&p.margin_percent!==undefined?esc(p.margin_percent)+'% margen est.':'Sin referencia'}</b></div></div></article>`).join('')}</div>`;}
export function table(headers,rows) {return `<div class="table-scroll" tabindex="0" aria-label="Tabla desplazable"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
