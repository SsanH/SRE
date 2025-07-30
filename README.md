# Full-Stack Authentication Application

A complete full-stack application with React frontend, Node.js backend, and TiDB database integration.

## Features

- User registration and login
- JWT token-based authentication
- Token storage in TiDB database
- Client-side form validation
- Protected API endpoints
- Responsive login interface

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: React with TypeScript
- **Database**: TiDB (MySQL-compatible)
- **Authentication**: JWT tokens with bcrypt password hashing

## Project Structure

```
assignment/
├── backend/           # Node.js Express server
│   ├── server.js     # Main server file
│   ├── config.example.js  # Database configuration template
│   └── package.json
├── frontend/         # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── LoginForm.tsx    # Login/Register form
│   │   │   └── Dashboard.tsx    # Protected dashboard
│   │   └── App.tsx
│   └── package.json
└── README.md
```

## Setup Instructions

### 1. Database Setup (TiDB)

**Option A: TiDB Cloud (Recommended - Free)**
1. Go to [TiDB Cloud](https://tidbcloud.com/) and sign up for free
2. Click "Create Cluster" → Choose "Serverless" (free tier)
3. Select your region and create the cluster
4. Click "Connect" to get your connection details:
   ```
   Host: gateway01.us-west-2.prod.aws.tidbcloud.com
   Port: 4000
   Username: your_username.root (includes prefix!)
   Password: your_generated_password
   Database: test
   ```

**Option B: Local TiDB (For offline development)**
```bash
# Install TiUP
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
source ~/.bashrc

# Start TiDB playground
tiup playground
# This gives you: Host: 127.0.0.1, Port: 4000, User: root, Password: (empty)
```

### 2. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your TiDB connection in `backend/config.js`:
   ```javascript
   module.exports = {
     database: {
       // For TiDB Cloud:
       host: 'gateway01.us-west-2.prod.aws.tidbcloud.com', // Your actual host
       port: 4000,
       user: 'your_username.root', // Your actual username (with prefix!)
       password: 'your_generated_password', // Your actual password
       database: 'test',
       
       // For local TiDB:
       // host: '127.0.0.1',
       // user: 'root',
       // password: '',
       
       ssl: { rejectUnauthorized: false } // Required for TiDB Cloud
     },
     jwt: { secret: 'your-secret-key' },
     server: { port: 3001 }
   };
   ```

4. Test your connection:
   ```bash
   npm run test-db
   ```

5. Start the backend server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001` and automatically create the required database tables.

### 3. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the React development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`.

## API Endpoints

- `POST /api/register` - User registration
- `POST /api/login` - User login
- `GET /api/profile` - Get user profile (protected)
- `POST /api/logout` - User logout
- `GET /api/health` - Health check

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tokens Table
```sql
CREATE TABLE user_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Usage

1. Open `http://localhost:3000` in your browser
2. Click "Don't have an account? Register here" to create a new account
3. Fill in your email and password (minimum 6 characters)
4. After registration, login with your credentials
5. You'll be redirected to a dashboard showing your user information
6. The dashboard demonstrates successful authentication and protected API access

## Security Features

- Passwords are hashed using bcrypt
- JWT tokens are stored in the database for validation
- Client-side form validation
- Protected API endpoints with token verification
- Tokens expire after 24 hours

## Development Notes

- The backend automatically creates database tables on startup
- CORS is enabled for frontend-backend communication
- Environment variables take precedence over config.js
- All API responses include appropriate HTTP status codes
- Tokens are sent as Bearer tokens in Authorization headers

## Testing

You can test the API endpoints using curl or Postman:

```bash
# Register a new user
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Access protected endpoint
curl -X GET http://localhost:3001/api/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```