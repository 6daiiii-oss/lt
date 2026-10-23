import { Router } from 'express';
import { createHash } from 'node:crypto';
import { LEGAL_VERSION,legalDocuments } from '../public/modules/legal-content.js';
import { authenticated } from './auth.js';
import { query } from './db.js';
export const legalFingerprint=Object.fromEntries(Object.entries(legalDocuments).map(([key,document])=>[key,createHash('sha256').update(JSON.stringify(document)).digest('hex')]));
export const privacyRouter=Router();
privacyRouter.get('/legal',(req,res)=>{
 const operator={name:process.env.LEGAL_OPERATOR_NAME||null,taxId:process.env.LEGAL_OPERATOR_RUC||null,address:process.env.LEGAL_OPERATOR_ADDRESS||null,email:process.env.BUSINESS_CONTACT_EMAIL||null};
 res.json({version:LEGAL_VERSION,operator,approved:process.env.LEGAL_APPROVED==='true'&&Object.values(operator).every(Boolean)});
});
privacyRouter.get('/account/data-export',authenticated,async(req,res)=>{
 const user=(await query('SELECT id,email,name,phone,verified_at,phone_verified_at,created_at FROM users WHERE id=$1',[req.user.id])).rows[0];
 const memberships=(await query('SELECT organization_id,role FROM memberships WHERE user_id=$1',[req.user.id])).rows;
 const consents=(await query("SELECT action,details,created_at FROM audit_logs WHERE actor_id=$1 AND action='legal.accepted' ORDER BY created_at",[req.user.id])).rows;
 res.set('Cache-Control','private, no-store').json({exported_at:new Date().toISOString(),user,memberships,consents});
});
