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
 mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{APP_ENCRYPTION_KEY:'test-only-secret-'.repeat(4),OWNER_BOOTSTRAP:JSON.stringify({id:'owner-test',email:'owner@example.test',name:'Owner',password:await passwordHash('owner-test-password'),keys:await seal({ai:'gsk_owner-test-key'},'test-only-secret-'.repeat(4))})}});
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
