import { api, currentOrg } from './api.js';
import { badge, button, empty, esc, money } from './ui.js';
import { pageHeader } from './layout.js';
export async function sellerStartView() {
 const products=await api('/seller/products'),org=currentOrg();
 return {html:pageHeader('Tu catálogo',products.length?'Sigue añadiendo productos':'Crea tu primer producto',`Tu número está verificado. ${org.name} ya tiene un espacio para preparar su catálogo.`)+
 `<section class="card"><h2>${products.length?'Tu catálogo está tomando forma':'Empieza con un producto'}</h2><p>Añade nombre, fotos, descripción, precio, unidades disponibles y mínimo de unidades por compra. Puedes guardar varios productos, uno después de otro.</p><div class="actions">${button(products.length?'Añadir otro producto':'Crear mi primer producto','/panel/productos/nuevo?inicio=1')}${button('Completar datos de mi marca','/panel/marca',true)}</div><p class="small muted">Guardar un producto no lo publica automáticamente. Lote revisa tu negocio y tu catálogo antes de mostrarlos a las tiendas.</p></section>`+
 (products.length?`<div class="record-list section">${products.map(p=>`<article class="record"><h2><a href="/panel/productos/${p.id}">${esc(p.name)}</a></h2>${p.description?`<p>${esc(p.description.slice(0,180))}</p>`:''}<dl class="summary-dl"><dt>Precio por unidad</dt><dd>${money(p.wholesale_cents)}</dd><dt>Unidades disponibles</dt><dd>${p.available}</dd><dt>Mínimo de unidades por compra</dt><dd>${p.moq}</dd></dl>${badge(p.status)}</article>`).join('')}</div>`:empty('Tu catálogo está listo para empezar.','No necesitas cargar todos los productos de una sola vez.'))};
}
