import nodemailer from 'nodemailer';
import { tx } from './db.js';
import { config } from './config.js';
export async function deliverMail() {
  await tx(async db=>{
    const mail=(await db.query(`SELECT m.*,u.email FROM mail_outbox m JOIN users u ON u.id=m.user_id WHERE m.state IN ('pending','failed') AND m.attempts<5 AND m.next_attempt_at<=now() ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 1`)).rows[0];
    if(!mail) return;
    if(!process.env.SMTP_HOST) {if(config.production)throw new Error('smtp_unconfigured');await db.query(`UPDATE mail_outbox SET state='sandbox' WHERE id=$1`,[mail.id]);return;}
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,requireTLS:true,
      auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:10000});
    try {await transport.sendMail({from:process.env.MAIL_FROM,to:mail.email,subject:mail.subject,text:mail.body});await db.query(`UPDATE mail_outbox SET state='sent',attempts=attempts+1,last_error=NULL WHERE id=$1`,[mail.id]);}
    catch {await db.query(`UPDATE mail_outbox SET state='failed',attempts=attempts+1,last_error='Entrega SMTP fallida',next_attempt_at=now()+power(2,attempts+1)*interval '1 minute' WHERE id=$1`,[mail.id]);}
    finally{transport.close();}
  });
}
