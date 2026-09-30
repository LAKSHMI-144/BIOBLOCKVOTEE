import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Register from './pages/Register'
import Vote from './pages/Vote'
import Results from './pages/Results'
import Blockchain from './pages/Blockchain'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/vote" element={<Vote />} />
        <Route path="/results" element={<Results />} />
        <Route path="/blockchain" element={<Blockchain />} />
      </Routes>
    </BrowserRouter>
  )
}
