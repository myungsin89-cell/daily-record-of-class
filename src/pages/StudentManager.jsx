import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Card from '../components/Card';
import Button from '../components/Button';
import { useStudentContext } from '../context/StudentContext';
import './StudentManager.css';

// localStorage key for draft data
const DRAFT_KEY = 'student_manager_draft';

const StudentManager = () => {
    const { students, addStudent, addStudents, removeStudent, isLoading } = useStudentContext();
    const [name, setName] = useState('');
    const [attendanceNumber, setAttendanceNumber] = useState('');
    const [gender, setGender] = useState('남');
    const [bulkMode, setBulkMode] = useState('excel'); // 'excel' | 'paste'
    const [pasteText, setPasteText] = useState('');
    const [uploadMessage, setUploadMessage] = useState('');
    const [recentlyAddedIds, setRecentlyAddedIds] = useState([]);
    const studentListRef = React.useRef(null);

    // Load draft from localStorage on mount
    useEffect(() => {
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) {
            try {
                const { name: draftName, attendanceNumber: draftNum, gender: draftGender } = JSON.parse(draft);
                if (draftName) setName(draftName);
                if (draftNum) setAttendanceNumber(draftNum);
                if (draftGender) setGender(draftGender);
            } catch (error) {
                console.error('Failed to load draft:', error);
            }
        }
    }, []);

    // Auto-save draft to localStorage
    useEffect(() => {
        if (name || attendanceNumber) {
            const draft = { name, attendanceNumber, gender };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        }
    }, [name, attendanceNumber, gender]);

    if (isLoading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중...</div>;
    }

    const handleAddStudent = (e) => {
        e.preventDefault();
        if (!name || !attendanceNumber) return;

        const newStudent = {
            id: Date.now(),
            name,
            attendanceNumber: parseInt(attendanceNumber),
            gender,
        };

        addStudent(newStudent);
        setName('');
        setAttendanceNumber('');
        setGender('남');
        setUploadMessage('');
        localStorage.removeItem(DRAFT_KEY);
    };

    // 성별 정규화 함수
    const normalizeGender = (value) => {
        if (!value) return null;
        const trimmed = value.toString().trim();
        if (trimmed === '남' || trimmed === '남성' || trimmed === '남자') return '남';
        if (trimmed === '여' || trimmed === '여성' || trimmed === '여자') return '여';
        return null;
    };

    const handlePasteRegister = () => {
        if (!pasteText.trim()) {
            setUploadMessage('❌ 붙여넣을 내용을 입력해주세요.');
            return;
        }

        const lines = pasteText.trim().split('\n');
        let successCount = 0;
        let errorCount = 0;
        const baseTime = Date.now();
        const validStudents = [];

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return; // 빈 줄 무시

            // 탭 또는 공백으로 분리
            const parts = trimmedLine.split(/[\t]+|[ ]{2,}|\s+/);

            if (parts.length < 3) {
                console.error(`${index + 1}번째 줄: 필드 부족 (출석번호, 이름, 성별 필요)`);
                errorCount++;
                return;
            }

            const attNum = parseInt(parts[0]);
            const studentName = parts[1];
            const gender = normalizeGender(parts[2]);

            if (isNaN(attNum) || attNum < 1) {
                console.error(`${index + 1}번째 줄: 출석번호가 올바르지 않습니다`);
                errorCount++;
                return;
            }

            if (!studentName) {
                console.error(`${index + 1}번째 줄: 이름이 비어있습니다`);
                errorCount++;
                return;
            }

            if (!gender) {
                console.error(`${index + 1}번째 줄: 성별은 '남/남성/남자' 또는 '여/여성/여자'여야 합니다`);
                errorCount++;
                return;
            }

            validStudents.push({
                id: baseTime + (index * 1000),
                name: studentName.trim(),
                attendanceNumber: attNum,
                gender: gender,
            });
            successCount++;
        });

        if (validStudents.length > 0) {
            addStudents(validStudents);
            const newIds = validStudents.map(s => s.id);
            setRecentlyAddedIds(newIds);

            setTimeout(() => {
                if (studentListRef.current) {
                    studentListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);

            setTimeout(() => {
                setRecentlyAddedIds([]);
            }, 3000);

            setPasteText('');
        }

        setUploadMessage(`✅ ${successCount}명 추가 완료${errorCount > 0 ? `, ${errorCount}명 실패` : ''}`);
        setTimeout(() => setUploadMessage(''), 5000);
    };

    const handleExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                let successCount = 0;
                let errorCount = 0;
                const baseTime = Date.now();
                const validStudents = [];

                jsonData.forEach((row, index) => {
                    try {
                        if (!row['이름'] || !row['출석번호'] || !row['성별']) {
                            console.error(`행 ${index + 2}: 필수 필드 누락`);
                            errorCount++;
                            return;
                        }

                        const gender = normalizeGender(row['성별']);
                        if (!gender) {
                            console.error(`행 ${index + 2}: 성별은 '남/남성' 또는 '여/여성'이어야 합니다`);
                            errorCount++;
                            return;
                        }

                        const attNum = parseInt(row['출석번호']);
                        if (isNaN(attNum) || attNum < 1) {
                            console.error(`행 ${index + 2}: 출석번호는 1 이상의 숫자여야 합니다`);
                            errorCount++;
                            return;
                        }

                        const newStudent = {
                            id: baseTime + (index * 1000),
                            name: row['이름'].toString().trim(),
                            attendanceNumber: attNum,
                            gender: gender,
                        };

                        validStudents.push(newStudent);
                        successCount++;
                    } catch (error) {
                        console.error(`행 ${index + 2} 처리 중 오류:`, error);
                        errorCount++;
                    }
                });

                if (validStudents.length > 0) {
                    addStudents(validStudents);
                    const newIds = validStudents.map(s => s.id);
                    setRecentlyAddedIds(newIds);

                    setTimeout(() => {
                        if (studentListRef.current) {
                            studentListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 100);

                    setTimeout(() => {
                        setRecentlyAddedIds([]);
                    }, 3000);
                }

                setUploadMessage(`✅ ${successCount}명 추가 완료${errorCount > 0 ? `, ${errorCount}명 실패` : ''}`);
                setTimeout(() => setUploadMessage(''), 5000);
                e.target.value = '';
            } catch (error) {
                console.error('엑셀 파일 처리 오류:', error);
                setUploadMessage('❌ 파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const downloadExampleFile = () => {
        try {
            const exampleData = [
                { '출석번호': 1, '이름': '김철수', '성별': '남' },
                { '출석번호': 2, '이름': '이영희', '성별': '여' },
                { '출석번호': 3, '이름': '박민수', '성별': '남' },
                { '출석번호': 4, '이름': '최지혜', '성별': '여' },
                { '출석번호': 5, '이름': '정우진', '성별': '남' },
            ];

            const worksheet = XLSX.utils.json_to_sheet(exampleData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '학생명단');

            worksheet['!cols'] = [
                { wch: 10 },
                { wch: 10 },
                { wch: 8 },
            ];

            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const fileData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(fileData);
            const link = document.createElement('a');
            link.href = url;
            link.download = '학생_명단_예시.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading example file:', error);
            alert('예시 파일 다운로드 중 오류가 발생했습니다.');
        }
    };

    // Sort students by attendance number
    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    return (
        <>
            <div className="flex justify-between items-center mb-lg">
                <h1>학생 관리</h1>
            </div>

            {/* Bulk Registration Section */}
            <Card style={{ marginBottom: '1.5rem', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ color: '#0369a1', margin: 0 }}>📋 학생 일괄 등록</h3>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e2e8f0', marginBottom: '1rem' }}>
                    <button
                        onClick={() => setBulkMode('excel')}
                        style={{
                            padding: '0.5rem 1.25rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontWeight: bulkMode === 'excel' ? 700 : 500,
                            fontSize: '0.9rem',
                            color: bulkMode === 'excel' ? '#0369a1' : '#64748b',
                            borderBottom: bulkMode === 'excel' ? '2px solid #0369a1' : '2px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        엑셀 파일로 등록
                    </button>
                    <button
                        onClick={() => setBulkMode('paste')}
                        style={{
                            padding: '0.5rem 1.25rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontWeight: bulkMode === 'paste' ? 700 : 500,
                            fontSize: '0.9rem',
                            color: bulkMode === 'paste' ? '#0369a1' : '#64748b',
                            borderBottom: bulkMode === 'paste' ? '2px solid #0369a1' : '2px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        복사해서 등록
                    </button>
                </div>

                {/* Excel Mode */}
                {bulkMode === 'excel' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Button variant="secondary" onClick={downloadExampleFile}>
                            📥 예시 파일 다운로드
                        </Button>
                        <label className="file-upload-label" style={{ margin: 0 }}>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleExcelUpload}
                                style={{ display: 'none' }}
                            />
                            <Button variant="accent" as="span">
                                📤 엑셀 파일 업로드
                            </Button>
                        </label>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            💡 예시 파일 양식에 맞춰 업로드하세요
                        </span>
                    </div>
                )}

                {/* Paste Mode */}
                {bulkMode === 'paste' && (
                    <div>
                        <textarea
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                            placeholder={`출석번호  이름  성별 순서로 한 줄에 한 명씩 입력하세요.\n\n예시:\n1  김철수  남\n2  이영희  여\n3  박민수  남성\n4  최지혜  여성`}
                            style={{
                                width: '100%',
                                minHeight: '140px',
                                padding: '0.85rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontFamily: 'monospace',
                                lineHeight: '1.6',
                                resize: 'vertical',
                                backgroundColor: 'white',
                            }}
                        />
                        <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                💡 탭 또는 공백으로 구분 · 남/남성/남자, 여/여성/여자 모두 인식
                            </span>
                            <Button variant="accent" onClick={handlePasteRegister}>
                                등록하기
                            </Button>
                        </div>
                    </div>
                )}

                {uploadMessage && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: uploadMessage.includes('✅') ? '#d1fae5' : '#fee2e2',
                        border: `1px solid ${uploadMessage.includes('✅') ? '#10b981' : '#ef4444'}`,
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        color: uploadMessage.includes('✅') ? '#065f46' : '#991b1b',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span>{uploadMessage.includes('✅') ? '🎉' : '⚠️'}</span>
                        <span>{uploadMessage}</span>
                    </div>
                )}
            </Card>

            {/* Manual Add Form */}
            <Card style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--color-text)' }}>✏️ 학생 직접 등록</h3>
                <form className="student-form-grid" onSubmit={handleAddStudent}>
                    <div className="sm-form-group">
                        <label className="sm-form-label">이름</label>
                        <input
                            type="text"
                            className="sm-form-input"
                            placeholder="예: 김철수"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="sm-form-group">
                        <label className="sm-form-label">출석번호</label>
                        <input
                            type="number"
                            className="sm-form-input"
                            placeholder="예: 1"
                            min="1"
                            value={attendanceNumber}
                            onChange={(e) => setAttendanceNumber(e.target.value)}
                        />
                    </div>
                    <div className="sm-form-group">
                        <label className="sm-form-label">성별</label>
                        <div className="gender-toggle-group">
                            <button
                                type="button"
                                className={`gender-toggle-btn ${gender === '남' ? 'active male' : ''}`}
                                onClick={() => setGender('남')}
                            >
                                남
                            </button>
                            <button
                                type="button"
                                className={`gender-toggle-btn ${gender === '여' ? 'active female' : ''}`}
                                onClick={() => setGender('여')}
                            >
                                여
                            </button>
                        </div>
                    </div>
                    <Button type="submit" variant="primary" style={{ width: '100%', height: '42px', alignSelf: 'end' }}>
                        학생 추가
                    </Button>
                </form>
            </Card>

            <div className="student-list" ref={studentListRef}>
                {sortedStudents.length === 0 ? (
                    <Card className="col-span-full text-center">
                        <p>등록된 학생이 없습니다. 학생을 추가해주세요.</p>
                    </Card>
                ) : (
                    sortedStudents.map((student) => (
                        <Card
                            key={student.id}
                            className="student-card-container"
                            style={{
                                border: recentlyAddedIds.includes(student.id) ? '3px solid #10b981' : undefined,
                                boxShadow: recentlyAddedIds.includes(student.id) ? '0 4px 12px rgba(16, 185, 129, 0.3)' : undefined,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <button
                                className="student-card-delete-btn"
                                onClick={() => removeStudent(student.id)}
                                title="삭제"
                            >
                                ×
                            </button>
                            <div className="student-card-content">
                                <span className="student-card-number">{student.attendanceNumber}번</span>
                                <span className="student-card-name">{student.name}</span>
                                <span className="student-card-gender">({student.gender})</span>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </>
    );
};

export default StudentManager;
