const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

dotenv.config({ path: path.join(__dirname, '.env') });

const isProd = process.env.NODE_ENV === 'production';
const LOCAL_MONGO_URI = process.env.MONGODB_URI_LOCAL || 'mongodb://127.0.0.1:27017/college-event-manager';

async function ensureAdmin() {
  const User = require('./models/User');
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'Administrator').trim();
  if (!email || password.length < 8) {
    if (!(await User.findOne({ role: 'admin' }))) {
      console.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env');
    }
    return;
  }
  let user = await User.findOne({ email });
  if (!user) {
    await User.create({
      name,
      email,
      password,
      role: 'admin',
      department: 'Administration'
    });
    console.log(`Admin account provisioned from environment: ${email}`);
    return;
  }
  user.role = 'admin';
  user.password = password;
  await user.save();
  console.log(`Admin account synced from environment: ${email}`);
}

function sanitizeMongoUri(uri) {
  if (!uri) return uri;
  return uri.replace(/:<?([^<>@]+)>?@/, (_, password) => `:${password}@`);
}

const ATLAS_FALLBACK_URI = 'mongodb://praveensumathi11_db_user:x498jO6IPY0HaglU@ac-5ejedd5-shard-00-00.2uaavye.mongodb.net:27017,ac-5ejedd5-shard-00-01.2uaavye.mongodb.net:27017,ac-5ejedd5-shard-00-02.2uaavye.mongodb.net:27017/college-event-manager?ssl=true&replicaSet=atlas-a0lohh-shard-0&authSource=admin&retryWrites=true&w=majority';

async function connectDatabase() {
  const primary = sanitizeMongoUri(process.env.MONGODB_URI) || ATLAS_FALLBACK_URI;
  const options = {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10
  };
  try {
    await mongoose.connect(primary, options);
    return;
  } catch (err) {
    if (primary !== ATLAS_FALLBACK_URI) {
      console.warn(`Primary MongoDB connection failed (${err.message}). Connecting to Atlas fallback.`);
      await mongoose.disconnect().catch(() => {});
      await mongoose.connect(ATLAS_FALLBACK_URI, options);
      return;
    }
    if (!isProd) {
      console.warn(`Atlas connection failed (${err.message}). Trying local MongoDB.`);
      await mongoose.disconnect().catch(() => {});
      await mongoose.connect(LOCAL_MONGO_URI, options);
      return;
    }
    throw err;
  }
}

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
  origin(origin, cb) {
    if (!origin || isProd || allowedOrigins.includes(origin) || origin.endsWith('.onrender.com')) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  env: process.env.NODE_ENV || 'development'
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/motivation', require('./routes/motivation'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));
app.use('/api/competitions', require('./routes/competitions'));

const buildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(buildPath) && fs.existsSync(path.join(buildPath, 'index.html'))) {
  app.use(express.static(buildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: isProd && status === 500 ? 'Something went wrong' : (err.message || 'Something went wrong')
  });
});

const PORT = process.env.PORT || 5000;
async function start() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'college_event_manager_production_jwt_secret_2026';
  }
  mongoose.set('strictQuery', true);
  await connectDatabase();
  console.log(`Connected to MongoDB (${mongoose.connection.host}/${mongoose.connection.name})`);
  if (mongoose.connection.host === '127.0.0.1' || mongoose.connection.host === 'localhost') {
    console.warn('Still on local MongoDB. Atlas login failed or was unreachable.');
  }
  await ensureAdmin();
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
start().catch(err => {
  console.error('Startup failed:', err.message || err);
  process.exit(1);
});
