import React, { useState, useEffect, useRef } from 'react';
import Button from '../components/Button';
import { useStudentContext } from '../context/StudentContext';
import './JournalEntry.css';

const JournalEntry = () => {
    const { students, journals, addJournalEntry, updateJournalEntry, deleteJournalEntry, attendance } = useStudentContext();
    const [selectedStudentId, setSelectedStudentId] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryContent, setEntryContent] = useState('');
    const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');

    // Auto-save states
    const [lastSaved, setLastSaved] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const autoSaveTimerRef = useRef(null);



    const handleAddEntry = () => {
        if (!selectedStudentId || !entryContent.trim()) return;

        const newEntry = {
            id: Date.now(),
            date: new Date(selectedDate).toISOString(),
            content: entryContent,
        };

        addJournalEntry(selectedStudentId, newEntry);
        setEntryContent('');
    };

    const handleStartEdit = (entry) => {
        setEditingId(entry.id);
        setEditContent(entry.content);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditContent('');
    };

    const handleSaveEdit = (entryId) => {
        if (!editContent.trim()) return;
        updateJournalEntry(selectedStudentId, entryId, { content: editContent });
        setEditingId(null);
        setEditContent('');
    };

    // Auto-save function
    const autoSave = async () => {
        if (!selectedStudentId || !entryContent.trim() || !hasUnsavedChanges) return;

        setIsSaving(true);
        try {
            const newEntry = {
                id: Date.now(),
                date: new Date(selectedDate).toISOString(),
                content: entryContent,
            };

            addJournalEntry(selectedStudentId, newEntry);
            setLastSaved(new Date());
            setHasUnsavedChanges(false);
            setEntryContent('');
            updateSaveStatus(); // Update global save status
        } catch (error) {
            console.error('Auto-save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Track content changes
    useEffect(() => {
        if (entryContent.trim() && selectedStudentId) {
            setHasUnsavedChanges(true);
        }
    }, [entryContent, selectedStudentId]);

    // 30-second auto-save
    useEffect(() => {
        if (autoSaveTimerRef.current) {
            clearInterval(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setInterval(() => {
            if (hasUnsavedChanges) {
                autoSave();
            }
        }, 30000); // 30 seconds

        return () => {
            if (autoSaveTimerRef.current) {
                clearInterval(autoSaveTimerRef.current);
            }
        };
    }, [hasUnsavedChanges, entryContent, selectedStudentId]);

    // Save before closing
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasUnsavedChanges && entryContent.trim()) {
                e.preventDefault();
                e.returnValue = '';
                autoSave();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedChanges, entryContent]);

    // Auto-refresh time display every minute
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => {
            setTick(prev => prev + 1);
        }, 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);


    const selectedStudent = students.find(s => s.id === selectedStudentId);
    const studentJournals = selectedStudentId ? (journals[selectedStudentId] || []) : [];

    // Group journals by date (descending)
    const groupedJournals = studentJournals.reduce((groups, entry) => {
        const dateKey = new Date(entry.date).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(entry);
        return groups;
    }, {});

    // Sort dates in descending order and sort entries within each date by time
    const sortedDateGroups = Object.entries(groupedJournals)
        .sort((a, b) => {
            const dateA = new Date(groupedJournals[a[0]][0].date);
            const dateB = new Date(groupedJournals[b[0]][0].date);
            return dateB - dateA;
        })
        .map(([dateKey, entries]) => ({
            dateKey,
            entries: entries.sort((a, b) => new Date(a.date) - new Date(b.date))
        }));

    // Sort students by attendance number
    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    // Format date for display
    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };

    // Format time for display
    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get student attendance summary
    const getStudentAttendanceSummary = () => {
        if (!selectedStudentId) return [];

        const summary = [];

        // Get all dates with attendance records
        Object.keys(attendance).forEach(dateKey => {
            const dayAttendance = attendance[dateKey];
            const studentRecord = dayAttendance[selectedStudentId];

            if (studentRecord) {
                const status = typeof studentRecord === 'string' ? studentRecord : studentRecord.status;
                const reason = typeof studentRecord === 'object' ? studentRecord.reason : '';

                // Only include special statuses (not present)
                if (status && status !== 'present') {
                    summary.push({
                        date: new Date(dateKey),
                        dateString: new Date(dateKey).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short'
                        }),
                        status: status,
                        reason: reason
                    });
                }
            }
        });

        // Sort by date descending
        return summary.sort((a, b) => b.date - a.date);
    };

    const getStatusLabel = (status) => {
        const statusMap = {
            late: '지각',
            sick: '병결',
            fieldtrip: '체험학습',
            other: '기타'
        };
        return statusMap[status] || status;
    };

    const getStatusColor = (status) => {
        const colorMap = {
            late: '#f59e0b',
            sick: '#3b82f6',
            fieldtrip: '#8b5cf6',
            other: '#6b7280'
        };
        return colorMap[status] || '#6b7280';
    };

    const attendanceSummary = getStudentAttendanceSummary();

    // Calculate attendance statistics
    const getAttendanceStats = () => {
        if (!selectedStudentId) return {};

        const stats = {
            late: 0,
            sick: 0,
            fieldtrip: 0,
            other: 0
        };

        attendanceSummary.forEach(record => {
            if (stats.hasOwnProperty(record.status)) {
                stats[record.status]++;
            }
        });

        return stats;
    };

    const attendanceStats = getAttendanceStats();

    return (
        <>
            <div className="flex justify-between items-center mb-lg">
                <h1>학생 기록</h1>
            </div>


            <div className="journal-container">
                <div className="student-selector">
                    <h3 className="mb-md text-lg font-semibold">학생 목록</h3>
                    {sortedStudents.length === 0 ? (
                        <p className="text-muted">등록된 학생이 없습니다.</p>
                    ) : (
                        sortedStudents.map((student) => (
                            <div
                                key={student.id}
                                className={`student-item ${selectedStudentId === student.id ? 'active' : ''}`}
                                onClick={() => setSelectedStudentId(student.id)}
                            >
                                <span>{student.attendanceNumber}.</span> {student.name} <span style={{ fontSize: '0.85em', opacity: 0.7 }}>({student.gender})</span>
                            </div>
                        ))
                    )}
                </div>

                <div className="journal-content">
                    {selectedStudentId ? (
                        <>
                            {/* Record Entry Form */}
                            <div className="journal-form">
                                <h3 className="mb-md">{formatDate(selectedDate)} {selectedStudent.name} 학생 행동 기록</h3>

                                <div className="date-selector-inline" style={{ marginBottom: '1rem' }}>
                                    <label className="form-label" style={{ marginRight: '0.5rem' }}>기록 날짜:</label>
                                    <input
                                        type="date"
                                        className="date-input"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        max={new Date().toISOString().split('T')[0]}
                                    />
                                </div>

                                <textarea
                                    className="journal-textarea"
                                    placeholder="오늘 관찰한 행동이나 특이사항을 기록하세요..."
                                    value={entryContent}
                                    onChange={(e) => setEntryContent(e.target.value)}
                                />
                                <div className="flex justify-end">
                                    <Button variant="primary" onClick={handleAddEntry}>기록 저장</Button>
                                </div>
                            </div>

                            {/* Attendance Summary */}
                            {attendanceSummary.length > 0 && (
                                <div className="attendance-summary-section" style={{ marginBottom: '1rem' }}>
                                    <h3 className="mb-md">📊 출결 특이사항</h3>

                                    {/* Statistics Summary */}
                                    <div className="attendance-stats-grid">
                                        {attendanceStats.late > 0 && (
                                            <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
                                                <div className="stat-label">지각</div>
                                                <div className="stat-value" style={{ color: '#f59e0b' }}>{attendanceStats.late}회</div>
                                            </div>
                                        )}
                                        {attendanceStats.sick > 0 && (
                                            <div className="stat-card" style={{ borderLeftColor: '#3b82f6' }}>
                                                <div className="stat-label">병결</div>
                                                <div className="stat-value" style={{ color: '#3b82f6' }}>{attendanceStats.sick}회</div>
                                            </div>
                                        )}
                                        {attendanceStats.fieldtrip > 0 && (
                                            <div className="stat-card" style={{ borderLeftColor: '#8b5cf6' }}>
                                                <div className="stat-label">체험학습</div>
                                                <div className="stat-value" style={{ color: '#8b5cf6' }}>{attendanceStats.fieldtrip}회</div>
                                            </div>
                                        )}
                                        {attendanceStats.other > 0 && (
                                            <div className="stat-card" style={{ borderLeftColor: '#6b7280' }}>
                                                <div className="stat-label">기타</div>
                                                <div className="stat-value" style={{ color: '#6b7280' }}>{attendanceStats.other}회</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Toggle Button for Details */}
                                    <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                                        <button
                                            onClick={() => setShowAttendanceDetails(!showAttendanceDetails)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--color-primary)',
                                                fontSize: '0.9rem',
                                                cursor: 'pointer',
                                                padding: '0.25rem 0',
                                                textDecoration: 'underline',
                                                fontWeight: '500'
                                            }}
                                        >
                                            {showAttendanceDetails ? '▼ 상세 내역 닫기' : '▶ 상세 내역 보기'}
                                        </button>
                                    </div>

                                    {/* Detailed Table - Collapsible */}
                                    {showAttendanceDetails && (
                                        <>
                                            <h4 className="mb-sm" style={{ marginTop: '1rem', fontSize: '0.95rem', fontWeight: '600' }}>상세 내역</h4>
                                            <table className="attendance-table">
                                                <thead>
                                                    <tr>
                                                        <th>날짜</th>
                                                        <th>상태</th>
                                                        <th>사유</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attendanceSummary.map((record, index) => (
                                                        <tr key={index}>
                                                            <td>{record.dateString}</td>
                                                            <td>
                                                                <span
                                                                    className="status-badge"
                                                                    style={{
                                                                        backgroundColor: getStatusColor(record.status),
                                                                        color: 'white',
                                                                        padding: '0.25rem 0.5rem',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.85rem',
                                                                        fontWeight: '600'
                                                                    }}
                                                                >
                                                                    {getStatusLabel(record.status)}
                                                                </span>
                                                            </td>
                                                            <td style={{ color: 'var(--color-text-muted)' }}>
                                                                {record.reason || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Cumulative Records */}
                            <div className="cumulative-records">
                                <h3 className="mb-sm">누가기록 내역</h3>
                                {sortedDateGroups.length === 0 ? (
                                    <p className="text-muted">작성된 기록이 없습니다.</p>
                                ) : (
                                    sortedDateGroups.map(({ dateKey, entries }) => (
                                        <div key={dateKey} className="date-group">
                                            <div className="date-header">
                                                📅 {dateKey}
                                            </div>
                                            <div className="date-entries">
                                                {entries.map((entry) => (
                                                    <div key={entry.id} className={`record-item ${editingId === entry.id ? 'is-editing' : ''}`}>
                                                        <div className="record-header">
                                                            <span className="record-time">{formatTime(entry.date)}</span>
                                                            <div className="record-actions">
                                                                {editingId === entry.id ? (
                                                                    <>
                                                                        <button className="action-btn save" onClick={() => handleSaveEdit(entry.id)}>저장</button>
                                                                        <button className="action-btn cancel" onClick={handleCancelEdit}>취소</button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button className="action-btn edit" onClick={() => handleStartEdit(entry)}>수정</button>
                                                                        <button className="action-btn delete" onClick={() => deleteJournalEntry(selectedStudentId, entry.id)}>삭제</button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {editingId === entry.id ? (
                                                            <textarea
                                                                className="edit-textarea"
                                                                value={editContent}
                                                                onChange={(e) => setEditContent(e.target.value)}
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span className="record-content">{entry.content}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted">
                            학생 행동을 기록하거나 조회할 학생을 선택해주세요.
                        </div>
                    )}
                </div>
            </div >


        </>
    );
};

export default JournalEntry;
