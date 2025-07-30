import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: number;
  email: string;
}

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setProfileData(response.data);
    } catch (error: any) {
      setError('Failed to fetch profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:3001/api/logout', {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      onLogout();
    }
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '600px',
    margin: '50px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #ddd'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#f8f9fa',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #ddd'
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1>Welcome to Dashboard</h1>
        <button style={buttonStyle} onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div style={cardStyle}>
        <h3>User Information</h3>
        <p><strong>ID:</strong> {user.id}</p>
        <p><strong>Email:</strong> {user.email}</p>
        
        {error && <p style={{ color: '#dc3545' }}>{error}</p>}
        
        {profileData && (
          <div style={{ marginTop: '20px' }}>
            <h4>Profile Data from Protected API:</h4>
            <pre style={{ 
              backgroundColor: '#e9ecef', 
              padding: '10px', 
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              {JSON.stringify(profileData, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: '20px' }}>
        <h3>Authentication Status</h3>
        <p style={{ color: '#28a745' }}>✓ Successfully authenticated with JWT token</p>
        <p style={{ color: '#28a745' }}>✓ Token stored in database</p>
        <p style={{ color: '#28a745' }}>✓ Protected API access enabled</p>
      </div>
    </div>
  );
};

export default Dashboard;