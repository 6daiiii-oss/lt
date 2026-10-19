import { resolve } from 'node:path';
export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  origin: process.env.APP_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  webhookSecret: process.env.SANDBOX_WEBHOOK_SECRET,
  paymentProvider: process.env.PAYMENT_PROVIDER || 'sandbox',
  reservationMinutes: Number(process.env.RESERVATION_MINUTES || 15),
  stockMaxAgeHours: Number(process.env.STOCK_MAX_AGE_HOURS || 48),
  newDays: Number(process.env.NEW_PRODUCTS_DAYS || 30),
  importMaxRows: Number(process.env.IMPORT_MAX_ROWS || 1000),
  importMaxBytes: Number(process.env.IMPORT_MAX_BYTES || 1048576),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5242880),
  sandboxBps: Number(process.env.SANDBOX_COMMISSION_BPS || 0),
  feedOrigins: (process.env.FEED_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  coverageRegions: [],
  storage: resolve(process.env.STORAGE_DIR || '.runtime/uploads'),
};
export function validateConfig() {
  for (const key of ['databaseUrl', 'sessionSecret', 'webhookSecret', 'encryptionKey']) {
    if (!config[key] || (key !== 'databaseUrl' && config[key].length < 32)) throw new Error(`Configuración incompleta: ${key}. Ejecuta npm run setup:local.`);
  }
  if (!/^[a-f0-9]{64}$/.test(config.encryptionKey)) throw new Error('ENCRYPTION_KEY debe tener 32 bytes hexadecimales.');
  for (const key of ['port', 'reservationMinutes', 'stockMaxAgeHours', 'newDays', 'importMaxRows', 'importMaxBytes', 'uploadMaxBytes']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Valor inválido: ${key}`);
  }
  if (!Number.isInteger(config.sandboxBps) || config.sandboxBps < 0 || config.sandboxBps > 10000) throw new Error('Comisión sandbox inválida.');
  if(config.paymentProvider!=='sandbox')throw new Error('Proveedor real no integrado. PAYMENT_PROVIDER debe ser sandbox.');
  if (config.production) {
    if (!config.origin.startsWith('https://') || !process.env.SMTP_HOST || !process.env.MAIL_FROM || !process.env.BUSINESS_CONTACT_EMAIL) throw new Error('Producción requiere HTTPS, SMTP y contacto operativo.');
    if (process.env.POLICIES_APPROVED !== 'true') throw new Error('Producción requiere políticas revisadas.');
    if (config.paymentProvider !== 'sandbox') throw new Error('No hay adaptador de pagos real habilitado; usar sandbox con checkout real deshabilitado.');
  }
}
