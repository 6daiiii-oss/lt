import { resolve } from 'node:path';
export const config = {
  demo: process.env.LOTE_DEMO_MODE === 'true',
  cookieName: process.env.LOTE_DEMO_MODE === 'true' ? 'lote_demo_session' : 'lote_session',
  production: process.env.NODE_ENV === 'production',
  // Opt-in is only for isolated sandbox exercises; public purchases remain closed.
  purchasesEnabled: process.env.NODE_ENV !== 'production' && process.env.SANDBOX_PURCHASES_ENABLED === 'true',
  port: Number(process.env.PORT || 3000),
  origin: process.env.APP_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  webhookSecret: process.env.SANDBOX_WEBHOOK_SECRET,
  paymentProvider: process.env.PAYMENT_PROVIDER || 'sandbox',
  smsProvider: process.env.SMS_PROVIDER || 'sandbox',
  reservationMinutes: Number(process.env.RESERVATION_MINUTES || 15),
  stockMaxAgeHours: Number(process.env.STOCK_MAX_AGE_HOURS || 48),
  newDays: Number(process.env.NEW_PRODUCTS_DAYS || 30),
  importMaxRows: Number(process.env.IMPORT_MAX_ROWS || 1000),
  importMaxBytes: Number(process.env.IMPORT_MAX_BYTES || 1048576),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5242880),
  feedOrigins: (process.env.FEED_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  coverageRegions: [],
  storage: resolve(process.env.STORAGE_DIR || '.runtime/uploads'),
};
export function demoEnabled() {
  try {return config.demo&&!config.production&&/^lote_demo_[a-f0-9]+$/.test(new URL(config.databaseUrl).pathname.slice(1))&&['127.0.0.1','localhost'].includes(new URL(config.origin).hostname);}catch{return false;}
}
export function validateConfig() {
  if(config.demo&&!demoEnabled())throw new Error('La demo requiere una base aislada y un origen local.');
  for (const key of ['databaseUrl', 'sessionSecret', 'webhookSecret', 'encryptionKey']) {
    if (!config[key] || (key !== 'databaseUrl' && config[key].length < 32)) throw new Error(`Configuración incompleta: ${key}. Ejecuta npm run setup:local.`);
  }
  if (!/^[a-f0-9]{64}$/.test(config.encryptionKey)) throw new Error('ENCRYPTION_KEY debe tener 32 bytes hexadecimales.');
  for (const key of ['port', 'reservationMinutes', 'stockMaxAgeHours', 'newDays', 'importMaxRows', 'importMaxBytes', 'uploadMaxBytes']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Valor inválido: ${key}`);
  }
  if(config.paymentProvider!=='sandbox')throw new Error('Proveedor real no integrado. PAYMENT_PROVIDER debe ser sandbox.');
  if(!['sandbox','twilio'].includes(config.smsProvider)) throw new Error('SMS_PROVIDER inválido.');
  if(config.smsProvider==='twilio'&&(!/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')||!/^VA[a-f0-9]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID||'')||!process.env.TWILIO_AUTH_TOKEN)) throw new Error('Faltan credenciales de Twilio Verify.');
  if (config.production) {
    if(config.smsProvider!=='twilio') throw new Error('Producción requiere SMS real configurado.');
    if (!config.origin.startsWith('https://') || !process.env.BUSINESS_CONTACT_EMAIL) throw new Error('Producción requiere HTTPS y contacto operativo.');
    if(process.env.SMTP_HOST&&!process.env.MAIL_FROM)throw new Error('Configura MAIL_FROM para enviar correos.');
    if (process.env.POLICIES_APPROVED !== 'true') throw new Error('Producción requiere políticas revisadas.');
    if (config.paymentProvider !== 'sandbox') throw new Error('No hay adaptador de pagos real habilitado; usar sandbox con checkout real deshabilitado.');
  }
}
