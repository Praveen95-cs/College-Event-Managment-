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
  const User = require('./models/auth/User');
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  const name = (process.env.ADMIN_NAME || 'Administrator').trim();
  if (!email || password.length < 8) {
    if (email && password.length > 0 && password.length < 8) {
      console.warn(`ADMIN_PASSWORD in backend/.env must be at least 8 characters (got ${password.length}); skipping admin password sync.`);
    } else if (!(await User.findOne({ role: 'admin' }))) {
      console.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) in backend/.env');
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
      department: 'Administration',
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
    console.log(`Admin account provisioned from environment: ${email}`);
    return;
  }
  user.role = 'admin';
  user.password = password;
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
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
const youpiRouter = require('./routes/payments/youpi');

app.use(cors({
  origin(origin, cb) {
    if (!origin || isProd || allowedOrigins.includes(origin) || origin.endsWith('.onrender.com')) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// Mount YouPI-PG webhook on unparsed raw bytes BEFORE express.json() for HMAC-SHA256 verification
app.post(
  '/api/payments/youpi/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  youpiRouter.handleYoupiWebhook
);
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', (req, res) => res.status(404).json({ message: 'Media asset not found' }));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 500 : 2000,
  standardHeaders: true,
  legacyHeaders: false
}));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 25 : 200,
  message: { message: 'Too many authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 120 : 500,
  message: { message: 'Too many OTP verification attempts. Try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/send-otp', otpLimiter);
app.use('/api/auth/verify-otp', otpLimiter);

app.get('/api/health', (req, res) => res.json({
  ok: true,
  env: process.env.NODE_ENV || 'development'
}));

app.use('/api/auth', require('./routes/auth/auth'));
app.use('/api/departments', require('./routes/system/departments'));
app.use('/api/events', require('./routes/events/events'));
app.use('/api/registrations', require('./routes/events/registrations'));
app.use('/api/motivation', require('./routes/community/motivation'));
app.use('/api/messages', require('./routes/community/messages'));
app.use('/api/notifications', require('./routes/community/notifications'));
app.use('/api/users', require('./routes/auth/users'));
app.use('/api/competitions', require('./routes/competitions/competitions'));
app.use('/api/feed', require('./routes/feed/feed'));
app.use('/api/clubs', require('./routes/feed/clubs'));
app.use('/api/payments/youpi', youpiRouter);

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
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Uploaded image must be 2 MB or smaller.' });
  }
  const status = err.status || 500;
  res.status(status).json({
    message: isProd && status === 500 ? 'Something went wrong' : (err.message || 'Something went wrong')
  });
});

const PORT = process.env.PORT || 5000;
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

async function migrateLocalUploadsToDataUri() {
  const Club = require('./models/feed/Club');
  const Event = require('./models/events/Event');
  const FeedPost = require('./models/feed/FeedPost');
  const uploadsRoot = path.join(__dirname, 'uploads');

  const toInline = (relPath) => {
    if (!relPath || !relPath.startsWith('/uploads/')) return null;
    const filename = path.basename(relPath);
    const full = path.join(uploadsRoot, filename);
    if (!fs.existsSync(full)) return null;
    const ext = path.extname(filename).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) return null;
    const stat = fs.statSync(full);
    if (stat.size <= 0 || stat.size > 2 * 1024 * 1024) return null;
    return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
  };

  for (const club of await Club.find({ logo: { $regex: '^/uploads/' } }).select('logo')) {
    const uri = toInline(club.logo);
    if (uri) {
      await Club.updateOne({ _id: club._id }, { $set: { logo: uri } });
    }
  }
  for (const ev of await Event.find({ photo: { $regex: '^/uploads/' } }).select('photo')) {
    const uri = toInline(ev.photo);
    if (uri) {
      await Event.updateOne({ _id: ev._id }, { $set: { photo: uri } });
    }
  }
  for (const post of await FeedPost.find({ mediaUrl: { $regex: '^/uploads/' } }).select('mediaUrl')) {
    const uri = toInline(post.mediaUrl);
    if (uri) {
      await FeedPost.updateOne({ _id: post._id }, { $set: { mediaUrl: uri } });
    }
  }
}

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
  const { ensureDefaultDepartments } = require('./services/system/departmentService');
  await ensureDefaultDepartments().catch(err => console.warn('Department seed note:', err.message));
  await migrateLocalUploadsToDataUri().catch(err => console.warn('Upload migration note:', err.message));
  const { ensureAllPublishedEventsSynced } = require('./services/feed/feedService');
  await ensureAllPublishedEventsSynced(true).catch(err => console.warn('Initial feed sync note:', err.message));
  const { startExpiredEventScheduler } = require('./services/events/eventCleanupService');
  startExpiredEventScheduler();
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
start().catch(err => {
  console.error('Startup failed:', err.message || err);
  process.exit(1);
});
