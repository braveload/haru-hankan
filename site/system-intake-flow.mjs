import {hash,UUID,REFERENCE} from './system-intake-contract.mjs';
export const RECEIPT_KEY='haru-system-inquiry-v1';
export function createFlow(storage,send) {
  let busy=false;
  function read(){try {const data=JSON.parse(storage.getItem(RECEIPT_KEY));return data&&UUID.test(data.key)&&/^[a-f0-9]{64}$/.test(data.hash)&&['pending','unknown','confirmed'].includes(data.state)&&(data.state!=='confirmed'||REFERENCE.test(data.reference))?data:null;}catch(_){return null;}}
  function write(value){try{const text=JSON.stringify(value);storage.setItem(RECEIPT_KEY,text);return storage.getItem(RECEIPT_KEY)===text;}catch(_){return false;}}
  return {
    read,
    reset(){storage.removeItem(RECEIPT_KEY);},
    async submit(value,metadata){
      if(busy)return {state:'busy'};
      const digest=await hash(value);
      if(busy)return {state:'busy'};
      const previous=read();
      if(previous?.state==='confirmed'&&REFERENCE.test(previous.reference))return {state:'confirmed',reference:previous.reference};
      if(previous&&previous.hash!==digest)return {state:'changed'};
      const receipt=previous||{key:crypto.randomUUID(),hash:digest};
      receipt.state='pending';if(!write(receipt))return {state:'storage-error'};
      busy=true;
      try{
        const response=await send({...value,...metadata},receipt.key);
        const result=await response.json();
        if(result.stored===true&&REFERENCE.test(result.reference)&&((response.status===201&&result.replayed===false)||(response.status===200&&result.replayed===true))){
          receipt.state='confirmed';receipt.reference=result.reference;write(receipt);
          return {state:'confirmed',reference:result.reference};
        }
        if([400,403,409,413,415,422,429].includes(response.status)){
          receipt.state=previous?'unknown':'pending';
          if(previous)write(receipt);else storage.removeItem(RECEIPT_KEY);
          return {state:response.status===409?'conflict':'invalid',errors:result.errors||{}};
        }
      }catch(_){/* Never claim success or rotate the key after an ambiguous response. */}
      finally{busy=false;}
      receipt.state='unknown';write(receipt);return {state:'unknown'};
    }
  };
}
