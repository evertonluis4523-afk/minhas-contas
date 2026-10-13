import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
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
 loginScreen:$('#loginScreen'),app:$('#app'),loginForm:$('#loginForm'),loginEmail:$('#loginEmail'),loginPassword:$('#loginPassword'),loginHelp:$('#loginHelp'),loginSubmit:$('#loginSubmit'),
 
 totalRemaining:$('#totalRemaining'),totalOriginal:$('#totalOriginal'),totalPaid:$('#totalPaid'),paidPercent:$('#paidPercent'),
 accountCount:$('#accountCount'),accountsList:$('#accountsList'),paymentsList:$('#paymentsList'),
 paymentDialog:$('#paymentDialog'),paymentForm:$('#paymentForm'),paymentAccount:$('#paymentAccount'),paymentAmount:$('#paymentAmount'),paymentDate:$('#paymentDate'),paymentNote:$('#paymentNote'),
 accountDialog:$('#accountDialog'),accountForm:$('#accountForm'),accountCreditor:$('#accountCreditor'),accountName:$('#accountName'),accountDetail:$('#accountDetail'),accountType:$('#accountType'),accountAmount:$('#accountAmount'),creditCardFields:$('#creditCardFields'),cardLimit:$('#cardLimit'),cardDueDay:$('#cardDueDay'),cardCloseDay:$('#cardCloseDay'),
 costDialog:$('#costDialog'),costForm:$('#costForm'),costAmount:$('#costAmount'),costCategory:$('#costCategory'),costPlace:$('#costPlace'),costDate:$('#costDate'),costNote:$('#costNote'),
 monthFilter:$('#monthFilter'),monthSpent:$('#monthSpent'),monthCount:$('#monthCount'),monthName:$('#monthName'),categorySummary:$('#categorySummary'),costsList:$('#costsList'),costCount:$('#costCount'),
 debtsView:$('#debtsView'),accountSheet:$('#accountSheet'),dueList:$('#dueList'),payoffForecast:$('#payoffForecast'),paidOffList:$('#paidOffList'),monthCompare:$('#monthCompare'),undoToast:$('#undoToast'),accountDueDay:$('#accountDueDay'),accountInstallment:$('#accountInstallment'),costsView:$('#costsView'),backupDialog:$('#backupDialog'),pdfImportDialog:$('#pdfImportDialog'),pdfFileInput:$('#pdfFileInput'),pdfReading:$('#pdfReading'),pdfResult:$('#pdfResult'),pdfDocumentType:$('#pdfDocumentType'),pdfImportTotal:$('#pdfImportTotal'),pdfImportNotice:$('#pdfImportNotice'),pdfItemCount:$('#pdfItemCount'),pdfItemsList:$('#pdfItemsList'),pdfExtractPreview:$('#pdfExtractPreview'),fab:$('#fab')
};

let state=blankState();
let currentView='home';

function blankState(){ return {accounts:[],costs:[],budgets:{},categories:[]}; }
function userStorageKey(uid){ return `${STORAGE_KEY}:${uid}`; }
function loadState(){
 // Antes do login não carregamos dados financeiros de nenhum usuário.
 return blankState();
}
function loadLocalForUser(uid){
 try{
   const raw=localStorage.getItem(userStorageKey(uid));
   if(!raw)return null;
   const x=JSON.parse(raw);
   x.accounts ||= [];
   x.accounts.forEach(a=>a.payments ||= []);
   x.costs ||= [];
   return x;
 }catch{return null;}
}
function saveLocal(){
 if(!currentUser?.uid)return;
 localStorage.setItem(userStorageKey(currentUser.uid),JSON.stringify(state));
}
async function save(){
 saveLocal();
 render();
 if(currentUser && cloudReady){
   try{await set(ref(db,`users/${currentUser.uid}/finance`),state);}
   catch(err){console.error('Falha ao sincronizar com Firebase',err);throw err;}
 }
}
/* GRAVAR SEM APAGAR O QUE OUTRO APARELHO LANÇOU.
   Antes cada gravação mandava a cópia inteira deste aparelho: se a mesma
   pessoa lançasse algo no outro telefone no meio tempo, sumia. Agora cada
   mudança é uma função aplicada aqui E sobre o que está na nuvem naquele
   momento (transação do Firebase), então as duas ficam. */
function normaliza(x){
 x=x||blankState();
 x.accounts=Array.isArray(x.accounts)?x.accounts.filter(Boolean):Object.values(x.accounts||{});
 x.accounts.forEach(a=>{a.payments=Array.isArray(a.payments)?a.payments.filter(Boolean):Object.values(a.payments||{});});
 x.costs=Array.isArray(x.costs)?x.costs.filter(Boolean):Object.values(x.costs||{});
 x.budgets=(x.budgets&&typeof x.budgets==='object')?x.budgets:{};
 x.categories=Array.isArray(x.categories)?x.categories.filter(Boolean):Object.values(x.categories||{});
 return x;
}
async function mutate(fn){
 fn(state); saveLocal(); render();
 if(!(currentUser&&cloudReady))return;
 try{
   await runTransaction(ref(db,`users/${currentUser.uid}/finance`),cur=>{
     const s=normaliza(cur), local=state;
     state=s; try{fn(s);}finally{state=local;}
     return s;
   });
 }catch(err){console.error('Falha ao sincronizar com Firebase',err);alert('Não foi possível salvar na nuvem: '+(msgDados(err)));}
}
const novoId=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
async function startCloudSync(user){
 currentUser=user;
 cloudReady=false;
 const financeRef=ref(db,`users/${user.uid}/finance`);
 const snap=await get(financeRef);

 if(snap.exists()){
   state=normaliza(snap.val());
 }else{
   // Usuário novo começa vazio. Nunca copiamos o estado local de outro usuário.
   state=loadLocalForUser(user.uid) || blankState();
   await set(financeRef,state);
 }

 saveLocal();
 cloudReady=true;

 if(unsubscribeData) unsubscribeData();
 unsubscribeData=onValue(financeRef,snapshot=>{
   if(!snapshot.exists())return;
   state=normaliza(snapshot.val());
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

function creditorNames(){return [...new Set(state.accounts.map(a=>a.name))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function fillCreditorSelect(){
 if(!els.accountCreditor)return;
 els.accountCreditor.innerHTML='<option value="">Novo banco / credor</option>'+creditorNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function openAccount(creditor='',editId=null){
 els.accountForm.reset(); fillCreditorSelect(); editAcc=editId;
 const a=editId?state.accounts.find(x=>x.id===editId):null;
 if(a)creditor=a.name;
 els.accountCreditor.value=creditor;
 els.accountName.value=creditor; els.accountName.disabled=!!creditor;
 $('#accountNameLabel').classList.toggle('hidden',!!creditor);
 els.accountType.value=a?.type||'other';
 if(a){els.accountDetail.value=a.detail||'';els.accountAmount.value=String(a.original);
   els.accountDueDay.value=diaVenc(a)||'';els.accountInstallment.value=a.installment||'';
   els.cardLimit.value=a.cardLimit||'';els.cardCloseDay.value=a.cardCloseDay||'';}
 toggleAccountTypeFields();
 $('#accountTitle').textContent=a?'Editar conta':'Adicionar conta';
 $('#accountSubmit').textContent=a?'Salvar':'Adicionar';
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
/* data de HOJE no relógio do telefone (Brasília). toISOString() dá a data
   de Londres: depois das 21h o lançamento saía com a data de amanhã. */
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
/* ---------- datas ---------- */
function isoD(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function addDias(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoD(d);}
function difDias(a,b){return Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/864e5);}
function vencNoMes(y,m,dia){const ult=new Date(y,m+1,0).getDate();return isoD(new Date(y,m,Math.min(dia,ult),12));}
function mesCurto(iso){return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}).replace('.','');}
function semIndefinidos(o){Object.keys(o).forEach(k=>{if(o[k]===undefined)o[k]=null;});return o;}

/* ---------- VENCIMENTOS ----------
   Cada conta com dia de vencimento tem um vencimento por mês. Um pagamento
   conta para o vencimento D se cair entre 20 dias antes de D e 21 dias
   antes do próximo -- pagar adiantado ou uns dias atrasado vale para ele.
   Só fica "atrasado" o vencimento a partir de quando o dia foi cadastrado
   (vencDesde): conta antiga sem esse registro não aparece atrasada à toa. */
function diaVenc(a){return Number(a.dueDay||a.cardDueDay)||0;}
function vencInfo(a){
 const dia=diaVenc(a); if(!dia||remaining(a)<=0.005)return null;
 const h=today(), y=+h.slice(0,4), m=+h.slice(5,7)-1;
 const venc=k=>vencNoMes(y,m+k,dia);
 const pago=k=>{const i=addDias(venc(k),-20),f=addDias(venc(k+1),-21);return (a.payments||[]).some(p=>p.date&&p.date>=i&&p.date<=f);};
 const desde=a.vencDesde||'9999-12-31';
 for(const k of [-2,-1,0]){const v=venc(k);if(v<h&&v>=desde&&!pago(k))return {data:v,atraso:difDias(h,v)};}
 for(const k of [0,1,2]){const v=venc(k);if(v>=h&&!pago(k))return {data:v,faltam:difDias(v,h)};}
 return null;
}
function parcelasFaltam(a){const v=Number(a.installment)||0;return v>0?Math.ceil(remaining(a)/v-1e-9):0;}
function textoVenc(i,a){
 const n=parcelasFaltam(a), extra=n?` · faltam ${n} ${n===1?'parcela':'parcelas'}`:'';
 if(i.atraso!=null)return {cls:'late',txt:`atrasado ${i.atraso} ${i.atraso===1?'dia':'dias'}${extra}`};
 if(i.faltam===0)return {cls:'today',txt:`vence hoje${extra}`};
 if(i.faltam===1)return {cls:'soon',txt:`vence amanhã${extra}`};
 return {cls:i.faltam<=5?'soon':'later',txt:`vence em ${i.faltam} dias${extra}`};
}
function renderDue(){
 if(!els.dueList)return;
 const itens=state.accounts.map(a=>({a,i:vencInfo(a)})).filter(x=>x.i)
   .sort((x,y)=>(y.i.atraso||-1)-(x.i.atraso||-1)||x.i.data.localeCompare(y.i.data)).slice(0,6);
 $('#dueCard')?.classList.toggle('hidden',!itens.length&&!state.accounts.some(a=>remaining(a)>0.005));
 els.dueList.innerHTML=itens.length?itens.map(({a,i})=>{const t=textoVenc(i,a);
   return `<div class="due-row" data-due="${a.id}"><div class="due-day ${t.cls}">${i.data.slice(8)}<small>${mesCurto(i.data)}</small></div>
     <div class="due-txt"><b>${esc(a.name)}${a.detail?' · '+esc(a.detail):''}</b><span class="${t.cls}">${t.txt}</span></div>
     <div class="due-val"><b>${a.installment?fmt.format(a.installment):'&nbsp;'}</b><button type="button" class="pay-due" data-pay-due="${a.id}">Paguei</button></div></div>`;}).join('')
   :'<div class="empty small">Cadastre o <b>dia do vencimento</b> nas contas (Editar) para ver aqui o que vence e o que atrasou.</div>';
}
/* no ritmo dos últimos 3 meses de pagamentos */
function quitacao(){
 const t=totals(); if(t.remaining<=0.005)return '';
 const h=today(), ini=addDias(h,-90);
 const pagos=state.accounts.flatMap(a=>a.payments||[]).filter(p=>p.date>ini&&p.date<=h).reduce((s,p)=>s+Number(p.amount||0),0);
 if(pagos<=0)return '';
 const meses=Math.ceil(t.remaining/(pagos/3)); const d=new Date(+h.slice(0,4),+h.slice(5,7)-1+meses,1,12);
 return `Quitação prevista: ${mesCurto(isoD(d))}/${d.getFullYear()} · no ritmo dos últimos 3 meses`;
}
function pct(v){return `${(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`;}
function currentMonth(){return today().slice(0,7);}
function monthLabel(v){if(!v)return'—';const[y,m]=v.split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());}

const MSG_LOGIN={
 'auth/invalid-credential':'E-mail ou senha incorretos.','auth/wrong-password':'E-mail ou senha incorretos.',
 'auth/user-not-found':'E-mail ou senha incorretos.','auth/invalid-email':'E-mail inválido.',
 'auth/too-many-requests':'Muitas tentativas. Espere alguns minutos e tente de novo.',
 'auth/network-request-failed':'Sem internet. Confira a conexão e tente de novo.',
 'auth/unauthorized-domain':'Domínio do GitHub Pages ainda não autorizado no Firebase.'
};
function msgLogin(err){return MSG_LOGIN[err?.code]||'Não foi possível entrar. Tente de novo.';}
/* entrou, mas o banco não deixou ler os dados: não é senha errada, são as
   regras do Firebase (foi o que aconteceu quando as regras foram trocadas) */
function msgDados(err){
 const t=String(err?.code||'')+' '+String(err?.message||'');
 if(/permission/i.test(t))return 'O Firebase recusou o acesso aos seus dados (regras do banco). Sua senha está certa: avise quem administra o app.';
 if(/network|offline/i.test(t))return 'Sem internet para carregar seus dados. Confira a conexão e abra de novo.';
 return 'Falha ao carregar seus dados do Firebase.';
}
function showLogin(message){
 if(message!==undefined)els.loginHelp.textContent=message;
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
 lembrarAoEntrar=els.loginScreen.classList.contains('lembrado')?true:!!$('#loginRemember')?.checked;
 const email=els.loginEmail.value.trim();
 const pass=els.loginPassword.value;
 try{
   els.loginSubmit.disabled=true; els.loginSubmit.textContent='Entrando...';
   await signInWithEmailAndPassword(auth,email,pass);
 }catch(err){
   showLogin(msgLogin(err));
 }finally{
   els.loginSubmit.disabled=false; els.loginSubmit.textContent='Entrar';
 }
});
$('#logoutBtn').addEventListener('click',()=>signOut(auth));



let pendingPdfImport=null;

function brMoneyToNumber(v){
 let s=String(v||'').replace(/\s/g,'').replace(/R\$/gi,'').replace(/[^\d.,-]/g,'');
 if(!s)return 0;
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 const n=Number(s);
 return Number.isFinite(n)?Math.abs(n):0;
}
function moneyFromMatch(text,rx){
 const m=text.match(rx); return m?brMoneyToNumber(m[1]):0;
}
function normalizeName(v=''){
 return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function typeFromDescription(desc=''){
 const d=normalizeName(desc);
 if(d.includes('cartao'))return'credit_card';
 if(d.includes('consign'))return'consigned';
 if(d.includes('financiamento'))return'financing';
 if(d.includes('credito pessoal')||d.includes('emprestimo'))return'loan';
 if(d.includes('cheque especial'))return'overdraft';
 return'other';
}
function accountTypeLabel(type){
 return ({
  credit_card:'Cartão de crédito',loan:'Empréstimo',consigned:'Consignado',
  financing:'Financiamento',personal:'Dívida pessoal',overdraft:'Cheque especial',other:'Outra conta'
 })[type]||'Outra conta';
}
function accountTypeIcon(type){
 return ({credit_card:'💳',loan:'💰',consigned:'📄',financing:'🏦',personal:'🤝',overdraft:'🏧',other:'▤'})[type]||'▤';
}
function toggleAccountTypeFields(){
 const isCard=els.accountType?.value==='credit_card';
 els.creditCardFields?.classList.toggle('hidden',!isCard);
}
function compactPdfText(text){
 return String(text||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{2,}/g,'\n').trim();
}
function sliceBetween(text,startRx,endRx){
 const s=text.search(startRx);
 if(s<0)return'';
 const rest=text.slice(s);
 const e=rest.slice(1).search(endRx);
 return e<0?rest:rest.slice(0,e+1);
}
function makeImportItem({bank,detail,type,amount,sourceKey,source,meta={}}){
 return {
  bank,detail,type:type||'other',amount:Number(amount)||0,sourceKey,
  source,meta,selected:true
 };
}

/* ---------- SCR / REGISTRATO ----------
   Parser desenhado a partir do PDF real enviado pelo usuário.
   Não importa "Limites de crédito" como dívida.
*/
function parseSCR(text){
 const t=compactPdfText(text);
 if(!/Relat[oó]rio de Empr[eé]stimos e Financiamentos\s*\(SCR\)/i.test(t))return null;

 const items=[];
 const add=(bank,detail,type,amount,key,meta={})=>{
   if(amount>0)items.push(makeImportItem({bank,detail,type,amount,sourceKey:`scr:${key}`,source:'scr',meta}));
 };

 const blocks=[
  {
   bank:'Mercado Crédito',
   rx:/MERCADO CR[EÉ]DITO SOCIEDADE DE CR[EÉ]DITO[\s\S]*?(?=MERCADO PAGO INSTITUI[CÇ][AÃ]O|NU FINANCEIRA|COOPERATIVA DE CR[EÉ]DITO|BANCO DIGIO|PICPAY BANK|COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO|BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Crédito pessoal','loan',/Cr[eé]dito pessoal\s*-\s*sem consigna[cç][aã]o em folha de pagamento\s*R\$\s*([\d.]+,\d{2})/i,'mercado-credito:pessoal']]
  },
  {
   bank:'Mercado Pago',
   rx:/MERCADO PAGO INSTITUI[CÇ][AÃ]O DE PAGAMENTO LTDA\.[\s\S]*?(?=NU FINANCEIRA|COOPERATIVA DE CR[EÉ]DITO|BANCO DIGIO|PICPAY BANK|COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO|BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Cartão de crédito','credit_card',/Cart[aã]o de cr[eé]dito\s*-\s*compra [aà] vista e parcelado lojista\s*R\$\s*([\d.]+,\d{2})/i,'mercado-pago:cartao']]
  },
  {
   bank:'Nubank',
   rx:/NU FINANCEIRA S\.A\.[\s\S]*?(?=COOPERATIVA DE CR[EÉ]DITO, POUPAN[CÇ]A|BANCO DIGIO|PICPAY BANK|COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO|BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Cartão de crédito','credit_card',/Cart[aã]o de cr[eé]dito\s*R\$\s*([\d.]+,\d{2})/i,'nubank:cartao']]
  },
  {
   bank:'Digio',
   rx:/BANCO DIGIO S\.A\.[\s\S]*?(?=PICPAY BANK|COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO|BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Crédito pessoal','loan',/Cr[eé]dito pessoal\s*-\s*sem consigna[cç][aã]o em folha de pagamento\s*R\$\s*([\d.]+,\d{2})/i,'digio:pessoal']]
  },
  {
   bank:'PicPay',
   rx:/PICPAY BANK\s*-\s*BANCO M[ÚU]LTIPLO S\.A[\s\S]*?(?=COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO|BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Crédito pessoal','loan',/Cr[eé]dito pessoal\s*-\s*sem consigna[cç][aã]o em folha de pagamento\s*R\$\s*([\d.]+,\d{2})/i,'picpay:pessoal']]
  },
  {
   bank:'Cresol',
   rx:/COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO COM INTERA[CÇ][AÃ]O SOLID[ÁA]RIA ESS[EÊ]NCIA[\s\S]*?(?=BANCO COOPERATIVO SICOOB|Relat[oó]rio emitido por:|$)/i,
   rows:[['Cheque especial','overdraft',/Cheque especial\s*R\$\s*([\d.]+,\d{2})/i,'cresol:cheque']]
  },
  {
   bank:'Sicoob',
   rx:/BANCO COOPERATIVO SICOOB S\.A\.[\s\S]*?(?=Relat[oó]rio emitido por:|$)/i,
   rows:[['Cartão de crédito','credit_card',/Cart[aã]o de cr[eé]dito\s*-\s*compra [aà] vista e parcelado lojista\s*R\$\s*([\d.]+,\d{2})/i,'sicoob:cartao']]
  }
 ];

 for(const def of blocks){
   const m=t.match(def.rx); if(!m)continue;
   const block=m[0];
   for(const [detail,type,rx,key] of def.rows){
     add(def.bank,detail,type,moneyFromMatch(block,rx),key);
   }
 }

 // Sicredi spans page 2 -> page 3 in the supplied SCR, so parse it separately.
 const sicStart=t.search(/COOPERATIVA DE CR[EÉ]DITO, POUPAN[CÇ]A E INVESTIMENTO OURO BRANCO[\s\S]*?SICREDI OURO BRANCO RS\/MG/i);
 if(sicStart>=0){
   const after=t.slice(sicStart);
   const endCandidates=[
     after.search(/BANCO DIGIO S\.A\./i),
     after.search(/PICPAY BANK/i),
     after.search(/COOPERATIVA DE CR[EÉ]DITO E INVESTIMENTO COM INTERA[CÇ][AÃ]O SOLID[ÁA]RIA/i)
   ].filter(x=>x>0);
   const end=endCandidates.length?Math.min(...endCandidates):after.length;
   const b=after.slice(0,end);
   add('Sicredi','Crédito pessoal','loan',
     moneyFromMatch(b,/Cr[eé]dito pessoal\s*-\s*sem consigna[cç][aã]o em folha de pagamento\s*R\$\s*([\d.]+,\d{2})/i),
     'sicredi:pessoal');
   add('Sicredi','Cartão de crédito','credit_card',
     moneyFromMatch(b,/Cart[aã]o de cr[eé]dito\s*R\$\s*([\d.]+,\d{2})/i),
     'sicredi:cartao');
   add('Sicredi','Cheque especial','overdraft',
     moneyFromMatch(b,/Cheque especial\s*R\$\s*([\d.]+,\d{2})/i),
     'sicredi:cheque');
   add('Sicredi','Cartão — compras à vista/parceladas','credit_card',
     moneyFromMatch(b,/Cart[aã]o de cr[eé]dito\s*-\s*compra [aà] vista e parcelado lojista\s*R\$\s*([\d.]+,\d{2})/i),
     'sicredi:cartao-compras');
 }

 const refMonth=(t.match(/M[eê]s de refer[eê]ncia:\s*(\d{2}\/\d{4})/i)||[])[1]||'';
 const reportTotal=moneyFromMatch(t,/M[eê]s de refer[eê]ncia:\s*\d{2}\/\d{4}\s*R\$\s*([\d.]+,\d{2})/i);
 return {
   kind:'scr',
   title:'SCR / Registrato — Banco Central',
   reference:refMonth,
   reportTotal,
   items,
   note:'O SCR é uma fotografia mensal. Limites disponíveis não são somados como dívida. A importação atualiza contas equivalentes para evitar duplicidade.'
 };
}

/* ---------- NUBANK DDC ----------
   Parser desenhado a partir do Documento Descritivo de Crédito enviado.
*/
function parseNubankDDC(text){
 const t=compactPdfText(text);
 if(!/Documento Descritivo de Cr[eé]dito\s*-\s*DDC/i.test(t))return null;
 if(!/Saldo devedor consolidado:/i.test(t))return null;

 const consolidated=moneyFromMatch(t,/Saldo devedor consolidado:\s*R\$\s*([\d.]+,\d{2})/i);
 const usedLimit=moneyFromMatch(t,/Limite de cr[eé]dito utilizado:\s*R\$\s*([\d.]+,\d{2})/i);
 const totalLimit=moneyFromMatch(t,/Limite total:\s*R\$\s*([\d.]+,\d{2})/i);
 const opCount=Number((t.match(/Quantidade de opera[cç][oõ]es:\s*(\d+)/i)||[])[1]||0);
 const avgCet=(t.match(/Taxa de Juros Efetiva M[eé]dia Ponderada\s*\(a\.a%\):\s*([\d.,]+)%/i)||[])[1]||'';

 const items=[];
 const contractRx=/DADOS DO CONTRATO\s+N[uú]mero do contrato:\s*(\d+)([\s\S]*?)(?=DADOS DO CONTRATO\s+N[uú]mero do contrato:|$)/gi;
 let m;
 while((m=contractRx.exec(t))){
   const number=m[1],b=m[2];
   const amount=moneyFromMatch(b,/Saldo devedor total:\s*R\$\s*([\d.]+,\d{2})/i);
   if(!amount)continue;
   const modality=(b.match(/Modalidade:\s*([^\n]+?)(?=\s+Limite total:|\s+Valor financiado|\s+Valor original|\n|$)/i)||[])[1]?.trim()||'Operação de crédito';
   const cet=(b.match(/Custo efetivo total\s*\(CET\):\s*([\d.,]+)%\s*a\.a\./i)||[])[1]||'';
   const rate=(b.match(/Taxa de juros efetiva do contrato:\s*([\d.,]+)%\s*a\.a\./i)||[])[1]||'';
   const totalInstallments=Number((b.match(/Quantidade de parcelas:\s*(\d+)/i)||[])[1]||0);
   const paidInstallments=Number((b.match(/Quantidade de parcelas pagas:\s*(\d+)/i)||[])[1]||0);
   const remainingInstallments=Number((b.match(/Quantidade de parcelas [aà] vencer:\s*(\d+)/i)||[])[1]||0);
   const overdueInstallments=Number((b.match(/Quantidade de parcelas vencidas e n[aã]o pagas:\s*(\d+)/i)||[])[1]||0);
   const lastDue=(b.match(/Data de vencimento da [uú]ltima parcela:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
   items.push(makeImportItem({
     bank:'Nubank',
     detail:modality,
     type:'credit_card',
     amount,
     sourceKey:`nubank-ddc:${number}`,
     source:'nubank-ddc',
     meta:{contractNumber:number,cet,rate,totalInstallments,paidInstallments,remainingInstallments,overdueInstallments,lastDue,totalLimit}
   }));
 }

 return {
   kind:'nubank-ddc',
   title:'Nubank — Documento Descritivo de Crédito (DDC)',
   reference:'Atualizado pelo DDC',
   reportTotal:consolidated,
   items,
   meta:{consolidated,usedLimit,totalLimit,opCount,avgCet},
   note:`Saldo devedor consolidado: ${fmt.format(consolidated)}. O limite utilizado (${fmt.format(usedLimit)}) é apenas informativo e não é somado novamente.`
 };
}

async function extractPdfText(file){
 if(!window.pdfjsLib) throw new Error('Leitor de PDF não carregou. Feche o aplicativo e abra novamente com internet.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;
 const pages=[];
 for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);
   const content=await page.getTextContent();
   pages.push(content.items.map(x=>x.str).join(' '));
 }
 return pages.join('\n');
}
function resetPdfImport(){
 pendingPdfImport=null;
 els.pdfFileInput.value='';
 els.pdfReading.classList.add('hidden');
 els.pdfResult.classList.add('hidden');
 els.pdfItemsList.innerHTML='';
 els.pdfExtractPreview.textContent='';
}
function renderPdfPreview(result,text,file){
 pendingPdfImport=result;
 els.pdfDocumentType.textContent=result.title;
 const sum=result.items.filter(x=>x.selected).reduce((s,x)=>s+x.amount,0);
 els.pdfImportTotal.textContent=fmt.format(result.reportTotal||sum);
 els.pdfItemCount.textContent=`${result.items.length} ${result.items.length===1?'item':'itens'}`;
 els.pdfImportNotice.textContent=result.note||'Confira os itens antes de importar.';
 els.pdfItemsList.innerHTML=result.items.length?result.items.map((item,i)=>`
   <label class="pdf-import-item">
     <input type="checkbox" data-pdf-item="${i}" checked />
     <span class="pdf-item-icon">${accountTypeIcon(item.type)}</span>
     <span class="pdf-item-info">
       <strong>${esc(item.bank)} — ${esc(item.detail)}</strong>
       <small>${esc(accountTypeLabel(item.type))}${item.meta?.cet?` • CET ${esc(item.meta.cet)}% a.a.`:''}${item.meta?.remainingInstallments?` • ${item.meta.remainingInstallments} parcelas a vencer`:''}</small>
     </span>
     <b>${fmt.format(item.amount)}</b>
   </label>
 `).join(''):'<div class="empty">Nenhuma dívida compatível encontrada.</div>';
 els.pdfExtractPreview.textContent=`Arquivo: ${file.name}\nTipo: ${result.title}\n${result.reference?`Referência: ${result.reference}\n`:''}\n${text.slice(0,7000)}`;
 els.pdfResult.classList.remove('hidden');
}
async function handlePdf(file){
 if(!file)return;
 els.pdfReading.classList.remove('hidden');
 els.pdfResult.classList.add('hidden');
 try{
   const text=await extractPdfText(file);
   if(text.trim().length<30)throw new Error('Este PDF não possui texto suficiente para leitura automática.');
   const result=parseSCR(text)||parseNubankDDC(text);
   if(!result)throw new Error('Ainda não reconheço este modelo de PDF. Atualmente estão prontos: SCR/Registrato e DDC do Nubank.');
   renderPdfPreview(result,text,file);
 }catch(e){
   alert(e.message||'Não consegui interpretar o PDF.');
 }finally{
   els.pdfReading.classList.add('hidden');
 }
}
function findMatchingAccount(item){
 // 1) Exact source key from an earlier import.
 let a=state.accounts.find(x=>x.sourceKey&&x.sourceKey===item.sourceKey);
 if(a)return a;

 // 2) Same bank + normalized detail/type, including old manually-created account.
 const bn=normalizeName(item.bank),dn=normalizeName(item.detail);
 a=state.accounts.find(x=>{
   if(normalizeName(x.name)!==bn)return false;
   const sameType=(x.type||'other')===item.type || (!x.type && item.type==='other');
   const xd=normalizeName(x.detail||'');
   return sameType && (xd===dn || (!xd && item.detail));
 });
 return a||null;
}
function upsertImportedItem(item){
 const existing=findMatchingAccount(item);
 if(existing){
   // Keep payment history, but refresh the current debt balance and metadata.
   existing.name=item.bank;
   existing.detail=item.detail;
   existing.type=item.type;
   existing.original=item.amount + paid(existing); // remaining becomes imported current balance
   existing.source=item.source;
   existing.sourceKey=item.sourceKey;
   existing.importedAt=Date.now();
   existing.importMeta={...(existing.importMeta||{}),...(item.meta||{})};
   if(item.meta?.totalLimit)existing.cardLimit=item.meta.totalLimit;
   return 'updated';
 }
 const a={
   id:item.novoId||novoId(),
   name:item.bank,detail:item.detail,type:item.type,
   original:item.amount,payments:[],source:item.source,sourceKey:item.sourceKey,
   importedAt:Date.now(),importMeta:item.meta||{}
 };
 if(item.meta?.totalLimit)a.cardLimit=item.meta.totalLimit;
 state.accounts.push(a);
 return 'created';
}
function removeSupersededNubankScr(){
 // DDC is more current/detail-rich than the monthly SCR. Remove only Nubank rows imported from SCR.
 state.accounts=state.accounts.filter(a=>!(a.source==='scr' && normalizeName(a.name)==='nubank'));
}
async function savePdfImport(){
 if(!pendingPdfImport)return;
 const selected=pendingPdfImport.items.filter((x,i)=>{
   const cb=document.querySelector(`[data-pdf-item="${i}"]`);
   return cb?.checked;
 });
 if(!selected.length)return alert('Selecione pelo menos uma dívida para importar.');

 const kind=pendingPdfImport.kind;
 let created=0,updated=0,primeira=true;
 // ids decididos uma vez só, para a conta criada aqui e na nuvem ser a mesma
 selected.forEach(item=>{item.novoId=item.novoId||novoId();});
 await mutate(()=>{
   if(kind==='nubank-ddc')removeSupersededNubankScr();
   selected.forEach(item=>{
     const action=upsertImportedItem(item);
     if(primeira){if(action==='created')created++; else updated++;}
   });
   primeira=false;
 });
 els.pdfImportDialog.close();
 resetPdfImport();
 alert(`Importação concluída: ${created} criada(s) e ${updated} atualizada(s).`);
}
function linhaPagamento(p,naConta){
 const tit=naConta?dateBR(p.date):esc(p.accountName||''), sub=naConta?esc(p.note||''):`${dateBR(p.date)}${p.note?' • '+esc(p.note):''}`;
 return `<div class="payment-row"><div class="payment-meta"><strong>${tit}</strong>${sub?`<small>${sub}</small>`:''}</div><div class="payment-value"><strong>-${fmt.format(p.amount)}</strong><span class="row-actions"><button type="button" data-edit-payment="${p.accountId}|${p.id}">Editar</button><button type="button" data-delete-payment="${p.accountId}|${p.id}">Excluir</button></span></div></div>`;
}
/* FOLHA DA CONTA: o que antes ficava espalhado no cartão (pagar, editar,
   excluir, histórico) abre aqui, ao tocar na linha da conta. */
let sheetId=null, debtFilter='open';
function renderSheet(id){
 const a=state.accounts.find(x=>x.id===id); if(!a){els.accountSheet.close();return;}
 const p=paid(a),r=remaining(a),vi=vencInfo(a),tv=vi?textoVenc(vi,a):null;
 const meta=[];if(diaVenc(a))meta.push(`vence dia ${diaVenc(a)}`);if(a.installment)meta.push(`parcela ${fmt.format(a.installment)}`);if(a.type==='credit_card'&&a.cardLimit)meta.push(`limite ${fmt.format(a.cardLimit)}`);
 const pags=(a.payments||[]).map(x=>({...x,accountId:a.id})).sort((x,y)=>(y.date||'').localeCompare(x.date||''));
 $('#accountSheetBody').innerHTML=`<div class="sheet-handle"></div><div class="modal-head"><div><span class="eyebrow dark">${esc(accountTypeLabel(a.type))}</span><h3>${esc(a.name)}${a.detail?' · '+esc(a.detail):''}</h3></div><button type="button" class="close-btn" data-close="accountSheet">×</button></div>
  <div class="sheet-sum"><div><small>Falta</small><b>${fmt.format(r)}</b></div><div><small>Pago</small><b>${fmt.format(p)}</b></div><div><small>Original</small><b>${fmt.format(a.original)}</b></div></div>
  ${tv||meta.length?`<p class="sheet-meta">${tv?`<span class="${tv.cls}">${tv.txt}</span>${meta.length?' · ':''}`:''}${meta.join(' · ')}</p>`:''}
  <div class="sheet-acts"><button type="button" class="primary-btn" data-pay="${a.id}">Registrar pagamento</button><button type="button" class="ghost-btn" data-edit-account="${a.id}">Editar</button></div>
  <div class="block-head"><b>Pagamentos</b><span>${pags.length}</span></div>
  <div class="list">${pags.length?pags.map(x=>linhaPagamento(x,true)).join(''):'<div class="empty">Nenhum pagamento ainda.</div>'}</div>
  <button type="button" class="link-btn danger del-acc" data-delete-account="${a.id}">Excluir esta conta e o histórico</button>`;
}
function openSheet(id){sheetId=id;renderSheet(id);if(!els.accountSheet.open)els.accountSheet.showModal();}
function render(){
 const t=totals();
 els.totalRemaining.textContent=fmt.format(t.remaining);
 els.totalOriginal.textContent=`Original: ${fmt.format(t.original)}`;
 els.totalPaid.textContent=fmt.format(t.totalPaid);
 els.paidPercent.textContent=pct(t.original?Math.min(100,t.totalPaid/t.original*100):0);

 if(els.payoffForecast)els.payoffForecast.textContent=quitacao();
 renderDue();
 // quitadas saem da lista principal e ficam recolhidas no fim
 const ativas=state.accounts.filter(a=>remaining(a)>0.005), quitadas=state.accounts.filter(a=>remaining(a)<=0.005);
 const groups=[...new Set(ativas.map(a=>a.name))].map(name=>({
   name,
   accounts:ativas.filter(a=>a.name===name)
 }));
 els.paidOffList.innerHTML=quitadas.length?`<details class="paid-off"><summary>✓ Quitadas (${quitadas.length}) · ${esc([...new Set(quitadas.map(a=>a.name))].join(', '))}</summary>
   ${quitadas.map(a=>`<div class="paid-off-row"><span>${accountTypeIcon(a.type)} <b>${esc(accountDisplay(a))}</b><small>${fmt.format(a.original)} · ${(a.payments||[]).length} pagamentos</small></span><span><button class="link-btn" data-edit-account="${a.id}">Editar</button><button class="link-btn danger" data-delete-account="${a.id}">Excluir</button></span></div>`).join('')}</details>`:'';
 els.accountCount.textContent=`${groups.length} ${groups.length===1?'credor':'credores'} · ${ativas.length} ${ativas.length===1?'conta':'contas'}`;
 els.paymentAccount.innerHTML=state.accounts.map(a=>`<option value="${a.id}">${esc(accountDisplay(a))} — ${fmt.format(remaining(a))}</option>`).join('');

 // ----- Início -----
 const hb=$('#heroBar'); if(hb)hb.style.width=`${t.original?Math.min(100,t.totalPaid/t.original*100):0}%`;
 const hr=new Date().getHours(); const g=$('#greeting'); if(g)g.textContent=hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite';
 const mes=currentMonth(), custosMes=(state.costs||[]).filter(c=>c.date?.startsWith(mes)), totMes=custosMes.reduce((s,c)=>s+Number(c.amount||0),0);
 const pagMes=state.accounts.flatMap(a=>a.payments||[]).filter(p=>p.date?.startsWith(mes));
 const setTxt=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
 setTxt('#homeMonthName',monthLabel(mes).replace(/ de \d{4}$/,''));
 setTxt('#homeSpent',fmt.format(totMes));
 setTxt('#homePaid',fmt.format(pagMes.reduce((s,p)=>s+Number(p.amount||0),0)));
 setTxt('#homePaidCount',`${pagMes.length} ${pagMes.length===1?'pagamento':'pagamentos'}`);
 setTxt('#whoEmail',currentUser?.email||'');
 if(typeof pintaMais==='function'&&currentUser)pintaMais();

 // ----- Dívidas: uma linha por conta; o detalhe abre na folha -----
 const filtrar=a=>{
   if(debtFilter==='late'){const i=vencInfo(a);return !!(i&&i.atraso!=null);}
   if(debtFilter==='card')return a.type==='credit_card';
   if(debtFilter==='loan')return ['loan','consigned','financing'].includes(a.type);
   return true;
 };
 $$('#debtFilters [data-filter]').forEach(b=>b.classList.toggle('on',b.dataset.filter===debtFilter));
 const gruposVis=groups.map(gr=>({...gr,accounts:gr.accounts.filter(filtrar)})).filter(gr=>gr.accounts.length);
 els.accountsList.innerHTML=gruposVis.length?gruposVis.map(gr=>{
   const todas=groups.find(x=>x.name===gr.name).accounts;
   const original=todas.reduce((s,a)=>s+Number(a.original),0), totalPaid=todas.reduce((s,a)=>s+paid(a),0);
   const totalRemaining=Math.max(0,original-totalPaid), pctGrupo=original?Math.min(100,totalPaid/original*100):0;
   const linhas=gr.accounts.map((a,i)=>{
     const p=paid(a),r=remaining(a),apct=a.original?Math.min(100,p/a.original*100):0, vi=vencInfo(a), tv=vi?textoVenc(vi,a):null;
     const label=a.detail||(todas.length===1?accountTypeLabel(a.type):`Conta ${i+1}`);
     const meta=tv?`<span class="${tv.cls}">${tv.txt}</span>`:`<span>${esc(accountTypeLabel(a.type))}${a.type==='credit_card'&&a.cardLimit?` · limite ${fmt.format(a.cardLimit)}`:''}</span>`;
     return `<div class="sub-row" data-open-account="${a.id}" role="button" tabindex="0">
       <div class="sub-t"><b>${accountTypeIcon(a.type)} ${esc(label)}</b>${meta}<span class="mini-bar"><i style="width:${apct}%"></i></span></div>
       <div class="sub-v sub-account-balance"><b>${fmt.format(r)}</b></div>
       <button type="button" class="pay-mini" data-pay="${a.id}" aria-label="Registrar pagamento de ${esc(label)}">+</button>
     </div>`;}).join('');
   return `<article class="creditor-card">
     <div class="cred-head">${accountIcon(gr.name)}<div class="cred-t"><h3>${esc(gr.name)}</h3><span class="creditor-summary"><span>${todas.length} ${todas.length===1?'conta':'contas'} · ${pct(pctGrupo)} pago</span></span></div>
       <div class="cred-v account-balance"><b>${fmt.format(totalRemaining)}</b><small>de ${fmt.format(original)}</small></div></div>
     ${linhas}
     <button type="button" class="add-under" data-add-under="${esc(gr.name)}">+ conta em ${esc(gr.name)}</button>
   </article>`;
 }).join(''):`<div class="empty">${state.accounts.length?'Nenhuma conta neste filtro.':'Nenhuma conta cadastrada. Toque em “+ Conta”.'}</div>`;

 const allPayments=state.accounts.flatMap(a=>(a.payments||[]).map(p=>({...p,accountId:a.id,accountName:accountDisplay(a)}))).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));
 els.paymentsList.innerHTML=allPayments.length?allPayments.slice(0,8).map(linhaPagamento).join(''):'<div class="empty">Nenhum pagamento lançado.</div>';
 if(els.accountSheet?.open&&sheetId)renderSheet(sheetId);
 renderCosts();
}
function renderCosts(){
 const month=els.monthFilter.value||currentMonth(); if(!els.monthFilter.value)els.monthFilter.value=month;
 const rows=(state.costs||[]).filter(c=>c.date?.startsWith(month)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0));
 const total=rows.reduce((s,c)=>s+Number(c.amount||0),0);
 els.monthSpent.textContent=fmt.format(total); els.monthCount.textContent=`${rows.length} ${rows.length===1?'lançamento':'lançamentos'}`; els.monthName.textContent=monthLabel(month); els.costCount.textContent=els.monthCount.textContent;
 // comparação com o mês anterior
 const [my,mm]=month.split('-').map(Number), ant=isoD(new Date(my,mm-2,1,12)).slice(0,7);
 const totAnt=(state.costs||[]).filter(c=>c.date?.startsWith(ant)).reduce((s,c)=>s+Number(c.amount||0),0);
 if(els.monthCompare){
   if(totAnt>0){const d=(total-totAnt)/totAnt*100;els.monthCompare.textContent=`${d<=0?'↓':'↑'} ${Math.abs(Math.round(d))}% que ${new Date(my,mm-2,1).toLocaleDateString('pt-BR',{month:'long'})}`;els.monthCompare.className='muted compare '+(d<=0?'down':'up');}
   else els.monthCompare.textContent='';
 }
 const byCat={}; rows.forEach(c=>byCat[c.category]=(byCat[c.category]||0)+Number(c.amount||0));
 const lim=state.budgets||{}; Object.keys(lim).forEach(c=>{if(!(c in byCat))byCat[c]=0;});
 const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
 els.categorySummary.innerHTML=cats.length?cats.map(([cat,val])=>{const L=Number(lim[cat])||0,over=L&&val>L;
   return `<button type="button" class="category-card${over?' over':''}" data-budget="${esc(cat)}"><span class="category-icon">${categoryIcon(cat)}</span><div><small>${esc(cat)}</small><strong>${fmt.format(val)}</strong>${L?`<em>de ${fmt.format(L)}${over?' · passou':''}</em><span class="budget-bar"><i style="width:${Math.min(100,val/L*100)}%"></i></span>`:`<em>${total?((val/total)*100).toFixed(0):0}% do mês · toque p/ limite</em>`}</div></button>`;}).join('')
   :'<div class="empty wide">Sem gastos neste mês.</div>';
 els.costsList.innerHTML=rows.length?rows.map(c=>`<div class="payment-row"><div class="cost-left"><span class="small-icon">${categoryIcon(c.category)}</span><div class="payment-meta"><strong>${esc(c.place)}</strong><small>${esc(c.category)} • ${dateBR(c.date)}${c.note?' • '+esc(c.note):''}</small></div></div><div class="payment-value cost-value"><strong>${fmt.format(c.amount)}</strong><span class="row-actions"><button data-edit-cost="${c.id}">Editar</button><button data-delete-cost="${c.id}">Excluir</button></span></div></div>`).join(''):'<div class="empty">Nenhum gasto lançado.</div>';
}
const CATS_PADRAO=['Alimentação','Mercado','Combustível','Moradia','Contas fixas','Saúde','Lazer','Transporte','Compras','Outros'];
function fillCostCategories(sel){
 const el=els.costCategory, cur=sel||el.value;
 const todas=[...CATS_PADRAO,...(state.categories||[]).filter(c=>!CATS_PADRAO.includes(c))];
 el.innerHTML=todas.map(c=>`<option>${esc(c)}</option>`).join('')+'<option value="__nova">+ Nova categoria…</option>';
 if(cur&&todas.includes(cur))el.value=cur;
}
function setView(view){
 currentView=view;
 [['home','#homeView'],['debts','#debtsView'],['costs','#costsView'],['more','#moreView']].forEach(([v,id])=>$(id)?.classList.toggle('hidden',v!==view));
 $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 els.fab.setAttribute('aria-label',view==='costs'?'Novo gasto':'Registrar pagamento');
 window.scrollTo(0,0);
 render();
}
let editPay=null, editCost=null, editAcc=null;
function openPayment(id,valor,edit){
 if(!state.accounts.length)return alert('Adicione uma conta primeiro.');
 els.paymentForm.reset(); editPay=edit||null;
 els.paymentDate.value=today(); if(id)els.paymentAccount.value=id;
 if(valor)els.paymentAmount.value=valorCampo(valor);
 if(edit){const a=state.accounts.find(x=>x.id===edit.aid),p=a&&a.payments.find(x=>x.id===edit.pid);if(!p)return;
   els.paymentAccount.value=a.id;els.paymentAmount.value=valorCampo(p.amount);els.paymentDate.value=p.date||today();els.paymentNote.value=p.note||'';}
 els.paymentAccount.disabled=!!edit;
 sugestoes(); largura(els.paymentAmount);
 $('#paymentTitle').textContent=edit?'Editar pagamento':'Registrar pagamento';
 els.paymentDialog.showModal();
}
function openCost(edit){
 els.costForm.reset(); editCost=edit||null; fillCostCategories(); els.costDate.value=today();
 if(edit){const c=state.costs.find(x=>x.id===edit);if(!c)return;fillCostCategories(c.category);
   els.costAmount.value=valorCampo(c.amount);els.costPlace.value=c.place||'';els.costDate.value=c.date||today();els.costNote.value=c.note||'';}
 $('#costTitle').textContent=edit?'Editar gasto':'Novo gasto'; largura(els.costAmount);
 els.costDialog.showModal();
}
/* TECLADO DE DINHEIRO: o teclado do telefone para número muda de aparelho
   para aparelho (ponto ou vírgula, sem vírgula no iPhone...). Este é sempre
   igual: dígitos, vírgula e apagar, com no máximo 2 casas. */
function valorCampo(v){const n=Number(v)||0;return Number.isInteger(n)?String(n):n.toFixed(2).replace('.',',');}
/* o campo do valor cresce com o número: "R$" fica colado nele */
function largura(input){if(input)input.style.width=`${Math.max(1,(input.value||input.placeholder||'0').length)+0.4}ch`;}
function tecla(input,k){
 let v=input.value.replace(/[^\d,]/g,'');
 if(k==='back')v=v.slice(0,-1);
 else if(k===','){if(!v.includes(','))v=(v||'0')+',';}
 else{const [int,dec]=v.split(',');if(dec!==undefined){if(dec.length<2)v+=k;}else if(int.length<9)v=(int==='0'?'':int)+k;}
 input.value=v; largura(input);
}
function sugestoes(){
 const box=$('#paySuggest');if(!box)return;
 const a=state.accounts.find(x=>x.id===els.paymentAccount.value);
 if(!a||editPay){box.innerHTML='';return;}
 const r=remaining(a),it=[];
 if(a.installment&&a.installment<r-.001)it.push(['Parcela',a.installment]);
 if(r>0)it.push(['Tudo',r]);
 box.innerHTML=it.map(([n,v])=>`<button type="button" data-suggest="${v}">${n} ${fmt.format(v)}</button>`).join('');
}
/* DESFAZER: excluir pagamento ou gasto não pergunta nada -- some na hora e
   fica 7 segundos o "Desfazer". Perguntar antes não evitava o toque errado. */
let undoTimer=null;
function desfazer(msg,fn){
 const t=els.undoToast; t.querySelector('span').textContent=msg; t.classList.remove('hidden');
 t.querySelector('button').onclick=()=>{t.classList.add('hidden');clearTimeout(undoTimer);fn();};
 clearTimeout(undoTimer); undoTimer=setTimeout(()=>t.classList.add('hidden'),7000);
}

els.fab.addEventListener('click',()=>currentView==='costs'?openCost():openPayment());
$('#addCostBtn').addEventListener('click',()=>openCost());
$('#addAccountBtn').addEventListener('click',()=>openAccount());
$('#importPdfBtn').addEventListener('click',()=>{resetPdfImport();els.pdfImportDialog.showModal();});
els.pdfFileInput.addEventListener('change',e=>handlePdf(e.target.files?.[0]));
$('#savePdfImportBtn').addEventListener('click',savePdfImport);
$('#backupBtn').addEventListener('click',()=>els.backupDialog.showModal());
els.monthFilter.addEventListener('change',renderCosts);
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();
 const key=e.target.closest('[data-key]');if(key){const inp=document.getElementById(key.closest('[data-keypad]').dataset.keypad);if(inp)tecla(inp,key.dataset.key);return;}
 const sug=e.target.closest('[data-suggest]');if(sug){els.paymentAmount.value=valorCampo(sug.dataset.suggest);largura(els.paymentAmount);return;}
 const flt=e.target.closest('[data-filter]');if(flt){debtFilter=flt.dataset.filter;render();return;}
 const go=e.target.closest('[data-goto]');if(go){setView(go.dataset.goto);return;}
 const act=e.target.closest('[data-goto-action]');if(act){const k=act.dataset.gotoAction;if(k==='account')openAccount();else if(k==='perfil')abrePerfil();else{resetPdfImport();els.pdfImportDialog.showModal();}return;}
 // ações que abrem outra folha fecham a da conta antes
 if(e.target.closest('[data-pay],[data-edit-account],[data-delete-account],[data-edit-payment]')&&els.accountSheet.open&&!e.target.closest('[data-delete-payment]'))els.accountSheet.close();
 const pay0=e.target.closest('[data-pay]');if(pay0){openPayment(pay0.dataset.pay);return;}
 const open=e.target.closest('[data-open-account]');if(open){openSheet(open.dataset.openAccount);return;}
 const addUnder=e.target.closest('[data-add-under]');if(addUnder)openAccount(addUnder.dataset.addUnder);
 const payDue=e.target.closest('[data-pay-due]');if(payDue){const a=state.accounts.find(x=>x.id===payDue.dataset.payDue);if(a)openPayment(a.id,a.installment||'');}
 const edAcc=e.target.closest('[data-edit-account]');if(edAcc)openAccount('',edAcc.dataset.editAccount);
 const edPay=e.target.closest('[data-edit-payment]');if(edPay){const[aid,pid]=edPay.dataset.editPayment.split('|');openPayment(aid,'',{aid,pid});}
 const edCost=e.target.closest('[data-edit-cost]');if(edCost)openCost(edCost.dataset.editCost);
 const bud=e.target.closest('[data-budget]');if(bud){const cat=bud.dataset.budget,atual=(state.budgets||{})[cat]||'';
   const r=prompt(`Limite do mês para ${cat} (R$). Deixe vazio para tirar o limite.`,atual?String(atual).replace('.',','):'');
   if(r!==null){const v=brMoneyToNumber(r);mutate(s=>{s.budgets=s.budgets||{};if(v>0)s.budgets[cat]=v;else delete s.budgets[cat];});}}
 const delAcc=e.target.closest('[data-delete-account]');if(delAcc){const a=state.accounts.find(x=>x.id===delAcc.dataset.deleteAccount);if(a&&confirm(`Excluir ${accountDisplay(a)} e todo o histórico dela?`)){const id=a.id;mutate(s=>{s.accounts=s.accounts.filter(x=>x.id!==id);});}}
 const delPay=e.target.closest('[data-delete-payment]');if(delPay){const[aid,pid]=delPay.dataset.deletePayment.split('|');const a=state.accounts.find(x=>x.id===aid),p=a&&a.payments.find(x=>x.id===pid);
   if(p){const copia={...p};mutate(s=>{const x=s.accounts.find(y=>y.id===aid);if(x)x.payments=x.payments.filter(q=>q.id!==pid);});
     desfazer(`Pagamento de ${fmt.format(p.amount)} excluído`,()=>mutate(s=>{const x=s.accounts.find(y=>y.id===aid);if(x&&!x.payments.some(q=>q.id===copia.id))x.payments.push({...copia});}));}}
 const delCost=e.target.closest('[data-delete-cost]');if(delCost){const cid=delCost.dataset.deleteCost,c=state.costs.find(x=>x.id===cid);
   if(c){const copia={...c};mutate(s=>{s.costs=s.costs.filter(x=>x.id!==cid);});
     desfazer(`Gasto de ${fmt.format(c.amount)} excluído`,()=>mutate(s=>{if(!s.costs.some(x=>x.id===copia.id))s.costs.push({...copia});}));}}
});
els.paymentForm.addEventListener('submit',e=>{
 e.preventDefault();const a=state.accounts.find(x=>x.id===els.paymentAccount.value),amount=brMoneyToNumber(els.paymentAmount.value);if(!a||amount<=0)return;
 const r=remaining(a)+(editPay?Number((a.payments.find(x=>x.id===editPay.pid)||{}).amount||0):0);if(amount>r+.001&&!confirm(`O pagamento é maior que o saldo restante (${fmt.format(r)}). Registrar mesmo assim?`))return;
 if(editPay){const{aid,pid}=editPay,dados={amount,date:els.paymentDate.value,note:els.paymentNote.value.trim()};editPay=null;els.paymentDialog.close();
   mutate(s=>{const x=s.accounts.find(y=>y.id===aid),q=x&&x.payments.find(y=>y.id===pid);if(q)Object.assign(q,dados);});return;}
 const p={id:novoId(),amount,date:els.paymentDate.value,note:els.paymentNote.value.trim(),createdAt:Date.now()},aid=a.id;els.paymentDialog.close();mutate(s=>{const x=s.accounts.find(y=>y.id===aid);if(x&&!x.payments.some(y=>y.id===p.id))x.payments.push({...p});});
});
els.accountCreditor?.addEventListener('change',()=>{const creditor=els.accountCreditor.value;els.accountName.disabled=!!creditor;$('#accountNameLabel').classList.toggle('hidden',!!creditor);if(creditor)els.accountName.value=creditor;else els.accountName.value='';});
els.accountType?.addEventListener('change',toggleAccountTypeFields);
els.paymentAccount.addEventListener('change',sugestoes);
[els.paymentAmount,els.costAmount].forEach(i=>i.addEventListener('input',()=>largura(i)));
els.costCategory.addEventListener('change',()=>{
 if(els.costCategory.value!=='__nova')return;
 const nome=(prompt('Nome da nova categoria:','')||'').trim().slice(0,30);
 if(!nome||nome==='__nova'){fillCostCategories('Outros');return;}
 if(!(state.categories||[]).includes(nome)&&!CATS_PADRAO.includes(nome)){
   state.categories=[...(state.categories||[]),nome];
   mutate(s=>{s.categories=s.categories||[];if(!s.categories.includes(nome))s.categories.push(nome);});
 }
 fillCostCategories(nome);
});
els.accountForm.addEventListener('submit',e=>{e.preventDefault();const creditor=els.accountCreditor.value,name=(creditor||els.accountName.value).trim(),detail=els.accountDetail.value.trim(),type=els.accountType?.value||'other',original=Number(els.accountAmount.value);if(!name||original<=0)return;const dueDay=Math.min(31,Math.max(0,Math.round(Number(els.accountDueDay.value)||0)))||null,installment=Number(els.accountInstallment.value)||null;
 const campos=semIndefinidos({name,detail,type,original,dueDay,installment,cardDueDay:type==='credit_card'?dueDay:null,
   cardLimit:type==='credit_card'?(Number(els.cardLimit.value)||0):null,cardCloseDay:type==='credit_card'?(Number(els.cardCloseDay.value)||null):null});
 els.accountDialog.close();
 if(editAcc){const id=editAcc,ant=state.accounts.find(x=>x.id===id);editAcc=null;
   // dia do vencimento novo ou trocado: atraso só conta daqui para frente
   if(dueDay&&(!ant||diaVenc(ant)!==dueDay||!ant.vencDesde))campos.vencDesde=today();
   mutate(s=>{const x=s.accounts.find(y=>y.id===id);if(x)Object.assign(x,campos);});return;}
 const a={id:novoId(),...campos,payments:[],createdAt:Date.now()};if(dueDay)a.vencDesde=today();
 mutate(s=>{if(!s.accounts.some(y=>y.id===a.id))s.accounts.push(JSON.parse(JSON.stringify(a)));});});
els.costForm.addEventListener('submit',e=>{e.preventDefault();const amount=brMoneyToNumber(els.costAmount.value),place=els.costPlace.value.trim();if(amount<=0||!place)return;const cat=els.costCategory.value==='__nova'?'Outros':els.costCategory.value;
 const dados={amount,category:cat,place,date:els.costDate.value,note:els.costNote.value.trim()};els.monthFilter.value=els.costDate.value.slice(0,7);els.costDialog.close();
 if(editCost){const id=editCost;editCost=null;mutate(s=>{const x=s.costs.find(y=>y.id===id);if(x)Object.assign(x,dados);});return;}
 const c={id:novoId(),...dados,createdAt:Date.now()};mutate(s=>{if(!s.costs.some(y=>y.id===c.id))s.costs.push({...c});});});
$('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`minhas-contas-backup-${today()}.json`;a.click();URL.revokeObjectURL(url);});
$('#importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.accounts))throw new Error();data.costs||=[];state=data;save();els.backupDialog.close();alert('Backup importado com sucesso.');}catch{alert('Arquivo de backup inválido.');}e.target.value='';});

if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
els.monthFilter.value=currentMonth();
showLogin('Verificando acesso...');
onAuthStateChanged(auth,async user=>{
  if(user){
    try{
      loginGuardar(user);
      await startCloudSync(user);
      await carregaPerfil(user);
      unlock();
    }catch(err){
      console.error(err);
      showLogin(msgDados(err));
    }
  }else{
    currentUser=null; cloudReady=false;
    if(unsubscribeData){unsubscribeData();unsubscribeData=null;}
    state=blankState(); PERFIL={};
    render();
    prepararPorta(false);
    showLogin();
  }
});
render();

/* ================= PORTA COM FOTO (como a da Central RM) =================
   Neste telefone ficam só: o e-mail e o primeiro nome de quem marcou
   "Lembrar meu e-mail" (minhas-contas-login) e a foto de cada conta
   (minhas-contas-fotos). A foto também fica na conta, em users/<uid>/perfil
   -- separada das contas, para não pesar a cada gravação --, e chega a um
   telefone novo depois do primeiro login. A senha nunca é guardada. */
const LOGIN_KEY='minhas-contas-login', FOTOS_KEY='minhas-contas-fotos';
let lembrarAoEntrar, PERFIL={}, fotoPendente;
function loginLembrado(){try{const v=JSON.parse(localStorage.getItem(LOGIN_KEY)||'null');return v&&v.email?v:null;}catch{return null;}}
function fotosAparelho(){try{return JSON.parse(localStorage.getItem(FOTOS_KEY)||'{}');}catch{return {};}}
function fotoGrava(email,foto){try{const m=fotosAparelho(),k=String(email||'').toLowerCase();if(!k)return;if(foto)m[k]=foto;else delete m[k];localStorage.setItem(FOTOS_KEY,JSON.stringify(m));}catch{}}
function primeiroNome(nome,email){
 const n=String(nome||'').trim().split(/\s+/)[0];
 if(n)return n.charAt(0).toUpperCase()+n.slice(1);
 const l=String(email||'').split('@')[0].split(/[._-]/)[0];
 return l?l.charAt(0).toUpperCase()+l.slice(1):'';
}
/* "fulano.exemplo@email.com" -> "fula•••@email.com" */
function emailMetade(email){
 const [l,d]=String(email||'').split('@'); if(!d)return email||'';
 const mostra=l.length>=6?4:Math.max(1,l.length-2);
 return l.slice(0,mostra)+'•••@'+d;
}
function saudacao(){const h=new Date().getHours();return h>=5&&h<12?'Bom dia,':h>=12&&h<18?'Boa tarde,':'Boa noite,';}
function pintaFoto(el,ini,email,nome,conta,foto){
 if(!el)return;
 foto=foto!==undefined?foto:(email?fotosAparelho()[String(email).toLowerCase()]:null);
 el.classList.toggle('conta',!!(conta||foto)); el.classList.toggle('com-foto',!!foto);
 el.style.backgroundImage=foto?`url("${foto}")`:'';
 if(ini)ini.textContent=(nome||email||'?').trim().charAt(0).toUpperCase();
}
function prepararPorta(forcarForm){
 const tela=els.loginScreen, lemb=forcarForm?null:loginLembrado(), guardado=loginLembrado();
 tela.classList.toggle('lembrado',!!lemb);
 els.loginPassword.value=''; els.loginPassword.type='password';
 const olho=$('#loginEye'); if(olho){olho.setAttribute('aria-pressed','false');olho.setAttribute('aria-label','Mostrar senha');}
 const volta=$('#loginBack');
 if(volta){volta.classList.toggle('on',!lemb&&!!guardado);volta.textContent=guardado?`← Voltar para ${guardado.nome||emailMetade(guardado.email)}`:'';}
 if(lemb){
   els.loginEmail.value=lemb.email;
   $('#loginGreeting').textContent=saudacao();
   $('#loginName').textContent=lemb.nome||primeiroNome('',lemb.email);
   $('#loginAccountEmail').textContent=emailMetade(lemb.email);
   els.loginHelp.textContent='';
   pintaFoto($('#loginPhoto'),$('#loginInitial'),lemb.email,lemb.nome,true);
 }else{
   if(forcarForm)els.loginEmail.value='';
   const cx=$('#loginRemember'); if(cx)cx.checked=true;
   els.loginHelp.textContent='Entre com seu e-mail e senha.';
   pintaFoto($('#loginPhoto'),$('#loginInitial'),els.loginEmail.value.trim(),'',false);
 }
}
function loginGuardar(user){
 const atual=loginLembrado(), mesma=atual&&atual.email.toLowerCase()===String(user.email).toLowerCase();
 const nome=primeiroNome(PERFIL.nome,user.email);
 try{
   if(lembrarAoEntrar===true)localStorage.setItem(LOGIN_KEY,JSON.stringify({email:user.email,nome:mesma&&atual.nome?atual.nome:nome}));
   // desmarcada: não guarda esta conta, e só esquece a lembrada se for a mesma
   else if(lembrarAoEntrar===false&&mesma)localStorage.removeItem(LOGIN_KEY);
 }catch{}
 lembrarAoEntrar=undefined;
}
function nomeLembrado(email,nome){
 const atual=loginLembrado();
 if(atual&&atual.email.toLowerCase()===String(email).toLowerCase()&&nome){try{localStorage.setItem(LOGIN_KEY,JSON.stringify({email:atual.email,nome:primeiroNome(nome,email)}));}catch{}}
}
async function carregaPerfil(user){
 try{
   const sn=await get(ref(db,`users/${user.uid}/perfil`));
   if(!sn.exists()){PERFIL={};return;}
   PERFIL=sn.val()||{};
   fotoGrava(user.email,PERFIL.foto||null);
   if(PERFIL.nome)nomeLembrado(user.email,PERFIL.nome);
 }catch(err){console.warn('perfil',err);PERFIL={};}
 pintaMais();
}
function pintaMais(){
 const em=currentUser?.email||''; const foto=PERFIL.foto||fotosAparelho()[em.toLowerCase()]||null;
 const el=$('#moreAvatar'); if(!el)return;
 el.style.backgroundImage=foto?`url("${foto}")`:''; el.classList.toggle('com-foto',!!foto);
 el.textContent=foto?'':primeiroNome(PERFIL.nome,em).charAt(0);
}
/* foto escolhida: recorte quadrado no centro, 320 px, JPEG -- uns 20 KB */
function preparaFoto(file){
 return new Promise((ok,falha)=>{
   const url=URL.createObjectURL(file), img=new Image();
   img.onload=()=>{const t=320,c=document.createElement('canvas');c.width=c.height=t;
     const lado=Math.min(img.naturalWidth,img.naturalHeight),sx=(img.naturalWidth-lado)/2,sy=(img.naturalHeight-lado)/2;
     const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,t,t);g.drawImage(img,sx,sy,lado,lado,0,0,t,t);
     URL.revokeObjectURL(url);ok(c.toDataURL('image/jpeg',.82));};
   img.onerror=()=>{URL.revokeObjectURL(url);falha(new Error('imagem'));};
   img.src=url;
 });
}
function abrePerfil(){
 const em=currentUser?.email||''; fotoPendente=undefined;
 $('#profileName').value=PERFIL.nome||'';
 pintaFoto($('#profilePreview'),$('#profileInitial'),em,PERFIL.nome,true,PERFIL.foto||fotosAparelho()[em.toLowerCase()]||null);
 $('#profileDialog').showModal();
}
$('#profilePhotoInput').addEventListener('change',async e=>{
 const f=e.target.files?.[0]; e.target.value=''; if(!f)return;
 try{fotoPendente=await preparaFoto(f);pintaFoto($('#profilePreview'),$('#profileInitial'),'',$('#profileName').value,true,fotoPendente);}
 catch{alert('Não consegui abrir esta imagem. Tente outra foto.');}
});
$('#profileRemove').addEventListener('click',()=>{fotoPendente=null;pintaFoto($('#profilePreview'),$('#profileInitial'),'',$('#profileName').value||currentUser?.email,true,null);});
$('#profileSave').addEventListener('click',async()=>{
 if(!currentUser)return;
 const nome=$('#profileName').value.trim().slice(0,40);
 const foto=fotoPendente!==undefined?fotoPendente:(PERFIL.foto||null);
 const novo={nome:nome||null,foto:foto||null};
 try{await set(ref(db,`users/${currentUser.uid}/perfil`),novo);}
 catch(err){alert('Não foi possível salvar na nuvem: '+msgDados(err));return;}
 PERFIL=novo; fotoGrava(currentUser.email,novo.foto); if(nome)nomeLembrado(currentUser.email,nome);
 pintaMais(); $('#profileDialog').close();
});
$('#loginEye').addEventListener('click',()=>{const b=$('#loginEye'),v=els.loginPassword.type==='password';els.loginPassword.type=v?'text':'password';b.setAttribute('aria-pressed',String(v));b.setAttribute('aria-label',v?'Esconder senha':'Mostrar senha');});
$('#loginOther').addEventListener('click',()=>{prepararPorta(true);els.loginEmail.focus();});
$('#loginSwap').addEventListener('click',()=>{prepararPorta(true);els.loginEmail.focus();});
$('#loginBack').addEventListener('click',()=>{prepararPorta(false);els.loginPassword.focus();});
els.loginEmail.addEventListener('input',()=>{if(!els.loginScreen.classList.contains('lembrado'))pintaFoto($('#loginPhoto'),$('#loginInitial'),els.loginEmail.value.trim(),'',false);});
if(!currentUser){const msg=els.loginHelp.textContent;prepararPorta(false);if(!els.loginScreen.classList.contains('lembrado'))els.loginHelp.textContent=msg;}

/* MULTIUSUARIO */
const createAccountBtn=document.querySelector('#createAccountBtn'),forgotPasswordBtn=document.querySelector('#forgotPasswordBtn'),createAccountDialog=document.querySelector('#createAccountDialog'),createAccountForm=document.querySelector('#createAccountForm');
createAccountBtn?.addEventListener('click',()=>createAccountDialog.showModal());
createAccountForm?.addEventListener('submit',async e=>{
 e.preventDefault();
 const email=document.querySelector('#newUserEmail').value.trim();
 const p1=document.querySelector('#newUserPassword').value;
 const p2=document.querySelector('#newUserPassword2').value;
 if(p1!==p2)return alert('As senhas não conferem.');
 if(p1.length<6)return alert('A senha precisa ter pelo menos 6 caracteres.');
 try{
   await createUserWithEmailAndPassword(auth,email,p1);
   createAccountDialog.close();
   createAccountForm.reset();
   // Firebase faz login automaticamente; onAuthStateChanged abre o app e cria banco vazio.
 }catch(err){
   const msg={
    'auth/email-already-in-use':'Este e-mail já possui uma conta.',
    'auth/invalid-email':'Informe um e-mail válido.',
    'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
    'auth/operation-not-allowed':'Ative Email/Senha no Firebase Authentication.'
   }[err.code] || `Não foi possível criar a conta (${err.code||'erro'}).`;
   alert(msg);
 }
});
forgotPasswordBtn?.addEventListener('click',async()=>{const email=(document.querySelector('#loginEmail')?.value||document.querySelector('input[type="email"]')?.value||'').trim();if(!email)return alert('Digite seu e-mail primeiro.');try{await sendPasswordResetEmail(auth,email);alert('E-mail de recuperação enviado.');}catch(e){alert('Confira o e-mail informado.');}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)document.getElementById(b.dataset.close)?.close();});
