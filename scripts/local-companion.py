#!/usr/bin/env python3
"""Still Notes local connector: keeps Canvas credentials and Ollama traffic local.
Run: python3 scripts/local-companion.py (Windows: py scripts/local-companion.py).
No third-party Python dependencies. Bind only to loopback. Never logs request bodies.
"""
import html, time, base64, hmac, json, os, re, secrets, threading, urllib.error, urllib.parse, urllib.request
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
def upstream(url, body=None, headers=None, method=None, limit=6000000):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','User-Agent':'StillNotes-Local/1.0',**(headers or {})},method=method)
    try:
        with OPENER.open(req, timeout=180) as res:
            data=res.read(limit+1)
            if len(data)>limit:raise ValueError('The local service returned too much data for one request.')
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
    if '/' not in model:raise ValueError('For OpenCode use provider/model, such as ollama/llama3.2:3b')
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
            tasks.append({'id':cid+'-'+str(a['id']),'courseId':cid,'title':title,'type':t,'dueAt':a.get('due_at'),'pointsPossible':a.get('points_possible') or 0,'pointsEarned':sub.get('score'),'groupWeight':weights.get(str(a.get('assignment_group_id'))) if c.get('apply_assignment_group_weights') else None,'groupId':str(a.get('assignment_group_id') or ''),'groupName':next((g.get('name','Other') for g in groups if g['id']==a.get('assignment_group_id')),'Other'),'canvasId':str(a['id']),'excused':bool(sub.get('excused')),'submissionTypes':a.get('submission_types',[]),'submitted':state in ('submitted','graded','pending_review') or bool(sub.get('graded_at')),'needsGrading':state in ('submitted','pending_review'),'htmlUrl':a.get('html_url',''),'description':desc,'done':False,'minutes':0})
        try:
            anns=all_pages('/api/v1/announcements?context_codes[]=course_'+cid)
            announcements.extend({'id':str(a['id']),'courseId':cid,'title':a.get('title','Announcement'),'text':re.sub(r'<[^>]*>',' ',a.get('message',''))[:15000],'url':a.get('html_url',''),'date':a.get('posted_at') or ''} for a in anns[:30])
        except ValueError:warnings.append('Announcements unavailable for '+name)
        if len(courses)>50 or len(tasks)>1500:raise ValueError('Too much coursework for one sync')
    # Canvas's own To Do feed can contain work omitted by course assignment lists.
    try:
        todos=all_pages('/api/v1/users/self/todo?include[]=course');known={t['id'] for t in tasks};courseids={c['id'] for c in courses}
        for todo in todos:
            a=todo.get('assignment') or {};cid=str(todo.get('course_id') or '');aid=str(a.get('id') or '')
            if not cid.isdigit() or not aid.isdigit() or cid not in courseids or cid+'-'+aid in known:continue
            sub=a.get('submission') or {};title=a.get('name','Canvas task');state=sub.get('workflow_state','')
            kind='exam' if re.search(r'\b(test|exam|final|midterm)\b',title,re.I) else 'quiz' if 'online_quiz' in a.get('submission_types',[]) or re.search(r'\bquiz',title,re.I) else 'assignment'
            tasks.append({'id':cid+'-'+aid,'courseId':cid,'canvasId':aid,'title':title,'type':kind,'dueAt':a.get('due_at'),'pointsPossible':a.get('points_possible') or 0,'pointsEarned':sub.get('score'),'groupWeight':None,'submitted':state in ('submitted','graded','pending_review'),'needsGrading':state in ('submitted','pending_review'),'excused':bool(sub.get('excused')),'submissionTypes':a.get('submission_types',[]),'htmlUrl':a.get('html_url',''),'description':plain(a.get('description')),'done':False,'minutes':0});known.add(cid+'-'+aid)
    except ValueError:warnings.append('Canvas To Do feed unavailable; course assignments are still included.')
    if len(tasks)>1500:raise ValueError('Too much coursework for one sync')
    return {'courses':courses,'tasks':tasks,'announcements':sorted(announcements,key=lambda a:a['date'],reverse=True)[:150],'synced':__import__('time').time()*1000,'dailyMinutes':120,'warnings':warnings}

CANVAS_SESSIONS={}
CANVAS_LOCK=threading.Lock()
def opencode_headers():
    if not os.getenv('OPENCODE_SERVER_PASSWORD'):return {}
    pair=(os.getenv('OPENCODE_SERVER_USERNAME','opencode')+':'+os.environ['OPENCODE_SERVER_PASSWORD']).encode()
    return {'Authorization':'Basic '+base64.b64encode(pair).decode()}
def opencode_models():
    # The provider catalogue can be several megabytes, so allow a larger read.
    result,_=upstream('http://127.0.0.1:4096/provider',headers=opencode_headers(),limit=40000000)
    connected=set(result.get('connected',[]));models=[]
    for provider in result.get('all',[]):
        if provider.get('id') not in connected:continue
        for mid,model in provider.get('models',{}).items():
            if model.get('status')=='deprecated':continue
            models.append({'id':provider['id']+'/'+mid,'name':model.get('name',mid),'provider':provider.get('name',provider['id'])})
    return {'models':models[:1000]}
def canvas_credentials(data):
    sid=data.get('session','')
    with CANVAS_LOCK:
        row=CANVAS_SESSIONS.get(sid)
        if not row or row['expires']<time.time():
            CANVAS_SESSIONS.pop(sid,None);raise ValueError('Connect Canvas again. Local sessions last two hours.')
        return row['base'],row['token']
def canvas_pages(base,token,path):
    url=base+path+('&' if '?' in path else '?')+'per_page=100';out=[]
    for _ in range(15):
        parts=urllib.parse.urlsplit(url)
        if 'https://'+parts.netloc!=base or parts.scheme!='https' or not parts.path.startswith('/api/v1/'):raise ValueError('Unsafe pagination target')
        rows,head=upstream(url,headers={'Authorization':'Bearer '+token})
        if not isinstance(rows,list):raise ValueError('Canvas returned an unexpected list')
        out.extend(rows);nxt=re.search(r'<([^>]+)>;\s*rel="next"',head.get('Link',''))
        if not nxt:return out
        url=nxt.group(1)
    raise ValueError('Canvas returned too much content for one request')
def plain(value):return html.unescape(re.sub(r'<[^>]*>',' ',str(value or '')))[:15000]
def file_meta(f):return {'id':str(f['id']),'name':f.get('display_name') or f.get('filename') or 'File','type':f.get('content-type') or f.get('content_type') or '', 'size':f.get('size') or 0,'locked':bool(f.get('locked_for_user') or f.get('hidden_for_user'))}
def allowed_file_url(url,base):
    p=urllib.parse.urlsplit(url);host=p.hostname or '';school=urllib.parse.urlsplit(base).hostname
    return p.scheme=='https' and not p.username and not p.password and p.port in (None,443) and (host==school or host.endswith('.instructure.com') or host.endswith('.instructure-uploads.s3.amazonaws.com') or host.endswith('.s3.amazonaws.com') or re.fullmatch(r'[a-z0-9-]+\.s3[.-][a-z0-9-]+\.amazonaws\.com',host))
def file_request(url,base,token,raw=None,headers=None):
    # Every redirect is checked; a Canvas bearer token never goes to object storage.
    for _ in range(4):
        if not allowed_file_url(url,base):raise ValueError('This file host is not supported. Open the file in Canvas.')
        auth={'Authorization':'Bearer '+token} if urllib.parse.urlsplit(url).netloc==urllib.parse.urlsplit(base).netloc else {}
        req=urllib.request.Request(url,data=raw,headers={**auth,**(headers or {})})
        # A separate no-follow handler lets us inspect upload/download redirects.
        class StopRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args):return None
        try:
            with urllib.request.build_opener(StopRedirect).open(req,timeout=90) as r:
                result=r.read(15000001)
                if len(result)>15000000:raise ValueError('File exceeds 15 MB. Download it in Canvas instead.')
                return result,r.headers
        except urllib.error.HTTPError as e:
            if e.code not in (301,302,303,307,308):raise ValueError('Canvas file transfer failed (HTTP '+str(e.code)+')') from None
            url=urllib.parse.urljoin(url,e.headers.get('Location',''))
            if e.code in (301,302,303):raw=None;headers=None
    raise ValueError('Too many file redirects')
def canvas_action(path,data):
    if path=='/canvas/connect':
        base=str(data.get('base','')).strip().rstrip('/');token=str(data.get('token','')).strip()
        if not re.fullmatch(r'https://[a-zA-Z0-9-]+\.instructure\.com',base) or not token or len(token)>500:raise ValueError('Enter your school Canvas URL and token')
        profile,_=upstream(base+'/api/v1/users/self/profile',headers={'Authorization':'Bearer '+token})
        with CANVAS_LOCK:
            for k in list(CANVAS_SESSIONS):
                if CANVAS_SESSIONS[k]['expires']<time.time():del CANVAS_SESSIONS[k]
            if len(CANVAS_SESSIONS)>=10:raise ValueError('Too many connected sessions. Restart the connector.')
            sid=secrets.token_urlsafe(32);CANVAS_SESSIONS[sid]={'base':base,'token':token,'expires':time.time()+7200}
        return {'session':sid,'name':profile.get('name','Connected student')}
    base,token=canvas_credentials(data);headers={'Authorization':'Bearer '+token}
    if path=='/canvas/disconnect':
        with CANVAS_LOCK:CANVAS_SESSIONS.pop(data['session'],None)
        return {'ok':True}
    if path=='/canvas/sync':return canvas_sync({'base':base,'token':token})
    cid=str(data.get('courseId',''))
    if not re.fullmatch(r'\d+',cid):raise ValueError('Choose a synced Canvas course')
    prefix=base+'/api/v1/courses/'+cid
    if path=='/canvas/content':
        course,_=upstream(prefix+'?include[]=syllabus_body',headers=headers);warnings=[]
        try:files=canvas_pages(base,token,'/api/v1/courses/'+cid+'/files')
        except ValueError:files=[];warnings.append('Files access is restricted; module files are used where available.')
        try:modules=canvas_pages(base,token,'/api/v1/courses/'+cid+'/modules?include[]=items&include[]=content_details')
        except ValueError:modules=[];warnings.append('Modules access is restricted for this token.')
        normalized=[];fileids={str(f['id']) for f in files}
        for m in modules[:100]:
            items=m.get('items',[])
            if m.get('items_count',len(items))>len(items):items=canvas_pages(base,token,'/api/v1/courses/'+cid+'/modules/'+str(m['id'])+'/items')
            mapped=[]
            for it in items[:500]:
                mapped.append({'id':str(it['id']),'title':it.get('title','Item'),'type':it.get('type',''),'contentId':str(it.get('content_id') or ''),'page':it.get('page_url') or '', 'url':it.get('html_url','') if str(it.get('html_url','')).startswith('https://') else ''})
                if it.get('type')=='File' and str(it.get('content_id')) not in fileids:
                    try:
                        f,_=upstream(prefix+'/files/'+str(it['content_id']),headers=headers);files.append(f);fileids.add(str(f['id']))
                    except ValueError:pass
            normalized.append({'id':str(m['id']),'name':m.get('name','Module'),'items':mapped})
        return {'syllabus':plain(course.get('syllabus_body')),'files':[file_meta(f) for f in files[:1000]],'modules':normalized,'updated':time.time()*1000,'warnings':warnings}
    ident=str(data.get('id',''))
    if path=='/canvas/page':
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,300}',ident):raise ValueError('Invalid page')
        page,_=upstream(prefix+'/pages/'+ident,headers=headers);return {'title':page.get('title','Page'),'text':plain(page.get('body'))}
    if not re.fullmatch(r'\d+',ident):raise ValueError('Choose a Canvas item')
    if path=='/canvas/file':
        meta,_=upstream(prefix+'/files/'+ident,headers=headers)
        if meta.get('locked_for_user') or meta.get('hidden_for_user'):raise ValueError('This file is locked in Canvas')
        if (meta.get('size') or 0)>15000000:raise ValueError('File exceeds 15 MB; open it in Canvas')
        raw,_=file_request(meta.get('url',''),base,token)
        return {**file_meta(meta),'data':base64.b64encode(raw).decode()}
    if path=='/canvas/assignment':
        a,_=upstream(prefix+'/assignments/'+ident+'?include[]=submission',headers=headers)
        try:sub,_=upstream(prefix+'/assignments/'+ident+'/submissions/self?include[]=submission_comments',headers=headers)
        except ValueError:sub=a.get('submission') or {}
        return {'title':a.get('name','Assignment'),'text':plain(a.get('description')),'types':a.get('submission_types',[]),'locked':bool(a.get('locked_for_user')),'submitted':sub.get('workflow_state') in ('submitted','graded','pending_review'),'attempt':sub.get('attempt') or 0,'comments':[{'author':x.get('author_name','Teacher'),'text':plain(x.get('comment'))} for x in sub.get('submission_comments',[])[:50]],'attachments':[file_meta(f) for f in sub.get('attachments',[])[:20]]}
    if path=='/canvas/read':
        upstream(prefix+'/discussion_topics/'+ident+'/read',headers=headers,method='PUT');return {'ok':True}
    if path=='/canvas/submit':
        if data.get('confirmed') is not True:raise ValueError('Review and confirm your submission first')
        a,_=upstream(prefix+'/assignments/'+ident,headers=headers);kind=data.get('type')
        if a.get('locked_for_user') or kind not in a.get('submission_types',[]):raise ValueError('This submission type is not currently allowed by the assignment')
        submission={'submission_type':kind}
        if kind=='online_text_entry':
            text=str(data.get('text','')).strip()
            if not text or len(text)>90000:raise ValueError('Enter a response up to 90,000 characters')
            submission['body']='<p>'+html.escape(text).replace('\n','<br>')+'</p>'
        elif kind=='online_url':
            url=str(data.get('url','')).strip();p=urllib.parse.urlsplit(url)
            if p.scheme not in ('https','http') or not p.hostname or p.username or len(url)>2048:raise ValueError('Enter a valid HTTP(S) submission URL')
            submission['url']=url
        elif kind=='online_upload':
            files=data.get('files',[])
            if not 1<=len(files)<=5:raise ValueError('Choose one to five files')
            fileids=[];total=0
            for f in files:
                raw=base64.b64decode(f.get('data',''),validate=True);total+=len(raw)
                if total>15000000:raise ValueError('Combined files must be below 15 MB')
                name=re.sub(r'[\r\n"\\/]', '_',str(f.get('name','file')))[:160];mime=str(f.get('type','application/octet-stream'))
                if not re.fullmatch(r'[\w.+-]+/[\w.+-]+',mime):mime='application/octet-stream'
                pre,_=upstream(prefix+'/assignments/'+ident+'/submissions/self/files',{'name':name,'size':len(raw),'content_type':mime,'on_duplicate':'rename'},headers)
                boundary='StillNotes'+secrets.token_hex(16);parts=[]
                for k,v in pre.get('upload_params',{}).items():
                    if not re.fullmatch(r'[a-zA-Z0-9_.\[\]-]+',k):raise ValueError('Unexpected upload field')
                    parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+str(v)+'\r\n').encode())
                parts.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+mime+'\r\n\r\n').encode(),raw,('\r\n--'+boundary+'--\r\n').encode()])
                uploaded,_=file_request(pre.get('upload_url',''),base,token,b''.join(parts),{'Content-Type':'multipart/form-data; boundary='+boundary});res=json.loads(uploaded)
                if not res.get('id'):raise ValueError('Canvas did not confirm the uploaded file')
                fileids.append(res['id'])
            submission['file_ids']=fileids
        else:raise ValueError('Open this assignment in Canvas to complete its quiz, annotation or media workflow')
        result,_=upstream(prefix+'/assignments/'+ident+'/submissions',{'submission':submission},headers)
        return {'submitted':result.get('workflow_state') in ('submitted','graded','pending_review'),'attempt':result.get('attempt'),'submittedAt':result.get('submitted_at')}
    raise ValueError('Unknown Canvas action')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def authorized_origin(self):
        if self.headers.get('Host') not in ('127.0.0.1:'+str(PORT),'localhost:'+str(PORT)):return False
        origin=self.headers.get('Origin') or ''
        if origin in ORIGINS:return True
        # Allow the site during local development. Only loopback origins are
        # accepted and every request still requires the pairing code, so this
        # does not widen access beyond this computer.
        parts=urllib.parse.urlsplit(origin)
        return (parts.scheme in ('http','https') and parts.hostname in ('127.0.0.1','localhost','::1')
                and not parts.username and not parts.password)
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
            if size<1 or size>(30000000 if self.path=='/canvas/submit' else 1500000):raise ValueError('Request is too large')
            data=json.loads(self.rfile.read(size))
            if self.path=='/health':out={'ok':True,'version':2}
            elif self.path=='/models':
                rows,_=upstream('http://127.0.0.1:11434/api/tags');out={'models':[m['name'] for m in rows.get('models',[])]}
            elif self.path=='/opencode/models':out=opencode_models()
            elif self.path.startswith('/canvas/') :out=canvas_action(self.path,data)
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
