import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ClassProvider } from './context/ClassContext';
import { StudentProvider } from './context/StudentContext';
import { APIKeyProvider } from './context/APIKeyContext';
import { GoogleProvider } from './context/GoogleContext';
import { UpdateProvider } from './context/UpdateContext';
import { SaveStatusProvider } from './context/SaveStatusContext';
import { ModalProvider } from './context/ModalContext';
import { performAutoBackup } from './services/autoBackupService';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import ClassRequiredRoute from './components/ClassRequiredRoute';
import Layout from './components/Layout';
import DesktopTitlebar from './components/DesktopTitlebar';

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
import Widget from './pages/Widget';

function App() {
  const isElectron = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;

  // 백그라운드 자동 백업 스케줄러 (앱 실행 10초 후 1회, 이후 10분마다 1회 주기적 실행)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      performAutoBackup().catch(() => {});
    }, 10000);

    const intervalTimer = setInterval(() => {
      performAutoBackup().catch(() => {});
    }, 10 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return (
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <APIKeyProvider>
            <GoogleProvider>
              <ClassProvider>
                <StudentProvider>
                  <SaveStatusProvider>
                    <UpdateProvider>
                      <ModalProvider>
                        <div className={`app-root ${isElectron ? 'is-desktop' : ''}`}>
                        <Routes>
                          <Route path="/widget" element={<Widget />} />
                          <Route path="/*" element={
                            <>
                              <DesktopTitlebar />
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
                                      <Route path="/student-manager" element={<StudentManager />} />
                                      <Route path="/student" element={<StudentManager />} />
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
                            </>
                          } />
                        </Routes>
                        </div>
                      </ModalProvider>
                    </UpdateProvider>
                  </SaveStatusProvider>
                </StudentProvider>
              </ClassProvider>
            </GoogleProvider>
          </APIKeyProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
