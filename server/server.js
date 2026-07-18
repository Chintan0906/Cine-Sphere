const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

let sqlite3;
let sqliteError = null;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (e) {
    sqliteError = e.message + '\n' + e.stack;
    console.error("Failed to load sqlite3:", e);
}

const app = express();

// ✅ FIX 1: Use dynamic PORT (REQUIRED for deployment)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ FIX 2: Serve frontend correctly
app.use(express.static(path.join(__dirname, '../public')));

// ✅ FIX 3: Correct database path with Vercel /tmp fallback
let dbPath = path.join(__dirname, '../database/database.sqlite');
let chatbotDbPath = path.join(__dirname, '../database/chatbot.sqlite');

if (process.env.VERCEL) {
    const tmpDbPath = '/tmp/database.sqlite';
    const tmpChatbotDbPath = '/tmp/chatbot.sqlite';
    const dbDir = path.dirname(tmpDbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    // Copy database to writeable /tmp folder if it doesn't exist
    if (!fs.existsSync(tmpDbPath)) {
        try {
            let srcDb = dbPath;
            if (!fs.existsSync(srcDb)) {
                srcDb = path.join(process.cwd(), 'database/database.sqlite');
            }
            if (!fs.existsSync(srcDb)) {
                srcDb = path.join(process.cwd(), 'database.sqlite');
            }
            if (fs.existsSync(srcDb)) {
                fs.copyFileSync(srcDb, tmpDbPath);
                console.log("Copied template database to /tmp/database.sqlite");
            } else {
                console.warn("Template database file not found at " + dbPath + ", creating empty db");
            }
        } catch (e) {
            console.error("Failed to copy database to /tmp", e);
        }
    }
    dbPath = tmpDbPath;
    chatbotDbPath = tmpChatbotDbPath;
}

// In-Memory Database Fallback Data Structures
let mockUsers = [
    { id: 1, username: "admin", email: "admin@cinesphere.com", password: bcrypt.hashSync("CineSphereAdmin2026!", 10), is_admin: 1 }
];
let mockHistory = [];
let mockReviews = [
    { id: 2, user_id: 2, username: "NebulaWatcher", rating: 4, comment: "Love the snacks ordering portal. Very responsive and smooth animation effects.", created_at: new Date().toISOString() }
];
let mockChats = [];
let mockBookings = [];
let mockSnacks = [];

let db;
let chatbotDb;
if (sqlite3) {
    db = new sqlite3.Database(
        dbPath,
        (err) => {
            if (err) {
                console.error("Error opening database: " + err.message);
            } else {
                console.log("Connected to SQLite database.");

                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    email TEXT UNIQUE,
                    password TEXT,
                    is_admin INTEGER DEFAULT 0
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action_type TEXT,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    rating INTEGER,
                    comment TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    theater TEXT,
                    showtime TEXT,
                    tickets INTEGER,
                    total REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS snacks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    items TEXT,
                    total REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`);

                // Migrate column is_admin if table already exists
                db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, [], (alterErr) => {
                    // Ignore error if column already exists
                });

                // Seed default admin user
                db.get(`SELECT * FROM users WHERE email = ?`, ['admin@cinesphere.com'], async (getErr, row) => {
                    if (!getErr && !row) {
                        const adminPassword = 'CineSphereAdmin2026!';
                        const hashedPassword = await bcrypt.hash(adminPassword, 10);
                        db.run(
                            `INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)`,
                            ['admin', 'admin@cinesphere.com', hashedPassword, 1],
                            (insErr) => {
                                if (insErr) console.error("Failed to seed admin user:", insErr.message);
                                else {
                                    console.log("-----------------------------------------");
                                    console.log("SUCCESSFULLY CREATED ADMIN USER:");
                                    console.log("Email: admin@cinesphere.com");
                                    console.log("Password: CineSphereAdmin2026!");
                                    console.log("-----------------------------------------");
                                }
                            }
                        );
                    }
                });
            }
        }
    );

    chatbotDb = new sqlite3.Database(
        chatbotDbPath,
        (err) => {
            if (err) {
                console.error("Error opening chatbot database: " + err.message);
            } else {
                console.log("Connected to Chatbot SQLite database.");

                chatbotDb.run(`CREATE TABLE IF NOT EXISTS chats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NULL,
                    user_message TEXT,
                    bot_response TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);
            }
        }
    );
} else {
    console.warn("⚠️ SQLite3 module could not be loaded. Falling back to in-memory JSON mock database.");
    db = {
        run: (sql, params, cb) => {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            if (sql.includes("INSERT INTO users")) {
                const [username, email, password] = params;
                if (mockUsers.some(u => u.username === username || u.email === email)) {
                    if (cb) cb(new Error("UNIQUE constraint failed: User already exists"));
                    return;
                }
                const newUser = { id: mockUsers.length + 1, username, email, password };
                mockUsers.push(newUser);
                if (cb) cb.call({ lastID: newUser.id }, null);
                return;
            }
            if (sql.includes("INSERT INTO history")) {
                const [userId, actionType, details] = params;
                let parsedDetails = {};
                try {
                    parsedDetails = typeof details === 'string' ? JSON.parse(details) : details;
                } catch(e) {
                    parsedDetails = details;
                }
                const newHistory = {
                    id: mockHistory.length + 1,
                    user_id: userId,
                    action_type: actionType,
                    details: parsedDetails,
                    created_at: new Date().toISOString()
                };
                mockHistory.push(newHistory);

                // Replicate structured tables inserts in mock database
                if (actionType === 'booking') {
                    mockBookings.push({
                        id: mockBookings.length + 1,
                        user_id: userId,
                        theater: parsedDetails.theater,
                        showtime: parsedDetails.showtime,
                        tickets: parsedDetails.tickets,
                        total: parsedDetails.total,
                        created_at: new Date().toISOString()
                    });
                } else if (actionType === 'snacks') {
                    mockSnacks.push({
                        id: mockSnacks.length + 1,
                        user_id: userId,
                        items: parsedDetails.items,
                        total: parsedDetails.total,
                        created_at: new Date().toISOString()
                    });
                }

                if (cb) cb(null);
                return;
            }
            if (sql.includes("INSERT INTO reviews")) {
                const [userId, rating, comment] = params;
                const newReview = {
                    id: mockReviews.length + 1,
                    user_id: userId,
                    rating: parseInt(rating),
                    comment,
                    created_at: new Date().toISOString()
                };
                mockReviews.push(newReview);

                // Also replicate history logging in reviews mock
                mockHistory.push({
                    id: mockHistory.length + 1,
                    user_id: userId,
                    action_type: 'review',
                    details: { rating: parseInt(rating), comment },
                    created_at: new Date().toISOString()
                });

                if (cb) cb(null);
                return;
            }
            if (cb) cb(null);
        },
        get: (sql, params, cb) => {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            if (sql.includes("FROM users WHERE email =")) {
                const [email] = params;
                const user = mockUsers.find(u => u.email === email);
                if (cb) cb(null, user || null);
                return;
            }
            if (cb) cb(null, null);
        },
        all: (sql, params, cb) => {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            if (sql.includes("FROM history WHERE user_id =")) {
                const [userId] = params;
                const rows = mockHistory.filter(h => h.user_id == userId).map(h => ({
                    ...h,
                    details: typeof h.details === 'string' ? h.details : JSON.stringify(h.details)
                }));
                if (cb) cb(null, rows);
                return;
            }
            if (sql.includes("FROM reviews")) {
                const rows = mockReviews.map(r => {
                    const user = mockUsers.find(u => u.id === r.user_id);
                    return {
                        ...r,
                        username: user ? user.username : (r.username || "CosmicTraveler")
                    };
                });
                rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                if (cb) cb(null, rows);
                return;
            }
            if (cb) cb(null, []);
        }
    };
    chatbotDb = {
        run: (sql, params, cb) => {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            if (sql.includes("INSERT INTO chats")) {
                const [userId, userMessage, botResponse] = params;
                mockChats.push({
                    id: mockChats.length + 1,
                    user_id: userId,
                    user_message: userMessage,
                    bot_response: botResponse,
                    created_at: new Date().toISOString()
                });
            }
            if (cb) cb(null);
        },
        all: (sql, params, cb) => {
            if (typeof params === 'function') {
                cb = params;
                params = [];
            }
            if (cb) cb(null, mockChats);
        }
    };
}

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
            [username, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        return res.status(400).json({ error: "User already exists" });
                    }
                    return res.status(500).json({ error: err.message });
                }

                const userId = this.lastID;

                // Track registration event in database history
                db.run(
                    `INSERT INTO history (user_id, action_type, details) VALUES (?, ?, ?)`,
                    [userId, 'register', JSON.stringify({ message: 'Account registered successfully.' })]
                );

                res.json({ success: true, userId, username, email });
            }
        );
    } catch {
        res.status(500).json({ error: "Server error" });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const match = await bcrypt.compare(password, user.password);

        if (!match) return res.status(401).json({ error: "Invalid credentials" });

        // Track login event in database history
        db.run(
            `INSERT INTO history (user_id, action_type, details) VALUES (?, ?, ?)`,
            [user.id, 'login', JSON.stringify({ message: 'User logged in successfully.' })]
        );

        res.json({
            success: true,
            userId: user.id,
            username: user.username,
            email: user.email,
            isAdmin: !!user.is_admin
        });
    });
});

// Save history
app.post('/api/history', (req, res) => {
    const { userId, actionType, details } = req.body;

    if (!userId || !actionType) {
        return res.status(400).json({ error: "Missing fields" });
    }

    db.run(
        `INSERT INTO history (user_id, action_type, details) VALUES (?, ?, ?)`,
        [userId, actionType, JSON.stringify(details)],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Save to dedicated structured tables
            if (actionType === 'booking') {
                db.run(
                    `INSERT INTO bookings (user_id, theater, showtime, tickets, total) VALUES (?, ?, ?, ?, ?)`,
                    [userId, details.theater, details.showtime, details.tickets, details.total],
                    (dbErr) => { if (dbErr) console.error("Failed to insert into bookings table:", dbErr.message); }
                );
            } else if (actionType === 'snacks') {
                db.run(
                    `INSERT INTO snacks (user_id, items, total) VALUES (?, ?, ?)`,
                    [userId, JSON.stringify(details.items), details.total],
                    (dbErr) => { if (dbErr) console.error("Failed to insert into snacks table:", dbErr.message); }
                );
            }

            res.json({ success: true });
        }
    );
});

// Get history
app.get('/api/history/:userId', (req, res) => {
    db.all(
        `SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC`,
        [req.params.userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const parsed = rows.map(r => ({
                ...r,
                details: JSON.parse(r.details)
            }));

            res.json({ success: true, history: parsed });
        }
    );
});

// Add review
app.post('/api/reviews', (req, res) => {
    const { userId, rating, comment } = req.body;

    if (!userId || !rating || !comment) {
        return res.status(400).json({ error: "Missing fields" });
    }

    db.run(
        `INSERT INTO reviews (user_id, rating, comment) VALUES (?, ?, ?)`,
        [userId, rating, comment],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Also log the review action into history table
            db.run(
                `INSERT INTO history (user_id, action_type, details) VALUES (?, ?, ?)`,
                [userId, 'review', JSON.stringify({ rating, comment })],
                (dbErr) => { if (dbErr) console.error("Failed to log review to history:", dbErr.message); }
            );

            res.json({ success: true });
        }
    );
});

// Get reviews
app.get('/api/reviews', (req, res) => {
    db.all(
        `SELECT reviews.*, users.username 
         FROM reviews 
         JOIN users ON reviews.user_id = users.id 
         ORDER BY reviews.created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({ success: true, reviews: rows });
        }
    );
});

// ✅ Optional: handle root route (nice touch)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/api/test-db', (req, res) => {
    res.json({
        success: !sqliteError,
        error: sqliteError,
        dbPath: dbPath,
        dbExists: fs.existsSync(dbPath),
        env: {
            VERCEL: process.env.VERCEL,
            NODE_ENV: process.env.NODE_ENV,
            N8N_URL: process.env.N8N_URL
        }
    });
});

app.post('/api/movies', async (req, res) => {
    const maxRetries = 3;
    let attempt = 0;
    const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
    const userId = req.body.userId || null;
    const userMessage = req.body.message || '';
    
    while (attempt < maxRetries) {
        attempt++;
        try {
            console.log(`REQUEST BODY (Attempt ${attempt}):`, req.body);
            const response = await fetch(`${n8nUrl}/webhook/movie-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'bypass-tunnel-reminder': 'true'
                },
                body: JSON.stringify(req.body)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Validate that we got a valid payload or error-free response from n8n
            if (data && (data.error || (data.status && data.status === 'error'))) {
                const errMsg = data.error || data.message || JSON.stringify(data);
                throw new Error(`n8n returned error: ${errMsg}`);
            }

            console.log("N8N RESPONSE:");
            console.log(JSON.stringify(data, null, 2));

            // Log successful chat to chatbot database
            if (chatbotDb) {
                chatbotDb.run(
                    `INSERT INTO chats (user_id, user_message, bot_response) VALUES (?, ?, ?)`,
                    [userId, userMessage, JSON.stringify(data)],
                    (err) => {
                        if (err) console.error("Failed to save chat log:", err.message);
                    }
                );
            }

            return res.json(data);

        } catch (error) {
            console.error(`AI API error (Attempt ${attempt}):`, error.message);
            if (attempt >= maxRetries) {
                const backupResponse = {
                    movies: {
                        type: "text",
                        message: "Greetings from CineSphere! 🌌 I am currently running in offline backup mode. Here are some top cosmic recommendations:\n" +
                                "- **Interstellar** (Sci-Fi, Dir: Christopher Nolan) — A stellar journey through space and time.\n" +
                                "- **Inception** (Sci-Fi/Thriller, Dir: Christopher Nolan) — A dream-bending puzzle.\n" +
                                "- **The Matrix** (Sci-Fi/Action, Dir: Wachowskis) — The definitive cyberpunk classic.\n\n" +
                                "*Note: Please make sure your local n8n server is running or set the N8N_URL environment variable to restore full AI capabilities.*"
                    }
                };

                // Log backup offline response to chatbot database
                if (chatbotDb) {
                    chatbotDb.run(
                        `INSERT INTO chats (user_id, user_message, bot_response) VALUES (?, ?, ?)`,
                        [userId, userMessage, JSON.stringify(backupResponse)],
                        (err) => {
                            if (err) console.error("Failed to save chat log (offline fallback):", err.message);
                        }
                    );
                }

                // If in production/Vercel or n8n is offline, fall back to offline chatbot mode
                return res.json(backupResponse);
            }
            // Wait 1.5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
});

// Admin validation helper middleware
const validateAdmin = (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId;
    if (!adminId) {
        return res.status(401).json({ error: "Unauthorized access" });
    }
    db.get(`SELECT is_admin FROM users WHERE id = ?`, [adminId], (err, row) => {
        if (err || !row || !row.is_admin) {
            return res.status(403).json({ error: "Forbidden: Admin access only" });
        }
        next();
    });
};

// Admin Users Audit
app.get('/api/admin/users', validateAdmin, (req, res) => {
    db.all(`SELECT id, username, email, is_admin FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, users: rows });
    });
});

// Admin Bookings Audit
app.get('/api/admin/bookings', validateAdmin, (req, res) => {
    db.all(`SELECT bookings.*, users.username FROM bookings JOIN users ON bookings.user_id = users.id ORDER BY bookings.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, bookings: rows });
    });
});

// Admin Concessions Audit
app.get('/api/admin/snacks', validateAdmin, (req, res) => {
    db.all(`SELECT snacks.*, users.username FROM snacks JOIN users ON snacks.user_id = users.id ORDER BY snacks.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            const parsed = rows.map(r => ({
                ...r,
                items: JSON.parse(r.items)
            }));
            res.json({ success: true, snacks: parsed });
        } catch (e) {
            res.status(500).json({ error: "Failed to parse concession logs: " + e.message });
        }
    });
});

// Admin Reviews Audit
app.get('/api/admin/reviews', validateAdmin, (req, res) => {
    db.all(`SELECT reviews.*, users.username FROM reviews JOIN users ON reviews.user_id = users.id ORDER BY reviews.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, reviews: rows });
    });
});

// Admin chats monitoring route
app.get('/api/admin/chats', validateAdmin, (req, res) => {
    if (chatbotDb) {
        chatbotDb.all(`SELECT * FROM chats ORDER BY created_at DESC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            try {
                const parsed = rows.map(r => ({
                    ...r,
                    bot_response: JSON.parse(r.bot_response)
                }));
                res.json({ success: true, chats: parsed });
            } catch (e) {
                res.status(500).json({ error: "Failed to parse chat logs: " + e.message });
            }
        });
    } else {
        res.json({ success: true, chats: [] });
    }
});

// Start server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = app;