// Export the existing frontend without changing public/ or the Express app.
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { demoProducts, demoBrand } from './pages-demo-catalog.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'_site');
await rm(output,{recursive:true,force:true});
await cp(path.join(root,'public'),output,{recursive:true});
async function adapt(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory()){await adapt(filename);continue;}
    if(!/\.(html|css|js)$/.test(filename))continue;
    let text=await readFile(filename,'utf8');
    text=text.replace(/(["'(\s,])\/(images|fonts|modules|brand)\//g,'$1./$2/')
      .replace(/(["'])\/(styles\.css|discovery\.css|brand-signup\.css|vendo-brand\.css|mark\.svg|packaging\.svg)/g,'$1./$2')
      .replaceAll('location.pathname','window.loteRoute().pathname')
      .replaceAll('location.search','window.loteRoute().search')
      .replaceAll('new URL(location.href)','window.loteRoute()');
    if(entry.name==='app.js')text=text.replace("window.addEventListener('popstate',render);","window.addEventListener('hashchange',render);window.addEventListener('popstate',render);");
    if(entry.name==='index.html')text=text.replace('<script type="module" src="./modules/app.js"></script>','<script src="./pages-runtime.js"></script><script type="module" src="./modules/app.js"></script>');
    await writeFile(filename,text);
  }
}
await adapt(output);
await cp(path.join(root,'scripts/pages-runtime.js'),path.join(output,'pages-runtime.js'));
await writeFile(path.join(output,'modules/router.js'),`export function navigate(path,{replace=false}={}) {
  const url=new URL(path,location.origin);
  if(url.origin!==location.origin)return location.assign(path);
  const hash='#'+url.pathname+url.search;
  if(replace){history.replaceState({},'',location.pathname+location.search+hash);window.dispatchEvent(new Event('lote:navigate'));}
  else if(location.hash===hash)window.dispatchEvent(new Event('lote:navigate'));
  else location.hash=hash;
}
export const reload=()=>navigate(window.loteRoute().pathname+window.loteRoute().search,{replace:true});
`);
const staticApi = "// Solo GitHub Pages: listado de muestra. No se conecta a un servidor ni crea cuentas.\nexport const state={user:null,organizations:[],organizationId:null,csrfToken:null,sandbox:true,purchasesEnabled:false,staticDemo:true,contact:null};\nconst categories=__CATEGORIES__;\nconst products=__DEMO_PRODUCTS__;\nconst demoBrand=__DEMO_BRAND__;\nfunction notFound(){const error=new Error('Elemento no encontrado.');error.status=404;throw error;}\nexport async function api(path,{method='GET'}={}){\n  const endpoint=new URL(path,'https://vendo.invalid');\n  const route=endpoint.pathname;\n  if(method==='GET'){\n    if(route==='/me')return {...state};\n    if(route==='/demo/info')return {enabled:false,available:false};\n    if(route==='/categories')return categories;\n    if(route==='/brands'){\n      const query=(endpoint.searchParams.get('q')||'').toLocaleLowerCase('es');\n      return demoBrand.name.toLocaleLowerCase('es').includes(query)?[demoBrand]:[];\n    }\n    if(route==='/brands/'+demoBrand.id)return demoBrand;\n    if(route==='/products'){\n      const filter=endpoint.searchParams;\n      let selected=products.filter(p=>\n        (!filter.has('category')||filter.get('category')===p.category_id)&&\n        (!filter.has('brand')||filter.get('brand')===p.brand_id)&&\n        (!filter.has('q')||(p.name+' '+p.description+' '+p.sku).toLocaleLowerCase('es').includes(filter.get('q').toLocaleLowerCase('es')))&&\n        (!filter.has('min_price')||p.wholesale_cents>=Number(filter.get('min_price')))&&\n        (!filter.has('max_price')||p.wholesale_cents<=Number(filter.get('max_price')))&&\n        (!filter.has('max_moq')||p.moq<=Number(filter.get('max_moq')))&&\n        (!filter.has('min_margin')||p.margin_percent>=Number(filter.get('min_margin')))&&\n        (!filter.has('max_brand_min')||p.min_order_cents<=Number(filter.get('max_brand_min')))&&\n        (filter.get('available')!=='true')&&\n        (filter.get('selection')!=='small'||p.moq<=12)\n      );\n      const sort=filter.get('sort')||'date';\n      if(sort==='price')selected.sort((a,b)=>a.wholesale_cents-b.wholesale_cents);\n      else if(sort==='price-desc')selected.sort((a,b)=>b.wholesale_cents-a.wholesale_cents);\n      else if(sort==='margin')selected.sort((a,b)=>b.margin_percent-a.margin_percent);\n      else if(sort==='moq')selected.sort((a,b)=>a.moq-b.moq);\n      const limit=Math.min(48,Math.max(1,Number(filter.get('limit'))||24));\n      const page=Math.max(1,Number(filter.get('page'))||1);\n      return {products:selected.slice((page-1)*limit,page*limit),total:selected.length,page,pages:Math.ceil(selected.length/limit),newDays:30};\n    }\n    if(route.startsWith('/products/')&&route.endsWith('/reviews'))return [];\n    if(route.startsWith('/products/'))return products.find(p=>route==='/products/'+p.id)||notFound();\n  }\n  const error=new Error('Esta vista de GitHub Pages solo muestra productos de demostración. Para registrarse, cargar catálogos o guardar información se necesita conectar un servidor y una base de datos.');error.status=503;throw error;\n}\nexport async function refreshMe(){return state;}\nexport const currentOrg=()=>state.organizations.find(o=>o.id===state.organizationId);\n"
  .replace('__CATEGORIES__',JSON.stringify([{"id":"hogar","name":"Hogar y cocina","parent_id":null},{"id":"belleza","name":"Belleza y cuidado","parent_id":null},{"id":"moda","name":"Moda y accesorios","parent_id":null},{"id":"tecnologia","name":"Tecnología","parent_id":null},{"id":"regalos","name":"Regalos y papelería","parent_id":null},{"id":"juguetes","name":"Juguetes y hobbies","parent_id":null}]))
  .replace('__DEMO_PRODUCTS__',JSON.stringify(demoProducts))
  .replace('__DEMO_BRAND__',JSON.stringify(demoBrand));
await writeFile(path.join(output,'modules/api.js'),staticApi);
await writeFile(path.join(output,'.nojekyll'),'');
await mkdir(path.join(output,'modules'),{recursive:true});
console.log('Exported original public/ frontend to _site. Backend operations remain unavailable.');

// Version module URLs so browsers cannot mix files from successive deployments.
const version=process.env.GITHUB_SHA||String(Date.now());
for(const entry of await readdir(path.join(output,'modules'))){
  if(!entry.endsWith('.js'))continue;
  const file=path.join(output,'modules',entry);
  const source=await readFile(file,'utf8');
  await writeFile(file,source.replace(/(['"])(\.\/[^'"\s]+\.js)\1/g,(_,quote,url)=>quote+url+'?v='+version+quote));
}
const indexFile=path.join(output,'index.html');
await writeFile(indexFile,(await readFile(indexFile,'utf8')).replaceAll('./modules/app.js','./modules/app.js?v='+version).replaceAll('./pages-runtime.js','./pages-runtime.js?v='+version));
