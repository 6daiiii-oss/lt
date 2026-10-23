import { api, currentOrg, refreshMe, state } from './api.js';
import { brandJourney } from './brand-onboarding.js';
import { field, formEnd, onForm, toast } from './ui.js';
import { navigate } from './router.js';
import { consentFields } from './legal.js';
export async function brandSignupView() {
 if(state.user){navigate(state.user.is_admin?'/administracion':!state.user.phone_verified_at?'/registro/celular':currentOrg()?.kind==='seller'?'/panel/empezar':'/cuenta',{replace:true});return {html:''};}
 return {html:brandJourney({title:'Crea el espacio de tu marca',copy:'Empieza con tus datos. Después verifica tu celular y añade tu primer producto.',body:`
 <form data-form="auth" class="brand-signup-form">
 <input type="hidden" name="kind" value="seller">
 <fieldset class="brand-fieldset"><legend>Tu marca y tu contacto</legend>
 ${field('businessName','Nombre de tu negocio','text','','required maxlength="500" autocomplete="organization" placeholder="Nombre de tu marca"')}
 ${field('name','Tu nombre','text','','required maxlength="500" autocomplete="name" placeholder="Nombre y apellido"')}
 <div class="brand-field-row">${field('email','Correo electrónico','email','','required maxlength="254" autocomplete="email" placeholder="tu@marca.com"')}
 <div class="brand-phone-field">${field('phone','Tu número de celular','tel','','required maxlength="16" autocomplete="tel" inputmode="tel" placeholder="987 654 321"')}<p class="brand-field-help">Perú (+51). Aquí recibirás el código por SMS.</p></div></div>
 <p class="brand-field-help">Solo verificamos el celular. El correo queda como contacto.</p>
 </fieldset>
 <fieldset class="brand-fieldset"><legend>Protege tu cuenta</legend><div class="brand-password">${field('password','Contraseña · mínimo 12 caracteres','password','','required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Crea una contraseña segura"')}<button class="brand-password-toggle" type="button" aria-pressed="false" aria-label="Mostrar contraseña">Mostrar</button></div></fieldset>
 <details class="brand-legal-details"><summary>Datos legales (opcional por ahora)</summary><p>Puedes completar estos datos después, antes de solicitar la revisión de tu negocio.</p>${field('legal_name','Nombre o razón social (opcional)','text','','maxlength="500" autocomplete="organization"')}${field('tax_id','RUC (opcional)','text','','inputmode="numeric" pattern="[0-9]{11}" maxlength="11"')}</details>
 ${consentFields()}
 ${formEnd('Continuar y verificar mi número')}
 </form><div class="brand-switch-role">¿Quieres comprar para tu tienda? <a href="/registro">Regístrate como comprador</a>.</div>
 <div class="brand-fee-note"><b>Comisiones claras desde el principio.</b><p>7% sobre productos, con IGV de la comisión incluido. Sin comisión sobre envío. El procesamiento de pago se informará al comprador antes de confirmar; todavía no hay cobros habilitados.</p></div>`}),bind(){
 const toggle=document.querySelector('.brand-password-toggle'),input=document.querySelector('[data-form=auth] [name=password]');
 toggle.addEventListener('click',()=>{const visible=input.type==='password';input.type=visible?'text':'password';toggle.textContent=visible?'Ocultar':'Mostrar';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');});
 onForm('auth',async data=>{
  await api('/auth/register',{method:'POST',body:{...data,kind:'seller',terms_accepted:data.terms_accepted==='true'}});await refreshMe();
  try{await api('/auth/phone/send',{method:'POST',body:{phone:data.phone}});}catch(error){toast(error.message);}
  navigate('/registro/celular',{replace:true});
 });
 }};
}
