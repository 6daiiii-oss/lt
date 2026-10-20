import { z } from 'zod';
export const phoneNumber=z.string().trim().transform(s=>s.replace(/[\s()-]/g,''))
 .transform(s=>/^9\d{8}$/.test(s)?'+51'+s:s)
 .pipe(z.string().regex(/^\+519\d{8}$/,'Usa un celular peruano con +51 y 9 dígitos.'));
