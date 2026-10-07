import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import VoterProvider from './VoterProvider'
import Home from './pages/Home'
import Register from './pages/Register'
import Vote from './pages/Vote'
import VoterLogin from './pages/VoterLogin'
import VoterDashboard from './pages/VoterDashboard'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './components/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCandidates from './pages/admin/AdminCandidates'
import AdminVoters from './pages/admin/AdminVoters'
import AdminAudit from './pages/admin/AdminAudit'
import AdminVoting from './pages/admin/AdminVoting'
import AdminElection from './pages/admin/AdminElection'
import Results from './pages/Results'
import Blockchain from './pages/Blockchain'

export default function App() {
  return (
    <BrowserRouter>
      <VoterProvider>
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Voter portal */}
          <Route path="/voter/login" element={<VoterLogin />} />
          <Route path="/voter/register" element={<Register />} />
          <Route path="/voter/authenticate" element={<Vote mode="auth" />} />
          <Route path="/voter/dashboard" element={<VoterDashboard />} />
          <Route path="/voter/vote" element={<Vote mode="vote" />} />

          {/* Admin / auditor portal */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="candidates" element={<AdminCandidates />} />
            <Route path="voters" element={<AdminVoters />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="voting" element={<AdminVoting />} />
            <Route path="election" element={<AdminElection />} />
            <Route path="blockchain" element={<Blockchain />} />
            <Route path="results" element={<Results />} />
          </Route>

          <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />

          {/* Old top-level routes now live inside the portals */}
          <Route path="/register" element={<Navigate to="/voter/register" replace />} />
          <Route path="/vote" element={<Navigate to="/voter/login" replace />} />
          <Route path="/results" element={<Navigate to="/admin/results" replace />} />
          <Route path="/blockchain" element={<Navigate to="/admin/blockchain" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </VoterProvider>
    </BrowserRouter>
  )
}
