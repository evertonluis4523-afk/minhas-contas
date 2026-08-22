import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
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
let currentUser=null;
function userDataPath(){if(!currentUser?.uid)throw new Error('Usuário não autenticado');return `rm_contas_usuarios/${currentUser.uid}`;}

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
 debtsView:$('#debtsView'),costsView:$('#costsView'),backupDialog:$('#backupDialog'),pdfImportDialog:$('#pdfImportDialog'),pdfFileInput:$('#pdfFileInput'),pdfReading:$('#pdfReading'),pdfResult:$('#pdfResult'),pdfDocumentType:$('#pdfDocumentType'),pdfImportTotal:$('#pdfImportTotal'),pdfImportNotice:$('#pdfImportNotice'),pdfItemCount:$('#pdfItemCount'),pdfItemsList:$('#pdfItemsList'),pdfExtractPreview:$('#pdfExtractPreview'),fab:$('#fab')
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
   id:crypto.randomUUID?.()||String(Date.now()),
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

 if(pendingPdfImport.kind==='nubank-ddc')removeSupersededNubankScr();

 let created=0,updated=0;
 selected.forEach(item=>{
   const action=upsertImportedItem(item);
   if(action==='created')created++; else updated++;
 });

 await save();
 els.pdfImportDialog.close();
 resetPdfImport();
 alert(`Importação concluída: ${created} criada(s) e ${updated} atualizada(s).`);
}
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
$('#savePdfImportBtn').addEventListener('click',savePdfImport);
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

/* MULTIUSUARIO */
const createAccountBtn=document.querySelector('#createAccountBtn'),forgotPasswordBtn=document.querySelector('#forgotPasswordBtn'),createAccountDialog=document.querySelector('#createAccountDialog'),createAccountForm=document.querySelector('#createAccountForm');
createAccountBtn?.addEventListener('click',()=>createAccountDialog.showModal());
createAccountForm?.addEventListener('submit',async e=>{e.preventDefault();const email=document.querySelector('#newUserEmail').value.trim(),p1=document.querySelector('#newUserPassword').value,p2=document.querySelector('#newUserPassword2').value;if(p1!==p2)return alert('As senhas não conferem.');try{const c=await createUserWithEmailAndPassword(auth,email,p1);currentUser=c.user;createAccountDialog.close();createAccountForm.reset();alert('Conta criada com sucesso.');}catch(err){alert(err.code==='auth/email-already-in-use'?'Este e-mail já possui conta.':'Não foi possível criar a conta.');}});
forgotPasswordBtn?.addEventListener('click',async()=>{const email=(document.querySelector('#loginEmail')?.value||document.querySelector('input[type="email"]')?.value||'').trim();if(!email)return alert('Digite seu e-mail primeiro.');try{await sendPasswordResetEmail(auth,email);alert('E-mail de recuperação enviado.');}catch(e){alert('Confira o e-mail informado.');}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)document.getElementById(b.dataset.close)?.close();});
