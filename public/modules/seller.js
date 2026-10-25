import { analyticsView } from './analytics.js';
import { sellerHomeView,sellerBusinessView,sellerSettingsView,productSavedView } from './seller-journey.js';
import { sellerStartView } from './seller-start.js';
import { simulator, bindSimulator } from './finance.js';
import { normalizeRegion, peruRegions } from './regions.js';
import { productEditor } from './product-editor.js';
import { api, currentOrg, state } from './api.js';
import { area, badge, button, check, date, empty, esc, field, formEnd, inputMoney, money, notice, onAction, onForm, select, short, table, toast, toCents } from './ui.js';
import { pageHeader } from './layout.js';
import { navigate, reload } from './router.js';
const stat=(label,value)=>`<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
export async function sellerView(path,url) {
  if(path==='/panel/empezar')return sellerStartView();
  if(path==='/panel/inventario') {
    const list=await api('/seller/products');
    return {html:pageHeader('Inventario','Stock disponible y reservado.','Edita el producto para actualizar existencias.')+table(['Producto','Total','Reservado','Disponible','Última actualización'],list.map(p=>`<tr><td><a href="/panel/productos/${p.id}">${esc(p.name)}</a></td><td>${p.total}</td><td>${p.reserved}</td><td>${p.available}</td><td>${date(p.source_updated_at)}</td></tr>`))};
  }
  if(path==='/panel/envios') {
    const list=await api('/seller/shipments');
    return {html:pageHeader('Envíos','Preparación y seguimiento.','Abre el pedido para registrar transportista y código de despacho.')+table(['Pedido','Tienda','Estado','Transportista','Seguimiento'],list.map(o=>`<tr><td><a href="/panel/pedidos/${o.id}">${short(o.id)}</a></td><td>${esc(o.buyer_name)}</td><td>${badge(o.state)}</td><td>${esc(o.carrier||'Por registrar')}</td><td>${esc(o.tracking_code||'—')}</td></tr>`))};
  }
  if(path==='/panel/incidencias') {
    const list=await api('/seller/incidents');
    return {html:pageHeader('Posventa','Devoluciones e incidencias.','Responde desde el caso y adjunta evidencias. Resolver el caso no ejecuta automáticamente un reembolso.')+(list.length?table(['Caso','Pedido','Estado','Fecha'],list.map(i=>`<tr><td><a href="/incidencias/${i.id}">${esc(i.reason)}</a></td><td><a href="/panel/pedidos/${i.order_id}">${short(i.order_id)}</a></td><td>${badge(i.state)}</td><td>${date(i.created_at)}</td></tr>`)):empty('Sin incidencias.','Los casos abiertos desde pedidos aparecerán aquí.'))};
  }

  if(path==='/panel')return sellerHomeView();
  if(path==='/panel/negocio')return sellerBusinessView();
  if(path==='/panel/configuracion')return sellerSettingsView();
  if(path==='/panel/producto-guardado')return productSavedView(url);
  if(path==='/panel/productos') {
    const products=await api('/seller/products');
    return {html:pageHeader('Mis productos','Mis productos','Revisa lo que ya guardaste y añade nuevos productos.',button('Añadir producto','/panel/productos/nuevo'))+(products.length?'<div class="supplier-products">'+products.map(p=>`<article class="card supplier-product"><div>${p.images?.[0]?`<img class="supplier-product-photo" src="${esc(p.images[0].url)}" alt="${esc(p.name)}" loading="lazy">`:''}</div><div><h2><a href="/panel/productos/${p.id}">${esc(p.name)}</a></h2>${badge(p.status)}<dl class="summary-dl"><dt>Precio mayorista</dt><dd>${money(p.wholesale_cents)} / unidad</dd><dt>Compra mínima</dt><dd>${p.moq} unidades</dd><dt>Disponibles</dt><dd>${p.available} unidades</dd></dl><details><summary>Más información</summary><p>Código interno: ${esc(p.sku)}. Presentación: ${esc(p.variant||'Única')}. Grupos de venta: ${p.pack_multiple} unidades.</p><p>Precio al cliente: ${money(p.customer_price_cents)}. Reventa sugerida: ${p.retail_cents?money(p.retail_cents):'Sin referencia'}.</p><p>Unidades totales: ${p.total}. Reservadas: ${p.reserved}.</p><button class="text-button" data-action="archive-product" data-id="${p.id}">Archivar</button></details><p>${button('Editar producto','/panel/productos/'+p.id,true)}</p></div></article>`).join('')+'</div>':empty('Tu catálogo empieza con un producto.','Añade su foto, precio y unidades. Vendo lo revisará antes de publicarlo.',button('Crear mi primer producto','/panel/productos/nuevo?inicio=1')))+ '<p class="section"><a class="link-under" href="/panel/inventario">Revisar todas mis existencias</a></p>',bind(){onAction('archive-product',async el=>{if(!confirm('¿Archivar este producto? Se ocultará del catálogo y conservará su historial.'))return;await api('/seller/products/'+el.dataset.id+'/archive',{method:'POST',body:{}});reload();});}};
  }
  const productId=path.match(/^\/panel\/productos\/([^/]+)$/)?.[1];
  if(productId) {
    const [categories,products]=await Promise.all([api('/categories'),productId==='nuevo'?Promise.resolve([]):api('/seller/products')]);
    const p=products.find(p=>p.id===productId)||{};
    if(productId!=='nuevo'&&!p.id)throw new Error('Producto no encontrado.');
    return productEditor(p,categories,{onboarding:url.searchParams.get('inicio')==='1'});
  }
  if(path==='/panel/marca') {
    const o=await api('/organizations/me'),b=o.brand;
    return {html:`${pageHeader('Tu marca','Claridad para tus próximas tiendas.','Estas condiciones se mostrarán antes de confirmar cada pedido.',button('Volver a mi negocio','/panel/negocio',true))}<section class="card"><form data-form="brand" class="form-grid">${field('name','Nombre de marca','text',b.name,'required')}${field('location','Ubicación pública','text',b.location,'required')}<div class="full">${area('story','Una historia breve',b.story)}</div>${field('minimum','Compra mínima por marca S/','number',inputMoney(b.min_order_cents),'min="0" step="0.01" required')}${field('shipping','Envío por pedido S/','number',inputMoney(b.shipping_cents),'min="0" step="0.01" required')}<fieldset class="full"><legend>¿A qué regiones puedes enviar?</legend><p class="small">Marca las regiones donde puedes entregar pedidos.</p><div class="region-options">${peruRegions.map(name=>check('shipping_region',name,b.shipping_regions.map(normalizeRegion).includes(normalizeRegion(name)),normalizeRegion(name))).join('')}</div></fieldset>${field('preparation_days','Días de preparación declarados','number',b.preparation_days,'min="0" required')}<div class="full"><button type="button" class="text-button" data-action="example-shipping">Usar texto de ejemplo para el envío</button>${area('shipping_policy','Condiciones de preparación y despacho',b.shipping_policy,'required')}</div><div class="full"><button type="button" class="text-button" data-action="example-returns">Usar texto de ejemplo para problemas con un pedido</button>${area('return_policy','Condiciones para incidencias, cancelaciones y devoluciones',b.return_policy,'required')}</div><div class="full">${check('terms_approved','He revisado mis condiciones y autorizo mostrarlas a las tiendas.',b.terms_approved)}${formEnd('Guardar condiciones')}<p><a class="link-under" href="/panel/negocio">Continuar con mi negocio</a></p></div></form></section>`,bind(){onAction('example-shipping',()=>{const days=document.querySelector('[name=preparation_days]').value;document.querySelector('[name=shipping_policy]').value='Preparamos el pedido en hasta '+days+' días. La cobertura y el costo de envío son los indicados en esta ficha.';toast('Revisa el texto de ejemplo antes de confirmar tus condiciones.');});onAction('example-returns',()=>{document.querySelector('[name=return_policy]').value='Si hay un problema con tu pedido, abre una incidencia en Vendo para que podamos revisarlo.';toast('Revisa el texto de ejemplo antes de confirmar tus condiciones.');});onForm('brand',async(d,form)=>{const shipping_regions=new FormData(form).getAll('shipping_region').map(normalizeRegion);if(!shipping_regions.length)throw new Error('Selecciona al menos una región a la que puedas enviar.');await api('/seller/brand',{method:'PUT',body:{name:d.name,location:d.location,story:d.story,min_order_cents:toCents(d.minimum),shipping_cents:toCents(d.shipping),shipping_regions,preparation_days:Number(d.preparation_days),shipping_policy:d.shipping_policy,return_policy:d.return_policy,terms_approved:!!d.terms_approved}});toast('Condiciones guardadas.');reload();});}};
  }
  if(['/panel/estadisticas','/panel/analitica','/panel/finanzas','/panel/liquidaciones'].includes(path))return analyticsView(url);
  if(/^\/panel\/(importaciones|fuentes|tiendas)(\/|$)/.test(path))return {html:pageHeader('Panel de marca','Esta opción ya no está disponible.')+button('Volver al panel','/panel')};
  return null;
}

