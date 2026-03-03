import { Routes, Route } from 'react-router-dom'
import Guide from './pages/Guide'
import TeacherStart from './pages/TeacherStart'
import TeacherTimetable from './pages/TeacherTimetable'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Guide />} />
      <Route path="/start" element={<TeacherStart />} />
      <Route path="/timetable" element={<TeacherTimetable />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  )
}
