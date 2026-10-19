// Export the existing frontend without changing public/ or the Express app.
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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
    text=text.replace(/(["'(])\/(images|fonts|modules)\//g,'$1./$2/')
      .replace(/(["'])\/(styles\.css|discovery\.css|mark\.svg|packaging\.svg)/g,'$1./$2')
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
await writeFile(path.join(output,'modules/api.js'),`export const state={user:null,organizations:[],organizationId:null,csrfToken:null,sandbox:true};
const categories=${JSON.stringify([['hogar','Hogar y cocina'],['belleza','Belleza y cuidado'],['moda','Moda y accesorios'],['tecnologia','Tecnología'],['regalos','Regalos y papelería'],['juguetes','Juguetes y hobbies']].map(([id,name])=>({id,name,parent_id:null})))};
export async function api(path,{method='GET'}={}){
  const endpoint=new URL(path,'https://lote.invalid');
  if(method==='GET'){
    if(endpoint.pathname==='/me')return {...state};
    if(endpoint.pathname==='/categories')return categories;
    if(endpoint.pathname==='/products')return {products:[],total:0,page:1,pages:0,newDays:30};
    if(endpoint.pathname==='/brands')return [];
  }
  const error=new Error('El servidor de Lote aún no está conectado a esta publicación. Esta acción requiere el servidor y la base de datos originales.');error.status=503;throw error;
}
export async function refreshMe(){return state;}
export const currentOrg=()=>state.organizations.find(o=>o.id===state.organizationId);
`);
await writeFile(path.join(output,'.nojekyll'),'');
await mkdir(path.join(output,'modules'),{recursive:true});
console.log('Exported original public/ frontend to _site. Backend operations remain unavailable.');
