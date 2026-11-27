// Social Hub server. Requires Node.js 18+. No packages to install.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const { ZERNIO_API_KEY, ADMIN_PASSWORD } = process.env;
const API = process.env.ZERNIO_BASE || 'https://zernio.com/api/v1';
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
if (!ZERNIO_API_KEY || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) console.warn('Posting is OFF: set ZERNIO_API_KEY and ADMIN_PASSWORD (10+ characters).');
const send = (res, code, data) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
let fails=0, lockedUntil=0;
const hash=s=>crypto.createHash('sha256').update(String(s)).digest();
function authorised(req,res){
  if(!ZERNIO_API_KEY||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<10){send(res,503,{error:'Posting is not set up yet. Check environment variables.'});return false;}
  if(Date.now()<lockedUntil){send(res,429,{error:'Too many attempts. Wait 15 minutes.'});return false;}
  if(!crypto.timingSafeEqual(hash(req.headers['x-password']||''),hash(ADMIN_PASSWORD))){if(++fails>=8){lockedUntil=Date.now()+15*60*1000;fails=0;}send(res,401,{error:'Wrong password.'});return false;}
  fails=0;return true;
}
function readJson(req){return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>100000)req.destroy();});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('Bad request'));}});});}
async function zernio(endpoint,body){const r=await fetch(API+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${ZERNIO_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||data.message||`Posting service error ${r.status}`);return data;}
http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0];
  try{
    if(req.method==='GET'&&url==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
    if(req.method==='GET'&&(url==='/'||url==='/config.js')){const file=url==='/'?'index.html':'config.js';const type=url==='/'?'text/html':'text/javascript';res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(fs.readFileSync(path.join(PUBLIC,file)));}
    if(url.startsWith('/api/')){
      if(!authorised(req,res))return;
      if(req.method==='GET'&&url==='/api/accounts'){const data=await zernio('/accounts');return send(res,200,{accounts:(data.accounts||[]).map(a=>({id:a._id,platform:a.platform,name:a.username||a.displayName||''}))});}
      if(req.method==='POST'&&url==='/api/upload'){const {filename,contentType}=await readJson(req);return send(res,200,await zernio('/media/presign',{filename,contentType}));}
      if(req.method==='POST'&&url==='/api/post'){
        const {content,platforms,media,tiktokConsent}=await readJson(req);
        if(!Array.isArray(platforms)||!platforms.length)return send(res,400,{error:'Pick at least one account.'});
        if(!content&&!media)return send(res,400,{error:'Write something or add a photo/video.'});
        const body={content:content||'',platforms,publishNow:true};if(media)body.mediaItems=[media];
        if(platforms.some(p=>p.platform==='tiktok')){if(!media)return send(res,400,{error:'TikTok needs a photo or video.'});if(!tiktokConsent)return send(res,400,{error:'Tick the TikTok confirmation box.'});body.tiktokSettings={privacy_level:'PUBLIC_TO_EVERYONE',allow_comment:true,allow_duet:true,allow_stitch:true,content_preview_confirmed:true,express_consent_given:true};}
        return send(res,200,await zernio('/posts',body));
      }
    }
    send(res,404,{error:'Not found'});
  }catch(e){send(res,500,{error:e.message});}
}).listen(PORT,'0.0.0.0',()=>console.log('Social Hub listening on port '+PORT));
