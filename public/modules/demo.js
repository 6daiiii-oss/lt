import { api, refreshMe, state } from './api.js';
import { button, notice, onAction } from './ui.js';
import { pageHeader } from './layout.js';
import { navigate } from './router.js';
export async function demoView(path) {
  if(path!=='/prueba-compra')return null;
  const info=await api('/demo/info');
  return {html:`<section class="container page">${pageHeader('Compra de prueba','Prueba cómo funciona Vendo','Productos, compradores y marcas de ejemplo. No se cobra dinero real.')}
  <ol class="demo-steps"><li>1. Elige productos</li><li>2. Revisa tu bolsa</li><li>3. Prueba el pago</li><li>4. Prepara y recibe el pedido</li></ol>
  ${info.enabled?`${notice('Esta demo usa una base de datos separada. Las cuentas ya tienen correo, celular y dirección preparados.')}<div class="panel-grid"><article class="card"><h2>Empieza como comprador</h2><p>Elige productos, añádelos a la bolsa y completa el pago de prueba.</p><button class="button" data-action="demo-start" data-role="buyerA">Empezar compra de prueba</button></article><article class="card"><h2>Revisa el pedido como marca</h2><p>Cambia de cuenta cuando termines la compra para preparar y enviar el pedido.</p><div class="actions"><button class="button secondary" data-action="demo-start" data-role="sellerA">Entrar como marca A</button><button class="button secondary" data-action="demo-start" data-role="sellerB">Entrar como marca B</button><button class="text-button" data-action="demo-start" data-role="admin">Entrar como administrador</button></div></article></div>`:info.available?`${notice('Tu tienda sigue funcionando en esta ventana. Abre la demo para practicar con cuentas y productos de ejemplo.')}<a class="button" href="http://127.0.0.1:3200/prueba-compra" target="_blank" rel="noopener">Abrir demo de compra</a>`:notice('La compra de prueba no está disponible en este entorno.')}</section>`,bind(){onAction('demo-start',async el=>{await api('/demo/login',{method:'POST',body:{role:el.dataset.role}});state.organizationId=null;await refreshMe();navigate(el.dataset.role==='buyerA'?'/catalogo':el.dataset.role==='admin'?'/administracion':'/panel/pedidos');});}};
}
