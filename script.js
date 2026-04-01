const accountsData = JSON.parse(document.getElementById('accounts-data').textContent);

const themeToggle = document.getElementById('theme-toggle');
const themeToggleMobile = document.getElementById('theme-toggle-mobile');
const customizeToggle = document.getElementById('dashboard-customize');
const notifToggle = document.getElementById('notif-toggle');
const notifDropdown = document.getElementById('notif-dropdown');
const notifClear = document.getElementById('notif-clear');

const THEME_KEY = 'hsbc-theme';
const REMOVED_KEY = 'hsbc-removed';
const LAYOUT_KEY = 'hsbc-layout';
let currentPage = 'dashboard';


setTimeout(() => { 
	const dashGrid = document.querySelector('.dash-grid');
	dashGrid.classList.remove('animating');
},3000)

/* ── Helpers ─────────────────────────────────── */
function parseAmount(v) {
	return parseFloat(String(v).replace(/,/g, '')) || 0;
}

function fmt(v) {
	return new Intl.NumberFormat('en-GB', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(v);
}

/* ── Theme ───────────────────────────────────── */
function applyTheme(t) {
	const dark = t === 'dark';
	document.body.classList.toggle('theme-dark', dark);
	[themeToggle, themeToggleMobile].forEach(btn => {
		if (!btn) return;
		btn.setAttribute('aria-pressed', dark);
		btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
		const ic = btn.querySelector('i');
		if (ic) ic.setAttribute('data-lucide', dark ? 'sun' : 'moon');
	});
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleTheme() {
	const next = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
	localStorage.setItem(THEME_KEY, next);
	applyTheme(next);
	waitForChart(() => {
		initSpendingChart(activeRange());
		initCategoryChart();
		initAccountValuesChart();
	});
	// Re-init globe if it's currently visible
	var globeEl = document.getElementById('globe-container');
	if (globeEl && globeEl.classList.contains('map-active')) {
		setTimeout(function () { initGlobe(); }, 100);
	}
}
[themeToggle, themeToggleMobile].forEach(btn => btn?.addEventListener('click', toggleTheme));

/* ── FX conversion to GBP ────────────────────── */
const fxToGBP = {
	GBP: 1,
	USD: 0.79,
	EUR: 1.17,
	AUD: 0.51,
	HKD: 0.10,
	CNY: 0.11
};

function toGBP(amount, currency) {
	return amount * (fxToGBP[currency] || 1);
}

/* ── Summary amount ──────────────────────────── */
function updateCombinedAmount() {
	const total = accountsData.accounts.reduce((s, a) => {
		const val = parseAmount(a.available);
		const gbpVal = toGBP(val, a.currency);
		return s + (a.accType === 'CC' ? -gbpVal : gbpVal);
	}, 0);
	const el = document.getElementById('combined-amount');
	if (el) animateCount(el, total);
}

function animateCount(el, target) {
	const duration = 800;
	const start = performance.now();
	const from = parseAmount(el.textContent);

	function tick(now) {
		const t = Math.min((now - start) / duration, 1);
		const ease = 1 - Math.pow(1 - t, 3);
		el.textContent = fmt(from + (target - from) * ease);
		if (t < 1) requestAnimationFrame(tick);
	}
	requestAnimationFrame(tick);
}

/* ── Edit mode ───────────────────────────────── */
function toggleEditMode() {
	document.body.classList.toggle('edit-mode');
}

function getSectionId(el) {
	return el?.dataset?.sectionId || '';
}

function getRemovedSections() {
	try {
		return JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
	} catch {
		return [];
	}
}

function applyRemovedSections() {
	const removed = new Set(getRemovedSections());
	document.querySelectorAll('[data-section-id]').forEach(el => el.classList.toggle('is-removed', removed.has(el.dataset.sectionId)));
}

function removeSection(section) {
	const id = getSectionId(section);
	if (!id) return;
	const r = new Set(getRemovedSections());
	r.add(id);
	localStorage.setItem(REMOVED_KEY, JSON.stringify([...r]));
	section.classList.add('is-removed');
	saveLayout();
}

function saveLayout() {
	const layout = {};
	document.querySelectorAll('.dash-col').forEach(col => {
		const colKey = col.classList.contains('dash-col--a') ? 'a' : col.classList.contains('dash-col--b') ? 'b' : 'c';
		layout[colKey] = Array.from(col.querySelectorAll('[data-section-id]')).map(el => el.dataset.sectionId);
	});
	localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function restoreLayout() {
	try {
		const layout = JSON.parse(localStorage.getItem(LAYOUT_KEY));
		if (!layout) return;
		const cols = {
			a: document.querySelector('.dash-col--a'),
			b: document.querySelector('.dash-col--b'),
			c: document.querySelector('.dash-col--c')
		};
		Object.entries(layout).forEach(([colKey, sectionIds]) => {
			const col = cols[colKey];
			if (!col) return;
			sectionIds.forEach(id => {
				const el = document.querySelector(`[data-section-id="${id}"]`);
				if (el) col.appendChild(el);
			});
		});
	} catch { }
}

function bindRemoveButtons() {
	document.querySelectorAll('.remove-btn').forEach(btn => {
		if (btn.dataset.bound) return;
		btn.dataset.bound = '1';
		btn.addEventListener('click', () => {
			if (document.body.classList.contains('edit-mode')) removeSection(btn.closest('[data-section-id]'));
		});
	});
}

/* ── Layout: move col C cards on non-ultrawide ── */
function distributeCards() {
	const isUltraWide = window.innerWidth >= 1600;
	const colC = document.querySelector('.dash-col--c');
	const colA = document.querySelector('.dash-col--a');
	const colB = document.querySelector('.dash-col--b');
	if (!colC || !colA || !colB) return;

	const colCCards = colC.querySelectorAll(':scope > .card, :scope > [data-section-id]');

	if (!isUltraWide) {
		colCCards.forEach((card, i) => {
			if (!card.dataset.originalParent) card.dataset.originalParent = 'c';
			if (i % 2 === 0) colA.appendChild(card);
			else colB.appendChild(card);
		});
	} else {
		document.querySelectorAll('[data-original-parent="c"]').forEach(card => {
			colC.appendChild(card);
		});
	}
}

let resizeTimer;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	requestAnimationFrame(() => {
		distributeCards();
	})
});

/* ── Accounts ────────────────────────────────── */
const typeMap = {
	CA: {
		filter: 'current',
		label: 'Current',
		desc: 'Current Acc'
	},
	SA: {
		filter: 'savings',
		label: 'Savings',
		desc: 'Savings Acc'
	},
	CC: {
		filter: 'cards',
		label: 'Card',
		desc: 'Credit Card'
	}
};

function accountIcon(t) {
	return t === 'CC' ? 'credit-card' : t === 'SA' ? 'piggy-bank' : 'landmark';
}

function renderAccounts(sortBy = 'default') {
	const container = document.getElementById('accounts-container');
	if (!container) return;
	let accs = accountsData.accounts.map((a, i) => ({
		...a,
		idx: i
	}));
	if (sortBy === 'value-desc') accs.sort((a, b) => parseAmount(b.available) - parseAmount(a.available));
	else if (sortBy === 'value-asc') accs.sort((a, b) => parseAmount(a.available) - parseAmount(b.available));
	else if (sortBy === 'currency') accs.sort((a, b) => a.currency.localeCompare(b.currency));
	else if (sortBy === 'type') accs.sort((a, b) => a.accType.localeCompare(b.accType));
	else if (sortBy === 'name') accs.sort((a, b) => a.name.localeCompare(b.name));

	container.innerHTML = accs.map(acc => {
		const am = parseAmount(acc.available);
		const disp = am < 0 ? `- ${fmt(Math.abs(am))}` : fmt(am);
		const t = typeMap[acc.accType] || typeMap.CA;
		return `<div class="list-row" tabindex="0" role="button" data-account-id="${acc.idx}" data-type="${t.filter}">
			<div class="account-icon"><i data-lucide="${accountIcon(acc.accType)}"></i></div>
			<div class="account-text">
				<div class="account-name">${acc.name}</div>
				<div class="account-detail">${acc.accCntryCode} | ${acc.fmtdAccNo} | ${t.desc}</div>
			</div>
			<div class="account-right">
				<div class="account-balance">${disp} <span class="account-currency">${acc.currency}</span></div>
				<span class="account-badge">${t.label}</span>
			</div>
		</div>`;
	}).join('');

	container.querySelectorAll('.list-row').forEach(card => {
		card.addEventListener('click', () => showAccountPanel(card.dataset.accountId));
		card.addEventListener('keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				showAccountPanel(card.dataset.accountId);
			}
		});
	});
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function bindFiltersAndSorting() {
	const radios = document.querySelectorAll('input[name="account-filter"]');
	const labels = document.querySelectorAll('.seg-control__btn');
	const segCtrl = document.querySelector('.seg-control');
	radios.forEach((r, i) => r.addEventListener('change', () => {
		if (!r.checked) return;
		labels.forEach(l => l.classList.remove('seg-control__btn--active'));
		r.parentElement.classList.add('seg-control__btn--active');
		segCtrl?.style.setProperty('--active-index', i);
		const f = r.dataset.filter;
		document.querySelectorAll('.list-row[data-account-id]').forEach(a => a.style.display = (f === 'all' || a.dataset.type === f) ? '' : 'none');
	}));
	const sel = document.getElementById('sort-select');
	if (sel) sel.addEventListener('change', e => {
		renderAccounts(e.target.value);
		const checked = document.querySelector('input[name="account-filter"]:checked');
		if (checked && checked.dataset.filter !== 'all') {
			const f = checked.dataset.filter;
			document.querySelectorAll('.list-row[data-account-id]').forEach(a => {
				if (a.dataset.type !== f) a.style.display = 'none';
			});
		}
	});
}

/* ── Panel ───────────────────────────────────── */
function openPanel() {
	const p = document.getElementById('slide-panel');
	p.classList.add('active');
	p.removeAttribute('inert');
	p.setAttribute('aria-hidden', 'false');
	document.body.classList.add('panel-open');
}

function closePanel() {
	const p = document.getElementById('slide-panel');
	p.classList.remove('active');
	p.setAttribute('inert', '');
	p.setAttribute('aria-hidden', 'true');
	document.body.classList.remove('panel-open');
	document.querySelectorAll('.list-row[data-account-id]').forEach(c => c.classList.remove('is-selected'));
	showView('account');
}

function showView(name) {
	document.querySelectorAll('.panel__view').forEach(v => v.style.display = 'none');
	const target = document.getElementById('panel-view-' + name);
	if (target) target.style.display = 'flex';
}

let currentTxns = [];

function showAccountPanel(accountId) {
	const acc = accountsData.accounts[accountId];
	if (!acc) return;
	currentTxns = dummyTxns[parseInt(accountId) + 1] || [];
	document.getElementById('panel-account-name').textContent = acc.name;
	document.getElementById('panel-account-details').textContent = `${acc.accCntryCode} | ${acc.fmtdAccNo}`;
	document.getElementById('panel-balance').textContent = fmt(parseAmount(acc.available));
	document.getElementById('panel-currency').textContent = acc.currency;
	document.querySelectorAll('.panel__tab').forEach(t => t.classList.remove('panel__tab--active'));
	document.querySelector('.panel__tab[data-tab="all"]').classList.add('panel__tab--active');
	const si = document.getElementById('txn-search');
	if (si) si.value = '';
	renderTxns(currentTxns);
	document.querySelectorAll('.list-row[data-account-id]').forEach(c => c.classList.toggle('is-selected', c.dataset.accountId === String(accountId)));
	showView('account');
	openPanel();
}

function showPaymentsPanel(type) {
	const data = paymentsData[type];
	if (!data) return;
	document.getElementById('panel-payments-title').textContent = data.title;
	document.getElementById('panel-payments-subtitle').textContent = data.subtitle;
	const list = document.getElementById('panel-payments-list');
	if (!list) return;
	if (!data.payments?.length) {
		list.innerHTML = '<div class="panel-items-empty">No payments in this category.</div>';
	} else {
		list.innerHTML = data.payments.map(p => {
			const out = p.amount < 0;
			const amStr = `${out ? '' : '+'}${fmt(Math.abs(p.amount))} ${p.currency}`;
			const amCls = `panel-item__amount--${out ? 'out' : 'in'}`;
			const chipCls = `chip chip--${data.statusClass === 'urgent' ? 'red' : data.statusClass === 'warning' ? 'amber' : data.statusClass === 'green' ? 'green' : 'neutral'}`;
			let btns = '';
			if (data.actions.includes('approve')) btns += `<button class="panel-item__btn panel-item__btn--approve" data-action="approve" data-id="${p.id}"><i data-lucide="check"></i> Authorise</button>`;
			if (data.actions.includes('reject')) btns += `<button class="panel-item__btn panel-item__btn--reject" data-action="reject" data-id="${p.id}"><i data-lucide="x"></i> Reject</button>`;
			if (data.actions.includes('retry')) btns += `<button class="panel-item__btn panel-item__btn--approve" data-action="retry" data-id="${p.id}"><i data-lucide="refresh-cw"></i> Retry</button>`;
			if (data.actions.includes('cancel')) btns += `<button class="panel-item__btn panel-item__btn--reject" data-action="cancel" data-id="${p.id}"><i data-lucide="x"></i> Cancel</button>`;
			if (data.actions.includes('nudge')) btns += `<button class="panel-item__btn panel-item__btn--nudge" data-action="nudge" data-id="${p.id}"><i data-lucide="bell-ring"></i> Nudge</button>`;
			if (data.actions.includes('view')) btns += `<button class="panel-item__btn panel-item__btn--secondary" data-action="view" data-id="${p.id}"><i data-lucide="eye"></i> View</button>`;
			return `<div class="panel-item" data-pid="${p.id}">
				<div class="panel-item__header"><span class="panel-item__title">${p.payee}</span><span class="panel-item__amount ${amCls}">${amStr}</span></div>
				<div class="panel-item__meta">
					<div class="panel-item__meta-col"><span class="label-upper">ID</span><span class="text-xs fw-500">${p.id}</span></div>
					<div class="panel-item__meta-col"><span class="label-upper">Ref</span><span class="text-xs fw-500">${p.ref}</span></div>
					<div class="panel-item__meta-col"><span class="label-upper">Type</span><span class="text-xs fw-500">${p.type}</span></div>
					<div class="panel-item__meta-col"><span class="label-upper">Date</span><span class="text-xs fw-500">${p.date}</span></div>
					<div class="panel-item__meta-col"><span class="label-upper">From</span><span class="text-xs fw-500">${p.from}</span></div>
				</div>
				${p.reason ? `<div class="panel-item__reason">${p.reason}</div>` : ''}
				<div class="${chipCls}" id="status-${p.id}">${data.statusLabel}</div>
				<div class="panel-item__actions">${btns}</div>
			</div>`;
		}).join('');
	}
	list.querySelectorAll('.panel-item__btn').forEach(btn => btn.addEventListener('click', () => {
		const {
			action,
			id
		} = btn.dataset;
		const item = btn.closest('.panel-item');
		const sEl = item.querySelector(`#status-${id}`);
		const actionsEl = item.querySelector('.panel-item__actions');
		if (action === 'approve') {
			item.style.opacity = '.4';
			item.style.pointerEvents = 'none';
			updateStatusEl(sEl, 'chip chip--green', '\u2713 Authorised');
			actionsEl.innerHTML = '';
		} else if (action === 'reject' || action === 'cancel') {
			item.style.opacity = '.4';
			item.style.pointerEvents = 'none';
			updateStatusEl(sEl, 'chip chip--red', action === 'cancel' ? '\u2715 Cancelled' : '\u2715 Rejected');
			actionsEl.innerHTML = '';
		} else if (action === 'retry') {
			updateStatusEl(sEl, 'chip chip--neutral', 'Resubmitted');
			actionsEl.innerHTML = '';
		} else if (action === 'nudge') {
			btn.disabled = true;
			btn.innerHTML = '<i data-lucide="check"></i> Nudged';
			btn.style.opacity = '.6';
			btn.style.cursor = 'default';
		} else if (action === 'view') {
			alert('Viewing details for ' + id);
		}
		if (typeof lucide !== 'undefined') lucide.createIcons();
	}));
	if (typeof lucide !== 'undefined') lucide.createIcons();
	showView('payments');
	openPanel();
}

function updateStatusEl(el, cls, txt) {
	if (!el) return;
	el.className = cls;
	el.textContent = txt;
}

function showSendMoneyPanel() {
	const form = document.getElementById('send-money-form');
	const body = document.getElementById('send-money-body');
	if (form) {
		form.reset();
		if (body && !body.contains(form)) body.appendChild(form);
	}
	showView('send-money');
	openPanel();
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showCardManagerPanel() {
	loadCardsFromAccounts();
	showView('cards');
	openPanel();
	renderCards();
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

let dummyCards = [];

function loadCardsFromAccounts() {
	const dataEl = document.getElementById('accounts-data');
	if (!dataEl) return;
	const data = JSON.parse(dataEl.textContent);
	dummyCards = data.accounts
		.filter(acc => acc.accType === 'CC')
		.map(acc => ({
			id: 'card_' + acc.unFmtdAccNo,
			name: acc.name,
			type: 'physical',
			last4: acc.fmtdAccNo.split('-').pop(),
			holder: 'David Yarham',
			status: 'active',
			currency: acc.currency,
			balance: acc.available
		}));
}

function renderCards() {
	const container = document.getElementById('cards-list');
	container.innerHTML = dummyCards.map(card => `
		<div class="card-item ${card.status === 'frozen' ? 'frozen' : ''}">
			<div>
				<div class="card-item__top">
					<div>
						<div class="card-item__logo">VISA</div>
						<div class="card-item__name">${card.name}</div>
					</div>
					<div class="card-item__status ${card.status === 'frozen' ? 'frozen' : ''}">
						<div class="card-item__status-dot"></div>
						<span>${card.status === 'frozen' ? 'Frozen' : 'Active'}</span>
					</div>
				</div>
				<div class="card-item__chip">💳</div>
			</div>
			<div>
				<div class="card-item__number">•••• •••• •••• ${card.last4}</div>
				<div class="card-item__footer">
					<div class="card-item__holder-section">
						<span class="card-item__holder-label">Card Holder</span>
						<span class="card-item__holder">${card.holder.split(' ')[0]}</span>
					</div>
					<div class="card-item__expiry-section">
						<span class="card-item__expiry-label">Expires</span>
						<span class="card-item__expiry">12/28</span>
					</div>
				</div>
				<div class="card-item__actions">
					<button class="card-item__action-btn" onclick="toggleCardFreeze('${card.id}')">
						<i data-lucide="${card.status === 'frozen' ? 'unlock' : 'lock'}"></i>
					</button>
					<button class="card-item__action-btn" onclick="setCardLimit('${card.id}')">
						<i data-lucide="sliders-horizontal"></i>
					</button>
				</div>
			</div>
		</div>
	`).join('');
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleCardFreeze(cardId) {
	const card = dummyCards.find(c => c.id === cardId);
	if (card) {
		card.status = card.status === 'frozen' ? 'active' : 'frozen';
		renderCards();
	}
}

function setCardLimit(cardId) {
	const card = dummyCards.find(c => c.id === cardId);
	if (card) {
		const newLimit = prompt(`Set new limit for ${card.name}:`, card.limit);
		if (newLimit) {
			card.limit = parseInt(newLimit);
			renderCards();
		}
	}
}

function viewCardDetails(cardId) {
	const card = dummyCards.find(c => c.id === cardId);
	if (card) {
		alert(`${card.name}\nType: ${card.type === 'virtual' ? 'Virtual Card' : 'Physical Card'}\nStatus: ${card.status === 'frozen' ? 'Frozen' : 'Active'}\nSpent: £${card.spent.toLocaleString()} of £${card.limit.toLocaleString()}`);
	}
}

/* ── Transactions ────────────────────────────── */
const dummyTxns = {
	1: [{
		date: '2026-03-08',
		description: 'Client Payment - ABC Corp',
		amount: 5200,
		category: 'Income'
	},
	{
		date: '2026-03-08',
		description: 'Online Transfer',
		amount: -1200,
		category: 'Transfer'
	},
	{
		date: '2026-03-07',
		description: 'Payroll Processing',
		amount: -8500,
		category: 'Payroll'
	},
	{
		date: '2026-03-07',
		description: 'Client Payment - Tech Solutions',
		amount: 2400,
		category: 'Income'
	},
	{
		date: '2026-03-06',
		description: 'AWS Billing',
		amount: -567.8,
		category: 'Software'
	},
	{
		date: '2026-03-05',
		description: 'Office Rent',
		amount: -2400,
		category: 'Rent'
	},
	{
		date: '2026-03-05',
		description: 'Consulting Fee',
		amount: 1800,
		category: 'Income'
	}
	],
	2: [{
		date: '2026-03-01',
		description: 'Interest Earned',
		amount: 45.23,
		category: 'Interest'
	},
	{
		date: '2026-02-28',
		description: 'Deposit',
		amount: 5000,
		category: 'Transfer'
	}
	],
	3: [{
		date: '2026-03-08',
		description: 'Software Subscription',
		amount: -299,
		category: 'Software'
	},
	{
		date: '2026-03-08',
		description: 'Adobe Creative Cloud',
		amount: -54.99,
		category: 'Software'
	}
	],
	4: [{
		date: '2026-03-08',
		description: 'Supplier Payment',
		amount: -3400,
		category: 'Supplies'
	},
	{
		date: '2026-03-08',
		description: 'Payment Received',
		amount: 2100,
		category: 'Income'
	}
	]
};

function relDate(d) {
	const today = new Date('2026-03-09'),
		dt = new Date(d),
		diff = Math.floor((today - dt) / 86400000);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Yesterday';
	if (diff < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
	return dt.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()] + ' ' + dt.getFullYear();
}

function renderTxns(txns, filter = 'all') {
	const c = document.getElementById('transactions-list');
	if (!c) return;
	let list = txns;
	if (filter === 'in') list = txns.filter(t => t.amount > 0);
	if (filter === 'out') list = txns.filter(t => t.amount < 0);
	if (!list.length) {
		c.innerHTML = '<div class="item-rows-empty">No transactions found</div>';
		return;
	}
	const groups = {};
	list.forEach(t => {
		if (!groups[t.date]) groups[t.date] = [];
		groups[t.date].push(t);
	});
	c.innerHTML = Object.keys(groups).sort().reverse().map(date => `
		<div class="item-row__group-date">${relDate(date)}</div>
		${groups[date].map(t => `<div class="item-row ${t.amount > 0 ? 'item-row--credit' : ''}">
			<div><div class="item-row__desc">${t.description}</div><div class="item-row__sub">${t.amount < 0 ? 'Paid' : 'Received'}</div></div>
			<div class="item-row__right"><div class="item-row__cat">${t.category}</div><div class="item-row__amount ${t.amount > 0 ? 'color-positive' : ''}">${t.amount < 0 ? '-' : '+'}${fmt(Math.abs(t.amount))}</div></div>
		</div>`).join('')}
	`).join('');
}

/* ── Panel controls ──────────────────────────── */
function bindPanelControls() {
	document.getElementById('close-panel')?.addEventListener('click', closePanel);
	document.getElementById('close-panel-payments')?.addEventListener('click', closePanel);
	document.getElementById('close-panel-send-money')?.addEventListener('click', closePanel);
	document.getElementById('sm-cancel')?.addEventListener('click', closePanel);

	document.querySelectorAll('.panel__tab').forEach(tab => tab.addEventListener('click', () => {
		document.querySelectorAll('.panel__tab').forEach(t => t.classList.remove('panel__tab--active'));
		tab.classList.add('panel__tab--active');
		renderTxns(currentTxns, tab.dataset.tab);
	}));

	const search = document.getElementById('txn-search');
	if (search) search.addEventListener('input', e => {
		const q = e.target.value.toLowerCase();
		const activeTab = document.querySelector('.panel__tab--active');
		const f = activeTab?.dataset.tab || 'all';
		let list = currentTxns;
		if (f === 'in') list = list.filter(t => t.amount > 0);
		if (f === 'out') list = list.filter(t => t.amount < 0);
		if (q) list = list.filter(t => t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
		renderTxns(list);
	});

	const smForm = document.getElementById('send-money-form');
	if (smForm) smForm.addEventListener('submit', e => {
		e.preventDefault();
		const amount = document.getElementById('sm-amount').value;
		const currency = document.getElementById('sm-currency').value;
		const payee = document.getElementById('sm-payee-name').value;
		if (!amount || !payee) {
			alert('Please fill in all required fields.');
			return;
		}
		const body = document.getElementById('send-money-body');
		if (body) {
			body.innerHTML = `<div class="success-view">
				<div class="success-view__icon"><i data-lucide="check"></i></div>
				<h3 style="font-size:18px;font-weight:400">Payment submitted</h3>
				<p class="text-xs color-secondary">Your payment of ${currency} ${parseFloat(amount).toFixed(2)} to <strong>${payee}</strong> has been submitted for authorisation.</p>
				<button class="btn-ghost" id="sm-done-btn">Done</button>
			</div>`;
			if (typeof lucide !== 'undefined') lucide.createIcons();
			document.getElementById('sm-done-btn')?.addEventListener('click', closePanel);
		}
	});

	document.querySelectorAll('.list-row[data-payment-type]').forEach(item => {
		item.addEventListener('click', () => showPaymentsPanel(item.dataset.paymentType));
		item.addEventListener('keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				showPaymentsPanel(item.dataset.paymentType);
			}
		});
	});

	document.getElementById('send-money-btn')?.addEventListener('click', showSendMoneyPanel);
	document.getElementById('send-money-btn-mobile')?.addEventListener('click', e => {
		e.preventDefault();
		showSendMoneyPanel();
	});

	document.getElementById('close-panel-cards')?.addEventListener('click', closePanel);
	document.getElementById('manage-cards-btn')?.addEventListener('click', showCardManagerPanel);
	document.getElementById('create-virtual-card')?.addEventListener('click', () => {
		alert('Virtual card created! Check your cards panel for details.');
		const newCard = {
			id: 'card_' + Date.now(),
			name: 'New Virtual Card',
			type: 'virtual',
			last4: Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
			holder: 'David Yarham',
			status: 'active',
			limit: 5000,
			spent: 0,
			lastTransaction: 'No recent activity'
		};
		dummyCards.unshift(newCard);
		renderCards();
	});
}

/* ── Permissions Page ───────────────────────────── */
const orgData = {
	id: 'user_ceo',
	name: 'Sarah Chen',
	title: 'Chief Executive Officer',
	role: 'CEO',
	permissions: ['view_all', 'manage_users', 'manage_permissions', 'view_reports', 'approve_payments'],
	children: [
		{
			id: 'user_cfo',
			name: 'Michael Rodriguez',
			title: 'Chief Financial Officer',
			role: 'CFO',
			permissions: ['view_reports', 'manage_accounts', 'approve_payments'],
			children: [
				{
					id: 'user_controller',
					name: 'Jennifer Kim',
					title: 'Controller',
					role: 'Finance',
					permissions: ['view_reports', 'manage_accounts'],
					children: []
				},
				{
					id: 'user_accountant',
					name: 'David Patel',
					title: 'Senior Accountant',
					role: 'Finance',
					permissions: ['view_reports'],
					children: []
				}
			]
		},
		{
			id: 'user_cto',
			name: 'Emma Johnson',
			title: 'Chief Technology Officer',
			role: 'Technology',
			permissions: ['view_reports', 'manage_systems'],
			children: [
				{
					id: 'user_devlead',
					name: 'Alex Kumar',
					title: 'Development Lead',
					role: 'Technology',
					permissions: ['view_reports'],
					children: []
				}
			]
		},
		{
			id: 'user_compliance',
			name: 'Lisa Anderson',
			title: 'Compliance Officer',
			role: 'Compliance',
			permissions: ['view_all', 'view_reports'],
			children: []
		}
	]
};

const availablePermissions = [
	{ id: 'view_all', name: 'View All Accounts', category: 'Viewing' },
	{ id: 'view_reports', name: 'View Reports', category: 'Viewing' },
	{ id: 'manage_accounts', name: 'Manage Accounts', category: 'Account Management' },
	{ id: 'manage_users', name: 'Manage Users', category: 'User Management' },
	{ id: 'manage_permissions', name: 'Manage Permissions', category: 'User Management' },
	{ id: 'approve_payments', name: 'Approve Payments', category: 'Payment Control' },
	{ id: 'manage_systems', name: 'Manage Systems', category: 'System Management' }
];

let selectedUser = null;

function renderOrgTree() {
	const container = document.getElementById('org-tree');
	if (!container) return;
	container.innerHTML = renderOrgNode(orgData, 0);
}

function renderOrgNode(node, level) {
	const icon = node.role === 'CEO' ? 'crown' : node.role === 'CFO' || node.role === 'Technology' || node.role === 'Compliance' ? 'briefcase' : 'user';
	let html = `
		<div class="org-node">
			<div class="org-node__item" onclick="selectUser('${node.id}', event)" style="cursor: pointer;">
				<i data-lucide="${icon}"></i>
				<div>
					<div class="org-node__name">${node.name}</div>
					<div class="org-node__title">${node.title}</div>
				</div>
			</div>
	`;

	if (node.children && node.children.length > 0) {
		html += '<div class="org-children">';
		node.children.forEach(child => {
			html += renderOrgNode(child, level + 1);
		});
		html += '</div>';
	}

	html += '</div>';
	return html;
}

function selectUser(userId, event) {
	event.stopPropagation();
	selectedUser = findUserInTree(orgData, userId);
	if (!selectedUser) return;

	document.querySelectorAll('.org-node__item').forEach(el => el.classList.remove('active'));
	event.currentTarget.classList.add('active');

	renderPermissions();
}

function findUserInTree(node, userId) {
	if (node.id === userId) return node;
	if (node.children) {
		for (let child of node.children) {
			const found = findUserInTree(child, userId);
			if (found) return found;
		}
	}
	return null;
}

function renderPermissions() {
	const container = document.getElementById('permissions-content');
	const header = document.getElementById('selected-user');

	if (!selectedUser) {
		container.innerHTML = '<div class="permissions-empty">Select a user to manage permissions</div>';
		header.textContent = 'Select a user to manage permissions';
		return;
	}

	header.textContent = `${selectedUser.name} — ${selectedUser.title}`;

	const groupedPerms = {};
	availablePermissions.forEach(perm => {
		if (!groupedPerms[perm.category]) groupedPerms[perm.category] = [];
		groupedPerms[perm.category].push(perm);
	});

	let html = '';
	Object.entries(groupedPerms).forEach(([category, perms]) => {
		html += `<div class="permissions-section">
			<div class="permissions-section-title">${category}</div>`;

		perms.forEach(perm => {
			const isChecked = selectedUser.permissions.includes(perm.id) ? 'checked' : '';
			html += `
				<div class="permission-item">
					<input type="checkbox" id="perm_${perm.id}" ${isChecked} onchange="updatePermission('${perm.id}', this.checked)">
					<label for="perm_${perm.id}">
						<span class="permission-name">${perm.name}</span>
					</label>
				</div>
			`;
		});

		html += '</div>';
	});

	container.innerHTML = html;
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updatePermission(permId, isGranted) {
	if (!selectedUser) return;
	if (isGranted) {
		if (!selectedUser.permissions.includes(permId)) {
			selectedUser.permissions.push(permId);
		}
	} else {
		selectedUser.permissions = selectedUser.permissions.filter(p => p !== permId);
	}
}

function initPermissionsPage() {
	renderOrgTree();
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Notifications ───────────────────────────── */
function bindNotifications() {
	if (!notifToggle || !notifDropdown) return;
	notifToggle.addEventListener('click', e => {
		e.stopPropagation();
		const open = notifDropdown.classList.toggle('active');
		notifToggle.setAttribute('aria-expanded', open);
	});
	document.addEventListener('click', e => {
		if (!notifDropdown.contains(e.target) && !notifToggle.contains(e.target)) {
			notifDropdown.classList.remove('active');
			notifToggle.setAttribute('aria-expanded', 'false');
		}
	});
	notifClear?.addEventListener('click', () => {
		notifDropdown.querySelector('.dropdown__list').innerHTML = '<div class="item-rows-empty">No new notifications</div>';
		const b = document.querySelector('.badge--alert');
		if (b) b.style.display = 'none';
	});
}

/* ── Global search ───────────────────────────── */
function bindGlobalSearch() {
	const input = document.querySelector('.global-search__input');
	if (!input) return;

	const examples = [
		'What are my biggest expenses?',
		'Show me my Q1 spending trends',
		'Which accounts are inactive?',
		'Summarize my recent payments',
		'What changed this month?'
	];

	const dummyResponses = {
		'expenses': 'Your top spending categories this month are Software (22%), Dining (18%), and Travel (15%). You\'re tracking 12% higher than last month, mainly due to subscription renewals.',
		'spending': 'Q1 shows a 5% increase in overall spend compared to Q4. The main drivers are increased dining expenses (up 23%) and new software subscriptions. Travel expenses remain stable.',
		'accounts': 'You have 3 inactive accounts: Savings Account (last activity 4 months ago), Holiday Fund (6 months), and Business Backup (8 months). Consider archiving or closing these.',
		'payments': 'Your recent activity includes 8 payments totaling £45,230. The largest payment was £12,500 to Acme Corp on March 18. All payments processed successfully.',
		'changed': 'Key changes this month: +2 new vendor connections, +£8,500 in international transactions, 1 new team member added with permissions.',
		'default': 'Based on your financial data, here\'s what I found: Your account shows healthy patterns with no unusual activity detected. Continue monitoring your spending trends for better insights.'
	};

	let currentExample = 0;
	let currentChar = 0;
	let isTyping = true;
	let typewriterTimeout;
	let isAnimating = true;

	function typeWriter() {
		if (!isAnimating) return;

		const example = examples[currentExample];

		if (isTyping) {
			// Type out character by character
			if (currentChar < example.length) {
				currentChar++;
				input.placeholder = example.substring(0, currentChar);
				typewriterTimeout = setTimeout(typeWriter, 50);
			} else {
				// Hold the full text for a moment
				isTyping = false;
				typewriterTimeout = setTimeout(typeWriter, 2500);
			}
		} else {
			// Start erasing
			if (currentChar > 0) {
				currentChar--;
				input.placeholder = example.substring(0, currentChar);
				typewriterTimeout = setTimeout(typeWriter, 30);
			} else {
				// Move to next example
				currentExample = (currentExample + 1) % examples.length;
				currentChar = 0;
				isTyping = true;
				typewriterTimeout = setTimeout(typeWriter, 300);
			}
		}
	}

	// Start the animation
	typeWriter();

	// Pause animation when user starts typing
	input.addEventListener('focus', () => {
		isAnimating = false;
		clearTimeout(typewriterTimeout);
	});

	// Resume animation when user leaves
	input.addEventListener('blur', () => {
		if (input.value === '') {
			isAnimating = true;
			currentExample = 0;
			currentChar = 0;
			isTyping = true;
		}
	});

	// Handle Enter key to show response
	input.addEventListener('keydown', e => {
		if (e.key === 'Enter' && input.value.trim()) {
			e.preventDefault();
			const question = input.value;

			// Determine response based on question keywords
			let response = dummyResponses.default;
			const lowerQ = question.toLowerCase();

			if (lowerQ.includes('expense') || lowerQ.includes('spending')) response = dummyResponses.expenses;
			else if (lowerQ.includes('trend') || lowerQ.includes('q1') || lowerQ.includes('quarter')) response = dummyResponses.spending;
			else if (lowerQ.includes('inactive') || lowerQ.includes('account')) response = dummyResponses.accounts;
			else if (lowerQ.includes('payment')) response = dummyResponses.payments;
			else if (lowerQ.includes('changed') || lowerQ.includes('change')) response = dummyResponses.changed;

			// Use View Transitions API for smooth morph
			if (document.startViewTransition) {
				document.startViewTransition(() => {
					showAIChat(question, response);
				});
			} else {
				showAIChat(question, response);
			}

			// Clear input
			input.value = '';
			input.blur();
		}
		if (e.key === 'Escape') input.blur();
	});

	function showAIChat(question, response) {
		const modal = document.getElementById('ai-response-modal');
		const chatMessages = document.getElementById('chat-messages');
		chatMessages.innerHTML = '';

		// Add user message
		const userMsg = document.createElement('div');
		userMsg.className = 'ai-message user';
		userMsg.innerHTML = `<div class="ai-message__content">${question}</div>`;
		chatMessages.appendChild(userMsg);

		// Add bot response
		const botMsg = document.createElement('div');
		botMsg.className = 'ai-message bot';
		botMsg.innerHTML = `<div class="ai-message__content">${response}</div>`;
		chatMessages.appendChild(botMsg);

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		modal.classList.add('active');

		// Handle follow-up questions
		const modalInput = document.getElementById('modal-input');
		const modalSend = document.getElementById('modal-send');

		const sendFollowUp = () => {
			const followUpQuestion = modalInput.value.trim();
			if (!followUpQuestion) return;

			// Add user follow-up
			const userFollowUp = document.createElement('div');
			userFollowUp.className = 'ai-message user';
			userFollowUp.innerHTML = `<div class="ai-message__content">${followUpQuestion}</div>`;
			chatMessages.appendChild(userFollowUp);

			// Get response for follow-up
			let followUpResponse = dummyResponses.default;
			const lowerQ = followUpQuestion.toLowerCase();

			if (lowerQ.includes('expense') || lowerQ.includes('spending')) followUpResponse = dummyResponses.expenses;
			else if (lowerQ.includes('trend') || lowerQ.includes('q1') || lowerQ.includes('quarter')) followUpResponse = dummyResponses.spending;
			else if (lowerQ.includes('inactive') || lowerQ.includes('account')) followUpResponse = dummyResponses.accounts;
			else if (lowerQ.includes('payment')) followUpResponse = dummyResponses.payments;
			else if (lowerQ.includes('changed') || lowerQ.includes('change')) followUpResponse = dummyResponses.changed;

			// Add bot follow-up response
			const botFollowUp = document.createElement('div');
			botFollowUp.className = 'ai-message bot';
			botFollowUp.innerHTML = `<div class="ai-message__content">${followUpResponse}</div>`;
			chatMessages.appendChild(botFollowUp);

			modalInput.value = '';
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		modalSend.onclick = sendFollowUp;
		modalInput.onkeydown = (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				sendFollowUp();
			}
		};
	}

	document.addEventListener('keydown', e => {
		if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
			e.preventDefault();
			input.focus();
		}
	});
}

/* ── Currency Map Data ──────────────────────── */

const currencyLocations = {
	GBP: {
		lat: 51.5074,
		lng: -0.1278,
		country: 'United Kingdom',
		code: 'GB'
	},
	USD: {
		lat: 40.7128,
		lng: -74.0060,
		country: 'United States',
		code: 'US'
	},
	EUR: {
		lat: 48.8566,
		lng: 2.3522,
		country: 'European Union',
		code: 'EU'
	},
	AUD: {
		lat: -33.8688,
		lng: 151.2093,
		country: 'Australia',
		code: 'AU'
	},
	HKD: {
		lat: 22.3193,
		lng: 114.1694,
		country: 'Hong Kong',
		code: 'HK'
	},
	CNY: {
		lat: 39.9042,
		lng: 116.4074,
		country: 'China',
		code: 'CN'
	}
};

let flatMapInstance = null;
let globeScene = null,
	globeCamera = null,
	globeRenderer = null,
	globeGroup = null;

function initFlatMap() {
	const container = document.getElementById('flat-map');
	if (!container) {
		console.warn('Flat map container not found');
		return;
	}

	if (typeof L === 'undefined') {
		console.warn('Leaflet library not loaded');
		return;
	}

	// Ensure container is visible and has dimensions
	container.style.display = 'block';
	container.style.width = '100%';
	container.style.height = '100%';

	if (flatMapInstance) {
		try {
			flatMapInstance.remove();
		} catch (e) { }
	}
	container.innerHTML = '';
	flatMapInstance = L.map(container).setView([20, 0], 2);
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '\u00a9 OpenStreetMap',
		maxZoom: 19
	}).addTo(flatMapInstance);

	const currTotals = {};
	accountsData.accounts.forEach(acc => {
		if (acc.accType === 'CC') return;
		if (!currTotals[acc.currency]) currTotals[acc.currency] = 0;
		currTotals[acc.currency] += parseAmount(acc.available);
	});

	const currSymbols = { GBP: '\u00a3', USD: '\u0024', EUR: '\u20ac', AUD: 'A\u0024', HKD: 'HK\u0024' };
	Object.entries(currTotals).forEach(([curr, amount]) => {
		const loc = currencyLocations[curr];
		if (!loc) return;
		const sym = currSymbols[curr] || '';
		const marker = L.divIcon({
			html: '<div class="flat-map-bubble"><div class="flat-map-bubble__dot"></div><div class="flat-map-bubble__label"><span class="flat-map-bubble__curr">' + curr + '</span><span class="flat-map-bubble__amt">' + sym + fmt(amount) + '</span></div></div>',
			className: '',
			iconSize: [120, 40],
			iconAnchor: [8, 20]
		});
		L.marker([loc.lat, loc.lng], {
			icon: marker
		})
			.bindPopup('<div class="currency-popup"><strong>' + curr + '</strong><br/>' + loc.country + '<br/>' + sym + fmt(amount) + '</div>')
			.addTo(flatMapInstance);
	});

}

function initGlobe() {
	var container = document.getElementById('globe-container');
	if (!container || typeof ThreeGlobe === 'undefined' || typeof THREE === 'undefined') return;
	container.innerHTML = '';
	var width = container.clientWidth;
	var height = container.clientHeight;
	var isDark = document.body.classList.contains('theme-dark');

	var currTotals = {};
	accountsData.accounts.forEach(function (acc) {
		if (acc.accType === 'CC') return;
		if (!currTotals[acc.currency]) currTotals[acc.currency] = 0;
		currTotals[acc.currency] += parseAmount(acc.available);
	});

	var currSymbols = { GBP: '\u00a3', USD: '\u0024', EUR: '\u20ac', AUD: 'A\u0024', HKD: 'HK\u0024', CNY: '\u00a5' };

	var bubbleData = [];
	Object.entries(currTotals).forEach(function (entry) {
		var curr = entry[0], amount = entry[1];
		var loc = currencyLocations[curr];
		if (!loc) return;
		bubbleData.push({ lat: loc.lat, lng: loc.lng, curr: curr, amount: amount });
	});

	var baseColor = isDark ? '#333333' : '#e8e8e8';
	var polyColor = isDark ? '#444444' : '#f4f4f4';
	var sideColor = isDark ? '#2a2a2a' : '#cccccc';

	// Fetch country polygons and build globe
	fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
		.then(function (r) { return r.json(); })
		.then(function (worldData) {
			var countries = topojson.feature(worldData, worldData.objects.countries).features;

			var globe = new ThreeGlobe()
				.showGlobe(true)
				.showAtmosphere(true)
				.atmosphereColor(isDark ? '#444444' : '#dddddd')
				.atmosphereAltitude(0.12)
				.polygonsData(countries)
				.polygonCapColor(function () { return polyColor; })
				.polygonSideColor(function () { return sideColor; })
				.polygonStrokeColor(function () { return isDark ? '#555555' : '#cccccc'; })
				.polygonAltitude(0.012);

			// Style globe surface
			var globeMat = globe.globeMaterial();
			globeMat.color = new THREE.Color(baseColor);
			globeMat.shininess = 5;
			globeMat.specular = new THREE.Color(isDark ? 0x111111 : 0x444444);

			globeScene = new THREE.Scene();
			globeScene.add(globe);

			// Soft lighting for that matte white look
			var ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 1.5 : 2.5);
			globeScene.add(ambientLight);
			var dirLight1 = new THREE.DirectionalLight(0xffffff, isDark ? 0.8 : 1.2);
			dirLight1.position.set(4, 3, 5);
			globeScene.add(dirLight1);
			var dirLight2 = new THREE.DirectionalLight(0xffffff, isDark ? 0.3 : 0.5);
			dirLight2.position.set(-3, -2, 3);
			globeScene.add(dirLight2);

			globeCamera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
			globeCamera.position.z = 260;

			globeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
			globeRenderer.setPixelRatio(window.devicePixelRatio);
			globeRenderer.setSize(width, height);
			container.appendChild(globeRenderer.domElement);

			// HTML bubble overlays - use three-globe's getCoords to match positions
			var R = 101;
			var markers = [];
			bubbleData.forEach(function (d) {
				var phi = (90 - d.lat) * Math.PI / 180;
				var theta = (90 - d.lng) * Math.PI / 180;
				var x = R * Math.sin(phi) * Math.cos(theta);
				var y = R * Math.cos(phi);
				var z = R * Math.sin(phi) * Math.sin(theta);
				var bubble = document.createElement('div');
				bubble.className = 'globe-bubble';
				bubble.innerHTML = '<span class="globe-bubble__curr">' + d.curr + '</span><span class="globe-bubble__amt">' + (currSymbols[d.curr] || '') + fmt(d.amount) + '</span>';
				container.appendChild(bubble);
				markers.push({ pos: new THREE.Vector3(x, y, z), bubble: bubble });
			});

			function updateBubbles() {
				globe.updateMatrixWorld(true);
				globeCamera.updateMatrixWorld(true);
				var w2 = width / 2, h2 = height / 2;
				markers.forEach(function (m) {
					var projected = m.pos.clone().applyMatrix4(globe.matrixWorld).project(globeCamera);
					var world = m.pos.clone().applyMatrix4(globe.matrixWorld);
					var camDir = new THREE.Vector3();
					globeCamera.getWorldDirection(camDir);
					var dt = world.clone().sub(globeCamera.position).normalize().dot(camDir);
					if (dt < 0 || projected.z > 1) {
						m.bubble.style.display = 'none';
						return;
					}
					m.bubble.style.display = '';
					m.bubble.style.left = (projected.x * w2 + w2) + 'px';
					m.bubble.style.top = (-projected.y * h2 + h2) + 'px';
				});
			}

			// Drag to rotate
			var isDragging = false;
			var userActive = false;
			var idleTimer = null;
			var prevMouse = { x: 0, y: 0 };
			var rotX = 0, rotY = 0;
			globeRenderer.domElement.addEventListener('mousedown', function (e) {
				isDragging = true;
				userActive = true;
				if (idleTimer) clearTimeout(idleTimer);
				prevMouse = { x: e.clientX, y: e.clientY };
			});
			window.addEventListener('mouseup', function () {
				isDragging = false;
				idleTimer = setTimeout(function () { userActive = false; }, 2000);
			});
			window.addEventListener('mousemove', function (e) {
				if (!isDragging) return;
				var dx = e.clientX - prevMouse.x;
				var dy = e.clientY - prevMouse.y;
				rotY += dx * 0.005;
				rotX += dy * 0.005;
				rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
				prevMouse = { x: e.clientX, y: e.clientY };
			});

			(function animate() {
				requestAnimationFrame(animate);
				if (!userActive) rotY += 0.001;
				globe.rotation.x = rotX;
				globe.rotation.y = rotY;
				updateBubbles();
				globeRenderer.render(globeScene, globeCamera);
			})();
		});
}

function bindMapToggle() {
	document.querySelectorAll('[data-map-type]').forEach(btn => {
		btn.addEventListener('click', () => {
			const type = btn.dataset.mapType;
			document.querySelectorAll('[data-map-type]').forEach(b => {
				b.classList.remove('tab--active');
				b.setAttribute('aria-selected', 'false');
			});
			btn.classList.add('tab--active');
			btn.setAttribute('aria-selected', 'true');
			const flatEl = document.getElementById('flat-map');
			const globeEl = document.getElementById('globe-container');
			if (type === 'flat') {
				if (flatEl) flatEl.classList.add('map-active');
				if (globeEl) globeEl.classList.remove('map-active');
				setTimeout(() => {
					if (flatMapInstance) flatMapInstance.invalidateSize();
					else initFlatMap();
				}, 50);
			} else {
				if (flatEl) flatEl.classList.remove('map-active');
				if (globeEl) globeEl.classList.add('map-active');
				setTimeout(() => initGlobe(), 50);
			}
		});
	});
}

/* ── FX Rates ────────────────────────────────── */
const fxPairs = [{
	pair: 'GBP / USD',
	rate: 1.2746,
	change: 0.32,
	history: [1.2650, 1.2680, 1.2700, 1.2720, 1.2740, 1.2746],
	color: '#005c58'
},
{
	pair: 'EUR / GBP',
	rate: 0.8521,
	change: -0.15,
	history: [0.8550, 0.8540, 0.8535, 0.8528, 0.8525, 0.8521],
	color: '#a3171a'
},
{
	pair: 'USD / JPY',
	rate: 149.23,
	change: 0.58,
	history: [148.00, 148.50, 148.90, 149.00, 149.15, 149.23],
	color: '#005c58'
},
{
	pair: 'AUD / GBP',
	rate: 0.5174,
	change: 0.21,
	history: [0.5150, 0.5160, 0.5165, 0.5170, 0.5172, 0.5174],
	color: '#005c58'
},
{
	pair: 'GBP / CAD',
	rate: 1.7142,
	change: -0.09,
	history: [1.7160, 1.7155, 1.7150, 1.7145, 1.7143, 1.7142],
	color: '#a3171a'
},
{
	pair: 'USD / CHF',
	rate: 0.8812,
	change: 0.43,
	history: [0.8780, 0.8790, 0.8800, 0.8805, 0.8810, 0.8812],
	color: '#005c58'
}
];

let fxCharts = {};
let fxLiveData = [];
let fxInterval = null;
const FX_MAX_POINTS = 30;

function initFXCards() {
	const grid = document.getElementById('fx-grid');
	if (!grid) return;
	if (fxInterval) clearInterval(fxInterval);

	// Init live data arrays with seed history
	fxLiveData = fxPairs.map(fx => {
		var pts = fx.history.slice();
		while (pts.length < FX_MAX_POINTS) {
			var last = pts[pts.length - 1];
			pts.push(last + (Math.random() - 0.5) * last * 0.002);
		}
		return { rate: pts[pts.length - 1], openRate: fx.rate, points: pts };
	});

	grid.innerHTML = fxPairs.map((fx, i) => {
		var chg = ((fxLiveData[i].rate - fx.rate) / fx.rate * 100);
		var up = chg >= 0;
		return '<div class="fx-card" style="--fx-color: ' + fx.color + ';"><div class="fx-card__header"><div class="fx-card__pair">' + fx.pair + '</div><span class="fx-card__change" id="fx-change-' + i + '"><i data-lucide="' + (up ? 'trending-up' : 'trending-down') + '"></i>' + Math.abs(chg).toFixed(2) + '%</span></div><div class="fx-card__rate" id="fx-rate-' + i + '">' + fxLiveData[i].rate.toFixed(4) + '</div><div class="fx-card__chart"><canvas id="fx-chart-' + i + '"></canvas></div><div class="fx-card__meta"><span>Live</span><span style="font-weight: 600;" id="fx-meta-' + i + '">' + (up ? '+' : '') + chg.toFixed(2) + '%</span></div></div>';
	}).join('');
	if (typeof lucide !== 'undefined') lucide.createIcons();

	waitForChart(() => {
		fxPairs.forEach((fx, i) => {
			var ctx = document.getElementById('fx-chart-' + i);
			if (!ctx || typeof Chart === 'undefined') return;
			if (fxCharts[i]) fxCharts[i].destroy();
			fxCharts[i] = new Chart(ctx, {
				type: 'line',
				data: {
					labels: fxLiveData[i].points.map(function (_, j) { return j; }),
					datasets: [{
						data: fxLiveData[i].points.slice(),
						borderColor: 'rgba(255, 255, 255, 0.8)',
						backgroundColor: 'rgba(255, 255, 255, 0.1)',
						pointRadius: 0,
						pointHoverRadius: 0,
						borderWidth: 1.5,
						tension: 0.3,
						fill: true
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					animation: { duration: 300 },
					plugins: { legend: { display: false }, tooltip: { enabled: false } },
					scales: {
						x: { display: false },
						y: { display: false }
					}
				}
			});
		});

		// Tick every second
		fxInterval = setInterval(function () {
			fxPairs.forEach(function (fx, i) {
				var ld = fxLiveData[i];
				// Random walk: slight drift + noise
				var drift = (Math.random() - 0.48) * ld.rate * 0.0008;
				var noise = (Math.random() - 0.5) * ld.rate * 0.001;
				ld.rate = ld.rate + drift + noise;
				ld.points.push(ld.rate);
				if (ld.points.length > FX_MAX_POINTS) ld.points.shift();

				var chg = ((ld.rate - ld.openRate) / ld.openRate * 100);
				var up = chg >= 0;

				// Update rate display
				var rateEl = document.getElementById('fx-rate-' + i);
				if (rateEl) rateEl.textContent = ld.rate.toFixed(4);

				// Update change badge
				var changeEl = document.getElementById('fx-change-' + i);
				if (changeEl) changeEl.innerHTML = '<i data-lucide="' + (up ? 'trending-up' : 'trending-down') + '"></i>' + Math.abs(chg).toFixed(2) + '%';

				// Update meta
				var metaEl = document.getElementById('fx-meta-' + i);
				if (metaEl) metaEl.textContent = (up ? '+' : '') + chg.toFixed(2) + '%';

				// Update chart
				var chart = fxCharts[i];
				if (chart) {
					chart.data.labels = ld.points.map(function (_, j) { return j; });
					chart.data.datasets[0].data = ld.points.slice();
					chart.update('none');
				}
			});
			if (typeof lucide !== 'undefined') lucide.createIcons();
		}, 1000);
	});
}

/* ── Page navigation ─────────────────────────── */
function navigateTo(page) {
	if (currentPage === page) return;
	currentPage = page;
	document.querySelectorAll('.page-view').forEach(v => v.classList.remove('page-view--active'));
	const target = document.getElementById('page-' + page);
	if (target) target.classList.add('page-view--active');
	document.querySelectorAll('.nav-item[data-page]').forEach(n => {
		n.classList.toggle('nav-item--active', n.dataset.page === page);
	});
	if (page === 'accounts') initAccountsPage();
	if (page === 'permissions') initPermissionsPage();
	if (page === 'dashboard') {
		waitForChart(() => {
			initSpendingChart(activeRange());
			initCategoryChart();
			initAccountValuesChart();
		});
	}

	// Close right panel when navigating pages
	closePanel();

	window.scrollTo({
		top: 0,
		behavior: 'instant'
	});
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

function bindNavigation() {
	document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
		btn.addEventListener('click', () => navigateTo(btn.dataset.page));
	});
}

/* ── Accounts page ───────────────────────────── */
function initAccountsPage() {
	const accs = accountsData.accounts;
	const totalBal = accs.reduce((s, a) => s + (a.accType === 'CC' ? -parseAmount(a.available) : parseAmount(a.available)), 0);
	const el = document.getElementById('acct-total-balance');
	if (el) el.textContent = fmt(totalBal);
	const countEl = document.getElementById('acct-count');
	if (countEl) countEl.textContent = accs.length;
	const currencies = new Set(accs.map(a => a.currency));
	const currEl = document.getElementById('acct-currencies');
	if (currEl) currEl.textContent = currencies.size;
	renderAccountsPage();
	bindAccountsPageControls();
}

function renderAccountsPage() {
	const container = document.getElementById('accounts-page-list');
	const emptyEl = document.getElementById('accounts-page-empty');
	if (!container) return;
	const search = (document.getElementById('acct-search-input')?.value || '').toLowerCase();
	const typeFilter = document.getElementById('acct-type-filter')?.value || 'all';
	const currFilter = document.getElementById('acct-currency-filter')?.value || 'all';
	const sortBy = document.getElementById('acct-sort-filter')?.value || 'default';
	let accs = accountsData.accounts.map((a, i) => ({
		...a,
		idx: i
	}));
	if (typeFilter !== 'all') accs = accs.filter(a => a.accType === typeFilter);
	if (currFilter !== 'all') accs = accs.filter(a => a.currency === currFilter);
	if (search) accs = accs.filter(a => a.name.toLowerCase().includes(search) || a.fmtdAccNo.toLowerCase().includes(search) || a.accCntryCode.toLowerCase().includes(search));
	if (sortBy === 'balance-desc') accs.sort((a, b) => parseAmount(b.available) - parseAmount(a.available));
	else if (sortBy === 'balance-asc') accs.sort((a, b) => parseAmount(a.available) - parseAmount(b.available));
	else if (sortBy === 'name') accs.sort((a, b) => a.name.localeCompare(b.name));
	else if (sortBy === 'type') accs.sort((a, b) => a.accType.localeCompare(b.accType));
	if (!accs.length) {
		container.style.display = 'none';
		if (emptyEl) emptyEl.style.display = 'flex';
		return;
	}
	container.style.display = 'flex';
	if (emptyEl) emptyEl.style.display = 'none';
	container.innerHTML = accs.map(acc => {
		const am = parseAmount(acc.available);
		const isNeg = am < 0;
		const disp = isNeg ? '- ' + fmt(Math.abs(am)) : fmt(am);
		const t = typeMap[acc.accType] || typeMap.CA;
		const iconName = accountIcon(acc.accType);
		const iconCls = acc.accType === 'CC' ? 'acct-card__icon--cc' : 'acct-card__icon--ca';
		const tagCls = acc.accType === 'CC' ? 'acct-tag--type-cc' : 'acct-tag--type-ca';
		const txns = dummyTxns[acc.idx + 1] || [];
		const recentTxns = txns.slice(0, 3);
		let txnRows = '';
		if (recentTxns.length) {
			txnRows = '<div class="acct-card__txns"><div class="acct-card__txns-title">Recent activity</div>' + recentTxns.map(tx => '<div class="acct-card__txn-row"><div><span class="acct-card__txn-desc">' + tx.description + '</span><br><span class="acct-card__txn-date">' + relDate(tx.date) + '</span></div><span class="acct-card__txn-amount ' + (tx.amount > 0 ? 'acct-card__txn-amount--credit' : '') + '">' + (tx.amount < 0 ? '-' : '+') + fmt(Math.abs(tx.amount)) + '</span></div>').join('') + '</div>';
		}
		return '<div class="acct-card" data-acct-idx="' + acc.idx + '"><div class="acct-card__main" role="button" tabindex="0"><div class="acct-card__icon ' + iconCls + '"><i data-lucide="' + iconName + '"></i></div><div class="acct-card__info"><h3 class="acct-card__name">' + acc.name + '</h3><p class="acct-card__number">' + acc.fmtdAccNo + '</p><div class="acct-card__tags"><span class="acct-tag ' + tagCls + '">' + t.label + '</span><span class="acct-tag acct-tag--country">' + acc.accCntryCode + '</span><span class="acct-tag acct-tag--currency">' + acc.currency + '</span></div></div><div class="acct-card__balance-col"><span class="acct-card__balance-label">Available</span><span class="acct-card__balance-amount ' + (isNeg ? 'acct-card__balance-amount--negative' : '') + '">' + disp + '</span><span class="acct-card__balance-currency">' + acc.currency + '</span></div><div class="acct-card__chevron"><i data-lucide="chevron-right"></i></div></div><div class="acct-card__details"><div class="acct-card__meta-grid"><div class="acct-card__meta-item"><span>Institution</span><strong>' + acc.accInst + '</strong></div><div class="acct-card__meta-item"><span>Country</span><strong>' + acc.accCntryCode + '</strong></div><div class="acct-card__meta-item"><span>Type</span><strong>' + t.desc + '</strong></div><div class="acct-card__meta-item"><span>Status</span><strong>Active</strong></div></div>' + txnRows + '<div class="acct-card__actions"><button class="btn-ghost btn-sm" data-acct-view="' + acc.idx + '"><i data-lucide="list"></i><span>Transactions</span></button><button class="btn-ghost btn-sm" onclick="alert(\'Work in Progress\')"><i data-lucide="file-text"></i><span>Statements</span></button><button class="btn-ghost btn-sm" onclick="alert(\'Work in Progress\')"><i data-lucide="arrow-left-right"></i><span>Transfer</span></button></div></div></div>';
	}).join('');
	container.querySelectorAll('.acct-card__main').forEach(main => {
		const toggle = () => main.closest('.acct-card').classList.toggle('acct-card--expanded');
		main.addEventListener('click', toggle);
		main.addEventListener('keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});
	});
	container.querySelectorAll('[data-acct-view]').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation();
			showAccountPanel(btn.dataset.acctView);
		});
	});
	if (typeof lucide !== 'undefined') lucide.createIcons();
}

let acctControlsBound = false;

function bindAccountsPageControls() {
	if (acctControlsBound) return;
	acctControlsBound = true;
	const searchInput = document.getElementById('acct-search-input');
	const typeFilter = document.getElementById('acct-type-filter');
	const currFilter = document.getElementById('acct-currency-filter');
	const sortFilter = document.getElementById('acct-sort-filter');
	const clearBtn = document.getElementById('acct-clear-filters');
	const rerender = () => renderAccountsPage();
	searchInput?.addEventListener('input', rerender);
	typeFilter?.addEventListener('change', rerender);
	currFilter?.addEventListener('change', rerender);
	sortFilter?.addEventListener('change', rerender);
	clearBtn?.addEventListener('click', () => {
		if (searchInput) searchInput.value = '';
		if (typeFilter) typeFilter.value = 'all';
		if (currFilter) currFilter.value = 'all';
		if (sortFilter) sortFilter.value = 'default';
		rerender();
	});
}

/* ── Charts ──────────────────────────────────── */
let chartSpending = null,
	chartCategory = null,
	chartAccValues = null,
	chartPaymentVolume = null;


function chartText() {
	return getComputedStyle(document.body).getPropertyValue('--c-text-2').trim() || '#666';
}

function chartGrid() {
	return document.body.classList.contains('theme-dark') ? '#2a2a2a' : '#f0f0f0';
}

function activeRange() {
	return document.querySelector('.tab--active')?.dataset?.range || '6m';
}

function initSpendingChart(range = '6m') {
	const ctx = document.getElementById('spending-chart');
	if (!ctx || typeof Chart === 'undefined') return;
	const all = {
		labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
		current: [45200, 42800, 38600, 41500, 46900, 52100]
	};
	let labels, current;
	if (range === '1m') {
		labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
		current = [46900, 48200, 50400, 52100];
	} else if (range === '3m') {
		labels = all.labels.slice(3);
		current = all.current.slice(3);
	} else {
		labels = all.labels;
		current = all.current;
	}
	if (chartSpending) chartSpending.destroy();
	chartSpending = new Chart(ctx, {
		type: 'line',
		data: {
			labels,
			datasets: [{
				label: 'Current account',
				data: current,
				borderColor: '#333',
				backgroundColor: 'rgba(51,51,51,0.08)',
				fill: true,
				tension: 0.35,
				pointRadius: 4,
				pointBackgroundColor: '#333',
				borderWidth: 2
			}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					backgroundColor: '#333',
					padding: 10,
					cornerRadius: 0,
					callbacks: {
						label: c => c.dataset.label + ': ' + c.parsed.y.toLocaleString()
					}
				}
			},
			scales: {
				y: {
					beginAtZero: false,
					grid: {
						color: chartGrid()
					},
					ticks: {
						font: {
							size: 10
						},
						color: chartText(),
						callback: v => v >= 1000 ? v / 1000 + 'k' : v
					},
					border: {
						display: false
					}
				},
				x: {
					grid: {
						display: false
					},
					ticks: {
						font: {
							size: 11
						},
						color: chartText()
					},
					border: {
						display: false
					}
				}
			}
		}
	});
}

function initCategoryChart() {
	const ctx = document.getElementById('category-chart');
	if (!ctx || typeof Chart === 'undefined') return;
	const cats = [{
		label: 'Payroll',
		value: 8500,
		color: '#333'
	},
	{
		label: 'Rent',
		value: 2400,
		color: '#767676'
	},
	{
		label: 'Software',
		value: 1050,
		color: '#a3a3a3'
	},
	{
		label: 'Travel',
		value: 890,
		color: '#c4c4c4'
	},
	{
		label: 'Utilities',
		value: 314,
		color: '#db0011'
	},
	{
		label: 'Other',
		value: 580,
		color: '#e5e7eb'
	}
	];
	if (chartCategory) chartCategory.destroy();
	chartCategory = new Chart(ctx, {
		type: 'doughnut',
		data: {
			labels: cats.map(c => c.label),
			datasets: [{
				data: cats.map(c => c.value),
				backgroundColor: cats.map(c => c.color),
				borderWidth: 0,
				spacing: 2
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: true,
			cutout: '65%',
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					backgroundColor: '#333',
					padding: 10,
					cornerRadius: 0
				}
			}
		}
	});
	const leg = document.getElementById('category-legend');
	if (leg) leg.innerHTML = cats.map(c => '<div class="legend-item"><div class="legend-item__left"><span class="legend-dot" style="background:' + c.color + '"></span><span class="text-xs color-secondary">' + c.label + '</span></div><span class="text-xs fw-500">' + c.value.toLocaleString() + '</span></div>').join('');
}

function initAccountValuesChart() {
	const ctx = document.getElementById('account-values-chart');
	if (!ctx || typeof Chart === 'undefined') return;
	const palette = ['#333', '#767676', '#a3a3a3', '#c4c4c4', '#db0011', '#d7d8d6'];
	const accs = accountsData.accounts.filter(a => a.accType !== 'CC').map((a, i) => ({
		label: a.name + ' (' + a.currency + ')',
		short: a.name + ' \u00b7 ' + a.currency,
		value: Math.abs(parseAmount(a.available)),
		color: palette[i % palette.length]
	})).filter(a => a.value > 0);
	if (chartAccValues) chartAccValues.destroy();
	chartAccValues = new Chart(ctx, {
		type: 'doughnut',
		data: {
			labels: accs.map(a => a.label),
			datasets: [{
				data: accs.map(a => a.value),
				backgroundColor: accs.map(a => a.color),
				borderWidth: 0,
				spacing: 2
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: true,
			cutout: '66%',
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					backgroundColor: '#333',
					padding: 10,
					cornerRadius: 0,
					callbacks: {
						label: c => c.label + ': ' + fmt(c.parsed)
					}
				}
			}
		}
	});
	const total = accs.reduce((s, a) => s + a.value, 0);
	const leg = document.getElementById('account-values-legend');
	if (leg) leg.innerHTML = accs.map(a => '<div class="legend-item"><div class="legend-item__left"><span class="legend-dot" style="background:' + a.color + '"></span><span class="text-xs color-secondary">' + a.short + '</span></div><span class="text-xs fw-500">' + fmt(a.value) + '</span></div>').join('') + '<div class="legend-total"><span class="color-secondary">Total</span><span class="fw-600">' + fmt(total) + '</span></div>';
}

function initPaymentVolumeChart() {
	const ctx = document.getElementById('payment-volume-chart');
	if (!ctx || typeof Chart === 'undefined') return;
	const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
	const sent = [8200, 22500, 18340, 14600, 9800, 21000, 17400, 13010];
	const received = [0, 5200, 0, 12400, 8000, 0, 9600, 3000];
	if (chartPaymentVolume) chartPaymentVolume.destroy();
	chartPaymentVolume = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: hours,
			datasets: [
				{
					label: 'Sent',
					data: sent,
					backgroundColor: document.body.classList.contains('theme-dark') ? 'rgba(219,0,17,0.75)' : 'rgba(219,0,17,0.8)',
					borderWidth: 0,
					borderRadius: 3
				},
				{
					label: 'Received',
					data: received,
					backgroundColor: document.body.classList.contains('theme-dark') ? 'rgba(52,211,153,0.75)' : 'rgba(0,108,73,0.7)',
					borderWidth: 0,
					borderRadius: 3
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					backgroundColor: '#333',
					padding: 8,
					cornerRadius: 4,
					callbacks: {
						label: c => c.dataset.label + ': £' + c.parsed.y.toLocaleString()
					}
				}
			},
			scales: {
				x: {
					stacked: false,
					grid: { display: false },
					ticks: { font: { size: 10 }, color: chartText() },
					border: { display: false }
				},
				y: {
					stacked: false,
					grid: { color: chartGrid() },
					ticks: {
						font: { size: 10 },
						color: chartText(),
						callback: v => v >= 1000 ? '£' + v / 1000 + 'k' : '£' + v
					},
					border: { display: false }
				}
			}
		}
	});
}


function waitForChart(cb, max = 5000) {
	const s = Date.now();
	const check = () => {
		if (typeof Chart !== 'undefined') return cb();
		if (Date.now() - s < max) setTimeout(check, 50);
	};
	check();
}

function bindChartToggles() {
	document.querySelectorAll('.tab[data-range]').forEach(btn => btn.addEventListener('click', () => {
		document.querySelectorAll('.tab[data-range]').forEach(b => {
			b.classList.remove('tab--active');
			b.setAttribute('aria-selected', 'false');
		});
		btn.classList.add('tab--active');
		btn.setAttribute('aria-selected', 'true');
		initSpendingChart(btn.dataset.range);
	}));
}

/* ── Payments data ───────────────────────────– */
const paymentsData = {
	'pending-auth': {
		title: 'Pending Authorisation',
		subtitle: '5 payments require your sign-off',
		statusClass: 'urgent',
		statusLabel: 'Needs authorisation',
		payments: [{
			id: 'PAY-00291',
			payee: 'Meridian Supplies Ltd',
			amount: -14200,
			currency: 'GBP',
			ref: 'INV-4421',
			type: 'CHAPS',
			from: 'AU HKBA 253-070767-439',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00289',
			payee: 'Global Tech Partners',
			amount: -8750,
			currency: 'GBP',
			ref: 'PO-8812',
			type: 'BACS',
			from: 'PRICE K Q',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00285',
			payee: 'Apex Logistics',
			amount: -3300,
			currency: 'USD',
			ref: 'REF-0091',
			type: 'SWIFT',
			from: '530-3946',
			date: '08 Mar 2026'
		},
		{
			id: 'PAY-00280',
			payee: 'Office Maintco',
			amount: -980.50,
			currency: 'GBP',
			ref: 'INV-0023',
			type: 'Faster Payments',
			from: 'PRICE K Q',
			date: '07 Mar 2026'
		},
		{
			id: 'PAY-00278',
			payee: 'CloudSoft Ltd',
			amount: -499,
			currency: 'GBP',
			ref: 'SUB-2024',
			type: 'BACS',
			from: 'AU HKBA 253-070767-439',
			date: '06 Mar 2026'
		}
		],
		actions: ['approve', 'reject']
	},
	'pending-approval': {
		title: 'Pending Secondary Approval',
		subtitle: '2 payments awaiting secondary approver',
		statusClass: 'warning',
		statusLabel: 'Awaiting approver',
		payments: [{
			id: 'PAY-00290',
			payee: 'Streamline Corp',
			amount: -22000,
			currency: 'GBP',
			ref: 'INV-5502',
			type: 'CHAPS',
			from: 'PRICE K Q',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00284',
			payee: 'DeltaFab Industries',
			amount: -6100,
			currency: 'USD',
			ref: 'PO-7701',
			type: 'SWIFT',
			from: '530-3946',
			date: '08 Mar 2026'
		}
		],
		actions: ['nudge', 'view']
	},
	'processing': {
		title: 'Processing',
		subtitle: '8 payments in progress',
		statusClass: 'neutral',
		statusLabel: 'Processing',
		payments: [{
			id: 'PAY-00288',
			payee: 'Urban Supplies Co',
			amount: -5600,
			currency: 'GBP',
			ref: 'INV-3312',
			type: 'CHAPS',
			from: 'PRICE K Q',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00287',
			payee: 'TechVent Solutions',
			amount: -2100,
			currency: 'GBP',
			ref: 'PO-4491',
			type: 'BACS',
			from: 'AU HKBA 253-070767-439',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00286',
			payee: 'FastShip Int.',
			amount: -1800,
			currency: 'USD',
			ref: 'REF-9921',
			type: 'SWIFT',
			from: '530-3946',
			date: '08 Mar 2026'
		},
		{
			id: 'PAY-00283',
			payee: 'Printex Media',
			amount: -340,
			currency: 'GBP',
			ref: 'INV-0901',
			type: 'Faster Payments',
			from: 'PRICE K Q',
			date: '08 Mar 2026'
		}
		],
		actions: ['view']
	},
	'scheduled': {
		title: 'Scheduled',
		subtitle: '12 future-dated payments queued',
		statusClass: 'neutral',
		statusLabel: 'Scheduled',
		payments: [{
			id: 'PAY-SCH-01',
			payee: 'Office Rent',
			amount: -2400,
			currency: 'GBP',
			ref: 'RENT-MAR',
			type: 'Standing Order',
			from: 'PRICE K Q',
			date: '15 Mar 2026'
		},
		{
			id: 'PAY-SCH-02',
			payee: 'Internet Bill',
			amount: -89.99,
			currency: 'GBP',
			ref: 'ISP-MAR',
			type: 'Direct Debit',
			from: 'PRICE K Q',
			date: '18 Mar 2026'
		},
		{
			id: 'PAY-SCH-03',
			payee: 'Electricity',
			amount: -156.40,
			currency: 'GBP',
			ref: 'ELEC-MAR',
			type: 'Direct Debit',
			from: 'AU HKBA 253-070767-439',
			date: '20 Mar 2026'
		},
		{
			id: 'PAY-SCH-04',
			payee: 'Business Insurance',
			amount: -685,
			currency: 'GBP',
			ref: 'INS-Q1',
			type: 'BACS',
			from: 'PRICE K Q',
			date: '25 Mar 2026'
		}
		],
		actions: ['cancel']
	},
	'rejected': {
		title: 'Rejected',
		subtitle: '1 payment declined',
		statusClass: 'urgent',
		statusLabel: 'Rejected',
		payments: [{
			id: 'PAY-00276',
			payee: 'Offshore Holdings LLC',
			amount: -45000,
			currency: 'USD',
			ref: 'WIRE-002',
			type: 'SWIFT',
			from: '530-3946',
			date: '05 Mar 2026',
			reason: 'Failed compliance screening \u2014 please contact your relationship manager.'
		}],
		actions: ['retry', 'view']
	},
	'completed': {
		title: 'Completed Today',
		subtitle: '24 payments settled today',
		statusClass: 'green',
		statusLabel: 'Completed',
		payments: [{
			id: 'PAY-00275',
			payee: 'ABC Corp',
			amount: -5200,
			currency: 'GBP',
			ref: 'INV-3901',
			type: 'Faster Payments',
			from: 'AU HKBA 253-070767-439',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00274',
			payee: 'HR Payroll Run',
			amount: -18400,
			currency: 'GBP',
			ref: 'PAY-FEB',
			type: 'BACS',
			from: 'PRICE K Q',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00273',
			payee: 'Delta Freight',
			amount: -2100,
			currency: 'USD',
			ref: 'SHIP-009',
			type: 'SWIFT',
			from: '530-3946',
			date: '09 Mar 2026'
		},
		{
			id: 'PAY-00272',
			payee: 'StationaryPlus Ltd',
			amount: -148.75,
			currency: 'GBP',
			ref: 'ORD-0042',
			type: 'Faster Payments',
			from: 'AU HKBA 253-070767-439',
			date: '09 Mar 2026'
		}
		],
		actions: ['view']
	},
	'documentary-credits': {
		title: 'Documentary Credits',
		subtitle: '3 credits pending issuance or amendment',
		statusClass: 'warning',
		statusLabel: 'Pending',
		payments: [{
			id: 'DC-00412',
			payee: 'Guangzhou Textiles Co.',
			amount: -85000,
			currency: 'USD',
			ref: 'LC-2026-0087',
			type: 'Irrevocable LC',
			from: 'PRICE K Q',
			date: '15 Mar 2026'
		},
		{
			id: 'DC-00409',
			payee: 'Shenzhen Electronics Ltd',
			amount: -42500,
			currency: 'USD',
			ref: 'LC-2026-0084',
			type: 'Irrevocable LC',
			from: '530-3946',
			date: '12 Mar 2026'
		},
		{
			id: 'DC-00401',
			payee: 'Mumbai Spice Traders',
			amount: -18200,
			currency: 'GBP',
			ref: 'LC-2026-0079',
			type: 'Amendment',
			from: 'AU HKBA 253-070767-439',
			date: '10 Mar 2026'
		}
		],
		actions: ['view']
	},
	'trade-loans': {
		title: 'Trade Loans',
		subtitle: '5 active drawdowns and renewals',
		statusClass: 'neutral',
		statusLabel: 'Active',
		payments: [{
			id: 'TL-00156',
			payee: 'Drawdown — Raw materials import',
			amount: -120000,
			currency: 'USD',
			ref: 'TL-2026-0031',
			type: '90-day facility',
			from: 'PRICE K Q',
			date: '18 Mar 2026'
		},
		{
			id: 'TL-00149',
			payee: 'Renewal — Seasonal inventory',
			amount: -75000,
			currency: 'GBP',
			ref: 'TL-2026-0028',
			type: '60-day facility',
			from: 'AU HKBA 253-070767-439',
			date: '14 Mar 2026'
		},
		{
			id: 'TL-00143',
			payee: 'Drawdown — Component sourcing',
			amount: -58000,
			currency: 'USD',
			ref: 'TL-2026-0025',
			type: '90-day facility',
			from: '530-3946',
			date: '11 Mar 2026'
		}
		],
		actions: ['view']
	},
	'import-presentations': {
		title: 'Import Presentations',
		subtitle: '2 documents awaiting acceptance',
		statusClass: 'urgent',
		statusLabel: 'Awaiting acceptance',
		payments: [{
			id: 'IP-00078',
			payee: 'Guangzhou Textiles Co.',
			amount: -85000,
			currency: 'USD',
			ref: 'PRES-2026-0041',
			type: 'Documents against acceptance',
			from: 'PRICE K Q',
			date: '17 Mar 2026'
		},
		{
			id: 'IP-00075',
			payee: 'Jakarta Industrial Supply',
			amount: -31400,
			currency: 'USD',
			ref: 'PRES-2026-0039',
			type: 'Documents against payment',
			from: '530-3946',
			date: '13 Mar 2026'
		}
		],
		actions: ['approve', 'reject']
	}
};

function init() {
	updateCombinedAmount();
	const savedTheme = localStorage.getItem(THEME_KEY);
	applyTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light');
	renderAccounts();
	bindFiltersAndSorting();
	bindPanelControls();
	bindNotifications();
	bindChartToggles();
	bindRemoveButtons();
	bindGlobalSearch();
	bindNavigation();
	initFXCards();
	bindMapToggle();
	bindResetButtons();
	initPaymentFlow();

	customizeToggle?.addEventListener('click', toggleEditMode);

	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') {
			closePanel();
			notifDropdown?.classList.remove('active');
			notifToggle?.setAttribute('aria-expanded', 'false');
		}
	});
	showView('account');
	waitForChart(() => {
		initSpendingChart();
		initCategoryChart();
		initAccountValuesChart();
		initPaymentVolumeChart();
	});
	waitForLucide(() => {
		lucide.createIcons();
		initDragAndDrop();
		restoreLayout();
		applyRemovedSections();
		bindRemoveButtons();
		distributeCards();
		waitForChart(() => {
			initSpendingChart();
			initCategoryChart();
			initAccountValuesChart();
			initPaymentVolumeChart();
		});

		setTimeout(() => {
			lucide.createIcons();
			initFlatMap();
		}, 200);
	});
}

function initDragAndDrop() {
	const cols = document.querySelectorAll('.dash-col');
	let dragEl = null,
		placeholder = null,
		offsetX = 0,
		offsetY = 0,
		startX = 0,
		startY = 0,
		dragging = false;
	cols.forEach(col => Array.from(col.children).forEach(sec => {
		if (sec.querySelector('.drag-handle')) return;
		sec.classList.add('draggable-section');
		const h = document.createElement('div');
		h.className = 'drag-handle';
		h.innerHTML = '<i data-lucide="grip-horizontal"></i>';
		sec.prepend(h);
		h.addEventListener('pointerdown', e => {
			if (!document.body.classList.contains('edit-mode')) return;
			e.preventDefault();
			startX = e.clientX;
			startY = e.clientY;
			const r = sec.getBoundingClientRect();
			offsetY = e.clientY - r.top;
			offsetX = e.clientX - r.left;
			dragEl = sec;
			dragging = false;
			const move = ev => {
				if (!dragging && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
					dragging = true;
					startDrag(sec, r);
				}
				if (dragging) {
					ev.preventDefault();
					dragEl.style.top = (ev.clientY - offsetY + scrollY) + 'px';
					dragEl.style.left = (ev.clientX - offsetX + scrollX) + 'px';
					updateDrop(ev.clientX, ev.clientY);
				}
			};
			const up = () => {
				document.removeEventListener('pointermove', move);
				document.removeEventListener('pointerup', up);
				if (dragging) finishDrag();
				dragEl = null;
				dragging = false;
			};
			document.addEventListener('pointermove', move, {
				passive: false
			});
			document.addEventListener('pointerup', up);
		});
	}));

	function startDrag(el, r) {
		placeholder = document.createElement('div');
		placeholder.className = 'drag-placeholder';
		placeholder.style.height = r.height + 'px';
		el.parentNode.insertBefore(placeholder, el);
		el.classList.add('dragging-active');
		el.style.cssText = 'position:absolute;width:' + r.width + 'px;top:' + (r.top + scrollY) + 'px;left:' + (r.left + scrollX) + 'px;z-index:9999;pointer-events:none;';
		document.body.appendChild(el);
	}

	function updateDrop(cx, cy) {
		if (!placeholder) return;
		let tc = null;
		cols.forEach(col => {
			const r = col.getBoundingClientRect();
			if (cx >= r.left && cx <= r.right) tc = col;
		});
		if (!tc) {
			let md = Infinity;
			cols.forEach(col => {
				const r = col.getBoundingClientRect(),
					d = Math.abs(cx - (r.left + r.width / 2));
				if (d < md) {
					md = d;
					tc = col;
				}
			});
		}
		if (tc && placeholder.parentNode !== tc) tc.appendChild(placeholder);
		const col = placeholder.parentNode;
		const sibs = [...col.querySelectorAll('.draggable-section:not(.dragging-active):not(.is-removed),.drag-placeholder')];
		let ce = null,
			cd = Infinity,
			before = true;
		sibs.forEach(s => {
			const r = s.getBoundingClientRect(),
				mid = r.top + r.height / 2,
				d = Math.abs(cy - mid);
			if (d < cd) {
				cd = d;
				ce = s;
				before = cy < mid;
			}
		});
		if (ce && ce !== placeholder) col.insertBefore(placeholder, before ? ce : ce.nextSibling);
	}

	function finishDrag() {
		if (!dragEl || !placeholder) return;
		dragEl.classList.remove('dragging-active');
		dragEl.style.cssText = '';
		placeholder.parentNode.insertBefore(dragEl, placeholder);
		placeholder.remove();
		placeholder = null;
		saveLayout();
	}
}

function waitForLucide(cb, max = 5000) {
	const s = Date.now();
	const check = () => {
		if (typeof lucide !== 'undefined') return cb();
		if (Date.now() - s < max) setTimeout(check, 50);
	};
	check();
}
function bindResetButtons() {
	document.querySelectorAll('#reset-layout,#reset-layout-mobile').forEach(btn => btn.addEventListener('click', () => {
		[REMOVED_KEY, LAYOUT_KEY].forEach(k => localStorage.removeItem(k));
		location.reload();
	}));
}

/* ── Payment Flow ────────────────────────────── */
function initPaymentFlow() {
	const panel = document.getElementById('payment-panel');
	if (!panel) return;

	// Elements
	const caption = document.getElementById('pf-step-caption');
	const restartBtn = document.getElementById('pf-restart');
	const steps = [1, 2, 3, 4].map(n => document.getElementById(`pf-step-${n}`));
	const stepItems = panel.querySelectorAll('.pf-stepper__step');

	// Step 1
	const payeeInput = document.getElementById('pf-payee-input');
	const payeeList = document.getElementById('pf-payee-list');

	// Step 2
	const selAvatar = document.getElementById('pf-sel-avatar');
	const selName = document.getElementById('pf-sel-name');
	const selMeta = document.getElementById('pf-sel-meta');
	const changePayee = document.getElementById('pf-change-payee');
	const amountInput = document.getElementById('pf-amount');
	const refInput = document.getElementById('pf-ref');
	const dateInput = document.getElementById('pf-date');
	const typeSelect = document.getElementById('pf-type');
	const back1Btn = document.getElementById('pf-back-1');
	const toReviewBtn = document.getElementById('pf-to-review');

	// Step 3
	const back2Btn = document.getElementById('pf-back-2');
	const confirmBtn = document.getElementById('pf-confirm');

	// Step 4
	const makeAnotherBtn = document.getElementById('pf-make-another');

	const captions = [
		'Step 1 of 4 — Choose payee',
		'Step 2 of 4 — Payment details',
		'Step 3 of 4 — Review',
		'Payment complete'
	];

	const typeLabels = { faster: 'Faster Payments', chaps: 'CHAPS', bacs: 'BACS', swift: 'SWIFT' };

	// State
	let state = { payee: '', account: '', sort: '', amount: '', currency: 'GBP', ref: '', date: '', type: 'faster', fromAccount: '' };

	// Populate "Pay from" select from accountsData
	const fromSelect = document.getElementById('pf-from');
	accountsData.accounts.forEach(acc => {
		const opt = document.createElement('option');
		const bal = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseAmount(acc.available));
		const sym = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CNY: '¥' }[acc.currency] || '';
		opt.value = acc.fmtdAccNo || acc.name;
		opt.textContent = `${acc.name}  ·  ${sym}${bal} ${acc.currency}`;
		fromSelect.appendChild(opt);
	});

	function initials(name) {
		return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
	}

	function goTo(n) {
		steps.forEach((s, i) => { s.hidden = i !== n - 1; });
		stepItems.forEach((el, i) => {
			el.classList.remove('pf-stepper__step--active', 'pf-stepper__step--done');
			el.removeAttribute('aria-current');
			if (i < n - 1) el.classList.add('pf-stepper__step--done');
			if (i === n - 1) { el.classList.add('pf-stepper__step--active'); el.setAttribute('aria-current', 'step'); }
		});
		caption.textContent = captions[n - 1];
		restartBtn.style.display = n > 1 ? '' : 'none';
		lucide.createIcons();
	}

	// ── Payee search — filter list ──
	const existingItems = Array.from(payeeList.querySelectorAll('.pf-payee-item[data-payee]'));

	function updatePayeeList() {
		const q = payeeInput.value.trim().toLowerCase();
		existingItems.forEach(item => {
			item.style.display = item.dataset.payee.toLowerCase().includes(q) ? '' : 'none';
		});
	}

	payeeInput.addEventListener('input', updatePayeeList);

	// ── Select existing payee ──
	existingItems.forEach(item => {
		function selectPayee() {
			state.payee = item.dataset.payee;
			state.account = item.dataset.account;
			state.sort = item.dataset.sort;
			loadStep2();
		}
		item.addEventListener('click', selectPayee);
		item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPayee(); } });
	});

	// ── New payee via inline form ──
	const addNewPayeeBtn = document.getElementById('pf-add-new-payee');
	const newNameInput = document.getElementById('pf-new-name');
	const newSortInput = document.getElementById('pf-new-sort');
	const newAccInput = document.getElementById('pf-new-account');

	addNewPayeeBtn.addEventListener('click', () => {
		const name = newNameInput.value.trim();
		const sort = newSortInput.value.trim();
		const acc = newAccInput.value.trim();
		if (!name) { newNameInput.focus(); newNameInput.classList.add('input--error'); return; }
		newNameInput.classList.remove('input--error');
		state.payee = name;
		state.account = acc;
		state.sort = sort;
		loadStep2();
	});
	newNameInput.addEventListener('input', () => newNameInput.classList.remove('input--error'));

	function loadStep2() {
		selAvatar.textContent = initials(state.payee);
		selName.textContent = state.payee;
		selMeta.textContent = state.account
			? state.account + (state.sort ? ' · ' + state.sort : '')
			: 'New payee';
		goTo(2);
		fromSelect.focus();
	}

	// ── Step 2 back ──
	changePayee.addEventListener('click', () => goTo(1));
	back1Btn.addEventListener('click', () => goTo(1));

	toReviewBtn.addEventListener('click', () => {
		if (!fromSelect.value) {
			fromSelect.focus();
			fromSelect.classList.add('input--error');
			return;
		}
		fromSelect.classList.remove('input--error');
		if (!amountInput.value || parseFloat(amountInput.value) <= 0) {
			amountInput.focus();
			amountInput.classList.add('input--error');
			return;
		}
		amountInput.classList.remove('input--error');
		state.fromAccount = fromSelect.options[fromSelect.selectedIndex].textContent;
		state.amount = amountInput.value;
		state.currency = document.getElementById('pf-currency').value;
		state.ref = refInput.value.trim() || 'None';
		state.date = dateInput.value;
		state.type = typeSelect.value;
		loadReview();
	});


	fromSelect.addEventListener('change', () => fromSelect.classList.remove('input--error'));
	amountInput.addEventListener('input', () => amountInput.classList.remove('input--error'));

	function loadReview() {
		const symbols = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CNY: '¥' };
		const sym = symbols[state.currency] || '';
		document.getElementById('rv-payee').textContent = state.payee;
		document.getElementById('rv-from').textContent = state.fromAccount;
		document.getElementById('rv-account').textContent = state.account || 'N/A';
		document.getElementById('rv-sort').textContent = state.sort || 'N/A';
		document.getElementById('rv-amount').textContent = `${sym}${parseFloat(state.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${state.currency}`;
		document.getElementById('rv-ref').textContent = state.ref;
		document.getElementById('rv-date').textContent = new Date(state.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
		document.getElementById('rv-type').textContent = typeLabels[state.type] || state.type;
		goTo(3);
	}

	// ── Step 3 back ──
	back2Btn.addEventListener('click', () => goTo(2));

	// ── Step 3 confirm ──
	confirmBtn.addEventListener('click', () => {
		const ref = 'NEO-' + Date.now().toString(36).toUpperCase().slice(-8);
		const symbols = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CNY: '¥' };
		const sym = symbols[state.currency] || '';
		document.getElementById('pf-complete-sub').textContent =
			`${sym}${parseFloat(state.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${state.currency} sent to ${state.payee}`;
		document.getElementById('pf-complete-ref').textContent = ref;
		goTo(4);
	});

	// ── Step 4 restart ──
	function restart() {
		state = { payee: '', account: '', sort: '', amount: '', currency: 'GBP', ref: '', date: new Date().toISOString().slice(0, 10), type: 'faster', fromAccount: '' };
		payeeInput.value = '';
		newNameInput.value = '';
		newSortInput.value = '';
		newAccInput.value = '';
		fromSelect.selectedIndex = 0;
		amountInput.value = '';
		refInput.value = '';
		dateInput.value = state.date;
		typeSelect.value = 'faster';
		updatePayeeList();
		goTo(1);
	}


	makeAnotherBtn.addEventListener('click', restart);
	restartBtn.addEventListener('click', restart);

	// Init
	goTo(1);
}

init();
