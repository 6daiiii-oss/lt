import { api } from './api.js';
import { LEGAL_VERSION,legalDocuments } from './legal-content.js';
import { esc,notice } from './ui.js';
export function consentFields(){return `<div class="registration-consent"><input type="hidden" name="terms_version" value="${LEGAL_VERSION}"><label class="check"><input type="checkbox" name="terms_accepted" required value="true"><span>He leído y acepto las <a href="/terminos" target="_blank" rel="noopener">condiciones de registro y catálogo</a> y he leído el <a href="/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>.</span></label><p class="small muted">Puedes preparar tus productos después de verificar tu celular. No autorizas publicidad al registrarte.</p></div>`;}
export async function legalView(path){
 const key=path==='/terminos'?'terms':path==='/privacidad'?'privacy':null;if(!key)return null;
 const info=await api('/legal'),doc=legalDocuments[key];
 const operator=info.operator;
 return {html:`<section class="container page"><article class="prose legal-document"><p class="eyebrow">Vendo · versión ${LEGAL_VERSION}</p><h1>${esc(doc.title)}</h1>${!info.approved?notice('Documento de la etapa de catálogo. La identificación del titular y la revisión final para operar comercialmente están pendientes. Las compras continúan cerradas.','warning'):''}<dl class="data-list"><div><dt>Titular del servicio</dt><dd>${esc(operator.name||'Pendiente de identificar')}</dd></div><div><dt>RUC</dt><dd>${esc(operator.taxId||'Pendiente de completar')}</dd></div><div><dt>Domicilio comercial</dt><dd>${esc(operator.address||'Pendiente de completar')}</dd></div><div><dt>Contacto</dt><dd>${operator.email?`<a href="mailto:${esc(operator.email)}">${esc(operator.email)}</a>`:'Consulta el canal publicado en Contacto'}</dd></div></dl>${doc.sections.map(([title,body])=>`<section><h2>${esc(title)}</h2><p>${esc(body)}</p></section>`).join('')}<p><a class="link-under" href="/contacto">Contactar con Vendo</a></p></article></section>`};
}
