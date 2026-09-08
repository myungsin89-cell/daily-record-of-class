import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
    const [username, setUsername] = useState('');
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [showNewInput, setShowNewInput] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.setWindowMode) {
            window.electronAPI.setWindowMode('login');
        }

        // 브라우저에 저장된 모든 계정 정보 정밀 스캔
        const scanSavedAccounts = async () => {
            try {
                const userSet = new Set();

                // 1) localStorage 전체 키 패턴 분석
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;

                    // (1) _classes 키 (예: 홍길동_classes)
                    if (key.endsWith('_classes')) {
                        const uName = key.replace(/_classes$/, '').trim();
                        if (uName) userSet.add(uName);
                    }
                    // (2) _currentClass 키 (예: 홍길동_currentClass)
                    else if (key.endsWith('_currentClass')) {
                        const uName = key.replace(/_currentClass$/, '').trim();
                        if (uName) userSet.add(uName);
                    }
                    // (3) 과제/예산/역할/성적 키 (예: assignments_홍길동_..., grade_v4_홍길동_...)
                    else {
                        const prefixMatch = key.match(/^(?:assignments|budgets|roles|grade_data|grade_v4|grade_criteria|grade_groups)_([^_]+)_/);
                        if (prefixMatch && prefixMatch[1]) {
                            const uName = prefixMatch[1].trim();
                            if (uName) userSet.add(uName);
                        } else {
                            // (4) 홍길동_12345_todos, 홍길동_12345_notes, 홍길동_12345_notepad
                            const taskMatch = key.match(/^([^_]+)_[0-9]+_(?:todos|notes|notepad|announcements)$/);
                            if (taskMatch && taskMatch[1]) {
                                const uName = taskMatch[1].trim();
                                if (uName) userSet.add(uName);
                            }
                        }
                    }
                }

                // 2) 체험학습/결석계에 입력된 선생님 성함
                const ftTeacher = localStorage.getItem('fieldtrip_teacherName');
                if (ftTeacher && typeof ftTeacher === 'string' && ftTeacher.trim()) {
                    userSet.add(ftTeacher.trim());
                }

                // 3) 구글 연동 사용자
                try {
                    const gUser = JSON.parse(localStorage.getItem('google_connected_user') || 'null');
                    if (gUser && gUser.name && typeof gUser.name === 'string') {
                        userSet.add(gUser.name.trim());
                    }
                } catch (e) {}

                // 4) saved_usernames 목록 확인
                try {
                    const savedList = JSON.parse(localStorage.getItem('saved_usernames') || '[]');
                    if (Array.isArray(savedList)) {
                        savedList.forEach(u => {
                            if (u && typeof u === 'string' && u.trim()) {
                                userSet.add(u.trim());
                            }
                        });
                    }
                } catch (e) {}

                // 5) currentUser 확인
                try {
                    const currentUserStr = localStorage.getItem('currentUser');
                    if (currentUserStr) {
                        const parsed = JSON.parse(currentUserStr);
                        if (parsed && parsed.username && parsed.username.trim()) {
                            userSet.add(parsed.username.trim());
                        }
                    }
                } catch (e) {}

                // 6) IndexedDB(ClassDiaryDB) 키 검사 (비동기 안전 검사)
                if (typeof window !== 'undefined' && window.indexedDB) {
                    try {
                        await new Promise((resolve) => {
                            const req = window.indexedDB.open('ClassDiaryDB');
                            req.onsuccess = (e) => {
                                try {
                                    const db = e.target.result;
                                    if (db.objectStoreNames && db.objectStoreNames.contains('students')) {
                                        const tx = db.transaction('students', 'readonly');
                                        const store = tx.objectStore('students');
                                        const keysReq = store.getAllKeys();
                                        keysReq.onsuccess = () => {
                                            const keys = keysReq.result || [];
                                            keys.forEach(k => {
                                                if (typeof k === 'string' && k.includes('_')) {
                                                    const uName = k.split('_')[0].trim();
                                                    if (uName && isNaN(uName)) {
                                                        userSet.add(uName);
                                                    }
                                                }
                                            });
                                            resolve();
                                        };
                                        keysReq.onerror = () => resolve();
                                    } else {
                                        resolve();
                                    }
                                } catch (inner) {
                                    resolve();
                                }
                            };
                            req.onerror = () => resolve();
                            setTimeout(resolve, 300);
                        });
                    } catch (dbErr) {}
                }

                // 제외할 시스템 키/불필요 문자열 필터링
                const ignoredNames = new Set(['default', 'true', 'false', 'null', 'undefined', 'currentclass', 'classes']);
                const validUsers = Array.from(userSet).filter(u => u && !ignoredNames.has(u.toLowerCase()));

                // 계정별 학급 정보 매핑
                const accounts = validUsers.map(name => {
                    let classes = [];
                    try {
                        const classesRaw = localStorage.getItem(`${name}_classes`);
                        if (classesRaw) {
                            classes = JSON.parse(classesRaw) || [];
                        }
                    } catch (e) {}

                    let classSummary = '';
                    if (classes.length > 0) {
                        const first = classes[0];
                        const className = `${first.year ? first.year + '학년도 ' : ''}${first.name || ''}`;
                        if (classes.length > 1) {
                            classSummary = `${className} 외 ${classes.length - 1}개 학급`;
                        } else {
                            classSummary = className;
                        }
                    } else {
                        // 만약 _classes가 없어도 legacy currentClass가 있는지 확인
                        try {
                            const legacyClass = JSON.parse(localStorage.getItem('currentClass') || 'null');
                            if (legacyClass && legacyClass.name) {
                                classSummary = `${legacyClass.year ? legacyClass.year + '학년도 ' : ''}${legacyClass.name}`;
                            }
                        } catch (e) {}
                    }

                    if (!classSummary) {
                        classSummary = '저장된 학급일지 데이터 있음';
                    }

                    return {
                        username: name,
                        classesCount: classes.length,
                        classSummary
                    };
                });

                setSavedAccounts(accounts);
                // 저장된 계정이 없으면 바로 신규 입력창 표시
                if (accounts.length === 0) {
                    setShowNewInput(true);
                }
            } catch (err) {
                console.error('계정 탐색 실패:', err);
                setShowNewInput(true);
            }
        };

        scanSavedAccounts();
    }, []);

    const performLogin = (nameToLogin) => {
        const trimmedName = (nameToLogin || '').trim();
        if (!trimmedName) return;

        // 최근 사용자 목록에 영구 저장
        try {
            const savedList = JSON.parse(localStorage.getItem('saved_usernames') || '[]');
            const updated = Array.isArray(savedList) ? savedList.filter(u => u !== trimmedName) : [];
            updated.unshift(trimmedName);
            localStorage.setItem('saved_usernames', JSON.stringify(updated));
        } catch (e) {}

        login(trimmedName);

        // 등록된 학급 목록이 있는지 검사
        const classesKey = `${trimmedName}_classes`;
        const savedClasses = localStorage.getItem(classesKey);
        let hasClasses = false;

        if (savedClasses) {
            try {
                const parsed = JSON.parse(savedClasses);
                if (parsed && parsed.length > 0) {
                    hasClasses = true;
                }
            } catch (e) {
                console.error(e);
            }
        }

        if (hasClasses) {
            navigate('/');
        } else {
            navigate('/select-class');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        performLogin(username);
    };

    const handleRemoveFromList = (e, targetUsername) => {
        e.stopPropagation();
        if (window.confirm(`'${targetUsername}' 계정을 이 브라우저 화면 목록에서 숨기시겠습니까?\n(등록된 학급 데이터는 안전하게 유지됩니다.)`)) {
            try {
                const savedList = JSON.parse(localStorage.getItem('saved_usernames') || '[]');
                const filtered = Array.isArray(savedList) ? savedList.filter(u => u !== targetUsername) : [];
                localStorage.setItem('saved_usernames', JSON.stringify(filtered));
            } catch (e) {}
            setSavedAccounts(prev => prev.filter(a => a.username !== targetUsername));
            if (savedAccounts.length <= 1) {
                setShowNewInput(true);
            }
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-icon">📚</div>
                    <h1>학급일지</h1>
                    <p className="subtitle">AI 기반 학생 기록 관리 시스템</p>
                    <div className="decorative-line"></div>
                </div>

                {savedAccounts.length > 0 && !showNewInput ? (
                    <div className="saved-accounts-section">
                        <div className="saved-accounts-header">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span className="saved-accounts-title">저장된 계정 선택</span>
                        </div>
                        <p className="saved-accounts-desc">선생님 이름을 클릭하면 바로 시작합니다</p>

                        <div className="account-cards-list">
                            {savedAccounts.map(account => (
                                <div
                                    key={account.username}
                                    className="account-card"
                                    onClick={() => performLogin(account.username)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && performLogin(account.username)}
                                >
                                    <div className="account-avatar">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                    </div>
                                    <div className="account-info">
                                        <div className="account-name-row">
                                            <span className="account-name-text">{account.username}</span>
                                            <span className="account-role-badge">선생님</span>
                                        </div>
                                        <div className="account-class-summary" title={account.classSummary}>
                                            {account.classSummary}
                                        </div>
                                    </div>
                                    <div className="account-card-right">
                                        <svg className="account-enter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                        <button
                                            type="button"
                                            className="account-remove-btn"
                                            title="이 목록에서 숨기기"
                                            onClick={(e) => handleRemoveFromList(e, account.username)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            className="switch-new-account-btn"
                            onClick={() => setShowNewInput(true)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>다른 이름으로 새로 로그인하기</span>
                        </button>
                    </div>
                ) : (
                    <div className="new-account-section">
                        {savedAccounts.length > 0 && (
                            <button
                                type="button"
                                className="back-to-accounts-btn"
                                onClick={() => setShowNewInput(false)}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                                <span>저장된 계정 목록으로 돌아가기</span>
                            </button>
                        )}

                        <form onSubmit={handleSubmit} className="login-form">
                            <div className="form-group">
                                <label htmlFor="username">선생님 이름</label>
                                <input
                                    type="text"
                                    id="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="예: 홍길동"
                                    autoFocus
                                    required
                                />
                            </div>

                            <button type="submit" className="login-button">
                                로그인 및 시작하기
                            </button>
                        </form>
                    </div>
                )}

                <div className="login-footer">
                    <div className="feature-badges">
                        <span className="badge">🤖 AI 평가</span>
                        <span className="badge">📊 자동 저장</span>
                        <span className="badge">🌱 스마트 학급일지</span>
                    </div>
                    <p className="welcome-text">이 컴퓨터에 안전하게 보관됩니다</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
