import { firebaseConfig } from './firebase-config.js';

const firebaseReady = Object.values(firebaseConfig).every(Boolean);
let auth = null, db = null, activeUser = null, unsubscribeEntries = null, unsubscribeProfile = null;
let currentType = 'income', currentFilter = 'all', entries = [], toastTimer;
let selectedLoanForRepayment = null, editingEntryId = null, pendingLogoData = null, removeLogoOnSave = false;
let profile = { name: '', phone: '', address: '', logoData: '' };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => `৳${Number(value || 0).toLocaleString('bn-BD', { maximumFractionDigits: 2 })}`;
const localNow = new Date();
const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;

$('#today-date').textContent = new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
$('#entry-form').elements.date.value = today;
$('#report-date').value = today;
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3200); }

function setPage(page) {
  $$('.page-view').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  $$('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('#breadcrumb').innerHTML = `আপনার হিসাব <span>/</span> ${{ home: 'ড্যাশবোর্ড', transactions: 'লেনদেন', loans: 'ধার-দেনা', reports: 'রিপোর্ট', profile: 'আমার প্রোফাইল' }[page]}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-page]').forEach(el => el.addEventListener('click', () => setPage(el.dataset.page)));
$$('[data-goto]').forEach(el => el.addEventListener('click', () => setPage(el.dataset.goto)));

function openForm(type = 'income', existing = null) {
  editingEntryId = existing?.id || null;
  currentType = type;
  $$('.type-option').forEach(el => { el.classList.toggle('selected', el.dataset.type === type); el.disabled = !!existing; });
  $('#loan-fields').classList.toggle('hidden', type !== 'loan');
  $('#entry-form').reset();
  $('#entry-form').elements.date.value = today;
  if (existing) {
    const fields = $('#entry-form').elements;
    fields.title.value = existing.title || '';
    fields.category.value = existing.category || 'অন্যান্য';
    fields.amount.value = String(existing.amount || '');
    fields.date.value = existing.date || today;
    fields.note.value = existing.note || '';
    if (type === 'loan') { fields.direction.value = existing.direction || 'lent'; fields.person.value = existing.person || ''; fields.dueDate.value = existing.dueDate || ''; }
  }
  $('#dialog-title').textContent = existing ? (type === 'loan' ? 'ধারের হিসাব সম্পাদনা' : 'হিসাব সম্পাদনা') : type === 'loan' ? 'ধারের হিসাব যোগ করুন' : 'নতুন হিসাব';
  $('#entry-submit').innerHTML = existing ? 'পরিবর্তন সংরক্ষণ <span>→</span>' : 'হিসাব সংরক্ষণ <span>→</span>';
  $('#entry-dialog').showModal();
}
$('#quick-add').addEventListener('click', () => openForm());
$$('[data-open-form]').forEach(el => el.addEventListener('click', () => openForm()));
$$('[data-open-loan]').forEach(el => el.addEventListener('click', () => openForm('loan')));
$$('[data-close]').forEach(el => el.addEventListener('click', () => $('#entry-dialog').close()));
$$('.type-option').forEach(el => el.addEventListener('click', () => {
  currentType = el.dataset.type;
  $$('.type-option').forEach(option => option.classList.toggle('selected', option === el));
  $('#loan-fields').classList.toggle('hidden', currentType !== 'loan');
  $('#dialog-title').textContent = currentType === 'loan' ? 'ধারের হিসাব যোগ করুন' : 'নতুন হিসাব';
}));

function sortedEntries() { return [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)); }
function renderRows(target, data) {
  if (!data.length) { target.innerHTML = '<tr class="empty-row"><td colspan="6"><span>⌁</span><strong>এখনো কোনো লেনদেন নেই</strong><small>প্রথম আয়, খরচ বা ধার যোগ করে শুরু করুন</small></td></tr>'; return; }
  target.innerHTML = data.map(item => {
    const typeLabel = { income: 'আয়', expense: 'খরচ', loan: item.direction === 'borrowed' ? 'ধার নিয়েছি' : 'ধার দিয়েছি' }[item.type];
    const name = item.type === 'loan' ? `${item.direction === 'borrowed' ? 'ধার নিয়েছি' : 'ধার দিয়েছি'} · ${esc(item.person)}` : esc(item.title);
    return `<tr><td><div class="transaction-name"><span class="transaction-icon ${item.type}">${{ income: '↓', expense: '↑', loan: '⇄' }[item.type]}</span>${name}</div></td><td>${esc(item.category || 'অন্যান্য')}</td><td>${dateLabel(item.date)}</td><td><span class="type-badge ${item.type}">${typeLabel}</span></td><td class="amount-cell ${item.type}">${money(item.amount)}</td><td><div class="row-actions"><button class="row-edit" data-edit="${esc(item.id)}" aria-label="${esc(name)} সম্পাদনা">সম্পাদনা</button><button class="row-delete" data-delete="${esc(item.id)}" aria-label="${esc(name)} মুছুন">মুছুন</button></div></td></tr>`;
  }).join('');
}
function dateLabel(value) { if (!value) return '—'; const [y, m, d] = value.split('-').map(Number); return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)); }
function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

async function handleEntryActions(event) {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');
  if (editButton) {
    const entry = entries.find(item => item.id === editButton.dataset.edit);
    if (entry) openForm(entry.type, entry);
    return;
  }
  if (!deleteButton) return;
  const entry = entries.find(item => item.id === deleteButton.dataset.delete);
  if (!entry || !activeUser || !db) { showToast('মুছতে হলে আগে Google দিয়ে লগইন করুন'); return; }
  const label = entry.type === 'loan' ? `ধারের হিসাব (${entry.person || 'নাম নেই'})` : `“${entry.title || 'হিসাব'}”`;
  if (!confirm(`${label} মুছে ফেলবেন? এই কাজটি আর ফিরিয়ে আনা যাবে না।`)) return;
  try {
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await deleteDoc(doc(db, 'users', activeUser.uid, 'entries', entry.id));
    showToast('হিসাব মুছে ফেলা হয়েছে');
  } catch (error) { console.error('Delete failed', error); showToast('হিসাব মুছতে পারেনি—Firebase সংযোগ দেখুন'); }
}
$('#recent-rows').addEventListener('click', handleEntryActions);
$('#transaction-rows').addEventListener('click', handleEntryActions);

function render() {
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
  const borrowed = entries.filter(e => e.type === 'loan' && e.direction === 'borrowed').reduce((s, e) => s + Math.max(0, Number(e.amount) - Number(e.paidAmount || 0)), 0);
  const lent = entries.filter(e => e.type === 'loan' && e.direction === 'lent').reduce((s, e) => s + Math.max(0, Number(e.amount) - Number(e.paidAmount || 0)), 0);
  const repaid = entries.filter(e => e.type === 'loan').reduce((s, e) => s + Number(e.paidAmount || 0), 0);
  $('#balance-value').textContent = money(income - expense);
  $('#income-value').textContent = money(income);
  $('#expense-value').textContent = money(expense);
  $('#loan-value').textContent = money(borrowed + lent);
  $('#donut-total').textContent = money(expense);
  $('#report-income').textContent = money(income);
  $('#report-expense').textContent = money(expense);
  $('#report-net').textContent = money(income - expense);
  $('#lent-total').textContent = money(lent);
  $('#borrowed-total').textContent = money(borrowed);
  $('#repaid-total').textContent = money(repaid);
  const recent = sortedEntries();
  renderRows($('#recent-rows'), recent.slice(0, 6));
  const query = $('#search-transactions').value.trim().toLocaleLowerCase();
  const filtered = recent.filter(e => (currentFilter === 'all' || e.type === currentFilter) && (!query || `${e.title} ${e.person} ${e.category}`.toLocaleLowerCase().includes(query)));
  renderRows($('#transaction-rows'), filtered);
  renderLoans(recent.filter(e => e.type === 'loan'));
  renderCategories(expense);
  renderChart();
  renderReport();
}

function renderLoans(loans) {
  const el = $('#loan-list');
  if (!loans.length) { el.innerHTML = '<div class="empty-loans"><span>⇄</span><strong>এখনো কোনো ধার যোগ করা হয়নি</strong><p>ধার নিলে বা কাউকে ধার দিলে নাম, তারিখ আর টাকার অঙ্ক দিয়ে যোগ করুন</p></div>'; return; }
  el.innerHTML = loans.map(item => { const remaining = Math.max(0, Number(item.amount) - Number(item.paidAmount || 0)); return `<article class="loan-card"><span class="transaction-icon loan">⇄</span><div class="loan-person"><strong>${esc(item.person || 'নাম উল্লেখ নেই')}</strong><small>${item.direction === 'borrowed' ? 'আপনি ধার নিয়েছেন' : 'আপনি ধার দিয়েছেন'} · ${dateLabel(item.date)}${item.dueDate ? ` · ফেরতের তারিখ ${dateLabel(item.dueDate)}` : ''}</small></div><div class="loan-amount"><strong>${money(remaining)} বাকি</strong><small>মূল টাকা ${money(item.amount)}${Number(item.paidAmount || 0) ? ` · শোধ ${money(item.paidAmount)}` : ''}</small></div><button class="loan-action" data-repay="${esc(item.id)}" ${remaining <= 0 ? 'disabled' : ''}>${remaining <= 0 ? 'শোধ হয়েছে' : 'পরিশোধ যোগ'}</button><button class="row-edit" data-edit="${esc(item.id)}" aria-label="${esc(item.person || 'ধার')} সম্পাদনা">সম্পাদনা</button><button class="row-delete" data-delete="${esc(item.id)}" aria-label="${esc(item.person || 'ধার')} মুছুন">মুছুন</button></article>`; }).join('');
}

$('#loan-list').addEventListener('click', async event => {
  if (event.target.closest('[data-edit], [data-delete]')) { await handleEntryActions(event); return; }
  const button = event.target.closest('[data-repay]');
  if (!button || !activeUser || !db) return;
  const loan = entries.find(item => item.id === button.dataset.repay);
  if (!loan) return;
  const remaining = Math.max(0, Number(loan.amount) - Number(loan.paidAmount || 0));
  selectedLoanForRepayment = loan;
  $('#repayment-balance').textContent = `${loan.person || 'ব্যক্তি'} · বাকি ${money(remaining)}`;
  $('#repayment-form').elements.amount.max = String(remaining);
  $('#repayment-form').elements.amount.value = String(remaining);
  $('#repayment-form').elements.date.value = today;
  $('#repayment-dialog').showModal();
});
$$('[data-close-repayment]').forEach(button => button.addEventListener('click', () => $('#repayment-dialog').close()));
$('#repayment-form').addEventListener('submit', async event => {
  event.preventDefault();
  const loan = selectedLoanForRepayment;
  if (!loan || !activeUser || !db) { showToast('Firebase সংযোগ চালু নেই'); return; }
  const form = new FormData(event.currentTarget);
  const payment = Number(form.get('amount'));
  const paymentDate = String(form.get('date'));
  const remaining = Math.max(0, Number(loan.amount) - Number(loan.paidAmount || 0));
  if (!Number.isFinite(payment) || payment <= 0 || payment > remaining) { showToast('পরিশোধের অঙ্কটি বাকি টাকার চেয়ে বেশি বা ভুল হয়েছে'); return; }
  if (!paymentDate) { showToast('পরিশোধের তারিখ দিন'); return; }
  try {
    const { doc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await updateDoc(doc(db, 'users', activeUser.uid, 'entries', loan.id), {
      paidAmount: Number(loan.paidAmount || 0) + payment,
      payments: arrayUnion({ amount: payment, date: paymentDate, createdAt: Date.now() })
    });
    $('#repayment-dialog').close();
    event.currentTarget.reset();
    selectedLoanForRepayment = null;
    showToast('পরিশোধের হিসাব হালনাগাদ হয়েছে');
  } catch (error) { console.error('Repayment update failed', error); showToast('পরিশোধের হিসাব সংরক্ষণ হয়নি'); }
});

const colors = ['#13946a', '#f19a83', '#6684d1', '#d5ac43', '#9273ca', '#56a5b5', '#d8799a', '#8e9d92', '#c6814a'];
function renderCategories(total) {
  const groups = {};
  entries.filter(e => e.type === 'expense').forEach(e => groups[e.category || 'অন্যান্য'] = (groups[e.category || 'অন্যান্য'] || 0) + Number(e.amount));
  const parts = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const list = $('#category-list');
  if (!parts.length || !total) { list.innerHTML = '<div class="category-empty">খরচের হিসাব যোগ করুন</div>'; $('#expense-donut').style.background = 'conic-gradient(#e8efeb 0% 100%)'; return; }
  let position = 0;
  const slices = parts.map(([, value], i) => { const start = position; position += value / total * 100; return `${colors[i % colors.length]} ${start}% ${position}%`; });
  $('#expense-donut').style.background = `conic-gradient(${slices.join(',')})`;
  list.innerHTML = parts.slice(0, 6).map(([name, value], i) => `<div class="category-row"><i class="legend-dot" style="background:${colors[i % colors.length]}"></i>${esc(name)}<strong>${money(value)}</strong></div>`).join('');
}

function renderChart() {
  const monthsCount = $('#chart-range').selectedIndex === 1 ? 12 : 6;
  const now = new Date(); const months = [];
  for (let i = monthsCount - 1; i >= 0; i--) { const date = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: date.getFullYear(), m: date.getMonth(), label: new Intl.DateTimeFormat('bn-BD', { month: 'short' }).format(date), income: 0, expense: 0 }); }
  entries.forEach(e => { const [y, m] = (e.date || '').split('-').map(Number); const month = months.find(item => item.y === y && item.m === m - 1); if (month && (e.type === 'income' || e.type === 'expense')) month[e.type] += Number(e.amount); });
  const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense])) * 1.15;
  $('#chart-bars').innerHTML = months.some(m => m.income || m.expense) ? months.map(m => `<div class="month-bars" title="${m.label}: আয় ${money(m.income)}, খরচ ${money(m.expense)}"><i class="bar" style="height:${m.income / max * 100}%"></i><i class="bar expense-bar" style="height:${m.expense / max * 100}%"></i></div>`).join('') : '<div class="empty-chart">লেনদেন যোগ হলে এখানে মাসিক চার্ট দেখা যাবে</div>';
  $('#x-labels').innerHTML = months.map(m => `<span>${m.label}</span>`).join('');
}
function getReportRows() {
  const period = $('#report-period').value;
  const selectedDate = $('#report-date').value || today;
  const [year, month, day] = selectedDate.split('-');
  const key = period === 'day' ? selectedDate : period === 'month' ? `${year}-${month}` : year;
  const inRange = date => !!date && (period === 'day' ? date === key : period === 'month' ? date.startsWith(key) : date.startsWith(key));
  const rows = [];
  entries.forEach(entry => {
    if (inRange(entry.date)) rows.push({ date: entry.date, title: entry.type === 'loan' ? entry.person || 'নাম উল্লেখ নেই' : entry.title, category: entry.type === 'loan' ? 'ধার' : entry.category || 'অন্যান্য', type: entry.type === 'income' ? 'আয়' : entry.type === 'expense' ? 'খরচ' : entry.direction === 'borrowed' ? 'ধার নিয়েছেন' : 'ধার দিয়েছেন', amount: Number(entry.amount), recordType: entry.type });
    (entry.payments || []).forEach(payment => {
      if (!inRange(payment.date)) return;
      rows.push({ date: payment.date, title: `${entry.direction === 'borrowed' ? 'ধার পরিশোধ' : 'ধার ফেরত'} · ${entry.person || 'নাম উল্লেখ নেই'}`, category: 'ধারের পরিশোধ', type: entry.direction === 'borrowed' ? 'পরিশোধ করেছেন' : 'ফেরত পেয়েছেন', amount: Number(payment.amount), recordType: 'payment' });
    });
  });
  const bengaliYear = new Intl.DateTimeFormat('bn-BD', { year: 'numeric' }).format(new Date(Number(year), 0, 1));
  const name = period === 'day' ? `দৈনিক · ${dateLabel(selectedDate)}` : period === 'month' ? `মাসিক · ${new Intl.DateTimeFormat('bn-BD', { month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1))}` : `বার্ষিক · ${bengaliYear}`;
  return { rows: rows.sort((a, b) => b.date.localeCompare(a.date)), period, selectedDate, name };
}

function renderReport() {
  const report = getReportRows();
  const income = report.rows.filter(row => row.recordType === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = report.rows.filter(row => row.recordType === 'expense').reduce((sum, row) => sum + row.amount, 0);
  const loans = report.rows.filter(row => row.recordType === 'loan').reduce((sum, row) => sum + row.amount, 0);
  const max = Math.max(1, income, expense);
  const periodName = { day: 'দৈনিক হিসাব', month: 'মাসিক হিসাব', year: 'বার্ষিক হিসাব' }[report.period];
  $('#report-title').textContent = periodName;
  $('#report-range-label').textContent = report.name;
  $('#report-generated-date').textContent = dateLabel(today);
  $('#report-entry-count').textContent = `${report.rows.length.toLocaleString('bn-BD')}টি লেনদেন`;
  $('#report-income').textContent = money(income);
  $('#report-expense').textContent = money(expense);
  $('#report-net').textContent = money(income - expense);
  $('#report-loans').textContent = money(loans);
  $('#report-compare').innerHTML = `<div class="compare-row"><span>আয়</span><div class="compare-track"><div class="compare-fill" style="width:${income / max * 100}%"></div></div><strong>${money(income)}</strong></div><div class="compare-row"><span>খরচ</span><div class="compare-track"><div class="compare-fill expense-fill" style="width:${expense / max * 100}%"></div></div><strong>${money(expense)}</strong></div>`;
  $('#report-rows').innerHTML = report.rows.length ? report.rows.map(row => `<tr><td>${dateLabel(row.date)}</td><td>${esc(row.title)}</td><td>${esc(row.category)}</td><td>${esc(row.type)}</td><td class="amount-cell ${row.recordType === 'expense' ? 'expense' : row.recordType === 'loan' ? 'loan' : ''}">${money(row.amount)}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="5">এই সময়সীমায় কোনো লেনদেন নেই</td></tr>';
}

$$('.filter-tab').forEach(button => button.addEventListener('click', () => { currentFilter = button.dataset.filter; $$('.filter-tab').forEach(b => b.classList.toggle('selected', b === button)); render(); }));
$('#search-transactions').addEventListener('input', render);
$('#chart-range').addEventListener('change', renderChart);
$('#report-period').addEventListener('change', () => {
  const period = $('#report-period').value;
  $('#report-date-label').firstChild.textContent = period === 'day' ? 'তারিখ' : period === 'month' ? 'মাসের তারিখ' : 'বছরের তারিখ';
  renderReport();
});
$('#report-date').addEventListener('change', renderReport);
$('#export-csv').addEventListener('click', () => {
  const report = getReportRows();
  if (!report.rows.length) { showToast('এই সময়সীমায় এক্সপোর্ট করার মতো কোনো হিসাব নেই'); return; }
  const rows = [['তারিখ', 'ধরন', 'বিবরণ/ব্যক্তি', 'খাত', 'পরিমাণ'], ...report.rows.map(row => [row.date, row.type, row.title, row.category, row.amount])];
  const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `hisab-${report.period}-${report.selectedDate}.csv`; a.click(); URL.revokeObjectURL(url); showToast('CSV ফাইল তৈরি হয়েছে');
});

$('#export-pdf').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!window.html2pdf) {
    button.disabled = true;
    try { await import('./vendor/html2pdf.bundle.min.js'); }
    catch (error) { console.error('PDF module failed to load', error); showToast('PDF তৈরির লাইব্রেরি লোড হয়নি'); button.disabled = false; return; }
    button.disabled = false;
  }
  const report = getReportRows();
  button.disabled = true;
  const oldText = button.textContent;
  const reportDocument = $('#report-document');
  reportDocument.classList.add('pdf-exporting');
  button.textContent = 'PDF তৈরি হচ্ছে…';
  try {
    await document.fonts.ready;
    await window.html2pdf().set({
      margin: [10, 9, 12, 9],
      filename: `hisab-${report.period}-${report.selectedDate}.pdf`,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.report-document-head', '.report-summary', '.report-entries thead'] }
    }).from(reportDocument).save();
    showToast('PDF রিপোর্ট ডাউনলোড হয়েছে');
  } catch (error) { console.error('PDF export failed', error); showToast('PDF তৈরি হয়নি—আবার চেষ্টা করুন'); }
  finally { reportDocument.classList.remove('pdf-exporting'); button.disabled = false; button.textContent = oldText; }
});

$('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUser || !db) { showToast('Firebase সেটআপ করে Google লগইন করুন, তারপর হিসাব সংরক্ষণ হবে'); return; }
  const form = new FormData(event.currentTarget);
  const existing = editingEntryId ? entries.find(item => item.id === editingEntryId) : null;
  if (editingEntryId && !existing) { showToast('হিসাবটি পাওয়া যায়নি—তালিকা আবার দেখুন'); $('#entry-dialog').close(); return; }
  const entry = { type: currentType, title: String(form.get('title') || '').trim(), category: String(form.get('category') || 'অন্যান্য'), amount: Number(form.get('amount')), date: String(form.get('date')), note: String(form.get('note') || '').trim(), ...(!editingEntryId ? { createdAt: Date.now() } : {}) };
  if (currentType === 'loan') { entry.direction = String(form.get('direction')); entry.person = String(form.get('person') || '').trim(); entry.dueDate = String(form.get('dueDate') || ''); if (!entry.person) { showToast('ধার দেওয়া বা নেওয়া ব্যক্তির নাম লিখুন'); return; } }
  if (!entry.amount || entry.amount <= 0) { showToast('সঠিক টাকার পরিমাণ লিখুন'); return; }
  if (existing?.type === 'loan' && entry.amount < Number(existing.paidAmount || 0)) { showToast(`টাকার পরিমাণ আগে শোধ করা ${money(existing.paidAmount)}-এর কম হতে পারবে না`); return; }
  try {
    const store = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    if (editingEntryId) {
      await store.updateDoc(store.doc(db, 'users', activeUser.uid, 'entries', editingEntryId), { ...entry, updatedAt: store.serverTimestamp() });
      showToast('পরিবর্তন সংরক্ষণ হয়েছে');
    } else {
      await store.addDoc(store.collection(db, 'users', activeUser.uid, 'entries'), { ...entry, createdAt: store.serverTimestamp() });
      showToast('হিসাব Firebase-এ সংরক্ষিত হয়েছে');
    }
    $('#entry-dialog').close(); event.currentTarget.reset(); editingEntryId = null; $$('.type-option').forEach(option => { option.disabled = false; });
  } catch (error) { console.error('Save failed', error); showToast('সংরক্ষণ হয়নি—Firebase Rules ও internet সংযোগ দেখুন'); }
});

function setAvatar(element, imageUrl, label = 'আ') {
  if (!element) return;
  element.replaceChildren();
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = `${label} profile`;
    image.loading = 'lazy';
    element.append(image);
  } else element.textContent = String(label || 'আ').trim().charAt(0).toLocaleUpperCase() || 'আ';
}

function updateAccountAppearance() {
  const name = activeUser ? (profile.name || activeUser.displayName || activeUser.email || 'আমার প্রোফাইল') : 'Google দিয়ে লগইন';
  $('#account-label').innerHTML = `${esc(name)}<small>${activeUser ? 'Firebase-এ সিঙ্ক হচ্ছে' : 'আপনার হিসাব সিঙ্ক করুন'}</small>`;
  const imageUrl = profile.logoData || activeUser?.photoURL || '';
  setAvatar($('#account-avatar'), imageUrl, name);
  setAvatar($('#top-login'), imageUrl, name);
  $('#top-login').setAttribute('aria-label', activeUser ? 'Google অ্যাকাউন্ট থেকে লগআউট' : 'Google দিয়ে লগইন');
}

function renderProfile() {
  const fields = $('#profile-form').elements;
  if (activeUser) {
    fields.name.value = profile.name || activeUser.displayName || '';
    fields.phone.value = profile.phone || '';
    fields.address.value = profile.address || '';
  } else {
    fields.name.value = ''; fields.phone.value = ''; fields.address.value = '';
  }
  const photo = profile.logoData || activeUser?.photoURL || '';
  const preview = $('#profile-preview');
  preview.replaceChildren();
  if (photo) { const img = document.createElement('img'); img.src = photo; img.alt = 'আপনার profile ছবি'; preview.append(img); }
  else { const initial = document.createElement('span'); initial.textContent = (profile.name || activeUser?.displayName || 'আ').trim().charAt(0) || 'আ'; preview.append(initial); }
  $('#profile-image-status').textContent = !activeUser ? 'প্রোফাইল সংরক্ষণে Google দিয়ে লগইন করুন' : removeLogoOnSave ? 'ছবি সরানো হবে—সংরক্ষণ চাপুন' : pendingLogoData ? 'নতুন ছবি বাছা হয়েছে—সংরক্ষণ চাপুন' : profile.logoData ? 'আপনার ছবি Firebase-এ সংরক্ষিত' : activeUser.photoURL ? 'Google profile photo দেখানো হচ্ছে' : 'ছবি আপনার Firebase profile-এ নিরাপদে থাকবে';
  $('#profile-image').disabled = !activeUser;
  $('#remove-profile-image').hidden = !activeUser || (!profile.logoData && !pendingLogoData);
  $$('#profile-form input, #profile-form textarea, #profile-form button[type="submit"]').forEach(field => { field.disabled = !activeUser; });
}

$('#profile-image').addEventListener('change', event => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  if (!activeUser) { showToast('প্রোফাইল ছবি দিতে আগে Google দিয়ে লগইন করুন'); input.value = ''; return; }
  if (!file.type.startsWith('image/')) { showToast('একটি ছবি ফাইল বাছুন'); input.value = ''; return; }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    URL.revokeObjectURL(objectUrl);
    pendingLogoData = canvas.toDataURL('image/jpeg', 0.78);
    if (pendingLogoData.length > 280000) { canvas.width = 160; canvas.height = 160; canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 160, 160); pendingLogoData = canvas.toDataURL('image/jpeg', 0.65); }
    if (pendingLogoData.length > 280000) { pendingLogoData = null; showToast('ছবিটি অনেক বড়—ছোট ছবি বাছুন'); input.value = ''; return; }
    removeLogoOnSave = false; profile.logoData = pendingLogoData; renderProfile(); updateAccountAppearance();
  };
  image.onerror = () => { URL.revokeObjectURL(objectUrl); showToast('ছবিটি পড়া যায়নি—অন্য ছবি বাছুন'); };
  image.src = objectUrl;
});

$('#remove-profile-image').addEventListener('click', () => {
  if (!activeUser) return;
  pendingLogoData = ''; removeLogoOnSave = true; profile.logoData = ''; renderProfile(); updateAccountAppearance();
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUser || !db) { showToast('প্রোফাইল সংরক্ষণে Google দিয়ে লগইন করুন'); return; }
  const values = new FormData(event.currentTarget);
  const nextProfile = {
    name: String(values.get('name') || '').trim(),
    phone: String(values.get('phone') || '').trim(),
    address: String(values.get('address') || '').trim(),
    logoData: removeLogoOnSave ? '' : pendingLogoData !== null ? pendingLogoData : profile.logoData || ''
  };
  if (!nextProfile.name) { showToast('আপনার নাম লিখুন'); return; }
  try {
    const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await setDoc(doc(db, 'users', activeUser.uid), { ...nextProfile, updatedAt: serverTimestamp() }, { merge: true });
    profile = nextProfile; pendingLogoData = null; removeLogoOnSave = false; renderProfile(); updateAccountAppearance(); showToast('আপনার প্রোফাইল সংরক্ষিত হয়েছে');
  } catch (error) { console.error('Profile save failed', error); showToast('প্রোফাইল সংরক্ষণ হয়নি—Firestore rules দেখুন'); }
});

async function startFirebase() {
  if (!firebaseReady) return;
  try {
    const [appModule, authModule, storeModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    const app = appModule.initializeApp(firebaseConfig); auth = authModule.getAuth(app); db = storeModule.getFirestore(app);
    authModule.onAuthStateChanged(auth, user => {
      activeUser = user;
      if (unsubscribeEntries) { unsubscribeEntries(); unsubscribeEntries = null; }
      if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null; }
      if (!user) {
        entries = []; profile = { name: '', phone: '', address: '', logoData: '' }; pendingLogoData = null; removeLogoOnSave = false;
        render(); renderProfile(); updateAccountAppearance(); $('#sync-label').textContent = 'Google লগইন করা নেই'; $('#sync-label').previousElementSibling.classList.remove('connected'); $('#cloud-notice').classList.remove('hidden'); return;
      }
      profile = { name: user.displayName || '', phone: '', address: '', logoData: '' };
      updateAccountAppearance(); $('#sync-label').textContent = 'Firebase-এ সিঙ্ক হচ্ছে'; $('#sync-label').previousElementSibling.classList.add('connected'); $('#cloud-notice').classList.add('hidden');
      const { collection, query, orderBy, onSnapshot, doc } = storeModule;
      unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), snapshot => {
        const saved = snapshot.exists() ? snapshot.data() : {};
        profile = { name: String(saved.name || user.displayName || ''), phone: String(saved.phone || ''), address: String(saved.address || ''), logoData: typeof saved.logoData === 'string' ? saved.logoData : '' };
        renderProfile(); updateAccountAppearance();
      }, error => { console.error('Profile sync failed', error); $('#profile-image-status').textContent = 'প্রোফাইল sync হয়নি—Firestore rules যাচাই করুন'; });
      unsubscribeEntries = onSnapshot(query(collection(db, 'users', user.uid, 'entries'), orderBy('date', 'desc')), snapshot => {
        entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toMillis?.() || 0 })); render(); $('#sync-label').textContent = 'Firebase-এ সিঙ্ক হয়েছে';
      }, error => { console.error('Sync failed', error); $('#sync-label').textContent = 'সিঙ্ক হয়নি — Firebase Rules দেখুন'; showToast('Firebase ডেটা পড়া যায়নি'); });
    });
  } catch (error) { console.error('Firebase initialization failed', error); $('#sync-label').textContent = 'Firebase কনফিগারেশন যাচাই করুন'; showToast('Firebase চালু হয়নি—প্রজেক্ট কনফিগারেশন দেখুন'); }
}
async function login() {
  if (!firebaseReady) { showToast('প্রথমে firebase-config.js-এ Firebase Web App config বসান'); return; }
  if (activeUser) {
    if (!confirm('এই Google অ্যাকাউন্ট থেকে লগআউট করবেন?')) return;
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'); await signOut(auth); return;
  }
  try { const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'); await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { console.error('Login failed', error); showToast(error.code === 'auth/unauthorized-domain' ? 'Firebase Auth-এর অনুমোদিত domain তালিকায় এই সাইট যোগ করুন' : 'Google লগইন হয়নি—Firebase Authentication সেটআপ দেখুন'); }
}
$('#login-button').addEventListener('click', login); $('#notice-login').addEventListener('click', login); $('#top-login').addEventListener('click', login);
render(); renderProfile(); updateAccountAppearance(); startFirebase();
