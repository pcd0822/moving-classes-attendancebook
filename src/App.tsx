import { Routes, Route } from 'react-router-dom'
import Guide from './pages/Guide'
import TeacherStart from './pages/TeacherStart'
import TeacherTimetable from './pages/TeacherTimetable'
import Admin from './pages/Admin'

export default function App() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          fontSize: 12,
          color: 'var(--text-muted)',
          opacity: 0.85,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        Designed by 들쌤
      </div>
      <Routes>
        <Route path="/" element={<Guide />} />
        <Route path="/start" element={<TeacherStart />} />
        <Route path="/timetable" element={<TeacherTimetable />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </>
  )
}
