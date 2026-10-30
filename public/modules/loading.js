// Show the destination's structure without displaying stale account data.
const block=(kind='')=>`<span class="skeleton-block ${kind}"></span>`;
const lines=()=>`${block('skeleton-line')}${block('skeleton-line short')}`;
const heading=()=>`<div class="skeleton-heading">${block('skeleton-title')}${block('skeleton-line')}</div>`;
const cards=(count=8)=>`<div class="skeleton-products">${Array.from({length:count},()=>`<div class="skeleton-card">${block('skeleton-photo')}<div class="skeleton-card-copy">${lines()}${block('skeleton-price')}</div></div>`).join('')}</div>`;
const categories=()=>`<div class="skeleton-categories">${Array.from({length:6},()=>block('skeleton-category')).join('')}</div>`;
const fields=(count=4)=>`<div class="skeleton-fields">${Array.from({length:count},()=>`<div>${block('skeleton-label')}${block('skeleton-input')}</div>`).join('')}${block('skeleton-submit')}</div>`;
const metrics=()=>`<div class="skeleton-metrics">${Array.from({length:3},()=>`<div class="skeleton-card skeleton-metric">${lines()}${block('skeleton-price')}</div>`).join('')}</div>`;
const table=()=>`<div class="skeleton-table">${Array.from({length:6},()=>`<div>${block('skeleton-avatar')}${block('skeleton-line')}${block('skeleton-line short')}${block('skeleton-price')}</div>`).join('')}</div>`;
const header=()=>`<header class="skeleton-header"><img src="/brand/vendo-principal.svg" width="148" height="28" alt="">${block('skeleton-nav')}${block('skeleton-search')}${block('skeleton-account')}</header>`;

export function loadingView(path=location.pathname,search=location.search) {
  path=path.replace(/\/$/,'')||'/';
  let type='content',body='',shell='public';
  if(path==='/') {
    type='home';body=`<div class="skeleton-hero"><div>${heading()}${lines()}${block('skeleton-submit')}</div>${block('skeleton-hero-photo')}</div>${categories()}${heading()}${cards()}`;
  } else if(path==='/catalogo'||path==='/exhibicion') {
    type='catalog';body=`${heading()}${categories()}<div class="skeleton-toolbar">${block('skeleton-filter')}${block('skeleton-filter')}</div>${cards(10)}`;
  } else if(/^\/(productos|exhibicion)\//.test(path)) {
    type='product';body=`${block('skeleton-line short')}<div class="skeleton-detail"><div>${block('skeleton-photo')}<div class="skeleton-thumbs">${block()}${block()}${block()}</div></div><div>${heading()}${lines()}${block('skeleton-price')}${lines()}${block('skeleton-submit')}</div></div>`;
  } else if(path==='/marcas') {
    type='brands';body=`${heading()}<div class="skeleton-brands">${Array.from({length:3},()=>`<div class="skeleton-card skeleton-brand">${block('skeleton-avatar')}${heading()}${lines()}</div>`).join('')}</div>`;
  } else if(path.startsWith('/marcas/')) {
    type='brand';body=`<div class="skeleton-card skeleton-brand">${block('skeleton-avatar')}${heading()}${lines()}</div>${heading()}${cards()}`;
  } else if(path==='/panel/empezar') {
    shell='auth';type='onboarding';body=`${heading()}<div class="skeleton-card skeleton-welcome">${heading()}${lines()}${block('skeleton-submit')}</div>`;
  } else if(/^\/(login|registro|recuperar|restablecer|verificar)(\/|$)/.test(path)) {
    const supplier=path==='/registro'&&new URLSearchParams(search).get('tipo')==='proveedor';
    const verification=path==='/registro/celular'||path==='/verificar';
    shell='auth';type=supplier?'signup':verification?'verification':'auth';body=`${supplier?block('skeleton-story'):''}<div class="skeleton-form">${heading()}${fields(path==='/registro'?5:verification||path==='/recuperar'?1:2)}</div>`;
  } else if(/^\/(panel|administracion|cuenta|pedidos|favoritos|notificaciones|incidencias|buzon|solicitudes|mensajes|solicitar)(\/|$)/.test(path)) {
    shell='private';
    if(/estadisticas|analitica|finanzas|comisiones/.test(path)) {
      type='statistics';body=`${heading()}${metrics()}<div class="skeleton-charts">${Array.from({length:2},()=>`<div class="skeleton-card skeleton-chart">${block('skeleton-line short')}${block('skeleton-chart-area')}</div>`).join('')}</div>`;
    } else if(/nuevo|editar|perfil|configuracion|seguridad|solicitar|marca$/.test(path)||/^\/panel\/productos\/[^/]+$/.test(path)) {
      type='editor';body=`${heading()}<div class="skeleton-card skeleton-editor">${fields(5)}</div>`;
    } else if(/productos|catalogo|pedidos|verificaciones|negocios|favoritos|notificaciones|incidencias|buzon|solicitudes|mensajes|pagos|liquidaciones|logistica|resenas|fuentes|auditoria/.test(path)) {
      type='records';body=`${heading()}${table()}`;
    } else {
      type='dashboard';body=`${heading()}<div class="skeleton-card skeleton-welcome">${heading()}${lines()}${block('skeleton-submit')}</div>${heading()}${table()}`;
    }
  } else if(/^\/(carrito|checkout)(\/|$)/.test(path)) {
    type='checkout';body=`${heading()}<div class="skeleton-detail"><div>${table()}</div><div class="skeleton-card skeleton-editor">${heading()}${lines()}${block('skeleton-submit')}</div></div>`;
  } else {
    body=`${heading()}<div class="skeleton-prose">${Array.from({length:4},()=>`<div>${block('skeleton-title')}${lines()}${lines()}</div>`).join('')}</div>`;
  }
  const sidebar=shell==='private'?`<aside class="skeleton-sidebar">${block('skeleton-sidebar-logo')}${Array.from({length:5},()=>block('skeleton-line')).join('')}</aside>`:'';
  return `<div class="page-skeleton skeleton-${shell}" data-loading-view="${type}"><p class="sr-only" role="status" aria-live="polite">Cargando la página de Vendo…</p><div class="skeleton-frame" aria-hidden="true">${sidebar}<div class="skeleton-main">${header()}<main id="main" tabindex="-1" class="skeleton-body skeleton-${type}">${body}</main></div></div></div>`;
}

// Paint direct links before awaiting the initial session request.
const initialRoot=document.querySelector('#app');
if(initialRoot?.hasAttribute('data-initial-loading')) {
  initialRoot.innerHTML=loadingView();
  initialRoot.setAttribute('aria-busy','true');
  initialRoot.removeAttribute('data-initial-loading');
}
