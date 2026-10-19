import { api, currentOrg, refreshMe, state } from './api.js';
import { errorText, empty, button, onAction } from './ui.js';
import { privateShell, publicShell } from './layout.js';
import { publicView } from './public.js';
import { accountView, authView } from './account.js';
import { sellerView } from './seller.js';
import { adminView } from './admin.js';
import { navigate, reload } from './router.js';
import { bindSearch, disposeSearch } from './search.js';
let generation=0;
async function render() {
  const current=++generation,root=document.querySelector('#app'),path=location.pathname.replace(/\/$/,'')||'/',url=new URL(location.href);
  disposeSearch();
  root.setAttribute('aria-busy','true');
  let shell=publicShell;
  try {
    const privateRoute=/^\/(cuenta|panel|administracion|pedidos|favoritos|notificaciones|buzon|carrito|checkout|incidencias)(\/|$)/.test(path);
    if(privateRoute) {
      await refreshMe();
      if(current!==generation)return;
      if(!state.user){navigate('/login?next='+encodeURIComponent(path+url.search),{replace:true});return;}
      root.innerHTML='<main id="main" class="container loading" tabindex="-1" aria-live="polite">Abriendo tu espacio…</main>';
    }
    let view=await authView(path,url)||await publicView(path,url);
    if(!view) {
      if(!state.user){navigate('/login?next='+encodeURIComponent(path+url.search),{replace:true});return;}
      const admin=path.startsWith('/administracion'),seller=path.startsWith('/panel'),shopping=path==='/carrito'||path.startsWith('/checkout/');
      if(admin&&!state.user.is_admin)throw new Error('Esta cuenta no tiene acceso administrativo.');
      if(seller&&currentOrg()?.kind!=='seller')throw new Error('Este espacio pertenece a las marcas y proveedores.');
      shell=shopping?publicShell:body=>privateShell(body,admin?'admin':seller?'seller':currentOrg()?.kind==='seller'?'seller':'buyer');
      view=admin?await adminView(path,url):seller?await sellerView(path,url):null;
      if(!view)view=await accountView(path,url);
    }
    if(current!==generation)return;
    root.innerHTML=shell(view?.html||`<section class="container page">${empty('Esta página no está disponible.','Revisa la dirección o vuelve al inicio.',button('Volver a Lote','/'))}</section>`);
    view?.bind?.();
    bindSearch('global-search');
    onAction('logout',async()=>{await api('/auth/logout',{method:'POST',body:{}});state.organizationId=null;await refreshMe();navigate('/');});
    document.querySelector('#org-switch')?.addEventListener('change',async event=>{state.organizationId=event.target.value;await refreshMe();reload();});
    document.querySelectorAll('img').forEach(image=>image.addEventListener('error',()=>{const span=document.createElement('span');span.className='image-placeholder';span.textContent='Imagen no disponible';image.replaceWith(span);},{once:true}));
    const h1=document.querySelector('h1');document.title=h1?`${h1.innerText.replace(/\s+/g,' ').trim()} — Lote`:'Lote';
    document.querySelector('#main')?.focus({preventScroll:true});window.scrollTo({top:0});
  }catch(error) {
    if(current!==generation)return;
    if(error.status===401){state.user=null;state.organizations=[];state.organizationId=null;state.csrfToken=null;navigate('/login?next='+encodeURIComponent(path+url.search)+'&sesion=caducada',{replace:true});return;}
    root.innerHTML=shell(`<section class="container page">${empty('No pudimos completar esta vista.',errorText(error),'<button class="button" data-action="retry">Volver a intentar</button>')}<p><a class="link-under" href="/">Volver al inicio</a></p></section>`);onAction('retry',reload);
  }finally{root.removeAttribute('aria-busy');}
}
document.addEventListener('click',event=>{
  const filters=document.querySelector('.filter-popover[open]');if(filters&&!filters.contains(event.target))filters.open=false;
  const a=event.target.closest('a[href]');if(!a||a.target||a.hasAttribute('download')||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  const url=new URL(a.href,location.origin);
  if(url.origin!==location.origin||url.hash||url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/'))return;
  event.preventDefault();navigate(url.pathname+url.search);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const filters=document.querySelector('.filter-popover[open]');if(filters){filters.open=false;filters.querySelector('summary')?.focus();}}});
window.addEventListener('popstate',render);window.addEventListener('lote:navigate',render);
try{await refreshMe();}catch(error){console.error('No se pudo consultar la sesión.');}
await render();
