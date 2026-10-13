/* BATERIA DO MINHAS CONTAS
   Roda com:  NODE_PATH=$(npm root -g) node testes/roda.js [filtro]
   O app abre num celular simulado (Playwright). O Firebase é trocado por um
   falso, em memória, com os mesmos nomes de funções (auth, get, set, onValue,
   runTransaction...): nada sai do computador, e os dados são fictícios. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const filtro = process.argv[2] || '';

/* ---------- Firebase de mentira ---------- */
const FAKE = {
  'firebase-app.js': 'export function initializeApp(){return {};}',
  'firebase-auth.js': `
    const F=window.__fb;
    export function getAuth(){return {};}
    export function onAuthStateChanged(a,cb){ F.authCb=cb; setTimeout(()=>cb(F.user),20); return ()=>{}; }
    export async function signInWithEmailAndPassword(a,e,p){ if(F.loginErro){const x=new Error(F.loginErro);x.code=F.loginErro;throw x;} F.user={uid:'u1',email:e}; F.authCb&&F.authCb(F.user); }
    export async function createUserWithEmailAndPassword(a,e,p){ F.user={uid:'u1',email:e}; F.authCb&&F.authCb(F.user); }
    export async function sendPasswordResetEmail(){ F.reset=(F.reset||0)+1; }
    export async function signOut(){ F.user=null; F.authCb&&F.authCb(null); }`,
  'firebase-database.js': `
    const F=window.__fb;
    const clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
    const ler=p=>p.split('/').reduce((o,k)=>o==null?undefined:o[k],F.db);
    const gravar=(p,v)=>{const ks=p.split('/');let o=F.db;ks.slice(0,-1).forEach(k=>{o[k]=o[k]||{};o=o[k];});o[ks[ks.length-1]]=clone(v);
      F.escritas.push(p); (F.ouvintes[p]||[]).forEach(cb=>cb(snap(p)));};
    const snap=p=>{const v=ler(p);return {exists:()=>v!=null,val:()=>clone(v)};};
    const negado=p=>F.negado&&p.startsWith('users/');
    const erro=()=>{const e=new Error('PERMISSION_DENIED: Permission denied');e.code='PERMISSION_DENIED';return e;};
    export function getDatabase(){return {};}
    export function ref(d,p){return p;}
    export async function get(p){ if(negado(p))throw erro(); return snap(p); }
    export async function set(p,v){ if(negado(p))throw erro(); F.sets=(F.sets||0)+1; gravar(p,v); }
    export function onValue(p,cb,err){ if(negado(p)){err&&err(erro());return ()=>{};} (F.ouvintes[p]=F.ouvintes[p]||[]).push(cb); cb(snap(p)); return ()=>{}; }
    export async function runTransaction(p,fn){ if(negado(p))throw erro(); F.transacoes=(F.transacoes||0)+1; const v=fn(clone(ler(p))); if(v!==undefined) gravar(p,v); return {committed:true,snapshot:snap(p)}; }
    window.__fbGravarDeFora=gravar;`
};

const DADOS = () => ({ accounts: [
  { id: 'a1', name: 'Banco Alfa', detail: 'Cartão Visa', type: 'credit_card', original: 4200, cardLimit: 6000, cardDueDay: 10, payments: [{ id: 'p1', amount: 800, date: '2026-09-10', note: 'fatura' }] },
  { id: 'a2', name: 'Banco Alfa', detail: 'Empréstimo 01', type: 'loan', original: 9000, payments: [{ id: 'p2', amount: 1500, date: '2026-08-05' }, { id: 'p3', amount: 1500, date: '2026-09-05' }] },
  { id: 'a3', name: 'Cooperativa Beta', detail: 'Consignado', type: 'consigned', original: 7300, payments: [] },
  { id: 'a4', name: 'Loja Gama', detail: 'Crediário', type: 'other', original: 950, payments: [{ id: 'p4', amount: 950, date: '2026-10-01' }] }],
  costs: [{ id: 'c1', amount: 312.4, category: 'Mercado', place: 'Mercado Exemplo', date: '2026-10-04' },
    { id: 'c2', amount: 180, category: 'Combustível', place: 'Posto Modelo', date: '2026-10-07' }] });

async function abre(b, opt = {}) {
  const ctx = await b.newContext({ viewport: opt.tela || { width: 390, height: 844 }, colorScheme: opt.escuro ? 'dark' : 'light', isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const pg = await ctx.newPage(); const erros = [];
  pg.on('pageerror', e => erros.push(String(e.message).slice(0, 200)));
  pg.__respostas = [];
  pg.on('dialog', d => { (pg.__dialogos = pg.__dialogos || []).push(d.message());
    if (d.type() === 'prompt') d.accept(pg.__respostas.shift() || '').catch(() => {}); else d.accept().catch(() => {}); });
  if (opt.relogio) await pg.clock.setFixedTime(new Date(opt.relogio));
  await pg.addInitScript(o => {
    window.__fb = { user: o.logado === false ? null : { uid: 'u1', email: 'exemplo@email.com' }, db: { users: { u1: { finance: o.dados } } },
      ouvintes: {}, escritas: [], negado: !!o.negado, loginErro: o.loginErro || null };
  }, { dados: opt.dados || DADOS(), logado: opt.logado, negado: opt.negado, loginErro: opt.loginErro });
  await pg.route('**/*', r => {
    const u = new URL(r.request().url());
    const m = u.pathname.match(/(firebase-[a-z]+\.js)$/);
    if (m && FAKE[m[1]]) return r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE[m[1]] });
    if (u.hostname === 'app.local') {
      const f = path.join(RAIZ, decodeURIComponent(u.pathname.slice(1)) || 'index.html');
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }[path.extname(f)] || 'text/html';
        return r.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
      }
      return r.fulfill({ status: 404, body: '' });
    }
    return r.abort();
  });
  await pg.goto('http://app.local/index.html');
  await pg.waitForTimeout(opt.espera || 700);
  return { ctx, pg, erros };
}

/* ---------- testes ---------- */
const TESTES = [];
const teste = (nome, fn) => TESTES.push({ nome, fn });

teste('icones-e-modo-offline', async (b, t) => {
  // os ícones apontavam para icons/, que não existe: ícone quebrado ao
  // instalar e o service worker não instalava (addAll falha com um 404)
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const existe = p => fs.existsSync(path.join(RAIZ, p.replace(/^\.\//, '')));
  const touch = (html.match(/rel="apple-touch-icon" href="([^"]+)"/) || [])[1] || '';
  t.ok('ícone do iPhone existe', !!touch && existe(touch), touch);
  t.ok('ícones do manifest existem', man.icons.length && man.icons.every(i => existe(i.src)), JSON.stringify(man.icons.map(i => i.src)));
  const assets = ((sw.match(/ASSETS\s*=\s*\[([^\]]*)\]/) || [])[1] || '').match(/'([^']+)'/g) || [];
  t.ok('todo arquivo guardado para sem internet existe', assets.length && assets.map(a => a.slice(1, -1)).filter(a => a !== './').every(existe), assets.join(','));
  // sempre a rede primeiro: a versão nova chega na próxima abertura
  const sw1 = sw.replace(/\s+/g, ' ');
  t.ok('service worker: rede primeiro, cópia só sem internet', /respondWith\( ?fetch\(/.test(sw1) && /\.catch\(\(\) ?=> ?caches\.match/.test(sw1), '');
});

teste('data-de-hoje-no-horario-de-brasilia', async (b, t) => {
  // às 22h30 de Brasília já é dia seguinte em UTC: o pagamento saía com a data de amanhã
  const { ctx, pg, erros } = await abre(b, { relogio: '2026-10-13T22:30:00-03:00' });
  const d = await pg.evaluate(() => { document.querySelector('[data-pay]').click(); return document.getElementById('paymentDate').value; }).catch(e => 'erro ' + e.message);
  t.ok('pagamento às 22h30 vem com a data de hoje (13/10)', d === '2026-10-13', d);
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('login-sem-botoes-repetidos-e-mensagens-claras', async (b, t) => {
  const a = await abre(b, { logado: false });
  const r = await a.pg.evaluate(() => {
    const vis = e => e.offsetParent !== null;
    const txt = [...document.querySelectorAll('#loginScreen button')].filter(vis).map(x => x.textContent.trim());
    return { esqueci: txt.filter(x => /esqueci/i.test(x)).length, criar: txt.filter(x => /criar/i.test(x)).length, txt };
  });
  t.ok('um botão "Esqueci minha senha" e um de criar conta', r.esqueci === 1 && r.criar === 1, JSON.stringify(r.txt));
  await a.ctx.close();
  const c = await abre(b, { logado: false, loginErro: 'auth/invalid-credential' });
  await c.pg.fill('#loginEmail', 'exemplo@email.com'); await c.pg.fill('#loginPassword', 'errada1'); await c.pg.click('#loginSubmit'); await c.pg.waitForTimeout(200);
  const m1 = await c.pg.textContent('#loginHelp');
  t.ok('senha errada: "E-mail ou senha incorretos."', /E-mail ou senha incorretos/.test(m1), m1);
  await c.ctx.close();
  const d = await abre(b, { negado: true });
  const m2 = await d.pg.textContent('#loginHelp');
  t.ok('Firebase recusou os dados: a mensagem diz isso (não "senha incorreta")', /recusou/i.test(m2) && /regras/i.test(m2), m2);
  await d.ctx.close();
});

teste('numeros-e-mes-em-portugues', async (b, t) => {
  const { ctx, pg, erros } = await abre(b);
  const pct = await pg.textContent('#paidPercent');
  t.ok('percentual com vírgula (22,1%)', pct.trim() === '22,1%', pct);
  const sub = await pg.evaluate(() => [...document.querySelectorAll('.creditor-summary span')].map(x => x.textContent).join(' | '));
  t.ok('percentual por credor com vírgula', /28,8%/.test(sub) && !/\d\.\d%/.test(sub), sub);
  await pg.evaluate(() => { document.querySelector('.nav-btn[data-view="costs"]').click(); const m = document.getElementById('monthFilter'); m.value = '2026-10'; m.dispatchEvent(new Event('change')); });
  const mes = await pg.evaluate(() => document.getElementById('monthName').innerText);
  t.ok('mês: "Outubro de 2026"', mes.trim() === 'Outubro de 2026', mes);
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('dois-aparelhos-nao-apagam-um-ao-outro', async (b, t) => {
  // cada gravação mandava a cópia inteira do aparelho: o que outro aparelho
  // tivesse lançado no meio tempo sumia
  const { ctx, pg, erros } = await abre(b);
  const r = await pg.evaluate(async () => {
    const esp = ms => new Promise(x => setTimeout(x, ms));
    // outro aparelho lança um gasto direto na nuvem, sem este ficar sabendo
    const F = window.__fb, nuvem = JSON.parse(JSON.stringify(F.db.users.u1.finance));
    nuvem.costs.push({ id: 'cx', amount: 50, category: 'Outros', place: 'Lançado no outro aparelho', date: '2026-10-12' });
    F.db.users.u1.finance = nuvem;
    // este aparelho registra um pagamento
    document.querySelector('[data-pay="a3"]').click(); await esp(50);
    document.getElementById('paymentAmount').value = '412';
    document.getElementById('paymentForm').requestSubmit(); await esp(150);
    const f = F.db.users.u1.finance;
    return { custos: f.costs.map(c => c.id), pagA3: (f.accounts.find(a => a.id === 'a3') || {}).payments.length, transacoes: F.transacoes || 0, sets: F.sets || 0 };
  }).catch(e => ({ erro: e.message }));
  t.ok('o gasto do outro aparelho continua na nuvem', !r.erro && r.custos.includes('cx'), JSON.stringify(r));
  t.ok('e o pagamento deste aparelho também entrou', !r.erro && r.pagA3 === 1, JSON.stringify(r));
  t.ok('gravou por transação (junta com a nuvem)', !r.erro && r.transacoes >= 1, JSON.stringify(r));
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('tela-sem-armadilhas', async (b, t) => {
  const { ctx, pg, erros } = await abre(b);
  const r = await pg.evaluate(() => {
    const limpar = !!document.getElementById('clearPaymentsBtn');
    const navIcones = [...document.querySelectorAll('.nav-btn')].every(n => !!n.querySelector('svg'));
    // nenhum botão de ação flutuando por cima dos cartões
    const cobre = []; const fab = document.getElementById('fab');
    if (fab && getComputedStyle(fab).position === 'fixed' && !fab.closest('.bottom-nav')) {
      const f = fab.getBoundingClientRect();
      document.querySelectorAll('.sub-account-balance, .account-balance').forEach(e => { const q = e.getBoundingClientRect();
        if (q.bottom > f.top && q.top < f.bottom && q.right > f.left && q.left < f.right) cobre.push(e.textContent.trim().slice(0, 30)); });
      if (!cobre.length) cobre.push('botão + solto fora da barra');
    }
    const excluir = [...document.querySelectorAll('[data-delete-account]')].map(x => getComputedStyle(x).backgroundColor);
    return { limpar, navIcones, cobre, excluir };
  });
  t.ok('sem o "Limpar" que apagava todo o histórico de pagamentos', !r.limpar, JSON.stringify(r));
  t.ok('ícones da barra de baixo desenhados (não caractere que quebra)', r.navIcones, JSON.stringify(r));
  t.ok('o botão + fica na barra de baixo, sem cobrir valores', !r.cobre.length, JSON.stringify(r.cobre));
  t.ok('"Excluir conta" discreto (sem fundo colorido)', r.excluir.length && r.excluir.every(c => c === 'rgba(0, 0, 0, 0)'), JSON.stringify(r.excluir));
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

/* ---------- etapa B: vencimentos, Paguei, editar, desfazer, gastos ---------- */
const DADOS_B = () => { const d = DADOS();
  Object.assign(d.accounts[0], { cardDueDay: 15, dueDay: 15 });                                  // cartão: vence dia 15, pago em 10/09
  Object.assign(d.accounts[1], { dueDay: 5, installment: 1500, vencDesde: '2026-08-01' });        // empréstimo: dia 5 de outubro sem pagamento
  Object.assign(d.accounts[2], { dueDay: 20, installment: 412, vencDesde: '2026-10-01' });        // consignado: dia 20
  d.costs.push({ id: 'c0', amount: 1000, category: 'Mercado', place: 'Compra do mês passado', date: '2026-09-20' });
  return d; };
const HOJE = '2026-10-13T12:00:00-03:00';
const nuvem = pg => pg.evaluate(() => JSON.parse(JSON.stringify(window.__fb.db.users.u1.finance)));

teste('vencimentos-e-paguei', async (b, t) => {
  const { ctx, pg, erros } = await abre(b, { relogio: HOJE, dados: DADOS_B() });
  const lista = await pg.evaluate(() => [...document.querySelectorAll('#dueList [data-due]')].map(x => x.getAttribute('data-due') + ' | ' + x.textContent.replace(/\s+/g, ' ').trim()));
  t.ok('atrasada primeiro: Empréstimo, "atrasado 8 dias", R$ 1.500,00', /^a2 \|.*Empréstimo 01.*atrasad[oa] 8 dias.*R\$\s?1\.500,00/.test(lista[0] || ''), JSON.stringify(lista));
  t.ok('depois o cartão, "vence em 2 dias"', /^a1 \|.*vence em 2 dias/.test(lista[1] || ''), JSON.stringify(lista));
  t.ok('consignado: "vence em 7 dias" e "faltam 18 parcelas"', /^a3 \|.*vence em 7 dias.*faltam 18 parcelas/.test(lista[2] || ''), JSON.stringify(lista));
  t.ok('quitada não entra nos vencimentos', !lista.some(x => /^a4/.test(x)), JSON.stringify(lista));
  await pg.click('#dueList [data-due="a2"] [data-pay-due]'); await pg.waitForTimeout(100);
  const f = await pg.evaluate(() => ({ conta: document.getElementById('paymentAccount').value, valor: document.getElementById('paymentAmount').value, data: document.getElementById('paymentDate').value, aberto: document.getElementById('paymentDialog').open }));
  t.ok('Paguei abre o pagamento já com a conta, o valor da parcela e a data de hoje', f.aberto && f.conta === 'a2' && Number(f.valor) === 1500 && f.data === '2026-10-13', JSON.stringify(f));
  await pg.evaluate(() => document.getElementById('paymentForm').requestSubmit()); await pg.waitForTimeout(150);
  const depois = await pg.evaluate(() => (document.querySelector('#dueList [data-due="a2"]') || {}).textContent || '');
  t.ok('pago: o empréstimo passa para o próximo vencimento (05/11)', /05\/11|5\s*nov/i.test(depois.replace(/\s+/g, ' ')) && !/atrasad/.test(depois), depois.replace(/\s+/g, ' '));
  const quit = await pg.evaluate(() => document.getElementById('payoffForecast').textContent);
  t.ok('quitação prevista pelo ritmo dos últimos 3 meses', /quitação prevista/i.test(quit) && /\/20\d\d/.test(quit), quit);
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('fotos', async (b, t) => {
  // só com FOTOS=<pasta>: fotos das telas com os dados fictícios, para conferir de olho
  if (!process.env.FOTOS) return;
  for (const escuro of [false, true]) {
    const { ctx, pg } = await abre(b, { relogio: HOJE, dados: DADOS_B(), escuro });
    const f = n => pg.screenshot({ path: path.join(process.env.FOTOS, (escuro ? 'escuro-' : '') + n + '.png') });
    await f('1-inicio');
    await pg.click('.nav-btn[data-view="debts"]'); await f('2-dividas');
    await pg.click('[data-open-account="a2"] .sub-t'); await pg.waitForTimeout(250); await f('3-folha-conta');
    await pg.click('#accountSheet [data-pay="a2"]'); await pg.waitForTimeout(250); await f('4-pagamento');
    await pg.keyboard.press('Escape'); await pg.click('.nav-btn[data-view="costs"]'); await pg.waitForTimeout(100); await f('5-gastos');
    await ctx.close();
  }
  const { ctx, pg } = await abre(b, { logado: false }); await pg.screenshot({ path: path.join(process.env.FOTOS, '0-login.png') }); await ctx.close();
});

teste('quitadas-editar-e-desfazer', async (b, t) => {
  const { ctx, pg, erros } = await abre(b, { relogio: HOJE, dados: DADOS_B() });
  const q = await pg.evaluate(() => ({ ativas: [...document.querySelectorAll('#accountsList .creditor-card h3')].map(x => x.textContent),
    quitadas: (document.getElementById('paidOffList') || {}).textContent || '' }));
  t.ok('quitada sai da lista principal e fica em "Quitadas"', !q.ativas.includes('Loja Gama') && /Quitadas\s*\(1\)/.test(q.quitadas) && /Loja Gama/.test(q.quitadas), JSON.stringify(q));
  // editar pagamento
  await pg.click('[data-edit-payment="a2|p3"]'); await pg.waitForTimeout(80);
  const ed = await pg.evaluate(() => ({ valor: document.getElementById('paymentAmount').value, titulo: document.querySelector('#paymentDialog h3').textContent }));
  t.ok('editar pagamento abre com o valor dele', Number(ed.valor) === 1500 && /Editar/.test(ed.titulo), JSON.stringify(ed));
  await pg.fill('#paymentAmount', '1400'); await pg.evaluate(() => document.getElementById('paymentForm').requestSubmit()); await pg.waitForTimeout(150);
  let n = await nuvem(pg); const a2 = n.accounts.find(a => a.id === 'a2');
  t.ok('editado na nuvem, sem duplicar', a2.payments.length === 2 && a2.payments.find(p => p.id === 'p3').amount === 1400, JSON.stringify(a2.payments));
  // excluir pagamento sem pergunta, com Desfazer
  await pg.click('[data-delete-payment="a1|p1"]'); await pg.waitForTimeout(150);
  n = await nuvem(pg);
  const semP1 = n.accounts.find(a => a.id === 'a1').payments.length === 0;
  const toast = await pg.evaluate(() => (document.getElementById('undoToast') || {}).textContent || '');
  await pg.click('#undoToast button'); await pg.waitForTimeout(150);
  n = await nuvem(pg);
  t.ok('excluir pagamento: some, mostra "Desfazer"', semP1 && /Desfazer/.test(toast), toast);
  t.ok('Desfazer devolve o pagamento', n.accounts.find(a => a.id === 'a1').payments.some(p => p.id === 'p1'), JSON.stringify(n.accounts[0].payments));
  // editar conta: vencimento e parcela
  // na tela nova: Dívidas › toca na conta › folha da conta › Editar
  await pg.click('.nav-btn[data-view="debts"]'); await pg.click('[data-open-account="a3"] .sub-t'); await pg.waitForTimeout(120);
  const folha = await pg.evaluate(() => ({ aberta: document.getElementById('accountSheet').open, txt: document.getElementById('accountSheetBody').textContent.replace(/\s+/g, ' ') }));
  t.ok('tocar na conta abre a folha com falta, pago e o vencimento', folha.aberta && /Falta\s*R\$\s?7\.300,00/.test(folha.txt) && /vence em 7 dias/.test(folha.txt), folha.txt.slice(0, 300));
  await pg.click('#accountSheet [data-edit-account="a3"]'); await pg.waitForTimeout(80);
  await pg.fill('#accountDueDay', '25'); await pg.fill('#accountInstallment', '500');
  await pg.evaluate(() => document.getElementById('accountForm').requestSubmit()); await pg.waitForTimeout(150);
  n = await nuvem(pg); const a3 = n.accounts.find(a => a.id === 'a3');
  t.ok('editar conta grava dia do vencimento e parcela', a3.dueDay === 25 && a3.installment === 500 && n.accounts.length === 4, JSON.stringify(a3));
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('gastos-comparacao-limite-e-categoria-propria', async (b, t) => {
  const { ctx, pg, erros } = await abre(b, { relogio: HOJE, dados: DADOS_B() });
  await pg.click('.nav-btn[data-view="costs"]'); await pg.waitForTimeout(100);
  const cmp = await pg.evaluate(() => document.getElementById('monthCompare').textContent);
  t.ok('compara com o mês anterior: "↓ 51% que setembro"', /↓\s*51% que setembro/.test(cmp), cmp);
  pg.__respostas.push('300');
  await pg.click('[data-budget="Mercado"]'); await pg.waitForTimeout(150);
  const card = await pg.evaluate(() => { const c = document.querySelector('[data-budget="Mercado"]'); return { txt: c.textContent.replace(/\s+/g, ' '), acima: c.classList.contains('over') }; });
  t.ok('limite do mês na categoria: "R$ 312,40 de R$ 300,00", marcado acima', /de R\$\s?300,00/.test(card.txt) && card.acima, JSON.stringify(card));
  let n = await nuvem(pg);
  t.ok('limite gravado na nuvem', n.budgets && n.budgets.Mercado === 300, JSON.stringify(n.budgets));
  await pg.click('#addCostBtn'); await pg.waitForTimeout(80);
  pg.__respostas.push('Pet');
  await pg.selectOption('#costCategory', '__nova'); await pg.waitForTimeout(100);
  const sel = await pg.evaluate(() => document.getElementById('costCategory').value);
  t.ok('"+ Nova categoria…" cria e escolhe a categoria', sel === 'Pet', sel);
  await pg.fill('#costAmount', '45'); await pg.fill('#costPlace', 'Ração exemplo');
  await pg.evaluate(() => document.getElementById('costForm').requestSubmit()); await pg.waitForTimeout(150);
  n = await nuvem(pg);
  t.ok('categoria própria fica guardada e o gasto usa ela', (n.categories || []).includes('Pet') && n.costs.some(c => c.category === 'Pet'), JSON.stringify({ cats: n.categories }));
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

/* ---------- etapa C: tela nova ---------- */
teste('tela-nova-abas-teclado-filtros', async (b, t) => {
  const { ctx, pg, erros } = await abre(b, { relogio: HOJE, dados: DADOS_B() });
  const abas = await pg.evaluate(() => [...document.querySelectorAll('.bottom-nav .nav-btn')].map(x => x.textContent.trim()).join(','));
  t.ok('barra de baixo: Início, Dívidas, Gastos, Mais (com o + no meio)', abas === 'Início,Dívidas,Gastos,Mais', abas);
  const inicio = await pg.evaluate(() => ({ vis: !document.getElementById('homeView').classList.contains('hidden'),
    falta: document.getElementById('totalRemaining').textContent, venc: document.querySelectorAll('#dueList [data-due]').length }));
  t.ok('abre no Início: falta pagar e próximos vencimentos', inicio.vis && /16\.700,00/.test(inicio.falta) && inicio.venc === 3, JSON.stringify(inicio));
  // teclado de dinheiro
  await pg.click('#fab'); await pg.waitForTimeout(100);
  for (const k of ['1', '2', ',', '5', '0', '9', 'back']) await pg.click(`[data-keypad="paymentAmount"] [data-key="${k}"]`);
  const v = await pg.inputValue('#paymentAmount');
  t.ok('teclado: 1 2 , 5 0 (9 ignorado: só 2 casas) ⌫ → "12,5"', v === '12,5', v);
  await pg.selectOption('#paymentAccount', 'a3'); await pg.waitForTimeout(50);
  const sug = await pg.evaluate(() => [...document.querySelectorAll('#paySuggest [data-suggest]')].map(x => x.textContent.replace(/\s+/g, ' ')));
  t.ok('sugestões: Parcela R$ 412,00 e Tudo R$ 7.300,00', /Parcela R\$\s?412,00/.test(sug[0] || '') && /Tudo R\$\s?7\.300,00/.test(sug[1] || ''), JSON.stringify(sug));
  await pg.click('#paySuggest [data-suggest]'); 
  const caixa = await pg.evaluate(() => { const r = document.querySelector('#paymentDialog .modal-card').getBoundingClientRect(); return { fundo: Math.round(r.bottom), h: innerHeight }; });
  t.ok('o formulário sobe de baixo (folha presa no pé da tela)', Math.abs(caixa.fundo - caixa.h) <= 2, JSON.stringify(caixa));
  await pg.evaluate(() => document.getElementById('paymentForm').requestSubmit()); await pg.waitForTimeout(150);
  const n = await nuvem(pg);
  t.ok('salvou R$ 412,00 no consignado', n.accounts.find(a => a.id === 'a3').payments.some(p => p.amount === 412), '');
  // filtros das dívidas
  await pg.click('.nav-btn[data-view="debts"]'); await pg.click('#debtFilters [data-filter="late"]'); await pg.waitForTimeout(80);
  const late = await pg.evaluate(() => [...document.querySelectorAll('#accountsList [data-open-account]')].map(x => x.dataset.openAccount).join(','));
  t.ok('filtro "Atrasadas": só o empréstimo atrasado', late === 'a2', late);
  await pg.click('#debtFilters [data-filter="card"]'); await pg.waitForTimeout(50);
  const card = await pg.evaluate(() => [...document.querySelectorAll('#accountsList [data-open-account]')].map(x => x.dataset.openAccount).join(','));
  t.ok('filtro "Cartões": só o cartão', card === 'a1', card);
  // Mais: backup e sair
  await pg.click('.nav-btn[data-view="more"]'); await pg.waitForTimeout(50);
  const mais = await pg.evaluate(() => document.getElementById('moreView').textContent.replace(/\s+/g, ' '));
  t.ok('Mais: backup e sair ficam aqui', /Backup/.test(mais) && /Sair/.test(mais), mais);
  t.ok('sem erro na página', !erros.length, erros.join(' | '));
  await ctx.close();
});

teste('tela-nova-celular-pequeno-e-tema-escuro', async (b, t) => {
  for (const escuro of [false, true]) {
    const { ctx, pg, erros } = await abre(b, { relogio: HOJE, dados: DADOS_B(), tela: { width: 360, height: 740 }, escuro });
    const rola = [];
    for (const v of ['home', 'debts', 'costs', 'more']) {
      await pg.click(`.nav-btn[data-view="${v}"]`); await pg.waitForTimeout(60);
      if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) rola.push(v);
    }
    const fundo = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lum = (fundo.match(/\d+/g) || []).slice(0, 3).reduce((s, x) => s + Number(x), 0) / 3;
    const nome = escuro ? 'escuro' : 'claro';
    t.ok(nome + ': nenhuma aba rola de lado em 360 px', !rola.length, rola.join(','));
    t.ok(nome + ': fundo segue o tema do aparelho', escuro ? lum < 40 : lum > 230, fundo);
    t.ok(nome + ': sem erro na página', !erros.length, erros.join(' | '));
    await ctx.close();
  }
});

/* ---------- execução ---------- */
(async () => {
  const b = await chromium.launch();
  let ok = 0, falha = 0;
  for (const tt of TESTES.filter(x => x.nome.includes(filtro))) {
    console.log('== ' + tt.nome);
    const t = { ok: (nome, cond, info) => { if (cond) { ok++; console.log('  ✓ ' + nome); } else { falha++; console.log('  ✗ ' + nome + (info ? '  — ' + String(info).slice(0, 400) : '')); } } };
    try { await tt.fn(b, t); } catch (e) { falha++; console.log('  ✗ erro no teste: ' + e.message); }
  }
  await b.close();
  console.log(`\n${ok} ok, ${falha} falha(s).${falha ? ' NÃO publique.' : ''}`);
  process.exit(falha ? 1 : 0);
})();
