// PORCHES GADGETS STORE — Node.js 18+
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=Number(process.env.PORT||3000),PUBLIC=path.join(__dirname,'public'),DATA=process.env.DATA_DIR||path.join(__dirname,'data'),ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
fs.mkdirSync(DATA,{recursive:true});
const seed=[
{id:'p-iphone-13',name:'iPhone 13',category:'Phones',price:69999,oldPrice:75999,stock:5,featured:true,description:'128GB storage, Super Retina XDR display and dual-camera system.',image:'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=900&q=85'},
{id:'p-samsung-a55',name:'Samsung Galaxy A55',category:'Phones',price:44999,oldPrice:49999,stock:8,featured:true,description:'Bright AMOLED display, versatile cameras and all-day battery.',image:'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=85'},
{id:'p-hp-laptop',name:'HP 15 Laptop',category:'Laptops',price:58999,oldPrice:64999,stock:4,featured:true,description:'Reliable everyday laptop for work, study and browsing.',image:'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85'},
{id:'p-earbuds',name:'Wireless Earbuds Pro',category:'Audio',price:4999,oldPrice:6499,stock:15,featured:true,description:'Compact wireless earbuds with charging case and clear sound.',image:'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85'},
{id:'p-watch',name:'Smart Watch Series',category:'Wearables',price:6999,oldPrice:8999,stock:12,featured:false,description:'Fitness tracking, notifications and multiple watch faces.',image:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85'},
{id:'p-speaker',name:'Portable Bluetooth Speaker',category:'Audio',price:3499,oldPrice:4299,stock:10,featured:false,description:'Portable speaker for music at home or on the move.',image:'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85'},
{id:'p-powerbank',name:'20,000mAh Power Bank',category:'Accessories',price:2999,oldPrice:3599,stock:20,featured:false,description:'High-capacity portable charging for compatible devices.',image:'https://images.unsplash.com/photo-1609592424824-0f2b4e3f5a2a?auto=format&fit=crop&w=900&q=85'},
{id:'p-keyboard',name:'Wireless Keyboard & Mouse',category:'Accessories',price:2499,oldPrice:2999,stock:9,featured:false,description:'Comfortable wireless keyboard and mouse combo.',image:'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85'}];
const fp=n=>path.join(DATA,n+'.json');
function load(n,f){try{return JSON.parse(fs.readFileSync(fp(n),'utf8'))}catch{fs.writeFileSync(fp(n),JSON.stringify(f,null,2));return f}}
function save(n,v){fs.writeFileSync(fp(n),JSON.stringify(v,null,2))}
if(!fs.existsSync(fp('products')))save('products',seed);if(!fs.existsSync(fp('orders')))save('orders',[]);
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>100000){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
const hash=s=>crypto.createHash('sha256').update(String(s)).digest(),clean=(v,n=500)=>String(v??'').trim().slice(0,n);
function admin(req,res){if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<10){send(res,503,{error:'Set ADMIN_PASSWORD (at least 10 characters) in Northflank.'});return false}if(!crypto.timingSafeEqual(hash(req.headers['x-admin-password']||''),hash(ADMIN_PASSWORD))){send(res,401,{error:'Incorrect admin password.'});return false}return true}
function valid(p){return p&&clean(p.name,100)&&clean(p.category,50)&&Number(p.price)>0&&Number.isFinite(Number(p.price))&&Number.isInteger(Number(p.stock))&&Number(p.stock)>=0}
http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost').pathname;try{
if(req.method==='GET'&&u==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')}
if(req.method==='GET'&&u==='/api/products')return send(res,200,{products:load('products',seed)});
if(req.method==='POST'&&u==='/api/orders'){
const b=await body(req),c={name:clean(b.customer?.name,100),phone:clean(b.customer?.phone,30),email:clean(b.customer?.email,120),county:clean(b.customer?.county,80),address:clean(b.customer?.address,300),payment:clean(b.customer?.payment,60),note:clean(b.customer?.note,500)};
if(!c.name||!c.phone||!c.county||!c.address)return send(res,400,{error:'Complete your name, phone, county and delivery address.'});
if(!Array.isArray(b.items)||!b.items.length||b.items.length>30)return send(res,400,{error:'Your cart is empty or invalid.'});
const ps=load('products',seed),items=[];for(const x of b.items){const p=ps.find(z=>z.id===clean(x.id,80)),q=Number(x.quantity);if(!p||!Number.isInteger(q)||q<1||q>20||p.stock<q)return send(res,400,{error:'A product is unavailable or stock has changed. Refresh your cart.'});items.push({id:p.id,name:p.name,price:p.price,quantity:q,lineTotal:p.price*q})}
const total=items.reduce((a,x)=>a+x.lineTotal,0),orders=load('orders',[]),o={id:'PG-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase(),createdAt:new Date().toISOString(),status:'New',customer:c,items,total};
orders.unshift(o);save('orders',orders);items.forEach(x=>{ps.find(p=>p.id===x.id).stock-=x.quantity});save('products',ps);return send(res,201,{order:{id:o.id,total,status:o.status}})
}
if(u.startsWith('/api/admin/')){if(!admin(req,res))return;
if(req.method==='GET'&&u==='/api/admin/products')return send(res,200,{products:load('products',seed)});
if(req.method==='GET'&&u==='/api/admin/orders')return send(res,200,{orders:load('orders',[])});
if(req.method==='POST'&&u==='/api/admin/products'){const p=await body(req);if(!valid(p))return send(res,400,{error:'Enter a name, category, valid price and stock.'});const ps=load('products',seed),x={id:'p-'+crypto.randomBytes(7).toString('hex'),name:clean(p.name,100),category:clean(p.category,50),price:Number(p.price),oldPrice:Number(p.oldPrice)||0,stock:Number(p.stock),featured:!!p.featured,description:clean(p.description,500),image:clean(p.image,1000)};ps.unshift(x);save('products',ps);return send(res,201,{product:x})}
if(req.method==='PUT'&&u.startsWith('/api/admin/products/')){const id=decodeURIComponent(u.split('/').pop()),p=await body(req);if(!valid(p))return send(res,400,{error:'Invalid product details.'});const ps=load('products',seed),i=ps.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'Product not found.'});ps[i]={...ps[i],name:clean(p.name,100),category:clean(p.category,50),price:Number(p.price),oldPrice:Number(p.oldPrice)||0,stock:Number(p.stock),featured:!!p.featured,description:clean(p.description,500),image:clean(p.image,1000)};save('products',ps);return send(res,200,{product:ps[i]})}
if(req.method==='DELETE'&&u.startsWith('/api/admin/products/')){const id=decodeURIComponent(u.split('/').pop()),ps=load('products',seed),next=ps.filter(x=>x.id!==id);if(next.length===ps.length)return send(res,404,{error:'Product not found.'});save('products',next);return send(res,200,{ok:true})}
if(req.method==='PATCH'&&u.startsWith('/api/admin/orders/')){const id=decodeURIComponent(u.split('/').pop()),b=await body(req),allowed=['New','Confirmed','Processing','Dispatched','Delivered','Cancelled'],os=load('orders',[]),o=os.find(x=>x.id===id);if(!allowed.includes(b.status))return send(res,400,{error:'Invalid status.'});if(!o)return send(res,404,{error:'Order not found.'});o.status=b.status;save('orders',os);return send(res,200,{order:o})}
}
if(req.method==='GET'&&(u==='/'||u==='/config.js')){const name=u==='/'?'index.html':'config.js',type=u==='/'?'text/html':'text/javascript';res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(fs.readFileSync(path.join(PUBLIC,name)))}
send(res,404,{error:'Not found'});
}catch(e){console.error(e);send(res,500,{error:'Server error. Please try again.'})}
}).listen(PORT,'0.0.0.0',()=>console.log('Porches Gadgets Store listening on '+PORT));
