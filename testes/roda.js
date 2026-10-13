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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const pg = await ctx.newPage(); const erros = [];
  pg.on('pageerror', e => erros.push(String(e.message).slice(0, 200)));
  pg.on('dialog', d => { (pg.__dialogos = pg.__dialogos || []).push(d.message()); d.accept().catch(() => {}); });
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
