// PORCHES GADGETS STORE — Node.js 18+, no third-party packages.
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=process.env,PORT=Number(E.PORT||3000),PUBLIC=path.join(__dirname,'public');
const DATA=E.DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(DATA,{recursive:true});
const UPLOADS=path.join(DATA,'uploads');fs.mkdirSync(UPLOADS,{recursive:true});
const seed=[
{id:'phone-128',name:'Smartphone 6.5-inch 128GB',cat:'Phones',price:13999,was:16500,stock:12,icon:'📱',description:'Everyday smartphone with generous storage.'},
{id:'feature-dual',name:'Feature Phone Dual SIM',cat:'Phones',price:1499,was:1900,stock:20,icon:'☎️',description:'Simple, reliable dual-SIM feature phone.'},
{id:'earbuds',name:'Wireless Earbuds',cat:'Audio',price:1299,was:2000,stock:25,icon:'🎧',description:'Wireless audio for music and calls.'},
{id:'speaker',name:'Bluetooth Speaker',cat:'Audio',price:2199,was:2800,stock:15,icon:'🔊',description:'Portable Bluetooth speaker.'},
{id:'watch',name:'Smart Watch',cat:'Wearables',price:2499,was:3500,stock:15,icon:'⌚',description:'Smart notifications and activity tracking.'},
{id:'powerbank',name:'Power Bank 20,000mAh',cat:'Accessories',price:1850,was:2400,stock:20,icon:'🔋',description:'Portable power for compatible devices.'},
{id:'charger',name:'Fast Charger USB-C',cat:'Accessories',price:750,was:1000,stock:30,icon:'🔌',description:'Compact USB-C fast charger.'},
{id:'laptop',name:'Laptop 14-inch 8GB/256GB',cat:'Computers',price:32999,was:38000,stock:5,icon:'💻',description:'Everyday laptop for study and office work.'},
{id:'mouse',name:'Wireless Mouse',cat:'Computers',price:650,was:900,stock:25,icon:'🖱️',description:'Compact wireless mouse.'}
];
const file=n=>path.join(DATA,n+'.json');
function read(n,fallback){try{return JSON.parse(fs.readFileSync(file(n),'utf8'))}catch(e){if(e.code!=='ENOENT')console.error('Data read error',n,e.message);write(n,fallback);return fallback}}
function write(n,value){const tmp=file(n)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file(n))}
if(!fs.existsSync(file('products')))write('products',seed);
if(!fs.existsSync(file('orders')))write('orders',[]);
const send=(res,status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type.startsWith('application/json')?JSON.stringify(data):data)};
function body(req,max=100000){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>max){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const hash=s=>crypto.createHash('sha256').update(String(s)).digest();
function isAdmin(req){const expected=E.ADMIN_KEY||'';if(expected.length<16)return false;const supplied=String(req.headers['x-admin-key']||'');return crypto.timingSafeEqual(hash(supplied),hash(expected))}
function adminRequired(req,res){if((E.ADMIN_KEY||'').length<16){send(res,503,{error:'Admin is not configured. Set ADMIN_KEY (at least 16 characters) in Render Environment.'});return false}if(!isAdmin(req)){send(res,401,{error:'Incorrect admin key.'});return false}return true}
function normalizePhone(value){let p=String(value||'').replace(/[\s-]/g,'');if(p.startsWith('+'))p=p.slice(1);if(/^0[17]\d{8}$/.test(p))return '254'+p.slice(1);if(/^254[17]\d{8}$/.test(p))return p;return null}
function validProduct(p){return p&&clean(p.name,100)&&clean(p.cat,50)&&Number.isInteger(Number(p.price))&&Number(p.price)>0&&Number.isInteger(Number(p.stock))&&Number(p.stock)>=0}
function tumaReady(){return ['TUMA_API_KEY','TUMA_BUSINESS_EMAIL','PUBLIC_URL','TUMA_CALLBACK_SECRET'].every(k=>!!E[k])}
async function tumaRequest(url,options){const r=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw Error(d.message||'Tuma payment request failed (HTTP '+r.status+').');return d}
async function stkPush(order){
 const auth=await tumaRequest('https://api.tuma.co.ke/auth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:E.TUMA_BUSINESS_EMAIL,api_key:E.TUMA_API_KEY})});
 const token=auth?.data?.token;if(!token)throw Error('Tuma authentication failed. Check the business email and API key in Render.');
 const callback=E.PUBLIC_URL.replace(/\\/$/,'')+'/api/tuma/callback/'+E.TUMA_CALLBACK_SECRET;
 const result=await tumaRequest('https://api.tuma.co.ke/payment/stk-push',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({amount:order.total,phone:order.phone,callback_url:callback,description:'Payment for Porches Gadgets order '+order.id})});
 const data=result?.data;if(!data?.checkout_request_id||!data?.merchant_request_id)throw Error(result.message||'Tuma did not return payment request identifiers.');
 return {checkoutId:String(data.checkout_request_id),merchantRequestId:String(data.merchant_request_id),message:clean(data.customer_message||result.message,180)};
}
function restoreStock(order){if(order.stockRestored)return;const ps=read('products',seed);for(const line of order.items){const p=ps.find(x=>x.id===line.id);if(p)p.stock+=line.qty}write('products',ps);order.stockRestored=true}
function publicOrder(o){return {id:o.id,status:o.status,total:o.total,payment:o.pay==='mpesa'?(o.receipt?'Paid':'Tuma M-Pesa'): 'Pay on delivery',created:o.created,items:o.items.map(i=>({name:i.name,qty:i.qty,price:i.price}))}}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname,m=req.method;
  if(m==='GET'&&route==='/health')return send(res,200,{status:'ok'});
  if(m==='GET'&&route==='/api/config')return send(res,200,{storeName:'PORCHES GADGETS STORE',mpesaEnabled:tumaReady()});
  if(m==='GET'&&route==='/api/products')return send(res,200,{products:read('products',seed)});
  if(m==='GET'&&route.startsWith('/uploads/')){const name=path.basename(route.slice('/uploads/'.length));if(!/^product-[a-f0-9]+\.png$/.test(name))return send(res,404,{error:'Image not found.'});const target=path.join(UPLOADS,name);if(!fs.existsSync(target))return send(res,404,{error:'Image not found.'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(target));}
  if(m==='POST'&&route==='/api/orders'){
   const b=await body(req),customer={name:clean(b.name,100),phone:normalizePhone(b.phone),address:clean(b.address,300)};
   if(!customer.name||!customer.phone||!customer.address)return send(res,400,{error:'Enter your name, a valid Kenyan phone number and delivery address.'});
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>30)return send(res,400,{error:'Your cart is empty or invalid.'});
   const ps=read('products',seed),items=[];
   for(const line of b.items){const p=ps.find(x=>x.id===String(line.id)),qty=Number(line.qty);if(!p||!Number.isInteger(qty)||qty<1||qty>20)return send(res,400,{error:'An item or quantity in your cart is invalid.'});if(p.stock<qty)return send(res,409,{error:p.name+' has only '+p.stock+' left in stock.'});if(items.some(x=>x.id===p.id))return send(res,400,{error:'Duplicate cart item.'});items.push({id:p.id,name:p.name,price:p.price,qty})}
   const total=items.reduce((sum,x)=>sum+x.price*x.qty,0);if(!Number.isSafeInteger(total)||total<1)return send(res,400,{error:'Invalid order total.'});
   const pay=b.pay==='mpesa'?'mpesa':'cod';if(pay==='mpesa'&&!tumaReady())return send(res,503,{error:'Tuma M-Pesa is not configured. Check TUMA_API_KEY, TUMA_BUSINESS_EMAIL, PUBLIC_URL and TUMA_CALLBACK_SECRET in Render.'});
   const orders=read('orders',[]),order={id:'PG'+crypto.randomBytes(5).toString('hex').toUpperCase(),name:customer.name,phone:customer.phone,address:customer.address,items,total,pay,status:pay==='mpesa'?'Starting M-Pesa payment':'Placed — pay on delivery',created:new Date().toISOString(),stockRestored:false};
   for(const line of items)ps.find(x=>x.id===line.id).stock-=line.qty;write('products',ps);orders.unshift(order);write('orders',orders);
   if(pay==='mpesa'){try{const payment=await stkPush(order);order.checkoutId=payment.checkoutId;order.merchantRequestId=payment.merchantRequestId;order.status='Awaiting M-Pesa payment — check your phone and enter your PIN';order.paymentMessage=payment.message;write('orders',orders)}catch(e){restoreStock(order);order.status='Payment request failed';order.paymentError=clean(e.message,180);write('orders',orders);return send(res,502,{error:'Tuma could not start the M-Pesa prompt: '+clean(e.message,160)+' You have not been charged. Please retry or choose pay on delivery.'})}}
   return send(res,201,{id:order.id,status:order.status,total:order.total});
  }
  if(m==='POST'&&route.startsWith('/api/tuma/callback/')){
   if(!E.TUMA_CALLBACK_SECRET||route!=='/api/tuma/callback/'+E.TUMA_CALLBACK_SECRET)return send(res,404,{error:'Not found'});
   const cb=await body(req),orders=read('orders',[]),o=orders.find(x=>x.checkoutId===String(cb.checkout_request_id||''));
   if(o&&o.status.startsWith('Awaiting M-Pesa')&&String(cb.merchant_request_id||'')===o.merchantRequestId){
    const success=String(cb.status||'').toLowerCase()==='completed'&&Number(cb.result_code)===0&&Number(cb.amount)===o.total&&!!clean(cb.mpesa_receipt_number,30);
    if(success){o.status='Paid';o.receipt=clean(cb.mpesa_receipt_number,30);o.paidAt=new Date().toISOString()}
    else if(String(cb.status||'').toLowerCase()==='failed'||Number(cb.result_code)!==0){o.status='Payment failed';restoreStock(o)}
    write('orders',orders);
   }
   return send(res,200,{success:true,message:'Callback received'});
  }
  if(m==='GET'&&route.startsWith('/api/orders/')){
   const id=clean(decodeURIComponent(route.slice('/api/orders/'.length)),40),o=read('orders',[]).find(x=>x.id===id);
   return o?send(res,200,publicOrder(o)):send(res,404,{error:'Order not found. Check the order number.'});
  }
  if(route.startsWith('/api/admin/')){
   if(!adminRequired(req,res))return;
   if(m==='GET'&&route==='/api/admin/products')return send(res,200,{products:read('products',seed)});
   if(m==='GET'&&route==='/api/admin/orders')return send(res,200,{orders:read('orders',[])});
   if(m==='POST'&&route==='/api/admin/upload-image'){
    if(!E.REMOVE_BG_API_KEY||E.REMOVE_BG_API_KEY.trim().length<10)return send(res,503,{error:'Background removal is not configured. In Render, open this service → Environment and add REMOVE_BG_API_KEY with your remove.bg API key, then redeploy.'});
    const b=await body(req,8*1024*1024),match=String(b.data||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if(!match)return send(res,400,{error:'Choose a PNG, JPG or WebP product photo.'});
    const input=Buffer.from(match[2],'base64');if(!input.length||input.length>5*1024*1024)return send(res,413,{error:'Product photo must be 5 MB or smaller.'});
    const form=new FormData();form.append('image_file',new Blob([input],{type:match[1]}),'product-upload');form.append('size','auto');
    let response;try{response=await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':E.REMOVE_BG_API_KEY.trim()},body:form,signal:AbortSignal.timeout(60000)})}catch(e){console.error('remove.bg connection error:',e.message);return send(res,502,{error:'Could not reach remove.bg. Check the Render service network and try again.'})}
    if(!response.ok){const detail=(await response.text()).slice(0,500);console.error('remove.bg error',response.status,detail);let reason='remove.bg rejected the request.';try{const parsed=JSON.parse(detail);reason=parsed.errors?.map(x=>x.title||x.detail).filter(Boolean).join(' ')||parsed.error||reason}catch{};if(response.status===401||response.status===403)reason='The remove.bg API key is invalid or inactive.';else if(response.status===402)reason='The remove.bg account has no remaining credits or requires a paid plan.';else if(response.status===429)reason='The remove.bg rate limit was reached. Wait and try again.';return send(res,502,{error:'Background removal failed: '+reason+' (remove.bg HTTP '+response.status+').'})}
    const output=Buffer.from(await response.arrayBuffer());if(!output.length)return send(res,502,{error:'remove.bg returned an empty image. Try another photo.'});
    const name='product-'+crypto.randomBytes(12).toString('hex')+'.png';fs.writeFileSync(path.join(UPLOADS,name),output,{mode:0o644});return send(res,201,{image:'/uploads/'+name});
   }
   if(m==='POST'&&route==='/api/admin/products'){
    const b=await body(req);if(!validProduct(b))return send(res,400,{error:'Enter a product name, category, valid whole-number price and stock.'});
    const ps=read('products',seed),p={id:'item-'+crypto.randomBytes(6).toString('hex'),name:clean(b.name,100),cat:clean(b.cat,50),price:Number(b.price),was:Number(b.was)||0,stock:Number(b.stock),icon:clean(b.icon||'📦',8),description:clean(b.description,300),image:clean(b.image,200)};ps.unshift(p);write('products',ps);return send(res,201,{product:p});
   }
   if(route.startsWith('/api/admin/products/')){
    const id=decodeURIComponent(route.slice('/api/admin/products/'.length)),ps=read('products',seed),i=ps.findIndex(p=>p.id===id);
    if(i<0)return send(res,404,{error:'Product not found.'});
    if(m==='DELETE'){ps.splice(i,1);write('products',ps);return send(res,200,{ok:true})}
    if(m==='PUT'){const b=await body(req);if(!validProduct(b))return send(res,400,{error:'Invalid product details.'});ps[i]={...ps[i],name:clean(b.name,100),cat:clean(b.cat,50),price:Number(b.price),was:Number(b.was)||0,stock:Number(b.stock),icon:clean(b.icon||'📦',8),description:clean(b.description,300),image:clean(b.image,200)};write('products',ps);return send(res,200,{product:ps[i]})}
   }
   if(route.startsWith('/api/admin/orders/')){
    const id=decodeURIComponent(route.slice('/api/admin/orders/'.length)),orders=read('orders',[]),o=orders.find(x=>x.id===id);
    if(!o)return send(res,404,{error:'Order not found.'});
    if(m==='PATCH'){const b=await body(req),allowed=['Confirmed','Processing','Shipped','Delivered','Cancelled'];if(!allowed.includes(b.status))return send(res,400,{error:'Invalid order status.'});if(o.status==='Starting M-Pesa payment'||o.status.startsWith('Awaiting M-Pesa'))return send(res,409,{error:'This order is waiting for Tuma payment confirmation. Do not change its status yet.'});if(o.status==='Payment failed'||o.status==='Cancelled')return send(res,409,{error:'This order is in a final state and cannot be changed.'});if(o.status==='Paid'&&b.status==='Cancelled')return send(res,409,{error:'A paid order cannot be cancelled here. Handle the refund separately first.'});if(b.status==='Cancelled'&&!o.stockRestored)restoreStock(o);o.status=b.status;write('orders',orders);return send(res,200,{order:o})}
   }
  }
  if(m==='GET'&&(route==='/'||route==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(PUBLIC,'index.html')))}
  return send(res,404,{error:'Not found'});
 }catch(e){console.error('Request failed:',e);return send(res,500,{error:'Something went wrong. Please try again.'})}
});
server.listen(PORT,'0.0.0.0',()=>console.log('Porches Gadgets Store listening on '+PORT));
