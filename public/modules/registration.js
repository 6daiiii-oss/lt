import { brandJourney } from './brand-onboarding.js';
import { api, currentOrg, refreshMe, state } from './api.js';
import { button, esc, field, formEnd, notice, onForm, toast } from './ui.js';
import { navigate, reload } from './router.js';
export async function registrationPhoneView() {
 if(!state.user){navigate('/registro',{replace:true});return {html:''};}
 if(state.user.phone_verified_at){navigate(currentOrg()?.kind==='seller'?'/panel/empezar':'/cuenta',{replace:true});return {html:''};}
 const p=await api('/auth/phone'),messages=p.localPreview?await api('/dev/sms'):[];
 const body=`
 ${p.localPreview?notice('Prueba local: no se envían mensajes reales. Usa el código de ejemplo que aparece abajo.','warning'):''}
 ${p.pending?`<p>Enviamos un código a <b>${esc(p.pending.phone)}</b>.</p><form data-form="registration-code" class="stack">${field('code','Código de 6 dígitos','text','','required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}${formEnd('Verificar y continuar')}</form>`:notice('Solicita el código para verificar tu número.')}
 <details ${p.pending?'':'open'}><summary>${p.pending?'Cambiar número o reenviar código':'Enviar código'}</summary><form data-form="registration-send" class="stack">${field('phone','Número de celular con +51','tel',p.pending?.phone||p.phone||'+51','required autocomplete="tel" placeholder="+51987654321"')}${formEnd('Enviar código por SMS')}</form><p class="small muted">Puedes reenviar después de 60 segundos. El código vence en 10 minutos y permite hasta 5 intentos.</p></details>
 ${messages.map(m=>`<p class="notice">Código de prueba: <strong>${esc(m.code)}</strong></p>`).join('')}
 <p class="small">Tus datos ya están guardados. Si sales, inicia sesión para continuar.</p>${button('Volver al inicio','/',true)}`;
 const seller=currentOrg()?.kind==='seller';
 return {html:seller?brandJourney({step:2,title:'Verifica tu número',copy:'Un último paso para proteger tu cuenta. Después podrás crear tu primer producto.',body:`<div class="brand-verification">${body}</div>`}):`<section class="auth-wrap"><h1>Verifica tu número</h1><p>Confirma tu celular para terminar el registro.</p>${body}</section>`,bind(){
 onForm('registration-send',async d=>{await api('/auth/phone/send',{method:'POST',body:d});reload();});
 onForm('registration-code',async d=>{await api('/auth/phone/verify',{method:'POST',body:{id:p.pending.id,code:d.code}});await refreshMe();navigate(currentOrg()?.kind==='seller'?'/panel/empezar':'/cuenta',{replace:true});});
 }};
}
