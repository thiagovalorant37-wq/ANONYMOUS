const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const DATA_FILE = path.join(__dirname, 'data', 'database.json');
const sessions = new Map();
let writeQueue = Promise.resolve();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readDb(){ return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db){
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}
function mutate(fn){
  const job = writeQueue.then(()=>{
    const db = readDb();
    const result = fn(db);
    writeDb(db);
    return result;
  });
  writeQueue = job.catch(()=>{});
  return job;
}
function id(prefix){ return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function clean(v,max=200){ return String(v ?? '').trim().slice(0,max); }
function requireFields(obj, fields){
  for(const f of fields){ if(!clean(obj[f])) return `Campo obrigatório: ${f}`; }
  return null;
}
function auth(req,res,next){
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  const exp = sessions.get(token);
  if(!token || !exp || exp < Date.now()) return res.status(401).json({error:'Sessão administrativa inválida ou expirada.'});
  next();
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}

app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.get('/api/stock', (_req,res)=>res.json({stock:readDb().stock}));

app.post('/api/recruitment', async (req,res)=>{
  const err=requireFields(req.body,['nome','passaporte','discordUser','discordId','motivo']);
  const idade=Number(req.body.idade);
  if(err) return res.status(400).json({error:err});
  if(!Number.isInteger(idade) || idade<13 || idade>99) return res.status(400).json({error:'Idade OOC inválida.'});
  const item={id:id('req'),nome:clean(req.body.nome,80),passaporte:clean(req.body.passaporte,30),discordUser:clean(req.body.discordUser,80),discordId:clean(req.body.discordId,30),idade,motivo:clean(req.body.motivo,1500),status:'pendente',createdAt:Date.now()};
  await mutate(db=>db.recruitment.push(item));
  res.status(201).json({ok:true,id:item.id});
});

app.post('/api/orders', async (req,res)=>{
  const err=requireFields(req.body,['itemId','nome','discord']);
  const qtd=Number(req.body.quantidade);
  if(err) return res.status(400).json({error:err});
  if(!Number.isInteger(qtd) || qtd<1 || qtd>999) return res.status(400).json({error:'Quantidade inválida.'});
  try{
    const order = await mutate(db=>{
      const item=db.stock[clean(req.body.itemId,100)];
      if(!item) { const e=new Error('Item não encontrado.'); e.code=400; throw e; }
      if(!item.infinite){
        if(qtd>Number(item.quantity||0)){ const e=new Error(`Estoque insuficiente. Disponível: ${Number(item.quantity||0)}.`); e.code=409; throw e; }
        item.quantity -= qtd;
      }
      const order={id:id('order'),item:item.name,itemId:clean(req.body.itemId,100),precoUnitario:item.price,quantidade:qtd,nome:clean(req.body.nome,80),discord:clean(req.body.discord,80),status:'pendente',createdAt:Date.now()};
      db.orders.push(order); return order;
    });
    res.status(201).json({ok:true,id:order.id});
  }catch(e){ res.status(e.code||500).json({error:e.message||'Erro ao registrar encomenda.'}); }
});

app.post('/api/admin/login',(req,res)=>{
  if(!safeEqual(clean(req.body.password,200),ADMIN_PASSWORD)) return res.status(401).json({error:'Senha incorreta.'});
  const token=crypto.randomBytes(32).toString('hex');
  sessions.set(token,Date.now()+8*60*60*1000);
  res.json({token,expiresIn:28800});
});
app.get('/api/admin/me',auth,(_req,res)=>res.json({ok:true}));
app.get('/api/admin/recruitment',auth,(_req,res)=>{
  const items=[...readDb().recruitment].sort((a,b)=>b.createdAt-a.createdAt); res.json({items});
});
app.patch('/api/admin/recruitment/:id',auth,async(req,res)=>{
  const status=clean(req.body.status,20);
  if(!['pendente','aprovado','recusado'].includes(status)) return res.status(400).json({error:'Status inválido.'});
  const ok=await mutate(db=>{ const x=db.recruitment.find(v=>v.id===req.params.id); if(!x)return false; x.status=status; return true; });
  if(!ok)return res.status(404).json({error:'Solicitação não encontrada.'}); res.json({ok:true});
});
app.get('/api/admin/orders',auth,(_req,res)=>{
  const items=[...readDb().orders].sort((a,b)=>b.createdAt-a.createdAt); res.json({items});
});
app.patch('/api/admin/orders/:id',auth,async(req,res)=>{
  const status=clean(req.body.status,20);
  if(!['pendente','entregue'].includes(status)) return res.status(400).json({error:'Status inválido.'});
  const ok=await mutate(db=>{ const x=db.orders.find(v=>v.id===req.params.id); if(!x)return false; x.status=status; return true; });
  if(!ok)return res.status(404).json({error:'Encomenda não encontrada.'}); res.json({ok:true});
});
app.patch('/api/admin/stock/:id',auth,async(req,res)=>{
  try{
    const item=await mutate(db=>{
      const x=db.stock[req.params.id]; if(!x){const e=new Error('Item não encontrado.');e.code=404;throw e;}
      if(x.infinite){const e=new Error('Este item possui estoque infinito.');e.code=400;throw e;}
      if(req.body.quantity !== undefined){
        const q=Number(req.body.quantity); if(!Number.isInteger(q)||q<0||q>100000000){const e=new Error('Quantidade inválida.');e.code=400;throw e;} x.quantity=q;
      }else if(req.body.delta !== undefined){
        const d=Number(req.body.delta); if(!Number.isInteger(d)||Math.abs(d)>1000000){const e=new Error('Ajuste inválido.');e.code=400;throw e;} x.quantity=Math.max(0,Number(x.quantity||0)+d);
      }else {const e=new Error('Informe quantity ou delta.');e.code=400;throw e;}
      return x;
    });
    res.json({ok:true,item});
  }catch(e){res.status(e.code||500).json({error:e.message});}
});

app.get('/admin', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/admin.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/admin/tickets.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','tickets.html')));
app.get('/admin/recrutamentos.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','recrutamentos.html')));
app.get('/admin/encomendas.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','encomendas.html')));
app.get('/admin/estoque.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','estoque.html')));
app.get('/admin/configuracoes.html', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','configuracoes.html')));
app.get('/admin/recrutamentos', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','recrutamentos.html')));
app.get('/admin/encomendas', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','encomendas.html')));
app.get('/admin/estoque', (_req,res)=>res.sendFile(path.join(__dirname,'public','admin','estoque.html')));
app.use('/api',(_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
app.use((_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Complexo RP rodando na porta ${PORT}`));
