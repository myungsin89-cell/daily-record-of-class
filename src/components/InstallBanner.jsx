import React, { useState, useEffect } from 'react';
import './InstallBanner.css';

const InstallBanner = ({ isInstallable, onInstall }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        // Check if already installed (running as PWA)
        const isRunningAsPWA = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;

        // Check if user dismissed the banner before
        const dismissedBefore = localStorage.getItem('pwa-banner-dismissed') === 'true';

        // Show banner if: not running as PWA and not dismissed
        // We show it even if not installable yet (for testing and visibility)
        setIsVisible(!isRunningAsPWA && !dismissedBefore);
        setIsDismissed(dismissedBefore);
    }, [isInstallable]);

    const handleDismiss = () => {
        localStorage.setItem('pwa-banner-dismissed', 'true');
        setIsVisible(false);
        setIsDismissed(true);
    };

    const handleShowGuide = () => {
        setShowGuide(true);
    };

    const handleCloseGuide = () => {
        setShowGuide(false);
    };

    if (!isVisible) return null;

    return (
        <>
            <div className="install-banner">
                <div className="install-banner-content">
                    <div className="install-banner-icon">📱</div>
                    <div className="install-banner-text">
                        <h3>앱으로 설치하기</h3>
                        <p>홈 화면에 추가하고 오프라인에서도 사용하세요!</p>
                    </div>
                    <div className="install-banner-actions">
                        <button className="install-banner-btn-install" onClick={handleShowGuide}>
                            📖 설치 방법
                        </button>
                        <button className="install-banner-btn-close" onClick={handleDismiss} title="닫기">
                            ✕
                        </button>
                    </div>
                </div>
            </div>

            {/* Installation Guide Modal */}
            {showGuide && (
                <div className="install-guide-overlay" onClick={handleCloseGuide}>
                    <div className="install-guide-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="install-guide-header">
                            <h2>📱 앱 설치 방법</h2>
                            <button className="install-guide-close" onClick={handleCloseGuide}>✕</button>
                        </div>

                        <div className="install-guide-content">
                            <div className="install-guide-section">
                                <h3>🌐 크롬/엣지 브라우저</h3>
                                <div className="install-steps">
                                    <div className="install-step">
                                        <span className="step-number">1</span>
                                        <div className="step-content">
                                            <strong>주소창 오른쪽</strong>을 확인하세요
                                            <p>⬇️ 다운로드 아이콘이나 🖥️ 설치 아이콘을 찾으세요</p>
                                        </div>
                                    </div>
                                    <div className="install-step">
                                        <span className="step-number">2</span>
                                        <div className="step-content">
                                            <strong>아이콘을 클릭</strong>하세요
                                            <p>"설치" 또는 "앱 설치" 버튼이 나타납니다</p>
                                        </div>
                                    </div>
                                    <div className="install-step">
                                        <span className="step-number">3</span>
                                        <div className="step-content">
                                            <strong>"설치" 버튼</strong>을 누르세요
                                            <p>앱이 자동으로 설치됩니다!</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="install-guide-tip">
                                💡 <strong>팁:</strong> 설치 후 바탕화면이나 홈 화면에서 바로 실행할 수 있어요!
                            </div>
                        </div>

                        <div className="install-guide-footer">
                            <button className="install-guide-ok-btn" onClick={handleCloseGuide}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default InstallBanner;
