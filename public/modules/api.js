export const state={user:null,organizations:[],organizationId:null,csrfToken:null,sandbox:true};
export async function api(path,{method='GET',body,headers={}}={}) {
  const options={method,credentials:'same-origin',headers:{...(state.organizationId?{'X-Organization-Id':state.organizationId}:{}),...(state.csrfToken?{'X-CSRF-Token':state.csrfToken}:{}),...headers}};
  if(body!==undefined) {
    if(body instanceof Blob||typeof body==='string') options.body=body;
    else {options.body=JSON.stringify(body);options.headers['Content-Type']='application/json';}
  }
  const response=await fetch('/api'+path,options);
  const data=await response.json().catch(()=>({message:'El servidor no devolvió una respuesta válida.'}));
  if(!response.ok) {const error=new Error(data.message||'No fue posible completar la solicitud.');error.status=response.status;error.details=data.details;throw error;}
  return data;
}
export async function refreshMe() {
  let me;
  try {me=await api('/me');}catch(e){if(e.status!==403)throw e;state.organizationId=null;me=await api('/me');}
  Object.assign(state,me);return me;
}
export const currentOrg=()=>state.organizations.find(o=>o.id===state.organizationId);
