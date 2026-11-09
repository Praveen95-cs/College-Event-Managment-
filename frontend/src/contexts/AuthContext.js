import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Set the base URL for all axios requests
const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
axios.defaults.baseURL = API_URL;
axios.defaults.withCredentials = true;

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        // Set default authorization header
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        const response = await axios.get('/api/auth/me');
        setUser(response.data);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const { token, user } = response.data;
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      return user;
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || 'Failed to login. Please check your credentials.';
      throw new Error(errorMessage);
    }
  };

  const sendSignupOtp = async ({ email, name = '', purpose = 'register' }) => {
    try {
      const response = await axios.post('/api/auth/send-otp', { email, name, purpose });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send verification OTP.';
      const err = new Error(errorMessage);
      err.retryAfterSeconds = error.response?.data?.retryAfterSeconds;
      throw err;
    }
  };

  const verifySignupOtp = async ({ email, otp, purpose = 'register' }) => {
    try {
      const response = await axios.post('/api/auth/verify-otp', { email, otp, purpose });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Invalid verification OTP.';
      throw new Error(errorMessage);
    }
  };

  const resetPassword = async ({ email, newPassword, verificationToken = '', otp = '' }) => {
    try {
      const response = await axios.post('/api/auth/reset-password', {
        email,
        newPassword,
        ...(verificationToken ? { verificationToken } : {}),
        ...(otp ? { otp } : {})
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to reset password.';
      throw new Error(errorMessage);
    }
  };

  const register = async (userData) => {
    try {
      const studentData = {
        name: userData.name,
        email: userData.email,
        password: userData.password,
        department: userData.department,
        ...(userData.verificationToken ? { verificationToken: userData.verificationToken } : {}),
        ...(userData.otp ? { otp: userData.otp } : {})
      };
      const response = await axios.post('/api/auth/register', studentData);
      const { token, user } = response.data;
      
      // Save token to localStorage
      localStorage.setItem('token', token);
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      return user;
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.message || 'Failed to register. Please try again.';
      throw new Error(errorMessage);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    sendSignupOtp,
    verifySignupOtp,
    resetPassword,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 