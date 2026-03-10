import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import http from "http";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { WebSocketServer } from "ws";
import Tesseract from "tesseract.js";


// ============================================
// CONFIGURATION 'h
// ============================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expense_tracker';
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const UPLOAD_DIR = './uploads';
const AUDIO_TEMP_DIR = './audio_temp';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Validate required environment variables
if (!JWT_SECRET) {
  console.error('❌ FATAL ERROR: JWT_SECRET is not defined');
  process.exit(1);
}

// Create directories
[UPLOAD_DIR, AUDIO_TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// ============================================
// EXPRESS SETUP
// ============================================

const app = express();
const server = http.createServer(app);

// CORS Configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// ============================================
// DATABASE CONNECTION
// ============================================

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ============================================
// DATABASE MODELS
// ============================================

// User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: function() { return !this.googleId; } },
  googleId: { type: String, sparse: true, unique: true },
  avatar: { type: String, default: null },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Expense Model
const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  category: { 
    type: String, 
    required: true,
    enum: ['Food', 'Shopping', 'Utility Bills', 'Transport', 'Entertainment', 'Others']
  },
  description: { type: String, trim: true },
  date: { type: Date, default: Date.now },
  receipt: { type: String, default: null },
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Card', 'UPI', 'Net Banking', 'Other'], 
    default: 'Cash' 
  },
  createdAt: { type: Date, default: Date.now }
});

const Expense = mongoose.model('Expense', expenseSchema);

// Budget Model
const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalBudget: { type: Number, default: 0 },
  categoryBudgets: { type: Map, of: Number, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

const Budget = mongoose.model('Budget', budgetSchema);

// Global Learning Model
const globalLearningSchema = new mongoose.Schema({
  normalizedText: { type: String, unique: true },
  category: String,
  occurrences: { type: Number, default: 1 },
  lastUsed: { type: Date, default: Date.now }
});

const GlobalLearning = mongoose.model('GlobalLearning', globalLearningSchema);

// ============================================
// FILE UPLOAD CONFIGURATION
// ============================================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf', 'audio/webm', 'audio/wav', 'audio/mp3'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter
});

// ============================================
// GOOGLE OAUTH
// ============================================

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔐 Google auth callback for:', profile.emails[0].value);
      
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) return done(null, user);
      
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      if (!email) return done(new Error('Google account has no email'), null);
      
      user = await User.findOne({ email });
      
      if (user) {
        user.googleId = profile.id;
        user.authProvider = 'google';
        user.avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
        await user.save();
        console.log('✅ Linked Google to existing user');
        return done(null, user);
      }
      
      user = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email,
        avatar: profile.photos && profile.photos[0] && profile.photos[0].value,
        authProvider: 'google'
      });
      
      console.log('✅ Created new user via Google');
      done(null, user);
    } catch (error) {
      console.error('❌ Google auth error:', error);
      done(error, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

// ============================================
// GROQ LLM ENGINE
// ============================================

const SYSTEM_PROMPT = `You are an expense categorizer. Return ONLY JSON: {"category": "Food/Shopping/Utility Bills/Transport/Entertainment/Others", "amount": number or null}

CRITICAL: biryani, chai, swiggy, zomato, food delivery = "Food"

EXAMPLES:
"100 on biryani" → {"category": "Food", "amount": 100}
"swiggy 300" → {"category": "Food", "amount": 300}
"uber 180" → {"category": "Transport", "amount": 180}`;

class GroqEngine {
  constructor() {
    this.apiKey = GROQ_API_KEY;
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.3-70b-versatile';
  }

  async categorize(text) {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    try {
      console.log(`🤖 Groq LLM: "${text}"`);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          max_tokens: 150
        })
      });

      if (!response.ok) {
        throw new Error(`Groq error: ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices[0].message.content;
      
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      
      let result;
      try {
        result = JSON.parse(content);
      } catch {
        const categoryMatch = content.match(/"category"\s*:\s*"([^"]+)"/);
        const amountMatch = content.match(/"amount"\s*:\s*(\d+|null)/);
        result = {
          category: categoryMatch ? categoryMatch[1] : 'Others',
          amount: amountMatch ? (amountMatch[1] === 'null' ? null : parseInt(amountMatch[1])) : null
        };
      }
      
      const validCats = ['Food', 'Shopping', 'Utility Bills', 'Transport', 'Entertainment', 'Others'];
      if (!validCats.includes(result.category)) result.category = 'Others';

      console.log(`✅ Groq result: ${JSON.stringify(result)}`);

      return {
        category: result.category,
        amount: result.amount || null,
        confidence: 0.90,
        source: 'groq'
      };
    } catch (error) {
      console.error('❌ Groq error:', error.message);
      throw error;
    }
  }

  async transcribe(fileBuffer, originalName) {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    try {
      console.log(`🎙️ Groq Whisper: Transcribing ${originalName}...`);
      
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: originalName,
        contentType: 'audio/webm'
      });
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq Whisper error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      console.log(`✅ Groq Whisper result: "${data.text}"`);
      return data.text;
    } catch (error) {
      console.error('❌ Groq Whisper error:', error.message);
      throw error;
    }
  }
}

const llmEngine = GROQ_API_KEY ? new GroqEngine() : null;


// Audio analysis: /api/analyze-audio (now handled by Node.js direct to Groq)
app.post('/api/analyze-audio', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    if (!llmEngine) {
      return res.status(503).json({ success: false, message: 'AI Engine not configured' });
    }

    console.log(`🎙️ Audio analysis request: ${req.file.size} bytes`);
    
    // 1. Transcribe via Groq Whisper
    const transcription = await llmEngine.transcribe(req.file.buffer, req.file.originalname);
    
    if (!transcription || transcription.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Transcription failed' });
    }

    // 2. Categorize via Groq LLM + Global Learning
    const result = await categorizeExpense(transcription, req.user._id);

    res.json({
      success: true,
      transcription,
      expense: {
        title: transcription,
        amount: result.amount,
        category: result.category,
        description: transcription
      },
      metadata: {
        source: result.source,
        confidence: result.confidence
      }
    });

  } catch (error) {
    console.error('Audio Analysis Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});






// ============================================
// TEXT PROCESSOR
// ============================================

class TextProcessor {
  normalize(text) {
    return text.toLowerCase().replace(/[₹$]/g, '').replace(/\s+/g, ' ').trim();
  }

  async checkLearning(text) {
    const normalized = this.normalize(text);
    const learned = await GlobalLearning.findOne({ 
      normalizedText: normalized, 
      occurrences: { $gte: 3 } 
    });
    
    if (learned) {
      learned.lastUsed = new Date();
      await learned.save();
      console.log(`🎓 Learned: "${normalized}" → ${learned.category}`);
      return { 
        category: learned.category, 
        amount: null, 
        source: 'global_learning', 
        confidence: 1.0, 
        llmSkipped: true 
      };
    }
    return null;
  }

  async updateLearning(text, category, weight = 1) {
    const normalized = this.normalize(text);
    try {
      const existing = await GlobalLearning.findOne({ normalizedText: normalized });
      if (existing) {
        existing.occurrences += weight;
        existing.category = category;
        existing.lastUsed = new Date();
        await existing.save();
        console.log(`📚 Updated learning: "${normalized}" → ${category} (occurrences: ${existing.occurrences})`);
      } else {
        await GlobalLearning.create({ 
          normalizedText: normalized, 
          category, 
          occurrences: weight 
        });
        console.log(`📚 Created learning: "${normalized}" → ${category} (weight: ${weight})`);
      }
    } catch (err) {
      if (err.code !== 11000) console.error('Learning error:', err);
    }
  }

  extractAmount(text) {
    const match = text.match(/(\d+(?:,\d{2,3})*(?:\.\d{2})?)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }
}

const textProcessor = new TextProcessor();

// ============================================
// CATEGORIZATION
// ============================================


async function categorizeExpense(text, userId) {
  // Check learning cache
  const learned = await textProcessor.checkLearning(text);
  if (learned) {
    const amount = textProcessor.extractAmount(text);
    return { ...learned, amount };
  }
  
  // Use LLM if available
  if (llmEngine) {
    try {
      const result = await llmEngine.categorize(text);
      
      // Auto-store in learning
      await textProcessor.updateLearning(text, result.category, 1);
      
      return result;
    } catch (error) {
      console.error('LLM failed, using fallback');
    }
  }
  
  // Fallback categorization
  const amount = textProcessor.extractAmount(text);
  return { 
    category: 'Others', 
    amount, 
    source: 'fallback', 
    confidence: 0.1
  };
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Server is running',
    environment: NODE_ENV,
    groq: !!GROQ_API_KEY,
    googleAuth: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    timestamp: new Date().toISOString()
  });
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      authProvider: 'local'
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during signup' 
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (user.authProvider !== 'local') {
      return res.status(401).json({ 
        success: false, 
        message: `Please login with ${user.authProvider}` 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
});

// Google OAuth routes
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/api/auth/google/callback',
    passport.authenticate('google', { 
      failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed`,
      session: false 
    }),
    (req, res) => {
      try {
        const token = generateToken(req.user._id);
        const userData = encodeURIComponent(JSON.stringify({
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar
        }));
        res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&user=${userData}`);
      } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
      }
    }
  );
}

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      authProvider: req.user.authProvider
    }
  });
});

// Categorize text
app.post('/api/categorize', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text required' });
    }
    
    console.log(`📝 Categorizing text: "${text}"`);
    
    const result = await categorizeExpense(text, req.user._id);
    
    res.json({
      success: true,
      expense: { 
        title: text, 
        amount: result.amount, 
        category: result.category, 
        description: text 
      },
      metadata: { 
        source: result.source, 
        confidence: result.confidence, 
        llmSkipped: result.llmSkipped || false 
      },
      autoConfirmed: false
    });
  } catch (err) {
    console.error('Categorize error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Confirm expense
app.post('/api/expenses/confirm', authenticateToken, async (req, res) => {
  try {
    const { title, amount, category, description, originalCategory, manualOverride } = req.body;
    
    if (!amount || !category || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount, category, and description are required' 
      });
    }
    
    const expense = await Expense.create({
      userId: req.user._id,
      title: title || description,
      amount: parseFloat(amount),
      category,
      description
    });
    
    // Update learning
    if (manualOverride && originalCategory !== category) {
      await textProcessor.updateLearning(description, category, 3);
      console.log(`🎓🎓🎓 User correction learned (weight +3)`);
    } else {
      await textProcessor.updateLearning(description, category, 1);
      console.log(`✅ Accepted (weight +1)`);
    }
    
    res.json({ 
      success: true, 
      message: 'Expense saved successfully', 
      expense,
      learned: manualOverride && originalCategory !== category
    });
  } catch (err) {
    console.error('Confirm expense error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get expense history
app.get('/api/expenses/history', authenticateToken, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(100);
    
    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all expenses with filters
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { category, startDate, endDate, search } = req.query;
    
    const query = { userId: req.user._id };
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const expenses = await Expense.find(query).sort({ date: -1 });
    
    res.json({ success: true, count: expenses.length, expenses });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ success: false, message: 'Error fetching expenses' });
  }
});

// Get daily summary
app.get('/api/expenses/daily-summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expenses = await Expense.find({
      userId: req.user._id,
      date: { $gte: today }
    });
    
    const byCategory = {};
    expenses.forEach(exp => {
      if (!byCategory[exp.category]) {
        byCategory[exp.category] = { amount: 0, count: 0 };
      }
      byCategory[exp.category].amount += exp.amount;
      byCategory[exp.category].count += 1;
    });
    
    res.json({
      success: true,
      summary: {
        total: expenses.reduce((sum, e) => sum + e.amount, 0),
        count: expenses.length,
        byCategory
      }
    });
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily summary' });
  }
});

// Get expense statistics
app.get('/api/expenses/stats/summary', authenticateToken, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id });
    
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    const categoryStats = expenses.reduce((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = 0;
      }
      acc[expense.category] += expense.amount;
      return acc;
    }, {});
    
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    
    const thisMonthExpenses = expenses.filter(e => e.date >= thisMonthStart);
    const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    res.json({
      success: true,
      stats: {
        totalExpenses: total,
        expenseCount: expenses.length,
        thisMonthTotal,
        thisMonthCount: thisMonthExpenses.length,
        categoryBreakdown: categoryStats
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching statistics' });
  }
});

// Delete expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    
    if (expense.receipt) {
      const filePath = path.join(UPLOAD_DIR, expense.receipt);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await Expense.deleteOne({ _id: req.params.id });
    
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, message: 'Error deleting expense' });
  }
});

// Get current budget
app.get('/api/budget/current', authenticateToken, async (req, res) => {
  try {
    let budget = await Budget.findOne({ userId: req.user._id });
    
    if (!budget) {
      budget = await Budget.create({ userId: req.user._id });
    }
    
    res.json({
      success: true,
      budget: {
        totalBudget: budget.totalBudget,
        categoryBudgets: Object.fromEntries(budget.categoryBudgets)
      }
    });
  } catch (error) {
    console.error('Get budget error:', error);
    res.status(500).json({ success: false, message: 'Error fetching budget' });
  }
});

// Update budget
app.post('/api/budget/update', authenticateToken, async (req, res) => {
  try {
    const { totalBudget, categoryBudgets } = req.body;
    
    let budget = await Budget.findOne({ userId: req.user._id });
    
    if (!budget) {
      budget = new Budget({
        userId: req.user._id,
        totalBudget,
        categoryBudgets
      });
    } else {
      budget.totalBudget = totalBudget;
      budget.categoryBudgets = categoryBudgets;
      budget.updatedAt = new Date();
    }
    
    await budget.save();
    
    res.json({ success: true, message: 'Budget updated successfully', budget });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({ success: false, message: 'Error updating budget' });
  }
});

// Learning management endpoints
app.get('/api/learning/patterns', authenticateToken, async (req, res) => {
  try {
    const patterns = await GlobalLearning.find()
      .sort({ occurrences: -1 })
      .limit(100);
    
    res.json({
      success: true,
      patterns: patterns.map(p => ({
        text: p.normalizedText,
        category: p.category,
        occurrences: p.occurrences,
        lastUsed: p.lastUsed
      })),
      total: patterns.length
    });
  } catch (error) {
    console.error('Get patterns error:', error);
    res.status(500).json({ success: false, message: 'Error fetching patterns' });
  }
});

app.post('/api/learning/clear', authenticateToken, async (req, res) => {
  try {
    const result = await GlobalLearning.deleteMany({});
    console.log(`🗑️ Cleared ${result.deletedCount} learning patterns`);
    
    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} patterns`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Clear patterns error:', error);
    res.status(500).json({ success: false, message: 'Error clearing patterns' });
  }
});

app.get('/api/learning/stats', authenticateToken, async (req, res) => {
  try {
    const totalPatterns = await GlobalLearning.countDocuments();
    const highConfidence = await GlobalLearning.countDocuments({ occurrences: { $gte: 3 } });
    
    const byCategory = await GlobalLearning.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalPatterns,
        highConfidencePatterns: highConfidence,
        byCategory: byCategory.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
});

// OCR: /api/upload/receipt
app.post('/api/upload/receipt', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded or file is empty' });
    }

    console.log(`🖼️ OCR: Processing receipt image (${req.file.size} bytes)...`);
    
    // Process with Tesseract
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.buffer);
    await worker.terminate();
    
    // Fallback if Tesseract fails
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Could not extract enough text from receipt. Please try again or type manually.' 
      });
    }

    const cleanText = text.replace(/\n+/g, ' ').trim();
    console.log(`📝 Extracted text: "${cleanText.substring(0, 100)}..."`);

    // Use current categorization logic
    const result = await categorizeExpense(cleanText, req.user._id);

    res.json({
      success: true,
      expense: {
        title: `Receipt: ${cleanText.substring(0, 30)}...`,
        amount: result.amount,
        category: result.category,
        description: cleanText,
        originalOcr: cleanText
      },
      metadata: {
        source: result.source,
        confidence: result.confidence,
        ocrProcessed: true
      }
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ success: false, message: 'OCR analysis failed: ' + error.message });
  }
});

// ============================================
// SERVE FRONTEND (SPA)
// ============================================

const __dirname = path.resolve();
const FRONTEND_DIST = path.join(__dirname, "dist");

if (fs.existsSync(FRONTEND_DIST)) {
  console.log(`📡 Serving frontend from: ${FRONTEND_DIST}`);
  app.use(express.static(FRONTEND_DIST));
  
  // All non-API routes serve index.html
  app.get("*", (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  console.log('⚠️ Frontend dist folder not found. API mode only.');
  
  // Health check only if frontend not found
  app.get('/', (req, res) => {
    res.redirect('/api/health');
  });

  // Error handling middleware
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });
}


app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }
  }
  
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
  console.log('\n🚀 ===================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`🔐 JWT: ${JWT_SECRET ? '✅' : '❌'}`);
  console.log(`🤖 Groq LLM: ${GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`🔑 Google OAuth: ${GOOGLE_CLIENT_ID ? '✅' : '❌'}`);
  console.log(`🎓 Global Learning: ✅`);
  console.log('🚀 ===================================\n');
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});