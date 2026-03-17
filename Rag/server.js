import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import folderRoutes from './routes/folders.js';
import documentRoutes from './routes/documents.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(join(__dirname, 'public')));

// API routes
app.use('/api/folders', folderRoutes);
app.use('/api', documentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
async function start() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri || mongoUri === 'your-mongodb-uri-here') {
      console.warn('⚠️  MONGODB_URI not configured. Set it in .env file.');
      console.warn('⚠️  Starting server without database connection...');
    } else {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    }

    app.listen(PORT, () => {
      console.log(`🚀 RAG Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  }
}

start();
