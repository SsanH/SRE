// Structured Logging Configuration with log4js
const log4js = require('log4js');

// Configure log4js - Docker-optimized (console-only for containerized environments)  
const isDockerEnvironment = process.env.NODE_ENV === 'docker';

const logConfig = {
  appenders: {
    // Console appender with JSON layout for structured logging
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%d{ISO8601} [%p] %c - %m'
      }
    }
  },
  
  categories: {
    default: { 
      appenders: ['console'], 
      level: 'info' 
    },
    userActivity: { 
      appenders: ['console'], 
      level: 'info' 
    },
    databaseChanges: { 
      appenders: ['console'], 
      level: 'info' 
    },
    system: { 
      appenders: ['console'], 
      level: 'info' 
    }
  }
};

// Add file appenders only for non-Docker environments
if (!isDockerEnvironment) {
  logConfig.appenders.userActivity = {
    type: 'file',
    filename: 'logs/user-activity.log',
    layout: {
      type: 'pattern',
      pattern: '%d{ISO8601} [%p] %c - %m'
    },
    maxLogSize: 10485760, // 10MB
    backups: 5,
    compress: true
  };
  
  logConfig.appenders.databaseChanges = {
    type: 'file',
    filename: 'logs/database-changes.log',
    layout: {
      type: 'pattern',
      pattern: '%d{ISO8601} [%p] %c - %m'
    },
    maxLogSize: 10485760, // 10MB
    backups: 5,
    compress: true
  };
  
  logConfig.appenders.system = {
    type: 'file',
    filename: 'logs/system.log',
    layout: {
      type: 'pattern',
      pattern: '%d{ISO8601} [%p] %c - %m'
    },
    maxLogSize: 10485760, // 10MB
    backups: 5,
    compress: true
  };
  
  // Update categories to include file appenders
  logConfig.categories.default.appenders = ['console', 'system'];
  logConfig.categories.userActivity.appenders = ['console', 'userActivity'];
  logConfig.categories.databaseChanges.appenders = ['console', 'databaseChanges'];
  logConfig.categories.system.appenders = ['console', 'system'];
}

log4js.configure(logConfig);

// Create loggers for different categories
const loggers = {
  system: log4js.getLogger('system'),
  userActivity: log4js.getLogger('userActivity'),
  databaseChanges: log4js.getLogger('databaseChanges'),
  default: log4js.getLogger()
};

// Helper functions for structured logging
class StructuredLogger {
  
  // Log user activity (login, logout, register)
  static logUserActivity(action, userId, email, ipAddress, userAgent, additionalData = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      category: 'USER_ACTIVITY',
      action: action.toUpperCase(),
      userId: userId,
      email: email,
      ipAddress: ipAddress,
      userAgent: userAgent,
      sessionId: additionalData.sessionId || null,
      success: additionalData.success !== undefined ? additionalData.success : true,
      errorMessage: additionalData.errorMessage || null,
      duration: additionalData.duration || null,
      metadata: additionalData.metadata || {}
    };
    
    loggers.userActivity.info('USER_ACTIVITY', logEntry);
    return logEntry;
  }
  
  // Log database changes (CDC)
  static logDatabaseChange(operation, table, recordId, oldData, newData, userId = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      category: 'DATABASE_CHANGE',
      operation: operation.toUpperCase(),
      table: table,
      recordId: recordId,
      userId: userId,
      oldData: oldData || null,
      newData: newData || null,
      changeSize: newData ? JSON.stringify(newData).length : 0,
      metadata: {
        database: 'tidb_assignment',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    loggers.databaseChanges.info('DATABASE_CHANGE', logEntry);
    return logEntry;
  }
  
  // Log system events
  static logSystemEvent(event, level = 'info', data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      category: 'SYSTEM_EVENT',
      event: event.toUpperCase(),
      level: level.toUpperCase(),
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      data: data,
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    loggers.system[level]('SYSTEM_EVENT', logEntry);
    return logEntry;
  }
  
  // Log API requests
  static logAPIRequest(method, url, statusCode, responseTime, userId = null, ipAddress = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),  
      category: 'API_REQUEST',
      method: method.toUpperCase(),
      url: url,
      statusCode: statusCode,
      responseTime: responseTime,
      userId: userId,
      ipAddress: ipAddress,
      metadata: {
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    loggers.system.info('API_REQUEST', logEntry);
    return logEntry;
  }
  
  // Log Kafka events
  static logKafkaEvent(eventType, topic, partition, offset, key, value, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      category: 'KAFKA_EVENT',
      eventType: eventType.toUpperCase(),
      topic: topic,
      partition: partition,
      offset: offset,
      key: key,
      valueSize: value ? JSON.stringify(value).length : 0,
      error: error,
      metadata: {
        brokers: process.env.KAFKA_BROKERS || 'kafka:29092',
        clientId: 'tidb-sre-assignment'
      }
    };
    
    loggers.system.info('KAFKA_EVENT', logEntry);
    return logEntry;
  }
}

// Middleware for request logging
function requestLoggerMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const userId = req.user ? req.user.id : null;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    
    StructuredLogger.logAPIRequest(
      req.method,
      req.originalUrl,
      res.statusCode,
      responseTime,
      userId,
      ipAddress
    );
    
    originalEnd.apply(this, args);
  };
  
  next();
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  StructuredLogger,
  requestLoggerMiddleware,
  loggers,
  log4js
};