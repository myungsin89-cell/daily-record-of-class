import React, { useState, useRef } from 'react';
import { exportSinglePageA4Pdf, printHtmlElement } from '../utils/pdfExport';
import './ClassRolePrintModal.css';

const ClassRolePrintModal = ({ isOpen, onClose, currentClass, roles, students }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgressText, setExportProgressText] = useState('');
    const printSheetRef = useRef(null);

    if (!isOpen || !roles) return null;

    const classNameText = currentClass 
        ? `${currentClass.grade || ''}학년 ${currentClass.classNumber || ''}반` 
        : '우리 반';

    const getStudentById = (id) => students?.find(s => s.id === id);

    const totalCapacity = roles.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    const totalAssigned = roles.reduce((sum, r) => sum + (r.assignedStudents || []).length, 0);

    const handleDownloadPdf = async () => {
        if (!printSheetRef.current) return;
        const fileName = `${classNameText}_1인1역_배정표.pdf`;

        setIsExporting(true);
        try {
            await exportSinglePageA4Pdf(printSheetRef.current, fileName, {
                orientation: 'portrait',
                margin: 8,
                onProgress: (loading, text) => {
                    setIsExporting(loading);
                    setExportProgressText(text);
                }
            });
        } catch (error) {
            console.error('PDF 다운로드 실패:', error);
            alert('PDF 생성 중 오류가 발생했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        if (!printSheetRef.current) return;
        printHtmlElement(printSheetRef.current, {
            orientation: 'portrait',
            title: `${classNameText} 1인 1역 배정표`
        });
    };

    return (
        <div className="cr-modal-print-overlay" onClick={onClose}>
            <div className="cr-modal-print-container" onClick={(e) => e.stopPropagation()}>
                {/* 모달 상단 헤더 */}
                <div className="cr-modal-print-header">
                    <div className="cr-modal-print-title-group">
                        <div className="cr-modal-print-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            <span>A4 세로 인쇄 & 미리보기</span>
                        </div>
                        <h3>1인 1역 배정표 인쇄 미리보기</h3>
                    </div>

                    {/* 무테 미니멀 ✕ 버튼 */}
                    <button className="cr-modal-print-close" onClick={onClose} aria-label="닫기">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* 안내 가이드 바 */}
                <div className="cr-modal-print-guide-bar">
                    <span>💡 A4 용지 세로 방향에 알맞게 정돈되어 인쇄 및 PDF로 저장됩니다.</span>
                </div>

                {/* A4 세로 실시간 미리보기 시트 스크롤 영역 */}
                <div className="cr-modal-print-scroll-area">
                    <div className="cr-a4-portrait-wrapper">
                        <div ref={printSheetRef} className="cr-sheet-content">
                            {/* 헤더 배너 */}
                            <div className="cr-sheet-header">
                                <div className="cr-sheet-title-row">
                                    <h2 className="cr-sheet-main-title">{classNameText} 1인 1역 배정표</h2>
                                    <span className="cr-sheet-class-badge">{classNameText}</span>
                                </div>
                                <div className="cr-sheet-meta">
                                    <span>인쇄일자: {new Date().toLocaleDateString('ko-KR')}</span>
                                    <span>총 {roles.length}개 역할 · {totalAssigned} / {totalCapacity}명 배정</span>
                                </div>
                            </div>

                            {/* 상단 통계 요약 박스 */}
                            <div className="cr-sheet-stats">
                                <div className="cr-sheet-stat-box">
                                    <span className="cr-stat-lbl">전체 역할</span>
                                    <span className="cr-stat-val">{roles.length}개</span>
                                </div>
                                <div className="cr-sheet-stat-box">
                                    <span className="cr-stat-lbl">정원 / 배정</span>
                                    <span className="cr-stat-val">{totalAssigned} / {totalCapacity}명</span>
                                </div>
                                <div className="cr-sheet-stat-box">
                                    <span className="cr-stat-lbl">학급 총원</span>
                                    <span className="cr-stat-val">{students?.length || 0}명</span>
                                </div>
                            </div>

                            {/* 1인 1역 테이블 */}
                            <table className="cr-sheet-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '8%' }}>순번</th>
                                        <th style={{ width: '22%' }}>역할명</th>
                                        <th style={{ width: '32%' }}>활동 내용</th>
                                        <th style={{ width: '10%' }}>정원</th>
                                        <th style={{ width: '28%' }}>담당 학생</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roles.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="cr-sheet-empty">등록된 역할이 없습니다.</td>
                                        </tr>
                                    ) : (
                                        roles.map((role, idx) => {
                                            const assigned = role.assignedStudents || [];
                                            const studentNames = assigned
                                                .map(id => {
                                                    const s = getStudentById(id);
                                                    return s ? `${s.attendanceNumber}번 ${s.name}` : null;
                                                })
                                                .filter(Boolean);

                                            return (
                                                <tr key={role.id || idx}>
                                                    <td className="text-center">{idx + 1}</td>
                                                    <td className="cr-sheet-role-name">{role.name}</td>
                                                    <td className="cr-sheet-role-desc">{role.description || '-'}</td>
                                                    <td className="text-center">{role.count}명</td>
                                                    <td className="cr-sheet-assigned-students">
                                                        {studentNames.length > 0 ? (
                                                            <div className="cr-student-chips">
                                                                {studentNames.map((name, sIdx) => (
                                                                    <span key={sIdx} className="cr-student-chip">{name}</span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="cr-unassigned-text">미배정</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>

                            {/* 하단 푸터 */}
                            <div className="cr-sheet-footer">
                                <span>{classNameText}</span>
                                <span>학급일지 1인 1역 시스템</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 하단 액션 버튼 바 (가운데 정렬) */}
                <div className="cr-modal-print-footer">
                    <button 
                        type="button"
                        className="cr-p-btn secondary"
                        onClick={onClose}
                    >
                        닫기
                    </button>
                    <button 
                        type="button"
                        className="cr-p-btn pdf-btn"
                        onClick={handleDownloadPdf}
                        disabled={isExporting}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        {isExporting ? (exportProgressText || 'PDF 생성 중...') : 'A4 PDF 다운로드'}
                    </button>
                    <button 
                        type="button"
                        className="cr-p-btn primary"
                        onClick={handlePrint}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        인쇄하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClassRolePrintModal;
