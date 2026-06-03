import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebaseAdmin } from './config/firebase.js';
import authRoutes from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure CORS for development, staging, and production
const getAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV === 'production') {
    return [
      process.env.CLIENT_URL || 'https://stirdotcom.net',
      'https://stirdotcom.net',
      'https://api.stirdotcom.net',
      'https://server.stirdotcom.net',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:5173'
    ];
  } else if (process.env.NODE_ENV === 'staging') {
    const stagingOrigins = [
      process.env.CLIENT_URL || 'https://staging.stirdotcom.net',
      'https://staging.stirdotcom.net',
      'https://staging-api.stirdotcom.net',
      'https://staging-server.stirdotcom.net',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005'
    ];
    
    // Add Cloud Run URLs if they exist
    if (process.env.CLIENT_URL_CLOUD_RUN) {
      stagingOrigins.push(process.env.CLIENT_URL_CLOUD_RUN);
    }
    if (process.env.SERVER_URL_CLOUD_RUN) {
      stagingOrigins.push(process.env.SERVER_URL_CLOUD_RUN);
    }
    
    return stagingOrigins;
  } else {
    return [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005'
    ];
  }
};

const allowedOrigins = getAllowedOrigins();

console.log(`🌐 CORS configured for ${process.env.NODE_ENV || 'development'} environment:`);
console.log('   Allowed origins:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Initialize services before starting the server
async function initializeServices() {
  try {
    // Initialize Firebase Admin SDK first
    console.log('Initializing Firebase Admin SDK...');
    try {
      await initializeFirebaseAdmin();
    } catch (firebaseError) {
      console.error('Firebase initialization failed:', firebaseError);
      console.warn('Server will start without Firebase functionality');
      // Don't exit - allow server to start without Firebase in development
      if (process.env.NODE_ENV === 'production') {
        throw firebaseError;
      }
    }
    
  console.log('Service initialization completed');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Routes (set up after services are initialized)
async function setupServer() {
  await initializeServices();
  
  app.use('/api', authRoutes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Error handling middleware
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Start the server
setupServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
