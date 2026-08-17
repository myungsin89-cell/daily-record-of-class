import React, { useState } from 'react';
import { FEEDBACK_FORM_URL } from '../config/feedback';
import './FeedbackModal.css';

const FeedbackModal = ({ isOpen, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);

    if (!isOpen) return null;

    // 구글폼 임베드용 URL (embedded=true 추가)
    const embedUrl = FEEDBACK_FORM_URL.includes('?') 
        ? `${FEEDBACK_FORM_URL}&embedded=true` 
        : `${FEEDBACK_FORM_URL}?embedded=true`;

    const handleOpenInBrowser = () => {
        window.open(FEEDBACK_FORM_URL, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="feedback-modal-overlay" onClick={onClose}>
            <div className="feedback-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* 모달 상단 헤더 */}
                <div className="feedback-modal-header">
                    <div className="feedback-header-title-group">
                        <div className="feedback-badge">선생님 피드백</div>
                        <h3 className="feedback-title">소중한 의견 및 개선 제안</h3>
                        <p className="feedback-subtitle">
                            더 편리하고 따뜻한 학급일지를 만들기 위해 작은 불편이나 아이디어도 귀담아듣겠습니다.
                        </p>
                    </div>
                    {/* 미니멀 무테 ✕ 닫기 버튼 */}
                    <button 
                        type="button" 
                        className="feedback-close-btn" 
                        onClick={onClose}
                        title="닫기"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* 구글 폼 임베드 컨테이너 */}
                <div className="feedback-modal-body">
                    {isLoading && (
                        <div className="feedback-loading-spinner">
                            <div className="clean-spinner"></div>
                            <span>설문 양식을 불러오는 중입니다...</span>
                        </div>
                    )}
                    <iframe
                        src={embedUrl}
                        title="학급일지 사용자 개선 의견 설문"
                        className="feedback-google-form-iframe"
                        onLoad={() => setIsLoading(false)}
                        frameBorder="0"
                        marginHeight="0"
                        marginWidth="0"
                    >
                        로드 중...
                    </iframe>
                </div>

                {/* 모달 하단 액션 바 */}
                <div className="feedback-modal-footer">
                    <button 
                        type="button" 
                        className="feedback-external-btn"
                        onClick={handleOpenInBrowser}
                        title="웹 브라우저 새 창에서 설문 열기"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        브라우저 새 창에서 열기
                    </button>
                    <button 
                        type="button" 
                        className="feedback-confirm-btn"
                        onClick={onClose}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FeedbackModal;
