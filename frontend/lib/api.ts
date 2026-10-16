import {DEMO, AppState} from "./types";
import {readDemo,demoCommand} from "./demo";
const pending=new Map<string,string>();
export async function loadState():Promise<AppState>{
 if(DEMO)return readDemo();
 const r=await fetch("/api/v1/state",{credentials:"same-origin",cache:"no-store"});
 if(!r.ok)throw new Error("Could not load your workspace.");
 return r.json();
}
export async function command(path:string,body:unknown={},method="POST"){
 if(!navigator.onLine)throw new Error("OFFLINE");
 if(DEMO)return demoCommand(path,body,method);
 const signature=method+path+JSON.stringify(body),key=pending.get(signature)||crypto.randomUUID();pending.set(signature,key);
 let r:Response;
	try{r=await fetch("/api/v1"+path,{method,headers:{"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)});}catch{throw new Error("Connection interrupted. Retry the same action safely.");}
 const data=await r.json().catch(()=>({detail:"Request failed."}));
 if(r.ok||r.status<500)pending.delete(signature);
 if(!r.ok)throw new Error(typeof data.detail==="string"?data.detail:"Check the entered values.");
 return data;
}
export async function getBackups(){if(DEMO)return {enabled:false,backups:[],jobs:[]};const r=await fetch("/api/v1/backups",{cache:"no-store"});if(!r.ok)throw new Error("Could not load backups.");return r.json();}
