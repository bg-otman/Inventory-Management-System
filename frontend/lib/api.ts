import {DEMO, AppState} from "./types";
import {readDemo,demoCommand} from "./demo";
const pending=new Map<string,string>();
export async function loadState():Promise<AppState>{
 if(DEMO)return readDemo();
 const r=await fetch("/api/v1/state",{credentials:"same-origin",cache:"no-store"});
 if(r.status===401)throw new Error("AUTH");
 if(!r.ok)throw new Error("Could not load your workspace.");
 return r.json();
}
const csrf=()=>decodeURIComponent(document.cookie.split("; ").find(v=>v.startsWith("mizan_csrf="))?.split("=")[1]||"");
export async function command(path:string,body:unknown={},method="POST"){
 if(!navigator.onLine)throw new Error("OFFLINE");
 if(DEMO)return demoCommand(path,body,method);
 const signature=method+path+JSON.stringify(body),key=pending.get(signature)||crypto.randomUUID();pending.set(signature,key);
 let r:Response;
 try{r=await fetch("/api/v1"+path,{method,credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf(),"Idempotency-Key":key},body:JSON.stringify(body)});}catch{throw new Error("Connection interrupted. Retry the same action safely.");}
 const data=await r.json().catch(()=>({detail:"Request failed."}));
 if(r.ok||r.status<500)pending.delete(signature);
 if(!r.ok)throw new Error(typeof data.detail==="string"?data.detail:"Check the entered values.");
 return data;
}
export async function login(username:string,password:string){const r=await fetch("/api/v1/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password}),credentials:"same-origin"});if(!r.ok)throw new Error("Incorrect username or password.");}
export async function logout(){if(!DEMO)await command("/auth/logout");}
export async function getBackups(){if(DEMO)return {enabled:false,backups:[],jobs:[]};const r=await fetch("/api/v1/backups",{cache:"no-store"});if(!r.ok)throw new Error("Could not load backups.");return r.json();}
