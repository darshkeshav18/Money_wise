const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.VERCEL ? path.join('/tmp', 'database.json') : path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Load environment variables from .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
    console.log("Loaded environment variables from .env");
  } catch (err) {
    console.error("Error reading local .env file:", err);
  }
}

// Initialize local JSON database (fallback)
if (!fs.existsSync(DB_FILE)) {
  const initialDb = {
    users: [],
    userData: {}
  };
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
  } catch (err) {
    console.error("Could not write initial fallback database.json:", err.message);
  }
}

// Database helpers (supports Vercel KV, GitHub DB, or local database.json)
const isKVPresent = !!process.env.KV_REST_API_URL;
let kv = null;
if (isKVPresent) {
  try {
    kv = require('@vercel/kv').kv;
    console.log("Connected to Vercel KV Database.");
  } catch (err) {
    console.error("Vercel KV package missing, falling back");
  }
}

// GitHub DB Configurations
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'darshkeshav18/Money_wise';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_DB_PATH = 'database.json';
const isGitHubConfigured = !!(GITHUB_TOKEN && GITHUB_TOKEN !== 'your_personal_access_token_here');

if (isGitHubConfigured) {
  console.log(`GitHub database backend enabled targeting repo: ${GITHUB_REPO} (Branch: ${GITHUB_BRANCH})`);
} else {
  console.log("GitHub database backend disabled or token not set. Using local database.json storage.");
}

// Memory Cache to prevent rapid GitHub API calls (rate limiting)
let gitDbCache = null;
let gitDbSha = null;
let lastGitFetchTime = 0;

async function fetchFromGitHub() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}?ref=${GITHUB_BRANCH}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MoneyWise-App'
    }
  });

  if (response.status === 404) {
    const initialDb = { users: [], userData: {} };
    await writeToGitHub(initialDb);
    return initialDb;
  }

  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  gitDbSha = json.sha;
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  const db = JSON.parse(content);
  gitDbCache = db;
  lastGitFetchTime = Date.now();
  return db;
}

async function writeToGitHub(db) {
  const contentBase64 = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
  
  if (!gitDbSha) {
    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}?ref=${GITHUB_BRANCH}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MoneyWise-App'
        }
      });
      if (res.ok) {
        const json = await res.json();
        gitDbSha = json.sha;
      }
    } catch (err) {
      console.error("Error fetching SHA prior to write:", err);
    }
  }

  const body = {
    message: 'Update database.json from MoneyWise API',
    content: contentBase64,
    branch: GITHUB_BRANCH
  };
  if (gitDbSha) {
    body.sha = gitDbSha;
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'MoneyWise-App'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Failed to write database to GitHub: ${await response.text()}`);
  }

  const json = await response.json();
  gitDbSha = json.content.sha;
  gitDbCache = db;
  lastGitFetchTime = Date.now();
}

async function getDatabase() {
  if (isGitHubConfigured) {
    if (gitDbCache && (Date.now() - lastGitFetchTime < 3000)) {
      return gitDbCache;
    }
    try {
      return await fetchFromGitHub();
    } catch (err) {
      console.error("Error fetching database from GitHub, using cache or local fallback:", err);
      if (gitDbCache) return gitDbCache;
    }
  }
  
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { users: [], userData: {} };
  }
}

async function saveDatabase(db) {
  if (isGitHubConfigured) {
    try {
      await writeToGitHub(db);
      return;
    } catch (err) {
      console.error("Error writing database to GitHub:", err);
    }
  }
  
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database to local disk:", err);
  }
}

async function getUsers() {
  if (kv) {
    return (await kv.get('users')) || [];
  } else {
    const db = await getDatabase();
    return db.users || [];
  }
}

async function saveUser(newUser) {
  if (kv) {
    const users = (await kv.get('users')) || [];
    users.push(newUser);
    await kv.set('users', users);
  } else {
    const db = await getDatabase();
    db.users = db.users || [];
    db.users.push(newUser);
    await saveDatabase(db);
  }
}

async function getUserData(username) {
  const lowerUsername = username.toLowerCase().trim();
  if (kv) {
    return await kv.get(`userdata:${lowerUsername}`);
  } else {
    const db = await getDatabase();
    db.userData = db.userData || {};
    return db.userData[lowerUsername] || null;
  }
}

async function saveUserData(username, data) {
  const lowerUsername = username.toLowerCase().trim();
  if (kv) {
    await kv.set(`userdata:${lowerUsername}`, data);
  } else {
    const db = await getDatabase();
    db.userData = db.userData || {};
    db.userData[lowerUsername] = data;
    await saveDatabase(db);
  }
}

async function initializeUserData(username) {
  const initialData = {
    profile: null,
    expenses: [],
    subscriptions: [],
    goals: [],
    preferences: {
      notifications: { overspend: true, renewal: true, goals: true },
      darkMode: true
    }
  };
  await saveUserData(username, initialData);
}

// SHA-256 Password Hash Helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ==================== AUTHENTICATION ROUTES ====================

// Register API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const lowerUsername = username.toLowerCase().trim();
    const users = await getUsers();

    // Check if username already exists
    const exists = users.find(u => u.username.toLowerCase() === lowerUsername);
    if (exists) {
      return res.status(400).json({ error: 'Username already registered' });
    }

    // Save new user
    const newUser = {
      id: Math.random().toString(36).substring(2, 9),
      username: username.trim(),
      email: email ? email.trim() : '',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    await saveUser(newUser);
    await initializeUserData(lowerUsername);
    
    res.status(201).json({ success: true, username: newUser.username });
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const lowerUsername = username.toLowerCase().trim();
    const users = await getUsers();

    const user = users.find(u => u.username.toLowerCase() === lowerUsername);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.status(200).json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// ==================== USER DATA SYNC ROUTES ====================

// Fetch user data
app.get('/api/user/data', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    const username = authHeader.split(' ')[1].toLowerCase().trim();
    const data = await getUserData(username);

    if (!data) {
      return res.status(404).json({ error: 'User data profile not found' });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Get User Data Error:", err);
    res.status(500).json({ error: 'Internal server error fetching user data' });
  }
});

// Save / sync user data
app.post('/api/user/data', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    const username = authHeader.split(' ')[1].toLowerCase().trim();
    const { profile, expenses, subscriptions, goals, preferences } = req.body;

    const currentData = await getUserData(username) || {};

    const updatedData = {
      profile: profile !== undefined ? profile : currentData.profile,
      expenses: expenses !== undefined ? expenses : currentData.expenses,
      subscriptions: subscriptions !== undefined ? subscriptions : currentData.subscriptions,
      goals: goals !== undefined ? goals : currentData.goals,
      preferences: preferences !== undefined ? preferences : currentData.preferences
    };

    await saveUserData(username, updatedData);
    res.status(200).json({ success: true, message: 'Finance data synced successfully' });
  } catch (err) {
    console.error("Sync User Data Error:", err);
    res.status(500).json({ error: 'Internal server error syncing user data' });
  }
});

// Add Single Transaction from Native Android Service
app.post('/api/transaction/add', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    const username = authHeader.split(' ')[1].toLowerCase().trim();
    const { amount, type, category, reason, bank, timestamp } = req.body;

    if (amount === undefined || !type) {
      return res.status(400).json({ error: 'Amount and type are required' });
    }

    // Get current data
    const currentData = await getUserData(username) || { expenses: [], profile: null, subscriptions: [], goals: [], preferences: {} };
    currentData.expenses = currentData.expenses || [];

    // Map bucket & category based on type (credit vs debit)
    const isCredit = type.toLowerCase() === 'credit';
    let bucket = 'Wants';
    let subCategory = 'Other Wants';

    if (isCredit) {
      bucket = 'Savings';
      subCategory = 'Other Income';
    } else {
      const cleanCategory = category ? category.toLowerCase().trim() : '';
      if (cleanCategory === 'uncategorized') {
        bucket = 'Uncategorized';
        subCategory = 'Uncategorized';
      } else if (cleanCategory.startsWith('need')) {
        bucket = 'Needs';
        subCategory = 'Other Needs';
      } else if (cleanCategory.startsWith('want')) {
        bucket = 'Wants';
        subCategory = 'Other Wants';
      } else if (cleanCategory.startsWith('saving')) {
        bucket = 'Savings';
        subCategory = 'Other Savings';
      }
    }

    // Check if an existing transaction matches the same amount, type, and timestamp (within 2-minute window)
    if (timestamp) {
      const targetTime = Number(timestamp);
      const existing = currentData.expenses.find(x => 
        x.amount === Number(amount) && 
        x.type === (isCredit ? 'credit' : 'debit') && 
        x.timestamp && Math.abs(Number(x.timestamp) - targetTime) < 5000
      );

      if (existing) {
        existing.bucket = bucket;
        existing.category = subCategory;
        if (reason) {
          existing.note = reason;
        }
        await saveUserData(username, currentData);
        return res.status(200).json({ success: true, message: 'Transaction updated successfully', expense: existing });
      }
    }

    // Create expense object matching dashboard schema
    const newExpense = {
      id: Math.random().toString(36).substring(2, 9),
      amount: Number(amount),
      note: reason || (isCredit ? 'Credit alert received' : `${bank} transaction`),
      date: new Date(Number(timestamp || Date.now())).toISOString().split('T')[0],
      bucket: bucket,
      category: subCategory,
      type: isCredit ? 'credit' : 'debit',
      timestamp: timestamp ? Number(timestamp) : Date.now()
    };

    currentData.expenses.push(newExpense);
    await saveUserData(username, currentData);

    res.status(200).json({ success: true, message: 'Transaction added successfully', expense: newExpense });
  } catch (err) {
    console.error("Add Transaction API Error:", err);
    res.status(500).json({ error: 'Internal server error adding transaction' });
  }
});

// ==================== ADMIN DECISION ANALYTICS ROUTE ====================

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const users = await getUsers();
    let totalIncome = 0;
    let activeUsersCount = users.length;
    let professionCounts = {};
    let totalSavingsValuation = 0;
    let totalExpensesLogged = 0;
    let categorySpent = {};

    if (kv) {
      const promises = users.map(u => kv.get(`userdata:${u.username.toLowerCase().trim()}`));
      const results = await Promise.all(promises);

      results.forEach(data => {
        if (data && data.profile) {
          totalIncome += Number(data.profile.income) || 0;
          const prof = data.profile.profession || 'Salaried';
          professionCounts[prof] = (professionCounts[prof] || 0) + 1;

          if (Array.isArray(data.expenses)) {
            data.expenses.forEach(exp => {
              if (exp.bucket === 'Savings') {
                totalSavingsValuation += Number(exp.amount) || 0;
              } else {
                totalExpensesLogged += Number(exp.amount) || 0;
                const cat = exp.category || 'Uncategorized';
                categorySpent[cat] = (categorySpent[cat] || 0) + Number(exp.amount);
              }
            });
          }
        }
      });
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const db = JSON.parse(raw);
        const usernames = Object.keys(db.userData);

        usernames.forEach(username => {
          const data = db.userData[username];
          if (data && data.profile) {
            totalIncome += Number(data.profile.income) || 0;
            const prof = data.profile.profession || 'Salaried';
            professionCounts[prof] = (professionCounts[prof] || 0) + 1;

            if (Array.isArray(data.expenses)) {
              data.expenses.forEach(exp => {
                if (exp.bucket === 'Savings') {
                  totalSavingsValuation += Number(exp.amount) || 0;
                } else {
                  totalExpensesLogged += Number(exp.amount) || 0;
                  const cat = exp.category || 'Uncategorized';
                  categorySpent[cat] = (categorySpent[cat] || 0) + Number(exp.amount);
                }
              });
            }
          }
        });
      } catch (err) {
        console.error("Local Analytics read error:", err);
      }
    }

    const avgIncome = activeUsersCount > 0 ? Math.round(totalIncome / activeUsersCount) : 0;
    const categoriesList = Object.keys(categorySpent).map(k => ({
      category: k,
      amount: categorySpent[k]
    })).sort((a, b) => b.amount - a.amount);

    res.status(200).json({
      totalUsers: activeUsersCount,
      avgIncome: avgIncome,
      totalExpenses: totalExpensesLogged,
      totalSavings: totalSavingsValuation,
      professionSplit: professionCounts,
      topCategories: categoriesList.slice(0, 5)
    });
  } catch (err) {
    console.error("Analytics Endpoint Error:", err);
    res.status(500).json({ error: 'Internal server error generating analytics report' });
  }
});

// Fallback index.html route for Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  MoneyWise Backend Engine listening on port ${PORT}`);
  console.log(`  Local Admin view: http://localhost:${PORT}/admin.html`);
  console.log(`====================================================`);
});
