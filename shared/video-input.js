'use strict';
/* One native picker in the app, then transfer that same file to the camera page
   on this origin. This temporary copy is never sent to a server. */
const VideoInput = {
  opening:null,
  db() {
    if(this.opening)return this.opening;
    this.opening=new Promise(resolve=>{
      if(typeof indexedDB==='undefined')return resolve(null);
      let req;try{req=indexedDB.open('aitrainer-video-input-v1',1);}catch(e){return resolve(null);}
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('files'))req.result.createObjectStore('files',{keyPath:'id'});};
      req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
      req.onerror=req.onblocked=()=>resolve(null);
    });return this.opening;
  },
  async put(blob,account) {
    const db=await this.db();if(!db)throw Error('Video transfer unavailable');
    const record={id:'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,9),account,blob,at:Date.now()};
    await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(record);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
    return record.id;
  },
  async read(id,account) {
    const db=await this.db();if(!db)return null;
    const record=await new Promise((resolve,reject)=>{const req=db.transaction('files','readonly').objectStore('files').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    return record && record.account===account ? record.blob : null;
  },
  async remove(id,account) {
    const db=await this.db();if(!db)return;
    await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),store=tx.objectStore('files'),req=store.get(id);req.onsuccess=()=>{if(req.result?.account===account)store.delete(id);};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
  }
};
if(typeof module!=='undefined' && module.exports)module.exports=VideoInput;
