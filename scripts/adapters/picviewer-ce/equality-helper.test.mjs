import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// Execute only our own standalone helper; never load the userscript or libraries.
const helper=fs.readFileSync(new URL('./equality-helper.js',import.meta.url),'utf8');
const equal=vm.runInNewContext(helper+'\npvceAbstractEqual');
const oracle=(a,b)=>a==b;
const values=[undefined,null,false,true,0,-0,1,-1,NaN,Infinity,-Infinity,'','0','1','x','  ','9007199254740993',0n,1n,9007199254740993n,Symbol('x'),{},[],[0],new Number(1),new String('1'),new Date(0),()=>{}];
let checked=0;for(const a of values){for(const b of values){assert.equal(equal(a,b),oracle(a,b));checked++;}}
for(const factory of [
 log=>({valueOf(){log.push('valueOf');return 1;},toString(){log.push('toString');return 'x';}}),
 log=>({valueOf(){log.push('valueOf');return {};},toString(){log.push('toString');return '1';}}),
 log=>({[Symbol.toPrimitive](hint){log.push(hint);return 1n;}}),
 log=>({get [Symbol.toPrimitive](){log.push('get');return null;},valueOf(){log.push('valueOf');return 1;}}),
 log=>({[Symbol.toPrimitive](){log.push('throw');throw new RangeError('coercion');}}),
 log=>({[Symbol.toPrimitive]:1}),
 log=>({valueOf(){log.push('valueOf');return {};},toString(){log.push('toString');return {};}})
]){
 for(const primitive of [0,1,'1',1n,Symbol('x'),null,undefined]){
  for(const reverse of [false,true]){
   const logs=[[],[]];const outcomes=[];
   for(const [i,fn] of [equal,oracle].entries()){
    const object=factory(logs[i]);try{outcomes.push({value:reverse?fn(primitive,object):fn(object,primitive)});}catch(e){outcomes.push({error:e.name});}
   }
   assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(logs[0],logs[1]);checked++;
  }
 }
}
console.log(`${checked} equality oracle cases passed; document.all requires Firefox verification.`);
const datePrototype=Object.create(Date.prototype);
Object.defineProperty(datePrototype,Symbol.toPrimitive,{value:undefined});
const date=Object.setPrototypeOf(new Date(0),datePrototype);
assert.equal(equal(date,0),oracle(date,0));assert.equal(equal(date,'0'),oracle(date,'0'));
console.log('Date without @@toPrimitive follows ordinary default hint (number).');
