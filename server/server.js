const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
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
});

// Register Endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: "Please provide all required fields." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, 
            [username, email, hashedPassword], 
            function(err) {
                if (err) {
                    if (err.message.includes("UNIQUE constraint failed")) {
                        return res.status(400).json({ error: "Username or Email already exists." });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ success: true, userId: this.lastID, username, email });
            }
        );
    } catch (e) {
        res.status(500).json({ error: "Server error during registration." });
    }
});

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "Invalid email or password." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.json({ success: true, userId: user.id, username: user.username, email: user.email });
        } else {
            res.status(401).json({ error: "Invalid email or password." });
        }
    });
});

// Save User Action History
app.post('/api/history', (req, res) => {
    const { userId, actionType, details } = req.body;
    if (!userId || !actionType) return res.status(400).json({ error: "Missing required fields." });

    db.run(`INSERT INTO history (user_id, action_type, details) VALUES (?, ?, ?)`, 
        [userId, actionType, JSON.stringify(details)], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, historyId: this.lastID });
        }
    );
});

// Get User Action History
app.get('/api/history/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all(`SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Parse details back to object
        const history = rows.map(r => ({ ...r, details: JSON.parse(r.details) }));
        res.json({ success: true, history });
    });
});

// Submit a Review
app.post('/api/reviews', (req, res) => {
    const { userId, rating, comment } = req.body;
    if (!userId || !rating || !comment) return res.status(400).json({ error: "Missing required fields." });

    db.run(`INSERT INTO reviews (user_id, rating, comment) VALUES (?, ?, ?)`, 
        [userId, rating, comment], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, reviewId: this.lastID });
        }
    );
});

// Get all Reviews
app.get('/api/reviews', (req, res) => {
    // Join with users table to get the username
    db.all(`
        SELECT reviews.*, users.username 
        FROM reviews 
        JOIN users ON reviews.user_id = users.id 
        ORDER BY reviews.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, reviews: rows });
    });
});

// Start Server
app.listen(port, () => {
    console.log(`CineSphere Backend listening at http://localhost:${port}`);
});
