import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
export async function testServer({root=process.cwd(),sdkRoot=path.resolve('node_modules'),legacyRoot=process.env.V10_SOURCE_ROOT}={}){
 const imports={};for(const name of ['@firebase/app','@firebase/firestore','@firebase/util','@firebase/component','@firebase/logger','@firebase/webchannel-wrapper','idb','re2js']){
  const file=path.join(sdkRoot,name,'package.json');if(!fs.existsSync(file))continue;const p=JSON.parse(fs.readFileSync(file)),entry=p.module;if(entry)imports[name]='/vendor/'+name+'/'+entry.replace(/^\.\//,'');
 }
 for(const name of ['bloom','webchannel']){const file='@firebase/webchannel-wrapper/dist/'+name+'-blob/esm/'+name+'_blob_es2018.js';if(fs.existsSync(path.join(sdkRoot,file)))imports['@firebase/webchannel-wrapper/'+name+'-blob']='/vendor/'+file;}
 const raw=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');const html=raw.replace('</head>','<script type="importmap">'+JSON.stringify({imports})+'</script></head>');
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}let base=root,relative=u.pathname;if(relative.startsWith('/vendor/')){base=sdkRoot;relative=relative.slice(7)}else if(relative.startsWith('/legacy10/')&&legacyRoot){base=legacyRoot;relative=relative.slice(9)}const file=path.resolve(base,'.'+relative);if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403);res.end();return}try{res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};
}
