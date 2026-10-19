export function navigate(path,{replace=false}={}) {
  const url=new URL(path,location.origin);if(url.origin!==location.origin)return location.assign(path);
  history[replace?'replaceState':'pushState']({},'',url);window.dispatchEvent(new Event('lote:navigate'));
}
export const reload=()=>navigate(location.pathname+location.search,{replace:true});
