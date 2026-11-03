import {api} from './api.js';
import {area,button,esc,formEnd,onForm,toast} from './ui.js';
import {pageHeader} from './layout.js';
export async function supplierProfileView(){
 const {brand:b}=await api('/organizations/me');let avatar=b.avatar_id,banner=b.banner_id,uploading=0;
 return {html:pageHeader('Mi negocio','Personaliza tu perfil público','Opcional. Puedes completarlo cuando quieras, después del registro.',button('Volver a mi negocio','/panel/negocio',true))+`<section class="card"><form data-form="supplier-profile" class="stack"><div class="supplier-cover" id="supplier-cover">${banner?`<img src="/media/${esc(banner)}" alt="Banner de tu negocio">`:''}</div><div class="supplier-avatar" id="supplier-avatar">${avatar?`<img src="/media/${esc(avatar)}" alt="Foto de tu negocio">`:'<span>Tu foto</span>'}</div><label class="field"><span>Foto de perfil · JPG, PNG o WebP, hasta 5 MB</span><input type="file" data-profile-image="avatar" accept="image/jpeg,image/png,image/webp"></label><button class="text-button" type="button" data-remove-profile="avatar">Quitar foto</button><label class="field"><span>Banner · Recomendado: formato horizontal</span><input type="file" data-profile-image="banner" accept="image/jpeg,image/png,image/webp"></label><button class="text-button" type="button" data-remove-profile="banner">Quitar banner</button><p role="status" id="profile-upload-status"></p>${area('story','Descripción de tu negocio',b.story||'','maxlength="3000"')}<p class="small muted">Las imágenes y la descripción aparecerán en tu perfil cuando el negocio esté aprobado y sus condiciones estén completas.</p>${formEnd('Guardar perfil')}</form></section>`,bind(){
 const status=document.querySelector('#profile-upload-status'),submit=document.querySelector('[data-form=supplier-profile] button[type=submit]');
 function preview(kind,value){document.querySelector('#supplier-'+(kind==='avatar'?'avatar':'cover')).innerHTML=value?`<img src="/media/${esc(value)}" alt="${kind==='avatar'?'Foto':'Banner'} de tu negocio">`:kind==='avatar'?'<span>Tu foto</span>':'';}
 document.querySelectorAll('[data-profile-image]').forEach(input=>input.addEventListener('change',async()=>{
  const file=input.files[0];if(!file)return;if(file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='Usa una imagen JPG, PNG o WebP de hasta 5 MB.';input.value='';return;}
  uploading++;submit.disabled=true;status.textContent='Subiendo imagen…';
  try{const r=await api('/uploads?purpose=profile',{method:'POST',body:file,headers:{'Content-Type':file.type}});if(input.dataset.profileImage==='avatar')avatar=r.id;else banner=r.id;preview(input.dataset.profileImage,r.id);status.textContent='Imagen lista. Guarda el perfil para aplicar los cambios.';}catch(e){status.textContent=e.message;}finally{uploading--;submit.disabled=uploading>0;input.value='';}
 }));
 document.querySelectorAll('[data-remove-profile]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.removeProfile==='avatar')avatar=null;else banner=null;preview(b.dataset.removeProfile,null);}));
 onForm('supplier-profile',async d=>{if(uploading)throw Error('Espera a que termine la subida.');await api('/seller/profile',{method:'PUT',body:{avatar_id:avatar||null,banner_id:banner||null,story:d.story}});toast('Perfil guardado.');});
 }};
}
