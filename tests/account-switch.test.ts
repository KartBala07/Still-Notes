import {test} from 'node:test';
import assert from 'node:assert/strict';
import {companion,setLocalOwner} from '../lib/local-ai';
import {api,setSession} from '../lib/client';
test('in-flight Canvas or model results are discarded after switching accounts',async()=>{
 const original=globalThis.fetch;
 let finish!:(r:Response)=>void;
 globalThis.fetch=()=>new Promise<Response>(resolve=>{finish=resolve});
 try {
  setLocalOwner('alice');const pending=companion('/canvas/content',{session:'test-only'},'test-pairing');
  setLocalOwner('bob');finish(Response.json({syllabus:'Alice private course'}));
  await assert.rejects(pending,/account changed/);
 } finally {globalThis.fetch=original;setLocalOwner('')}
});
test('late cloud responses cannot populate a new account workspace',async()=>{
 const original=globalThis.fetch;let finish!:(r:Response)=>void;
 globalThis.fetch=()=>new Promise<Response>(resolve=>{finish=resolve});
 try {
  setSession('alice-fixture');const pending=api('state');setSession('bob-fixture');
  finish(Response.json({notes:[{text:'Private to Alice'}]}));await assert.rejects(pending,/account changed/);
 } finally {globalThis.fetch=original;setSession('')}
});
