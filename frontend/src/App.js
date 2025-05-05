import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Events from './pages/Events';
import EventDetails from './pages/EventDetails';
import CreateEvent from './pages/CreateEvent';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import Notifications from './components/Notifications';
import CommunityMessage from './components/CommunityMessage';
import Motivation from './pages/Motivation';
import Payment from './pages/Payment';
import About from './pages/About';
import PrivacyPolicy from './pages/PrivacyPolicy';

// Protected Route component
const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-gray-900">
        <Navbar />
        <Notifications />
        <main className="flex-grow container mx-auto px-4 py-8 text-gray-100">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetails />} />
            <Route path="/community" element={<CommunityMessage />} />
            <Route path="/motivation" element={<Motivation />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            
            <Route
              path="/create-event"
              element={
                <ProtectedRoute roles={['admin', 'organizer']}>
                  <CreateEvent />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default App; 