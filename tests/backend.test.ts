import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {passwordHash,passwordMatches,seal,unseal} from '../lib/security';
let mf:Miniflare;
let db:D1Database;
let a:{token:string;user:{id:string}},b:{token:string;user:{id:string}};
const call=async(path:string,method='GET',body?:unknown,token?:string)=>{
 const response=await mf.dispatchFetch('https://still.test/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,body:await response.json() as any};
};
before(async()=>{
 const output=await build({stdin:{contents:"import {handle} from './lib/server'; export default {fetch:handle};",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
 mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{APP_ENCRYPTION_KEY:'test-only-secret-'.repeat(4),DEV_EMAIL:'dev@example.test',DEV_PASSWORD:'dev-test-password-9182',OWNER_BOOTSTRAP:JSON.stringify({id:'owner-test',email:'owner@example.test',name:'Owner',password:await passwordHash('owner-test-password'),keys:await seal({ai:'gsk_owner-test-key'},'test-only-secret-'.repeat(4))})}});
 db=await mf.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()){const schema=await readFile('drizzle/'+file,'utf8');for(const statement of schema.split('--> statement-breakpoint').filter(x=>x.trim()))await db.prepare(statement).run();}
 const first=await call('auth/signup','POST',{email:'first@example.test',password:'test-password-8391',name:'First'});assert.equal(first.status,200);a=first.body;
 const second=await call('auth/signup','POST',{email:'second@example.test',password:'test-password-1927',name:'Second'});assert.equal(second.status,200);b=second.body;
});
after(async()=>{await mf?.dispose()});
test('password hashes are salted, verified and not plaintext',async()=>{const h=await passwordHash('example-password');assert.ok(await passwordMatches('example-password',h));assert.equal(await passwordMatches('wrong-password',h),false);assert.notEqual(h,await passwordHash('example-password'));});
test('encryption round-trips and rejects a different key',async()=>{const ciphertext=await seal({ai:'sample-secret'},'a'.repeat(48));assert.equal((await unseal(ciphertext,'a'.repeat(48))).ai,'sample-secret');await assert.rejects(unseal(ciphertext,'b'.repeat(48)));});
test('private APIs reject unauthenticated and unrelated origins',async()=>{assert.equal((await call('state')).status,401);const r=await mf.dispatchFetch('https://still.test/api/state',{headers:{Origin:'https://untrusted.example',Authorization:'Bearer '+a.token}});assert.equal(r.status,403);});
test('one user cannot list, edit, organize or delete another user’s lesson',async()=>{
 const note=(await call('notes','POST',{title:'Private biology',subject:'Biology',text:'Mitochondria perform cellular respiration.'},a.token)).body;
 assert.equal((await call('state','GET',undefined,b.token)).body.notes.length,0);
 assert.equal((await call('notes/'+note.id,'PUT',{...note,text:'stolen'},b.token)).status,404);
 assert.equal((await call('notes/'+note.id,'DELETE',undefined,b.token)).status,404);
 assert.equal((await call('organize','POST',{id:note.id},b.token)).status,404);
 assert.equal((await call('state','GET',undefined,a.token)).body.notes[0].text,note.text);
});
test('API keys remain encrypted and absent from settings responses and exports',async()=>{
 const r=await call('settings','PUT',{provider:'groq',model:'openai/gpt-oss-120b',voiceId:'',theme:'dark',slang:false,brainrot:false,aiKey:'private-test-key'},a.token);assert.equal(r.status,200);assert.equal(r.body.user.settings.hasAiKey,true);assert.equal(JSON.stringify(r.body).includes('private-test-key'),false);
 const stored=await db.prepare('SELECT keys FROM users WHERE id=?').bind(a.user.id).first<{keys:string}>();assert.equal(stored!.keys.includes('private-test-key'),false);
 assert.equal(JSON.stringify((await call('export','GET',undefined,a.token)).body).includes('private-test-key'),false);
});
test('login failure and session logout are enforced',async()=>{assert.equal((await call('auth/login','POST',{email:'first@example.test',password:'wrong-pass'})).status,401);const login=await call('auth/login','POST',{email:'first@example.test',password:'test-password-8391'});assert.equal(login.status,200);await call('auth/logout','POST',{},login.body.token);assert.equal((await call('state','GET',undefined,login.body.token)).status,401);});
test('study grading and spaced review use owned server state',async()=>{
 const deck={id:crypto.randomUUID(),title:'Test deck',created:Date.now(),noteIds:[],cards:[{id:'card-1',front:'Q',back:'A',quote:'Source quote',due:0,interval:0}],questions:[{id:'question-1',prompt:'Question?',options:['A','B','C','D'],answer:2,explanations:['No A','No B','Yes C','No D'],quote:'Source quote'}]};
 await db.prepare('INSERT INTO items (id,user,kind,data,updated) VALUES (?,?,?,?,?)').bind(deck.id,a.user.id,'deck',JSON.stringify(deck),Date.now()).run();
 assert.equal((await call('attempt','POST',{deckId:deck.id,answers:[2]},b.token)).status,404);
 const attempt=await call('attempt','POST',{deckId:deck.id,answers:[0]},a.token);assert.equal(attempt.body.score,0);assert.equal(attempt.body.questions[0].explanations[0],'No A');
 const review=await call('review','POST',{deckId:deck.id,cardId:'card-1',rating:'easy'},a.token);assert.equal(review.body.cards[0].interval,4);assert.ok(review.body.cards[0].due>Date.now());
});

test('configured owner initializes once without overwriting account changes',async()=>{const login=await call('auth/login','POST',{email:'owner@example.test',password:'owner-test-password'});assert.equal(login.status,200);assert.equal(login.body.user.settings.hasAiKey,true);assert.equal(login.body.user.id,'owner-test');await call('state','GET',undefined,login.body.token);const row=await db.prepare('SELECT count(*) AS n FROM users WHERE email=?').bind('owner@example.test').first<{n:number}>();assert.equal(row!.n,1);});

test('coursework is private and strips imported credential fields',async()=>{
 const snapshot={courses:[{id:'c',name:'Private course',token:'must-be-stripped'}],tasks:[],announcements:[],canvasToken:'never-store-me'};
 assert.equal((await call('school','PUT',snapshot,a.token)).status,200);
 const own=await call('school','GET',undefined,a.token);assert.equal(own.body.courses.length,1);assert.ok(!JSON.stringify(own.body).includes('token'));
 assert.deepEqual((await call('school','GET',undefined,b.token)).body.courses,[]);
 await call('school','DELETE',undefined,b.token);assert.equal((await call('school','GET',undefined,a.token)).body.courses.length,1);
 const stored=await db.prepare("SELECT data FROM items WHERE user=? AND kind='school'").bind(a.user.id).first<{data:string}>();assert.ok(!stored!.data.includes('never-store-me'));assert.ok(!stored!.data.includes('must-be-stripped'));
});
test('local AI still enforces source ownership and citation checks; tone is optional and private',async()=>{
 const note=(await call('notes','POST',{title:'Local biology',subject:'Biology',text:'Mitochondria perform cellular respiration.'},a.token)).body;
 assert.equal((await call('local/prepare','POST',{kind:'chat',noteIds:[note.id],question:'What happens?'},b.token)).status,404);
 assert.equal((await call('organize','POST',{id:note.id,localResult:{summary:'Unauthorized'}},b.token)).status,404);
 const prepared=await call('local/prepare','POST',{kind:'chat',noteIds:[note.id],question:'What happens?'},a.token);assert.equal(prepared.status,200);assert.match(prepared.body.messages[0].content,/Do not search the web/);assert.ok(!JSON.stringify(prepared.body).includes('private-test-key'));
 assert.equal((await call('organize','POST',{id:note.id,localResult:{summary:'## Respiration\nMitochondria perform cellular respiration.'}},a.token)).status,200);
 const request={noteIds:[note.id],question:'ngl can u explain respiration',localResult:{answer:'Mitochondria carry it out.',citations:[{noteId:note.id,quote:'Mitochondria perform cellular respiration.'}]}};
 const off=await call('chat','POST',request,a.token);assert.equal(off.status,200);assert.equal((await call('tone','GET',undefined,a.token)).body.samples,0);
 const user=(await call('auth/me','GET',undefined,a.token)).body.user;
 await call('settings','PUT',{...user.settings,slang:true},a.token);
 const chat=await call('chat','POST',request,a.token);assert.equal(chat.body.citations.length,1);
 const tone=(await call('tone','GET',undefined,a.token)).body;assert.equal(tone.samples,1);assert.ok(tone.phrases.includes('ngl'));assert.ok(!JSON.stringify(tone).includes('respiration'));
 assert.equal((await call('tone','GET',undefined,b.token)).body.samples,0);
 const invalid=await call('chat','POST',{...request,localResult:{answer:'Invented',citations:[{noteId:note.id,quote:'A made-up fact.'}]}},a.token);assert.deepEqual(invalid.body.citations,[]);assert.match(invalid.body.answer,/could not find/);
 await call('tone','DELETE',undefined,a.token);assert.equal((await call('tone','GET',undefined,a.token)).body.samples,0);
});

import {schoolContract} from './school-contract';
test('Worker planning, documents and coursework AI enforce private ownership and explicit actions',async()=>{await schoolContract(call,a.token,b.token)});

test('developer console authenticates separately and manages accounts without exposing secrets',async()=>{
 assert.equal((await call('admin/accounts')).status,401);
 assert.equal((await call('admin/login','POST',{email:'dev@example.test',password:'wrong-password-12'})).status,401);
 const login=await call('admin/login','POST',{email:'dev@example.test',password:'dev-test-password-9182'});assert.equal(login.status,200);const token=login.body.token;
 assert.equal((await call('admin/accounts','GET',undefined,'not-a-real-token')).status,401);
 const list=await call('admin/accounts','GET',undefined,token);assert.equal(list.status,200);
 const target=list.body.accounts.find((x:any)=>x.email==='second@example.test');assert.ok(target&&target.id);
 assert.ok(list.body.accounts.some((x:any)=>x.email==='first@example.test'));
 const serialized=JSON.stringify(list.body);assert.ok(!serialized.includes('password')&&!serialized.includes('keys')&&!serialized.includes('gsk_'));
 assert.ok(target.model&&typeof target.notes==='number');
 assert.equal((await call('admin/content?id='+target.id,'GET',undefined,token)).status,200);
 assert.equal((await call('admin/password','POST',{id:target.id,password:'temporary-pass-4471'},token)).status,200);
 assert.equal((await call('auth/login','POST',{email:'second@example.test',password:'test-password-1927'})).status,401);
 assert.equal((await call('auth/login','POST',{email:'second@example.test',password:'temporary-pass-4471'})).status,200);
 assert.equal((await call('admin/suspend','POST',{id:target.id,suspended:true},token)).status,200);
 assert.equal((await call('auth/login','POST',{email:'second@example.test',password:'temporary-pass-4471'})).status,403);
 assert.equal((await call('admin/suspend','POST',{id:target.id,suspended:false},token)).status,200);
 assert.equal((await call('admin/delete','POST',{id:target.id},token)).status,200);
 const row=await db.prepare('SELECT count(*) AS n FROM users WHERE email=?').bind('second@example.test').first<{n:number}>();assert.equal(row!.n,0);
});
