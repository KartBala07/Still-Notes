import {test,expect,vi,afterEach} from 'vitest';
import {bridgeRequest} from '../../lib/convex-bridge';
afterEach(()=>vi.unstubAllGlobals());
test('transition forwards credentials only to the fixed existing backend and preserves the session cookie',async()=>{
 const fetcher=vi.fn(async()=>new Response('{"user":{"name":"Student"}}',{headers:{'Content-Type':'application/json','Set-Cookie':'still_session=test; HttpOnly; Secure; SameSite=Lax; Path=/api'}}));vi.stubGlobal('fetch',fetcher);
 const result=await bridgeRequest(new Request('https://deployment.convex.site/api/auth/login',{method:'POST',headers:{Origin:'https://deployment.convex.site','Content-Type':'application/json','CF-Connecting-IP':'spoofed','Cookie':'still_session=old'},body:'{"email":"test@example.test","password":"test-only"}'}));
 expect(result.status).toBe(200);expect(result.headers.get('set-cookie')).toContain('HttpOnly');expect(result.headers.get('cache-control')).toBe('no-store');
 const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://still-notes.swathibala988.chatgpt.site/api/auth/login');const headers=new Headers(init.headers);expect(headers.get('CF-Connecting-IP')).toBeNull();expect(headers.get('Cookie')).toBe('still_session=old');expect(init.redirect).toBe('error');
});
test('transition rejects third-party origins before forwarding private credentials',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const result=await bridgeRequest(new Request('https://deployment.convex.site/api/state',{headers:{Origin:'https://untrusted.example',Authorization:'Bearer test'}}));
 expect(result.status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
