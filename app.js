import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.mjs";

const firebaseConfig = {
  apiKey: "AIzaSyBDOR9f748UNoGP5c72Y-vdmDBcffM8tMI",
  authDomain: "rm-contas.firebaseapp.com",
  databaseURL: "https://rm-contas-default-rtdb.firebaseio.com",
  projectId: "rm-contas",
  storageBucket: "rm-contas.firebasestorage.app",
  messagingSenderId: "414740463069",
  appId: "1:414740463069:web:f8035314dcfbf962c80a34",
  measurementId: "G-M496PJCSSX"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
let currentUser = null;
let cloudReady = false;
let unsubscribeData = null;

const STORAGE_KEY='minhas-contas-v3';
const LEGACY_KEYS=['minhas-contas-v1','minhas-contas-v2'];
const AUTH_KEY='minhas-contas-auth-v1';
const INITIAL_ACCOUNTS=[
 ['Mercado Pago',7999.08],['Nubank',12999.04],['Sicredi',17679.02],['Meu Tudo Consignado',9694.38],
 ['Infinity Pay',420],['Cresol',6848.37],['Pai',2000],['Jair',6000]
].map(([name,original],i)=>({id:crypto.randomUUID?.()||`acc-${i}-${Date.now()}`,name,original,payments:[]}));

const fmt=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const els={
 loginScreen:$('#loginScreen'),app:$('#app'),loginForm:$('#loginForm'),loginEmail:$('#loginEmail'),loginPassword:$('#loginPassword'),loginHelp:$('#loginHelp'),loginSubmit:$('#loginSubmit'),resetPasswordBtn:$('#resetPasswordBtn'),
 pageTitle:$('#pageTitle'),pageSubtitle:$('#pageSubtitle'),debtSummary:$('#debtSummary'),costSummary:$('#costSummary'),
 totalRemaining:$('#totalRemaining'),totalOriginal:$('#totalOriginal'),totalPaid:$('#totalPaid'),paidPercent:$('#paidPercent'),
 accountCount:$('#accountCount'),accountsList:$('#accountsList'),paymentsList:$('#paymentsList'),
 paymentDialog:$('#paymentDialog'),paymentForm:$('#paymentForm'),paymentAccount:$('#paymentAccount'),paymentAmount:$('#paymentAmount'),paymentDate:$('#paymentDate'),paymentNote:$('#paymentNote'),
 accountDialog:$('#accountDialog'),accountForm:$('#accountForm'),accountCreditor:$('#accountCreditor'),accountName:$('#accountName'),accountDetail:$('#accountDetail'),accountType:$('#accountType'),accountAmount:$('#accountAmount'),creditCardFields:$('#creditCardFields'),cardLimit:$('#cardLimit'),cardDueDay:$('#cardDueDay'),cardCloseDay:$('#cardCloseDay'),
 costDialog:$('#costDialog'),costForm:$('#costForm'),costAmount:$('#costAmount'),costCategory:$('#costCategory'),costPlace:$('#costPlace'),costDate:$('#costDate'),costNote:$('#costNote'),
 monthFilter:$('#monthFilter'),monthSpent:$('#monthSpent'),monthCount:$('#monthCount'),monthName:$('#monthName'),categorySummary:$('#categorySummary'),costsList:$('#costsList'),costCount:$('#costCount'),
 debtsView:$('#debtsView'),costsView:$('#costsView'),backupDialog:$('#backupDialog'),pdfImportDialog:$('#pdfImportDialog'),pdfFileInput:$('#pdfFileInput'),pdfReading:$('#pdfReading'),pdfResult:$('#pdfResult'),pdfDetectedBank:$('#pdfDetectedBank'),pdfBank:$('#pdfBank'),pdfType:$('#pdfType'),pdfDetail:$('#pdfDetail'),pdfAmountCandidates:$('#pdfAmountCandidates'),pdfAmount:$('#pdfAmount'),pdfCardLimit:$('#pdfCardLimit'),pdfDueDay:$('#pdfDueDay'),pdfCloseDay:$('#pdfCloseDay'),pdfConfidenceText:$('#pdfConfidenceText'),pdfExtractPreview:$('#pdfExtractPreview'),fab:$('#fab')
};

let state=loadState();
let currentView='debts';

function loadState(){
 try{
   const raw=localStorage.getItem(STORAGE_KEY);
   if(raw){const x=JSON.parse(raw); x.costs ||= []; return x;}
   for(const key of LEGACY_KEYS){
     const old=localStorage.getItem(key);
     if(old){const x=JSON.parse(old); x.costs ||= []; localStorage.setItem(STORAGE_KEY,JSON.stringify(x)); return x;}
   }
 }catch{}
 return {accounts:INITIAL_ACCOUNTS,costs:[]};
}
function saveLocal(){
 localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
async function save(){
 saveLocal();
 render();
 if(currentUser && cloudReady){
   try{await set(ref(db,`users/${currentUser.uid}/finance`),state);}
   catch(err){console.error('Falha ao sincronizar com Firebase',err);}
 }
}
async function startCloudSync(user){
 currentUser=user;
 const financeRef=ref(db,`users/${user.uid}/finance`);
 const snap=await get(financeRef);
 if(snap.exists()){
   const cloud=snap.val();
   cloud.accounts ||= [];
   cloud.costs ||= [];
   state=cloud;
   saveLocal();
 }else{
   await set(financeRef,state);
 }
 cloudReady=true;
 if(unsubscribeData) unsubscribeData();
 unsubscribeData=onValue(financeRef,snapshot=>{
   if(!snapshot.exists()) return;
   const next=snapshot.val();
   next.accounts ||= [];
   next.costs ||= [];
   state=next;
   saveLocal();
   render();
 });
 render();
}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function dateBR(v){if(!v)return'';const[y,m,d]=v.split('-');return`${d}/${m}/${y}`;}
function paid(a){return(a.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);}
function remaining(a){return Math.max(0,Number(a.original)-paid(a));}
function accountDisplay(a){return a.detail?`${a.name} — ${a.detail}`:a.name;}
function accountTypeLabel(t){return({credit_card:'Cartão de crédito',loan:'Empréstimo',consigned:'Consignado',financing:'Financiamento',personal:'Dívida pessoal',other:'Outra conta'})[t]||'Outra conta';}
function accountTypeIcon(t){return({credit_card:'💳',loan:'💰',consigned:'📄',financing:'🏦',personal:'🤝',other:'▤'})[t]||'▤';}
function toggleAccountTypeFields(){els.creditCardFields?.classList.toggle('hidden',els.accountType?.value!=='credit_card');}

function creditorNames(){return [...new Set(state.accounts.map(a=>a.name))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function fillCreditorSelect(){
 if(!els.accountCreditor)return;
 els.accountCreditor.innerHTML='<option value="">Novo banco / credor</option>'+creditorNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function openAccount(creditor=''){
 els.accountForm.reset(); fillCreditorSelect(); els.accountCreditor.value=creditor;
 els.accountName.value=creditor; els.accountName.disabled=!!creditor;
 $('#accountNameLabel').classList.toggle('hidden',!!creditor);
 els.accountType.value='other';toggleAccountTypeFields();
 els.accountDialog.showModal();
}

function totals(){const original=state.accounts.reduce((s,a)=>s+Number(a.original),0),totalPaid=state.accounts.reduce((s,a)=>s+paid(a),0);return{original,totalPaid,remaining:Math.max(0,original-totalPaid)};}
function initials(name){return name.split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();}
function accountIcon(name){
 const n=name.toLowerCase();
 if(n.includes('mercado pago'))return'<div class="brand-icon mercado"><span>🤝</span></div>';
 if(n.includes('nubank'))return'<div class="brand-icon nubank"><span>nu</span></div>';
 if(n.includes('sicredi'))return'<div class="brand-icon sicredi"><span>✣</span></div>';
 if(n.includes('meu tudo'))return'<div class="brand-icon meutudo"><span>$</span></div>';
 if(n.includes('infinity'))return'<div class="brand-icon infinity"><span>∞</span></div>';
 if(n.includes('cresol'))return'<div class="brand-icon cresol"><span>◇</span></div>';
 if(n.includes('pai'))return'<div class="brand-icon person blue"><span>●</span></div>';
 if(n.includes('jair'))return'<div class="brand-icon person amber"><span>●</span></div>';
 return`<div class="avatar">${esc(initials(name))}</div>`;
}
function categoryIcon(c){return({'Alimentação':'🍽️','Mercado':'🛒','Combustível':'⛽','Moradia':'🏠','Contas fixas':'🧾','Saúde':'💊','Lazer':'🎬','Transporte':'🚗','Compras':'🛍️','Outros':'•••'})[c]||'•••';}
function today(){return new Date().toISOString().slice(0,10);}
function currentMonth(){return today().slice(0,7);}
function monthLabel(v){if(!v)return'—';const[y,m]=v.split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());}

function showLogin(message='Entre com seu e-mail e senha.'){
 els.loginHelp.textContent=message;
 els.app.classList.add('hidden');
 els.loginScreen.classList.remove('hidden');
}
function unlock(){
 els.loginScreen.classList.add('hidden');
 els.app.classList.remove('hidden');
 els.loginForm.reset();
 render();
}
els.loginForm.addEventListener('submit',async e=>{
 e.preventDefault();
 const email=els.loginEmail.value.trim();
 const pass=els.loginPassword.value;
 try{
   els.loginSubmit.disabled=true; els.loginSubmit.textContent='Entrando...';
   await signInWithEmailAndPassword(auth,email,pass);
 }catch(err){
   showLogin(err?.code==='auth/unauthorized-domain'?'Domínio do GitHub Pages ainda não autorizado no Firebase.':'E-mail ou senha incorretos, ou acesso ainda não criado.');
 }finally{
   els.loginSubmit.disabled=false; els.loginSubmit.textContent='Entrar';
 }
});
$('#registerBtn').addEventListener('click',async()=>{
 const email=els.loginEmail.value.trim();
 const pass=els.loginPassword.value;
 if(!email || pass.length<6) return alert('Informe o e-mail e uma senha com pelo menos 6 caracteres.');
 try{
   await createUserWithEmailAndPassword(auth,email,pass);
   alert('Acesso criado. Seus dados serão vinculados a este usuário.');
 }catch(err){
   alert(err.code==='auth/email-already-in-use'?'Este e-mail já possui acesso.':'Não foi possível criar o acesso.');
 }
});
els.resetPasswordBtn.addEventListener('click',async()=>{
 const email=els.loginEmail.value.trim();
 if(!email) return alert('Digite seu e-mail primeiro.');
 try{await sendPasswordResetEmail(auth,email);alert('E-mail de redefinição enviado.');}
 catch{alert('Não foi possível enviar a redefinição para este e-mail.');}
});
$('#logoutBtn').addEventListener('click',()=>signOut(auth));


function brMoneyToNumber(v){let s=String(v||'').replace(/\s/g,'').replace(/R\$/gi,'').replace(/[^\d.,-]/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?Math.abs(n):0;}
function detectBank(text){const t=text.toLowerCase(),banks=[['Mercado Pago',/mercado\s*pago|mercadopago/],['Nubank',/nubank|nu pagamentos/],['Sicredi',/sicredi/],['Cresol',/cresol/],['Meu Tudo Consignado',/meu\s*tudo|meutudo/],['Infinity Pay',/infinity\s*pay|cloudwalk/],['Itaú',/ita[uú]/],['Bradesco',/bradesco/],['Santander',/santander/],['Banco do Brasil',/banco\s+do\s+brasil/],['Caixa',/caixa\s+econ[oô]mica/],['Inter',/banco\s+inter/],['C6 Bank',/c6\s*bank/],['PicPay',/picpay/]];return(banks.find(([,r])=>r.test(t))||['Banco não identificado'])[0];}
function detectDebtType(text){const t=text.toLowerCase();if(/fatura|cart[aã]o|limite|fechamento/.test(t))return'credit_card';if(/consignad/.test(t))return'consigned';if(/financiamento/.test(t))return'financing';if(/empr[eé]stimo|cr[eé]dito pessoal|saldo devedor|parcelas restantes/.test(t))return'loan';return'other';}
function extractDay(text,patterns){for(const rx of patterns){const m=text.match(rx);if(!m)continue;const raw=m[1]||'';const d=raw.match(/\b([0-3]?\d)[\/.-]/);const n=d?Number(d[1]):Number(raw.replace(/\D/g,''));if(n>=1&&n<=31)return n;}return null;}
function extractMoneyCandidates(text){
 const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
 const rules=[['Valor para quitação',/valor\s+(?:para\s+)?quita[cç][aã]o|quita[cç][aã]o\s+hoje/i,100],['Saldo devedor',/saldo\s+devedor|saldo\s+da\s+d[ií]vida/i,96],['Total da fatura',/total\s+(?:da\s+)?fatura|valor\s+(?:total\s+)?da\s+fatura/i,92],['Total a pagar',/total\s+a\s+pagar|valor\s+a\s+pagar/i,88],['Fatura atual',/fatura\s+atual|fatura\s+fechada/i,82],['Saldo atual',/saldo\s+atual/i,78]];
 const money=/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
 lines.forEach((line,i)=>{const ctx=[lines[i-1]||'',line,lines[i+1]||''].join(' ');let m;while((m=money.exec(line))){const amount=brMoneyToNumber(m[0]);if(amount<1)continue;let label='Valor encontrado',score=20;for(const[r,rx,s]of rules)if(rx.test(ctx)){label=r;score=s;break;}if(/pagamento\s+m[ií]nimo/i.test(ctx)){label='Pagamento mínimo';score=5;}if(/limite/i.test(ctx)){label='Limite';score=8;}out.push({amount,label,score,context:ctx});}});
 const seen=new Set();return out.sort((a,b)=>b.score-a.score||b.amount-a.amount).filter(x=>{const k=x.amount.toFixed(2)+'|'+x.label;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,15);
}
function extractLimit(text){const m=text.match(/limite(?:\s+total|\s+do\s+cart[aã]o)?[^\d]{0,40}(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);return m?brMoneyToNumber(m[1]):0;}
async function extractPdfText(file){const bytes=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjsLib.getDocument({data:bytes}).promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();pages.push(content.items.map(x=>x.str).join(' '));}return pages.join('\n');}
function resetPdfImport(){els.pdfFileInput.value='';els.pdfReading.classList.add('hidden');els.pdfResult.classList.add('hidden');els.pdfExtractPreview.textContent='';}
async function handlePdf(file){
 if(!file)return;els.pdfReading.classList.remove('hidden');els.pdfResult.classList.add('hidden');
 try{
  const text=await extractPdfText(file);if(text.trim().length<30)throw new Error('Este PDF parece digitalizado como imagem. Esta versão lê PDFs com texto selecionável.');
  const bank=detectBank(text),type=detectDebtType(text),candidates=extractMoneyCandidates(text),best=candidates.find(x=>x.score>=60)||candidates[0];
  const due=extractDay(text,[/vencimento[^\n]{0,40}?(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)/i,/vence\s+(?:em|dia)?\s*(\d{1,2})/i]);
  const close=extractDay(text,[/fechamento[^\n]{0,40}?(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)/i,/fecha\s+(?:em|dia)?\s*(\d{1,2})/i]);
  els.pdfDetectedBank.textContent=bank;els.pdfBank.value=bank==='Banco não identificado'?'':bank;els.pdfType.value=type;els.pdfDetail.value=type==='credit_card'?'Cartão de crédito':'';
  els.pdfAmountCandidates.innerHTML=candidates.length?candidates.map(x=>`<option value="${x.amount}">${esc(x.label)} — ${fmt.format(x.amount)}</option>`).join(''):'<option value="">Nenhum valor identificado</option>';
  els.pdfAmount.value=best?.amount||'';if(best)els.pdfAmountCandidates.value=String(best.amount);els.pdfCardLimit.value=extractLimit(text)||'';els.pdfDueDay.value=due||'';els.pdfCloseDay.value=close||'';
  els.pdfConfidenceText.textContent=best?.score>=80?'Boa confiança na leitura. Confira e salve.':'Confira o valor antes de salvar.';
  els.pdfExtractPreview.textContent=`Arquivo: ${file.name}\nBanco: ${bank}\nTipo: ${accountTypeLabel(type)}\n\n${text.slice(0,5000)}`;els.pdfResult.classList.remove('hidden');
 }catch(e){alert(e.message||'Não consegui ler o PDF.');}finally{els.pdfReading.classList.add('hidden');}
}
function savePdfAsAccount(){const name=els.pdfBank.value.trim(),original=Number(els.pdfAmount.value),type=els.pdfType.value||'other';if(!name||original<=0)return alert('Confira o banco e o valor.');const a={id:crypto.randomUUID?.()||String(Date.now()),name,detail:els.pdfDetail.value.trim()||accountTypeLabel(type),type,original,payments:[],source:'pdf',importedAt:Date.now()};if(type==='credit_card'){a.cardLimit=Number(els.pdfCardLimit.value)||0;a.cardDueDay=Number(els.pdfDueDay.value)||null;a.cardCloseDay=Number(els.pdfCloseDay.value)||null;}state.accounts.push(a);save();els.pdfImportDialog.close();resetPdfImport();}

function render(){
 const t=totals();
 els.totalRemaining.textContent=fmt.format(t.remaining);
 els.totalOriginal.textContent=`Original: ${fmt.format(t.original)}`;
 els.totalPaid.textContent=fmt.format(t.totalPaid);
 els.paidPercent.textContent=t.original?`${Math.min(100,t.totalPaid/t.original*100).toFixed(1)}%`:'0%';

 const groups=[...new Set(state.accounts.map(a=>a.name))].map(name=>({
   name,
   accounts:state.accounts.filter(a=>a.name===name)
 }));
 els.accountCount.textContent=`${groups.length} ${groups.length===1?'credor':'credores'}`;

 els.paymentAccount.innerHTML=state.accounts.map(a=>`<option value="${a.id}">${esc(accountDisplay(a))} — ${fmt.format(remaining(a))}</option>`).join('');

 els.accountsList.innerHTML=groups.length?groups.map(g=>{
   const original=g.accounts.reduce((s,a)=>s+Number(a.original),0);
   const totalPaid=g.accounts.reduce((s,a)=>s+paid(a),0);
   const totalRemaining=Math.max(0,original-totalPaid);
   const pct=original?Math.min(100,totalPaid/original*100):0;

   const accountRows=g.accounts.map((a,i)=>{
     const p=paid(a),r=remaining(a),apct=a.original?Math.min(100,p/a.original*100):0;
     const label=a.detail || (g.accounts.length===1 ? 'Conta principal' : `Conta ${i+1}`);
     return `<div class="sub-account-row">
       <div class="sub-account-main">
         <div>
           <strong>${accountTypeIcon(a.type)} ${esc(label)}</strong>
           <small><span class="type-badge">${esc(accountTypeLabel(a.type))}</span> Inicial: ${fmt.format(a.original)} • Pago: ${fmt.format(p)}</small>
           ${a.type==='credit_card'?`<small class="card-meta">${a.cardLimit?`Limite: ${fmt.format(a.cardLimit)}`:''}${a.cardDueDay?`${a.cardLimit?' • ':''}Vence dia ${a.cardDueDay}`:''}${a.cardCloseDay?`${(a.cardLimit||a.cardDueDay)?' • ':''}Fecha dia ${a.cardCloseDay}`:''}</small>`:''}
         </div>
         <div class="sub-account-balance">
           <small>Restante</small>
           <strong>${fmt.format(r)}</strong>
         </div>
       </div>
       <div class="progress mini-progress"><span style="width:${apct}%"></span></div>
       <div class="sub-account-actions">
         <button class="mini-btn" data-pay="${a.id}">+ Pagamento</button>
         <button class="mini-btn danger" data-delete-account="${a.id}">Excluir conta</button>
       </div>
     </div>`;
   }).join('');

   return `<article class="account-card creditor-card">
     <div class="account-top">
       <div class="account-name">${accountIcon(g.name)}<div><h3>${esc(g.name)}</h3><small>${g.accounts.length} ${g.accounts.length===1?'conta':'contas'}</small></div></div>
       <div class="account-balance"><small>Total restante</small><strong>${fmt.format(totalRemaining)}</strong></div>
     </div>
     <div class="progress"><span style="width:${pct}%"></span></div>
     <div class="creditor-summary">
       <span>Original: ${fmt.format(original)}</span>
       <span>Pago: ${fmt.format(totalPaid)} • ${pct.toFixed(1)}%</span>
     </div>
     <div class="sub-accounts">${accountRows}</div>
     <div class="creditor-actions">
       <button class="secondary-btn small" data-add-under="${esc(g.name)}">+ Adicionar conta</button>
     </div>
   </article>`;
 }).join(''):'<div class="empty">Nenhuma conta cadastrada.</div>';

 const allPayments=state.accounts.flatMap(a=>(a.payments||[]).map(p=>({...p,accountId:a.id,accountName:accountDisplay(a)}))).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));
 els.paymentsList.innerHTML=allPayments.length?allPayments.slice(0,30).map(p=>`<div class="payment-row"><div class="payment-meta"><strong>${esc(p.accountName)}</strong><small>${dateBR(p.date)}${p.note?' • '+esc(p.note):''}</small></div><div class="payment-value"><strong>-${fmt.format(p.amount)}</strong><button data-delete-payment="${p.accountId}|${p.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum pagamento lançado.</div>';
 renderCosts();
}
function renderCosts(){
 const month=els.monthFilter.value||currentMonth(); if(!els.monthFilter.value)els.monthFilter.value=month;
 const rows=(state.costs||[]).filter(c=>c.date?.startsWith(month)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));
 const total=rows.reduce((s,c)=>s+Number(c.amount||0),0);
 els.monthSpent.textContent=fmt.format(total); els.monthCount.textContent=`${rows.length} ${rows.length===1?'lançamento':'lançamentos'}`; els.monthName.textContent=monthLabel(month); els.costCount.textContent=els.monthCount.textContent;
 const byCat={}; rows.forEach(c=>byCat[c.category]=(byCat[c.category]||0)+Number(c.amount||0));
 const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
 els.categorySummary.innerHTML=cats.length?cats.map(([cat,val])=>`<article class="category-card"><span class="category-icon">${categoryIcon(cat)}</span><div><small>${esc(cat)}</small><strong>${fmt.format(val)}</strong><em>${total?((val/total)*100).toFixed(0):0}% do mês</em></div></article>`).join(''):'<div class="empty wide">Sem gastos neste mês.</div>';
 els.costsList.innerHTML=rows.length?rows.map(c=>`<div class="payment-row"><div class="cost-left"><span class="small-icon">${categoryIcon(c.category)}</span><div class="payment-meta"><strong>${esc(c.place)}</strong><small>${esc(c.category)} • ${dateBR(c.date)}${c.note?' • '+esc(c.note):''}</small></div></div><div class="payment-value cost-value"><strong>${fmt.format(c.amount)}</strong><button data-delete-cost="${c.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum gasto lançado.</div>';
}
function setView(view){
 currentView=view;
 const costs=view==='costs';
 els.debtsView.classList.toggle('hidden',costs);els.costsView.classList.toggle('hidden',!costs);
 els.debtSummary.classList.toggle('hidden',costs);els.costSummary.classList.toggle('hidden',!costs);
 els.pageTitle.textContent=costs?'Controle de Custos':'Minhas Contas';
 els.pageSubtitle.textContent=costs?'Veja quanto está gastando e onde o dinheiro está indo.':'Acompanhe o saldo e registre cada pagamento.';
 $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 els.fab.setAttribute('aria-label',costs?'Novo gasto':'Registrar pagamento');
 render();
}
function openPayment(id){if(!state.accounts.length)return alert('Adicione uma conta primeiro.');els.paymentForm.reset();els.paymentDate.value=today();if(id)els.paymentAccount.value=id;els.paymentDialog.showModal();}
function openCost(){els.costForm.reset();els.costDate.value=today();els.costDialog.showModal();}

els.fab.addEventListener('click',()=>currentView==='costs'?openCost():openPayment());
$('#addCostBtn').addEventListener('click',openCost);
$('#addAccountBtn').addEventListener('click',()=>openAccount());
$('#importPdfBtn').addEventListener('click',()=>{resetPdfImport();els.pdfImportDialog.showModal();});
els.pdfFileInput.addEventListener('change',e=>handlePdf(e.target.files?.[0]));
els.pdfAmountCandidates.addEventListener('change',()=>{if(els.pdfAmountCandidates.value)els.pdfAmount.value=els.pdfAmountCandidates.value;});
$('#savePdfImportBtn').addEventListener('click',savePdfAsAccount);
$('#backupBtn').addEventListener('click',()=>els.backupDialog.showModal());
els.monthFilter.addEventListener('change',renderCosts);
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();
 const payBtn=e.target.closest('[data-pay]');if(payBtn)openPayment(payBtn.dataset.pay);
 const addUnder=e.target.closest('[data-add-under]');if(addUnder)openAccount(addUnder.dataset.addUnder);
 const delAcc=e.target.closest('[data-delete-account]');if(delAcc){const a=state.accounts.find(x=>x.id===delAcc.dataset.deleteAccount);if(a&&confirm(`Excluir ${a.name} e todo o histórico dela?`)){state.accounts=state.accounts.filter(x=>x.id!==a.id);save();}}
 const delPay=e.target.closest('[data-delete-payment]');if(delPay){const[aid,pid]=delPay.dataset.deletePayment.split('|');const a=state.accounts.find(x=>x.id===aid);if(a&&confirm('Excluir este pagamento?')){a.payments=a.payments.filter(p=>p.id!==pid);save();}}
 const delCost=e.target.closest('[data-delete-cost]');if(delCost&&confirm('Excluir este gasto?')){state.costs=state.costs.filter(c=>c.id!==delCost.dataset.deleteCost);save();}
});
els.paymentForm.addEventListener('submit',e=>{
 e.preventDefault();const a=state.accounts.find(x=>x.id===els.paymentAccount.value),amount=Number(els.paymentAmount.value);if(!a||amount<=0)return;
 const r=remaining(a);if(amount>r+.001&&!confirm(`O pagamento é maior que o saldo restante (${fmt.format(r)}). Registrar mesmo assim?`))return;
 a.payments.push({id:crypto.randomUUID?.()||String(Date.now()),amount,date:els.paymentDate.value,note:els.paymentNote.value.trim(),createdAt:Date.now()});save();els.paymentDialog.close();
});
els.accountCreditor?.addEventListener('change',()=>{const creditor=els.accountCreditor.value;els.accountName.disabled=!!creditor;$('#accountNameLabel').classList.toggle('hidden',!!creditor);if(creditor)els.accountName.value=creditor;else els.accountName.value='';});
els.accountType?.addEventListener('change',toggleAccountTypeFields);
els.accountForm.addEventListener('submit',e=>{e.preventDefault();const creditor=els.accountCreditor.value,name=(creditor||els.accountName.value).trim(),detail=els.accountDetail.value.trim(),type=els.accountType?.value||'other',original=Number(els.accountAmount.value);if(!name||original<=0)return;const a={id:crypto.randomUUID?.()||String(Date.now()),name,detail,type,original,payments:[]};if(type==='credit_card'){a.cardLimit=Number(els.cardLimit.value)||0;a.cardDueDay=Number(els.cardDueDay.value)||null;a.cardCloseDay=Number(els.cardCloseDay.value)||null;}state.accounts.push(a);save();els.accountDialog.close();});
els.costForm.addEventListener('submit',e=>{e.preventDefault();const amount=Number(els.costAmount.value),place=els.costPlace.value.trim();if(amount<=0||!place)return;state.costs.push({id:crypto.randomUUID?.()||String(Date.now()),amount,category:els.costCategory.value,place,date:els.costDate.value,note:els.costNote.value.trim(),createdAt:Date.now()});els.monthFilter.value=els.costDate.value.slice(0,7);save();els.costDialog.close();});
$('#clearPaymentsBtn').addEventListener('click',()=>{if(confirm('Limpar todos os pagamentos lançados?')){state.accounts.forEach(a=>a.payments=[]);save();}});
$('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`minhas-contas-backup-${today()}.json`;a.click();URL.revokeObjectURL(url);});
$('#importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.accounts))throw new Error();data.costs||=[];state=data;save();els.backupDialog.close();alert('Backup importado com sucesso.');}catch{alert('Arquivo de backup inválido.');}e.target.value='';});

if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
els.monthFilter.value=currentMonth();
showLogin('Verificando acesso...');
onAuthStateChanged(auth,async user=>{
  if(user){
    try{
      await startCloudSync(user);
      unlock();
    }catch(err){
      console.error(err);
      showLogin('Falha ao carregar seus dados do Firebase.');
    }
  }else{
    currentUser=null; cloudReady=false;
    if(unsubscribeData){unsubscribeData();unsubscribeData=null;}
    showLogin();
  }
});
render();
