import {localConfig,localGenerate} from './local-ai';
import type {Note} from './types';
export const API_BASE=typeof window!=='undefined'&&window.location.hostname==='kartbala07.github.io'?'https://still-notes.swathibala988.chatgpt.site':'';
let authToken='';
export function loadSession(){if(API_BASE)authToken=sessionStorage.getItem('still-session')||'';}
export function setSession(value:string){authToken=value;if(API_BASE){if(value)sessionStorage.setItem('still-session',value);else sessionStorage.removeItem('still-session');}}
export async function request(path:string,options:RequestInit={}){
 const headers=new Headers(options.headers);if(authToken)headers.set('Authorization','Bearer '+authToken);
 if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
 const response=await fetch(API_BASE+'/api/'+path,{...options,headers,credentials:'include'});
 if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:string};throw new Error(data.error||'Request failed ('+response.status+').');}return response;
}
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 let value=body;
 if(method==='POST'&&['organize','generate','chat'].includes(path)&&localConfig().mode!=='cloud'){
  const prepared=await (await request('local/prepare',{method:'POST',body:JSON.stringify({...body as object,kind:path})})).json();
  value={...body as object,localResult:await localGenerate(prepared)};
 }
 return (await request(path,{method,body:value===undefined?undefined:JSON.stringify(value)})).json();
}
export function download(name:string,body:Blob|string){const url=URL.createObjectURL(typeof body==='string'?new Blob([body],{type:'text/plain'}):body);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function extract(file:File){
 if(file.size>20000000)throw new Error('Please upload a file below 20 MB.');
 const ext=file.name.split('.').pop()?.toLowerCase();let value='';
 if(ext==='pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:await file.arrayBuffer()});const doc=await task.promise;
  try{if(doc.numPages>250)throw new Error('Import this PDF in sections of up to 250 pages.');for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();value+=content.items.map(x=>'str' in x?x.str:'').join(' ')+'\n';if(value.length>90000)throw new Error('This PDF is too long. Import one lesson at a time.');}}finally{await task.destroy();}
 }else if(ext==='docx'){const mammoth=await import('mammoth/mammoth.browser');value=(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;}
 else if(['txt','md','csv','srt','vtt'].includes(ext||''))value=await file.text();
 else throw new Error('Choose PDF, DOCX, TXT, Markdown, CSV, SRT or VTT.');
 if(!value.trim())throw new Error('No selectable text was found. Scanned PDFs need OCR before import.');if(value.length>90000)throw new Error('Please split this file into smaller lessons (90,000 characters each).');return value;
}
export function noteMarkdown(n:Note){return '# '+n.title+'\n\n'+(n.summary||n.text);}
