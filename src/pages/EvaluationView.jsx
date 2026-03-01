import React from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import { useStudentContext } from '../context/StudentContext';
import './EvaluationView.css';

const EvaluationView = () => {
    const { students, finalizedEvaluations } = useStudentContext();
    const navigate = useNavigate();

    // Sort students by attendance number
    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    const handleExcelDownload = () => {
        try {
            // Prepare data for Excel
            const excelData = sortedStudents.map(student => ({
                '출석번호': student.attendanceNumber,
                '이름': student.name,
                '성별': student.gender,
                '행동발달평가': finalizedEvaluations[student.id] || '미작성'
            }));

            // Create worksheet
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // Set column widths
            worksheet['!cols'] = [
                { wch: 10 },  // 출석번호
                { wch: 12 },  // 이름
                { wch: 8 },   // 성별
                { wch: 80 }   // 행동발달평가
            ];

            // Create workbook and add worksheet
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '행동발달평가');

            // Generate buffer
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

            // Create Blob and download
            const data = new Blob([excelBuffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            const url = window.URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `행동발달평가_${new Date().toLocaleDateString('ko-KR')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            alert('✅ 엑셀 파일이 다운로드되었습니다!');
        } catch (error) {
            console.error('Excel download error:', error);
            alert('❌ 엑셀 다운로드 중 오류가 발생했습니다.');
        }
    };

    return (
        <>
            <div className="flex justify-between items-center mb-lg">
                <h1>📋 행동발달평가 확인</h1>
                <div className="flex" style={{ gap: '0.75rem' }}>
                    <Button
                        variant="primary"
                        onClick={handleExcelDownload}
                        disabled={sortedStudents.length === 0}
                    >
                        📊 엑셀 다운로드
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => navigate('/journal-entry')}
                    >
                        ← 돌아가기
                    </Button>
                </div>
            </div>

            {sortedStudents.length === 0 ? (
                <Card>
                    <div className="empty-state">
                        <p>등록된 학생이 없습니다.</p>
                        <Button
                            variant="primary"
                            onClick={() => navigate('/student-manager')}
                            style={{ marginTop: '1rem' }}
                        >
                            학생 등록하기
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="evaluation-list">
                    {sortedStudents.map((student) => {
                        const evaluation = finalizedEvaluations[student.id];
                        const hasEvaluation = evaluation && evaluation.trim() !== '';

                        return (
                            <Card key={student.id} className="evaluation-card">
                                <div className="evaluation-header">
                                    <div className="student-info">
                                        <span className="student-number">#{student.attendanceNumber}</span>
                                        <span className="student-name">{student.name}</span>
                                        <span className="student-gender">({student.gender})</span>
                                    </div>
                                    <div className="evaluation-status">
                                        {hasEvaluation ? (
                                            <span className="badge badge-success">✅ 작성완료</span>
                                        ) : (
                                            <span className="badge badge-warning">⚠️ 미작성</span>
                                        )}
                                    </div>
                                </div>
                                <div className="evaluation-body">
                                    {hasEvaluation ? (
                                        <p className="evaluation-text">{evaluation}</p>
                                    ) : (
                                        <p className="evaluation-placeholder">
                                            행동발달평가가 작성되지 않았습니다. 학생 기록 페이지에서 AI 평가를 생성하고 저장해주세요.
                                        </p>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </>
    );
};

export default EvaluationView;
