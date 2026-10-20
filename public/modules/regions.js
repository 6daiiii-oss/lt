export const peruRegions=['Amazonas','Áncash','Apurímac','Arequipa','Ayacucho','Cajamarca','Callao','Cusco','Huancavelica','Huánuco','Ica','Junín','La Libertad','Lambayeque','Lima','Loreto','Madre de Dios','Moquegua','Pasco','Piura','Puno','San Martín','Tacna','Tumbes','Ucayali'];
export const normalizeRegion=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es-PE').replace(/\s+/g,' ');
export const regionOptions=[['','Selecciona una región'],...peruRegions.map(name=>[normalizeRegion(name),name])];
export const regionName=value=>peruRegions.find(name=>normalizeRegion(name)===normalizeRegion(value))||value;
