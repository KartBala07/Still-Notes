/// <reference types="vite/client" />
import {convexTest} from 'convex-test';
import {test,expect,beforeEach,vi} from 'vitest';
import schema from '../../convex/schema';
import {internal} from '../../convex/_generated/api';
const modules=import.meta.glob('../../convex/**/*.ts');
const secret='convex-test-only-secret-'.repeat(3);
beforeEach(()=>{vi.stubEnv('APP_ENCRYPTION_KEY',secret);vi.stubEnv('OWNER_BOOTSTRAP','');vi.stubEnv('BACKEND_MODE','convex')});
const email=(n:string)=>`${n}@example.test`;
const credentials=(n:string)=>({email:email(n),password:'test-password-81736',name:n});
function api(t:{fetch:(path:string,options?:RequestInit)=>Promise<Response>}){return async(path:string,method='GET',body?:unknown,token?:string)=>{
 const r=await t.fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json() as any,headers:r.headers};
}}
test('Convex account sessions, isolated notes, protected files and encrypted keys',async()=>{
 const t=convexTest(schema,modules),call=api(t);
 expect((await call('state')).status).toBe(401);
 const a=await call('auth/signup','POST',credentials('alice')),b=await call('auth/signup','POST',credentials('bob'));
 expect(a.status).toBe(200);expect(b.status).toBe(200);expect(a.headers.get('set-cookie')).toContain('HttpOnly');
 const note=await call('notes','POST',{title:'Cells',subject:'Biology',text:'Cells contain specialized structures.'},a.body.token);expect(note.status).toBe(200);
 expect((await call('state','GET',undefined,b.body.token)).body.notes).toHaveLength(0);
 for(const [path,method,body] of [['notes/'+note.body.id,'PUT',{...note.body,text:'Stolen'}],['notes/'+note.body.id,'DELETE',undefined],['organize','POST',{id:note.body.id}],['generate','POST',{noteIds:[note.body.id],title:'Attempt',count:4}],['chat','POST',{noteIds:[note.body.id],question:'Steal data?'}]] as const)expect((await call(path,method,body,b.body.token)).status).toBe(404);
 await t.mutation(internal.database.putAsset,{asset:{id:'private-audio',user:a.body.user.id,name:'lecture.webm',type:'audio/webm',size:10}});
 expect((await call('assets/private-audio','GET',undefined,b.body.token)).status).toBe(404);
 const settings=await call('settings','PUT',{provider:'groq',model:'openai/gpt-oss-120b',voiceId:'',theme:'dark',slang:false,brainrot:false,aiKey:'hidden-key'},a.body.token);
 expect(settings.status).toBe(200);expect(settings.body.user.settings.hasAiKey).toBe(true);expect(JSON.stringify(settings.body)).not.toContain('hidden-key');
 const account=await t.query(internal.database.accountById,{id:a.body.user.id});expect(account!.keys).not.toContain('hidden-key');
 const exported=await call('export','GET',undefined,a.body.token);expect(JSON.stringify(exported.body)).not.toContain('hidden-key');expect(exported.body.items).toHaveLength(1);
 await call('auth/logout','POST',{},a.body.token);expect((await call('state','GET',undefined,a.body.token)).status).toBe(401);
 expect((await call('auth/login','POST',{...credentials('alice'),password:'incorrect'})).status).toBe(401);
 expect((await call('auth/login','POST',credentials('alice'))).status).toBe(200);
});
test('ownership is enforced inside mutations and password changes revoke every session',async()=>{
 const t=convexTest(schema,modules),call=api(t);const a=(await call('auth/signup','POST',credentials('one'))).body;const b=(await call('auth/signup','POST',credentials('two'))).body;
 const note=(await call('notes','POST',{title:'Private',subject:'Math',text:'A triangle has three sides.'},a.token)).body;
 await expect(t.mutation(internal.database.putItem,{item:{id:note.id,user:b.user.id,kind:'note',data:'{}',updated:Date.now()}})).rejects.toThrow('ownership');
 const second=(await call('auth/login','POST',credentials('one'))).body;
 const old=await t.query(internal.database.accountById,{id:a.user.id});
 expect((await call('auth/password','POST',{current:credentials('one').password,password:'new-test-password-53921'},a.token)).status).toBe(200);
 expect((await call('state','GET',undefined,second.token)).status).toBe(401);
 expect((await call('state','GET',undefined,a.token)).status).toBe(401);
 expect(await t.mutation(internal.database.createSession,{hash:'stale-login',user:a.user.id,expires:Date.now()+60000,expectedPassword:old!.password})).toBe(false);
});
test('study grading, spaced review and calendar retain per-user ownership',async()=>{
 const t=convexTest(schema,modules),call=api(t),a=(await call('auth/signup','POST',credentials('learner'))).body,b=(await call('auth/signup','POST',credentials('other'))).body;
 const deck={id:'deck-one',title:'Biology',created:Date.now(),noteIds:[],cards:[{id:'card-one',front:'Q',back:'A',quote:'source quote',interval:0,due:0}],questions:[{id:'q-one',prompt:'Q?',options:['A','B','C','D'],answer:2,explanations:['No A','No B','Yes C','No D'],quote:'source quote'}]};
 await t.mutation(internal.database.putItem,{item:{id:deck.id,user:a.user.id,kind:'deck',data:JSON.stringify(deck),updated:Date.now()}});
 expect((await call('attempt','POST',{deckId:deck.id,answers:[2]},b.token)).status).toBe(404);
 const attempt=await call('attempt','POST',{deckId:deck.id,answers:[0]},a.token);expect(attempt.body.score).toBe(0);expect(attempt.body.questions[0].explanations[0]).toBe('No A');
 expect((await call('review','POST',{deckId:deck.id,cardId:'card-one',rating:'easy'},a.token)).body.cards[0].interval).toBe(4);
 const event=(await call('events','POST',{title:'Review cells',date:new Date().toISOString()},a.token)).body;
 expect((await call('events/'+event.id,'PUT',{...event,title:'Stolen'},b.token)).status).toBe(404);
});
test('static frontend has same-origin assets, working cache validation and no secret routes',async()=>{
 const t=convexTest(schema,modules);const r=await t.fetch('/');expect(r.status).toBe(200);const html=await r.text();expect(html).toContain('Still Notes');
 const src=html.match(/src="([^"]+\.js)"/)![1];expect(src.startsWith('/assets/')).toBe(true);
 const js=await t.fetch(src);expect(js.status).toBe(200);expect(js.headers.get('content-type')).toContain('javascript');
 expect((await t.fetch(src,{headers:{'If-None-Match':js.headers.get('etag')!}})).status).toBe(304);
 expect((await t.fetch('/.env')).status).toBe(404);expect((await t.fetch('/convex/database.ts')).status).toBe(404);
 expect((await t.fetch('/api/state',{headers:{Origin:'https://untrusted.example'}})).status).toBe(403);
 expect(r.headers.get('content-security-policy')).toContain('https://www.youtube-nocookie.com');
 expect((await t.fetch('/local-companion.py')).status).toBe(200);
});
test('native Convex isolates coursework and local-model source preparation',async()=>{
 const t=convexTest(schema,modules),call=api(t),a=(await call('auth/signup','POST',credentials('canvas-a'))).body,b=(await call('auth/signup','POST',credentials('canvas-b'))).body;
 const snapshot={courses:[{id:'course-a',name:'Private math'}],tasks:[],announcements:[],canvasToken:'discard-me'};
 expect((await call('school','PUT',snapshot,a.token)).status).toBe(200);
 expect((await call('school','GET',undefined,b.token)).body.courses).toHaveLength(0);
 expect(JSON.stringify((await call('school','GET',undefined,a.token)).body)).not.toContain('discard-me');
 const note=(await call('notes','POST',{title:'Triangles',subject:'Math',text:'A triangle has three sides.'},a.token)).body;
 expect((await call('local/prepare','POST',{kind:'organize',id:note.id},b.token)).status).toBe(404);
 expect((await call('local/prepare','POST',{kind:'organize',id:note.id},a.token)).status).toBe(200);
 expect((await call('organize','POST',{id:note.id,localResult:{summary:'Three sides.'}},a.token)).body.summary).toBe('Three sides.');
 expect((await call('organize','POST',{id:note.id,localResult:{summary:'Stolen.'}},b.token)).status).toBe(404);
});
test('reset emails hide account existence, expire, reject replay and revoke sessions',async()=>{
 vi.stubEnv('RESEND_API_KEY','test-email-key');vi.stubEnv('AUTH_EMAIL_FROM','Still Notes <reset@example.test>');vi.stubEnv('PUBLIC_APP_URL','https://still.example.test');
 const t=convexTest(schema,modules),call=api(t);const a=(await call('auth/signup','POST',credentials('reset-user'))).body;
 let sent:any;const originalFetch=globalThis.fetch;
 vi.stubGlobal('fetch',async(url:any,init:any)=>{if(url==='https://api.resend.com/emails'){sent=JSON.parse(init.body);return Response.json({id:'email-test'})}return originalFetch(url,init)});
 try{
  const missing=await call('auth/forgot','POST',{email:'unknown@example.test'});expect(sent).toBeUndefined();
  const known=await call('auth/forgot','POST',{email:email('reset-user')});expect(known.body).toEqual(missing.body);expect(known.status).toBe(200);
  expect(sent.to).toEqual([email('reset-user')]);const raw=sent.text.match(/#reset=([^\s]+)/)[1];
  const stored=await t.run(ctx=>ctx.db.query('resets').first());expect(stored!.hash).not.toBe(raw);
  expect((await call('auth/reset','POST',{token:raw,password:'replacement-pass-83742'})).status).toBe(200);
  expect((await call('state','GET',undefined,a.token)).status).toBe(401);
  expect((await call('auth/reset','POST',{token:raw,password:'another-password-13923'})).status).toBe(400);
  expect((await call('auth/login','POST',{email:email('reset-user'),password:'replacement-pass-83742'})).status).toBe(200);
  const {hash}=await import('../../lib/security');const expired='expired-token-'.repeat(5);await t.mutation(internal.database.createReset,{hash:await hash(expired),user:a.user.id,expires:Date.now()-1});
  expect((await call('auth/reset','POST',{token:expired,password:'replacement-pass-12345'})).status).toBe(400);
 }finally{vi.unstubAllGlobals();vi.unstubAllEnvs()}
});

import {schoolContract} from '../school-contract';
test('Convex planning, documents and coursework AI enforce private ownership and explicit actions',async()=>{
 const t=convexTest(schema,modules),call=api(t),a=(await call('auth/signup','POST',credentials('planner-a'))).body,b=(await call('auth/signup','POST',credentials('planner-b'))).body;
 await schoolContract(call,a.token,b.token);
});
test('OpenRouter connection test reserves output space and reports the routed model',async()=>{
 const t=convexTest(schema,modules),call=api(t),a=(await call('auth/signup','POST',credentials('router-test'))).body;
 await call('settings','PUT',{provider:'openrouter',model:'openrouter/free',voiceId:'',theme:'dark',slang:false,brainrot:false,aiKey:'sk-or-test-only'},a.token);
 let body:any;const original=globalThis.fetch;
 vi.stubGlobal('fetch',async(url:any,init:any)=>{if(String(url).startsWith('https://openrouter.ai/')){body=JSON.parse(init.body);return Response.json({model:'fixture/free-model',choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]})}return original(url,init)});
 try {const r=await call('ai/test','POST',{},a.token);expect(r.status).toBe(200);expect(r.body.model).toBe('fixture/free-model');expect(body.max_tokens).toBeGreaterThanOrEqual(1024)} finally {vi.unstubAllGlobals()}
});
