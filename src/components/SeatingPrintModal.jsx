import React, { useState, useRef } from 'react';
import { exportSinglePageA4Pdf } from '../utils/pdfExport';
import './SeatingPrintModal.css';

const SeatingPrintModal = ({ isOpen, onClose, currentClass, students, grid, gridConfig }) => {
    const [previewMode, setPreviewMode] = useState('student'); // 'student' | 'teacher'
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgressText, setExportProgressText] = useState('');
    const printSheetRef = useRef(null);

    if (!isOpen || !grid || grid.length === 0) return null;

    const pairSize = gridConfig?.pairSize || 2;

    const classNameText = currentClass 
        ? `${currentClass.grade || ''}학년 ${currentClass.classNumber || ''}반` 
        : '우리 반';

    const handleDownloadPdf = async () => {
        if (!printSheetRef.current) return;
        const modeLabel = previewMode === 'teacher' ? '교사용' : '학생용';
        const fileName = `${classNameText}_자리배치표_${modeLabel}.pdf`;

        setIsExporting(true);
        try {
            await exportSinglePageA4Pdf(printSheetRef.current, fileName, {
                orientation: 'landscape',
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

    const handlePrint = async () => {
        if (!printSheetRef.current) return;
        const modeLabel = previewMode === 'teacher' ? '교사용' : '학생용';
        setIsExporting(true);
        setExportProgressText('인쇄 준비 중...');

        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const canvas = await html2canvas(printSheetRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const pdf = new jsPDF('l', 'mm', 'a4');
            const margin = 8;
            const pageWidth = 297;
            const pageHeight = 210;
            const maxPrintWidth = pageWidth - (margin * 2);
            const maxPrintHeight = pageHeight - (margin * 2);

            const canvasRatio = canvas.width / canvas.height;
            let printWidth = maxPrintWidth;
            let printHeight = printWidth / canvasRatio;

            if (printHeight > maxPrintHeight) {
                printHeight = maxPrintHeight;
                printWidth = printHeight * canvasRatio;
            }

            const offsetX = margin + (maxPrintWidth - printWidth) / 2;
            const offsetY = margin + (maxPrintHeight - printHeight) / 2;

            const imgData = canvas.toDataURL('image/png', 1.0);
            pdf.addImage(imgData, 'PNG', offsetX, offsetY, printWidth, printHeight);

            // Electron 환경: 임시 파일로 저장 후 시스템 기본 뷰어로 열기
            if (window.electronAPI?.saveTempAndOpen) {
                const pdfArrayBuffer = pdf.output('arraybuffer');
                const pdfUint8 = new Uint8Array(pdfArrayBuffer);
                await window.electronAPI.saveTempAndOpen(Array.from(pdfUint8), `${classNameText}_자리배치표_${modeLabel}_인쇄.pdf`);
            } else {
                // 웹 환경: Blob URL로 새 탭에서 열기
                const pdfBlob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(pdfBlob);
                const printWindow = window.open(blobUrl, '_blank');
                if (printWindow) {
                    printWindow.addEventListener('load', () => {
                        printWindow.print();
                    });
                }
            }
        } catch (error) {
            console.error('인쇄 실패:', error);
            alert('인쇄 준비 중 오류가 발생했습니다.');
        } finally {
            setIsExporting(false);
            setExportProgressText('');
        }
    };

    // 그리드 렌더링 데이터 계산 (교사용일 때는 상하/좌우 반전)
    const isTeacherView = previewMode === 'teacher';
    const displayGrid = isTeacherView ? [...grid].reverse() : grid;

    return (
        <div className="seating-modal-overlay" onClick={onClose}>
            <div className="seating-modal-container" onClick={(e) => e.stopPropagation()}>
                {/* 모달 상단 헤더 */}
                <div className="seating-modal-header">
                    <div className="seating-modal-title-group">
                        <h3>자리배치표 인쇄 미리보기</h3>
                    </div>

                    {/* 무테 미니멀 ✕ 버튼 */}
                    <button className="seating-modal-close" onClick={onClose} aria-label="닫기">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* 인쇄 옵션 탭 바 (학생용 / 교사용) */}
                <div className="seating-modal-controls">
                    <div className="seating-mode-tabs">
                        <button 
                            type="button"
                            className={`seating-tab-btn ${previewMode === 'student' ? 'active' : ''}`}
                            onClick={() => setPreviewMode('student')}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            학생용 (칠판 위)
                        </button>
                        <button 
                            type="button"
                            className={`seating-tab-btn ${previewMode === 'teacher' ? 'active' : ''}`}
                            onClick={() => setPreviewMode('teacher')}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                            교사용 (칠판 아래)
                        </button>
                    </div>
                </div>

                {/* A4 가로 실시간 미리보기 시트 영역 */}
                <div className="seating-preview-scroll-area">
                    <div className="seating-a4-landscape-wrapper">
                        <div 
                            ref={printSheetRef}
                            className={`seating-print-sheet-content mode-${previewMode}`}
                        >
                            {/* 칠판 영역 (학생용일 때 상단 표시) */}
                            {previewMode !== 'teacher' && (
                                <div className="sp-blackboard top">
                                    <span>칠 판 (앞 쪽)</span>
                                </div>
                            )}

                            {/* 좌우 가운데 정렬된 자리 그리드 */}
                            <div className="sp-grid-container">
                                {displayGrid.map((row, rIdx) => {
                                    const actualR = isTeacherView ? (grid.length - 1 - rIdx) : rIdx;
                                    const cols = isTeacherView ? [...row].reverse() : row;

                                    return (
                                        <div key={rIdx} className="sp-grid-row">
                                            {cols.map((seat, cIdx) => {
                                                const actualC = isTeacherView ? (row.length - 1 - cIdx) : cIdx;
                                                const actualSeat = grid[actualR][actualC];
                                                const student = students?.find(s => s.id === actualSeat.studentId);
                                                const isBlocked = actualSeat.genderPreference === 'blocked';
                                                const genderClass = student ? (student.gender === '남' ? 'male' : 'female') : '';
                                                const isGroupGap = pairSize > 0 && ((cIdx + 1) % pairSize === 0) && (cIdx + 1 < cols.length);

                                                return (
                                                    <div 
                                                        key={cIdx} 
                                                        className={`sp-seat-box ${isGroupGap ? 'has-group-gap' : ''} ${isBlocked ? 'blocked' : ''} ${genderClass} ${student ? 'occupied' : 'empty'}`}
                                                    >
                                                        {isBlocked ? (
                                                             <span className="sp-text-blocked">통로</span>
                                                        ) : student ? (
                                                            <>
                                                                <span className="sp-seat-num">{student.attendanceNumber}번</span>
                                                                <span className="sp-seat-name">{student.name}</span>
                                                            </>
                                                        ) : (
                                                            <span className="sp-text-empty">빈자리</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 칠판 영역 (교사용일 때 하단 표시) */}
                            {previewMode === 'teacher' && (
                                <div className="sp-blackboard bottom">
                                    <span>칠 판 / 교 탁 (교사 시점)</span>
                                </div>
                            )}

                            {/* 하단 푸터 (인쇄일자 및 재적 정보) */}
                            <div className="sp-sheet-footer">
                                <span className="sp-footer-meta">인쇄일자: {new Date().toLocaleDateString('ko-KR')}</span>
                                <span className="sp-footer-meta">재적: {students?.length || 0}명</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 하단 액션 버튼 (가운데 정렬) */}
                <div className="seating-modal-footer">
                    <button 
                        type="button"
                        className="seating-btn secondary"
                        onClick={onClose}
                    >
                        닫기
                    </button>
                    <button 
                        type="button"
                        className="seating-btn pdf-btn"
                        onClick={handleDownloadPdf}
                        disabled={isExporting}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        {isExporting ? (exportProgressText || 'PDF 생성 중...') : 'PDF 다운로드'}
                    </button>
                    <button 
                        type="button"
                        className="seating-btn primary"
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

export default SeatingPrintModal;
