import React, { useState, useEffect } from 'react';
import './AppUpdateModal.css';

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
};

const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond || bytesPerSecond === 0) return '';
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
    const kbps = bytesPerSecond / 1024;
    return `${kbps.toFixed(0)} KB/s`;
};

const AppUpdateModal = () => {
    const [updateInfo, setUpdateInfo] = useState(null); // { version, releaseDate, releaseNotes }
    const [status, setStatus] = useState('idle'); // 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'
    const [progress, setProgress] = useState({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
    const [errorMessage, setErrorMessage] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        // 1. 업데이트 발견
        const unsubAvailable = window.electronAPI.onUpdateAvailable?.((info) => {
            console.log('[UpdateModal] Update available:', info);
            setUpdateInfo(info);
            setStatus('available');
            setIsOpen(true);
            setIsMinimized(false);
        });

        // 2. 다운로드 진행률 수신
        const unsubProgress = window.electronAPI.onUpdateDownloadProgress?.((prog) => {
            setStatus('downloading');
            setProgress({
                percent: prog.percent || 0,
                bytesPerSecond: prog.bytesPerSecond || 0,
                transferred: prog.transferred || 0,
                total: prog.total || 0
            });
        });

        // 3. 다운로드 완료
        const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((info) => {
            console.log('[UpdateModal] Update downloaded:', info);
            if (info) setUpdateInfo(prev => ({ ...(prev || {}), ...info }));
            setStatus('downloaded');
            setIsOpen(true);
            setIsMinimized(false);
        });

        // 4. 에러 발생
        const unsubError = window.electronAPI.onUpdateError?.((err) => {
            console.error('[UpdateModal] Update error:', err);
            setErrorMessage(typeof err === 'string' ? err : '업데이트 중 문제가 발생했습니다.');
            setStatus('error');
        });

        return () => {
            if (unsubAvailable) unsubAvailable();
            if (unsubProgress) unsubProgress();
            if (unsubDownloaded) unsubDownloaded();
            if (unsubError) unsubError();
        };
    }, []);

    // 다운로드 시작 핸들러
    const handleStartDownload = async () => {
        try {
            setStatus('downloading');
            setProgress({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
            await window.electronAPI.startUpdateDownload?.();
        } catch (err) {
            console.error('Download start failed:', err);
            setErrorMessage(err.message || '다운로드를 시작할 수 없습니다.');
            setStatus('error');
        }
    };

    // 재시작 및 설치 핸들러
    const handleRestartAndInstall = () => {
        window.electronAPI.quitAndInstallUpdate?.();
    };

    // 모달 닫기
    const handleClose = () => {
        setIsOpen(false);
        if (status === 'downloading') {
            setIsMinimized(true);
        }
    };

    if (!isOpen && !isMinimized) return null;

    // 백그라운드 다운로드 중 미니 배지 (우측 상단 플로팅)
    if (!isOpen && isMinimized && status === 'downloading') {
        return (
            <div className="update-minimized-badge" onClick={() => { setIsOpen(true); setIsMinimized(false); }} title="클릭하여 다운로드 창 열기">
                <div className="update-mini-spinner"></div>
                <div className="update-mini-text">
                    <span className="mini-title">업데이트 다운로드 중</span>
                    <span className="mini-percent">{progress.percent.toFixed(0)}%</span>
                </div>
            </div>
        );
    }

    return (
        <div className="update-modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget && status !== 'downloading') handleClose();
        }}>
            <div className="update-modal-card" onClick={e => e.stopPropagation()}>
                {/* 상단 헤더 */}
                <div className="update-modal-header">
                    <div className="update-modal-title">
                        <div className="update-icon-circle">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v10M12 12l4-4M12 12L8 8"/>
                                <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>
                            </svg>
                        </div>
                        <h3>
                            {status === 'available' && '새로운 버전 업데이트 안내'}
                            {status === 'downloading' && '업데이트 다운로드 중'}
                            {status === 'downloaded' && '업데이트 준비 완료'}
                            {status === 'error' && '업데이트 안내'}
                        </h3>
                    </div>
                    <button className="update-modal-close-btn" onClick={handleClose} aria-label="닫기">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* 1단계: 업데이트 발견 안내 */}
                {status === 'available' && (
                    <div className="update-modal-body">
                        <div className="update-version-banner">
                            <span className="version-pill">v{updateInfo?.version || '최신'}</span>
                            <span className="version-msg">새로운 학급일지 버전이 출시되었습니다!</span>
                        </div>
                        <p className="update-desc-text">
                            선생님께서 더 편리하고 안정적으로 학급을 운영하실 수 있도록 최신 기능과 개선사항을 담았습니다. 지금 다운로드하시겠습니까?
                        </p>
                        <div className="update-modal-footer">
                            <button type="button" className="update-btn secondary" onClick={handleClose}>
                                나중에 하기
                            </button>
                            <button type="button" className="update-btn primary" onClick={handleStartDownload}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                지금 다운로드
                            </button>
                        </div>
                    </div>
                )}

                {/* 2단계: 실시간 다운로드 프로그레스 바 */}
                {status === 'downloading' && (
                    <div className="update-modal-body">
                        <div className="update-progress-section">
                            <div className="progress-info-row">
                                <span className="progress-status-label">파일 다운로드 진행 중...</span>
                                <span className="progress-percent-label">{progress.percent.toFixed(1)}%</span>
                            </div>
                            
                            <div className="update-progress-track">
                                <div 
                                    className="update-progress-fill" 
                                    style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                                >
                                    <div className="progress-shimmer"></div>
                                </div>
                            </div>

                            <div className="progress-meta-row">
                                <span className="progress-bytes">
                                    {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                                </span>
                                {progress.bytesPerSecond > 0 && (
                                    <span className="progress-speed">
                                        ⚡ {formatSpeed(progress.bytesPerSecond)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <p className="update-hint-text">
                            💡 다운로드 중에도 학급일지의 모든 기능(출결, 일지, 메모장 등)을 자유롭게 사용하실 수 있습니다.
                        </p>

                        <div className="update-modal-footer">
                            <button type="button" className="update-btn secondary" onClick={handleClose}>
                                창 닫기 (백그라운드 유지)
                            </button>
                        </div>
                    </div>
                )}

                {/* 3단계: 다운로드 완료 및 재시작 */}
                {status === 'downloaded' && (
                    <div className="update-modal-body">
                        <div className="update-success-banner">
                            <div className="success-check-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                            <div>
                                <h4 className="success-title">업데이트 다운로드 완료!</h4>
                                <p className="success-sub">v{updateInfo?.version || ''} 버전이 성공적으로 준비되었습니다.</p>
                            </div>
                        </div>

                        <p className="update-desc-text">
                            지금 바로 앱을 재시작하여 새로운 기능과 개선사항을 적용하시겠습니까?
                        </p>

                        <div className="update-modal-footer">
                            <button type="button" className="update-btn secondary" onClick={handleClose}>
                                나중에 (앱 종료 시 자동 적용)
                            </button>
                            <button type="button" className="update-btn primary" onClick={handleRestartAndInstall}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1 4 1 10 7 10"/>
                                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                                </svg>
                                지금 재시작하여 적용
                            </button>
                        </div>
                    </div>
                )}

                {/* 에러 상태 */}
                {status === 'error' && (
                    <div className="update-modal-body">
                        <div className="update-error-banner">
                            <p className="error-text">{errorMessage || '업데이트 확인 중 일시적인 네트워크 오류가 발생했습니다.'}</p>
                        </div>
                        <div className="update-modal-footer">
                            <button type="button" className="update-btn secondary" onClick={handleClose}>
                                닫기
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AppUpdateModal;
