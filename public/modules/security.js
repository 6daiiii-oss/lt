import { api, refreshMe, state } from './api.js';
import { button, date, esc, field, formEnd, notice, onAction, onForm, toast } from './ui.js';
import { pageHeader } from './layout.js';
import { navigate, reload } from './router.js';
export async function securityView() {
  const p=await api('/auth/phone'),messages=p.localPreview?await api('/dev/sms'):[];
  return {html:`${pageHeader('Seguridad','Verifica y protege tu cuenta.','El número verificado habilita tu cuenta. El correo sirve para contacto y recuperación.')}
    <div class="panel-grid"><section class="card stack"><h2>Correo electrónico</h2><p>${esc(state.user.email)}</p>
    ${notice(state.user.verified_at?'Correo confirmado.':'Correo de contacto. Su verificación no es necesaria para usar tu cuenta.',state.user.verified_at?'info':'warning')}

    ${!state.user.verified_at?`<p class="small muted">Si quieres usar este correo para recuperar tu contraseña, puedes confirmarlo de forma opcional.</p><form data-form="security-resend">${formEnd('Activar recuperación por correo (opcional)')}</form>`:''}
    ${state.mailLocal?button('Mi buzón local','/buzon',true):''}
    <h2>Cambiar contraseña</h2><form data-form="password" class="stack">
    ${field('currentPassword','Contraseña actual','password','','required autocomplete="current-password"')}
    ${field('password','Nueva contraseña','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}
    ${field('confirmation','Repetir nueva contraseña','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}
    ${formEnd('Actualizar contraseña')}</form></section>
    <section class="card stack"><h2>Celular verificado</h2>
    ${notice(p.verified_at?'Verificado: '+p.phone:'Aún no verificaste un celular.',p.verified_at?'info':'warning')}
    ${p.localPreview?notice('Modo local: los códigos aparecen aquí. No se envían SMS reales.','warning'):''}
    <form data-form="phone-send" class="stack">${field('phone','Celular peruano con +51','tel',p.pending?.phone||p.phone||'+51','required autocomplete="tel" placeholder="+51987654321"')}${formEnd('Enviar código')}</form>
    <p class="small muted">Espera 60 segundos entre envíos. Hasta 5 solicitudes por hora. El número anterior sigue verificado hasta confirmar el nuevo.</p>
    ${p.pending?`<form data-form="phone-verify" class="stack">${field('code','Código de verificación','text','','required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}<p class="small">Caduca: ${date(p.pending.expires_at)}. Máximo 5 intentos.</p>${formEnd('Verificar celular')}</form>`:''}
    ${messages.map(m=>`<p class="notice">SMS local para ${esc(m.phone)}: <strong>${esc(m.code)}</strong></p>`).join('')}</section></div><section class="card section"><h2>Tus datos personales</h2><p>Descarga una copia de tus datos de cuenta y del registro de aceptación de condiciones. No incluye contraseñas, códigos ni datos de otras cuentas.</p><button class="button secondary" data-action="export-data">Descargar mis datos</button><p class="small"><a class="link-under" href="/privacidad">Consultar privacidad y derechos</a></p></section>`,bind(){
    onAction('export-data',async()=>{const data=await api('/account/data-export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='vendo-mis-datos.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    onForm('security-resend',async()=>toast((await api('/auth/resend',{method:'POST',body:{}})).message));
    onForm('phone-send',async d=>{await api('/auth/phone/send',{method:'POST',body:d});toast(p.localPreview?'Código disponible en el buzón SMS local.':'Código enviado.');reload();});
    onForm('phone-verify',async d=>{await api('/auth/phone/verify',{method:'POST',body:{id:p.pending.id,code:d.code}});await refreshMe();toast('Celular verificado.');reload();});
    onForm('password',async d=>{if(d.password!==d.confirmation)throw new Error('Las contraseñas no coinciden.');await api('/auth/password',{method:'POST',body:{currentPassword:d.currentPassword,password:d.password}});await refreshMe();toast('Contraseña actualizada. Inicia sesión de nuevo.');navigate('/login');});
  }};
}
