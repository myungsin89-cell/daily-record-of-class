import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClass } from '../context/ClassContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import { useGoogle } from '../context/GoogleContext';
import { useStudentContext } from '../context/StudentContext';
import Sidebar from './Sidebar';
import './Layout.css';
import '../styles/glassTheme.css';
import { uploadToDrive, exportJournalsToSheet, exportGradesToSheet } from '../services/googleService';
import { exportAllData } from '../db/indexedDB';
import { useUpdate } from '../context/UpdateContext';
import { CHANGELOG, APP_VERSION } from '../changelog';

const Layout = () => {
    const { user, logout } = useAuth();
    const { currentClass, clearCurrentClass } = useClass();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });

    const toggleSidebarCollapse = () => {
        const nextState = !isSidebarCollapsed;
        setIsSidebarCollapsed(nextState);
        localStorage.setItem('sidebar_collapsed', String(nextState));
    };
    const { getTimeText, isSaving, lastSaved } = useSaveStatus();
    const { needRefresh } = useUpdate();
    const { isGoogleConnected, getValidToken } = useGoogle();
    const { students, journals } = useStudentContext();
    const [isBackingUp, setIsBackingUp] = React.useState(false);
    const [backupDone, setBackupDone] = React.useState(false);
    const [backupStatus, setBackupStatus] = React.useState('');

    const isElectron = window.electronAPI && window.electronAPI.isElectron;

    // Changelog modal
    const [showChangelog, setShowChangelog] = useState(false);
    const [changelogEntries, setChangelogEntries] = useState([]);

    // 업데이트 후 첫 접속 시 변경사항 모달 표시
    useEffect(() => {
        const lastSeenVersion = localStorage.getItem('app_last_seen_version');
        if (lastSeenVersion !== APP_VERSION) {
            // 마지막으로 본 버전 이후의 모든 변경사항 수집
            const newEntries = lastSeenVersion
                ? CHANGELOG.filter(entry => entry.version > lastSeenVersion)
                : CHANGELOG.filter(entry => entry.version === APP_VERSION);
            if (newEntries.length > 0) {
                setChangelogEntries(newEntries);
                setShowChangelog(true);
            }
        }
    }, []);

    const closeChangelog = () => {
        setShowChangelog(false);
        localStorage.setItem('app_last_seen_version', APP_VERSION);
    };

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
        <div className={`layout glass-app-wrapper ${isElectron ? 'is-desktop' : ''}`}>
            <div className="glass-layout-container">
                {/* Mobile Overlay */}
                {isSidebarOpen && (
                    <div className="mobile-sidebar-overlay" onClick={closeSidebar}></div>
                )}

                {/* 하나의 통합 유리 패널 */}
                <div className={`glass-unified-panel ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                    <Sidebar
                        isOpen={isSidebarOpen}
                        onClose={closeSidebar}
                        isCollapsed={isSidebarCollapsed}
                        onToggleCollapse={toggleSidebarCollapse}
                        className="glass-sidebar"
                    />

                    <main className="main-content glass-main-content">
                        <div className="page-content">
                            <Outlet />
                        </div>
                    </main>
                </div>{/* glass-unified-panel */}
            </div>{/* glass-layout-container */}

            {/* Changelog Modal */}
            {showChangelog && (
                <div className="changelog-overlay" onClick={closeChangelog}>
                    <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="changelog-close" onClick={closeChangelog}>×</button>
                        <div className="changelog-header">
                            <span className="changelog-icon">🎉</span>
                            <h2>업데이트 완료!</h2>
                            <p className="changelog-version">v{APP_VERSION}</p>
                        </div>
                        <div className="changelog-body">
                            {changelogEntries.map((entry) => (
                                <div key={entry.version} className="changelog-entry">
                                    <div className="changelog-entry-header">
                                        <span className="changelog-entry-title">{entry.title}</span>
                                        <span className="changelog-entry-date">{entry.date}</span>
                                    </div>
                                    <ul className="changelog-list">
                                        {entry.changes.map((change, i) => (
                                            <li key={i}>{change}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <button className="changelog-confirm" onClick={closeChangelog}>
                            확인
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
