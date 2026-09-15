import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('convex-web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json'};
const assets={};let total=0;
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 const file=resolve(dir,entry.name);if(entry.isDirectory()){await walk(file);continue}
 const data=await readFile(file);if(data.length>18*1024*1024)throw new Error('Static asset exceeds Convex HTTP response limit');
 total+=data.length;assets['/'+relative(root,file).split('\\').join('/')]={body:data.toString('base64'),type:types[extname(file)]||'application/octet-stream',etag:'"'+createHash('sha256').update(data).digest('hex')+'"'};
}}
await walk(root);
// Leave room under the 32 MiB function bundle limit for backend code and dependencies.
if(total>12*1024*1024)throw new Error('Static bundle is too large to embed in Convex; use separate asset hosting');
await writeFile('lib/convex-web-assets.js','// Generated frontend assets. Do not edit.\nexport const assets = '+JSON.stringify(assets)+';\n');
console.log(`Packaged ${Object.keys(assets).length} public assets (${(total/1048576).toFixed(2)} MiB) for convex.site`);
