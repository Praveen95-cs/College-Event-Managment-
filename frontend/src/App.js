import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/public/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import Events from './pages/events/Events';
import EventDetails from './pages/events/EventDetails';
import CreateEvent from './pages/events/CreateEvent';
import Profile from './pages/dashboard/Profile';
import AdminDashboard from './pages/dashboard/AdminDashboard';
import CommunityMessage from './components/community/CommunityMessage';
import About from './pages/public/About';
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import Competitions from './pages/competitions/Competitions';
import ManageCompetition from './pages/competitions/ManageCompetition';
import QuizArena from './pages/competitions/QuizArena';
import CodingArena from './pages/competitions/CodingArena';
import Leaderboard from './pages/competitions/Leaderboard';
import CampusFeed from './pages/feed/CampusFeed';
import ClubProfile from './pages/feed/ClubProfile';

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
  const isCodingArena = location.pathname.endsWith('/code');

  return (
    <div className="min-h-screen flex flex-col bg-[#161513] text-[#efe9de] selection:bg-[#e09132]/30 selection:text-[#efe9de]">
      <Navbar />
      <main
        className={
          isHome
            ? 'flex-grow'
            : isCodingArena
              ? 'flex-grow w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-4'
              : 'flex-grow w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8'
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetails />} />
          <Route path="/campus-feed" element={<CampusFeed />} />
          <Route path="/clubs/:clubId" element={<ClubProfile />} />
          <Route path="/community" element={<CommunityMessage />} />
          <Route path="/motivation" element={<Navigate to="/" replace />} />
          <Route path="/payment" element={<Navigate to="/events" replace />} />
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
            path="/events/:id/edit"
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
