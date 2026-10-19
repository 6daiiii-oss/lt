// Pages-only routing and a visible explanation of disconnected server actions.
// The normal Express application does not load this file.
window.loteRoute=()=>new URL(location.hash.startsWith('#/')?location.hash.slice(1):'/',location.origin);
function adaptLinksAndForms(){
  for(const link of document.querySelectorAll('a[href^="/"]')){
    const href=link.getAttribute('href');
    if(href.startsWith('//')||href.startsWith('/api/')||href.startsWith('/media/'))continue;
    link.setAttribute('href','#'+href);
  }
  const auth=document.querySelector('[data-form="auth"]');
  if(auth&&!auth.dataset.disconnected){
    auth.dataset.disconnected='true';
    const message=document.createElement('p');
    message.className='notice warning';
    message.textContent='El acceso y el registro requieren conectar el servidor de Lote. Esta publicación no guarda datos ni crea cuentas.';
    auth.before(message);
    auth.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  const banner=document.createElement('div');
  banner.setAttribute('role','note');
  banner.style.cssText='padding:10px 20px;text-align:center;background:#fff3d8;color:#514225;font:12px/1.5 Arial,sans-serif;border-bottom:1px solid #e4cf9d';
  banner.textContent='Interfaz original de Lote · Servidor y base de datos pendientes de conexión. Cuentas, inventario y pedidos no están disponibles en esta publicación.';
  document.body.prepend(banner);
  new MutationObserver(adaptLinksAndForms).observe(document.querySelector('#app'),{childList:true,subtree:true});
  adaptLinksAndForms();
});
