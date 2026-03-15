import React, { useState } from 'react';
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
    uploadToDrive,
    listDriveBackups,
    downloadFromDrive,
    exportJournalsToSheet,
    exportGradesToSheet,
} from '../services/googleService';
import Button from '../components/Button';
import { APP_VERSION } from '../changelog';
import './Settings.css';

const Settings = () => {
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
                    to: item.id === 'diary' ? '/' : item.id === 'notepad' ? '/notepad' : item.id === 'attendance' ? '/attendance' : item.id === 'journal' ? '/journal-entry' : item.id === 'grades' ? '/grades' : item.id === 'budget' ? '/budget' : item.id === 'seating' ? '/seating' : '/assignments'
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
        if (!window.confirm('정말로 API 키를 삭제하시겠습니까? AI 기능을 사용할 수 없게 됩니다.')) {
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

    const handleExportData = async () => {
        try {
            const data = await exportAllData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `class-diary-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: '✅ 데이터가 성공적으로 내보내졌습니다!' });
        } catch (error) {
            setMessage({ type: 'error', text: `❌ 데이터 내보내기 실패: ${error.message}` });
        }
    };

    const handleImportData = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            console.log('Reading import file...');
            const text = await file.text();
            const data = JSON.parse(text);

            console.log('Import data:', data);

            if (!confirm('기존 데이터를 모두 덮어쓰시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                event.target.value = '';
                return;
            }

            console.log('Starting import...');
            await importAllData(data);
            console.log('Import completed successfully');

            setMessage({ type: 'success', text: '✅ 데이터가 성공적으로 복원되었습니다!' });

            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error) {
            console.error('Import error:', error);
            setMessage({ type: 'error', text: `❌ 데이터 복원 실패: ${error.message}` });
        }

        event.target.value = '';
    };

    const handleAddHoliday = () => {
        if (!newHolidayDate) {
            setMessage({ type: 'error', text: '날짜를 선택해주세요.' });
            return;
        }
        if (!newHolidayName.trim()) {
            setMessage({ type: 'error', text: '공휴일 이름을 입력해주세요.' });
            return;
        }

        addHoliday({ date: newHolidayDate, name: newHolidayName.trim() });
        setNewHolidayDate('');
        setNewHolidayName('');
        setShowHolidayModal(false);
        setMessage({ type: 'success', text: '✅ 공휴일이 추가되었습니다.' });
    };

    const handleRemoveHoliday = (holiday) => {
        if (confirm(`${holiday.name} (${holiday.date}) 공휴일을 삭제하시겠습니까?`)) {
            removeHoliday(holiday.date);
            setMessage({ type: 'success', text: '✅ 공휴일이 삭제되었습니다.' });
        }
    };

    const handleFetchKoreanHolidays = async () => {
        if (!fetchYear) {
            setMessage({ type: 'error', text: '연도를 선택해주세요.' });
            return;
        }

        setIsFetchingHolidays(true);
        setMessage({ type: '', text: '' });

        try {
            const fetchedHolidays = await fetchKoreanHolidays(fetchYear);

            if (fetchedHolidays.length === 0) {
                setMessage({ type: 'error', text: '공휴일 정보를 가져오지 못했습니다.' });
                setIsFetchingHolidays(false);
                return;
            }

            // "기존 공휴일 먼저 삭제" 옵션 처리
            if (replaceExisting && holidays.length > 0) {
                // 모든 기존 공휴일 삭제
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
            setMessage({
                type: 'success',
                text: `✅ ${fetchYear}년 공휴일 ${fetchedHolidays.length}개 중 ${addedCount}개가 추가되었습니다.`
            });
        } catch (error) {
            setMessage({
                type: 'error',
                text: `❌ 공휴일 가져오기 실패: ${error.message || '네트워크 오류'}`
            });
        } finally {
            setIsFetchingHolidays(false);
        }
    };

    // ==================== Google 연동 핸들러 ====================

    const handleGoogleConnect = () => {
        setMessage({ type: '', text: '' });
        connectGoogle();
    };

    const handleGoogleDisconnect = () => {
        if (!window.confirm('Google 계정 연결을 해제하시겠습니까?')) return;
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
        if (!window.confirm(`"${fileName}" 파일로 복원하시겠습니까?\n기존 데이터가 덮어씌워집니다.`)) return;
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
                <h1>⚙️ 설정</h1>
                <Button variant="secondary" onClick={() => navigate(-1)}>
                    ← 뒤로가기
                </Button>
            </div>

            {/* Message Banner */}
            {message.text && (
                <div className={`message-banner ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* AI Connection Section */}
            <div className="settings-section">
                <h2>🤖 AI 연결 설정</h2>

                {/* Connection Status */}
                <div className={`connection-status-card ${isConnected ? 'connected' : 'disconnected'}`}>
                    <div className="status-header">
                        <div className="status-icon">
                            {isConnected ? '🟢' : '🟡'}
                        </div>
                        <div className="status-info">
                            <h3>{isConnected ? 'AI 연결됨' : 'AI 연결 필요'}</h3>
                            <p>
                                {isConnected
                                    ? 'Google Gemini AI와 연결되어 있습니다.'
                                    : 'API 키를 등록하면 AI 기능을 사용할 수 있습니다.'}</p>
                        </div>
                    </div>

                    {isConnected && (
                        <div className="connection-actions">
                            <Button
                                variant="secondary"
                                onClick={handleTestConnection}
                                disabled={isTesting}
                                size="small"
                            >
                                {isTesting ? '테스트 중...' : '🔍 연결 테스트'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setShowKeyChange(!showKeyChange)}
                                size="small"
                            >
                                {showKeyChange ? '취소' : '변경'}
                            </Button>
                            <button
                                className="delete-api-button"
                                onClick={handleDeleteAPIKey}
                                type="button"
                            >
                                삭제
                            </button>
                        </div>
                    )}
                </div>

                {/* API Key Change - inside connected state */}
                {isConnected && showKeyChange && (
                    <div className="api-key-input-card" style={{ marginTop: '-0.5rem', marginBottom: 'var(--spacing-lg)', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
                        <label className="input-label">새 API 키 입력</label>
                        <div className="input-group">
                            <div className="input-with-toggle">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="api-key-input"
                                    placeholder="AIza로 시작하는 API 키를 입력하세요"
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSaveAPIKey()}
                                />
                                <button
                                    type="button"
                                    className="toggle-visibility-btn"
                                    onClick={() => setShowKey(!showKey)}
                                    title={showKey ? '키 숨기기' : '키 보기'}
                                >
                                    {showKey ? '숨기기' : '보기'}
                                </button>
                            </div>
                            <Button
                                variant="primary"
                                onClick={() => { handleSaveAPIKey(); setShowKeyChange(false); }}
                                disabled={isSaving || !inputKey.trim()}
                            >
                                {isSaving ? '저장 중...' : '💾 저장'}
                            </Button>
                        </div>
                    </div>
                )}

                {/* API Key Input - only when not connected */}
                {!isConnected && (
                    <div className="api-key-input-card">
                        <label className="input-label">API 키 입력</label>
                        <div className="input-group">
                            <div className="input-with-toggle">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="api-key-input"
                                    placeholder="AIza로 시작하는 API 키를 입력하세요"
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSaveAPIKey()}
                                />
                                <button
                                    type="button"
                                    className="toggle-visibility-btn"
                                    onClick={() => setShowKey(!showKey)}
                                    title={showKey ? '키 숨기기' : '키 보기'}
                                >
                                    {showKey ? '숨기기' : '보기'}
                                </button>
                            </div>
                            <Button
                                variant="primary"
                                onClick={handleSaveAPIKey}
                                disabled={isSaving || !inputKey.trim()}
                            >
                                {isSaving ? '저장 중...' : '💾 저장'}
                            </Button>
                        </div>
                    </div>
                )}

                {/* AI 연결 방법 - collapsible guide, only when not connected */}
                {!isConnected && (
                    <div className="api-setup-card">
                        <div
                            className="setup-header"
                            onClick={() => setShowSetupGuide(!showSetupGuide)}
                            style={{ cursor: 'pointer', marginBottom: showSetupGuide ? '1.5rem' : 0, paddingBottom: showSetupGuide ? '1rem' : 0, borderBottom: showSetupGuide ? '2px solid #f0f9ff' : 'none' }}
                        >
                            <h3>💡 AI 연결 방법</h3>
                            <span style={{ fontSize: '0.85rem', color: '#64748b', transition: 'transform 0.2s' }}>
                                {showSetupGuide ? '▲ 접기' : '▼ 펼치기'}
                            </span>
                        </div>

                        {showSetupGuide && (
                            <>
                                <div className="setup-steps">
                                    <div className="setup-step">
                                        <div className="step-number">1</div>
                                        <div className="step-content">
                                            <strong>API 키 발급</strong>
                                            <p>아래 버튼을 눌러 Google AI Studio에서 API 키를 무료로 발급받으세요.</p>
                                            <a
                                                href="https://aistudio.google.com/apikey"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="api-link-button"
                                            >
                                                🔑 API 키 발급받기
                                            </a>
                                        </div>
                                    </div>

                                    <div className="setup-step">
                                        <div className="step-number">2</div>
                                        <div className="step-content">
                                            <strong>API 키 복사</strong>
                                            <p>🔑 "API 키 만들기" 버튼을 눌러 생성된 키(AIza...로 시작)를 복사하세요.</p>
                                            <img
                                                src="/api-copy-guide.png"
                                                alt="API 키 복사 버튼 위치 안내"
                                                style={{
                                                    maxWidth: '100%',
                                                    width: '320px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e2e8f0',
                                                    marginTop: '0.25rem',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="setup-step">
                                        <div className="step-number">3</div>
                                        <div className="step-content">
                                            <strong>위 입력창에 붙여넣기</strong>
                                            <p>복사한 API 키를 붙여넣고 저장 버튼을 누르세요.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="help-tip">
                                    💡 Gmail 계정으로 로그인되어 있어야 하며, 발급받은 키는 안전하게 보관하세요.
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Holiday Management Section */}
            <div className="settings-section">
                <h2>📅 공휴일 관리</h2>
                <p className="section-description">
                    교육과정일수 계산에서 제외할 공휴일을 관리할 수 있습니다. (주말은 자동 제외)
                </p>

                {/* Auto Fetch Card */}
                <div className="api-setup-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="setup-header">
                        <h3>🇰🇷 한국 공휴일 자동 가져오기</h3>
                        <span className="free-badge">무료</span>
                    </div>
                    <div className="setup-steps">
                        <div className="setup-step">
                            <div className="step-number">📡</div>
                            <div className="step-content">
                                <strong>공공데이터 포털 연동</strong>
                                <p>한국천문연구원에서 제공하는 공식 공휴일 정보를 자동으로 가져옵니다.</p>
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                        <Button
                            variant="primary"
                            onClick={() => setShowAutoFetchModal(true)}
                        >
                            🚀 공휴일 자동 가져오기
                        </Button>
                    </div>
                </div>

                <div className="holiday-list">
                    <div className="holiday-list-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                                className="toggle-btn"
                                onClick={() => setIsHolidayListExpanded(!isHolidayListExpanded)}
                                title={isHolidayListExpanded ? '목록 접기' : '목록 펼치기'}
                            >
                                {isHolidayListExpanded ? '▼' : '▶'}
                            </button>
                            <h3>등록된 공휴일 ({holidays ? holidays.length : 0}개)</h3>
                        </div>
                        <Button
                            variant="primary"
                            onClick={() => setShowHolidayModal(true)}
                        >
                            ➕ 공휴일 추가
                        </Button>
                    </div>
                    {isHolidayListExpanded && (
                        <>
                            {!holidays || holidays.length === 0 ? (
                                <p className="empty-message">등록된 공휴일이 없습니다.</p>
                            ) : (
                                <div className="holiday-items">
                                    {holidays.map((holiday) => {
                                        // Handle both old format (string) and new format (object)
                                        const holidayDate = typeof holiday === 'string' ? holiday : holiday.date;
                                        const holidayName = typeof holiday === 'string' ? '' : holiday.name;
                                        const dateObj = new Date(holidayDate);
                                        const formatted = dateObj.toLocaleDateString('ko-KR', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            weekday: 'short'
                                        });
                                        return (
                                            <div key={holidayDate} className="holiday-item">
                                                <div className="holiday-info">
                                                    <span className="holiday-name">{holidayName}</span>
                                                    <span className="holiday-date">{formatted}</span>
                                                </div>
                                                <button
                                                    className="delete-holiday-btn"
                                                    onClick={() => handleRemoveHoliday(typeof holiday === 'string' ? { date: holiday, name: '' } : holiday)}
                                                >
                                                    ❌
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Holiday Modal */}
            {showHolidayModal && (
                <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>공휴일 추가</h3>
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
                                    placeholder="예: 설날, 어린이날 등"
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
                            <h3>🇰🇷 한국 공휴일 자동 가져오기</h3>
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
                                        <span>기존 공휴일 먼저 삭제</span>
                                    </label>
                                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.5rem 0 0 1.75rem' }}>
                                        체크 시 등록된 {holidays.length}개의 공휴일을 모두 삭제한 후 새로운 공휴일을 추가합니다.
                                    </p>
                                </div>
                            )}
                            <div className="help-tip">
                                💡 한국천문연구원에서 제공하는 공식 공휴일 정보를 가져옵니다. 설날, 추석, 어린이날 등 법정 공휴일이 자동으로 추가됩니다.
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
                                {isFetchingHolidays ? '가져오는 중...' : '🚀 가져오기'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Google 계정 연동 Section */}
            <div className="settings-section">
                <h2>🔗 Google 계정 연동</h2>
                <p className="section-description">
                    Google 계정을 연결하면 Drive 백업과 Sheets 내보내기를 사용할 수 있습니다. (선택사항)
                </p>

                {/* 연결 상태 카드 */}
                <div className={`connection-status-card ${isGoogleConnected ? 'connected' : 'disconnected'}`}>
                    <div className="status-header">
                        <div className="status-icon">
                            {isGoogleConnected ? '🟢' : '⚪'}
                        </div>
                        <div className="status-info">
                            <h3>{isGoogleConnected ? 'Google 연결됨' : 'Google 미연결'}</h3>
                            <p>
                                {isGoogleConnected
                                    ? `${googleUser?.email || 'Google 계정'}으로 연결되어 있습니다.`
                                    : 'Google 계정을 연결하여 클라우드 백업과 시트 내보내기를 사용하세요.'}
                            </p>
                        </div>
                    </div>

                    <div className="connection-actions">
                        {isGoogleConnected ? (
                            <button
                                className="delete-api-button"
                                onClick={handleGoogleDisconnect}
                                type="button"
                            >
                                연결 해제
                            </button>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={handleGoogleConnect}
                                disabled={isGoogleLoading}
                            >
                                {isGoogleLoading ? '준비 중...' : '🔑 Google 계정 연결'}
                            </Button>
                        )}
                    </div>
                </div>

                {googleError && (
                    <div className="message-banner error" style={{ marginTop: '0.75rem' }}>
                        ❌ {googleError}
                    </div>
                )}

                {/* Google Drive 백업 */}
                {isGoogleConnected && (
                    <div className="api-setup-card" style={{ marginTop: 'var(--spacing-lg)' }}>
                        <div className="setup-header">
                            <h3>📁 Google Drive 백업</h3>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '0.5rem 0 1rem' }}>
                            학급일지 전체 데이터를 Google Drive에 안전하게 백업합니다.
                        </p>
                        <div className="backup-actions">
                            <Button
                                variant="primary"
                                onClick={handleDriveBackup}
                                disabled={isGoogleBusy}
                            >
                                {isGoogleBusy ? '처리 중...' : '☁️ Drive에 백업'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleListDriveBackups}
                                disabled={isGoogleBusy}
                            >
                                📋 백업 목록 / 복원
                            </Button>
                        </div>

                        {/* Drive 백업 목록 */}
                        {showDriveBackups && (
                            <div className="holiday-list" style={{ marginTop: '1rem' }}>
                                <div className="holiday-list-header">
                                    <h3>Drive 백업 목록</h3>
                                    <button className="toggle-btn" onClick={() => setShowDriveBackups(false)}>✕</button>
                                </div>
                                {driveBackups.length === 0 ? (
                                    <p className="empty-message">저장된 백업이 없습니다.</p>
                                ) : (
                                    <div className="holiday-items">
                                        {driveBackups.map(backup => (
                                            <div key={backup.id} className="holiday-item">
                                                <div className="holiday-info">
                                                    <span className="holiday-name">{backup.name}</span>
                                                    <span className="holiday-date">
                                                        {new Date(backup.createdTime).toLocaleString('ko-KR')}
                                                    </span>
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    size="small"
                                                    onClick={() => handleDriveRestore(backup.id, backup.name)}
                                                    disabled={isGoogleBusy}
                                                >
                                                    복원
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Google Sheets 내보내기 */}
                {isGoogleConnected && (
                    <div className="api-setup-card" style={{ marginTop: 'var(--spacing-lg)' }}>
                        <div className="setup-header">
                            <h3>📊 Google Sheets 내보내기</h3>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '0.5rem 0 1rem' }}>
                            학생 기록과 성적 데이터를 Google Sheets로 내보냅니다.
                        </p>
                        <div className="backup-actions">
                            <Button
                                variant="primary"
                                onClick={handleExportJournalsToSheet}
                                disabled={isGoogleBusy}
                            >
                                {isGoogleBusy ? '처리 중...' : '📝 학생 기록 → 시트'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleExportGradesToSheet}
                                disabled={isGoogleBusy}
                            >
                                {isGoogleBusy ? '처리 중...' : '📊 성적 → 시트'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Data Backup Section */}
            <div className="settings-section">
                <h2>💾 데이터 백업 및 복구 (로컬)</h2>
                <p className="section-description">
                    모든 학급 데이터를 JSON 파일로 백업하고 복원할 수 있습니다.
                </p>

                <div className="backup-actions">
                    <Button
                        variant="primary"
                        onClick={handleExportData}
                    >
                        📥 데이터 내보내기
                    </Button>
                    <label className="import-button-wrapper">
                        <Button variant="secondary" as="span">
                            📤 데이터 가져오기
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

            {/* Feedback Section */}
            <div className="settings-section">
                <h2>📝 수정 및 요청사항</h2>
                <p className="section-description">
                    개선이 필요한 부분이나 새로운 기능을 자유롭게 제안해주세요.
                </p>
                <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLSekXmDyk3mOjrxqRLCnSz8XHHabIUTgE3p1Sy4YJ0Uj-GPawA/viewform?usp=header"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="feedback-link-button"
                >
                    📮 피드백 보내기
                </a>
            </div>

            {/* 게시판(메뉴) 편집 */}
            <div className="settings-section">
                <h2>📋 게시판 편집</h2>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    사이드바에 표시할 메뉴를 선택하세요.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {sidebarMenuItems.map(item => {
                        const emojiMap = { diary: '📅', notepad: '📝', attendance: '✅', journal: '📒', grades: '📊', budget: '💰', assignments: '📋', seating: '🪑' };
                        return (
                            <label
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '10px',
                                    backgroundColor: item.hidden ? '#f8fafc' : '#f0fdf4',
                                    border: `1px solid ${item.hidden ? '#e2e8f0' : '#bbf7d0'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span style={{ fontWeight: 500, color: item.hidden ? '#94a3b8' : '#1e293b' }}>
                                    {emojiMap[item.id] || '📄'} {item.label}
                                </span>
                                <div
                                    onClick={(e) => { e.preventDefault(); handleMenuToggle(item.id); }}
                                    style={{
                                        width: '44px', height: '24px',
                                        borderRadius: '12px',
                                        backgroundColor: item.hidden ? '#cbd5e1' : '#22c55e',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s',
                                    }}
                                >
                                    <div style={{
                                        width: '20px', height: '20px',
                                        borderRadius: '50%',
                                        backgroundColor: 'white',
                                        position: 'absolute',
                                        top: '2px',
                                        left: item.hidden ? '2px' : '22px',
                                        transition: 'left 0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    }} />
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* App Info Section with Update Control */}
            <div className="settings-section app-info-section">
                <h2>ℹ️ 앱 정보</h2>
                <div className="info-grid">
                    <div className="info-item">
                        <span className="info-label">버전</span>
                        <span className="info-value">v{APP_VERSION}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">저장 방식</span>
                        <span className="info-value">IndexedDB (로컬)</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">AI 모델</span>
                        <span className="info-value">제미나이</span>
                    </div>
                </div>

                {/* Update Action Area */}
                <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#374151' }}>업데이트 상태</h3>
                    {needRefresh ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>
                                새로운 버전이 출시되었습니다.
                            </p>
                            <Button variant="primary" onClick={() => updateServiceWorker()}>
                                최신 버전으로 업데이트
                            </Button>
                        </div>
                    ) : (
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
                            현재 최신 버전을 사용 중입니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Settings;
