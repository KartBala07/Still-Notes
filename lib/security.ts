const encoder=new TextEncoder();
export const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const hash=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
export const token=()=>crypto.randomUUID()+crypto.randomUUID();
export async function passwordHash(password:string,salt=crypto.randomUUID()){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return salt+':'+hex(bits);
}
export async function passwordMatches(password:string,stored:string){
 const result=await passwordHash(password,stored.split(':')[0]);if(result.length!==stored.length)return false;
 let difference=0;for(let i=0;i<result.length;i++)difference|=result.charCodeAt(i)^stored.charCodeAt(i);return difference===0;
}
async function aes(secret:string){
 if(!secret||secret.length<32)throw new Error('Cloud encryption is not configured.');
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(value:unknown,secret:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(secret),encoder.encode(JSON.stringify(value)));
 return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(cipher)));
}
export async function unseal(value:string,secret:string){
 if(!value)return {} as Record<string,string>;
 const [iv,body]=value.split('.').map(x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0)));
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await aes(secret),body))) as Record<string,string>;
}
