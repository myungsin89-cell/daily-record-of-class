import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClass } from '../context/ClassContext';

const DesktopTitlebar = () => {
    const isElectron = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;
    const { user, logout } = useAuth();
    const { currentClass } = useClass();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleSettings = () => {
        navigate('/settings');
    };

    return (
        <div className={`window-titlebar ${!user ? 'login-mode' : ''}`}>
            <div className="window-titlebar-left">
                {user && <span className="window-titlebar-title">🌿 학급일지</span>}
                {user && (
                    <div className="window-titlebar-actions">
                        <button className="titlebar-icon-btn" onClick={handleSettings} title="설정">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                        <button className="titlebar-icon-btn logout" onClick={handleLogout} title="로그아웃">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </button>

                        {/* 로그아웃 옆 수수한 기본 텍스트 (녹색/효과 없이 눈에 띄지 않게) */}
                        {currentClass && (
                            <span className="titlebar-quiet-class-name">
                                {currentClass.year ? `${currentClass.year}학년도 ` : ''}{currentClass.name}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {isElectron && (
                <div className="window-controls windows-controls">
                    <button
                        className="window-control-btn win-minimize"
                        onClick={() => window.electronAPI.minimizeWindow()}
                        title="최소화"
                    >
                        ─
                    </button>
                    {user && (
                        <button
                            className="window-control-btn win-maximize"
                            onClick={() => window.electronAPI.maximizeWindow()}
                            title="최대화"
                        >
                            □
                        </button>
                    )}
                    <button
                        className="window-control-btn win-close"
                        onClick={() => window.electronAPI.closeWindow()}
                        title="닫기"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
};

export default DesktopTitlebar;
