import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import CommunityMessage from './components/CommunityMessage';
import Payment from './pages/Payment';
import About from './pages/About';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Competitions from './pages/Competitions';
import ManageCompetition from './pages/ManageCompetition';
import QuizArena from './pages/QuizArena';
import CodingArena from './pages/CodingArena';
import Leaderboard from './pages/Leaderboard';

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

function AppShell() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />
      <main className={isHome ? 'flex-grow' : 'flex-grow w-full max-w-7xl mx-auto px-4 py-8'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetails />} />
          <Route path="/community" element={<CommunityMessage />} />
          <Route path="/motivation" element={<Navigate to="/" replace />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/competitions" element={<Competitions />} />
          <Route
            path="/competitions/create"
            element={
              <ProtectedRoute roles={['admin', 'organizer']}>
                <ManageCompetition />
              </ProtectedRoute>
            }
          />
          <Route
            path="/competitions/:id/manage"
            element={
              <ProtectedRoute roles={['admin', 'organizer']}>
                <ManageCompetition />
              </ProtectedRoute>
            }
          />
          <Route
            path="/competitions/:id/quiz"
            element={
              <ProtectedRoute>
                <QuizArena />
              </ProtectedRoute>
            }
          />
          <Route
            path="/competitions/:id/code"
            element={
              <ProtectedRoute>
                <CodingArena />
              </ProtectedRoute>
            }
          />
          <Route path="/competitions/:id/leaderboard" element={<Leaderboard />} />
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
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
