import React, { useState } from 'react';
import axios from 'axios';

interface LoginFormProps {
  onLoginSuccess: (user: any, token: string) => void;
}

interface FormData {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Client-side validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear specific error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const response = await axios.post(`http://localhost:3001${endpoint}`, formData);

      if (isRegistering) {
        // After successful registration, automatically log in
        setIsRegistering(false);
        setErrors({ general: 'Registration successful! Please log in.' });
      } else {
        // Login successful
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        onLoginSuccess(user, token);
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        setErrors({ general: error.response.data.message });
      } else {
        setErrors({ general: 'An error occurred. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formStyle: React.CSSProperties = {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '20px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontFamily: 'Arial, sans-serif'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    marginBottom: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '16px'
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '10px'
  };

  const errorStyle: React.CSSProperties = {
    color: '#dc3545',
    fontSize: '14px',
    marginBottom: '10px'
  };

  const linkStyle: React.CSSProperties = {
    color: '#007bff',
    cursor: 'pointer',
    textDecoration: 'underline',
    textAlign: 'center' as const,
    marginTop: '15px',
    display: 'block'
  };

  return (
    <div style={formStyle}>
      <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>
        {isRegistering ? 'Create Account' : 'Login'}
      </h2>

      <form onSubmit={handleSubmit}>
        <div>
          <input
            type="email"
            name="email"
            placeholder="Email address"
            value={formData.email}
            onChange={handleInputChange}
            style={inputStyle}
            required
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}
        </div>

        <div>
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleInputChange}
            style={inputStyle}
            required
          />
          {errors.password && <div style={errorStyle}>{errors.password}</div>}
        </div>

        {errors.general && (
          <div style={errorStyle}>{errors.general}</div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            ...buttonStyle,
            backgroundColor: isLoading ? '#6c757d' : '#007bff'
          }}
        >
          {isLoading ? 'Please wait...' : (isRegistering ? 'Register' : 'Login')}
        </button>
      </form>

      <div
        style={linkStyle}
        onClick={() => {
          setIsRegistering(!isRegistering);
          setErrors({});
          setFormData({ email: '', password: '' });
        }}
      >
        {isRegistering 
          ? 'Already have an account? Login here' 
          : 'Don\'t have an account? Register here'
        }
      </div>
    </div>
  );
};

export default LoginForm;