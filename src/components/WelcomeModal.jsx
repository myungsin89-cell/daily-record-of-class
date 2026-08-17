import React from 'react';
import './WelcomeModal.css';

const WelcomeModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const features = [
        {
            title: '1. 스마트 학급일지 다이어리',
            desc: '하루 일과와 시간표, 학급 메모 및 주요 일정을 직관적인 캘린더와 함께 손쉽게 기록합니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
            )
        },
        {
            title: '2. 지능형 출결 및 결석계 관리',
            desc: '질병, 인정, 기타 결석계를 체계적으로 전산화하고 인쇄용 표준 서식을 1클릭으로 출력합니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
            )
        },
        {
            title: '3. 스마트 학생기록 지원 (행발 연동)',
            desc: '학생 보상 관리 및 일상 누가기록을 체계적으로 누적하여, 추후 행동발달특성(행발) 작성의 풍부한 기초 자료로 활용할 수 있습니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                </svg>
            )
        },
        {
            title: '4. 교과 성적 분석 & 맞춤형 리포트',
            desc: '단원평가 및 과정중심 수행평가를 정밀 분석하며, 잘림 없는 고해상도 A4 스마트 PDF 리포트로 다운로드합니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
            )
        },
        {
            title: '5. 다채로운 학급 도구 모음',
            desc: '지능형 조건 자리배치, 1인 1역 학급역할 분담, 공정한 발표 뽑기 및 랜덤 순서 추첨 기능을 모두 제공합니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
            )
        },
        {
            title: '6. 안전한 데이터 관리 (학생 개인정보 보호)',
            desc: '모든 데이터가 외부 서버가 아닌 선생님 컴퓨터에만 안전하게 저장되어 학생 개인정보 유출 걱정이 없으며, 로컬 백업 기능으로 데이터를 안전하게 보호합니다.',
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            )
        }
    ];

    return (
        <div className="welcome-modal-overlay" onClick={onClose}>
            <div className="welcome-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* 상단 미니멀 무테 ✕ 닫기 버튼 */}
                <button className="welcome-modal-close" onClick={onClose} aria-label="닫기">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {/* 상단 싱그러운 헤더 */}
                <div className="welcome-modal-header">
                    <div className="welcome-header-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        <span>학급일지에 오신 것을 환영합니다</span>
                    </div>
                    <h2 className="welcome-title">선생님을 위한 스마트 학급 관리 파트너</h2>
                    <p className="welcome-subtitle">
                        학급 운영에 꼭 필요한 모든 핵심 기능을 하나로 모았습니다.
                    </p>
                </div>

                {/* 본문 기능 소개 리스트 */}
                <div className="welcome-features-list">
                    {features.map((item, idx) => (
                        <div key={idx} className="welcome-feature-item">
                            <div className="welcome-feature-icon-box">
                                {item.icon}
                            </div>
                            <div className="welcome-feature-text">
                                <h4 className="welcome-feature-title">{item.title}</h4>
                                <p className="welcome-feature-desc">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 하단 가운데 정렬 액션 버튼 */}
                <div className="welcome-modal-footer">
                    <button className="welcome-start-btn" onClick={onClose}>
                        학급일지 시작하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WelcomeModal;
