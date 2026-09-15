#!/usr/bin/env python3
"""Still Notes local connector: keeps Canvas credentials and Ollama traffic local.
Run: python3 scripts/local-companion.py (Windows: py scripts/local-companion.py).
No third-party Python dependencies. Bind only to loopback. Never logs request bodies.
"""
import base64, hmac, json, os, re, secrets, threading, urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
PORT = 8766
ORIGINS = {'https://kartbala07.github.io', 'https://still-notes.swathibala988.chatgpt.site'}
if os.getenv('STILL_NOTES_ORIGIN'):
    origin = urllib.parse.urlsplit(os.environ['STILL_NOTES_ORIGIN'])
    if origin.scheme != 'https' or not origin.hostname or origin.username or origin.query or origin.fragment or origin.path not in ('','/'):
        raise ValueError('STILL_NOTES_ORIGIN must be an exact HTTPS origin')
    ORIGINS.add(urllib.parse.urlunsplit((origin.scheme, origin.netloc, '', '', '')))
PAIRING = os.getenv('STILL_NOTES_PAIRING') or secrets.token_urlsafe(32)
BUSY = threading.BoundedSemaphore(2)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected redirect refused')
OPENER = urllib.request.build_opener(NoRedirect)
def upstream(url, body=None, headers=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','User-Agent':'StillNotes-Local/1.0',**(headers or {})},method=method)
    try:
        with OPENER.open(req, timeout=180) as res:
            data=res.read(6000001)
            if len(data)>6000000:raise ValueError('Response too large; sync fewer courses')
            return json.loads(data or 'null'),res.headers
    except urllib.error.HTTPError as e:
        raise ValueError('Service returned HTTP '+str(e.code)+'. Check the selected model or Canvas token.') from None
    except urllib.error.URLError:
        raise ValueError('Cannot reach the service. Start Ollama or OpenCode on this computer.') from None

def local_model(body):
    provider=body.get('provider','ollama'); model=str(body.get('model','')).strip()
    messages=body.get('messages',[])
    if not messages or len(messages)>24 or any(m.get('role') not in ('system','user','assistant') or not isinstance(m.get('content'),str) for m in messages):raise ValueError('Invalid messages')
    if sum(len(m['content']) for m in messages)>120000:raise ValueError('Select less source material')
    if provider=='ollama':
        if not model or len(model)>150:raise ValueError('Choose an installed Ollama model')
        result,_=upstream('http://127.0.0.1:11434/api/chat',{'model':model,'messages':messages,'stream':False,'format':body.get('schema') or 'json','options':{'temperature':.2,'num_predict':7000}})
        return {'content':result.get('message',{}).get('content',''),'model':model}
    if provider!='opencode':raise ValueError('Choose Ollama or OpenCode')
    # An isolated temporary session, all tools denied, and an explicit model.
    # OpenCode is local software; the selected provider may still be a cloud model.
    if '/' not in model:raise ValueError('For OpenCode use provider/model, such as ollama/gemma4:e2b')
    provider_id,model_id=model.split('/',1)
    headers={}
    if os.getenv('OPENCODE_SERVER_PASSWORD'):
        pair=(os.getenv('OPENCODE_SERVER_USERNAME','opencode')+':'+os.environ['OPENCODE_SERVER_PASSWORD']).encode()
        headers['Authorization']='Basic '+base64.b64encode(pair).decode()
    config,_=upstream('http://127.0.0.1:4096/config',headers=headers)
    if config.get('share') == 'auto' or config.get('autoshare'):
        raise ValueError('Disable automatic sharing in OpenCode before sending private notes (set share to disabled).')
    session,_=upstream('http://127.0.0.1:4096/session',{'title':'Still Notes study','permission':[{'permission':'*','pattern':'*','action':'deny'}]},headers)
    sid=session['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]+',sid):raise ValueError('Invalid session')
    try:
        if not any(r.get('permission')=='*' and r.get('pattern')=='*' and r.get('action')=='deny' for r in session.get('permission',[])):
            raise ValueError('This OpenCode server did not confirm disabled tools. Update OpenCode or use Ollama.')
        system='\n'.join(m['content'] for m in messages if m['role']=='system')
        user='\n'.join(m['content'] for m in messages if m['role']!='system')
        result,_=upstream('http://127.0.0.1:4096/session/'+sid+'/message',{'model':{'providerID':provider_id,'modelID':model_id},'system':system,'tools':{'*':False,'webfetch':False,'websearch':False,'bash':False,'read':False,'task':False},'parts':[{'type':'text','text':user}]},headers)
        return {'content':'\n'.join(p.get('text','') for p in result.get('parts',[]) if p.get('type')=='text'),'model':model}
    finally:
        try:upstream('http://127.0.0.1:4096/session/'+sid,headers=headers,method='DELETE')
        except Exception:pass

def canvas_sync(body):
    base=str(body.get('base','')).strip().rstrip('/')
    if not re.fullmatch(r'https://[a-zA-Z0-9-]+\.instructure\.com',base):raise ValueError('Use your school’s HTTPS instructure.com address')
    token=str(body.get('token','')).strip()
    if not token or len(token)>500:raise ValueError('Enter your Canvas access token')
    headers={'Authorization':'Bearer '+token}
    def get(path):return upstream(base+path,headers=headers)[0]
    def all_pages(path):
        url=base+path+('&' if '?' in path else '?')+'per_page=100'; out=[]
        for _ in range(20):
            parsed=urllib.parse.urlsplit(url)
            if parsed.scheme!='https' or 'https://'+parsed.netloc!=base or not parsed.path.startswith('/api/v1/'):raise ValueError('Unsafe pagination target')
            rows,head=upstream(url,headers=headers)
            if not isinstance(rows,list):raise ValueError('Unexpected Canvas response')
            out.extend(rows); nxt=re.search(r'<([^>]+)>;\s*rel="next"',head.get('Link',''))
            if not nxt:return out
            url=nxt.group(1)
        raise ValueError('Canvas has too many pages. Import a smaller snapshot.')
    profile=get('/api/v1/users/self/profile')
    raw=all_pages('/api/v1/courses?enrollment_state=active&include[]=total_scores')
    courses=[];tasks=[];announcements=[];warnings=[]
    for c in raw:
        enrollment=next((e for e in c.get('enrollments',[]) if 'student' in e.get('type','').lower()),None)
        if not enrollment:continue
        cid=str(c['id']);name=c.get('name','Course');kind='ap' if re.search(r'\bAP\b',name,re.I) else 'honors' if re.search(r'honors?',name,re.I) else 'regular'
        score=enrollment.get('computed_current_score',enrollment.get('grades',{}).get('current_score'))
        courses.append({'id':cid,'name':name,'code':c.get('course_code',''),'type':kind,'currentScore':score,'targetGrade':{'regular':93,'honors':88,'ap':83}[kind]})
        groups=all_pages('/api/v1/courses/'+cid+'/assignment_groups')
        weights={str(g['id']):g.get('group_weight') for g in groups}
        assignments=all_pages('/api/v1/courses/'+cid+'/assignments?include[]=submission')
        for a in assignments:
            sub=a.get('submission') or {}; title=a.get('name','Assignment');state=sub.get('workflow_state','');t='exam' if re.search(r'\b(test|exam|final|midterm)\b',title,re.I) else 'quiz' if 'online_quiz' in a.get('submission_types',[]) or re.search(r'\bquiz',title,re.I) else 'project' if re.search(r'project|essay|paper|lab report|portfolio',title,re.I) else 'assignment'
            # HTML is kept as plain text; the website never renders source HTML.
            desc=re.sub(r'<[^>]*>',' ',a.get('description') or '')[:15000]
            tasks.append({'id':cid+'-'+str(a['id']),'courseId':cid,'title':title,'type':t,'dueAt':a.get('due_at'),'pointsPossible':a.get('points_possible') or 0,'pointsEarned':sub.get('score'),'groupWeight':weights.get(str(a.get('assignment_group_id'))),'submitted':state in ('submitted','graded','pending_review') or bool(sub.get('graded_at')),'needsGrading':state in ('submitted','pending_review'),'htmlUrl':a.get('html_url',''),'description':desc,'done':False,'minutes':0})
        try:
            anns=all_pages('/api/v1/announcements?context_codes[]=course_'+cid)
            announcements.extend({'id':str(a['id']),'courseId':cid,'title':a.get('title','Announcement'),'text':re.sub(r'<[^>]*>',' ',a.get('message',''))[:15000],'url':a.get('html_url',''),'date':a.get('posted_at') or ''} for a in anns[:30])
        except ValueError:warnings.append('Announcements unavailable for '+name)
        if len(courses)>50 or len(tasks)>1500:raise ValueError('Too much coursework for one sync')
    return {'courses':courses,'tasks':tasks,'announcements':sorted(announcements,key=lambda a:a['date'],reverse=True)[:150],'synced':__import__('time').time()*1000,'dailyMinutes':120,'warnings':warnings}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def authorized_origin(self):return self.headers.get('Host') in ('127.0.0.1:'+str(PORT),'localhost:'+str(PORT)) and self.headers.get('Origin') in ORIGINS
    def send(self,status,data):
        raw=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
        if self.authorized_origin():self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
        self.end_headers();self.wfile.write(raw)
    def do_OPTIONS(self):
        if not self.authorized_origin():return self.send(403,{'error':'Origin not allowed'})
        self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Access-Control-Allow-Headers','Content-Type, X-Still-Pairing');self.send_header('Access-Control-Allow-Methods','POST, OPTIONS');self.send_header('Access-Control-Allow-Private-Network','true');self.end_headers()
    def do_POST(self):
        if not self.authorized_origin() or not hmac.compare_digest(self.headers.get('X-Still-Pairing',''),PAIRING):return self.send(403,{'error':'Check the pairing code and allowed website origin'})
        if not BUSY.acquire(blocking=False):return self.send(429,{'error':'A local request is already running. Try again shortly.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>1500000:raise ValueError('Request is too large')
            data=json.loads(self.rfile.read(size))
            if self.path=='/health':out={'ok':True}
            elif self.path=='/models':
                rows,_=upstream('http://127.0.0.1:11434/api/tags');out={'models':[m['name'] for m in rows.get('models',[])]}
            elif self.path=='/generate':out=local_model(data)
            elif self.path=='/canvas':out=canvas_sync(data)
            else:return self.send(404,{'error':'Not found'})
            self.send(200,out)
        except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)[:240]})
        except Exception:self.send(502,{'error':'Local service could not complete the request'})
        finally:BUSY.release()
if __name__=='__main__':
    print('Still Notes connector is listening on this computer only: http://127.0.0.1:'+str(PORT))
    print('Pairing code (paste into Still Notes Settings; never commit it): '+PAIRING)
    print('Allowed websites: '+', '.join(sorted(ORIGINS)))
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
