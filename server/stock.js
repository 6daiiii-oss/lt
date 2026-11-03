import {requireThat} from './lib.js';
export function stockAvailable(row,key='') {const bucket=key?(Object.hasOwn(row.pack_stock||{},key)?row.pack_stock[key]:null):row;return bucket?bucket.total-bucket.reserved:0;}
// Call inside a transaction. Locking the inventory row serializes all presentations of a product.
export async function changeStock(db,productId,key,{total=0,reserved=0}={}){
 const row=(await db.query('SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE',[productId])).rows[0];requireThat(row,'Inventario no encontrado.',404);
 const bucket=key?(Object.hasOwn(row.pack_stock||{},key)?row.pack_stock[key]:null):row;requireThat(bucket,'Existencias de la presentación no disponibles.',409);
 const next={total:bucket.total+total,reserved:bucket.reserved+reserved};
 requireThat(Number.isSafeInteger(next.total)&&Number.isSafeInteger(next.reserved)&&next.total>=0&&next.reserved>=0&&next.total>=next.reserved,'Stock insuficiente o reserva incompatible.',409,'stock_conflict');
 if(key)await db.query('UPDATE inventory SET pack_stock=$2,updated_at=now() WHERE product_id=$1',[productId,{...row.pack_stock,[key]:next}]);
 else await db.query('UPDATE inventory SET total=$2,reserved=$3,updated_at=now() WHERE product_id=$1',[productId,next.total,next.reserved]);
}
