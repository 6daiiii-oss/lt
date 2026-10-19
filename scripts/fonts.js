import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/fonts',{recursive:true});
for(const family of ['inter','manrope']) {
  await copyFile(`node_modules/@fontsource-variable/${family}/files/${family}-latin-wght-normal.woff2`,`public/fonts/${family}-latin.woff2`);
  await copyFile(`node_modules/@fontsource-variable/${family}/LICENSE`,`public/fonts/${family}-LICENSE.txt`);
}
console.log('Fuentes locales y licencias preparadas.');
