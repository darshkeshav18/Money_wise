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
    darkMode: true,
    showTooltips: true,
    tourCompleted: false
  }
};

// CHART HANDLERS
let personalCharts = { allocation: null, subcat: null, mom: null, investment: null };

// ACTIVE EDIT / MODAL STATES
let editExpenseId = null;
let editSubId = null;
let editGoalId = null;
let activeQuickSMS = null;
let quickCatBucket = 'Wants';
let currentOnboardStep = 1;
let selectedProfession = 'Salaried';

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  loadSessionState();
  initTheme();
  setupEventListeners();
  startSMSTimer();
  initPullToRefresh();
  updateCurrentDateDisplay();
  lucide.createIcons();
});

// LOAD STATE
function loadSessionState() {
  const userSession = localStorage.getItem('mw_user');
  const profileData = localStorage.getItem('mw_profile');
  const expensesData = localStorage.getItem('mw_expenses');
  const subscriptionsData = localStorage.getItem('mw_subscriptions');
  const goalsData = localStorage.getItem('mw_goals');
  const prefsData = localStorage.getItem('mw_preferences');

  if (userSession) {
    state.user = JSON.parse(userSession);
    
    // Call Android JS Bridge if present
    if (window.AndroidBridge && state.user && state.user.loggedIn && !state.user.isGuest) {
      window.AndroidBridge.onLoginSuccess(state.user.username);
    }
    
    // Hide Landing Auth
    document.getElementById('auth-overlay').style.display = 'none';

    // Populate local variables from cache first
    if (profileData) {
      state.profile = JSON.parse(profileData);
      state.expenses = expensesData ? JSON.parse(expensesData) : [];
      state.subscriptions = subscriptionsData ? JSON.parse(subscriptionsData) : [];
      state.goals = goalsData ? JSON.parse(goalsData) : [];
      if (prefsData) state.preferences = JSON.parse(prefsData);

      // Launch App Shell immediately
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      
      syncAppProfileUI();
      renderAll();
    } else {
      // Prompt onboarding
      document.getElementById('onboarding-overlay').style.display = 'flex';
      goToOnboardStep(1);
    }

    // Immediately sync with database in background
    fetchDataFromBackend();
  } else {
    // Show landing
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('onboarding-overlay').style.display = 'none';
  }
}

function fetchDataFromBackend() {
  if (!state.user || !state.user.loggedIn || state.user.isGuest) return;

  fetch('/api/user/data', {
    headers: {
      'Authorization': `Bearer ${state.user.username}`
    }
  })
  .then(res => {
    if (res.ok) return res.json();
    throw new Error('Not found or unauthorized');
  })
  .then(data => {
    // If successfully loaded from server, overwrite client state
    state.profile = data.profile;
    state.expenses = data.expenses || [];
    state.subscriptions = data.subscriptions || [];
    state.goals = data.goals || [];
    state.preferences = data.preferences || state.preferences;

    // Save to local cache
    localStorage.setItem('mw_profile', JSON.stringify(state.profile));
    localStorage.setItem('mw_expenses', JSON.stringify(state.expenses));
    localStorage.setItem('mw_subscriptions', JSON.stringify(state.subscriptions));
    localStorage.setItem('mw_goals', JSON.stringify(state.goals));
    localStorage.setItem('mw_preferences', JSON.stringify(state.preferences));

    // Re-render
    if (state.profile) {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      syncAppProfileUI();
      renderAll();
    } else {
      document.getElementById('onboarding-overlay').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
      goToOnboardStep(1);
    }
  })
  .catch(err => {
    console.warn("Background sync loaded from local storage cache:", err.message);
  });
}

// SAVE STATE
function saveStateToStorage() {
  localStorage.setItem('mw_user', JSON.stringify(state.user));
  if (state.profile) {
    localStorage.setItem('mw_profile', JSON.stringify(state.profile));
  }
  localStorage.setItem('mw_expenses', JSON.stringify(state.expenses));
  localStorage.setItem('mw_subscriptions', JSON.stringify(state.subscriptions));
  localStorage.setItem('mw_goals', JSON.stringify(state.goals));
  localStorage.setItem('mw_preferences', JSON.stringify(state.preferences));

  // Sync to database
  syncWithBackend();
}

function syncWithBackend() {
  if (!state.user || !state.user.loggedIn || state.user.isGuest) return;

  const payload = {
    profile: state.profile,
    expenses: state.expenses,
    subscriptions: state.subscriptions,
    goals: state.goals,
    preferences: state.preferences
  };

  fetch('/api/user/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.user.username}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) {
      console.warn("Failed to sync data with server");
    }
  })
  .catch(err => {
    console.error("Network error during sync:", err);
  });
}

// SIMULATED AUTH HANDLERS
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

function handleAuthSubmit(e, action) {
  e.preventDefault();
  
  const usernameInput = action === 'login' ? 'login-username' : 'signup-username';
  const passwordInput = action === 'login' ? 'login-password' : 'signup-password';
  
  const username = document.getElementById(usernameInput).value.trim();
  const password = document.getElementById(passwordInput).value;

  if (action === 'signup') {
    const email = document.getElementById('signup-email').value.trim();
    const confirm = document.getElementById('signup-confirm').value;

    if (password !== confirm) {
      showToast('Passwords do not match!', 'danger');
      return;
    }

    // Call Register Endpoint
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    })
    .then(res => {
      if (res.ok) return res.json();
      return res.text().then(text => {
        try {
          const errJson = JSON.parse(text);
          throw new Error(errJson.error || 'Registration failed');
        } catch (e) {
          throw new Error(text.substring(0, 100) || 'Server error occurred during registration');
        }
      });
    })
    .then(data => {
      // Direct login on register success
      state.user = { loggedIn: true, username: data.username, isGuest: false };
      state.profile = null;
      state.expenses = [];
      state.subscriptions = [];
      state.goals = [];
      state.preferences = {
        notifications: { overspend: true, renewal: true, goals: true },
        darkMode: state.preferences ? state.preferences.darkMode : true,
        showTooltips: true,
        tourCompleted: false
      };
      
      saveStateToStorage();
      
      // Call Android JS Bridge if present
      if (window.AndroidBridge) {
        window.AndroidBridge.onLoginSuccess(data.username);
      }
      
      showToast(`Welcome ${data.username}! Account created.`, 'success');
      
      // Transition to onboarding
      document.getElementById('auth-overlay').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('onboarding-overlay').style.display = 'flex';
        goToOnboardStep(1);
      }, 350);
    })
    .catch(err => {
      showToast(err.message, 'danger');
    });

  } else {
    // Call Login Endpoint
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    .then(res => {
      if (res.ok) return res.json();
      return res.text().then(text => {
        try {
          const errJson = JSON.parse(text);
          throw new Error(errJson.error || 'Authentication failed');
        } catch (e) {
          throw new Error(text.substring(0, 100) || 'Server error occurred during login');
        }
      });
    })
    .then(data => {
      state.user = { loggedIn: true, username: data.username, isGuest: false };
      
      // Call Android JS Bridge if present
      if (window.AndroidBridge) {
        window.AndroidBridge.onLoginSuccess(data.username);
      }
      
      localStorage.setItem('mw_user', JSON.stringify(state.user));
      showToast(`Welcome back, ${data.username}!`, 'success');
      
      // Load user details from DB
      fetch('/api/user/data', {
        headers: { 'Authorization': `Bearer ${data.username}` }
      })
      .then(res => res.json())
      .then(userData => {
        state.profile = userData.profile;
        state.expenses = userData.expenses || [];
        state.subscriptions = userData.subscriptions || [];
        state.goals = userData.goals || [];
        state.preferences = userData.preferences || state.preferences;
        
        localStorage.setItem('mw_profile', JSON.stringify(state.profile));
        localStorage.setItem('mw_expenses', JSON.stringify(state.expenses));
        localStorage.setItem('mw_subscriptions', JSON.stringify(state.subscriptions));
        localStorage.setItem('mw_goals', JSON.stringify(state.goals));
        localStorage.setItem('mw_preferences', JSON.stringify(state.preferences));

        syncAppProfileUI();
        renderAll();
 
        // Transition
        document.getElementById('auth-overlay').style.opacity = '0';
        setTimeout(() => {
          document.getElementById('auth-overlay').style.display = 'none';
          if (state.profile) {
            document.getElementById('app-container').style.display = 'flex';
            document.getElementById('onboarding-overlay').style.display = 'none';
          } else {
            document.getElementById('onboarding-overlay').style.display = 'flex';
            document.getElementById('app-container').style.display = 'none';
            goToOnboardStep(1);
          }
        }, 350);
      });
    })
    .catch(err => {
      showToast(err.message, 'danger');
    });
  }
}

function continueAsGuest() {
  state.user = {
    loggedIn: true,
    username: 'Guest User',
    isGuest: true
  };
  state.preferences = {
    notifications: { overspend: true, renewal: true, goals: true },
    darkMode: state.preferences ? state.preferences.darkMode : true,
    showTooltips: true,
    tourCompleted: false
  };
  saveStateToStorage();
  
  document.getElementById('auth-overlay').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('onboarding-overlay').style.display = 'flex';
    goToOnboardStep(1);
  }, 300);

  showToast('Guest mode initialized', 'info');
}

function handleLogout() {
  showConfirmDialog('Confirm Logout', 'Are you sure you want to log out? Local session variables will be cleared.', (confirmed) => {
    if (confirmed) {
      if (window.AndroidBridge) {
        window.AndroidBridge.onLogout();
      }
      localStorage.removeItem('mw_user');
      localStorage.removeItem('mw_profile');
      localStorage.removeItem('mw_expenses');
      localStorage.removeItem('mw_subscriptions');
      localStorage.removeItem('mw_goals');
      localStorage.removeItem('mw_preferences');
      window.location.reload();
    }
  });
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

// 50/30/20 Sliders Onboarding & Settings Lock-Step Logic (Disabled in favor of free sliding + total validation)
function resetToDefaultSplits() {
  document.getElementById('slider-needs').value = 50;
  document.getElementById('slider-wants').value = 30;
  document.getElementById('slider-savings').value = 20;
  updateSplitSliders();
}

function updateSplitSliders(activeSlider = 'needs') {
  let needsEl = document.getElementById('slider-needs');
  let wantsEl = document.getElementById('slider-wants');
  let savingsEl = document.getElementById('slider-savings');
  
  let needs = parseInt(needsEl.value) || 0;
  let wants = parseInt(wantsEl.value) || 0;
  let savings = parseInt(savingsEl.value) || 0;

  if (activeSlider === 'needs') {
    let remaining = 100 - needs;
    let otherSum = wants + savings;
    if (otherSum === 0) {
      wants = Math.round(remaining / 2);
      savings = remaining - wants;
    } else {
      wants = Math.round(remaining * (wants / otherSum));
      savings = remaining - wants;
    }
  } else if (activeSlider === 'wants') {
    let remaining = 100 - wants;
    let otherSum = needs + savings;
    if (otherSum === 0) {
      needs = Math.round(remaining / 2);
      savings = remaining - needs;
    } else {
      needs = Math.round(remaining * (needs / otherSum));
      savings = remaining - needs;
    }
  } else if (activeSlider === 'savings') {
    let remaining = 100 - savings;
    let otherSum = needs + wants;
    if (otherSum === 0) {
      needs = Math.round(remaining / 2);
      wants = remaining - needs;
    } else {
      needs = Math.round(remaining * (needs / otherSum));
      wants = remaining - needs;
    }
  }

  // Clamp
  if (needs < 0) needs = 0;
  if (wants < 0) wants = 0;
  if (savings < 0) savings = 0;

  // Guarantee exactly 100%
  const total = needs + wants + savings;
  if (total !== 100) {
    const diff = 100 - total;
    if (activeSlider === 'needs') {
      if (wants + diff >= 0) wants += diff; else savings += diff;
    } else if (activeSlider === 'wants') {
      if (needs + diff >= 0) needs += diff; else savings += diff;
    } else {
      if (needs + diff >= 0) needs += diff; else wants += diff;
    }
  }

  needsEl.value = needs;
  wantsEl.value = wants;
  savingsEl.value = savings;

  document.getElementById('label-needs').textContent = needs + '%';
  document.getElementById('label-wants').textContent = wants + '%';
  document.getElementById('label-savings').textContent = savings + '%';

  const badge = document.getElementById('split-total-badge');
  badge.textContent = `100% (Valid)`;
  badge.className = 'split-total-badge valid';
  
  const onboardBtn = document.getElementById('onboard-submit-1');
  if (onboardBtn) onboardBtn.disabled = false;
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

  // Sync notifications preferences checkboxes
  if (state.preferences && state.preferences.notifications) {
    const overspendEl = document.getElementById('pref-alert-overspend');
    if (overspendEl) overspendEl.checked = !!state.preferences.notifications.overspend;
    
    const renewalEl = document.getElementById('pref-alert-renewal');
    if (renewalEl) renewalEl.checked = !!state.preferences.notifications.renewal;

    const phoneEl = document.getElementById('settings-phone');
    if (phoneEl) phoneEl.value = state.preferences.notifications.phoneNumber || '';
  }
  syncSavingsThresholdToAndroid();

  // Sync walkthrough tooltips preferences
  const showTooltips = state.preferences && state.preferences.showTooltips !== false;
  const tourCompleted = state.preferences && state.preferences.tourCompleted === true;
  const tooltipToggle = document.getElementById('settings-pref-tooltips');
  if (tooltipToggle) tooltipToggle.checked = showTooltips;

  if (!tourCompleted && showTooltips) {
    document.body.classList.add('show-tour-tooltips');
    if (!tourInitialized) {
      tourInitialized = true;
      document.body.classList.add('tour-active');
      setTimeout(() => {
        startWalkthroughTour();
      }, 200);
    }
  } else {
    document.body.classList.remove('show-tour-tooltips');
    document.body.classList.remove('tour-active');
    document.querySelectorAll('.tour-tooltip-card').forEach(card => {
      card.classList.remove('active-step');
    });
    tourInitialized = false;
  }
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
  if (typeof updateTourOnTabSwitch === 'function') {
    updateTourOnTabSwitch(tabId);
  }
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

  // Uncategorized alert banner
  const uncatList = state.expenses.filter(x => x.bucket === 'Uncategorized' || x.category === 'Uncategorized');
  if (uncatList.length > 0) {
    const card = document.createElement('div');
    card.className = 'alert-card alert-card-warning';
    card.style.cursor = 'pointer';
    card.style.borderColor = 'var(--color-wants)';
    card.style.background = 'rgba(244, 63, 94, 0.08)';
    card.onclick = () => openUncategorizedModal();
    card.innerHTML = `<i data-lucide="help-circle" style="color:var(--color-wants);"></i> <div class="alert-card-content"><strong>Uncategorized Spend:</strong> You have ${uncatList.length} transaction(s) requiring allocation. Tap here to categorize.</div>`;
    container.appendChild(card);
  }

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

  const baseIncome = state.profile.income;
  const credits = getMonthlyCredits();
  const income = baseIncome + credits;

  const spent = computeMonthlySpent();
  const totalSpent = (spent.Needs || 0) + (spent.Wants || 0);
  const totalSaved = spent.Savings || 0;
  const remaining = income - (totalSpent + totalSaved);

  document.getElementById('dash-monthly-income').textContent = `₹${formatNumber(income)}`;
  document.getElementById('dash-base-income').textContent = `Base: ₹${formatNumber(baseIncome)}`;
  document.getElementById('dash-total-saved').textContent = `₹${formatNumber(totalSaved)}`;
  document.getElementById('dash-total-spent').textContent = `₹${formatNumber(totalSpent)}`;
  
  // Support balance masking
  const showBalance = !state.preferences.hideBalance;
  const balanceText = showBalance ? `₹${formatNumber(remaining)}` : '••••••';
  document.getElementById('dash-remaining-balance').textContent = balanceText;
  
  // Update eye icon state
  const eyeIcon = document.getElementById('balance-toggle-eye');
  if (eyeIcon) {
    eyeIcon.setAttribute('data-lucide', showBalance ? 'eye' : 'eye-off');
  }

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

function toggleLedgerFilters() {
  const filterType = document.getElementById('filter-transaction-type').value;
  const bucketFilter = document.getElementById('filter-bucket');
  const subcatFilter = document.getElementById('filter-subcategory');
  if (filterType === 'income') {
    bucketFilter.style.display = 'none';
    subcatFilter.style.display = 'none';
  } else {
    bucketFilter.style.display = 'inline-block';
    subcatFilter.style.display = 'inline-block';
  }
}

function renderExpenses() {
  const tbody = document.getElementById('expenses-table-body');
  const empty = document.getElementById('expenses-empty-state');
  const table = document.getElementById('expenses-table');
  tbody.innerHTML = '';

  const filterType = document.getElementById('filter-transaction-type').value;
  const filterB = document.getElementById('filter-bucket').value;
  const filterC = document.getElementById('filter-subcategory').value;

  let list = getCurrentMonthTransactions();

  if (filterType === 'expense') {
    list = list.filter(x => x.type !== 'credit');
  } else if (filterType === 'income') {
    list = list.filter(x => x.type === 'credit');
  }

  if (filterType !== 'income') {
    if (filterB !== 'all') {
      if (filterB === 'Savings') {
        list = list.filter(x => x.bucket === 'Savings' && x.type !== 'credit');
      } else {
        list = list.filter(x => x.bucket === filterB);
      }
    }
    
    if (filterC !== 'all') {
      list = list.filter(x => {
        const defaults = CATEGORIES_MAPPING[x.bucket] || [];
        if (filterC === 'Other Needs' || filterC === 'Other Wants' || filterC === 'Other Savings') {
          return !defaults.includes(x.category) || x.category === filterC;
        }
        return x.category === filterC;
      });
    }
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
    const isCredit = exp.type === 'credit';
    const bClass = isCredit ? 'category-needs-badge' : `category-${exp.bucket.toLowerCase()}-badge`;
    const rec = exp.isRecurring ? '<span class="recurring-indicator" title="Recurring"><i data-lucide="repeat" style="width:10px;"></i></span>' : '';
    const inv = exp.isInvestment ? '<span class="recurring-indicator" style="color:var(--color-investments)" title="Investment Asset"><i data-lucide="trending-up" style="width:10px;"></i></span>' : '';
    
    const amtSign = isCredit ? '+' : '-';
    const amtColor = isCredit ? 'var(--color-needs)' : 'var(--text-primary)';
    const bucketLabel = isCredit ? 'Income' : exp.bucket;

    tr.innerHTML = `
      <td data-label="Date">${formatDate(exp.date)}</td>
      <td data-label="Bucket"><span class="category-badge ${bClass}">${bucketLabel}</span></td>
      <td data-label="Category">${exp.category} ${rec} ${inv}</td>
      <td data-label="Note" style="color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${exp.note || '-'}</td>
      <td data-label="Amount" style="font-weight:700; color:${amtColor};">${amtSign}₹${formatNumber(exp.amount)}</td>
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
  showConfirmDialog('Delete Transaction', 'Are you sure you want to delete this transaction permanently?', (confirmed) => {
    if (confirmed) {
      state.expenses = state.expenses.filter(x => x.id !== id);
      saveStateToStorage();
      renderExpenses();
      renderDashboard();
      showToast('Transaction removed', 'warning');
    }
  });
}

// SUBSCRIPTIONS MODALS & CRUD
function openAddSubModal() { 
  editSubId = null;
  document.getElementById('subscription-form').reset();
  document.getElementById('sub-last-used').value = new Date().toISOString().split('T')[0];
  checkCustomSub();
  
  document.getElementById('sub-modal-title').textContent = 'Track Subscription Drain';
  document.getElementById('sub-submit-btn').textContent = 'Track Subscription';
  
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

function openEditSubModal(id) {
  editSubId = id;
  const sub = state.subscriptions.find(s => s.id === id);
  if (!sub) return;
  
  const form = document.getElementById('subscription-form');
  form.reset();
  
  const standardOptions = ['Netflix', 'Prime Video', 'Hotstar', 'Spotify', 'Zee5'];
  if (standardOptions.includes(sub.name)) {
    document.getElementById('sub-name').value = sub.name;
    document.getElementById('sub-custom-name').value = '';
  } else {
    document.getElementById('sub-name').value = 'custom';
    document.getElementById('sub-custom-name').value = sub.name;
  }
  checkCustomSub();
  
  document.getElementById('sub-cost').value = sub.cost;
  document.getElementById('sub-billing-date').value = sub.billingDate;
  document.getElementById('sub-last-used').value = sub.lastUsedDate;
  
  document.getElementById('sub-modal-title').textContent = 'Edit Subscription Details';
  document.getElementById('sub-submit-btn').textContent = 'Save Changes';
  
  document.getElementById('modal-subscription').classList.add('active');
}

function handleSubSubmit(e) {
  e.preventDefault();
  const nameSelect = document.getElementById('sub-name').value;
  const nameCustom = document.getElementById('sub-custom-name').value.trim();
  const cost = parseInt(document.getElementById('sub-cost').value);
  const billingDay = parseInt(document.getElementById('sub-billing-date').value);
  const lastUsed = document.getElementById('sub-last-used').value;

  const name = nameSelect === 'custom' ? nameCustom : nameSelect;
  
  if (editSubId) {
    const sub = state.subscriptions.find(s => s.id === editSubId);
    if (sub) {
      const oldName = sub.name;
      sub.name = name;
      sub.cost = cost;
      sub.billingDate = billingDay;
      sub.lastUsedDate = lastUsed;
      
      // Sync associated auto-logged Wants expense
      const expense = state.expenses.find(x => x.isRecurring && x.note === `Subscription: ${oldName}`);
      if (expense) {
        expense.amount = cost;
        expense.note = `Subscription: ${name}`;
        const currentMonthYear = expense.date.substring(0, 7);
        expense.date = `${currentMonthYear}-${String(billingDay).padStart(2, '0')}`;
      }
      showToast(`${name} subscription updated`, 'success');
    }
  } else {
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
    showToast(`${name} subscription linked`, 'success');
  }

  saveStateToStorage();
  closeAddSubModal();
  renderSubscriptions();
  renderDashboard();
}

function openEditExpenseFromSub(id) {
  switchTab('expenses');
  openEditExpenseModal(id);
}

function deleteExpenseFromSub(id) {
  showConfirmDialog('Delete Expense', 'Are you sure you want to delete this auto-tracked ledger expense?', (confirmed) => {
    if (confirmed) {
      state.expenses = state.expenses.filter(x => x.id !== id);
      saveStateToStorage();
      renderSubscriptions();
      renderExpenses();
      renderDashboard();
      showToast('Ledger subscription deleted', 'success');
    }
  });
}

function renderSubscriptions() {
  const container = document.getElementById('subscriptions-container');
  const empty = document.getElementById('subscriptions-empty-state');
  container.innerHTML = '';

  // Compile merged subscriptions list
  const subs = [...state.subscriptions];
  const today = new Date();
  
  state.expenses.forEach(x => {
    // Only current month expenses that are recurring or subscription categories
    const d = new Date(x.date);
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
      if (x.isRecurring || x.category === 'OTT Subscriptions' || (x.note && x.note.toLowerCase().includes('subscription'))) {
        let name = x.note || x.category;
        if (name.startsWith('Subscription: ')) name = name.replace('Subscription: ', '');
        if (name.startsWith('AutoSMS: ')) name = name.replace('AutoSMS: ', '');
        
        const exists = subs.some(s => s.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          subs.push({
            id: x.id,
            name: name,
            cost: x.amount,
            billingDate: new Date(x.date).getDate(),
            lastUsedDate: x.date,
            isFromExpenses: true
          });
        }
      }
    }
  });

  if (subs.length === 0) {
    empty.style.display = 'flex';
    document.getElementById('sub-stat-total').textContent = '₹0/mo';
    document.getElementById('sub-stat-forgotten').textContent = '0';
    document.getElementById('sub-stat-renewal').textContent = 'None';
    document.getElementById('sub-stat-renewal-countdown').textContent = 'No active bills';
    return;
  }
  empty.style.display = 'none';

  // Stats
  const total = subs.reduce((acc, s) => acc + s.cost, 0);
  document.getElementById('sub-stat-total').textContent = `₹${formatNumber(total)}/mo`;
  
  // Forgotten check (not used for > 30 days)
  const forgotten = subs.filter(s => {
    const diff = Math.abs(new Date() - new Date(s.lastUsedDate));
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) > 30;
  });
  document.getElementById('sub-stat-forgotten').textContent = forgotten.length;

  // Renewals using the merged list
  const daysInM = getDaysInCurrentMonth();
  const day = today.getDate();
  const upcoming = subs.map(s => {
    let daysLeft = 0;
    if (s.billingDate >= day) daysLeft = s.billingDate - day;
    else daysLeft = (daysInM - day) + s.billingDate;
    return { ...s, daysLeft };
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  if (upcoming.length > 0) {
    document.getElementById('sub-stat-renewal').textContent = upcoming[0].name;
    document.getElementById('sub-stat-renewal-countdown').textContent = `₹${formatNumber(upcoming[0].cost)} due in ${upcoming[0].daysLeft} days`;
  } else {
    document.getElementById('sub-stat-renewal').textContent = 'None';
    document.getElementById('sub-stat-renewal-countdown').textContent = 'No bills in next 30 days';
  }

  subs.forEach(sub => {
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
    
    // Add ledger tracker badge
    const originBadge = sub.isFromExpenses 
      ? `<span class="forgotten-badge" style="background:rgba(99,102,241,0.12); color:var(--color-accent); border:1px solid rgba(99,102,241,0.2);"><i data-lucide="receipt" style="width:10px; height:10px;"></i> Ledger Auto</span>`
      : '';

    // If it is from expenses, edit/delete applies to the ledger expense item
    const editClick = sub.isFromExpenses ? `openEditExpenseFromSub('${sub.id}')` : `openEditSubModal('${sub.id}')`;
    const deleteClick = sub.isFromExpenses ? `deleteExpenseFromSub('${sub.id}')` : `deleteSub('${sub.id}')`;

    card.innerHTML = `
      <div class="sub-header">
        <div class="sub-logo-title">
          <div class="sub-logo ${lClass}">${sl}</div>
          <div class="sub-title">
            <h4 style="display:flex; align-items:center; gap:0.4rem;">${sub.name}</h4>
            <span>Billing Day: ${ordinalSuffixOf(sub.billingDate)}</span>
          </div>
        </div>
        <div class="table-actions">
          <button class="btn-table btn-table-edit" onclick="${editClick}"><i data-lucide="edit-3" style="width:16px;"></i></button>
          <button class="btn-table btn-table-delete" onclick="${deleteClick}"><i data-lucide="trash-2" style="width:16px;"></i></button>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="sub-cost">₹${formatNumber(sub.cost)}<span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">/mo</span></span>
        <div style="display:flex; gap:0.25rem;">
          ${badge}
          ${originBadge}
        </div>
      </div>
      <div class="sub-meta">
        <div style="display:flex; justify-content:space-between;"><span>Last Accessed:</span><span>${formatDate(sub.lastUsedDate)}</span></div>
      </div>
      <button class="btn btn-secondary" style="padding:0.4rem; font-size:0.75rem; margin-top:0.25rem;" onclick="logSubActivity('${sub.id}', ${!!sub.isFromExpenses})">
        <i data-lucide="check" style="width:12px;"></i> Mark Used Today
      </button>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function logSubActivity(id, isFromExpenses = false) {
  if (isFromExpenses) {
    const exp = state.expenses.find(x => x.id === id);
    if (exp) {
      exp.date = new Date().toISOString().split('T')[0];
      saveStateToStorage();
      renderSubscriptions();
      renderExpenses();
      showToast(`Access logged for ${exp.note || exp.category} (Ledger)`, 'success');
    }
  } else {
    const sub = state.subscriptions.find(s => s.id === id);
    if (sub) {
      sub.lastUsedDate = new Date().toISOString().split('T')[0];
      saveStateToStorage();
      renderSubscriptions();
      showToast(`Access logged for ${sub.name}`, 'success');
    }
  }
}

function deleteSub(id) {
  showConfirmDialog('Delete Subscription', 'Are you sure you want to stop tracking this subscription?', (confirmed) => {
    if (confirmed) {
      state.subscriptions = state.subscriptions.filter(s => s.id !== id);
      saveStateToStorage();
      renderSubscriptions();
      renderDashboard();
      showToast('Subscription removed', 'warning');
    }
  });
}

// SAVINGS GOALS MODALS & CRUD
function openAddGoalModal() { 
  editGoalId = null;
  document.getElementById('goal-form').reset();
  
  document.getElementById('goal-modal-title').textContent = 'Create Named Savings Goal';
  document.getElementById('goal-submit-btn').textContent = 'Create Goal';
  
  document.getElementById('modal-goal').classList.add('active'); 
}

function closeAddGoalModal() { 
  document.getElementById('modal-goal').classList.remove('active'); 
}

function openEditGoalModal(id) {
  editGoalId = id;
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  
  const form = document.getElementById('goal-form');
  form.reset();
  
  document.getElementById('goal-name').value = goal.name;
  document.getElementById('goal-target').value = goal.target;
  document.getElementById('goal-split-pct').value = goal.linkedSplitPercent;
  
  document.getElementById('goal-modal-title').textContent = 'Edit Savings Goal';
  document.getElementById('goal-submit-btn').textContent = 'Save Changes';
  
  document.getElementById('modal-goal').classList.add('active');
}

function handleGoalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('goal-name').value.trim();
  const target = parseInt(document.getElementById('goal-target').value);
  const split = parseInt(document.getElementById('goal-split-pct').value);

  const otherGoals = editGoalId ? state.goals.filter(g => g.id !== editGoalId) : state.goals;
  const activeSplits = otherGoals.reduce((acc, g) => acc + g.linkedSplitPercent, 0);
  if (activeSplits + split > 100) {
    showToast(`Capacity overflow. Remaining: ${100 - activeSplits}%`, 'danger');
    return;
  }

  if (editGoalId) {
    const goal = state.goals.find(g => g.id === editGoalId);
    if (goal) {
      const oldName = goal.name;
      goal.name = name;
      goal.target = target;
      goal.linkedSplitPercent = split;
      
      // Sync associated contributions
      state.expenses.forEach(x => {
        if (x.bucket === 'Savings' && x.note && x.note.includes(`Goal Injection: ${oldName}`)) {
          x.note = x.note.replace(`Goal Injection: ${oldName}`, `Goal Injection: ${name}`);
        }
      });
      showToast(`Savings target "${name}" updated`, 'success');
    }
  } else {
    state.goals.push({ id: generateId(), name, target, linkedSplitPercent: split, createdAt: new Date().toISOString().split('T')[0] });
    showToast(`Savings target "${name}" created`, 'success');
  }

  saveStateToStorage();
  closeAddGoalModal();
  renderGoals();
  renderDashboard();
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
        <div class="table-actions">
          <button class="btn-table btn-table-edit" onclick="openEditGoalModal('${goal.id}')"><i data-lucide="edit-3" style="width:16px;"></i></button>
          <button class="btn-table btn-table-delete" onclick="deleteGoal('${goal.id}')"><i data-lucide="trash-2" style="width:16px;"></i></button>
        </div>
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
  showPromptDialog('Add Extra Saving', `Enter extra savings amount for "${goal.name}" (₹):`, (amt) => {
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
  });
}

function deleteGoal(id) {
  showConfirmDialog('Delete Savings Target', 'Are you sure you want to delete this savings goal?', (confirmed) => {
    if (confirmed) {
      state.goals = state.goals.filter(g => g.id !== id);
      saveStateToStorage();
      renderGoals();
      renderDashboard();
      showToast('Goal removed', 'warning');
    }
  });
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

  const needsColor = theme === 'dark' ? '#a3e635' : '#16a34a';
  const savingsColor = theme === 'dark' ? '#06b6d4' : '#0891b2';
  const wantsColor = theme === 'dark' ? '#f43f5e' : '#db2777';

  personalCharts.investment = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#6366f1', needsColor, savingsColor, '#f97316', '#db2777', wantsColor, '#64748b'],
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

  const needsColor = theme === 'dark' ? '#a3e635' : '#16a34a';
  const wantsColor = theme === 'dark' ? '#f43f5e' : '#db2777';
  const savingsColor = theme === 'dark' ? '#06b6d4' : '#0891b2';
  
  const needsColorLight = theme === 'dark' ? 'rgba(163,230,53,0.18)' : 'rgba(22,163,74,0.18)';
  const wantsColorLight = theme === 'dark' ? 'rgba(244,63,94,0.18)' : 'rgba(219,39,119,0.18)';
  const savingsColorLight = theme === 'dark' ? 'rgba(6,182,212,0.18)' : 'rgba(8,145,178,0.18)';

  const income = state.profile.income;
  const spent = computeMonthlySpent();

  // Destroy previous instances
  if (personalCharts.allocation) personalCharts.allocation.destroy();
  if (personalCharts.subcat) personalCharts.subcat.destroy();
  if (personalCharts.mom) personalCharts.mom.destroy();

  // 1. Target vs Spent Grouped Bar Chart
  const splits = state.profile.budgetSplits;
  personalCharts.allocation = new Chart(document.getElementById('chart-allocation').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Needs', 'Wants', 'Savings'],
      datasets: [
        {
          label: 'Target Limit (₹)',
          data: [
            Math.round(income * (splits.needs / 100)),
            Math.round(income * (splits.wants / 100)),
            Math.round(income * (splits.savings / 100))
          ],
          backgroundColor: [needsColorLight, wantsColorLight, savingsColorLight],
          borderColor: [needsColor, wantsColor, savingsColor],
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Actual Spent (₹)',
          data: [spent.Needs, spent.Wants, spent.Savings],
          backgroundColor: [needsColor, wantsColor, savingsColor],
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
        legend: { position: 'bottom', labels: { color: labelColor, font: { size: 11 } } } 
      },
      scales: {
        x: { ticks: { color: labelColor }, grid: { display: false } },
        y: { ticks: { color: labelColor }, grid: { color: gridColor } }
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
        { label: 'Needs', data: momData.needs, backgroundColor: needsColor },
        { label: 'Wants', data: momData.wants, backgroundColor: wantsColor },
        { label: 'Savings', data: momData.savings, backgroundColor: savingsColor }
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
      <td data-label="Budget Category" style="font-weight:600;">${b}</td>
      <td data-label="Target Split">${splits[b.toLowerCase()]}%</td>
      <td data-label="Target Budget">₹${formatNumber(targetAmt)}</td>
      <td data-label="Actual Spent" style="font-weight:700;">₹${formatNumber(actualAmt)}</td>
      <td data-label="Actual Split %">${actualPct}%</td>
      <td data-label="Variance Status" style="color:${varColor}; font-weight:700;">${varText}</td>
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

function updateSettingsSliders(activeSlider = 'needs') {
  let nEl = document.getElementById('slider-settings-needs');
  let wEl = document.getElementById('slider-settings-wants');
  let sEl = document.getElementById('slider-settings-savings');
  
  let n = parseInt(nEl.value) || 0;
  let w = parseInt(wEl.value) || 0;
  let s = parseInt(sEl.value) || 0;

  if (activeSlider === 'needs') {
    let remaining = 100 - n;
    let otherSum = w + s;
    if (otherSum === 0) {
      w = Math.round(remaining / 2);
      s = remaining - w;
    } else {
      w = Math.round(remaining * (w / otherSum));
      s = remaining - w;
    }
  } else if (activeSlider === 'wants') {
    let remaining = 100 - w;
    let otherSum = n + s;
    if (otherSum === 0) {
      n = Math.round(remaining / 2);
      s = remaining - n;
    } else {
      n = Math.round(remaining * (n / otherSum));
      s = remaining - n;
    }
  } else if (activeSlider === 'savings') {
    let remaining = 100 - s;
    let otherSum = n + w;
    if (otherSum === 0) {
      n = Math.round(remaining / 2);
      w = remaining - n;
    } else {
      n = Math.round(remaining * (n / otherSum));
      w = remaining - n;
    }
  }

  // Clamp
  if (n < 0) n = 0;
  if (w < 0) w = 0;
  if (s < 0) s = 0;

  // Guarantee exactly 100%
  const total = n + w + s;
  if (total !== 100) {
    const diff = 100 - total;
    if (activeSlider === 'needs') {
      if (w + diff >= 0) w += diff; else s += diff;
    } else if (activeSlider === 'wants') {
      if (n + diff >= 0) n += diff; else s += diff;
    } else {
      if (n + diff >= 0) n += diff; else w += diff;
    }
  }

  nEl.value = n;
  wEl.value = w;
  sEl.value = s;

  document.getElementById('label-settings-needs').textContent = n + '%';
  document.getElementById('label-settings-wants').textContent = w + '%';
  document.getElementById('label-settings-savings').textContent = s + '%';

  const badge = document.getElementById('settings-split-total');
  badge.textContent = `100% (Valid)`;
  badge.className = 'split-total-badge valid';
  
  const saveBtn = document.querySelector('button[onclick="saveSettingsSplits()"]');
  if (saveBtn) saveBtn.disabled = false;
}

function saveNotificationPreferences() {
  const phone = document.getElementById('settings-phone').value.trim();
  state.preferences.notifications = {
    overspend: document.getElementById('pref-alert-overspend').checked,
    renewal: document.getElementById('pref-alert-renewal').checked,
    goals: (state.preferences.notifications && state.preferences.notifications.goals) || false,
    phoneNumber: phone
  };
  saveStateToStorage();
  updateAlertsBanner();
  syncSavingsThresholdToAndroid();
  showToast('Alert preferences saved', 'success');
}

function syncSavingsThresholdToAndroid() {
  if (window.AndroidBridge && state.profile) {
    const income = state.profile.income || 0;
    const splitPct = state.profile.budgetSplits ? state.profile.budgetSplits.savings : 20;
    const savingsTarget = Math.round(income * (splitPct / 100));
    const phone = (state.preferences.notifications && state.preferences.notifications.phoneNumber) || '';
    window.AndroidBridge.updateSavingsThreshold(income, savingsTarget, phone);
  }
}

function triggerLedgerReset() {
  showConfirmDialog('Reset Database', 'CAUTION: This will permanently delete ALL registration data and history. Proceed?', (confirmed) => {
    if (confirmed) {
      localStorage.clear();
      window.location.reload();
    }
  });
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
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && x.type !== 'credit';
  });
}

function getMonthlyCredits() {
  const today = new Date();
  return state.expenses.filter(x => {
    const d = new Date(x.date);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && x.type === 'credit';
  }).reduce((acc, x) => acc + x.amount, 0);
}

function getCurrentMonthTransactions() {
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

// ONBOARDING WALKTHROUGH TOUR TOOLTIPS
let currentTourStep = 1;
let tourInitialized = false;

function startWalkthroughTour() {
  currentTourStep = 1;
  tourInitialized = true;
  document.body.classList.add('tour-active');
  showTourStep(1);
}

function showTourStep(step) {
  // Remove active-step from all cards
  document.querySelectorAll('.tour-tooltip-card').forEach(card => {
    card.classList.remove('active-step');
  });

  const showTooltips = state.preferences && state.preferences.showTooltips !== false;
  const tourCompleted = state.preferences && state.preferences.tourCompleted === true;
  if (!showTooltips || tourCompleted || !tourInitialized) return;

  const stepTabs = {
    1: 'dashboard',
    2: 'dashboard',
    3: 'expenses',
    4: 'subscriptions',
    5: 'goals',
    6: 'investments',
    7: 'insights',
    8: 'report',
    9: 'settings'
  };

  const targetTabId = stepTabs[step];
  if (targetTabId) {
    const tabEl = document.getElementById(`tab-${targetTabId}`);
    const isTabActive = tabEl && tabEl.classList.contains('active');
    if (!isTabActive) {
      switchTab(targetTabId);
    }
    setTimeout(() => {
      const card = document.getElementById(`tour-step-${step}`);
      if (card) {
        card.classList.remove('dismissed');
        card.classList.add('active-step');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }
}

function dismissWalkthroughTooltip(e) {
  if (e) e.stopPropagation();
  
  // Dismiss current step
  const card = document.getElementById(`tour-step-${currentTourStep}`);
  if (card) {
    card.classList.add('dismissed');
  }

  if (currentTourStep >= 1 && currentTourStep < 9) {
    currentTourStep++;
    showTourStep(currentTourStep);
  } else if (currentTourStep === 9) {
    completeWalkthroughTour();
  }
}

function completeWalkthroughTour() {
  if (!state.preferences) state.preferences = {};
  state.preferences.tourCompleted = true;
  saveStateToStorage();
  
  // Clean up all classes
  document.querySelectorAll('.tour-tooltip-card').forEach(card => {
    card.classList.remove('active-step');
    card.classList.remove('dismissed');
  });
  document.body.classList.remove('show-tour-tooltips');
  document.body.classList.remove('tour-active');
  tourInitialized = false;
  
  // Return to dashboard
  const dashboardTab = document.getElementById('tab-dashboard');
  if (dashboardTab && !dashboardTab.classList.contains('active')) {
    switchTab('dashboard');
  }
  showToast('Onboarding walkthrough completed!', 'success');
}

function toggleWalkthroughTooltips() {
  const checkbox = document.getElementById('settings-pref-tooltips');
  if (!state.preferences) state.preferences = {};
  state.preferences.showTooltips = checkbox.checked;
  
  if (state.preferences.showTooltips) {
    state.preferences.tourCompleted = false;
    document.querySelectorAll('.tour-tooltip-card').forEach(card => {
      card.classList.remove('dismissed');
      card.classList.remove('active-step');
    });
    document.body.classList.add('show-tour-tooltips');
    showToast('Walkthrough tooltips enabled. Starting demo tour!', 'info');
    startWalkthroughTour();
  } else {
    document.body.classList.remove('show-tour-tooltips');
    document.body.classList.remove('tour-active');
    document.querySelectorAll('.tour-tooltip-card').forEach(card => {
      card.classList.remove('active-step');
    });
    tourInitialized = false;
    showToast('Walkthrough tooltips disabled', 'info');
  }
  saveStateToStorage();
}

function updateTourOnTabSwitch(tabId) {
  const showTooltips = state.preferences && state.preferences.showTooltips !== false;
  const tourCompleted = state.preferences && state.preferences.tourCompleted === true;
  if (!showTooltips || tourCompleted || !tourInitialized) return;

  const tabSteps = {
    dashboard: currentTourStep === 2 ? 2 : 1,
    expenses: 3,
    subscriptions: 4,
    goals: 5,
    investments: 6,
    insights: 7,
    report: 8,
    settings: 9
  };

  const targetStep = tabSteps[tabId];
  if (targetStep !== undefined) {
    currentTourStep = targetStep;
    showTourStep(targetStep);
  } else {
    // Hide tooltips on any other tab
    document.querySelectorAll('.tour-tooltip-card').forEach(card => {
      card.classList.remove('active-step');
    });
  }
}

// PRIVACY MASKING FOR GRAND BALANCE
function toggleBalanceVisibility() {
  if (!state.preferences) state.preferences = {};
  state.preferences.hideBalance = !state.preferences.hideBalance;
  saveStateToStorage();
  renderDashboard();
  lucide.createIcons();
}

// ==================== SIMULATED BANK APP NOTIFICATION LISTENER FEATURE ====================

// Active overlay state variables
let currentOverlayNotifId = null;
let overlayDismissTimeout = null;
let overlayTimerInterval = null;
let overlayTimeRemaining = 5;

// JS regular expression bank transaction notification parsers
const BankParsersJS = {
  parse(pkg, bankLabel, text) {
    const textClean = text.replace(/\s+/g, ' ');
    if (pkg.includes('sbi')) return this.parseSBI(textClean, bankLabel);
    if (pkg.includes('hdfc')) return this.parseHDFC(textClean, bankLabel);
    if (pkg.includes('canara')) return this.parseCanara(textClean, bankLabel);
    return null;
  },

  parseCanara(text, bankLabel) {
    const amtMatch = text.match(/INR\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));

    let type = null;
    if (/\bDEBITED\b|\bDr\.?\b/i.test(text)) type = 'debit';
    else if (/\bCREDITED\b|\bCr\.?\b/i.test(text)) type = 'credit';
    if (!type) return null;

    let reason = null;
    const r1 = text.match(/towards\s+([^.]+)/i);
    const r2 = text.match(/\bto\s+([A-Za-z0-9 &._-]+?)\s*;/i);
    if (r1) reason = r1[1].trim();
    else if (r2) reason = r2[1].trim();

    let availBal = null;
    const b1 = text.match(/(?:Total\s+)?Avail\.?bal\s+INR\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const b2 = text.match(/\bBal\s+INR\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (b1) availBal = parseFloat(b1[1].replace(/,/g, ''));
    else if (b2) availBal = parseFloat(b2[1].replace(/,/g, ''));

    return { amount, type, reason, availableBalance: availBal, bank: bankLabel, timestamp: Date.now() };
  },

  parseHDFC(text, bankLabel) {
    const amtMatch = text.match(/(?:Rs\.?|INR)\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));

    let type = null;
    if (/\bSent\b|\bdebited\b/i.test(text)) type = 'debit';
    else if (/\bcredited\b|\bdeposited\b/i.test(text)) type = 'credit';
    if (!type) return null;

    let reason = null;
    const r1 = text.match(/\bTo\s+([A-Za-z0-9 .&_-]+?)\s+On\b/i);
    const r2 = text.match(/from\s+VPA\s+([A-Za-z0-9.@_-]+)/i);
    if (r1) reason = r1[1].trim();
    else if (r2) reason = r2[1].trim();

    return { amount, type, reason, availableBalance: null, bank: bankLabel, timestamp: Date.now() };
  },

  parseSBI(text, bankLabel) {
    let type = null;
    if (/\bdebited\b/i.test(text)) type = 'debit';
    else if (/\bcredited\b/i.test(text)) type = 'credit';
    if (!type) return null;

    const amtMatch = text.match(/(?:debited|credited)\s+by\s+(?:Rs\.?|INR)?\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));

    let reason = null;
    const r1 = text.match(/trf to\s+([A-Za-z0-9 .&_-]+?)\s+If\b/i);
    const r2 = text.match(/transfer from\s+([A-Za-z0-9 .&_-]+?)\s*-SBI/i);
    if (r1) reason = r1[1].trim();
    else if (r2) reason = r2[1].trim();

    return { amount, type, reason, availableBalance: null, bank: bankLabel, timestamp: Date.now() };
  }
};

const mockSamples = {
  "com.sbi.SBIFreedomPlus": {
    title: "SBI Transaction Alert",
    text: "Dear UPI user A/C X5336 debited by 45.00 on date 18Apr26 trf to Ayushman Anand If not u? call-..."
  },
  "com.snapwork.hdfc": {
    title: "HDFC Credit Alert",
    text: "Credit Alert! Rs.3000.00 credited to HDFC Bank A/c XX1436 on 25-06-26 from VPA 7099342154@ptyes (UPI 309390218302)"
  },
  "com.canarabank.mobility": {
    title: "Canara Bank Dr Notification",
    text: "Acct XXX293 Dr. INR 80.00 on 30/06/26 to JUSTVEND PRI; UPI: 618122692200; Bal INR 19.54.Not you?SMS BLOCKUPI to..."
  }
};

function openMockNotifDialog() {
  document.getElementById('modal-mock-notif').classList.add('active');
  fillSampleNotifText();
}

function closeMockNotifDialog() {
  document.getElementById('modal-mock-notif').classList.remove('active');
}

function fillSampleNotifText() {
  const pkg = document.getElementById('mock-notif-pkg').value;
  const sample = mockSamples[pkg];
  if (sample) {
    document.getElementById('mock-notif-title').value = sample.title;
    document.getElementById('mock-notif-text').value = sample.text;
  }
}

function triggerMockNotifListener() {
  const pkg = document.getElementById('mock-notif-pkg').value;
  const title = document.getElementById('mock-notif-title').value;
  const text = document.getElementById('mock-notif-text').value;
  const offset = parseInt(document.getElementById('mock-notif-timestamp-offset').value) || 0;
  
  closeMockNotifDialog();
  
  const bankPackages = {
    "com.sbi.SBIFreedomPlus": "SBI",
    "com.snapwork.hdfc": "HDFC",
    "com.canarabank.mobility": "Canara"
  };
  const bankLabel = bankPackages[pkg];
  if (!bankLabel) return;

  const fullText = `${title} ${text}`;
  const txn = BankParsersJS.parse(pkg, bankLabel, fullText);
  if (!txn) {
    showToast('Failed to parse bank app notification text format.', 'danger');
    return;
  }
  
  txn.timestamp = Date.now() + offset;
  onSimulatedAppNotificationPosted(txn);
}

function onSimulatedAppNotificationPosted(txn) {
  const bucket = Math.floor(txn.timestamp / 120000);
  const key = `${txn.amount}-${txn.type}-${bucket}`;
  
  // Dedupe logic
  const isDuplicate = state.expenses.some(x => {
    if (x.dedupeKey === key) return true;
    if (x.amount === txn.amount) {
      const xType = x.bucket === 'Savings' ? 'credit' : 'debit';
      if (xType === txn.type) {
        const timeDiff = Math.abs(new Date(x.date).getTime() - txn.timestamp);
        return timeDiff <= 120000;
      }
    }
    return false;
  });

  if (isDuplicate) {
    showToast(`Dedupe filter: Ignored duplicate notification for ₹${formatNumber(txn.amount)}`, 'warning');
    return;
  }

  // Auto-skip patterns check (interest, refund, reversal, cashback)
  const autoSkipPatterns = ["interest", "refund", "reversal", "cashback"];
  const autoCategory = txn.reason ? autoSkipPatterns.find(pat => txn.reason.toLowerCase().includes(pat)) : null;

  if (autoCategory) {
    const id = generateId();
    const expenseDate = new Date(txn.timestamp).toISOString().split('T')[0];
    const category = 'Other Income';
    const expenseObj = {
      id,
      amount: txn.amount,
      bucket: txn.type === 'credit' ? 'Savings' : 'Needs',
      category,
      date: expenseDate,
      note: `Auto-filed: ${txn.reason || txn.bank}`,
      isRecurring: false,
      dedupeKey: key,
      timestamp: txn.timestamp
    };
    state.expenses.push(expenseObj);
    saveStateToStorage();
    renderAll();
    
    simulateWorkManagerSync(expenseObj);
    showToast(`Auto-filed notification: ₹${formatNumber(txn.amount)} (${category})`, 'success');
  } else {
    // 1. Create entry as Uncategorized first
    const id = generateId();
    const expenseDate = new Date(txn.timestamp).toISOString().split('T')[0];
    const tempTxn = {
      id,
      amount: txn.amount,
      bucket: txn.type === 'credit' ? 'Savings' : 'Wants',
      category: 'Uncategorized',
      date: expenseDate,
      note: txn.reason ? `AppNotif: ${txn.reason.replace(/\s+/g, ' ')}` : `AppNotif: ${txn.bank} Alert`,
      isRecurring: false,
      dedupeKey: key,
      timestamp: txn.timestamp
    };
    state.expenses.push(tempTxn);
    saveStateToStorage();
    renderAll();

    // 2. Launch overlay
    launchOverlayNotifPopup(id, txn.amount, txn.type, txn.reason || txn.bank);
  }
}

function launchOverlayNotifPopup(id, amount, type, reason) {
  clearOverlayTimer();

  currentOverlayNotifId = id;
  overlayTimeRemaining = 5;

  document.getElementById('overlay-notif-bank').textContent = reason.includes('Bank') ? reason : `${reason} Alert`;
  document.getElementById('overlay-notif-amount').textContent = `₹${formatNumber(amount)} ${type === 'debit' ? 'spent' : 'received'}`;
  document.getElementById('overlay-notif-reason').textContent = `Source: ${reason}`;
  
  document.getElementById('overlay-notif-timer').textContent = overlayTimeRemaining;

  const popup = document.getElementById('overlay-notif-popup');
  popup.style.display = 'flex';
  lucide.createIcons();

  overlayTimerInterval = setInterval(() => {
    overlayTimeRemaining--;
    document.getElementById('overlay-notif-timer').textContent = overlayTimeRemaining;
    if (overlayTimeRemaining <= 0) {
      clearInterval(overlayTimerInterval);
    }
  }, 1000);

  overlayDismissTimeout = setTimeout(() => {
    closeOverlayNotifPopup();
    showToast('Notification ignored. Saved as Uncategorized.', 'warning');
  }, 5000);
}

function categorizeOverlayNotif(bucketName) {
  clearOverlayTimer();
  
  const id = currentOverlayNotifId;
  if (id) {
    const txn = state.expenses.find(x => x.id === id);
    if (txn) {
      txn.bucket = bucketName;
      if (bucketName === 'Needs') txn.category = 'Other Needs';
      else if (bucketName === 'Wants') txn.category = 'Other Wants';
      else if (bucketName === 'Savings') txn.category = 'Other Savings';
      
      saveStateToStorage();
      renderAll();
      
      simulateWorkManagerSync(txn);
      showToast(`Transaction categorized as ${bucketName}`, 'success');
    }
  }
  closeOverlayNotifPopup();
}

function closeOverlayNotifPopup() {
  const popup = document.getElementById('overlay-notif-popup');
  if (popup) popup.style.display = 'none';
  currentOverlayNotifId = null;
}

function clearOverlayTimer() {
  if (overlayDismissTimeout) {
    clearTimeout(overlayDismissTimeout);
    overlayDismissTimeout = null;
  }
  if (overlayTimerInterval) {
    clearInterval(overlayTimerInterval);
    overlayTimerInterval = null;
  }
}

function simulateWorkManagerSync(txn) {
  console.log(`[WorkManager SyncWorker] Queueing sync for transaction ID: ${txn.id} (Amount: ₹${txn.amount})...`);
  setTimeout(() => {
    console.log(`[WorkManager SyncWorker] Sync successfully completed for transaction ID: ${txn.id}.`);
  }, 3000);
}

// CUSTOM MODAL DIALOGS HELPERS
let confirmCallback = null;
function showConfirmDialog(title, message, callback) {
  confirmCallback = callback;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('modal-confirm-dialog').classList.add('active');
}

function closeConfirmDialog(result) {
  document.getElementById('modal-confirm-dialog').classList.remove('active');
  if (confirmCallback) {
    confirmCallback(result);
    confirmCallback = null;
  }
}

let promptCallback = null;
function showPromptDialog(title, label, callback) {
  promptCallback = callback;
  document.getElementById('prompt-title').textContent = title;
  document.getElementById('prompt-label').textContent = label;
  document.getElementById('prompt-input').value = '';
  document.getElementById('modal-prompt-dialog').classList.add('active');
}

function closePromptDialog(submitted) {
  document.getElementById('modal-prompt-dialog').classList.remove('active');
  if (promptCallback) {
    if (submitted) {
      const val = parseInt(document.getElementById('prompt-input').value);
      promptCallback(val);
    } else {
      promptCallback(null);
    }
    promptCallback = null;
  }
}

// PULL TO REFRESH INITIATOR
let touchStartY = 0;
let touchMoveY = 0;
let isPTRActive = false;

function initPullToRefresh() {
  const container = document.getElementById('tab-dashboard');
  const indicator = document.getElementById('pull-to-refresh-indicator');
  if (!container || !indicator) return;

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop === 0) {
      touchStartY = e.touches[0].pageY;
      isPTRActive = true;
    } else {
      isPTRActive = false;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isPTRActive) return;
    touchMoveY = e.touches[0].pageY;
    const moveDist = touchMoveY - touchStartY;
    
    if (moveDist > 50) {
      indicator.classList.add('active');
      indicator.querySelector('span').textContent = 'Release to refresh...';
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (!isPTRActive) return;
    const moveDist = touchMoveY - touchStartY;
    
    if (moveDist > 50) {
      indicator.querySelector('span').textContent = 'Syncing...';
      fetchDataFromBackend();
      setTimeout(() => {
        indicator.classList.remove('active');
        touchStartY = 0;
        touchMoveY = 0;
      }, 1000);
    } else {
      indicator.classList.remove('active');
    }
    isPTRActive = false;
  });
}

let activeUncatTxnId = null;

function openUncategorizedModal() {
  const uncatList = state.expenses.filter(x => x.bucket === 'Uncategorized' || x.category === 'Uncategorized');
  if (uncatList.length === 0) {
    closeUncategorizedModal();
    return;
  }
  const item = uncatList[0];
  activeUncatTxnId = item.id;

  document.getElementById('uncat-amount').textContent = `₹${formatNumber(item.amount)}`;
  document.getElementById('uncat-bank').textContent = item.bank || 'SMS/Notification';
  document.getElementById('uncat-note').textContent = item.note || 'Unlabeled Transaction';
  document.getElementById('uncat-date').textContent = formatDate(item.date);

  document.getElementById('modal-uncategorized-resolver').classList.add('active');
}

function closeUncategorizedModal() {
  document.getElementById('modal-uncategorized-resolver').classList.remove('active');
  activeUncatTxnId = null;
}

function resolveUncategorized(bucket) {
  if (!activeUncatTxnId) return;
  const item = state.expenses.find(x => x.id === activeUncatTxnId);
  if (item) {
    item.bucket = bucket;
    if (bucket === 'Needs') item.category = 'Other Needs';
    else if (bucket === 'Wants') item.category = 'Other Wants';
    else if (bucket === 'Savings') item.category = 'Other Savings';
    
    saveStateToStorage();
    showToast(`Transaction categorized as ${bucket}`, 'success');
  }
  
  const uncatList = state.expenses.filter(x => x.bucket === 'Uncategorized' || x.category === 'Uncategorized');
  if (uncatList.length > 0) {
    openUncategorizedModal();
  } else {
    closeUncategorizedModal();
  }
  renderAll();
}

function forceReloadDashboard() {
  fetchDataFromBackend();
}

function openAddIncomeModal() {
  document.getElementById('add-income-amount').value = '';
  document.getElementById('modal-add-income').classList.add('active');
}

function closeAddIncomeModal() {
  document.getElementById('modal-add-income').classList.remove('active');
}

function handleAddIncomeSubmit(e) {
  e.preventDefault();
  const amt = parseInt(document.getElementById('add-income-amount').value);
  if (isNaN(amt) || amt <= 0) return;
  
  state.expenses.push({
    id: generateId(),
    amount: amt,
    type: 'credit',
    bucket: 'Savings',
    category: 'Other Income',
    date: new Date().toISOString().split('T')[0],
    note: 'Manual Income Injection',
    isRecurring: false,
    isInvestment: false
  });
  
  saveStateToStorage();
  closeAddIncomeModal();
  renderAll();
  showToast(`₹${formatNumber(amt)} added to Available Balance`, 'success');
}

function updateCurrentDateDisplay() {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', options);
  const el = document.getElementById('current-date-text');
  if (el) {
    el.textContent = dateStr;
  }
}

function exportReportToPPTX() {
  if (!state.user || !state.user.loggedIn) return;
  const username = state.user.username || '';
  const url = `/api/report/pptx?username=${encodeURIComponent(username)}`;
  window.open(url, '_blank');
  showToast('Downloading PowerPoint report...', 'success');
}

