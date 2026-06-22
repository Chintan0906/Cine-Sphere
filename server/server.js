const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ FIX 1: Use dynamic PORT (REQUIRED for deployment)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ FIX 2: Serve frontend correctly
app.use(express.static(path.join(__dirname, '../public')));

// ✅ FIX 3: Correct database path with Vercel /tmp fallback
const fs = require('fs');
let dbPath = path.join(__dirname, '../database/database.sqlite');

if (process.env.VERCEL) {
    const tmpDbPath = '/tmp/database.sqlite';
    const dbDir = path.dirname(tmpDbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    // Copy database to writeable /tmp folder if it doesn't exist
    if (!fs.existsSync(tmpDbPath)) {
        try {
            fs.copyFileSync(dbPath, tmpDbPath);
            console.log("Copied template database to /tmp/database.sqlite");
        } catch (e) {
            console.error("Failed to copy database to /tmp", e);
        }
    }
    dbPath = tmpDbPath;
}

const db = new sqlite3.Database(
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
                password TEXT
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
        }
    }
);

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

                res.json({ success: true, userId: this.lastID, username, email });
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

        res.json({
            success: true,
            userId: user.id,
            username: user.username,
            email: user.email
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

app.post('/api/movies', async (req, res) => {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
        attempt++;
        try {
            console.log(`REQUEST BODY (Attempt ${attempt}):`, req.body);
            const response = await fetch('http://localhost:5678/webhook/movie-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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

            return res.json(data);

        } catch (error) {
            console.error(`AI API error (Attempt ${attempt}):`, error.message);
            if (attempt >= maxRetries) {
                return res.status(500).json({ error: 'Failed to fetch movies after multiple attempts' });
            }
            // Wait 1.5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
});
// Start server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

module.exports = app;