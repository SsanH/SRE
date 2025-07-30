import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import './App.css';

interface User {
  id: number;
  email: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      // You could validate the token here by making an API call
      setToken(savedToken);
      // For simplicity, we'll assume the token is valid
      // In a production app, you'd want to verify the token with the server
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = (userData: User, userToken: string) => {
    setUser(userData);
    setToken(userToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="App">
      {user && token ? (
        <Dashboard 
          user={user} 
          token={token} 
          onLogout={handleLogout} 
        />
      ) : (
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}

export default App;
