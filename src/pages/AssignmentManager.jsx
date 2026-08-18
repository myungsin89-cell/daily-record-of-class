import React, { useState, useEffect } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import Button from '../components/Button';
import './AssignmentManager.css';

import { useSaveStatus } from '../context/SaveStatusContext';

const AssignmentManager = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { showConfirm, showAlert } = useModal();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;
    const { students } = useStudentContext();
    const [assignments, setAssignments] = useState([]);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
    const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
    const { updateSaveStatus } = useSaveStatus();
    const [isLoaded, setIsLoaded] = useState(false);
    
    // memoize sorted students
    const sortedStudents = React.useMemo(() => {
        if (!students) return [];
        return [...students].sort((a, b) => {
            const numA = Number(a.attendanceNumber);
            const numB = Number(b.attendanceNumber);
            
            if (isNaN(numA) && isNaN(numB)) return 0;
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            
            return numA - numB;
        });
    }, [students]);

    // Load assignments from localStorage when class changes
    useEffect(() => {
        const assignmentsKey = `assignments_${classId}`;
        const savedAssignments = localStorage.getItem(assignmentsKey);
        if (savedAssignments) {
            setAssignments(JSON.parse(savedAssignments));
        } else {
            setAssignments([]);
        }
        setIsLoaded(true);
    }, [classId]);

    // Save assignments to localStorage
    useEffect(() => {
        if (!isLoaded) return;

        const assignmentsKey = `assignments_${classId}`;
        if (assignments.length > 0) {
            localStorage.setItem(assignmentsKey, JSON.stringify(assignments));
        } else {
            localStorage.setItem(assignmentsKey, JSON.stringify([]));
        }
        updateSaveStatus();
    }, [assignments, updateSaveStatus, isLoaded, classId]);

    const handleAddAssignment = () => {
        if (!newAssignmentTitle.trim()) {
            alert('과제명을 입력해주세요.');
            return;
        }

        const newAssignment = {
            id: Date.now().toString(),
            title: newAssignmentTitle.trim(),
            date: new Date().toISOString(),
            submissions: {} // { studentId: { status: 'completed' | 'incomplete', note: '' } }
        };

        // Initialize submissions for all current students
        if (students) {
            students.forEach(student => {
                newAssignment.submissions[student.id] = {
                    status: 'incomplete',
                    note: ''
                };
            });
        }

        setAssignments([newAssignment, ...assignments]);
        setNewAssignmentTitle('');
        setSelectedAssignmentId(newAssignment.id);
    };

    const handleDeleteAssignment = async (id) => {
        const confirmed = await showConfirm('이 과제를 삭제하시겠습니까?', '과제 삭제', '삭제', '취소');
        if (confirmed) {
            const updatedAssignments = assignments.filter(a => a.id !== id);
            setAssignments(updatedAssignments);
            if (selectedAssignmentId === id) {
                setSelectedAssignmentId(null);
            }
        }
    };

    const toggleSubmission = (assignmentId, studentId) => {
        setAssignments(assignments.map(assignment => {
            if (assignment.id === assignmentId) {
                const currentStatus = assignment.submissions[studentId]?.status || 'incomplete';
                const newStatus = currentStatus === 'completed' ? 'incomplete' : 'completed';

                return {
                    ...assignment,
                    submissions: {
                        ...assignment.submissions,
                        [studentId]: {
                            ...assignment.submissions[studentId],
                            status: newStatus
                        }
                    }
                };
            }
            return assignment;
        }));
    };

    const updateNote = (assignmentId, studentId, note) => {
        setAssignments(assignments.map(assignment => {
            if (assignment.id === assignmentId) {
                return {
                    ...assignment,
                    submissions: {
                        ...assignment.submissions,
                        [studentId]: {
                            ...assignment.submissions[studentId],
                            note: note
                        }
                    }
                };
            }
            return assignment;
        }));
    };

    // Calculate stats
    const getStats = (assignment) => {
        const total = sortedStudents ? sortedStudents.length : 0;
        if (total === 0) return { completed: 0, incomplete: 0, rate: 0 };

        const completed = Object.values(assignment.submissions || {}).filter(s => s.status === 'completed').length;
        const incomplete = total - completed;
        return {
            completed,
            incomplete,
            rate: Math.round((completed / total) * 100)
        };
    };

    const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);

    return (
        <div className="assignment-container">
            {/* 상단 타이틀 바 */}
            <div className="assignment-top-header mb-md">
                <div className="assignment-top-title">
                    <h2>📋 제출물 및 과제 관리</h2>
                    <span className="assignment-count-badge">총 {assignments.length}개 과제</span>
                </div>
                <div className="add-assignment-top-box">
                    <input
                        type="text"
                        placeholder="새 제출물/과제명 입력..."
                        value={newAssignmentTitle}
                        onChange={(e) => setNewAssignmentTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddAssignment()}
                        className="top-assignment-input"
                    />
                    <button className="create-assignment-btn" onClick={handleAddAssignment}>
                        ➕ 제출물 추가
                    </button>
                </div>
            </div>

            <div className="assignment-layout">
                {/* Assignment List Section (Top in small window, Left in full screen) */}
                <div className="assignment-sidebar">
                    <div className="assignment-list-header mb-xs">
                        <span className="section-small-title">과제 목록 ({assignments.length})</span>
                    </div>
                    <div className="assignment-list">
                        {assignments.map(assignment => (
                            <div
                                key={assignment.id}
                                className={`assignment-item ${selectedAssignmentId === assignment.id ? 'active' : ''}`}
                                onClick={() => setSelectedAssignmentId(assignment.id)}
                            >
                                <div className="assignment-info">
                                    <span className="assignment-title">{assignment.title}</span>
                                    <span className="assignment-date">
                                        {new Date(assignment.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <button
                                    className="delete-btn-mini"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteAssignment(assignment.id);
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content: Student List */}
                <div className="assignment-content">
                    {selectedAssignment ? (
                        <>
                            {(() => {
                                const stats = getStats(selectedAssignment);
                                return (
                                    <>
                                        <div className="assignment-header">
                                            <div className="assignment-header-left">
                                                <h2>{selectedAssignment.title}</h2>
                                                <span className="assignment-created-date">
                                                    생성일: {new Date(selectedAssignment.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                                                </span>
                                            </div>

                                            {/* 초록덕후 요약 뱃지 대시보드 */}
                                            <div className="assignment-stats-badges">
                                                <div className="stat-badge-chip completed-chip">
                                                    <span className="chip-icon">✅</span>
                                                    <span className="chip-label">제출 완료</span>
                                                    <strong className="chip-val">{stats.completed}명</strong>
                                                </div>
                                                <div className="stat-badge-chip incomplete-chip">
                                                    <span className="chip-icon">❌</span>
                                                    <span className="chip-label">미제출</span>
                                                    <strong className="chip-val">{stats.incomplete}명</strong>
                                                </div>
                                                <div className="stat-badge-chip rate-chip">
                                                    <span className="chip-label">제출률</span>
                                                    <strong className="chip-val">{stats.rate}%</strong>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="progress-bar-container">
                                            <div className="progress-track">
                                                <div
                                                    className="progress-fill green-progress-fill"
                                                    style={{ width: `${stats.rate}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        <div className="student-grid">
                                            {sortedStudents.map(student => {
                                                const submission = selectedAssignment.submissions[student.id] || { status: 'incomplete', note: '' };
                                                const isCompleted = submission.status === 'completed';

                                                return (
                                                    <div
                                                        key={student.id}
                                                        className={`student-card ${isCompleted ? 'completed' : 'incomplete'}`}
                                                    >
                                                        <div
                                                            className="student-main"
                                                            onClick={() => toggleSubmission(selectedAssignment.id, student.id)}
                                                        >
                                                            <div className="student-info">
                                                                <span className="student-number">{student.attendanceNumber}번</span>
                                                                <span className="student-name">{student.name}</span>
                                                            </div>
                                                            <span className="assignment-status-wrapper">
                                                                {isCompleted ? (
                                                                    <span className="status-label completed">
                                                                        <span className="status-emoji">✅</span>
                                                                        <span className="status-text">제출완료</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="status-label incomplete">
                                                                        <span className="status-emoji">❌</span>
                                                                        <span className="status-text">미제출</span>
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>

                                                        <div className="note-input-container">
                                                            {!isCompleted ? (
                                                                <input
                                                                    type="text"
                                                                    placeholder="미제출 사유 입력"
                                                                    value={submission.note || ''}
                                                                    onChange={(e) => updateNote(selectedAssignment.id, student.id, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="reason-input-field"
                                                                />
                                                            ) : (
                                                                <div className="reason-placeholder-slot" />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="empty-state">
                            <p>왼쪽에서 과제를 선택하거나 새로운 과제를 추가해주세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AssignmentManager;
