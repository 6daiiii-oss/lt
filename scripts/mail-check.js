import nodemailer from 'nodemailer';
if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD||!process.env.MAIL_FROM) {
  console.error('Configura SMTP_HOST, SMTP_USER, SMTP_PASSWORD y MAIL_FROM en .env. Consulta docs/OPERACION_PERU.md.');
  process.exitCode=1;
}else {
  const port=Number(process.env.SMTP_PORT||587);
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:10000});
  try {await transport.verify();console.log('SMTP autenticado. No se envió ningún mensaje. Prueba después entrega de verificación y recuperación con el worker.');}
  catch {console.error('No se pudo autenticar SMTP. Revisa configuración, contraseña de aplicación y permisos del remitente.');process.exitCode=1;}
  finally {transport.close();}
}
