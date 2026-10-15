import assert from 'node:assert/strict';
function fixture(transformed){
 const events=[];
 const target=name=>new Proxy({}, {get(object,key){events.push(`get:${name}.${String(key)}`);return target(`${name}.${String(key)}`);},set(object,key,value){events.push(`set:${name}.${String(key)}:${value}`);return true;}});
 const outer=()=>{events.push('outer');return target('a');};
 const middle=()=>{events.push('middle');return target('b');};
 const inner=()=>{events.push('inner');return target('c');};
 const rhs=()=>{events.push('rhs');return 3;};
 const result=transformed
  ? outer().value=(()=> (middle().value=(()=> (inner().value=rhs()))()))()
  : outer().value=middle().value=inner().value=rhs();
 return {events,result};
}
assert.deepEqual(fixture(true),fixture(false));
const legacy=s=>s.replace(/[\x00-\x1f"*/:<>?\\|]/g,'');
const adapted=s=>Array.from(s).filter(character=>character.charCodeAt(0)>31&&! '"*/:<>?\\|'.includes(character)).join('');
for(const value of [Array.from({length:256},(_,i)=>String.fromCharCode(i)).join(''),'a😀b/𐐀\\x\ud800']){assert.equal(adapted(value),legacy(value));}
assert.equal(999999999999999999999,1e21);
console.log('Self-authored chain-reference order, filename filter and rounded-number cases passed.');
function methodFixture(transformed){
 const events=[];const object={get hasOwnProperty(){events.push('method');return function(value){events.push(this===object?'receiver':'wrong');return value==='custom';};}};
 const receiver=()=>{events.push('object');return object;};const argument=()=>{events.push('argument');return 'custom';};
 const result=transformed?((pvceReceiver)=>{const pvceMethod=pvceReceiver.hasOwnProperty;return Reflect.apply(pvceMethod,pvceReceiver,[argument()]);})(receiver()):receiver().hasOwnProperty(argument());
 return {events,result};
}
assert.deepEqual(methodFixture(true),methodFixture(false));
console.log('Custom method/getter dispatch and argument ordering preserved.');
