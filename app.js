const STORAGE_KEY = 'minhas-contas-v1';
const INITIAL_ACCOUNTS = [
  ['Mercado Pago',7999.08],['Nubank',12999.04],['Sicredi',17679.02],['Meu Tudo Consignado',9694.38],
  ['Infinity Pay',420],['Cresol',6848.37],['Pai',2000],['Jair',6000]
].map(([name, original], i) => ({ id: crypto.randomUUID?.() || `acc-${i}-${Date.now()}`, name, original, payments: [] }));

const fmt = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const $ = s => document.querySelector(s);
const els = {
  totalRemaining:$('#totalRemaining'), totalOriginal:$('#totalOriginal'), totalPaid:$('#totalPaid'), paidPercent:$('#paidPercent'),
  accountCount:$('#accountCount'), accountsList:$('#accountsList'), paymentsList:$('#paymentsList'),
  paymentDialog:$('#paymentDialog'), paymentForm:$('#paymentForm'), paymentAccount:$('#paymentAccount'), paymentAmount:$('#paymentAmount'), paymentDate:$('#paymentDate'), paymentNote:$('#paymentNote'),
  accountDialog:$('#accountDialog'), accountForm:$('#accountForm'), accountName:$('#accountName'), accountAmount:$('#accountAmount'), backupDialog:$('#backupDialog')
};

let state = loadState();
function loadState(){
  try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch{}
  return { accounts: INITIAL_ACCOUNTS };
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); render(); }
function paid(account){ return account.payments.reduce((s,p)=>s+Number(p.amount||0),0); }
function remaining(account){ return Math.max(0, Number(account.original)-paid(account)); }
function totals(){
  const original=state.accounts.reduce((s,a)=>s+Number(a.original),0);
  const totalPaid=state.accounts.reduce((s,a)=>s+paid(a),0);
  return {original,totalPaid,remaining:Math.max(0,original-totalPaid)};
}
function initials(name){ return name.split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase(); }
function esc(v=''){ return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function dateBR(v){ if(!v) return ''; const [y,m,d]=v.split('-'); return `${d}/${m}/${y}`; }

function render(){
  const t=totals();
  els.totalRemaining.textContent=fmt.format(t.remaining);
  els.totalOriginal.textContent=`Original: ${fmt.format(t.original)}`;
  els.totalPaid.textContent=fmt.format(t.totalPaid);
  els.paidPercent.textContent=t.original?`${Math.min(100,(t.totalPaid/t.original*100)).toFixed(1)}%`:'0%';
  els.accountCount.textContent=`${state.accounts.length} ${state.accounts.length===1?'conta':'contas'}`;

  els.paymentAccount.innerHTML=state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${fmt.format(remaining(a))}</option>`).join('');

  els.accountsList.innerHTML = state.accounts.length ? state.accounts.map(a=>{
    const p=paid(a), r=remaining(a), pct=a.original?Math.min(100,(p/a.original)*100):0;
    return `<article class="account-card">
      <div class="account-top">
        <div class="account-name"><div class="avatar">${esc(initials(a.name))}</div><div><h3>${esc(a.name)}</h3><small>Inicial: ${fmt.format(a.original)}</small></div></div>
        <div class="account-balance"><small>Restante</small><strong>${fmt.format(r)}</strong></div>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="account-actions">
        <span class="paid-info">Pago: ${fmt.format(p)} • ${pct.toFixed(1)}%</span>
        <div class="mini-actions"><button class="mini-btn" data-pay="${a.id}">+ Pagamento</button><button class="mini-btn danger" data-delete-account="${a.id}">Excluir</button></div>
      </div>
    </article>`;
  }).join('') : '<div class="empty">Nenhuma conta cadastrada.</div>';

  const allPayments=state.accounts.flatMap(a=>a.payments.map(p=>({...p,accountId:a.id,accountName:a.name}))).sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  els.paymentsList.innerHTML = allPayments.length ? allPayments.slice(0,20).map(p=>`<div class="payment-row">
    <div class="payment-meta"><strong>${esc(p.accountName)}</strong><small>${dateBR(p.date)}${p.note?' • '+esc(p.note):''}</small></div>
    <div class="payment-value"><strong>- ${fmt.format(p.amount)}</strong><button data-delete-payment="${p.accountId}|${p.id}">Excluir</button></div>
  </div>`).join('') : '<div class="empty">Nenhum pagamento lançado ainda.</div>';
}

function openPayment(accountId){
  if(!state.accounts.length){ alert('Cadastre uma conta primeiro.'); return; }
  els.paymentForm.reset();
  els.paymentDate.value=new Date().toISOString().slice(0,10);
  if(accountId) els.paymentAccount.value=accountId;
  els.paymentDialog.showModal();
}

$('#fab').addEventListener('click',()=>openPayment());
$('#addAccountBtn').addEventListener('click',()=>{ els.accountForm.reset(); els.accountDialog.showModal(); });
$('#backupBtn').addEventListener('click',()=>els.backupDialog.showModal());
document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close]'); if(close) document.getElementById(close.dataset.close)?.close();
  const payBtn=e.target.closest('[data-pay]'); if(payBtn) openPayment(payBtn.dataset.pay);
  const delAcc=e.target.closest('[data-delete-account]'); if(delAcc){
    const a=state.accounts.find(x=>x.id===delAcc.dataset.deleteAccount); if(a && confirm(`Excluir ${a.name} e todo o histórico dela?`)){ state.accounts=state.accounts.filter(x=>x.id!==a.id); save(); }
  }
  const delPay=e.target.closest('[data-delete-payment]'); if(delPay){
    const [aid,pid]=delPay.dataset.deletePayment.split('|'); const a=state.accounts.find(x=>x.id===aid); if(a && confirm('Excluir este pagamento?')){ a.payments=a.payments.filter(p=>p.id!==pid); save(); }
  }
});

els.paymentForm.addEventListener('submit',e=>{
  e.preventDefault();
  const a=state.accounts.find(x=>x.id===els.paymentAccount.value); const amount=Number(els.paymentAmount.value);
  if(!a || !amount || amount<=0) return;
  const r=remaining(a);
  if(amount>r+0.001 && !confirm(`O pagamento é maior que o saldo restante (${fmt.format(r)}). Registrar mesmo assim?`)) return;
  a.payments.push({id:crypto.randomUUID?.()||String(Date.now()),amount,date:els.paymentDate.value,note:els.paymentNote.value.trim(),createdAt:Date.now()});
  save(); els.paymentDialog.close();
});

els.accountForm.addEventListener('submit',e=>{
  e.preventDefault(); const name=els.accountName.value.trim(), original=Number(els.accountAmount.value); if(!name||original<=0) return;
  state.accounts.push({id:crypto.randomUUID?.()||String(Date.now()),name,original,payments:[]}); save(); els.accountDialog.close();
});

$('#clearPaymentsBtn').addEventListener('click',()=>{
  if(confirm('Limpar todos os pagamentos lançados? Os valores originais das contas serão mantidos.')){ state.accounts.forEach(a=>a.payments=[]); save(); }
});

$('#exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`minhas-contas-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
});
$('#importInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{ const data=JSON.parse(await file.text()); if(!Array.isArray(data.accounts)) throw new Error(); state=data; save(); els.backupDialog.close(); alert('Backup importado com sucesso.'); }catch{ alert('Arquivo de backup inválido.'); }
  e.target.value='';
});

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
render();
