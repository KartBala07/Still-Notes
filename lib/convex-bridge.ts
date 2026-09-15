const LEGACY_ORIGIN='https://still-notes.swathibala988.chatgpt.site';

/** Transitional routing: preserves existing accounts and encrypted keys until data is migrated. */
export async function bridgeRequest(request:Request):Promise<Response>{
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(origin&&origin!==url.origin)return Response.json({error:'This origin is not allowed.'},{status:403,headers:security});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:security});
  // Fixed destination and explicit header allowlist prevent SSRF and forwarded identity spoofing.
  const headers=new Headers({Origin:LEGACY_ORIGIN});
  for(const name of ['Content-Type','Authorization','Cookie']){const value=request.headers.get(name);if(value)headers.set(name,value)}
  try{
    const upstream=await fetch(LEGACY_ORIGIN+url.pathname+url.search,{
      method:request.method,headers,
      body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),
      redirect:'error',signal:AbortSignal.timeout(120000),
    });
    const output=new Headers(security);
    for(const name of ['Content-Type','Set-Cookie']){const value=upstream.headers.get(name);if(value)output.set(name,value)}
    return new Response(upstream.body,{status:upstream.status,headers:output});
  }catch{return Response.json({error:'The account service is temporarily unavailable. Please try again.'},{status:502,headers:security})}
}
