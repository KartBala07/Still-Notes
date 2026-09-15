import {assets} from './convex-web-assets.js';
export function serveStatic(request:Request):Response {
 const path=new URL(request.url).pathname;
 const asset=assets[path==='/'?'/index.html':path];
 if(!asset)return new Response('Not found',{status:404});
 const headers:Record<string,string>={
  'Content-Type':asset.type,'Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache',
  'ETag':asset.etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
 };
 if(request.headers.get('If-None-Match')===asset.etag)return new Response(null,{status:304,headers});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
 return new Response(bytes,{headers});
}
