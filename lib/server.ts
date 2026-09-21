import {env} from 'cloudflare:workers';
import {createHandler} from './backend';
import {d1Store} from './d1-store';
type Env={DB:D1Database;BUCKET:R2Bucket;APP_ENCRYPTION_KEY:string;OWNER_BOOTSTRAP?:string;RESEND_API_KEY?:string;AUTH_EMAIL_FROM?:string;PUBLIC_APP_URL?:string;DEV_EMAIL?:string;DEV_PASSWORD?:string};
export async function handle(request:Request){
 const e=env as unknown as Env;
 return createHandler({store:d1Store(e.DB),email:e.RESEND_API_KEY&&e.AUTH_EMAIL_FROM&&e.PUBLIC_APP_URL?{apiKey:e.RESEND_API_KEY,from:e.AUTH_EMAIL_FROM,appUrl:e.PUBLIC_APP_URL}:undefined,encryptionKey:e.APP_ENCRYPTION_KEY,ownerBootstrap:e.OWNER_BOOTSTRAP,admin:e.DEV_EMAIL&&e.DEV_PASSWORD?{email:e.DEV_EMAIL,password:e.DEV_PASSWORD}:undefined,trustedClientIp:r=>r.headers.get('CF-Connecting-IP'),blobs:{
  put:async(key,blob)=>{await e.BUCKET.put(key,blob.stream(),{httpMetadata:{contentType:blob.type}})},
  get:async key=>{const blob=await e.BUCKET.get(key);return blob?new Blob([await blob.arrayBuffer()],{type:blob.httpMetadata?.contentType}):null},
  delete:async key=>{await e.BUCKET.delete(key)},
 }})(request);
}
