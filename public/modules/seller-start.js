import { api, currentOrg,state } from './api.js';
import { brandSteps } from './brand-onboarding.js';
import { badge, button, empty, esc, money } from './ui.js';
import { pageHeader } from './layout.js';
export async function sellerStartView() {
 const products=await api('/seller/products'),org=currentOrg();
 return {html:`<section class="container page welcome-view">`+brandSteps(3)+pageHeader('Tu catálogo',products.length?'Sigue añadiendo productos':'¡Bienvenido a Vendo!',`${org.name} ya tiene un espacio para mostrar sus productos.`)+(state.user.phone_verified_at?'<p class="small">✓ Celular verificado</p>':'')+
 `<section class="card"><h2>${products.length?'Tu catálogo está tomando forma':'Empieza con un producto'}</h2><p>Empieza con una foto, el nombre, el precio y las unidades. Después puedes añadir más productos.</p><div class="actions">${button(products.length?'Añadir otro producto':'Crear mi primer producto','/panel/productos/nuevo?inicio=1')}${products.length?button('Completar datos de mi negocio','/panel/negocio',true):''}</div><p class="small muted">Guardar un producto no lo publica automáticamente. Vendo revisa tu negocio y tu catálogo antes de mostrarlos a las tiendas.</p></section>`+
 (products.length?`<div class="record-list section">${products.map(p=>`<article class="record"><h2><a href="/panel/productos/${p.id}">${esc(p.name)}</a></h2>${p.description?`<p>${esc(p.description.slice(0,180))}</p>`:''}<dl class="summary-dl"><dt>Precio por unidad</dt><dd>${money(p.wholesale_cents)}</dd><dt>Unidades disponibles</dt><dd>${p.available}</dd><dt>Mínimo de unidades por compra</dt><dd>${p.moq}</dd></dl>${badge(p.status)}</article>`).join('')}</div>`:'')+`<p class="section"><a class="link-under" href="/panel">Ir al inicio de mi negocio</a></p></section>`};
}
