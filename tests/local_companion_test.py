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

if __name__=='__main__':unittest.main()
