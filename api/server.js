const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000;

// Supabase init
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
const storage = multer.memoryStorage();
const upload = multer({ storage });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// Route: Static pages from /public/pages
app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    if (path.extname(page)) return res.status(404).send("Invalid page");
    const filePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send("Page not found");
        res.sendFile(filePath);
    });
});

// Route: Home
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route: Signup
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields are required' });

    try {
        const { data: existing } = await supabase.from('users').select('id').eq('email', email);
        if (existing.length > 0) return res.status(409).json({ message: 'User already exists' });

        const passwordHash = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('users').insert([{ name, email, password: passwordHash }]);
        if (error) return res.status(500).json({ message: 'Signup failed', error });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
});

// // Route: Login
// const jwt = require('jsonwebtoken');

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error) {
            console.error("Supabase error:", error.message);
            return res.status(500).json({ message: "Database error" });
        }

        if (!users || users.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = users[0];

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // ✅ Generate JWT Token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );
        res.redirect('/pages/upload.html'); // Redirect to upload page after successful login


        // res.status(200).json({
        //     message: "Login successful",
        //     token,
        //     user: {
        //         id: user.id,
        //         name: user.name,
        //         email: user.email
        //     }
        // });

    } catch (err) {
        console.error("Signin error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});




app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
    const file = req.file;
    const userId = req.user.id; // from authenticateToken middleware

    if (!file) return res.status(400).json({ message: "No file selected" });

    try {
        const fileName = `${userId}_${Date.now()}_${file.originalname}`;

        const { error: uploadError } = await supabase.storage
            .from("profile-pics")
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error("Supabase upload error:", uploadError);
            return res.status(500).json({ message: "Error uploading image" });
        }

        // Get public URL
        const { data } = supabase.storage
            .from("profile-pics")
            .getPublicUrl(fileName);

        const publicURL = data.publicUrl;

        // Save image URL to DB
        const { error: updateError } = await supabase
            .from("users")
            .update({ image_url: publicURL })
            .eq("id", userId);

        if (updateError) {
            console.error("DB update error:", updateError);
            return res.status(500).json({ message: "Error saving image URL" });
        }

        res.status(200).json({
            message: "Image uploaded successfully",
            imageUrl: publicURL
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Server error during upload" });
    }
});
// Route: Get Profile Picture URL
app.get('/profile-pic/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('image_url')
            .eq('id', userId)
            .single();

        if (error || !user || !user.image_url) return res.status(404).json({ message: 'Profile picture not found' });

        res.redirect(user.image_url); // Or send { image_url: user.image_url }
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ message: 'Server error fetching image' });
    }
});

// ✅ GET IN TOUCH FORM (Send Email)
app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  const mailOptions = {
    from: email,
    to: process.env.CONTACT_RECEIVER,
    subject: `Contact Form: ${name}`,
    text: message
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: "Email sent successfully" });
  });
});

app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
});
