import importlib.util, json, threading, unittest, http.client
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('companion',Path(__file__).resolve().parents[1]/'scripts/local-companion.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class ConnectorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=c.ThreadingHTTPServer(('127.0.0.1',0),c.Handler)
        c.PORT=cls.server.server_port
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def request(self,**overrides):
        headers={'Host':'127.0.0.1:'+str(c.PORT),'Origin':'https://kartbala07.github.io','X-Still-Pairing':c.PAIRING,'Content-Type':'application/json',**overrides}
        conn=http.client.HTTPConnection('127.0.0.1',c.PORT,timeout=3)
        conn.request('POST','/health',body='{}',headers=headers);r=conn.getresponse();status=r.status;r.read();conn.close();return status
    def test_pairing_origin_host(self):
        self.assertEqual(self.request(),200)
        for headers in [{'Origin':'https://evil.test'},{'Host':'evil.test:'+str(c.PORT)},{'X-Still-Pairing':'wrong'}]:self.assertEqual(self.request(**headers),403)
    def test_ollama_fixed_endpoint_schema(self):
        schema={'type':'object','properties':{'summary':{'type':'string'}}}
        with patch.object(c,'upstream',return_value=({'message':{'content':'{"summary":"ok"}'}},{})) as mock:
            self.assertEqual(c.local_model({'provider':'ollama','model':'test-local','messages':[{'role':'user','content':'Private text'}],'schema':schema})['content'],'{"summary":"ok"}')
            url,body=mock.call_args.args;self.assertEqual(url,'http://127.0.0.1:11434/api/chat');self.assertEqual(body['format'],schema);self.assertFalse(body['stream'])
    def test_opencode_denies_tools_and_cleans_up(self):
        rules=[{'permission':'*','pattern':'*','action':'deny'}]
        with patch.object(c,'upstream',side_effect=[({'share':'disabled'},{}),({'id':'ses_test','permission':rules},{}),({'parts':[{'type':'text','text':'{}'}]},{}),(True,{})]) as mock:
            c.local_model({'provider':'opencode','model':'ollama/test','messages':[{'role':'user','content':'Private text'}]})
            self.assertEqual(mock.call_args_list[1].args[1]['permission'],rules)
            self.assertTrue(all(v is False for v in mock.call_args_list[2].args[1]['tools'].values()))
            self.assertEqual(mock.call_args.kwargs['method'],'DELETE')
    def test_opencode_refuses_autosharing_before_sending_notes(self):
        with patch.object(c,'upstream',return_value=({'share':'auto'},{})) as mock:
            with self.assertRaisesRegex(ValueError,'automatic sharing'):c.local_model({'provider':'opencode','model':'ollama/test','messages':[{'role':'user','content':'Private text'}]})
            self.assertEqual(mock.call_count,1)
    def test_canvas_rejects_untrusted_hosts_and_pagination(self):
        with self.assertRaises(ValueError):c.canvas_sync({'base':'https://school.instructure.com.evil.test','token':'fixture-only'})
        with patch.object(c,'upstream',side_effect=[({'id':1},{}),([] ,{'Link':'<https://evil.test/api/v1/courses>; rel="next"'})]) as mock:
            with self.assertRaisesRegex(ValueError,'Unsafe pagination'):c.canvas_sync({'base':'https://school.instructure.com','token':'fixture-only'})
            self.assertEqual(mock.call_count,2)
    def test_upstream_redirect_is_refused(self):
        with self.assertRaises(ValueError):c.NoRedirect().redirect_request(None,None,302,'',{},'https://evil.test')

class CanvasActionsTest(unittest.TestCase):
    def setUp(self):
        c.CANVAS_SESSIONS.clear()
        c.CANVAS_SESSIONS['test-session']={'base':'https://school.instructure.com','token':'fixture-secret','expires':c.time.time()+60}
        self.data={'session':'test-session','courseId':'12','id':'34'}
    def test_canvas_sync_merges_todo_without_duplicates_and_honors_point_based_grading(self):
        responses=[({'id':1},{}),([{'id':12,'name':'Math','apply_assignment_group_weights':False,'enrollments':[{'type':'student','computed_current_score':90}]}],{}),([{'id':3,'name':'Homework','group_weight':0}],{}),([{'id':34,'name':'Existing','assignment_group_id':3,'submission':{'workflow_state':'submitted'}}],{}),([],{}),([{'course_id':12,'assignment':{'id':34,'name':'Duplicate'}},{'course_id':12,'assignment':{'id':35,'name':'Todo only'}},{'course_id':99,'assignment':{'id':36,'name':'Unknown course'}}],{})]
        with patch.object(c,'upstream',side_effect=responses):
            data=c.canvas_sync({'base':'https://school.instructure.com','token':'fixture-secret'})
        self.assertEqual([t['id'] for t in data['tasks']],['12-34','12-35']);self.assertIsNone(data['tasks'][0]['groupWeight']);self.assertTrue(data['tasks'][0]['submitted']);self.assertNotIn('fixture-secret',json.dumps(data))
    def test_sessions_expire_and_return_only_opaque_ids(self):
        with patch.object(c,'upstream',return_value=({'name':'Student'},{})):
            out=c.canvas_action('/canvas/connect',{'base':'https://school.instructure.com','token':'fixture-secret'})
        self.assertGreaterEqual(len(out['session']),40);self.assertNotIn('fixture-secret',json.dumps(out))
        c.CANVAS_SESSIONS['test-session']['expires']=0
        with self.assertRaisesRegex(ValueError,'Connect Canvas again'):c.canvas_credentials(self.data)
        c.canvas_action('/canvas/disconnect',{'session':out['session']});self.assertNotIn(out['session'],c.CANVAS_SESSIONS)
    def test_opencode_lists_only_connected_current_models(self):
        data={'connected':['local'],'all':[{'id':'local','models':{'active':{'name':'Active'},'old':{'status':'deprecated'}}},{'id':'paid','models':{'x':{}}}]}
        with patch.object(c,'upstream',return_value=(data,{})):
            self.assertEqual([x['id'] for x in c.opencode_models()['models']],['local/active'])
    def test_submission_requires_confirmation_and_teacher_allowed_type(self):
        with patch.object(c,'upstream') as mock:
            with self.assertRaisesRegex(ValueError,'confirm'):c.canvas_action('/canvas/submit',self.data)
            mock.assert_not_called()
        with patch.object(c,'upstream',return_value=({'submission_types':['online_upload']},{})) as mock:
            with self.assertRaisesRegex(ValueError,'not currently allowed'):c.canvas_action('/canvas/submit',{**self.data,'confirmed':True,'type':'online_url','url':'https://example.test'})
            self.assertEqual(mock.call_count,1)
    def test_text_submission_escapes_html_and_uses_authenticated_canvas_path(self):
        with patch.object(c,'upstream',side_effect=[({'submission_types':['online_text_entry']},{}),({'workflow_state':'submitted','attempt':1},{})]) as mock:
            result=c.canvas_action('/canvas/submit',{**self.data,'confirmed':True,'type':'online_text_entry','text':'<script>hi</script>'})
            self.assertTrue(result['submitted']);self.assertEqual(mock.call_count,2)
            url,body,headers=mock.call_args.args
            self.assertEqual(url,'https://school.instructure.com/api/v1/courses/12/assignments/34/submissions')
            self.assertEqual(headers['Authorization'],'Bearer fixture-secret');self.assertNotIn('<script>',body['submission']['body'])
    def test_file_submission_uses_student_upload_preflight_then_confirmed_file_ids(self):
        pre={'upload_url':'https://bucket.s3.amazonaws.com/upload','upload_params':{'key':'fixture-key'}}
        with patch.object(c,'upstream',side_effect=[({'submission_types':['online_upload']},{}),(pre,{}),({'workflow_state':'submitted','attempt':2},{})]) as mock, patch.object(c,'file_request',return_value=(b'{"id":99}',{})) as transfer:
            result=c.canvas_action('/canvas/submit',{**self.data,'confirmed':True,'type':'online_upload','files':[{'name':'essay.txt','type':'text/plain','data':c.base64.b64encode(b'My work').decode()}]})
            self.assertTrue(result['submitted']);self.assertTrue(mock.call_args_list[1].args[0].endswith('/assignments/34/submissions/self/files'))
            self.assertEqual(mock.call_args.args[1]['submission']['file_ids'],[99]);self.assertIn(b'My work',transfer.call_args.args[3])
    def test_file_hosts_and_storage_requests_never_receive_canvas_bearer(self):
        base='https://school.instructure.com'
        for url in ['http://school.instructure.com/file','https://evil.test/file','https://school.instructure.com.evil.test/file','https://user:pass@school.instructure.com/file']:
            self.assertFalse(c.allowed_file_url(url,base))
        class Response:
            headers={}
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,n):return b'file'
        with patch.object(c.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=Response()
            c.file_request('https://bucket.s3.amazonaws.com/file',base,'fixture-secret')
            req=opener.return_value.open.call_args.args[0];self.assertIsNone(req.get_header('Authorization'))
            c.file_request(base+'/file',base,'fixture-secret')
            self.assertEqual(opener.return_value.open.call_args.args[0].get_header('Authorization'),'Bearer fixture-secret')

if __name__=='__main__':unittest.main()
