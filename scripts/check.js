import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await walk(p));else if(p.endsWith('.js'))result.push(p);}return result;}
for(const file of (await Promise.all(['server','scripts','public/modules','tests'].map(walk))).flat()) {
  const checked=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(checked.status)process.exit(checked.status||1);
}
console.log('Sintaxis de todos los módulos validada.');
