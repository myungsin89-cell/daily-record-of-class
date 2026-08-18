import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPIKey } from '../context/APIKeyContext';
import { useStudentContext } from '../context/StudentContext';
import { useUpdate } from '../context/UpdateContext';
import { useGoogle } from '../context/GoogleContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { exportAllData, importAllData } from '../db/indexedDB';
import { fetchKoreanHolidays } from '../utils/holidayAPI';
import {
    getAutoBackupConfig,
    setAutoBackupEnabled,
    selectBackupFolder,
    performAutoBackup,
    performManualDatedBackup,
    isElectronEnv
} from '../services/autoBackupService';
import {
    uploadToDrive,
    listDriveBackups,
    downloadFromDrive,
    exportJournalsToSheet,
    exportGradesToSheet,
} from '../services/googleService';
import Button from '../components/Button';
import { MenuIcon } from '../components/SidebarIcons';
import { useModal } from '../context/ModalContext';
import { CHANGELOG, APP_VERSION } from '../changelog';
import FeedbackModal from '../components/FeedbackModal';
import { trackEvent } from '../utils/analytics';
import './Settings.css';

const Settings = () => {
    const { showAlert, showConfirm } = useModal();
    const { apiKey, isConnected, saveAPIKey, deleteAPIKey, testConnection } = useAPIKey();
    const { students, holidays, addHoliday, removeHoliday, journals } = useStudentContext();
    const { needRefresh, updateServiceWorker } = useUpdate();
    const { isGoogleConnected, googleUser, connectGoogle, disconnectGoogle, getValidToken, isLoading: isGoogleLoading, error: googleError } = useGoogle();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [inputKey, setInputKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showKeyChange, setShowKeyChange] = useState(false);
    const [showSetupGuide, setShowSetupGuide] = useState(false);
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [newHolidayDate, setNewHolidayDate] = useState('');
    const [newHolidayName, setNewHolidayName] = useState('');
    const [showAutoFetchModal, setShowAutoFetchModal] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);

    // 자동 백업 상태
    const [autoBackupConfig, setAutoBackupConfigState] = useState(getAutoBackupConfig);
    const [isBackingUpNow, setIsBackingUpNow] = useState(false);

    useEffect(() => {
        const updateConfig = () => {
            setAutoBackupConfigState(getAutoBackupConfig());
        };
        window.addEventListener('autoBackupConfigChanged', updateConfig);
        return () => window.removeEventListener('autoBackupConfigChanged', updateConfig);
    }, []);

    // 게시판(메뉴) 편집 상태
    const [sidebarMenuItems, setSidebarMenuItems] = useState(() => {
        const defaultItems = [
            { id: 'diary', label: '다이어리', hidden: false },
            { id: 'notepad', label: '메모장', hidden: false },
            { id: 'attendance', label: '출석 체크', hidden: false },
            { id: 'journal', label: '학생 기록', hidden: false },
            { id: 'grades', label: '성적 입력', hidden: false },
            { id: 'budget', label: '예산 관리', hidden: false },
            { id: 'assignments', label: '제출 체크', hidden: false },
            { id: 'seating', label: '자리 배치', hidden: false },
            { id: 'random-order', label: '랜덤 순서', hidden: false },
            { id: 'class-role', label: '일인 일역', hidden: false },
        ];
        const saved = localStorage.getItem('menuOrder');
        if (saved) {
            const savedItems = JSON.parse(saved);
            return defaultItems.map(d => {
                const found = savedItems.find(s => s.id === d.id);
                return { ...d, hidden: found?.hidden || false };
            });
        }
        return defaultItems;
    });

    const handleMenuToggle = (menuId) => {
        setSidebarMenuItems(prev => {
            const updated = prev.map(item =>
                item.id === menuId ? { ...item, hidden: !item.hidden } : item
            );
            // localStorage의 menuOrder도 업데이트
            const saved = localStorage.getItem('menuOrder');
            if (saved) {
                const savedItems = JSON.parse(saved);
                const updatedSaved = savedItems.map(item =>
                    item.id === menuId ? { ...item, hidden: !item.hidden } : item
                );
                localStorage.setItem('menuOrder', JSON.stringify(updatedSaved));
            } else {
                localStorage.setItem('menuOrder', JSON.stringify(updated.map(item => ({
                    id: item.id, label: item.label, hidden: item.hidden,
                    to: item.id === 'diary' ? '/' : item.id === 'notepad' ? '/notepad' : item.id === 'attendance' ? '/attendance' : item.id === 'journal' ? '/journal-entry' : item.id === 'grades' ? '/grades' : item.id === 'budget' ? '/budget' : item.id === 'seating' ? '/seating' : item.id === 'random-order' ? '/random-order' : item.id === 'class-role' ? '/class-role' : '/assignments'
                }))));
            }
            // 사이드바에 즉시 반영
            window.dispatchEvent(new Event('menuOrderUpdated'));
            return updated;
        });
    };
    const [fetchYear, setFetchYear] = useState(new Date().getFullYear());
    const [isFetchingHolidays, setIsFetchingHolidays] = useState(false);
    const [isHolidayListExpanded, setIsHolidayListExpanded] = useState(false);
    const [replaceExisting, setReplaceExisting] = useState(false);

    // Google 연동 상태
    const [isGoogleBusy, setIsGoogleBusy] = useState(false);
    const [showDriveBackups, setShowDriveBackups] = useState(false);
    const [driveBackups, setDriveBackups] = useState([]);

    const handleSaveAPIKey = async () => {
        if (!inputKey.trim()) {
            setMessage({ type: 'error', text: 'API 키를 입력해주세요.' });
            return;
        }

        setIsSaving(true);
        setMessage({ type: '', text: '' });

        const result = await saveAPIKey(inputKey.trim());

        setIsSaving(false);

        if (result.success) {
            setMessage({ type: 'success', text: '✅ API 키가 성공적으로 저장되었습니다!' });
            setInputKey('');
        } else {
            setMessage({ type: 'error', text: `❌ ${result.error}` });
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setMessage({ type: '', text: '' });

        const result = await testConnection();

        setIsTesting(false);

        if (result.success) {
            setMessage({ type: 'success', text: '✅ API 연결 성공! 정상 작동합니다.' });
        } else {
            setMessage({ type: 'error', text: `❌ ${result.error}` });
        }
    };

    const handleDeleteAPIKey = async () => {
        const confirmed = await showConfirm('정말로 API 키를 삭제하시겠습니까? AI 기능을 사용할 수 없게 됩니다.', 'API 키 삭제', '삭제', '취소');
        if (!confirmed) {
            return;
        }

        setMessage({ type: '', text: '' });
        const result = await deleteAPIKey();

        if (result.success) {
            setInputKey(''); // Clear input field after successful deletion
            setMessage({ type: 'success', text: '✅ API 키가 삭제되었습니다.' });
        } else {
            setMessage({ type: 'error', text: `❌ ${result.error}` });
        }
    };

    // 자동 백업 토글
    const handleToggleAutoBackup = async () => {
        const nextState = !autoBackupConfig.enabled;
        setAutoBackupEnabled(nextState);
        if (nextState && !autoBackupConfig.folder) {
            await showAlert('자동 백업 폴더를 먼저 지정해주세요.\n폴더를 지정하면 주기적으로 최신 데이터가 자동 덮어쓰기됩니다.', '자동 백업 안내', '확인', 'alert');
        } else if (nextState) {
            await showAlert('자동 백업이 활성화되었습니다.\n앱 사용 중 10분 주기 및 시작 시 자동으로 최신 데이터가 덮어쓰기 저장됩니다.', '자동 백업 활성', '확인', 'success');
            performAutoBackup().catch(() => {});
        }
    };

    // 폴더 선택
    const handleSelectFolder = async () => {
        const res = await selectBackupFolder();
        if (res.success) {
            await showAlert(`백업 폴더가 지정되었습니다:\n${res.folder}`, '폴더 지정 완료', '확인', 'success');
            // 폴더 지정 시 즉시 1회 백업 실행
            if (autoBackupConfig.enabled) {
                performAutoBackup().catch(() => {});
            }
        } else if (res.error && res.error !== '폴더 선택이 취소되었습니다.') {
            await showAlert(res.error, '폴더 선택 오류', '확인', 'error');
        }
    };

    // 지금 즉시 자동 백업 실행 (덮어쓰기)
    const handleRunAutoBackupNow = async () => {
        setIsBackingUpNow(true);
        const res = await performAutoBackup(true);
        setIsBackingUpNow(false);
        if (res.success) {
            await showAlert(
                `최신 데이터가 성공적으로 백업(덮어쓰기)되었습니다!\n\n저장 경로: ${res.path || '지정 폴더'}`,
                '자동 백업 완료',
                '확인',
                'success'
            );
        } else if (res.error && res.error !== '폴더 선택이 취소되었습니다.') {
            await showAlert(`백업 실패: ${res.error}`, '백업 오류', '확인', 'error');
        }
    };

    // 수동 백업 (날짜별 별도 보관)
    const handleManualExport = async () => {
        setIsBackingUpNow(true);
        const res = await performManualDatedBackup();
        setIsBackingUpNow(false);
        if (res.success) {
            await showAlert(
                `오늘 날짜 백업 파일(${res.fileName})이 성공적으로 생성되었습니다.\n다운로드 폴더 및 지정 폴더를 확인해주세요.`,
                '날짜별 수동 백업 완료',
                '확인',
                'success'
            );
        } else {
            await showAlert(`백업 실패: ${res.error}`, '백업 오류', '확인', 'error');
        }
    };

    const handleImportData = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            console.log('Reading import file...');
            const text = await file.text();
            const data = JSON.parse(text);

            const confirmed = await showConfirm(
                '기존 데이터를 모두 덮어쓰시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
                '데이터 복원 확인',
                '복원하기',
                '취소'
            );

            if (!confirmed) {
                event.target.value = '';
                return;
            }

            console.log('Starting import...');
            await importAllData(data);
            console.log('Import completed successfully');

            await showAlert(
                '데이터가 성공적으로 복원되었습니다!\n잠시 후 화면이 새로고침됩니다.',
                '복원 완료',
                '확인',
                'success'
            );

            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error) {
            console.error('Import error:', error);
            await showAlert(`데이터 복원 실패: ${error.message}`, '복원 오류', '확인', 'error');
        }

        event.target.value = '';
    };

    const handleAddHoliday = () => {
        if (!newHolidayDate) {
            showAlert('날짜를 선택해주세요.', '공휴일 추가', '확인', 'alert');
            return;
        }
        if (!newHolidayName.trim()) {
            showAlert('공휴일 이름을 입력해주세요.', '공휴일 추가', '확인', 'alert');
            return;
        }

        addHoliday({ date: newHolidayDate, name: newHolidayName.trim() });
        setNewHolidayDate('');
        setNewHolidayName('');
        setShowHolidayModal(false);
        showAlert('공휴일이 추가되었습니다.', '공휴일 추가 완료', '확인', 'success');
    };

    const handleRemoveHoliday = async (holiday) => {
        const confirmed = await showConfirm(
            `${holiday.name} (${holiday.date}) 공휴일을 삭제하시겠습니까?`,
            '공휴일 삭제',
            '삭제',
            '취소'
        );
        if (confirmed) {
            removeHoliday(holiday.date);
            showAlert('공휴일이 삭제되었습니다.', '삭제 완료', '확인', 'success');
        }
    };

    const handleFetchKoreanHolidays = async () => {
        if (!fetchYear) {
            showAlert('연도를 선택해주세요.', '공휴일 가져오기', '확인', 'alert');
            return;
        }

        setIsFetchingHolidays(true);

        try {
            const fetchedHolidays = await fetchKoreanHolidays(fetchYear);

            if (fetchedHolidays.length === 0) {
                showAlert('공휴일 정보를 가져오지 못했습니다.', '가져오기 실패', '확인', 'error');
                setIsFetchingHolidays(false);
                return;
            }

            // "기존 공휴일 먼저 삭제" 옵션 처리
            if (replaceExisting && holidays.length > 0) {
                const existingHolidays = [...holidays];
                for (const holiday of existingHolidays) {
                    const date = typeof holiday === 'string' ? holiday : holiday.date;
                    removeHoliday(date);
                }
            }

            // 중복 체크 및 추가
            let addedCount = 0;
            const existingDates = holidays.map(h => typeof h === 'string' ? h : h.date);

            for (const holiday of fetchedHolidays) {
                if (!existingDates.includes(holiday.date) || replaceExisting) {
                    addHoliday(holiday);
                    addedCount++;
                }
            }

            setShowAutoFetchModal(false);
            await showAlert(
                `${fetchYear}년 공휴일 ${fetchedHolidays.length}개 중 ${addedCount}개가 추가되었습니다.`,
                '공휴일 자동 가져오기 완료',
                '확인',
                'success'
            );
        } catch (error) {
            await showAlert(
                `공휴일 가져오기 실패: ${error.message || '네트워크 오류'}`,
                '가져오기 오류',
                '확인',
                'error'
            );
        } finally {
            setIsFetchingHolidays(false);
        }
    };

    // ==================== Google 연동 핸들러 ====================

    const handleGoogleConnect = () => {
        setMessage({ type: '', text: '' });
        connectGoogle();
    };

    const handleGoogleDisconnect = async () => {
        const confirmed = await showConfirm('Google 계정 연결을 해제하시겠습니까?', 'Google 연결 해제', '해제', '취소');
        if (!confirmed) return;
        disconnectGoogle();
        setMessage({ type: 'success', text: '✅ Google 계정 연결이 해제되었습니다.' });
    };

    const handleDriveBackup = async () => {
        setIsGoogleBusy(true);
        setMessage({ type: '', text: '' });
        try {
            const token = await getValidToken();
            const data = await exportAllData();
            const fileName = `학급일지_백업_${new Date().toISOString().split('T')[0]}.json`;
            await uploadToDrive(token, data, fileName);
            setMessage({ type: 'success', text: '✅ Google Drive에 백업이 완료되었습니다!' });
        } catch (error) {
            console.error('Drive backup error:', error);
            setMessage({ type: 'error', text: `❌ Drive 백업 실패: ${error.message}` });
        } finally {
            setIsGoogleBusy(false);
        }
    };

    const handleListDriveBackups = async () => {
        setIsGoogleBusy(true);
        try {
            const token = await getValidToken();
            const backups = await listDriveBackups(token);
            setDriveBackups(backups);
            setShowDriveBackups(true);
        } catch (error) {
            console.error('Drive list error:', error);
            setMessage({ type: 'error', text: `❌ 백업 목록 조회 실패: ${error.message}` });
        } finally {
            setIsGoogleBusy(false);
        }
    };

    const handleDriveRestore = async (fileId, fileName) => {
        const confirmed = await showConfirm(`"${fileName}" 파일로 복원하시겠습니까?\n기존 데이터가 덮어씌워집니다.`, '데이터 복원 확인', '복원', '취소');
        if (!confirmed) return;
        setIsGoogleBusy(true);
        setMessage({ type: '', text: '' });
        try {
            const token = await getValidToken();
            const data = await downloadFromDrive(token, fileId);
            await importAllData(data);
            setMessage({ type: 'success', text: '✅ Drive에서 데이터가 복원되었습니다! 잠시 후 새로고침됩니다.' });
            setShowDriveBackups(false);
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error('Drive restore error:', error);
            setMessage({ type: 'error', text: `❌ 복원 실패: ${error.message}` });
        } finally {
            setIsGoogleBusy(false);
        }
    };

    const handleExportJournalsToSheet = async () => {
        setIsGoogleBusy(true);
        setMessage({ type: '', text: '' });
        try {
            const token = await getValidToken();
            const className = currentClass?.name || '학급';
            const result = await exportJournalsToSheet(token, students, journals, className);
            setMessage({
                type: 'success',
                text: `✅ 학생 기록이 Google Sheets로 내보내졌습니다!`,
            });
            // 새 탭에서 시트 열기
            if (result.spreadsheetUrl) {
                window.open(result.spreadsheetUrl, '_blank');
            }
        } catch (error) {
            console.error('Sheets export error:', error);
            setMessage({ type: 'error', text: `❌ 시트 내보내기 실패: ${error.message}` });
        } finally {
            setIsGoogleBusy(false);
        }
    };

    const handleExportGradesToSheet = async () => {
        setIsGoogleBusy(true);
        setMessage({ type: '', text: '' });
        try {
            const token = await getValidToken();
            const className = currentClass?.name || '학급';
            const rawClassId = currentClass?.id || 'default';
            const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

            // localStorage에서 성적 데이터 로드
            const savedGrades = localStorage.getItem(`grade_data_${classId}`);
            const savedCriteria = localStorage.getItem(`grade_criteria_${classId}`);
            const savedGroups = localStorage.getItem(`grade_groups_${classId}`);

            const gradeData = savedGrades ? JSON.parse(savedGrades) : {};
            const criteriaTemplates = savedCriteria ? JSON.parse(savedCriteria) : [];
            const gradeGroups = savedGroups ? JSON.parse(savedGroups) : [];

            if (Object.keys(gradeData).length === 0) {
                setMessage({ type: 'error', text: '❌ 내보낼 성적 데이터가 없습니다.' });
                setIsGoogleBusy(false);
                return;
            }

            const result = await exportGradesToSheet(token, students, gradeData, criteriaTemplates, gradeGroups, className);
            setMessage({
                type: 'success',
                text: `✅ 성적이 Google Sheets로 내보내졌습니다!`,
            });
            if (result.spreadsheetUrl) {
                window.open(result.spreadsheetUrl, '_blank');
            }
        } catch (error) {
            console.error('Grades sheets export error:', error);
            setMessage({ type: 'error', text: `❌ 성적 내보내기 실패: ${error.message}` });
        } finally {
            setIsGoogleBusy(false);
        }
    };

    return (
        <div className="settings-container">
            <div className="settings-header">
                <div className="settings-title-group">
                    <h1 className="settings-main-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="settings-header-icon">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        설정
                    </h1>
                    <p className="settings-subtitle">학급일지 기능 및 앱 환경을 설정할 수 있습니다.</p>
                </div>
            </div>

            {/* Message Banner */}
            {message.text && (
                <div className={`message-banner ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* 1. 게시판(메뉴) 편집 */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="settings-card-title-wrap">
                        <span className="card-icon-badge">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="3" y1="9" x2="21" y2="9" />
                                <line x1="9" y1="21" x2="9" y2="9" />
                            </svg>
                        </span>
                        <div>
                            <h2>게시판 편집</h2>
                            <p className="section-description">
                                왼쪽 사이드바에 표시할 메뉴를 자유롭게 켜고 끌 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="menu-toggle-grid">
                    {sidebarMenuItems.map(item => {
                        const isVisible = !item.hidden;

                        return (
                            <div
                                key={item.id}
                                className={`menu-toggle-item ${isVisible ? 'active' : 'inactive'}`}
                                onClick={() => handleMenuToggle(item.id)}
                            >
                                <div className="menu-toggle-left">
                                    <span className="menu-icon-wrap">
                                        <MenuIcon id={item.id} size={18} />
                                    </span>
                                    <span className="menu-label-text">{item.label}</span>
                                </div>
                                <div className={`modern-switch ${isVisible ? 'checked' : ''}`}>
                                    <div className="switch-handle" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. 공휴일 관리 */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="settings-card-title-wrap">
                        <span className="card-icon-badge">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </span>
                        <div>
                            <h2>공휴일 관리</h2>
                            <p className="section-description">
                                교육과정일수 계산에서 제외할 공휴일을 관리할 수 있습니다. (주말은 자동 제외)
                            </p>
                        </div>
                    </div>
                </div>

                {/* Auto Fetch Banner */}
                <div className="holiday-fetch-box">
                    <div className="holiday-fetch-info">
                        <div className="fetch-title">
                            <strong>한국 공휴일 자동 가져오기</strong>
                            <span className="clean-badge">공공데이터</span>
                        </div>
                        <p>한국천문연구원 공식 데이터를 통해 법정 공휴일을 간편하게 불러옵니다.</p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setShowAutoFetchModal(true)}
                        className="holiday-fetch-btn"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        자동 가져오기
                    </Button>
                </div>

                {/* Holiday List Card */}
                <div className="holiday-list-container">
                    <div className="holiday-list-header">
                        <div className="holiday-count-title" onClick={() => setIsHolidayListExpanded(!isHolidayListExpanded)}>
                            <button
                                className="toggle-arrow-btn"
                                title={isHolidayListExpanded ? '목록 접기' : '목록 펼치기'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isHolidayListExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                            <span>등록된 공휴일 <strong>{holidays ? holidays.length : 0}개</strong></span>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setShowHolidayModal(true)}
                            size="small"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            직접 추가
                        </Button>
                    </div>

                    {isHolidayListExpanded && (
                        <div className="holiday-expanded-area">
                            {!holidays || holidays.length === 0 ? (
                                <p className="empty-message">등록된 공휴일이 없습니다.</p>
                            ) : (
                                <div className="holiday-chips-grid">
                                    {holidays.map((holiday) => {
                                        const holidayDate = typeof holiday === 'string' ? holiday : holiday.date;
                                        const holidayName = typeof holiday === 'string' ? '' : holiday.name;
                                        const dateObj = new Date(holidayDate);
                                        const formatted = dateObj.toLocaleDateString('ko-KR', {
                                            month: 'long',
                                            day: 'numeric',
                                            weekday: 'short'
                                        });
                                        return (
                                            <div key={holidayDate} className="holiday-chip">
                                                <div className="holiday-chip-info">
                                                    <span className="holiday-chip-name">{holidayName || '공휴일'}</span>
                                                    <span className="holiday-chip-date">{formatted}</span>
                                                </div>
                                                <button
                                                    className="delete-holiday-icon-btn"
                                                    onClick={() => handleRemoveHoliday(typeof holiday === 'string' ? { date: holiday, name: '' } : holiday)}
                                                    title="삭제"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. 데이터 백업 및 복구 (로컬) */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="settings-card-title-wrap">
                        <span className="card-icon-badge">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                        </span>
                        <div>
                            <h2>데이터 백업 및 복구 (로컬)</h2>
                            <p className="section-description">
                                지정한 폴더에 최신 데이터를 자동으로 덮어쓰기 백업하고, 필요 시 날짜별로 안전하게 보관하거나 복원할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 자동 백업 설정 패널 (항상 최신 유지 덮어쓰기) */}
                <div className="auto-backup-panel">
                    <div className="auto-backup-header" onClick={handleToggleAutoBackup}>
                        <div className="auto-backup-title-info">
                            <div className="title-row">
                                <strong>지정 폴더 자동 백업 (항상 최신 덮어쓰기)</strong>
                                <span className={`status-pill ${autoBackupConfig.enabled ? 'active' : 'inactive'}`}>
                                    {autoBackupConfig.enabled ? '자동 백업 활성' : '비활성'}
                                </span>
                            </div>
                            <p className="auto-backup-desc">
                                앱 사용 중 10분 주기 및 시작 시 지정된 폴더의 <code>class-diary-latest-backup.json</code> 파일에 항상 최신 데이터를 덮어씁니다.
                            </p>
                        </div>
                        <div className={`modern-switch ${autoBackupConfig.enabled ? 'checked' : ''}`}>
                            <div className="switch-handle" />
                        </div>
                    </div>

                    <div className="auto-backup-body">
                        {/* 폴더 선택 바 */}
                        <div className="folder-selection-row">
                            <div className="folder-path-display">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="folder-icon">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                <span className="path-text" title={autoBackupConfig.folder || '폴더 미지정'}>
                                    {autoBackupConfig.folder ? autoBackupConfig.folder : '지정된 백업 폴더가 없습니다. 폴더를 선택해주세요.'}
                                </span>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={handleSelectFolder}
                                size="small"
                                className="folder-select-btn"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                {autoBackupConfig.folder ? '폴더 변경' : '폴더 선택'}
                            </Button>
                        </div>

                        {/* 백업 상태 및 즉시 백업 버튼 */}
                        <div className="backup-status-bar">
                            <div className="last-backup-time">
                                <span className="time-label">마지막 최신 백업 일시:</span>
                                <strong className="time-value">
                                    {autoBackupConfig.lastTime
                                        ? new Date(autoBackupConfig.lastTime).toLocaleString('ko-KR', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit'
                                        })
                                        : '아직 백업 이력이 없습니다.'}
                                </strong>
                            </div>
                            <Button
                                variant="primary"
                                size="small"
                                onClick={handleRunAutoBackupNow}
                                disabled={isBackingUpNow}
                                className="instant-backup-btn"
                            >
                                {isBackingUpNow ? (
                                    '백업 중...'
                                ) : (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                            <polyline points="23 4 23 10 17 10" />
                                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                        </svg>
                                        지금 최신 덮어쓰기 백업
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 하단: 날짜별 수동 백업 및 복구 카드 */}
                <div className="backup-action-grid" style={{ marginTop: '1.25rem' }}>
                    {/* 날짜별 별도 보관 */}
                    <div className="backup-box">
                        <div className="backup-box-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </div>
                        <div className="backup-box-content">
                            <strong>날짜별 수동 백업 (별도 보관)</strong>
                            <p>오늘 날짜가 포함된 별도 백업 파일(JSON)을 생성하여 보관합니다.</p>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={handleManualExport}
                            disabled={isBackingUpNow}
                            className="backup-btn"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            날짜별 백업 다운로드
                        </Button>
                    </div>

                    {/* 데이터 복구 */}
                    <div className="backup-box">
                        <div className="backup-box-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <div className="backup-box-content">
                            <strong>데이터 파일 가져오기 (복구)</strong>
                            <p>이전에 백업해 둔 JSON 파일을 선택하여 전체 데이터를 원상태로 복원합니다.</p>
                        </div>
                        <label className="import-button-wrapper">
                            <Button variant="secondary" as="span" className="backup-btn">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                파일 선택 및 복원
                            </Button>
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImportData}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* 4. 앱 정보 */}
            <div className="settings-card app-info-card">
                <div className="settings-card-header">
                    <div className="settings-card-title-wrap">
                        <span className="card-icon-badge">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                        </span>
                        <div>
                            <h2>앱 정보</h2>
                            <p className="section-description">
                                현재 실행 중인 학급일지 애플리케이션의 버전 및 시스템 상태입니다.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="info-cards-row">
                    <div className="app-info-tile">
                        <span className="info-tile-label">버전</span>
                        <span className="info-tile-value highlight">v{APP_VERSION}</span>
                    </div>
                    <div className="app-info-tile">
                        <span className="info-tile-label">데이터 저장소</span>
                        <span className="info-tile-value">IndexedDB</span>
                    </div>
                    <div className="app-info-tile">
                        <span className="info-tile-label">업데이트 상태</span>
                        <span className="info-tile-value">
                            {needRefresh ? (
                                <span style={{ color: '#ea580c', fontWeight: 600 }}>새 버전 사용 가능</span>
                            ) : (
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>최신 버전</span>
                            )}
                        </span>
                    </div>
                    <div 
                        className="app-info-tile" 
                        style={{ cursor: 'pointer', background: '#f0fdf4', borderColor: '#bbf7d0' }}
                        onClick={() => {
                            trackEvent('click_feedback_button');
                            setShowFeedbackModal(true);
                        }}
                        title="개선 의견 및 피드백 남기기"
                    >
                        <span className="info-tile-label" style={{ color: '#15803d' }}>사용자 피드백</span>
                        <span className="info-tile-value" style={{ color: '#16a34a', fontWeight: 800, fontSize: '0.88rem' }}>
                            개선 의견 보내기 ↗
                        </span>
                    </div>
                </div>

                {needRefresh && (
                    <div className="update-prompt-box">
                        <p>새로운 기능과 성능이 개선된 새 버전이 준비되었습니다.</p>
                        <Button variant="primary" onClick={() => updateServiceWorker()} size="small">
                            지금 업데이트 적용
                        </Button>
                    </div>
                )}
            </div>

            {/* Holiday Add Modal */}
            {showHolidayModal && (
                <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>공휴일 직접 추가</h3>
                            <button className="modal-close" onClick={() => setShowHolidayModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="holiday-date">날짜</label>
                                <input
                                    id="holiday-date"
                                    type="date"
                                    className="form-input"
                                    value={newHolidayDate}
                                    onChange={(e) => setNewHolidayDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="holiday-name">공휴일 이름</label>
                                <input
                                    id="holiday-name"
                                    type="text"
                                    className="form-input"
                                    placeholder="예: 설날, 어린이날, 개교기념일 등"
                                    value={newHolidayName}
                                    onChange={(e) => setNewHolidayName(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddHoliday()}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Button variant="secondary" onClick={() => setShowHolidayModal(false)}>
                                취소
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleAddHoliday}
                                disabled={!newHolidayDate || !newHolidayName.trim()}
                            >
                                추가
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Auto Fetch Holiday Modal */}
            {showAutoFetchModal && (
                <div className="modal-overlay" onClick={() => !isFetchingHolidays && setShowAutoFetchModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>한국 공휴일 자동 가져오기</h3>
                            <button
                                className="modal-close"
                                onClick={() => setShowAutoFetchModal(false)}
                                disabled={isFetchingHolidays}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="fetch-year">연도 선택</label>
                                <select
                                    id="fetch-year"
                                    className="form-input"
                                    value={fetchYear}
                                    onChange={(e) => setFetchYear(parseInt(e.target.value))}
                                    disabled={isFetchingHolidays}
                                >
                                    {Array.from({ length: 5 }, (_, i) => {
                                        const year = new Date().getFullYear() + i;
                                        return (
                                            <option key={year} value={year}>
                                                {year}년
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            {holidays && holidays.length > 0 && (
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={replaceExisting}
                                            onChange={(e) => setReplaceExisting(e.target.checked)}
                                            disabled={isFetchingHolidays}
                                            style={{ width: 'auto', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>기존 공휴일 먼저 삭제 후 새로 추가</span>
                                    </label>
                                    <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.25rem 0 0 1.5rem' }}>
                                        체크 시 현재 등록된 {holidays.length}개의 공휴일을 모두 초기화하고 해당 연도 공휴일을 불러옵니다.
                                    </p>
                                </div>
                            )}
                            <div className="help-tip">
                                한국천문연구원에서 제공하는 공식 공휴일 정보를 가져옵니다. 설날, 추석, 어린이날 등 법정 공휴일이 자동으로 등록됩니다.
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Button
                                variant="secondary"
                                onClick={() => setShowAutoFetchModal(false)}
                                disabled={isFetchingHolidays}
                            >
                                취소
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleFetchKoreanHolidays}
                                disabled={isFetchingHolidays}
                            >
                                {isFetchingHolidays ? '가져오는 중...' : '가져오기'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 개선 의견 보내기 전용 세련된 그린 모달 */}
            <FeedbackModal 
                isOpen={showFeedbackModal} 
                onClose={() => setShowFeedbackModal(false)} 
            />
        </div>
    );
};

export default Settings;
