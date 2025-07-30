const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { Kafka } = require('kafkajs');

// Import structured logging
const { StructuredLogger, requestLoggerMiddleware } = require('./logger');

// Use Docker config if NODE_ENV is 'docker', otherwise use local config
const config = process.env.NODE_ENV === 'docker' 
  ? require('./config-docker') 
  : require('./config');

const app = express();
const PORT = config.server.port;
const JWT_SECRET = config.jwt.secret;

// Middleware
app.use(cors());
app.use(express.json());

// Add IP address capture middleware
app.use((req, res, next) => {
  req.ip = req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
  next();
});

// Add structured request logging middleware
app.use(requestLoggerMiddleware);

// Kafka setup
let kafka, producer, consumer;

async function initKafka() {
  try {
    kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'tidb-assignment-group' });

    await producer.connect();
    await consumer.connect();
    
    // Subscribe to user events
    await consumer.subscribe({ topic: 'user-events' });
    
    // Start consuming messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = JSON.parse(message.value.toString());
        console.log('📨 Kafka Message:', {
          topic,
          partition,
          event: event.type,
          user: event.data.email || event.data.userId
        });
      }
    });

    console.log('✅ Kafka initialized successfully');
  } catch (error) {
    console.error('❌ Kafka initialization failed:', error.message);
    console.log('⚠️  Continuing without Kafka (development mode)');
  }
}

// Helper function to send Kafka messages
async function sendKafkaMessage(topic, event) {
  if (producer) {
    try {
      await producer.send({
        topic,
        messages: [{
          key: event.userId?.toString() || 'system',
          value: JSON.stringify(event),
          timestamp: Date.now().toString()
        }]
      });
    } catch (error) {
      console.error('Kafka send error:', error.message);
    }
  }
}

let db;

// Initialize database connection pool
async function initDB() {
  try {
    console.log('🔍 Connecting to database...');
    console.log('📍 Host:', config.database.host);
    console.log('📍 Port:', config.database.port);
    console.log('📍 User:', config.database.user);
    console.log('📍 Database:', config.database.database);

    // Create connection pool for better connection management
    db = mysql.createPool({
      ...config.database,
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      idleTimeout: 300000, // 5 minutes
      maxIdle: 5
    });
    
    console.log('✅ Connected to TiDB with connection pool');
    
    // Test connection and create database if needed
    const connection = await db.getConnection();
    try {
      await connection.execute(`CREATE DATABASE IF NOT EXISTS ${config.database.database}`);
      await connection.execute(`USE ${config.database.database}`);
      console.log(`✅ Using database: ${config.database.database}`);
    } finally {
      connection.release();
    }
    
    // Create users table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create tokens table for token management
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create default user if it doesn't exist
    const defaultEmail = 'admin@tidb.com';
    const defaultPassword = 'admin123';
    
    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [defaultEmail]);
    
    if (existingUser.length === 0) {
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await db.execute(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [defaultEmail, hashedPassword]
      );
      console.log('✅ Default user created:', defaultEmail);
      
      // Send Kafka message for user creation
      await sendKafkaMessage('user-events', {
        type: 'USER_CREATED',
        data: { email: defaultEmail, isDefault: true },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// Middleware to verify JWT token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    // Check if token exists in database and is not expired
    const [rows] = await db.execute(
      'SELECT ut.*, u.email FROM user_tokens ut JOIN users u ON ut.user_id = u.id WHERE ut.token = ? AND ut.expires_at > NOW()',
      [token]
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId, email: rows[0].email };
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
}

// Routes

// Register endpoint
app.post('/api/register', async (req, res) => {
  const startTime = Date.now();
  const { email, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  try {
    // Basic validation
    if (!email || !password) {
      // Log failed registration attempt
      StructuredLogger.logUserActivity(
        'REGISTER_FAILED',
        null,
        email || 'unknown',
        ipAddress,
        userAgent,
        {
          success: false,
          errorMessage: 'Email and password are required',
          duration: Date.now() - startTime
        }
      );
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user already exists
    const [existingUsers] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      // Log failed registration attempt
      StructuredLogger.logUserActivity(
        'REGISTER_FAILED',
        null,
        email,
        ipAddress,
        userAgent,
        {
          success: false,
          errorMessage: 'User already exists',
          duration: Date.now() - startTime
        }
      );
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user and log database change
    const [result] = await db.execute(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );

    // Log database change
    StructuredLogger.logDatabaseChange(
      'INSERT',
      'users',
      result.insertId,
      null,
      { email: email, id: result.insertId }
    );

    // Log successful registration
    StructuredLogger.logUserActivity(
      'REGISTER_SUCCESS',
      result.insertId,
      email,
      ipAddress,
      userAgent,
      {
        success: true,
        duration: Date.now() - startTime,
        metadata: { newUserId: result.insertId }
      }
    );

    // Send Kafka message for user registration
    await sendKafkaMessage('user-events', {
      type: 'USER_REGISTERED',
      data: { email, userId: result.insertId },
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ 
      message: 'User created successfully', 
      userId: result.insertId 
    });
  } catch (error) {
    // Log registration error
    StructuredLogger.logUserActivity(
      'REGISTER_ERROR',
      null,
      email || 'unknown',
      ipAddress,
      userAgent,
      {
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      }
    );
    
    StructuredLogger.logSystemEvent('REGISTRATION_ERROR', 'error', {
      error: error.message,
      stack: error.stack,
      email: email
    });
    
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const startTime = Date.now();
  const { email, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'] || 'unknown';
  const sessionId = jwt.sign({ timestamp: Date.now() }, JWT_SECRET);
  
  try {
    // Basic validation
    if (!email || !password) {
      // Log failed login attempt
      StructuredLogger.logUserActivity(
        'LOGIN_FAILED',
        null,
        email || 'unknown',
        ipAddress,
        userAgent,
        {
          success: false,
          errorMessage: 'Email and password are required',
          duration: Date.now() - startTime,
          sessionId: sessionId
        }
      );
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      // Log failed login attempt - user not found
      StructuredLogger.logUserActivity(
        'LOGIN_FAILED',
        null,
        email,
        ipAddress,
        userAgent,
        {
          success: false,
          errorMessage: 'Invalid credentials - user not found',
          duration: Date.now() - startTime,
          sessionId: sessionId
        }
      );
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Log failed login attempt - invalid password
      StructuredLogger.logUserActivity(
        'LOGIN_FAILED',
        user.id,
        email,
        ipAddress,
        userAgent,
        {
          success: false,
          errorMessage: 'Invalid credentials - wrong password',
          duration: Date.now() - startTime,
          sessionId: sessionId
        }
      );
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Store token in database and log the database change
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const [tokenResult] = await db.execute(
      'INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    // Log database change for token creation
    StructuredLogger.logDatabaseChange(
      'INSERT',
      'user_tokens',
      tokenResult.insertId,
      null,
      { 
        user_id: user.id, 
        token_id: tokenResult.insertId,
        expires_at: expiresAt.toISOString()
      },
      user.id
    );

    // Log successful login with all required fields
    StructuredLogger.logUserActivity(
      'LOGIN_SUCCESS',
      user.id,
      user.email,
      ipAddress,
      userAgent,
      {
        success: true,
        duration: Date.now() - startTime,
        sessionId: sessionId,
        metadata: {
          tokenId: tokenResult.insertId,
          loginTime: new Date().toISOString(),
          userLastLogin: user.updated_at
        }
      }
    );

    // Send Kafka message for user login
    await sendKafkaMessage('user-events', {
      type: 'USER_LOGIN',
      data: { 
        email: user.email, 
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent,
        sessionId: sessionId
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    // Log login error
    StructuredLogger.logUserActivity(
      'LOGIN_ERROR',
      null,
      email || 'unknown',
      ipAddress,
      userAgent,
      {
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime,
        sessionId: sessionId
      }
    );
    
    StructuredLogger.logSystemEvent('LOGIN_ERROR', 'error', {
      error: error.message,
      stack: error.stack,
      email: email,
      ipAddress: ipAddress
    });
    
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Protected profile endpoint
app.get('/api/profile', authenticateToken, async (req, res) => {
  res.json({
    message: 'Profile data from TiDB',
    user: req.user,
    database: 'TiDB',
    messaging: 'Apache Kafka',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Logout endpoint (invalidate token)
app.post('/api/logout', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Remove token from database and log the database change
    const [deleteResult] = await db.execute('DELETE FROM user_tokens WHERE token = ?', [token]);

    // Log database change for token deletion
    if (deleteResult.affectedRows > 0) {
      StructuredLogger.logDatabaseChange(
        'DELETE',
        'user_tokens',
        null,
        { token: token.substring(0, 20) + '...', user_id: req.user.id },
        null,
        req.user.id
      );
    }

    // Log successful logout
    StructuredLogger.logUserActivity(
      'LOGOUT_SUCCESS',
      req.user.id,
      req.user.email,
      ipAddress,
      userAgent,
      {
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          tokensRevoked: deleteResult.affectedRows,
          logoutTime: new Date().toISOString()
        }
      }
    );

    // Send Kafka message for user logout
    await sendKafkaMessage('user-events', {
      type: 'USER_LOGOUT',
      data: { 
        email: req.user.email, 
        userId: req.user.id,
        ipAddress: ipAddress,
        userAgent: userAgent
      },
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    // Log logout error
    StructuredLogger.logUserActivity(
      'LOGOUT_ERROR',
      req.user ? req.user.id : null,
      req.user ? req.user.email : 'unknown',
      ipAddress,
      userAgent,
      {
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      }
    );
    
    StructuredLogger.logSystemEvent('LOGOUT_ERROR', 'error', {
      error: error.message,
      stack: error.stack,
      userId: req.user ? req.user.id : null
    });
    
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API service is running',
    database: 'TiDB',
    messaging: 'Apache Kafka',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Kafka status endpoint
app.get('/api/kafka/status', (req, res) => {
  res.json({
    kafka: producer ? 'connected' : 'disconnected',
    brokers: config.kafka.brokers,
    clientId: config.kafka.clientId
  });
});

// Start server
async function startServer() {
  try {
    await initDB();
    await initKafka();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Backend API Server running on port ${PORT}`);
      console.log(`📊 Database: TiDB at ${config.database.host}:${config.database.port}`);
      console.log(`📨 Messaging: Kafka at ${config.kafka.brokers.join(', ')}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`\n📝 Default user: admin@tidb.com / admin123\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Graceful shutdown initiated...');
  if (producer) await producer.disconnect();
  if (consumer) await consumer.disconnect();
  if (db) await db.end();
  process.exit(0);
});

startServer();