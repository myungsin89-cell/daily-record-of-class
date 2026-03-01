import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClass } from '../context/ClassContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import { useGoogle } from '../context/GoogleContext';
import { useStudentContext } from '../context/StudentContext';
import Sidebar from './Sidebar';
import InstallBanner from './InstallBanner';
import './Layout.css';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { uploadToDrive, exportJournalsToSheet, exportGradesToSheet } from '../services/googleService';
import { exportAllData } from '../db/indexedDB';

import { useUpdate } from '../context/UpdateContext';

const Layout = () => {
    const { user, logout } = useAuth();
    const { currentClass, clearCurrentClass } = useClass();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const { getTimeText, isSaving, lastSaved } = useSaveStatus();
    const { isInstallable, promptInstall } = useInstallPrompt();
    const { needRefresh } = useUpdate();
    const { isGoogleConnected, getValidToken } = useGoogle();
    const { students, journals } = useStudentContext();
    const [isBackingUp, setIsBackingUp] = React.useState(false);
    const [backupDone, setBackupDone] = React.useState(false);
    const [backupStatus, setBackupStatus] = React.useState('');

    // beforeunload — 종료 시 백업 안내
    React.useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isGoogleConnected && !backupDone) {
                e.preventDefault();
                e.returnValue = '데이터를 Google Drive에 백업하셨나요?';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isGoogleConnected, backupDone]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleChangeClass = () => {
        clearCurrentClass();
        navigate('/select-class');
    };

    const handleQuickBackup = async () => {
        if (!isGoogleConnected || isBackingUp) return;
        setIsBackingUp(true);

        const classId = currentClass?.id || 'default';
        const className = currentClass?.name || '학급';

        try {
            const token = await getValidToken();

            // 1) Drive JSON 백업
            setBackupStatus('Drive 백업 중...');
            const data = await exportAllData();
            const fileName = `학급일지_백업_${new Date().toISOString().split('T')[0]}.json`;
            await uploadToDrive(token, data, fileName);

            // 2) 학생 기록 → Google Sheets
            setBackupStatus('학생 기록 동기화 중...');
            try {
                if (students && students.length > 0) {
                    await exportJournalsToSheet(token, students, journals || {}, className);
                }
            } catch (sheetsErr) {
                console.warn('학생 기록 Sheets 동기화 실패 (백업은 완료):', sheetsErr);
            }

            // 3) 성적 → Google Sheets
            setBackupStatus('성적 동기화 중...');
            try {
                const savedGrades = localStorage.getItem(`grade_data_${classId}`);
                const savedCriteria = localStorage.getItem(`grade_criteria_${classId}`);
                const savedGroups = localStorage.getItem(`grade_groups_${classId}`);

                if (savedGrades) {
                    const gradeData = JSON.parse(savedGrades);
                    const criteriaTemplates = savedCriteria ? JSON.parse(savedCriteria) : [];
                    const gradeGroups = savedGroups ? JSON.parse(savedGroups) : [];
                    await exportGradesToSheet(token, students, gradeData, criteriaTemplates, gradeGroups, className);
                }
            } catch (gradeErr) {
                console.warn('성적 Sheets 동기화 실패 (백업은 완료):', gradeErr);
            }

            setBackupDone(true);
            setBackupStatus('');
            setTimeout(() => setBackupDone(false), 5000);
        } catch (error) {
            console.error('Quick backup failed:', error);
            alert('백업 실패: ' + (error.message || '다시 시도해주세요.'));
            setBackupStatus('');
        } finally {
            setIsBackingUp(false);
        }
    };

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
    };

    return (
        <div className="layout">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div className="mobile-sidebar-overlay" onClick={closeSidebar}></div>
            )}

            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

            <main className="main-content">
                <div className="main-header">
                    <div className="header-left">
                        <button className="hamburger-btn" onClick={toggleSidebar}>
                            ☰
                        </button>
                        <div className="class-info">
                            <h2>{currentClass?.name}</h2>
                            <p>{currentClass?.year}년</p>
                        </div>

                        {needRefresh && (
                            <div className="update-notification" style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', backgroundColor: '#eff6ff', padding: '0.25rem 0.75rem', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                <span style={{ fontSize: '0.8rem', color: '#1e40af', fontWeight: '500' }}>
                                    🔔 업데이트가 준비되었습니다. 설정에서 업데이트 하세요.
                                </span>
                            </div>
                        )}

                        {/* Global Save Status Indicator */}
                        <div className="header-save-status">
                            <span className="status-text">{getTimeText()}</span>
                        </div>
                    </div>
                    <div className="header-actions">
                        <button
                            onClick={handleQuickBackup}
                            className={`backup-btn-header ${!isGoogleConnected ? 'disabled' : ''} ${backupDone ? 'done' : ''}`}
                            disabled={!isGoogleConnected || isBackingUp}
                            title={!isGoogleConnected ? 'Google 계정 연결 후 사용 가능' : '데이터를 Google Drive에 백업'}
                        >
                            {isBackingUp ? `⏳ ${backupStatus || '준비 중...'}` : backupDone ? '✅ 완료' : <><svg width="16" height="14" viewBox="0 0 87.3 78" style={{ verticalAlign: 'middle', marginRight: '0.35rem' }}><path d="M6.6 66.85L15.75 78h55.65l9.15-11.15z" fill="#2196F3" /><path d="M58.8 0H28.5L0 49.1l15.75 28.9L44.25 28.9z" fill="#FFC107" /><path d="M87.3 49.1L58.8 0 44.25 28.9 58.8 57.8l13.35 20.2z" fill="#4CAF50" /><path d="M29.25 57.8L15.75 78h55.65l13.35-20.2z" fill="#2196F3" opacity="0" /></svg>백업</>}
                        </button>
                        <button onClick={handleChangeClass} className="change-class-btn">
                            학급 변경
                        </button>
                        <button onClick={handleLogout} className="logout-btn-header">
                            로그아웃
                        </button>
                    </div>
                </div>
                <div className="page-content">
                    <Outlet />
                </div>
            </main>

            {/* PWA Install Banner */}
            <InstallBanner isInstallable={isInstallable} onInstall={promptInstall} />
        </div>
    );
};

export default Layout;
