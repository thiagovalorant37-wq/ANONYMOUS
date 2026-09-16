(function(){
  const API = '/api';
  let adminToken = localStorage.getItem('anonymous_admin_token') || '';
  let currentOrderItem = null;
  const stockMeta = {};

  const orderButtons = Array.from(document.querySelectorAll('.order-btn'));
  orderButtons.forEach(btn => {
    const id = btn.dataset.id;
    stockMeta[id] = {
      name: btn.dataset.item,
      price: btn.dataset.price,
      infinite: btn.dataset.stock === 'inf'
    };
  });

  function showToast(msg, isError=false){
    const t = document.getElementById('toast');
    document.getElementById('toastText').textContent = msg;
    t.style.borderColor = isError ? 'rgba(255,48,32,0.5)' : '';
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(()=> t.classList.remove('show'), 3200);
  }
  function openOverlay(el){ el.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeOverlay(el){ el.classList.remove('open'); document.body.style.overflow=''; }
  function fmt(n){ return Number(n||0).toLocaleString('pt-BR'); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }

  async function api(path, options={}){
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if(adminToken) headers.Authorization = 'Bearer ' + adminToken;
    const res = await fetch(API + path, {...options, headers});
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      const err = new Error(data.error || 'Erro na requisição');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function renderStockOnPage(id, data){
    const btn = document.querySelector('.order-btn[data-id="'+CSS.escape(id)+'"]');
    if(!btn) return;
    const item = btn.closest('.item');
    const stockSpan = item.querySelector('.item-stock');
    const numSpan = item.querySelector('.stock-num');
    if(data.infinite){
      numSpan.textContent = 'Infinito';
      stockSpan.classList.remove('zero'); item.classList.remove('out'); btn.disabled=false; btn.textContent='Encomendar';
    }else{
      const q = Number(data.quantity || 0);
      numSpan.textContent = fmt(q);
      btn.dataset.liveStock = q;
      if(q <= 0){ stockSpan.classList.add('zero'); item.classList.add('out'); btn.disabled=true; btn.textContent='Esgotado'; }
      else { stockSpan.classList.remove('zero'); item.classList.remove('out'); btn.disabled=false; btn.textContent='Encomendar'; }
    }
  }

  async function loadStock(){
    try{
      const data = await api('/stock');
      Object.entries(data.stock || {}).forEach(([id, item]) => renderStockOnPage(id, item));
      if(document.getElementById('backendContent').style.display !== 'none') renderBackendStock(data.stock || {});
    }catch(e){ console.error(e); }
  }
  loadStock();
  setInterval(loadStock, 10000);

  const recruitOverlay = document.getElementById('recruitOverlay');
  const recruitError = document.getElementById('recruitError');
  document.getElementById('openRecruitHero').addEventListener('click', ()=>openOverlay(recruitOverlay));
  document.getElementById('openRecruitSection').addEventListener('click', ()=>openOverlay(recruitOverlay));
  document.getElementById('closeRecruit').addEventListener('click', ()=>closeOverlay(recruitOverlay));
  recruitOverlay.addEventListener('click', e=>{ if(e.target===recruitOverlay) closeOverlay(recruitOverlay); });

  document.getElementById('recruitForm').addEventListener('submit', async function(e){
    e.preventDefault(); recruitError.classList.remove('show');
    const btn=document.getElementById('recruitSubmitBtn');
    const payload={
      nome:rNome.value.trim(), passaporte:rPassaporte.value.trim(), discordUser:rDiscordUser.value.trim(),
      discordId:rDiscordId.value.trim(), idade:Number(rIdade.value), motivo:rMotivo.value.trim()
    };
    btn.disabled=true; btn.textContent='Enviando...';
    try{
      await api('/recruitment',{method:'POST',body:JSON.stringify(payload)});
      this.reset(); closeOverlay(recruitOverlay); showToast('Solicitação enviada com sucesso!');
    }catch(err){ recruitError.textContent=err.message; recruitError.classList.add('show'); }
    finally{ btn.disabled=false; btn.textContent='Enviar Solicitação Oficial'; }
  });

  const orderOverlay=document.getElementById('orderOverlay');
  const orderError=document.getElementById('orderError');
  orderButtons.forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.disabled) return;
    currentOrderItem={id:btn.dataset.id,name:btn.dataset.item,price:btn.dataset.price};
    orderItemName.textContent=currentOrderItem.name; orderItemPrice.textContent=currentOrderItem.price;
    oQtd.value=1; orderError.classList.remove('show'); openOverlay(orderOverlay);
  }));
  closeOrder.addEventListener('click',()=>closeOverlay(orderOverlay));
  orderOverlay.addEventListener('click',e=>{ if(e.target===orderOverlay) closeOverlay(orderOverlay); });

  document.getElementById('orderForm').addEventListener('submit', async function(e){
    e.preventDefault(); orderError.classList.remove('show');
    const btn=document.getElementById('orderSubmitBtn');
    btn.disabled=true; btn.textContent='Enviando...';
    try{
      const payload={itemId:currentOrderItem.id,quantidade:Number(oQtd.value),nome:oNome.value.trim(),discord:oDiscord.value.trim()};
      await api('/orders',{method:'POST',body:JSON.stringify(payload)});
      this.reset(); closeOverlay(orderOverlay); showToast('Encomenda registrada com sucesso!'); await loadStock();
    }catch(err){ orderError.textContent=err.message; orderError.classList.add('show'); }
    finally{ btn.disabled=false; btn.textContent='Confirmar Encomenda'; }
  });

  const backendOverlay=document.getElementById('backendOverlay');
  const backendContent=document.getElementById('backendContent');
  const backendLogin=document.getElementById('backendLogin');
  const backendSub=document.getElementById('backendSub');
  const adminLoginError=document.getElementById('adminLoginError');

  async function verifyAdmin(){
    if(!adminToken){ showAdminLogin(); return; }
    try{
      await api('/admin/me');
      showAdminPanel();
      await refreshAdmin();
    }catch(e){ adminToken=''; localStorage.removeItem('anonymous_admin_token'); showAdminLogin(); }
  }
  function showAdminLogin(){ backendSub.textContent='Acesso restrito à liderança.'; backendLogin.style.display='block'; backendContent.style.display='none'; }
  function showAdminPanel(){
    backendSub.textContent='Estoque, recrutamento e encomendas.';
    backendLogin.style.display='none'; backendContent.style.display='block';
    if(!document.getElementById('backendLogout')){
      const bar=document.createElement('div'); bar.className='backend-topbar';
      bar.innerHTML='<button class="backend-logout" id="backendLogout">Sair</button>';
      backendContent.prepend(bar);
      bar.querySelector('button').addEventListener('click',()=>{ adminToken=''; localStorage.removeItem('anonymous_admin_token'); showAdminLogin(); });
    }
  }

  openBackend.addEventListener('click',()=>{ openOverlay(backendOverlay); verifyAdmin(); });
  closeBackend.addEventListener('click',()=>closeOverlay(backendOverlay));
  backendOverlay.addEventListener('click',e=>{ if(e.target===backendOverlay) closeOverlay(backendOverlay); });
  adminLoginBtn.addEventListener('click', loginAdmin);
  adminPassword.addEventListener('keydown',e=>{ if(e.key==='Enter') loginAdmin(); });
  async function loginAdmin(){
    adminLoginError.classList.remove('show'); adminLoginBtn.disabled=true; adminLoginBtn.textContent='Entrando...';
    try{
      const data=await api('/admin/login',{method:'POST',body:JSON.stringify({password:adminPassword.value})});
      adminToken=data.token; localStorage.setItem('anonymous_admin_token',adminToken); adminPassword.value=''; showAdminPanel(); await refreshAdmin();
    }catch(e){ adminLoginError.textContent=e.message; adminLoginError.classList.add('show'); }
    finally{ adminLoginBtn.disabled=false; adminLoginBtn.textContent='Entrar no painel'; }
  }

  document.querySelectorAll('.backend-tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.backend-tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    document.querySelectorAll('.backend-pane').forEach(p=>p.style.display='none');
    document.getElementById('pane-'+tab.dataset.tab).style.display='block';
  }));

  async function refreshAdmin(){
    try{
      const [stock,recruitment,orders] = await Promise.all([api('/stock'),api('/admin/recruitment'),api('/admin/orders')]);
      renderBackendStock(stock.stock||{}); renderRecrutamentoList(recruitment.items||[]); renderEncomendasList(orders.items||[]);
    }catch(e){ if(e.status===401) showAdminLogin(); }
  }

  function renderBackendStock(stock){
    const table=document.getElementById('estoqueTable');
    table.innerHTML=Object.entries(stock).map(([id,d])=> d.infinite
      ? `<div class="stock-row"><span class="name">${esc(d.name)}</span><span class="inf-tag">Infinito</span></div>`
      : `<div class="stock-row"><span class="name">${esc(d.name)}</span><div class="qty-controls"><button class="qty-btn" data-delta="-10" data-id="${esc(id)}">-10</button><button class="qty-btn" data-delta="-1" data-id="${esc(id)}">-1</button><input type="number" min="0" class="qty-input" data-set="${esc(id)}" value="${Number(d.quantity||0)}"><button class="qty-btn" data-delta="1" data-id="${esc(id)}">+1</button><button class="qty-btn" data-delta="10" data-id="${esc(id)}">+10</button></div></div>`
    ).join('') || '<div class="empty-note">Nenhum item cadastrado.</div>';

    table.querySelectorAll('[data-delta]').forEach(b=>b.addEventListener('click',async()=>{
      try{ await api('/admin/stock/'+encodeURIComponent(b.dataset.id),{method:'PATCH',body:JSON.stringify({delta:Number(b.dataset.delta)})}); await loadStock(); await refreshAdmin(); }
      catch(e){ showToast(e.message,true); }
    }));
    table.querySelectorAll('[data-set]').forEach(inp=>inp.addEventListener('change',async()=>{
      try{ await api('/admin/stock/'+encodeURIComponent(inp.dataset.set),{method:'PATCH',body:JSON.stringify({quantity:Math.max(0,Number(inp.value)||0)})}); await loadStock(); }
      catch(e){ showToast(e.message,true); }
    }));
  }

  function renderRecrutamentoList(items){
    const list=document.getElementById('recrutamentoList');
    if(!items.length){ list.innerHTML='<div class="empty-note">Nenhuma solicitação recebida ainda.</div>'; return; }
    list.innerHTML=items.map(d=>`<div class="backend-item"><div class="row1"><span class="title">${esc(d.nome)} <span style="color:var(--muted);font-weight:400;">#${esc(d.passaporte)}</span></span><span class="status-badge ${esc(d.status)}">${esc(d.status)}</span></div><div class="meta">Discord: ${esc(d.discordUser)} (${esc(d.discordId)}) · Idade OOC: ${esc(d.idade)}</div><div class="meta" style="margin-top:6px;">${esc(d.motivo)}</div><div class="actions"><button class="approve" data-rid="${esc(d.id)}" data-status="aprovado">Aprovar</button><button class="reject" data-rid="${esc(d.id)}" data-status="recusado">Recusar</button></div></div>`).join('');
    list.querySelectorAll('[data-rid]').forEach(b=>b.addEventListener('click',async()=>{ try{ await api('/admin/recruitment/'+encodeURIComponent(b.dataset.rid),{method:'PATCH',body:JSON.stringify({status:b.dataset.status})}); await refreshAdmin(); }catch(e){showToast(e.message,true);} }));
  }

  function renderEncomendasList(items){
    const list=document.getElementById('encomendasList');
    if(!items.length){ list.innerHTML='<div class="empty-note">Nenhuma encomenda registrada ainda.</div>'; return; }
    list.innerHTML=items.map(d=>`<div class="backend-item"><div class="row1"><span class="title">${esc(d.quantidade)}x ${esc(d.item)}</span><span class="status-badge ${esc(d.status)}">${esc(d.status)}</span></div><div class="meta">Comprador: ${esc(d.nome)} · Discord: ${esc(d.discord)} · Unitário: ${esc(d.precoUnitario)}</div><div class="actions">${d.status!=='entregue'?`<button class="approve" data-oid="${esc(d.id)}" data-status="entregue">Marcar como entregue</button>`:''}</div></div>`).join('');
    list.querySelectorAll('[data-oid]').forEach(b=>b.addEventListener('click',async()=>{ try{ await api('/admin/orders/'+encodeURIComponent(b.dataset.oid),{method:'PATCH',body:JSON.stringify({status:b.dataset.status})}); await refreshAdmin(); }catch(e){showToast(e.message,true);} }));
  }

  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeOverlay(recruitOverlay); closeOverlay(orderOverlay); closeOverlay(backendOverlay); } });
})();
