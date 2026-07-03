const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize local JSON database (fallback)
if (!fs.existsSync(DB_FILE)) {
  const initialDb = {
    users: [],
    userData: {}
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
}

// Database helpers (supports Vercel KV when deployed, falls back to database.json locally)
const isKVPresent = !!process.env.KV_REST_API_URL;
let kv = null;
if (isKVPresent) {
  try {
    kv = require('@vercel/kv').kv;
    console.log("Connected to Vercel KV Database.");
  } catch (err) {
    console.error("Vercel KV package missing, falling back to local database.json file");
  }
}

async function getUsers() {
  if (kv) {
    return (await kv.get('users')) || [];
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const db = JSON.parse(raw);
      return db.users || [];
    } catch (err) {
      return [];
    }
  }
}

async function saveUser(newUser) {
  if (kv) {
    const users = (await kv.get('users')) || [];
    users.push(newUser);
    await kv.set('users', users);
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const db = JSON.parse(raw);
      db.users.push(newUser);
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
      console.error("Error saving user:", err);
    }
  }
}

async function getUserData(username) {
  const lowerUsername = username.toLowerCase().trim();
  if (kv) {
    return await kv.get(`userdata:${lowerUsername}`);
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const db = JSON.parse(raw);
      return db.userData[lowerUsername] || null;
    } catch (err) {
      return null;
    }
  }
}

async function saveUserData(username, data) {
  const lowerUsername = username.toLowerCase().trim();
  if (kv) {
    await kv.set(`userdata:${lowerUsername}`, data);
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const db = JSON.parse(raw);
      db.userData[lowerUsername] = data;
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
      console.error("Error saving user data:", err);
    }
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
