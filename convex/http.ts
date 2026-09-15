import {httpRouter} from 'convex/server';
import {httpAction} from './_generated/server';
import {createHandler} from '../lib/backend';
import {convexRuntime} from './runtime';
import {serveStatic} from '../lib/convex-static';
import {bridgeRequest} from '../lib/convex-bridge';
const http=httpRouter();
const api=httpAction((ctx,request)=>process.env.BACKEND_MODE==='convex'
  ?createHandler(convexRuntime(ctx))(request)
  :bridgeRequest(request));
for(const method of ['GET','POST','PUT','DELETE','OPTIONS'] as const)http.route({pathPrefix:'/api/',method,handler:api});
const website=httpAction(async(_,request)=>serveStatic(request));
http.route({pathPrefix:'/',method:'GET',handler:website});
export default http;
