/* =====================================================
   InvestTrack — app.js
   ===================================================== */

/* ---------- Utilitários ---------- */
const $ = id => document.getElementById(id);
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const money = value => new Intl.NumberFormat('pt-AO',{style:'currency',currency:'AOA',maximumFractionDigits:0}).format(Number(value)||0).replace('AOA','Kz');
const pct = n => n.toFixed(1).replace('.', ',') + '%';
const parseDate = iso => new Date(iso + 'T00:00:00');
const dateFmt = value => value ? parseDate(value).toLocaleDateString('pt-AO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const toIso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const today = new Date();
const isoToday = toIso(today);   // data local (não UTC), evita erro perto da meia-noite
const daysUntil = iso => Math.round((parseDate(iso) - parseDate(isoToday)) / 86400000);
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);}
const statusBadge = x => `<span class="status${x.status==='Vencido'?' expired':''}">${x.status}</span>`;

/* ---------- Estado e armazenamento ---------- */
const SETTINGS_KEY = 'investtrack_settings';
const SCH_KEY = 'investtrack_scholarships';
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch(e) { return fallback; } };

let investments = load('investtrack_investments', [
  {id:1,name:'Depósito Crescer 12M',institution:'Banco Atlântico',type:'Depósito a prazo',amount:1500000,rate:12,start:'2026-02-15',maturity:'2026-11-15',status:'Activo'},
  {id:2,name:'Poupança Flexível',institution:'Banco Sol',type:'Depósito bancário',amount:750000,rate:8.5,start:'2026-01-10',maturity:'2027-01-10',status:'Activo'},
  {id:3,name:'Fundo Futuro',institution:'Banco BAI',type:'Outro',amount:400000,rate:15,start:'2026-04-01',maturity:'2027-04-01',status:'Activo'}
]);
let transactions = load('investtrack_transactions', [
  {description:'Reforço mensal',type:'Depósito',date:'2026-10-25',investment:'Poupança Flexível',amount:50000},
  {description:'Juros creditados',type:'Juros',date:'2026-10-15',investment:'Depósito Crescer 12M',amount:15000},
  {description:'Aplicação inicial',type:'Depósito',date:'2026-10-02',investment:'Fundo Futuro',amount:100000}
]);
let schInvestments = load(SCH_KEY, []);
let settings = {name:'João Manuel', email:'abilio@example.com', currency:'', dateFormat:'', alerts:true, monthly:true, ...load(SETTINGS_KEY, {})};
let growthChart, distributionChart, scenarioChart, simChart;

const persist = () => {
  try {
    localStorage.setItem('investtrack_investments', JSON.stringify(investments));
    localStorage.setItem('investtrack_transactions', JSON.stringify(transactions));
  } catch(e) {}
};
const persistSch = () => { try { localStorage.setItem(SCH_KEY, JSON.stringify(schInvestments)); } catch(e) {} };

/* ---------- Cálculos ---------- */
// Juros simples até ao vencimento (previsão)
const interestFor = inv => {
  const start = parseDate(inv.start), end = parseDate(inv.maturity || isoToday);
  const years = Math.max(0, (end - start) / (365.25 * 86400000));
  return inv.amount * inv.rate / 100 * years;
};
const valueFor = inv => inv.amount + interestFor(inv);
// Juros realmente acumulados até hoje
const accruedFor = inv => {
  const start = parseDate(inv.start);
  const end = new Date(Math.min(parseDate(isoToday), parseDate(inv.maturity || isoToday)));
  return inv.amount * inv.rate / 100 * Math.max(0, (end - start) / (365.25 * 86400000));
};
// O estado passa a Vencido automaticamente pela data
const refreshStatus = () => investments.forEach(i => { i.status = (i.maturity && i.maturity < isoToday) ? 'Vencido' : 'Activo'; });

/* ---------- Render geral ---------- */
function render(){
  refreshStatus();
  persist();
  renderDashboard();
  renderInvestments();
  renderDeposits();
  renderTransactions();
  renderReports();
  renderScholarships();
  renderNotifications();
}

/* ---------- Navegação ---------- */
const closeMenu = () => $('sidebar').classList.remove('open');
const pageLabels = {dashboard:'Dashboard',investments:'Investimentos',deposits:'Depósitos a prazo',transactions:'Transacções',analytics:'Análises',simulator:'Simulador',reports:'Relatórios',scholarships:'Bolsas',settings:'Definições'};
function showPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  $('pageCrumb').textContent = pageLabels[name] || name;
  closeMenu();
  window.scrollTo({top:0});
  if (name === 'analytics') renderScenario();
  if (name === 'simulator') runSimulation();
}
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.goto)));
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); showPage('dashboard'); });

/* ---------- Menu móvel ---------- */
$('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('sidebarOverlay').addEventListener('click', closeMenu);
$('sidebarClose').addEventListener('click', closeMenu);
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });

/* ---------- Modais ---------- */
function openModal(id){ $(id).classList.add('open'); }
document.querySelectorAll('[data-open-modal]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.openModal)));
document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => b.closest('.modal-backdrop').classList.remove('open')));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) b.classList.remove('open'); }));

/* ---------- Teclado ---------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMenu();
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-goto]')) {
    e.preventDefault();
    showPage(e.target.dataset.goto);
  }
});

/* ---------- Definições (guardam de verdade) ---------- */
function applySettings(){
  const parts = (settings.name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  const initials = parts.map(p => p[0]).slice(0,2).join('').toUpperCase() || '?';
  const h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 19 ? 'Boa tarde' : 'Boa noite';
  $('greeting').textContent = first ? `${hi}, ${first}` : hi;
  $('todayLabel').textContent = new Date().toLocaleDateString('pt-AO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  ['userAvatar','topAvatar','settingsAvatar'].forEach(id => $(id).textContent = initials);
  $('userName').textContent = settings.name;
  $('settingsName').textContent = settings.name;
  $('settingsEmail').textContent = settings.email;
}
function fillSettingsForm(){
  $('setName').value = settings.name;
  $('setEmail').value = settings.email;
  if (settings.currency) $('setCurrency').value = settings.currency;
  if (settings.dateFormat) $('setDateFormat').value = settings.dateFormat;
  $('notifAlerts').checked = settings.alerts;
  $('notifMonthly').checked = settings.monthly;
}
$('saveSettings').addEventListener('click', () => {
  const name = $('setName').value.trim(), email = $('setEmail').value.trim();
  if (!name) { toast('Indique o seu nome.'); $('setName').focus(); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Indique um email válido.'); $('setEmail').focus(); return; }
  settings = {name, email, currency:$('setCurrency').value, dateFormat:$('setDateFormat').value, alerts:$('notifAlerts').checked, monthly:$('notifMonthly').checked};
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
  applySettings();
  renderNotifications();
  toast('Definições guardadas.');
});

/* ---------- Dashboard ---------- */
function renderDashboard(){
  const active = investments.filter(i => i.status === 'Activo');
  const capital = sum(investments, x => x.amount);
  const accrued = sum(investments, accruedFor);
  const monthly = sum(active, x => x.amount * x.rate / 100 / 12);
  const avg = capital ? sum(investments, x => x.amount * x.rate) / capital : 0;

  $('totalCapital').textContent = money(capital);
  $('totalInterest').textContent = money(accrued);
  $('totalWealth').textContent = money(capital + accrued);
  $('wealthDelta').innerHTML = `↗ ${pct(capital ? accrued / capital * 100 : 0)} <span>sobre o capital</span>`;
  $('monthInterest').textContent = '+ ' + money(monthly) + ' por mês (estimado)';
  $('avgRate').textContent = pct(avg);

  $('donutCenter').textContent = (capital / 1e6).toFixed(2).replace('.', ',') + 'M';
  const share = t => capital ? Math.round(sum(investments.filter(x => x.type === t), x => x.amount) / capital * 100) : 0;
  const a = share('Depósito a prazo'), b = share('Depósito bancário');
  $('legPrazo').textContent = a + '%';
  $('legBanco').textContent = b + '%';
  $('legOutro').textContent = (capital ? Math.max(0, 100 - a - b) : 0) + '%';

  $('recentInvestments').innerHTML = investments.slice(0,4).map(inv =>
    `<tr><td data-label="Investimento"><div class="investment-name"><span class="bank-icon">◈</span>${escapeHtml(inv.name)}</div></td><td data-label="Instituição">${escapeHtml(inv.institution)}</td><td data-label="Capital">${money(inv.amount)}</td><td data-label="Taxa">${inv.rate}%</td><td data-label="Estado">${statusBadge(inv)}</td></tr>`
  ).join('') || '<tr><td colspan="5">Ainda não existem investimentos.</td></tr>';

  const upcoming = investments.filter(x => x.maturity && x.maturity >= isoToday).sort((a,b) => a.maturity.localeCompare(b.maturity)).slice(0,3);
  $('upcomingList').innerHTML = upcoming.map(x => {
    const d = parseDate(x.maturity), days = daysUntil(x.maturity);
    return `<div class="upcoming-item"><div class="date-box"><strong>${d.getDate()}</strong><small>${d.toLocaleDateString('pt-AO',{month:'short'})}</small></div><div class="upcoming-info"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.institution)} · ${money(x.amount)}</small></div><span class="countdown">${days === 0 ? 'Hoje' : days + ' dias'}</span></div>`;
  }).join('') || '<p class="muted">Sem vencimentos próximos.</p>';

  drawDashboardCharts();
}

function drawDashboardCharts(){
  if (typeof Chart === 'undefined') return;
  const base = sum(investments, x => x.amount);

  // Evolução (curva ainda simulada; o filtro 6/12 meses já funciona)
  const n = $('growthRange').value === '6' ? 6 : 12;
  const labels = Array.from({length:n}, (_, i) => new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1).toLocaleDateString('pt-AO',{month:'short'}).replace('.', ''));
  const data = labels.map((_, i) => Math.round(base * (.78 + (12 - n + i) * .02)));
  growthChart?.destroy();
  growthChart = new Chart($('growthChart'), {
    type:'line',
    data:{labels, datasets:[{data, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.10)', fill:true, tension:.38, pointRadius:0, borderWidth:2.5}]},
    options:{maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c => money(c.raw)}}}, scales:{x:{grid:{display:false}, ticks:{color:'#94a3b8', font:{size:10}}}, y:{grid:{color:'#edf1f4'}, ticks:{color:'#94a3b8', font:{size:10}, callback:v => (v/1000000).toFixed(1) + 'M'}}}}
  });

  // Distribuição
  distributionChart?.destroy();
  const groups = {'Depósito a prazo':0, 'Depósito bancário':0, 'Outro':0};
  investments.forEach(x => groups[x.type] = (groups[x.type] || 0) + x.amount);
  distributionChart = new Chart($('distributionChart'), {
    type:'doughnut',
    data:{labels:Object.keys(groups), datasets:[{data:Object.values(groups), backgroundColor:['#173d5b','#10b981','#f5b544'], borderWidth:0, hoverOffset:4}]},
    options:{cutout:'76%', maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });
}
$('growthRange').addEventListener('change', drawDashboardCharts);

/* ---------- Investimentos ---------- */
function renderInvestments(){
  const q = ($('investmentSearch')?.value || '').toLowerCase(), type = $('typeFilter')?.value || '', status = $('statusFilter')?.value || '';
  const filtered = investments.filter(x => (x.name + ' ' + x.institution).toLowerCase().includes(q) && (!type || x.type === type) && (!status || x.status === status));
  $('investmentRows').innerHTML = filtered.map(x =>
    `<tr><td data-label="Investimento"><div class="investment-name"><span class="bank-icon">◈</span>${escapeHtml(x.name)}</div></td><td data-label="Instituição">${escapeHtml(x.institution)}</td><td data-label="Tipo">${escapeHtml(x.type)}</td><td data-label="Capital inicial">${money(x.amount)}</td><td data-label="Taxa anual">${x.rate}%</td><td data-label="Vencimento">${dateFmt(x.maturity)}</td><td data-label="Valor estimado">${money(valueFor(x))}</td><td data-label="Estado">${statusBadge(x)}</td><td class="cell-action"><button class="more-btn delete-investment" data-id="${x.id}" title="Eliminar" aria-label="Eliminar investimento">×</button></td></tr>`
  ).join('') || '<tr><td colspan="9">Nenhum investimento encontrado.</td></tr>';
  $('investmentCount').textContent = investments.length;
  $('investmentCapital').textContent = money(sum(investments, x => x.amount));
  $('activeCount').textContent = investments.filter(x => x.status === 'Activo').length;
  $('reportCount').textContent = investments.length;
}
['investmentSearch','typeFilter','statusFilter'].forEach(id => $(id).addEventListener('input', renderInvestments));
$('investmentRows').addEventListener('click', e => {
  const b = e.target.closest('.delete-investment');
  if (b && confirm('Pretende eliminar este investimento?')) {
    investments = investments.filter(x => x.id !== Number(b.dataset.id));
    render();
    toast('Investimento eliminado.');
  }
});

/* ---------- Depósitos a prazo ---------- */
function renderDeposits(){
  const all = investments.filter(x => x.type === 'Depósito a prazo');
  const act = all.filter(x => x.status === 'Activo');

  $('depositCards').innerHTML = all.map(x =>
    `<div class="deposit-card"><div class="deposit-card-head"><div><h3>${escapeHtml(x.name)}</h3><small>${escapeHtml(x.institution)}</small></div>${statusBadge(x)}</div><small>Capital aplicado</small><div class="deposit-value">${money(x.amount)}</div><div class="deposit-meta"><span>Taxa: <b>${x.rate}%</b></span><span>Vence: <b>${dateFmt(x.maturity)}</b></span></div><div class="deposit-meta"><span>Juros previstos</span><b class="positive">${money(interestFor(x))}</b></div></div>`
  ).join('') || '<p class="muted">Ainda não existem depósitos a prazo. Registe o primeiro para começar.</p>';

  $('depCapital').textContent = money(sum(act, x => x.amount));
  $('depInterest').textContent = money(sum(act, interestFor));
  const next = act.filter(x => x.maturity && x.maturity >= isoToday).sort((a,b) => a.maturity.localeCompare(b.maturity))[0];
  if (next) {
    const d = daysUntil(next.maturity);
    $('depNext').textContent = dateFmt(next.maturity);
    $('depNextInfo').textContent = d === 0 ? 'Vence hoje' : d === 1 ? 'Falta 1 dia' : `Faltam ${d} dias`;
  } else {
    $('depNext').textContent = '—';
    $('depNextInfo').textContent = 'Sem vencimentos próximos';
  }
}

/* ---------- Transacções ---------- */
function renderTransactions(){
  const q = ($('transactionSearch')?.value || '').toLowerCase(), type = $('transactionFilter')?.value || '';
  const rows = transactions.filter(x => (x.description + ' ' + x.investment).toLowerCase().includes(q) && (!type || x.type === type));
  $('transactionRows').innerHTML = rows.map(x =>
    `<tr><td data-label="Descrição"><strong>${escapeHtml(x.description)}</strong></td><td data-label="Tipo">${escapeHtml(x.type)}</td><td data-label="Data">${dateFmt(x.date)}</td><td data-label="Investimento">${escapeHtml(x.investment || '—')}</td><td data-label="Valor" class="${x.type === 'Levantamento' ? '' : 'positive'}">${x.type === 'Levantamento' ? '−' : '+'} ${money(x.amount)}</td><td data-label="Estado"><span class="status">Registada</span></td></tr>`
  ).join('') || '<tr><td colspan="6">Sem transacções para apresentar.</td></tr>';
}
['transactionSearch','transactionFilter'].forEach(id => $(id).addEventListener('input', renderTransactions));

/* ---------- Relatórios ---------- */
function renderReports(){
  const capital = sum(investments, x => x.amount);
  const avg = capital ? sum(investments, x => x.amount * x.rate) / capital : 0;
  $('repRate').textContent = pct(avg);
  $('repInterest').textContent = money(sum(investments, accruedFor));
  $('reportRows').innerHTML = investments.map(x =>
    `<tr><td data-label="Investimento">${escapeHtml(x.name)}</td><td data-label="Capital">${money(x.amount)}</td><td data-label="Juros estimados">${money(interestFor(x))}</td><td data-label="Valor total">${money(valueFor(x))}</td><td data-label="Estado">${statusBadge(x)}</td></tr>`
  ).join('') || '<tr><td colspan="5">Ainda não existem investimentos.</td></tr>';
}
$('exportCsv').addEventListener('click', () => {
  const rows = [['Investimento','Instituição','Tipo','Capital','Taxa anual','Início','Vencimento','Juros estimados','Valor estimado'], ...investments.map(x => [x.name, x.institution, x.type, x.amount, x.rate, x.start, x.maturity, Math.round(interestFor(x)), Math.round(valueFor(x))])];
  const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'investtrack-relatorio.csv'; a.click(); URL.revokeObjectURL(url);
  toast('Relatório exportado.');
});

/* ---------- Notificações ---------- */
function renderNotifications(){
  const items = investments.filter(x => x.maturity).map(x => ({x, d: daysUntil(x.maturity)})).filter(o => o.d <= 30).sort((p, q) => p.d - q.d);
  $('notificationList').innerHTML = items.map(({x, d}) =>
    `<div class="notification-item"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.institution)} · ${d < 0 ? 'Venceu há ' + (-d) + ' dias' : d === 0 ? 'Vence hoje' : 'Vence em ' + d + ' dias'}</small></div>`
  ).join('') || '<p class="muted">Sem avisos de momento.</p>';
  document.querySelector('.notification b').style.display = (items.length && settings.alerts) ? '' : 'none';
}

/* ---------- Formulário de investimento ---------- */
const invForm = $('investmentForm');
function updateEstimate(){
  const f = new FormData(invForm), a = Number(f.get('amount')), r = Number(f.get('rate')), s = f.get('start'), m = f.get('maturity');
  // vencimento tem de ser depois do início
  const mat = invForm.elements.maturity;
  mat.setCustomValidity(m && s && m <= s ? 'A data de vencimento deve ser posterior à data de início.' : '');
  if (a > 0 && r >= 0 && s && m && m > s) {
    const years = Math.max(0, (parseDate(m) - parseDate(s)) / (365.25 * 86400000));
    $('investmentEstimate').textContent = `Valor bruto estimado no vencimento: ${money(a + a * r / 100 * years)} (juros simples, antes de impostos).`;
  } else {
    $('investmentEstimate').textContent = 'Preencha o capital, a taxa e as datas para ver uma estimativa.';
  }
}
invForm.addEventListener('input', updateEstimate);
invForm.addEventListener('submit', e => {
  e.preventDefault();
  const obj = Object.fromEntries(new FormData(invForm));
  investments.unshift({id:Date.now(), name:obj.name, institution:obj.institution, type:obj.type, amount:Number(obj.amount), rate:Number(obj.rate), start:obj.start, maturity:obj.maturity, status:'Activo'});
  transactions.unshift({description:'Aplicação inicial', type:'Depósito', date:obj.start, investment:obj.name, amount:Number(obj.amount)});
  render();
  invForm.reset();
  updateEstimate();
  $('investmentModal').classList.remove('open');
  toast('Investimento registado com sucesso.');
});

/* ---------- Formulário de transacção ---------- */
$('transactionForm').addEventListener('submit', e => {
  e.preventDefault();
  const obj = Object.fromEntries(new FormData(e.target));
  transactions.unshift({...obj, amount:Number(obj.amount)});
  persist();
  renderTransactions();
  e.target.reset();
  $('transactionModal').classList.remove('open');
  toast('Transacção registada.');
});

/* ---------- Simulador ---------- */
function compound(principal, monthly, rate, years, frequency){
  const months = Math.round(years * 12), periodRate = Math.pow(1 + rate / 100 / frequency, frequency / 12) - 1;
  let balance = principal;
  const points = [balance];
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + periodRate) + monthly;
    if (m % 12 === 0 || m === months) points.push(balance);
  }
  return {balance, points, contributed: principal + monthly * months};
}
function runSimulation(){
  const p = Math.max(0, Number($('simInitial').value)), m = Math.max(0, Number($('simMonthly').value)), r = Math.max(0, Number($('simRate').value)), y = Math.max(.1, Number($('simYears').value)), f = Number($('simFrequency').value);
  const result = compound(p, m, r, y, f);
  $('simTotal').textContent = money(result.balance);
  $('simContributed').textContent = money(result.contributed);
  $('simInterest').textContent = money(result.balance - result.contributed);
  $('simEffective').textContent = ((Math.pow(1 + r / 100 / f, f) - 1) * 100).toFixed(2).replace('.', ',') + '%';
  if (typeof Chart !== 'undefined') {
    simChart?.destroy();
    simChart = new Chart($('simChart'), {
      type:'line',
      data:{labels:Array.from({length:result.points.length}, (_, i) => 'Ano ' + i), datasets:[{data:result.points, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.10)', fill:true, tension:.3, pointRadius:2}]},
      options:{maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c => money(c.raw)}}}, scales:{x:{grid:{display:false}}, y:{ticks:{callback:v => (v/1000000).toFixed(1) + 'M'}}}}
    });
  }
}
$('runSimulation').addEventListener('click', runSimulation);
['simInitial','simMonthly','simRate','simYears','simFrequency'].forEach(id => $(id).addEventListener('change', runSimulation));

/* ---------- Análises (cenários) ---------- */
let activePeriod = 'short';
document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-period]').forEach(x => x.classList.remove('selected'));
  b.classList.add('selected');
  activePeriod = b.dataset.period;
  renderScenario();
}));
function renderScenario(){
  const years = activePeriod === 'short' ? 1 : activePeriod === 'medium' ? 5 : 20;
  const base = sum(investments, x => x.amount);
  const labels = Array.from({length:years + 1}, (_, i) => 'Ano ' + i);
  const series = [.07, .11, .15].map(rate => labels.map((_, i) => base * Math.pow(1 + rate, i)));
  const moderate = series[1][years];
  $('projectedCapital').textContent = money(base);
  $('projectedInterest').textContent = money(moderate - base);
  $('projectedTotal').textContent = money(moderate);
  if (typeof Chart !== 'undefined') {
    scenarioChart?.destroy();
    scenarioChart = new Chart($('scenarioChart'), {
      type:'line',
      data:{labels, datasets:[
        {label:'Conservador · 7%', data:series[0], borderColor:'#6c9bc9', tension:.3, pointRadius:0},
        {label:'Moderado · 11%', data:series[1], borderColor:'#10b981', tension:.3, pointRadius:0},
        {label:'Optimista · 15%', data:series[2], borderColor:'#f5b544', tension:.3, pointRadius:0}
      ]},
      options:{maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + money(c.raw)}}}, scales:{x:{grid:{display:false}}, y:{ticks:{callback:v => (v/1000000).toFixed(1) + 'M'}}}}
    });
  }
}

/* ---------- Bolsas ---------- */
// EDITE AQUI com a informação oficial de cada programa.
const bolsas = [
  {id:'inagbe', icon:'🎓', name:'INAGBE', entity:'Instituto Nacional de Gestão de Bolsas de Estudo', tag:'Nacional', suggested:100000, verify:false,
   summary:'Entidade do Estado angolano responsável pela gestão de bolsas de estudo, internas e externas.',
   reasons:['Apoiar o acesso de estudantes ao ensino superior','Contribuir para a formação de quadros nacionais','Investimento social de longo prazo']},
  {id:'mirempet', icon:'⛏️', name:'MIREMPET Angola-França', entity:'Ministério dos Recursos Minerais, Petróleo e Gás', tag:'Cooperação internacional', suggested:150000, verify:true,
   summary:'Programa ligado ao sector de recursos minerais, petróleo e gás, em cooperação Angola-França.',
   reasons:['Formar técnicos para o sector energético e mineiro','Promover o intercâmbio académico com França','Reforçar competências nacionais em áreas estratégicas']},
  {id:'isptec', icon:'💻', name:'Bolsa Interna ISPTEC', entity:'Instituto Superior Politécnico de Tecnologias e Ciências', tag:'Instituição de ensino', suggested:75000, verify:true,
   summary:'Bolsa interna da instituição, orientada para formação em tecnologia, engenharia e ciências.',
   reasons:['Apoiar estudantes com mérito e poucos recursos','Impulsionar a formação em tecnologia e engenharia','Fortalecer a ligação entre ensino e mercado de trabalho']},
  {id:'pda', icon:'📘', name:'Bolsa de PDA', entity:'Entidade a confirmar', tag:'Confirmar dados', suggested:50000, verify:true,
   summary:'Programa de bolsa PDA. Complete esta descrição com a informação oficial do programa.',
   reasons:['Apoiar a formação académica de novos talentos','Contribuir para o desenvolvimento do país','Diversificar o meu investimento social']},
  {id:'lamasia', icon:'🌏', name:'Bolsa Angola-LAMASIA', entity:'Entidade a confirmar', tag:'Confirmar dados', suggested:100000, verify:true,
   summary:'Programa de cooperação Angola-LAMASIA. Complete esta descrição com a informação oficial do programa.',
   reasons:['Promover o intercâmbio internacional de estudantes','Abrir oportunidades de estudo no estrangeiro','Criar ligações académicas e culturais']}
];
let currentBolsa = null;
const bolsaById = id => bolsas.find(b => b.id === id);
const schTotalFor = id => sum(schInvestments.filter(x => x.bolsaId === id), x => x.amount);

function renderScholarships(){
  $('scholarshipGrid').innerHTML = bolsas.map(b => `
    <article class="sch-card">
      <div class="sch-head"><span class="sch-icon">${b.icon}</span><div><h3>${escapeHtml(b.name)}</h3><small>${escapeHtml(b.entity)}</small></div></div>
      <div class="sch-tags"><span class="sch-tag">${escapeHtml(b.tag)}</span>${b.verify ? '<span class="sch-tag warn">Confirmar dados</span>' : ''}</div>
      <p>${escapeHtml(b.summary)}</p>
      <div class="sch-invested"><span>O meu investimento</span><b>${money(schTotalFor(b.id))}</b></div>
      <button class="btn btn-primary" data-bolsa="${b.id}">Investir nesta bolsa</button>
    </article>`).join('');

  $('scholarshipRows').innerHTML = schInvestments.map(x => {
    const b = bolsaById(x.bolsaId);
    return `<tr><td data-label="Bolsa"><strong>${escapeHtml(b ? b.name : x.bolsaId)}</strong></td><td data-label="Motivo">${escapeHtml(x.reason)}</td><td data-label="Data">${dateFmt(x.date)}</td><td data-label="Valor" class="positive">${money(x.amount)}</td><td class="cell-action"><button class="more-btn" data-del-sch="${x.id}" title="Eliminar" aria-label="Eliminar investimento">×</button></td></tr>`;
  }).join('') || '<tr><td colspan="5">Ainda não investiu em nenhuma bolsa.</td></tr>';

  $('schTotal').textContent = money(sum(schInvestments, x => x.amount));
  $('schCount').textContent = new Set(schInvestments.map(x => x.bolsaId)).size;
  $('schOps').textContent = schInvestments.length;
}

function updateSchEstimate(){
  const v = Number($('schAmount').value) || 0;
  $('schEstimate').textContent = v >= 1000
    ? `Vai investir ${money(v)} em ${currentBolsa.name}. É um apoio social, sem juros nem retorno financeiro garantido.`
    : 'Indique um valor igual ou superior a Kz 1.000.';
}
function setSchAmount(v){
  $('schAmount').value = v;
  $('schRange').value = Math.min(Math.max(v, 10000), 5000000);
  updateSchEstimate();
}

function openScholarship(id){
  currentBolsa = bolsaById(id);
  if (!currentBolsa) return;
  $('schEntity').textContent = currentBolsa.entity.toUpperCase();
  $('schTitle').textContent = 'Investir em ' + currentBolsa.name;
  $('schSummary').textContent = currentBolsa.summary;
  $('schReasons').innerHTML = [...currentBolsa.reasons, 'Outro motivo (descrevo na nota)'].map(r =>
    `<label class="reason-option"><input type="radio" name="reason" value="${escapeHtml(r)}" required><span>${escapeHtml(r)}</span></label>`).join('');
  $('scholarshipForm').reset();
  setSchAmount(currentBolsa.suggested);
  openModal('scholarshipModal');
}

$('scholarshipGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-bolsa]');
  if (b) openScholarship(b.dataset.bolsa);
});
$('schAmount').addEventListener('input', () => setSchAmount(Number($('schAmount').value) || 0));
$('schRange').addEventListener('input', () => setSchAmount(Number($('schRange').value)));
$('schChips').addEventListener('click', e => {
  const c = e.target.closest('[data-amount]');
  if (c) setSchAmount(Number(c.dataset.amount));
});

$('scholarshipForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const amount = Number(f.amount);
  if (!(amount >= 1000)) { toast('Indique um valor igual ou superior a Kz 1.000.'); return; }
  schInvestments.unshift({id:Date.now(), bolsaId:currentBolsa.id, amount, reason:f.reason, note:f.note || '', date:isoToday});
  transactions.unshift({description:'Investimento em bolsa', type:'Depósito', date:isoToday, investment:currentBolsa.name, amount});
  persistSch();
  persist();
  renderScholarships();
  renderTransactions();
  $('scholarshipModal').classList.remove('open');
  toast('Investimento em ' + currentBolsa.name + ' registado.');
});

$('scholarshipRows').addEventListener('click', e => {
  const b = e.target.closest('[data-del-sch]');
  if (b && confirm('Pretende eliminar este investimento em bolsa?')) {
    schInvestments = schInvestments.filter(x => x.id !== Number(b.dataset.delSch));
    persistSch();
    renderScholarships();
    toast('Investimento eliminado.');
  }
});

/* ---------- Arranque ---------- */
fillSettingsForm();
applySettings();
render();
runSimulation();