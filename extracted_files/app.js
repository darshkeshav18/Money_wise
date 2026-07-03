// MoneyWise Personal Finance & Investment Engine - Core Logic

// CATEGORIES CONFIGURATION
const CATEGORIES_MAPPING = {
  Needs: ['Rent', 'Groceries', 'EMI', 'Utilities', 'Transport', 'Medical', 'Other Needs'],
  Wants: ['Food Delivery', 'OTT Subscriptions', 'Shopping', 'Dining Out', 'Entertainment', 'Other Wants'],
  Savings: ['Emergency Fund', 'Mutual Funds', 'Stocks', 'Gold', 'PPF', 'Other Savings']
};

// STATE MANAGEMENT
let state = {
  user: {
    loggedIn: false,
    username: '',
    isGuest: false
  },
  profile: null, 
  /* 
     profile: { 
       profession: 'Salaried',
       income: 75000,
       budgetSplits: { needs: 50, wants: 30, savings: 20 },
       bankingConnected: false,
       smsConsent: true
     }
  */
  expenses: [],
  subscriptions: [],
  goals: [],
  preferences: {
    notifications: { overspend: true, renewal: true, goals: true },
    darkMode: true
  }
};

// CHART HANDLERS
let personalCharts = { allocation: null, subcat: null, mom: null, investment: null };

// ACTIVE EDIT / MODAL STATES
let editExpenseId = null;
let activeQuickSMS = null;
let quickCatBucket = 'Wants';
let currentOnboardStep = 1;
let selectedProfession = 'Salaried';

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  // loadSessionState is handled by firebase.js onAuthStateChanged
  initTheme();
  setupEventListeners();
  startSMSTimer();
  lucide.createIcons();
});

// LOAD STATE
// Firebase's onAuthStateChanged in firebase.js handles initial load.
// This function is kept as a no-op to avoid breaking any call references.
function loadSessionState() {
  // Handled by firebase.js onAuthStateChanged
}

// SAVE STATE
function saveStateToStorage() {
  if (state.user.isGuest) {
    // Guest: save to localStorage
    localStorage.setItem('mw_guest_session', JSON.stringify({
      profile: state.profile,
      expenses: state.expenses,
      subscriptions: state.subscriptions,
      goals: state.goals,
      preferences: state.preferences
    }));
  } else {
    // Registered user: save to Firestore
    if (typeof saveStateToCloud === 'function') {
      saveStateToCloud();
    }
  }
}

// AUTH TAB TOGGLE
function toggleAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-btn-${tab}`).classList.add('active');
  
  if (tab === 'login') {
    document.getElementById('login-form').style.display = 'flex';
    document.getElementById('signup-form').style.display = 'none';
  } else {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'flex';
  }
}

// FIREBASE AUTH HANDLERS
async function handleAuthSubmit(e, action) {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = action === 'login' ? 'Signing in...' : 'Creating account...';

  try {
    if (action === 'signup') {
      const username = document.getElementById('signup-username').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const pwd = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-confirm').value;

      if (pwd !== confirm) {
        showToast('Passwords do not match!', 'danger');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create My Account';
        return;
      }

      const cred = await _fb.createUserWithEmailAndPassword(_fb.auth, email, pwd);
      // Store username in Firestore
      await _fb.setDoc(_fb.doc(_fb.db, "users", cred.user.uid), {
        username: username,
        email: email,
        profile: null,
        expenses: [],
        subscriptions: [],
        goals: [],
        preferences: state.preferences,
        createdAt: new Date().toISOString()
      });
      // onAuthStateChanged will handle the rest

    } else {
      const emailOrUser = document.getElementById('login-username').value.trim();
      const pwd = document.getElementById('login-password').value;

      // Firebase requires email; if they typed a username we still try as email
      await _fb.signInWithEmailAndPassword(_fb.auth, emailOrUser, pwd);
      // onAuthStateChanged will handle the rest
    }
  } catch (err) {
    let msg = 'Authentication failed. Please try again.';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      msg = 'Incorrect email or password.';
    } else if (err.code === 'auth/email-already-in-use') {
      msg = 'This email is already registered. Please sign in.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password must be at least 6 characters.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Please enter a valid email address.';
    }
    showToast(msg, 'danger');
    submitBtn.disabled = false;
    submitBtn.textContent = action === 'login' ? 'Access Dashboard' : 'Create My Account';
  }
}

function continueAsGuest() {
  state.user = {
    loggedIn: true,
    username: 'Guest User',
    isGuest: true
  };

  // Save minimal guest marker
  localStorage.setItem('mw_guest_session', JSON.stringify({ profile: null, expenses: [], subscriptions: [], goals: [] }));

  document.getElementById('auth-overlay').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('onboarding-overlay').style.display = 'flex';
    goToOnboardStep(1);
  }, 300);

  showToast('Guest mode — data saves locally only', 'info');
}

function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    if (state.user.isGuest) {
      localStorage.removeItem('mw_guest_session');
      window.location.reload();
    } else {
      _fb.signOut(_fb.auth).then(() => {
        window.location.reload();
      }).catch(() => {
        window.location.reload();
      });
    }
  }
}

// MULTI-STEP ONBOARDING
function selectOnboardProfession(type) {
  selectedProfession = type;
  
  // Highlight UI button
  document.querySelectorAll('.user-type-btn').forEach(btn => {
    btn.classList.remove('selected');
    if (btn.getAttribute('data-type') === type) {
      btn.classList.add('selected');
    }
  });

  // Toggle custom profession input if Others is picked
  const customContainer = document.getElementById('onboard-custom-prof-container');
  if (type === 'Others') {
    customContainer.style.display = 'block';
    document.getElementById('onboard-custom-profession').required = true;
    document.getElementById('onboard-custom-profession').focus();
  } else {
    customContainer.style.display = 'none';
    document.getElementById('onboard-custom-profession').required = false;
    document.getElementById('onboard-custom-profession').value = '';
  }
}

function goToOnboardStep(step) {
  currentOnboardStep = step;
  
  // Update indicator dots
  document.querySelectorAll('.step-dot').forEach((dot, idx) => {
    dot.classList.remove('active');
    if (idx + 1 <= step) dot.classList.add('active');
  });

  // Toggle panes
  document.querySelectorAll('.onboard-step-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`onboard-step-${step}`).classList.add('active');

  // Titles
  if (step === 2) {
    document.getElementById('onboard-title').textContent = 'Link Bank Statement';
    document.getElementById('onboard-desc').textContent = 'Connect transaction data automatically or continue manually';
  } else {
    document.getElementById('onboard-title').textContent = 'Configure Profile';
    document.getElementById('onboard-desc').textContent = 'Customize your profession and budget splits';
  }
}

// 50/30/20 Sliders Onboarding
function resetToDefaultSplits() {
  document.getElementById('slider-needs').value = 50;
  document.getElementById('slider-wants').value = 30;
  document.getElementById('slider-savings').value = 20;
  updateSplitSliders();
}

function updateSplitSliders(changed) {
  let needs = parseInt(document.getElementById('slider-needs').value);
  let wants = parseInt(document.getElementById('slider-wants').value);
  let savings = parseInt(document.getElementById('slider-savings').value);

  const total = needs + wants + savings;
  
  document.getElementById('label-needs').textContent = needs + '%';
  document.getElementById('label-wants').textContent = wants + '%';
  document.getElementById('label-savings').textContent = savings + '%';

  const badge = document.getElementById('split-total-badge');
  badge.textContent = `${total}% (${total === 100 ? 'Valid' : 'Invalid'})`;
  
  if (total === 100) {
    badge.className = 'split-total-badge valid';
    document.getElementById('onboard-submit-1').disabled = false;
  } else {
    badge.className = 'split-total-badge invalid';
    document.getElementById('onboard-submit-1').disabled = true;
  }
}

function submitOnboardStep1(e) {
  e.preventDefault();
  const needs = parseInt(document.getElementById('slider-needs').value);
  const wants = parseInt(document.getElementById('slider-wants').value);
  const savings = parseInt(document.getElementById('slider-savings').value);

  if (needs + wants + savings !== 100) {
    showToast('Allocations must total 100%', 'danger');
    return;
  }
  
  goToOnboardStep(2);
}

// BANK LINKING FLOWS
function startAAConsentFlow() {
  document.getElementById('modal-aa-sim').classList.add('active');
  document.getElementById('aa-view-phone').style.display = 'block';
  document.getElementById('aa-view-otp').style.display = 'none';
}

function closeAAModal() {
  document.getElementById('modal-aa-sim').classList.remove('active');
}

function sendAAOtp() {
  const phone = document.getElementById('aa-phone').value;
  if (phone.length < 10) {
    showToast('Please enter a valid 10-digit mobile number', 'warning');
    return;
  }
  
  showToast('Authorization OTP code dispatched to phone', 'info');
  document.getElementById('aa-view-phone').style.display = 'none';
  document.getElementById('aa-view-otp').style.display = 'block';
}

function confirmAAOtp() {
  const otp = document.getElementById('aa-otp').value;
  if (otp.length < 6) {
    showToast('OTP must be 6 digits', 'warning');
    return;
  }
  
  closeAAModal();
  completeOnboardingFlow(true);
  showToast('Consent Verified. Banking records linked successfully!', 'success');
}

function triggerMockStatementUpload() {
  document.getElementById('modal-statement-upload').classList.add('active');
}

function closeStatementModal() {
  document.getElementById('modal-statement-upload').classList.remove('active');
}

function handleStatementFileChosen(e) {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    showToast(`Parsing ${file.name} statement records...`, 'info');
    
    setTimeout(() => {
      closeStatementModal();
      completeOnboardingFlow(true);
      showToast('E-Statement file parsed: 12 entries logged', 'success');
    }, 1200);
  }
}

// COMPLETING ONBOARDING
function completeOnboardingFlow(bankingConnected) {
  const income = parseInt(document.getElementById('onboard-income').value) || 50000;
  const needsSplit = parseInt(document.getElementById('slider-needs').value) || 50;
  const wantsSplit = parseInt(document.getElementById('slider-wants').value) || 30;
  const savingsSplit = parseInt(document.getElementById('slider-savings').value) || 20;

  const smsConsent = document.getElementById('onboard-perm-sms').checked;

  let finalProfession = selectedProfession;
  if (selectedProfession === 'Others') {
    finalProfession = document.getElementById('onboard-custom-profession').value.trim() || 'Custom';
  }

  state.profile = {
    profession: finalProfession,
    income,
    budgetSplits: { needs: needsSplit, wants: wantsSplit, savings: savingsSplit },
    bankingConnected,
    smsConsent
  };

  saveStateToStorage();
  
  // Close onboarding, open app
  document.getElementById('onboarding-overlay').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  
  syncAppProfileUI();
  renderAll();
  
  showToast('MoneyWise Personal Ledger Engine launched!', 'success');
}

// SYNC PROFILE DETAILS TO APP UI
function syncAppProfileUI() {
  if (!state.profile) return;

  const profName = state.profile.profession || 'Salaried';
  const initials = state.user.username ? state.user.username.substring(0, 2).toUpperCase() : 'MW';
  
  // Sidebar info
  const sidebarInitials = document.getElementById('sidebar-avatar-initials');
  if (sidebarInitials) sidebarInitials.textContent = initials;

  const sidebarName = document.getElementById('sidebar-user-name');
  if (sidebarName) sidebarName.textContent = state.user.username || 'Guest User';

  const sidebarProf = document.getElementById('sidebar-user-profession');
  if (sidebarProf) sidebarProf.textContent = profName;

  // Mobile header info
  const mobileInitials = document.getElementById('mobile-avatar-initials');
  if (mobileInitials) mobileInitials.textContent = initials;

  // Populate settings fields
  document.getElementById('settings-income').value = state.profile.income;
  document.getElementById('slider-settings-needs').value = state.profile.budgetSplits.needs;
  document.getElementById('slider-settings-wants').value = state.profile.budgetSplits.wants;
  document.getElementById('slider-settings-savings').value = state.profile.budgetSplits.savings;
  
  document.getElementById('label-settings-needs').textContent = state.profile.budgetSplits.needs + '%';
  document.getElementById('label-settings-wants').textContent = state.profile.budgetSplits.wants + '%';
  document.getElementById('label-settings-savings').textContent = state.profile.budgetSplits.savings + '%';

  document.getElementById('settings-pref-sms').checked = state.profile.smsConsent;
}

// TOGGLE MOBILE SIDEBAR DRAWER
function toggleSidebar(isOpen) {
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) {
    if (isOpen) sidebar.classList.add('active');
    else sidebar.classList.remove('active');
  }
}

// TAB NAVIGATION
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');

  // Update active links on sidebar nav
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active');
    if (link.id === `nav-${tabId}` || (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${tabId}'`))) {
      link.classList.add('active');
    }
  });

  // Update active links on mobile bottom dock
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.id === `mob-nav-${tabId}` || (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${tabId}'`))) {
      item.classList.add('active');
    }
  });

  // Close mobile sidebar drawer
  toggleSidebar(false);

  const headerTexts = {
    dashboard: 'Financial Dashboard',
    expenses: 'Expenses Ledger',
    subscriptions: 'Recurring Subscriptions',
    goals: 'Savings Objectives',
    investments: 'Asset Portfolio',
    insights: 'Spend Analytics',
    report: 'Personal Monthly Audit',
    settings: 'System Settings'
  };
  
  document.getElementById('tab-title-text').textContent = headerTexts[tabId] || 'MoneyWise';

  // Rendering triggers
  if (tabId === 'insights') setTimeout(renderCharts, 50);
  else if (tabId === 'report') renderMonthlyReport();
  else if (tabId === 'dashboard') renderDashboard();
  else if (tabId === 'expenses') renderExpenses();
  else if (tabId === 'subscriptions') renderSubscriptions();
  else if (tabId === 'goals') renderGoals();
  else if (tabId === 'investments') renderInvestments();

  lucide.createIcons();
}

// RENDER ALL DATA
function renderAll() {
  renderDashboard();
  renderExpenses();
  renderSubscriptions();
  renderGoals();
  renderInvestments();
}

// ALERTS & COMPLIANCE EVALUATION
function updateAlertsBanner() {
  const container = document.getElementById('alerts-banner-container');
  container.innerHTML = '';
  
  if (!state.profile) return;

  // 50/30/20 Warning banner calculations
  const income = state.profile.income;
  const splits = state.profile.budgetSplits;
  const spent = computeMonthlySpent();
  const isMidMonth = new Date().getDate() <= 15;

  ['Needs', 'Wants'].forEach(b => {
    const bSpent = spent[b] || 0;
    const bLimit = income * (splits[b.toLowerCase()] / 100);
    
    if (bSpent >= bLimit) {
      const msg = isMidMonth 
        ? `<strong>Critical!</strong> You've spent 100% of your ${b} budget — it's only the ${ordinalSuffixOf(new Date().getDate())}!`
        : `<strong>Depleted:</strong> Your monthly budget for ${b} is fully exhausted.`;
      
      const card = document.createElement('div');
      card.className = 'alert-card alert-card-danger';
      card.innerHTML = `<i data-lucide="alert-octagon"></i> <div class="alert-card-content">${msg}</div>`;
      container.appendChild(card);
    } else if (bSpent >= bLimit * 0.8) {
      const card = document.createElement('div');
      card.className = 'alert-card alert-card-warning';
      card.innerHTML = `<i data-lucide="alert-triangle"></i> <div class="alert-card-content"><strong>Warning:</strong> ${b} budget is at ${Math.round((bSpent/bLimit)*100)}% capacity.</div>`;
      container.appendChild(card);
    }
  });

  // Renewal alerts
  const renewals = getUpcomingSubscriptionRenewals(3);
  renewals.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'alert-card alert-card-info';
    card.innerHTML = `<i data-lucide="bell"></i> <div class="alert-card-content"><strong>Bill Due:</strong> ${sub.name} (₹${formatNumber(sub.cost)}) renews in ${sub.daysLeft} days.</div>`;
    container.appendChild(card);
  });

  lucide.createIcons();
}

// PERSONAL DASHBOARD ENGINE
function renderDashboard() {
  if (!state.profile) return;

  const income = state.profile.income;
  const spent = computeMonthlySpent();
  const totalSpent = (spent.Needs || 0) + (spent.Wants || 0);
  const totalSaved = spent.Savings || 0;
  const remaining = income - (totalSpent + totalSaved);

  document.getElementById('dash-total-saved').textContent = `₹${formatNumber(totalSaved)}`;
  document.getElementById('dash-total-spent').textContent = `₹${formatNumber(totalSpent)}`;
  document.getElementById('dash-remaining-balance').textContent = `₹${formatNumber(remaining)}`;

  const splits = state.profile.budgetSplits;
  document.getElementById('dash-saved-percent').textContent = `${Math.round((totalSaved/income)*100) || 0}% of income saved`;
  document.getElementById('dash-spent-percent').textContent = `${Math.round((totalSpent/income)*100) || 0}% of income spent`;

  const buckets = ['Needs', 'Wants', 'Savings'];
  buckets.forEach(b => {
    const bLimit = income * (splits[b.toLowerCase()] / 100);
    const bSpent = spent[b] || 0;
    const bRemaining = bLimit - bSpent;

    document.getElementById(`badge-${b.toLowerCase()}-pct`).textContent = `${splits[b.toLowerCase()]}% (₹${formatNumber(bLimit)})`;
    document.getElementById(`spent-${b.toLowerCase()}`).textContent = `₹${formatNumber(bSpent)} spent`;

    const remEl = document.getElementById(`remaining-${b.toLowerCase()}`);
    if (bRemaining < 0) {
      remEl.textContent = `₹${formatNumber(Math.abs(bRemaining))} overdrawn`;
      remEl.className = 'bucket-remaining exhausted';
    } else {
      remEl.textContent = `₹${formatNumber(bRemaining)} left`;
      remEl.className = 'bucket-remaining';
    }

    // Progress bar
    const bar = document.getElementById(`progress-bar-${b.toLowerCase()}`);
    let pct = (bSpent / bLimit) * 100;
    if (pct > 100) pct = 100;
    bar.style.width = `${pct}%`;
    bar.className = 'progress-bar';
    if (bSpent >= bLimit) bar.classList.add('danger');
    else if (bSpent >= bLimit * 0.8) bar.classList.add('warning');

    // Recommendation
    const daysInMonth = getDaysInCurrentMonth();
    const remainingDays = daysInMonth - new Date().getDate() + 1;
    const recomm = document.getElementById(`recomm-${b.toLowerCase()}`);
    if (b === 'Savings') {
      recomm.innerHTML = `<i data-lucide="info"></i> <span>Linked targets compound balance.</span>`;
    } else {
      const allow = bRemaining > 0 ? Math.round(bRemaining/remainingDays) : 0;
      recomm.innerHTML = `<i data-lucide="info"></i> <span>Recommended allowance: <strong>₹${formatNumber(allow)}/day</strong> for ${remainingDays} days.</span>`;
    }
  });

  renderDashboardTable();
  updateAlertsBanner();
  
  document.getElementById('dash-active-goals-count').textContent = `${state.goals.length} active target(s)`;
  const subDrain = state.subscriptions.reduce((acc, s) => acc + s.cost, 0);
  document.getElementById('dash-sub-drain-cost').textContent = `₹${formatNumber(subDrain)}/mo`;

  const advisor = document.getElementById('dash-status-paragraph');
  if (spent.Needs > income * (splits.needs / 100)) {
    advisor.innerHTML = `<span style="color:var(--color-danger); font-weight:700;">Needs Overdrawn:</span> High fixed expenditures are cutting into your savings limits. Defer optional lifestyle wants.`;
  } else if (spent.Wants > income * (splits.wants / 100)) {
    advisor.innerHTML = `<span style="color:var(--color-warning); font-weight:700;">Lifestyle Inflated:</span> Discretionary shopping or deliveries crossed target lines. Prune streaming services to recover.`;
  } else {
    advisor.innerHTML = `<span style="color:var(--color-success); font-weight:700;">Wealth Advancing:</span> Your cash distribution complies fully with the 50/30/20 guidelines. Savings are multiplying.`;
  }
}

function renderDashboardTable() {
  const listContainer = document.getElementById('dash-recent-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  const current = getCurrentMonthExpenses().sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  if (current.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color:var(--text-secondary); font-size:0.875rem;">No recent transactions logged</div>`;
    return;
  }

  current.forEach(exp => {
    const isCredit = exp.bucket === 'Savings';
    const amountSign = isCredit ? '+' : '-';
    const amountClass = isCredit ? 'txn-amount-credit' : 'txn-amount-debit';
    const iconClass = isCredit ? 'txn-icon-credit' : 'txn-icon-debit';
    const iconName = isCredit ? 'arrow-down-left' : 'arrow-up-right';
    const dateFormatted = formatDate(exp.date);
    
    const item = document.createElement('div');
    item.className = 'txn-list-item';
    item.innerHTML = `
      <div class="txn-left">
        <div class="txn-icon-badge ${iconClass}">
          <i data-lucide="${iconName}" style="width:16px; height:16px;"></i>
        </div>
        <div class="txn-details">
          <h4>${exp.note || exp.category}</h4>
          <span>${dateFormatted} • ${exp.category}</span>
        </div>
      </div>
      <div class="txn-right">
        <span class="txn-amount ${amountClass}">${amountSign}₹${formatNumber(exp.amount)}</span>
        <span class="txn-bucket-label">${exp.bucket}</span>
      </div>
    `;
    listContainer.appendChild(item);
  });
  lucide.createIcons();
}

// EXPENSES MODALS & CRUD
function openExpenseModal(id = null) {
  editExpenseId = id;
  const form = document.getElementById('expense-form');
  form.reset();

  if (id) {
    const exp = state.expenses.find(x => x.id === id);
    if (!exp) return;
    
    document.getElementById('expense-id-field').value = id;
    document.getElementById('expense-amount').value = exp.amount;
    document.getElementById('expense-bucket').value = exp.bucket;
    
    updateSubcategoriesSelect();
    
    // Check if category is standard or custom
    const defaults = CATEGORIES_MAPPING[exp.bucket];
    const isDefault = defaults.includes(exp.category);
    if (isDefault) {
      document.getElementById('expense-category').value = exp.category;
      document.getElementById('expense-custom-category').value = '';
    } else {
      // Find the 'Other' category option
      const otherOpt = defaults.find(o => o.startsWith('Other'));
      document.getElementById('expense-category').value = otherOpt;
      document.getElementById('expense-custom-category').value = exp.category;
    }
    
    toggleCustomCategoryInput();

    if (exp.bucket === 'Savings') {
      document.getElementById('expense-is-investment').checked = !!exp.isInvestment;
      document.getElementById('expense-asset-type').value = exp.assetType || 'Mutual Funds';
      toggleAssetTypeSelect();
    }

    document.getElementById('expense-date').value = exp.date;
    document.getElementById('expense-note').value = exp.note || '';
    document.getElementById('expense-recurring').checked = !!exp.isRecurring;
    
    document.getElementById('expense-modal-title').textContent = 'Edit Transaction Details';
    document.getElementById('expense-submit-btn').textContent = 'Save Changes';
  } else {
    document.getElementById('expense-id-field').value = '';
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('expense-bucket').value = 'Wants';
    updateSubcategoriesSelect();
    
    document.getElementById('expense-modal-title').textContent = 'Log Transaction';
    document.getElementById('expense-submit-btn').textContent = 'Save Entry';
  }

  document.getElementById('modal-expense').classList.add('active');
}

function closeExpenseModal() {
  document.getElementById('modal-expense').classList.remove('active');
  editExpenseId = null;
}

function updateSubcategoriesSelect() {
  const b = document.getElementById('expense-bucket').value;
  const select = document.getElementById('expense-category');
  select.innerHTML = '';
  CATEGORIES_MAPPING[b].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });

  const invContainer = document.getElementById('investment-fields-container');
  if (b === 'Savings') {
    invContainer.style.display = 'flex';
    toggleAssetTypeSelect();
  } else {
    invContainer.style.display = 'none';
  }

  toggleCustomCategoryInput();
}

function toggleCustomCategoryInput() {
  const cat = document.getElementById('expense-category').value;
  const isOther = cat === 'Other Needs' || cat === 'Other Wants' || cat === 'Other Savings';
  const group = document.getElementById('custom-category-group');
  const input = document.getElementById('expense-custom-category');
  
  if (isOther) {
    group.style.display = 'block';
    input.required = true;
  } else {
    group.style.display = 'none';
    input.required = false;
    input.value = '';
  }
}

function toggleAssetTypeSelect() {
  const isChecked = document.getElementById('expense-is-investment').checked;
  document.getElementById('asset-type-group').style.display = isChecked ? 'block' : 'none';
}

function populateFilterCategoriesSelect() {
  const b = document.getElementById('filter-bucket').value;
  const select = document.getElementById('filter-subcategory');
  select.innerHTML = '<option value="all">All Categories</option>';
  let cats = b === 'all' 
    ? [...CATEGORIES_MAPPING.Needs, ...CATEGORIES_MAPPING.Wants, ...CATEGORIES_MAPPING.Savings]
    : CATEGORIES_MAPPING[b];
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const amt = parseInt(document.getElementById('expense-amount').value);
  const b = document.getElementById('expense-bucket').value;
  const date = document.getElementById('expense-date').value;
  const note = document.getElementById('expense-note').value;
  const isRec = document.getElementById('expense-recurring').checked;

  let cat = document.getElementById('expense-category').value;
  const isOther = cat === 'Other Needs' || cat === 'Other Wants' || cat === 'Other Savings';
  if (isOther) {
    const customVal = document.getElementById('expense-custom-category').value.trim();
    if (customVal) {
      cat = customVal;
    }
  }

  let isInv = false;
  let assetType = '';
  if (b === 'Savings') {
    isInv = document.getElementById('expense-is-investment').checked;
    assetType = isInv ? document.getElementById('expense-asset-type').value : '';
  }

  const id = editExpenseId || generateId();
  const txnObj = { 
    id, 
    amount: amt, 
    bucket: b, 
    category: cat, 
    date, 
    note, 
    isRecurring: isRec,
    isInvestment: isInv,
    assetType
  };

  if (editExpenseId) {
    const idx = state.expenses.findIndex(x => x.id === editExpenseId);
    if (idx !== -1) {
      state.expenses[idx] = txnObj;
      showToast('Transaction updated successfully', 'success');
    }
  } else {
    state.expenses.push(txnObj);
    showToast('Transaction logged successfully', 'success');
  }

  saveStateToStorage();
  closeExpenseModal();
  
  renderExpenses();
  renderDashboard();
}

function renderExpenses() {
  const tbody = document.getElementById('expenses-table-body');
  const empty = document.getElementById('expenses-empty-state');
  const table = document.getElementById('expenses-table');
  tbody.innerHTML = '';

  const filterB = document.getElementById('filter-bucket').value;
  const filterC = document.getElementById('filter-subcategory').value;

  let list = getCurrentMonthExpenses();
  if (filterB !== 'all') list = list.filter(x => x.bucket === filterB);
  
  if (filterC !== 'all') {
    list = list.filter(x => {
      // Direct match or if filterC is 'Other Needs/Wants/Savings', match any custom category not in default configuration
      const defaults = CATEGORIES_MAPPING[x.bucket] || [];
      if (filterC === 'Other Needs' || filterC === 'Other Wants' || filterC === 'Other Savings') {
        return !defaults.includes(x.category) || x.category === filterC;
      }
      return x.category === filterC;
    });
  }
  list.sort((a,b) => new Date(b.date) - new Date(a.date));

  if (list.length === 0) {
    table.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';

  list.forEach(exp => {
    const tr = document.createElement('tr');
    const bClass = `category-${exp.bucket.toLowerCase()}-badge`;
    const rec = exp.isRecurring ? '<span class="recurring-indicator" title="Recurring"><i data-lucide="repeat" style="width:10px;"></i></span>' : '';
    const inv = exp.isInvestment ? '<span class="recurring-indicator" style="color:var(--color-investments)" title="Investment Asset"><i data-lucide="trending-up" style="width:10px;"></i></span>' : '';
    
    tr.innerHTML = `
      <td data-label="Date">${formatDate(exp.date)}</td>
      <td data-label="Bucket"><span class="category-badge ${bClass}">${exp.bucket}</span></td>
      <td data-label="Category">${exp.category} ${rec} ${inv}</td>
      <td data-label="Note" style="color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${exp.note || '-'}</td>
      <td data-label="Amount" style="font-weight:700;">₹${formatNumber(exp.amount)}</td>
      <td data-label="Actions">
        <div class="table-actions">
          <button class="btn-table btn-table-edit" onclick="openExpenseModal('${exp.id}')"><i data-lucide="edit-3"></i></button>
          <button class="btn-table btn-table-delete" onclick="deleteExpense('${exp.id}')"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function deleteExpense(id) {
  if (confirm('Delete transaction permanently?')) {
    state.expenses = state.expenses.filter(x => x.id !== id);
    saveStateToStorage();
    renderExpenses();
    renderDashboard();
    showToast('Transaction removed', 'warning');
  }
}

// SUBSCRIPTIONS MODALS & CRUD
function openAddSubModal() { 
  document.getElementById('subscription-form').reset();
  document.getElementById('sub-last-used').value = new Date().toISOString().split('T')[0];
  checkCustomSub();
  document.getElementById('modal-subscription').classList.add('active'); 
}

function closeAddSubModal() { 
  document.getElementById('modal-subscription').classList.remove('active'); 
}

function checkCustomSub() {
  const s = document.getElementById('sub-name').value;
  document.getElementById('custom-sub-name-group').style.display = s === 'custom' ? 'block' : 'none';
  if (s === 'custom') {
    document.getElementById('sub-custom-name').required = true;
  } else {
    document.getElementById('sub-custom-name').required = false;
    document.getElementById('sub-custom-name').value = '';
  }
}

function handleSubSubmit(e) {
  e.preventDefault();
  const nameSelect = document.getElementById('sub-name').value;
  const nameCustom = document.getElementById('sub-custom-name').value.trim();
  const cost = parseInt(document.getElementById('sub-cost').value);
  const billingDay = parseInt(document.getElementById('sub-billing-date').value);
  const lastUsed = document.getElementById('sub-last-used').value;

  const name = nameSelect === 'custom' ? nameCustom : nameSelect;
  state.subscriptions.push({ id: generateId(), name, cost, billingDate: billingDay, lastUsedDate: lastUsed });
  
  // Auto-log recurring Wants expense
  const currentMonthYear = new Date().toISOString().substring(0, 7);
  state.expenses.push({
    id: generateId(), 
    amount: cost, 
    bucket: 'Wants', 
    category: 'OTT Subscriptions',
    date: `${currentMonthYear}-${String(billingDay).padStart(2, '0')}`,
    note: `Subscription: ${name}`, 
    isRecurring: true
  });

  saveStateToStorage();
  closeAddSubModal();
  renderSubscriptions();
  renderDashboard();
  showToast(`${name} subscription linked`, 'success');
}

function renderSubscriptions() {
  const container = document.getElementById('subscriptions-container');
  const empty = document.getElementById('subscriptions-empty-state');
  container.innerHTML = '';

  if (state.subscriptions.length === 0) {
    empty.style.display = 'flex';
    document.getElementById('sub-stat-total').textContent = '₹0/mo';
    document.getElementById('sub-stat-forgotten').textContent = '0';
    document.getElementById('sub-stat-renewal').textContent = 'None';
    document.getElementById('sub-stat-renewal-countdown').textContent = 'No active bills';
    return;
  }
  empty.style.display = 'none';

  // Stats
  const total = state.subscriptions.reduce((acc, s) => acc + s.cost, 0);
  document.getElementById('sub-stat-total').textContent = `₹${formatNumber(total)}/mo`;
  
  // Forgotten check (not used for > 30 days)
  const forgotten = state.subscriptions.filter(s => {
    const diff = Math.abs(new Date() - new Date(s.lastUsedDate));
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) > 30;
  });
  document.getElementById('sub-stat-forgotten').textContent = forgotten.length;

  const upcoming = getUpcomingSubscriptionRenewals(30);
  if (upcoming.length > 0) {
    document.getElementById('sub-stat-renewal').textContent = upcoming[0].name;
    document.getElementById('sub-stat-renewal-countdown').textContent = `₹${formatNumber(upcoming[0].cost)} due in ${upcoming[0].daysLeft} days`;
  } else {
    document.getElementById('sub-stat-renewal').textContent = 'None';
    document.getElementById('sub-stat-renewal-countdown').textContent = 'No bills in next 30 days';
  }

  state.subscriptions.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'card subscription-card';
    let lClass = 'logo-custom', sl = sub.name.substring(0,2).toUpperCase();
    const nl = sub.name.toLowerCase();
    if (nl.includes('netflix')) { lClass = 'logo-netflix'; sl = 'N'; }
    else if (nl.includes('prime')) { lClass = 'logo-prime'; sl = 'P'; }
    else if (nl.includes('hotstar')) { lClass = 'logo-hotstar'; sl = 'H'; }
    else if (nl.includes('spotify')) { lClass = 'logo-spotify'; sl = 'S'; }
    else if (nl.includes('zee5')) { lClass = 'logo-zee5'; sl = 'Z'; }

    const isForg = Math.ceil(Math.abs(new Date() - new Date(sub.lastUsedDate))/(1000*60*60*24)) > 30;
    const badge = isForg ? `<span class="forgotten-badge"><i data-lucide="ghost" style="width:10px;"></i> Forgotten?</span>` : '';

    card.innerHTML = `
      <div class="sub-header">
        <div class="sub-logo-title">
          <div class="sub-logo ${lClass}">${sl}</div>
          <div class="sub-title">
            <h4>${sub.name}</h4>
            <span>Billing Day: ${ordinalSuffixOf(sub.billingDate)}</span>
          </div>
        </div>
        <button class="btn-table btn-table-delete" onclick="deleteSub('${sub.id}')"><i data-lucide="trash-2" style="width:16px;"></i></button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="sub-cost">₹${formatNumber(sub.cost)}<span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">/mo</span></span>
        ${badge}
      </div>
      <div class="sub-meta">
        <div style="display:flex; justify-content:space-between;"><span>Last Accessed:</span><span>${formatDate(sub.lastUsedDate)}</span></div>
      </div>
      <button class="btn btn-secondary" style="padding:0.4rem; font-size:0.75rem; margin-top:0.25rem;" onclick="logSubActivity('${sub.id}')">
        <i data-lucide="check" style="width:12px;"></i> Mark Used Today
      </button>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function logSubActivity(id) {
  const sub = state.subscriptions.find(s => s.id === id);
  if (sub) {
    sub.lastUsedDate = new Date().toISOString().split('T')[0];
    saveStateToStorage();
    renderSubscriptions();
    showToast(`Access logged for ${sub.name}`, 'success');
  }
}

function deleteSub(id) {
  if (confirm('Stop tracking subscription?')) {
    state.subscriptions = state.subscriptions.filter(s => s.id !== id);
    saveStateToStorage();
    renderSubscriptions();
    renderDashboard();
    showToast('Subscription removed', 'warning');
  }
}

// SAVINGS GOALS MODALS & CRUD
function openAddGoalModal() { 
  document.getElementById('goal-form').reset();
  document.getElementById('modal-goal').classList.add('active'); 
}

function closeAddGoalModal() { 
  document.getElementById('modal-goal').classList.remove('active'); 
}

function handleGoalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('goal-name').value.trim();
  const target = parseInt(document.getElementById('goal-target').value);
  const split = parseInt(document.getElementById('goal-split-pct').value);

  const activeSplits = state.goals.reduce((acc, g) => acc + g.linkedSplitPercent, 0);
  if (activeSplits + split > 100) {
    showToast(`Capacity overflow. Remaining: ${100 - activeSplits}%`, 'danger');
    return;
  }

  state.goals.push({ id: generateId(), name, target, linkedSplitPercent: split, createdAt: new Date().toISOString().split('T')[0] });
  saveStateToStorage();
  closeAddGoalModal();
  renderGoals();
  renderDashboard();
  showToast(`Savings target "${name}" created`, 'success');
}

function renderGoals() {
  const container = document.getElementById('goals-container');
  const empty = document.getElementById('goals-empty-state');
  container.innerHTML = '';

  if (state.goals.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  const sBudget = state.profile ? state.profile.income * (state.profile.budgetSplits.savings / 100) : 0;

  state.goals.forEach(goal => {
    const acc = computeGoalAccumulated(goal);
    let pct = (acc / goal.target) * 100;
    if (pct > 100) pct = 100;

    const rate = sBudget * (goal.linkedSplitPercent/100);
    const rem = goal.target - acc;
    let compText = 'Fulfillable';

    if (rem <= 0) compText = 'Fulfilled! 🎉';
    else if (rate <= 0) compText = 'Savings split zero';
    else {
      const months = Math.ceil(rem / rate);
      const targetD = new Date(); targetD.setMonth(targetD.getMonth() + months);
      compText = `Est. Completion: ${targetD.toLocaleDateString('en-IN', {month:'short', year:'numeric'})} (${months} mo)`;
    }

    const card = document.createElement('div');
    card.className = 'card goal-card';
    card.innerHTML = `
      <div class="goal-header">
        <div>
          <h4>${goal.name}</h4>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Rate: ₹${formatNumber(Math.round(rate))}/mo (${goal.linkedSplitPercent}% savings)</span>
        </div>
        <button class="btn-table btn-table-delete" onclick="deleteGoal('${goal.id}')"><i data-lucide="trash-2" style="width:16px;"></i></button>
      </div>
      <div class="goal-numbers">
        <span class="goal-current">₹${formatNumber(acc)} saved</span>
        <span class="goal-target">Target: ₹${formatNumber(goal.target)}</span>
      </div>
      <div class="goal-bar-wrapper">
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%;"></div></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:0.75rem; font-size:0.8rem;">
        <span class="goal-completion">${compText}</span>
        <button class="btn btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.75rem;" onclick="addGoalContribution('${goal.id}')">Add Extra Saving</button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function addGoalContribution(id) {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  const input = prompt(`Enter extra savings amount for "${goal.name}" (₹):`);
  const amt = parseInt(input);
  if (isNaN(amt) || amt <= 0) return;

  state.expenses.push({
    id: generateId(), 
    amount: amt, 
    bucket: 'Savings', 
    category: 'Emergency Fund',
    date: new Date().toISOString().split('T')[0], 
    note: `Goal Injection: ${goal.name}`, 
    isRecurring: false,
    isInvestment: false
  });

  saveStateToStorage();
  renderGoals();
  renderDashboard();
  showToast(`Contribution of ₹${formatNumber(amt)} saved`, 'success');
}

function deleteGoal(id) {
  if (confirm('Delete savings target?')) {
    state.goals = state.goals.filter(g => g.id !== id);
    saveStateToStorage();
    renderGoals();
    renderDashboard();
    showToast('Goal removed', 'warning');
  }
}

// INVESTMENTS tab logic
function getInvestmentHoldings() {
  const holdings = {};
  
  state.expenses.forEach(exp => {
    if (exp.bucket === 'Savings' && exp.isInvestment) {
      const type = exp.assetType || 'Others';
      const name = exp.note ? exp.note.trim() : type;
      
      const key = `${type}_${name}`;
      if (!holdings[key]) {
        holdings[key] = {
          name: name,
          type: type,
          amount: 0,
          lastDate: exp.date
        };
      }
      holdings[key].amount += exp.amount;
      if (new Date(exp.date) > new Date(holdings[key].lastDate)) {
        holdings[key].lastDate = exp.date;
      }
    }
  });
  
  return Object.values(holdings);
}

function renderInvestments() {
  if (!state.profile) return;
  const holdings = getInvestmentHoldings();

  // 1. Total Investment Valuation
  const invTotal = holdings.reduce((acc, h) => acc + h.amount, 0);
  document.getElementById('inv-total-portfolio').textContent = `₹${formatNumber(invTotal)}`;

  // 2. Monthly Investment SIP Run Rate
  const today = new Date();
  const monthlyRate = state.expenses
    .filter(x => {
      const d = new Date(x.date);
      return x.bucket === 'Savings' && 
             x.isInvestment && 
             d.getFullYear() === today.getFullYear() && 
             d.getMonth() === today.getMonth();
    })
    .reduce((acc, x) => acc + x.amount, 0);

  document.getElementById('inv-monthly-rate').textContent = `₹${formatNumber(monthlyRate)}/mo`;
  const investedPct = Math.round((monthlyRate / state.profile.income) * 100) || 0;
  document.getElementById('inv-rate-percentage').textContent = `${investedPct}% of net income invested this month`;

  // 3. 12% CAGR Future Wealth Projections (lump sum + monthly SIP)
  // Formula: FV = P * (1+r)^n + PMT * [((1+r)^n - 1) / r] * (1+r)
  const r = 0.12 / 12; // 1% per month
  const n5 = 60; // 5 years
  const n10 = 120; // 10 years

  const lumpSumCompounded5 = invTotal * Math.pow(1 + r, n5);
  const sipCompounded5 = monthlyRate > 0 
    ? monthlyRate * ((Math.pow(1 + r, n5) - 1) / r) * (1 + r)
    : 0;
  const fv5 = Math.round(lumpSumCompounded5 + sipCompounded5);

  const lumpSumCompounded10 = invTotal * Math.pow(1 + r, n10);
  const sipCompounded10 = monthlyRate > 0 
    ? monthlyRate * ((Math.pow(1 + r, n10) - 1) / r) * (1 + r)
    : 0;
  const fv10 = Math.round(lumpSumCompounded10 + sipCompounded10);

  const principal5 = invTotal + (monthlyRate * n5);

  document.getElementById('inv-projection-5yr').textContent = `₹${formatNumber(fv5)}`;
  document.getElementById('inv-projection-sub').textContent = `Estimated ₹${formatNumber(principal5)} invested capital`;

  document.getElementById('cagr-monthly-contrib').textContent = `₹${formatNumber(monthlyRate)}`;
  document.getElementById('cagr-5yr').textContent = `₹${formatNumber(fv5)}`;
  document.getElementById('cagr-10yr').textContent = `₹${formatNumber(fv10)}`;
  document.getElementById('cagr-total-principal').textContent = `₹${formatNumber(principal5)}`;

  // 4. Render Holdings list
  const tbody = document.getElementById('investments-table-body');
  const empty = document.getElementById('investments-empty');
  const table = tbody.closest('table');
  tbody.innerHTML = '';

  if (holdings.length === 0) {
    table.style.display = 'none';
    empty.style.display = 'flex';
  } else {
    table.style.display = 'table';
    empty.style.display = 'none';
    
    holdings.sort((a,b) => b.amount - a.amount).forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Asset Name" style="font-weight:600; color:var(--text-primary);">${h.name}</td>
        <td data-label="Asset Type"><span class="category-badge category-savings-badge">${h.type}</span></td>
        <td data-label="Amount Invested" style="font-weight:700;">₹${formatNumber(h.amount)}</td>
        <td data-label="Last Transaction">${formatDate(h.lastDate)}</td>
        <td data-label="Actions">
          <button class="btn btn-secondary" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--color-danger); border-color:rgba(239,68,68,0.15);" onclick="deleteAssetHoldings('${h.type}', '${h.name}')">
            Sell
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 5. Render Allocation Doughnut Chart
  renderInvestmentChart(holdings);
}

function deleteAssetHoldings(type, name) {
  if (confirm(`Liquidate and sell holdings for "${name}" (${type})? This will delete all underlying transactions.`)) {
    state.expenses = state.expenses.filter(x => !(x.bucket === 'Savings' && x.isInvestment && x.assetType === type && (x.note ? x.note.trim() : type) === name));
    saveStateToStorage();
    renderInvestments();
    renderDashboard();
    showToast('Asset holdings sold & removed', 'warning');
  }
}

function renderInvestmentChart(holdings) {
  const ctx = document.getElementById('chart-investment-alloc');
  if (!ctx) return;
  
  const theme = document.documentElement.getAttribute('data-theme');
  const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';
  
  if (personalCharts.investment) {
    personalCharts.investment.destroy();
  }

  const assetAlloc = {
    'Mutual Funds': 0,
    'Stocks': 0,
    'Fixed Deposits': 0,
    'Gold': 0,
    'PPF': 0,
    'Cryptocurrencies': 0,
    'Others': 0
  };

  holdings.forEach(h => {
    if (assetAlloc[h.type] !== undefined) {
      assetAlloc[h.type] += h.amount;
    } else {
      assetAlloc['Others'] += h.amount;
    }
  });

  const labels = Object.keys(assetAlloc).filter(k => assetAlloc[k] > 0);
  const data = labels.map(k => assetAlloc[k]);

  if (labels.length === 0) {
    labels.push('No Assets Registered');
    data.push(1);
  }

  personalCharts.investment = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#6366f1', '#a3e635', '#06b6d4', '#f97316', '#db2777', '#f43f5e', '#64748b'],
        borderWidth: 2,
        borderColor: theme === 'dark' ? '#05070f' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: labelColor, boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });
}

// SIMULATED SMS TOAST SYSTEM
let smsInterval = null;

function toggleSMSAutoRead() {
  const checkbox = document.getElementById('settings-pref-sms');
  state.profile.smsConsent = checkbox.checked;
  saveStateToStorage();
  if (state.profile.smsConsent) {
    startSMSTimer();
    showToast('Auto SMS transaction scanning enabled', 'info');
  } else {
    clearInterval(smsInterval);
    showToast('SMS permission scanning disabled', 'warning');
  }
}

function startSMSTimer() {
  clearInterval(smsInterval);
  smsInterval = setInterval(() => {
    if (state.profile && state.profile.smsConsent && state.user.loggedIn) {
      triggerMockSMS();
    }
  }, 90000);
}

function triggerMockSMS() {
  const sampleSMSList = [
    { text: "HDFC Bank: DR ₹1,850 at Swiggy on 10-Jun-26. Avail Bal: ₹32,040.", amount: 1850, merchant: "Swiggy", bucket: "Wants" },
    { text: "SBI Card: DR ₹649 at Netflix on 01-Jun-26. Avail Bal: ₹21,391.", amount: 649, merchant: "Netflix", bucket: "Wants" },
    { text: "ICICI Bank: DR ₹5,400 at Reliance Retail on 05-Jun-26. Avail Bal: ₹25,991.", amount: 5400, merchant: "Reliance Retail", bucket: "Needs" },
    { text: "HDFC Bank: DR ₹2,500 at Petrol Pump on 09-Jun-26. Avail Bal: ₹21,101.", amount: 2500, merchant: "Petrol Pump", bucket: "Needs" }
  ];

  const randomSMS = sampleSMSList[Math.floor(Math.random() * sampleSMSList.length)];
  activeQuickSMS = randomSMS;

  document.getElementById('sms-text').textContent = randomSMS.text;
  
  // Show SMS Toast
  const toast = document.getElementById('phone-sms-toast');
  toast.style.display = 'flex';
  
  // Auto remove in 15 seconds
  setTimeout(() => {
    closeSMSToast();
  }, 15000);
}

function closeSMSToast() {
  document.getElementById('phone-sms-toast').style.display = 'none';
}

function openQuickCategorize() {
  if (!activeQuickSMS) return;
  closeSMSToast();

  document.getElementById('quick-cat-amount').textContent = `₹${formatNumber(activeQuickSMS.amount)}`;
  document.getElementById('quick-cat-merchant').textContent = activeQuickSMS.merchant;
  
  // Reset fields
  document.getElementById('quick-cat-note').value = `AutoSMS: ${activeQuickSMS.merchant}`;
  setQuickCatBucket(activeQuickSMS.bucket);
  
  document.getElementById('modal-quick-categorize').classList.add('active');
}

function closeQuickCategorize() {
  document.getElementById('modal-quick-categorize').classList.remove('active');
}

function setQuickCatBucket(bucket) {
  quickCatBucket = bucket;
  
  // toggle buttons active classes
  document.getElementById('btn-quick-needs').className = bucket === 'Needs' ? 'btn btn-secondary filter-btn-active' : 'btn btn-secondary';
  document.getElementById('btn-quick-wants').className = bucket === 'Wants' ? 'btn btn-secondary filter-btn-active' : 'btn btn-secondary';
  document.getElementById('btn-quick-savings').className = bucket === 'Savings' ? 'btn btn-secondary filter-btn-active' : 'btn btn-secondary';
  
  // Populate categories
  const select = document.getElementById('quick-cat-select');
  select.innerHTML = '';
  CATEGORIES_MAPPING[bucket].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });
  
  toggleQuickCustomCategoryInput();
}

function toggleQuickCustomCategoryInput() {
  const cat = document.getElementById('quick-cat-select').value;
  const isOther = cat === 'Other Needs' || cat === 'Other Wants' || cat === 'Other Savings';
  const group = document.getElementById('quick-custom-cat-group');
  const input = document.getElementById('quick-custom-cat-name');
  
  if (isOther) {
    group.style.display = 'block';
    input.required = true;
  } else {
    group.style.display = 'none';
    input.required = false;
    input.value = '';
  }
}

function saveQuickCategorizedTxn() {
  if (!activeQuickSMS) return;
  
  let cat = document.getElementById('quick-cat-select').value;
  const isOther = cat === 'Other Needs' || cat === 'Other Wants' || cat === 'Other Savings';
  if (isOther) {
    const customVal = document.getElementById('quick-custom-cat-name').value.trim();
    if (customVal) {
      cat = customVal;
    }
  }
  const note = document.getElementById('quick-cat-note').value;

  const txn = {
    id: generateId(),
    amount: activeQuickSMS.amount,
    bucket: quickCatBucket,
    category: cat,
    date: new Date().toISOString().split('T')[0],
    note: note,
    isRecurring: false
  };

  state.expenses.push(txn);
  saveStateToStorage();
  closeQuickCategorize();
  
  renderAll();
  showToast('SMS transaction categorized successfully!', 'success');
}

// PERSONAL CHARTS RENDER
function renderCharts() {
  if (!state.profile) return;
  const theme = document.documentElement.getAttribute('data-theme');
  const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const income = state.profile.income;
  const spent = computeMonthlySpent();

  // Destroy previous instances
  if (personalCharts.allocation) personalCharts.allocation.destroy();
  if (personalCharts.subcat) personalCharts.subcat.destroy();
  if (personalCharts.mom) personalCharts.mom.destroy();

  // 1. Target vs Spent Doughnut
  const splits = state.profile.budgetSplits;
  personalCharts.allocation = new Chart(document.getElementById('chart-allocation').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Needs (Spent)', 'Wants (Spent)', 'Savings (Invested)'],
      datasets: [
        {
          data: [spent.Needs, spent.Wants, spent.Savings],
          backgroundColor: ['#a3e635', '#f43f5e', '#06b6d4'],
          borderWidth: 2, borderColor: theme === 'dark' ? '#05070f' : '#ffffff'
        },
        {
          data: [income * (splits.needs/100), income * (splits.wants/100), income * (splits.savings/100)],
          backgroundColor: ['rgba(163,230,53,0.18)', 'rgba(244,63,94,0.18)', 'rgba(6,182,212,0.18)'],
          borderWidth: 1, borderColor: theme === 'dark' ? '#05070f' : '#ffffff'
        }
      ]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
        legend: { position: 'bottom', labels: { color: labelColor, font: { size: 11 } } } 
      }
    }
  });

  // 2. Subcategory Horizontal Bar
  const spentByCat = computeMonthlySpentByCategory();
  const subcatLabels = Object.keys(spentByCat).filter(k => spentByCat[k] > 0);
  const subcatValues = subcatLabels.map(k => spentByCat[k]);
  
  personalCharts.subcat = new Chart(document.getElementById('chart-subcategories').getContext('2d'), {
    type: 'bar',
    data: {
      labels: subcatLabels.length > 0 ? subcatLabels : ['No Spend Logged'],
      datasets: [{
        data: subcatValues.length > 0 ? subcatValues : [0],
        backgroundColor: '#6366f1', borderRadius: 5, barThickness: 15
      }]
    },
    options: {
      indexAxis: 'y', 
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
        y: { grid: { display: false }, ticks: { color: labelColor } }
      }
    }
  });

  // 3. Month-over-Month Comparisons
  const momData = getMoMHistory();
  personalCharts.mom = new Chart(document.getElementById('chart-mom').getContext('2d'), {
    type: 'bar',
    data: {
      labels: momData.labels,
      datasets: [
        { label: 'Needs', data: momData.needs, backgroundColor: '#a3e635' },
        { label: 'Wants', data: momData.wants, backgroundColor: '#f43f5e' },
        { label: 'Savings', data: momData.savings, backgroundColor: '#06b6d4' }
      ]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
        legend: { position: 'bottom', labels: { color: labelColor, font: { size: 11 } } } 
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: labelColor } },
        y: { stacked: true, grid: { color: gridColor }, ticks: { color: labelColor } }
      }
    }
  });

  // Food Delivery (Swiggy/Zomato) Widgets
  const foodData = getFoodDeliveryStats();
  document.getElementById('food-orders-count').textContent = `${foodData.count} orders`;
  document.getElementById('food-delivery-total').textContent = `₹${formatNumber(foodData.total)}`;
  document.getElementById('food-avg-cost').textContent = `₹${formatNumber(foodData.avg)}`;
  
  const nudge = document.getElementById('food-insights-text');
  if (foodData.count > 8) nudge.innerHTML = `🚨 High frequency! ordering ${foodData.count} times. cooking home can save ₹${formatNumber(Math.round(foodData.total*0.45))}`;
  else nudge.textContent = `💡 Food deliveries normal. Home cooking keeps budget healthy.`;

  renderTopCategories();
}

// HIGHLIGHT CATEGORIES
function renderTopCategories() {
  const container = document.getElementById('top-categories-highlights');
  container.innerHTML = '';
  const spent = computeMonthlySpentByCategory();
  const list = Object.keys(spent)
    .map(k => ({ cat: k, amt: spent[k] }))
    .filter(x => x.amt > 0)
    .sort((a,b) => b.amt - a.amt)
    .slice(0, 3);

  if (list.length === 0) {
    container.innerHTML = `<p style="grid-column:span 3; text-align:center; color:var(--text-muted);">No category expenditure logged</p>`;
    return;
  }

  list.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `highlight-mini-card rank-${idx+1}`;
    card.innerHTML = `
      <div class="rank">Rank #${idx+1}</div>
      <h5>${item.cat}</h5>
      <div class="val">₹${formatNumber(item.amt)}</div>
    `;
    container.appendChild(card);
  });
}

// AUDIT REPORT SHEETS
function renderMonthlyReport() {
  if (!state.profile) return;
  const income = state.profile.income;
  const spent = computeMonthlySpent();
  
  document.getElementById('report-month-title').textContent = `Audit Period: ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  document.getElementById('report-income').textContent = `₹${formatNumber(income)}`;
  document.getElementById('report-spent').textContent = `₹${formatNumber(spent.Needs + spent.Wants)}`;
  document.getElementById('report-saved').textContent = `₹${formatNumber(spent.Savings)}`;

  const splits = state.profile.budgetSplits;
  const tbody = document.getElementById('report-comparison-tbody');
  tbody.innerHTML = '';

  const buckets = ['Needs', 'Wants', 'Savings'];
  let score = 100;
  let recMsg = '';

  buckets.forEach(b => {
    const targetAmt = income * (splits[b.toLowerCase()]/100);
    const actualAmt = spent[b] || 0;
    const actualPct = Math.round((actualAmt/income)*100) || 0;
    const variance = actualAmt - targetAmt;
    let varText = 'On Track';
    let varColor = 'var(--color-success)';

    if (variance > 0) {
      varText = `+₹${formatNumber(variance)} over`;
      varColor = 'var(--color-danger)';
      score -= Math.round((variance/targetAmt)*30);
    } else if (variance < 0 && b === 'Savings') {
      varText = `-₹${formatNumber(Math.abs(variance))} short`;
      varColor = 'var(--color-warning)';
      score -= Math.round((Math.abs(variance)/targetAmt)*20);
    } else if (variance < 0) {
      varText = `-₹${formatNumber(Math.abs(variance))} saved`;
      varColor = 'var(--color-success)';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${b}</td>
      <td>${splits[b.toLowerCase()]}%</td>
      <td>₹${formatNumber(targetAmt)}</td>
      <td style="font-weight:700;">₹${formatNumber(actualAmt)}</td>
      <td>${actualPct}%</td>
      <td style="color:${varColor}; font-weight:700;">${varText}</td>
    `;
    tbody.appendChild(tr);
  });

  score = Math.max(0, Math.min(100, score));
  const stamp = document.getElementById('report-compliance-stamp');
  if (score >= 90) {
    stamp.textContent = 'COMPLIANT';
    stamp.style.color = 'var(--color-success)';
    stamp.style.borderColor = 'var(--color-success)';
    stamp.style.backgroundColor = 'rgba(163, 230, 53, 0.1)';
    recMsg = 'Financial allocations strictly align with the 50/30/20 guidelines. Savings rate targets are fully met.';
  } else if (score >= 70) {
    stamp.textContent = 'WARNING';
    stamp.style.color = 'var(--color-warning)';
    stamp.style.borderColor = 'var(--color-warning)';
    stamp.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
    recMsg = 'Minor slippage in lifestyle allocations. Prune subscription drains to balance savings.';
  } else {
    stamp.textContent = 'NON-COMPLIANT';
    stamp.style.color = 'var(--color-danger)';
    stamp.style.borderColor = 'var(--color-danger)';
    stamp.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    recMsg = 'Severe budget overruns in operating accounts. Review fixed costs and lower discretionary spend.';
  }

  document.getElementById('report-rec-title').innerHTML = `<i data-lucide="award"></i> Compliance Score: ${score}/100`;
  document.getElementById('report-rec-paragraph').textContent = recMsg;
  lucide.createIcons();
}

function exportReportToPDF() {
  const element = document.getElementById('monthly-report-frame');
  
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library initializing. Please wait.', 'warning');
    return;
  }

  showToast('Compiling financial PDF document...', 'info');

  const opt = {
    margin: [0.5, 0.5],
    filename: `MoneyWise_Personal_Audit_${new Date().toISOString().substring(0,7)}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#05070f' },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save().then(() => {
    showToast('PDF Statement downloaded', 'success');
  }).catch(() => {
    window.print();
  });
}

// INJECT MOCK PREVIEW DATASETS
function injectMockData() {
  const today = new Date();
  const currentMonthYear = today.toISOString().substring(0, 7);
  const pm1 = new Date(); pm1.setMonth(today.getMonth() - 1);
  const pm1Str = pm1.toISOString().substring(0, 7);

  // Set unified profiles
  state.profile = {
    profession: 'Freelancer',
    income: 80000,
    budgetSplits: { needs: 50, wants: 30, savings: 20 },
    bankingConnected: true,
    smsConsent: true
  };

  // Subscriptions
  state.subscriptions = [
    { id: generateId(), name: 'Netflix', cost: 649, billingDate: 1, lastUsedDate: today.toISOString().split('T')[0] },
    { id: generateId(), name: 'Spotify', cost: 119, billingDate: 5, lastUsedDate: today.toISOString().split('T')[0] },
    { id: generateId(), name: 'Disney+ Hotstar', cost: 149, billingDate: 25, lastUsedDate: new Date(today.getTime() - (35*24*60*60*1000)).toISOString().split('T')[0] }
  ];

  // Goals
  state.goals = [
    { id: generateId(), name: 'Emergency Fund', target: 150000, linkedSplitPercent: 60, createdAt: pm1Str + '-01' },
    { id: generateId(), name: 'Trip to Tokyo', target: 120000, linkedSplitPercent: 40, createdAt: pm1Str + '-01' }
  ];

  // Expenses with custom categories
  state.expenses = [
    { id: generateId(), amount: 22000, bucket: 'Needs', category: 'Rent', date: currentMonthYear + '-01', note: 'Rent payment', isRecurring: true },
    { id: generateId(), amount: 5200, bucket: 'Needs', category: 'Groceries', date: currentMonthYear + '-03', note: 'Weekly grocs', isRecurring: false },
    { id: generateId(), amount: 3500, bucket: 'Needs', category: 'Utilities', date: currentMonthYear + '-05', note: 'Electricity bill', isRecurring: true },
    { id: generateId(), amount: 1250, bucket: 'Needs', category: 'Pet Vet', date: currentMonthYear + '-07', note: 'Dog checkup', isRecurring: false }, // custom Needs
    { id: generateId(), amount: 890, bucket: 'Wants', category: 'Food Delivery', date: currentMonthYear + '-02', note: 'Zomato biryani', isRecurring: false },
    { id: generateId(), amount: 450, bucket: 'Wants', category: 'Food Delivery', date: currentMonthYear + '-05', note: 'Swiggy coffee', isRecurring: false },
    { id: generateId(), amount: 649, bucket: 'Wants', category: 'OTT Subscriptions', date: currentMonthYear + '-01', note: 'Subscription: Netflix', isRecurring: true },
    { id: generateId(), amount: 119, bucket: 'Wants', category: 'OTT Subscriptions', date: currentMonthYear + '-05', note: 'Subscription: Spotify', isRecurring: true },
    { id: generateId(), amount: 14200, bucket: 'Wants', category: 'Desk Setup', date: currentMonthYear + '-06', note: 'Ergonomic keyboard', isRecurring: false }, // custom Wants
    { id: generateId(), amount: 3500, bucket: 'Wants', category: 'Concerts', date: currentMonthYear + '-12', note: 'Music concert', isRecurring: false }, // custom Wants
    
    // Investments Savings
    { id: generateId(), amount: 10000, bucket: 'Savings', category: 'Mutual Funds', date: currentMonthYear + '-05', note: 'HDFC Index Fund SIP', isRecurring: true, isInvestment: true, assetType: 'Mutual Funds' },
    { id: generateId(), amount: 4000, bucket: 'Savings', category: 'Stocks', date: currentMonthYear + '-07', note: 'Equity Portfolio SIP', isRecurring: true, isInvestment: true, assetType: 'Stocks' },
    { id: generateId(), amount: 2000, bucket: 'Savings', category: 'Gold', date: currentMonthYear + '-08', note: 'MMTC digital gold', isRecurring: true, isInvestment: true, assetType: 'Gold' }
  ];

  saveStateToStorage();
  syncAppProfileUI();
  renderAll();
  showToast('MoneyWise sandbox variables injected!', 'success');
  
  // Refresh if in charts or report
  const activeTab = document.querySelector('.tab-content.active').id;
  if (activeTab === 'tab-insights') renderCharts();
  else if (activeTab === 'tab-report') renderMonthlyReport();
  else if (activeTab === 'tab-investments') renderInvestments();
}

function saveSettingsSplits() {
  const income = parseInt(document.getElementById('settings-income').value);
  const n = parseInt(document.getElementById('slider-settings-needs').value);
  const w = parseInt(document.getElementById('slider-settings-wants').value);
  const s = parseInt(document.getElementById('slider-settings-savings').value);

  if (n + w + s !== 100) {
    showToast('Splits must total 100%', 'danger');
    return;
  }

  state.profile.income = income;
  state.profile.budgetSplits = { needs: n, wants: w, savings: s };
  
  saveStateToStorage();
  syncAppProfileUI();
  renderAll();
  showToast('Personal budget limits re-allocated', 'success');
}

function updateSettingsSliders() {
  let n = parseInt(document.getElementById('slider-settings-needs').value);
  let w = parseInt(document.getElementById('slider-settings-wants').value);
  let s = parseInt(document.getElementById('slider-settings-savings').value);

  document.getElementById('label-settings-needs').textContent = n + '%';
  document.getElementById('label-settings-wants').textContent = w + '%';
  document.getElementById('label-settings-savings').textContent = s + '%';

  const badge = document.getElementById('settings-split-total');
  const total = n + w + s;
  badge.textContent = `${total}% (${total === 100 ? 'Valid' : 'Invalid'})`;
  badge.className = `split-total-badge ${total === 100 ? 'valid' : 'invalid'}`;
}

function saveNotificationPreferences() {
  state.preferences.notifications = {
    overspend: document.getElementById('pref-alert-overspend').checked,
    renewal: document.getElementById('pref-alert-renewal').checked,
    goals: state.preferences.notifications.goals // carry over
  };
  saveStateToStorage();
  updateAlertsBanner();
  showToast('Alert preferences saved', 'success');
}

function triggerLedgerReset() {
  if (confirm('CAUTION: This will delete ALL your data permanently. This cannot be undone. Proceed?')) {
    state.expenses = [];
    state.subscriptions = [];
    state.goals = [];
    state.profile = null;
    saveStateToStorage();
    localStorage.clear();
    window.location.reload();
  }
}

// MATH HELPERS
function computeMonthlySpent() {
  const list = getCurrentMonthExpenses();
  const spent = { Needs: 0, Wants: 0, Savings: 0 };
  list.forEach(x => {
    if (spent[x.bucket] !== undefined) spent[x.bucket] += x.amount;
  });
  return spent;
}

function computeMonthlySpentByCategory() {
  const list = getCurrentMonthExpenses();
  const spent = {};
  list.forEach(x => {
    spent[x.category] = (spent[x.category] || 0) + x.amount;
  });
  return spent;
}

function getCurrentMonthExpenses() {
  const today = new Date();
  return state.expenses.filter(x => {
    const d = new Date(x.date);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  });
}

function getFoodDeliveryStats() {
  const list = getCurrentMonthExpenses().filter(x => x.category === 'Food Delivery');
  const total = list.reduce((acc, x) => acc + x.amount, 0);
  const count = list.length;
  const avg = count > 0 ? Math.round(total / count) : 0;
  return { total, count, avg };
}

function getMoMHistory() {
  const today = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(); d.setMonth(today.getMonth() - i);
    months.push(d);
  }
  const labels = months.map(m => m.toLocaleDateString('en-IN', { month: 'short' }));
  const needs = [0,0,0], wants = [0,0,0], savings = [0,0,0];

  state.expenses.forEach(x => {
    const expD = new Date(x.date);
    months.forEach((m, idx) => {
      if (expD.getFullYear() === m.getFullYear() && expD.getMonth() === m.getMonth()) {
        if (x.bucket === 'Needs') needs[idx] += x.amount;
        if (x.bucket === 'Wants') wants[idx] += x.amount;
        if (x.bucket === 'Savings') savings[idx] += x.amount;
      }
    });
  });

  // Default mock MoM history if empty
  if (needs[0] === 0 && needs[1] === 0 && state.profile) {
    const inc = state.profile.income;
    needs[0] = Math.round(inc * 0.45); wants[0] = Math.round(inc * 0.32); savings[0] = Math.round(inc * 0.23);
    needs[1] = Math.round(inc * 0.48); wants[1] = Math.round(inc * 0.28); savings[1] = Math.round(inc * 0.24);
  }

  return { labels, needs, wants, savings };
}

function computeGoalAccumulated(goal) {
  let sum = 0;
  state.expenses.forEach(x => {
    if (x.bucket === 'Savings' && x.note && x.note.includes(`Goal Injection: ${goal.name}`)) sum += x.amount;
  });
  if (!state.profile) return sum;
  const issue = new Date(goal.createdAt);
  const today = new Date();
  const diffMonths = (today.getFullYear() - issue.getFullYear()) * 12 + today.getMonth() - issue.getMonth();
  const active = Math.max(1, diffMonths + 1);

  const rate = (state.profile.income * (state.profile.budgetSplits.savings / 100)) * (goal.linkedSplitPercent/100);
  sum += (rate * active);
  return Math.min(goal.target, Math.round(sum));
}

function getUpcomingSubscriptionRenewals(threshold) {
  const today = new Date(), day = today.getDate();
  const daysInM = getDaysInCurrentMonth();
  let list = [];
  state.subscriptions.forEach(s => {
    let daysLeft = 0;
    if (s.billingDate >= day) daysLeft = s.billingDate - day;
    else daysLeft = (daysInM - day) + s.billingDate;
    
    if (daysLeft <= threshold) {
      list.push({ ...s, daysLeft });
    }
  });
  return list.sort((a,b) => a.daysLeft - b.daysLeft);
}

// UTILS
function generateId() { return Math.random().toString(36).substring(2, 9); }

function formatNumber(n) {
  const x = n.toString();
  let lastThree = x.substring(x.length - 3);
  const rest = x.substring(0, x.length - 3);
  if (rest !== '') lastThree = ',' + lastThree;
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
}

function formatDate(dStr) {
  const d = new Date(dStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ordinalSuffixOf(i) {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return i + "st";
  if (j === 2 && k !== 12) return i + "nd";
  if (j === 3 && k !== 13) return i + "rd";
  return i + "th";
}

function getDaysInCurrentMonth() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// THEMES
function initTheme() {
  const isDark = state.preferences.darkMode;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const el = document.getElementById('theme-toggle-icon-sidebar');
  if (el) {
    el.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  }
  lucide.createIcons();
}

function toggleTheme() {
  state.preferences.darkMode = !state.preferences.darkMode;
  saveStateToStorage();
  initTheme();
  showToast(state.preferences.darkMode ? 'Dark theme' : 'Light theme', 'info');
  // Refresh active charts
  const insightsActive = document.getElementById('tab-insights').classList.contains('active');
  const investmentsActive = document.getElementById('tab-investments').classList.contains('active');
  if (insightsActive) setTimeout(renderCharts, 100);
  if (investmentsActive) setTimeout(renderInvestments, 100);
}

function setupEventListeners() {
  // Expense bucket select listener to sync custom inputs
  document.getElementById('expense-bucket').addEventListener('change', updateSubcategoriesSelect);
  document.getElementById('expense-category').addEventListener('change', toggleCustomCategoryInput);
  document.getElementById('expense-is-investment').addEventListener('change', toggleAssetTypeSelect);

  document.getElementById('filter-bucket').addEventListener('change', () => {
    populateFilterCategoriesSelect();
    renderExpenses();
  });
  document.getElementById('filter-subcategory').addEventListener('change', renderExpenses);
  
  populateFilterCategoriesSelect();
}

// TOASTS
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  else if (type === 'warning') icon = 'alert-triangle';
  else if (type === 'danger') icon = 'x-circle';
  
  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${msg}</span>`;
  c.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
