import { query } from './db.js';
import { config } from './config.js';
import { z } from 'zod';
export const settingsSchema=z.object({reservationMinutes:z.number().int().min(2).max(120).optional(),stockMaxAgeHours:z.number().int().min(1).max(720).optional(),newDays:z.number().int().min(1).max(365).optional(),importMaxRows:z.number().int().min(1).max(5000).optional(),coverageRegions:z.array(z.string().trim().min(1).max(80).transform(s=>s.toLocaleLowerCase('es-PE'))).max(30).optional()}).strict();
export async function loadSettings() {
  for(const row of (await query('SELECT key,value FROM platform_settings')).rows) {
    const parsed=settingsSchema.safeParse({[row.key]:row.value});if(parsed.success) Object.assign(config,parsed.data);
  }
}
