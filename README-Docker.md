# TiDB SRE Assignment - Docker Deployment Guide

## 🐳 **Part 2: DevOps Implementation**

Complete Docker environment with TiDB, Apache Kafka, and containerized services.

## 📋 **Architecture Overview**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   TiDB Server   │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (Database)    │
│   Port: 3000    │    │   Port: 3001    │    │   Port: 4000    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐    ┌─────────────────┐
                    │ Apache Kafka    │◄──►│   Zookeeper     │
                    │ (Message Queue) │    │   (Coordinator) │
                    │ Port: 9092      │    │   Port: 2181    │
                    └─────────────────┘    └─────────────────┘
```

## 🚀 **Services Included**

1. **TiDB Database** - Distributed SQL database (MySQL compatible)
2. **Apache Kafka** - Message broker for event streaming
3. **Zookeeper** - Kafka coordination service
4. **Backend API** - Node.js Express server with JWT auth
5. **Frontend** - React SPA with nginx
6. **Kafka UI** - Web interface for Kafka monitoring

## 📦 **Prerequisites**

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Docker Compose** v3.8+
- **Minimum 8GB RAM** (recommended for all services)
- **10GB free disk space**

## 🛠️ **Quick Start**

### **1. Clone and Navigate**
```bash
cd C:\Users\sanha\OneDrive\Desktop\assignment
```

### **2. Start All Services**
```bash
# Start all services in background
docker-compose up -d

# Or start with logs visible
docker-compose up
```

### **3. Verify Services**
```bash
# Check all services are running
docker-compose ps

# Check service health
docker-compose logs backend
docker-compose logs tidb
docker-compose logs kafka
```

### **4. Access Applications**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/health
- **TiDB**: localhost:4000 (MySQL client)
- **Kafka UI**: http://localhost:8080

## 🔑 **Default Credentials**

### **Application Users**
- **Admin**: `admin@tidb.com` / `admin123`
- **Test User**: `test@tidb.com` / `test123`

### **Database Access**
```bash
# Connect to TiDB using MySQL client
mysql -h localhost -P 4000 -u root -D tidb_assignment
```

## 📊 **Service Details**

### **TiDB Database**
- **Image**: `pingcap/tidb:v7.5.2`
- **Port**: 4000 (MySQL protocol)
- **Database**: `tidb_assignment`
- **Storage**: Persistent volume `tidb_data`

### **Apache Kafka**
- **Image**: `confluentinc/cp-kafka:7.4.4`
- **Port**: 9092 (external), 29092 (internal)
- **Topics**: `user-events`, `system-logs`, `database-events`
- **Storage**: Persistent volume `kafka_data`

### **Backend API**
- **Technology**: Node.js + Express
- **Features**: JWT auth, Kafka messaging, TiDB integration
- **Environment**: Docker-optimized configuration
- **Health Check**: `/api/health`

### **Frontend**
- **Technology**: React + TypeScript + Nginx
- **Features**: Production build, API proxy, gzip compression
- **Build**: Multi-stage Docker build for optimization

## 🔧 **Development Commands**

### **Service Management**
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart backend

# View logs
docker-compose logs -f backend
docker-compose logs -f tidb
docker-compose logs -f kafka

# Scale services
docker-compose up -d --scale backend=2
```

### **Database Operations**
```bash
# Connect to TiDB
docker-compose exec tidb mysql -u root -D tidb_assignment

# Backup database
docker-compose exec tidb mysqldump -u root tidb_assignment > backup.sql

# View database initialization logs
docker-compose logs tidb | grep -i "init"
```

### **Kafka Operations**
```bash
# List Kafka topics
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Create new topic
docker-compose exec kafka kafka-topics --create --topic test-topic --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

# View Kafka messages
docker-compose exec kafka kafka-console-consumer --topic user-events --bootstrap-server localhost:9092 --from-beginning
```

## 🏗️ **Docker Configuration Files**

### **backend/Dockerfile**
- Node.js 18 Alpine base image
- Production dependencies only
- Non-root user for security
- Health check endpoint

### **frontend/Dockerfile**
- Multi-stage build (Node.js → Nginx)
- Production-optimized React build
- Nginx with custom configuration
- Static asset caching

### **docker-compose.yml**
- Service orchestration
- Health checks and dependencies
- Persistent volumes
- Custom network isolation

## 📈 **Monitoring & Logs**

### **Application Monitoring**
- **Health Checks**: All services have health endpoints
- **Kafka UI**: Web interface at http://localhost:8080
- **Container Stats**: `docker-compose stats`

### **Log Management**
```bash
# View all logs
docker-compose logs

# Follow specific service logs
docker-compose logs -f backend

# Export logs to file
docker-compose logs > application.log
```

## 🛡️ **Security Features**

- **Non-root containers** for all services
- **Network isolation** with custom Docker network
- **JWT token authentication** with database storage
- **Nginx security headers** for frontend
- **Environment variable** configuration

## 🔄 **Data Persistence**

All data is stored in Docker volumes:
- `tidb_data` - TiDB database files
- `kafka_data` - Kafka message logs
- `zookeeper_data` - Zookeeper coordination data
- `zookeeper_logs` - Zookeeper transaction logs

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Port conflicts**:
   ```bash
   # Check which service is using the port
   netstat -ano | findstr :3000
   netstat -ano | findstr :4000
   ```

2. **Service startup failures**:
   ```bash
   # Check service logs
   docker-compose logs tidb
   docker-compose logs kafka
   ```

3. **Database connection issues**:
   ```bash
   # Test TiDB connection
   docker-compose exec backend npm run test-db
   ```

4. **Kafka connection issues**:
   ```bash
   # Check Kafka status
   docker-compose exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092
   ```

### **Complete Reset**
```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v --remove-orphans

# Remove all images
docker-compose down --rmi all

# Clean start
docker-compose up -d --build
```

## ✅ **Assignment Requirements Completed**

### **Part 2 DevOps Implementation**

✅ **Docker Services**
- Frontend container with nginx
- Backend API container with Node.js
- Multi-stage builds for optimization

✅ **TiDB Database**
- Local TiDB server in Docker
- Persistent data storage
- Database initialization scripts

✅ **Apache Kafka**
- Message broker with Zookeeper
- Topic auto-creation
- Event streaming for user actions

✅ **Database Initialization**
- SQL scripts for table creation
- Default user creation (admin@tidb.com)
- Proper indexes and relationships

## 🎯 **Testing the Complete System**

1. **Start all services**: `docker-compose up -d`
2. **Visit frontend**: http://localhost:3000
3. **Login with**: `admin@tidb.com` / `admin123`
4. **Check Kafka messages**: http://localhost:8080
5. **Verify database**: Connect to TiDB on port 4000
6. **Monitor logs**: `docker-compose logs -f`

Your complete DevOps environment is ready! 🚀