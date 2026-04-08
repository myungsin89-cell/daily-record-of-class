import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ClassProvider } from './context/ClassContext';
import { StudentProvider } from './context/StudentContext';
import { APIKeyProvider } from './context/APIKeyContext';
import { GoogleProvider } from './context/GoogleContext';
import { UpdateProvider } from './context/UpdateContext';
import { SaveStatusProvider } from './context/SaveStatusContext';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import ClassRequiredRoute from './components/ClassRequiredRoute';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import ClassSelect from './pages/ClassSelect';
import CreateClass from './pages/CreateClass';
import Dashboard from './pages/Dashboard';
import StudentManager from './pages/StudentManager';
import AttendanceTracker from './pages/AttendanceTracker';
import JournalEntry from './pages/JournalEntry';

import AssignmentManager from './pages/AssignmentManager';
import GradeManager from './pages/GradeManager';
import GradeInput from './pages/GradeInput';
import BudgetManager from './pages/BudgetManager';
import Notepad from './pages/Notepad';
import Settings from './pages/Settings';
import SeatingChart from './pages/SeatingChart';
import RandomOrder from './pages/RandomOrder';
import ClassRole from './pages/ClassRole';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <APIKeyProvider>
            <GoogleProvider>
              <ClassProvider>
                <StudentProvider>
                  <SaveStatusProvider>
                    <UpdateProvider>
                      <Routes>
                        <Route path="/login" element={<Login />} />

                        <Route element={<ProtectedRoute />}>
                          <Route path="/select-class" element={<ClassSelect />} />
                          <Route path="/create-class" element={<CreateClass />} />

                          <Route element={<ClassRequiredRoute />}>
                            <Route element={<Layout />}>
                              <Route path="/" element={<Navigate to="/dashboard" replace />} />
                              <Route path="/dashboard" element={<Dashboard />} />
                              <Route path="/students" element={<StudentManager />} />
                              <Route path="/attendance" element={<AttendanceTracker />} />
                              <Route path="/journal" element={<JournalEntry />} />
                              <Route path="/journal-entry" element={<JournalEntry />} />

                              <Route path="/assignments" element={<AssignmentManager />} />
                              <Route path="/grades" element={<GradeManager />} />
                              <Route path="/grade-input" element={<GradeInput />} />
                              <Route path="/budget" element={<BudgetManager />} />
                              <Route path="/notepad" element={<Notepad />} />
                              <Route path="/seating" element={<SeatingChart />} />
                              <Route path="/random-order" element={<RandomOrder />} />
                              <Route path="/class-role" element={<ClassRole />} />
                              <Route path="/settings" element={<Settings />} />
                            </Route>
                          </Route>
                        </Route>
                      </Routes>
                    </UpdateProvider>
                  </SaveStatusProvider>
                </StudentProvider>
              </ClassProvider>
            </GoogleProvider>
          </APIKeyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
