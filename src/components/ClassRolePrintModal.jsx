import React, { useState, useRef } from 'react';
import { exportSinglePageA4Pdf } from '../utils/pdfExport';
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

    const handlePrint = async () => {
        if (!printSheetRef.current) return;
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

            const pdf = new jsPDF('p', 'mm', 'a4');
            const margin = 8;
            const pageWidth = 210;
            const pageHeight = 297;
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
                await window.electronAPI.saveTempAndOpen(Array.from(pdfUint8), `${classNameText}_1인1역_배정표_인쇄.pdf`);
            } else {
                // 웹 환경: Blob URL로 새 탭에서 열기 (브라우저 인쇄 다이얼로그 활용)
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

    return (
        <div className="cr-modal-print-overlay" onClick={onClose}>
            <div className="cr-modal-print-container" onClick={(e) => e.stopPropagation()}>
                {/* 모달 상단 헤더 */}
                <div className="cr-modal-print-header">
                    <h3>1인 1역 배정표 인쇄 미리보기</h3>
                    <button className="cr-modal-print-close" onClick={onClose} aria-label="닫기">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* A4 세로 실시간 미리보기 시트 스크롤 영역 */}
                <div className="cr-modal-print-scroll-area">
                    <div className="cr-a4-portrait-wrapper">
                        <div ref={printSheetRef} className="cr-sheet-content">
                            {/* 헤더 배너 */}
                            <div className="cr-sheet-header">
                                <h2 className="cr-sheet-main-title">1인 1역 배정표</h2>
                            </div>

                            {/* 1인 1역 테이블 */}
                            <table className="cr-sheet-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '8%' }}>순번</th>
                                        <th style={{ width: '22%' }}>역할명</th>
                                        <th style={{ width: '34%' }}>활동 내용</th>
                                        <th style={{ width: '10%' }}>정원</th>
                                        <th style={{ width: '26%' }}>담당 학생</th>
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
                                                    return s ? s.name : null;
                                                })
                                                .filter(Boolean);

                                            return (
                                                <tr key={role.id || idx}>
                                                    <td className="text-center cell-num">{idx + 1}</td>
                                                    <td className="cr-sheet-role-name">{role.name}</td>
                                                    <td className="cr-sheet-role-desc">{role.description || '-'}</td>
                                                    <td className="text-center cell-count">{role.count}명</td>
                                                    <td className="cr-sheet-assigned-students">
                                                        {studentNames.length > 0 ? (
                                                            <span className="cr-assigned-names-text">
                                                                {studentNames.join(', ')}
                                                            </span>
                                                        ) : (
                                                            <span className="cr-unassigned-text">-</span>
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
                                <div className="cr-footer-left">
                                    <span>인쇄일자: {new Date().toLocaleDateString('ko-KR')}</span>
                                </div>
                                <div className="cr-footer-right">
                                    <span>{classNameText}</span>
                                    <span className="cr-footer-divider">·</span>
                                    <span>재적: {students?.length || 0}명</span>
                                    <span className="cr-footer-divider">·</span>
                                    <span>총 <strong className="cr-point-green">{roles.length}개</strong> 역할 (<strong className="cr-point-green">{totalAssigned}/{totalCapacity}명</strong> 배정)</span>
                                </div>
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
                        {isExporting ? (exportProgressText || 'PDF 생성 중...') : 'PDF 다운로드'}
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
