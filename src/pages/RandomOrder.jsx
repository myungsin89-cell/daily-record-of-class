import React, { useState, useEffect, useMemo } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import './RandomOrder.css';

const RandomOrder = () => {
    const { students } = useStudentContext();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;
    const storageKey = `random_order_history_${classId}`;

    const sortedStudents = useMemo(() => {
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

    const [selected, setSelected] = useState(new Set());
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(true);
    const [expandedHistory, setExpandedHistory] = useState(null);
    const [shuffling, setShuffling] = useState(false);

    // 기록 불러오기
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                setHistory(JSON.parse(saved));
            } catch {
                setHistory([]);
            }
        } else {
            setHistory([]);
        }
        setResult(null);
        setSelected(new Set());
    }, [storageKey]);

    const allSelected = sortedStudents.length > 0 && selected.size === sortedStudents.length;
    const someSelected = selected.size > 0 && !allSelected;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sortedStudents.map(s => s.id)));
        }
    };

    const toggleStudent = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleShuffle = () => {
        if (selected.size === 0) return;
        setShuffling(true);
        setTimeout(() => {
            const selectedList = sortedStudents.filter(s => selected.has(s.id));
            // Fisher-Yates shuffle
            const arr = [...selectedList];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            setResult(arr);
            setShuffling(false);
        }, 400);
    };

    const handleSave = () => {
        if (!result) return;
        const now = new Date();
        const label = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const record = {
            id: Date.now(),
            label,
            order: result.map(s => ({ id: s.id, name: s.name, attendanceNumber: s.attendanceNumber, gender: s.gender })),
        };
        const newHistory = [record, ...history];
        setHistory(newHistory);
        localStorage.setItem(storageKey, JSON.stringify(newHistory));
    };

    const handleDeleteHistory = (id, e) => {
        e.stopPropagation();
        const newHistory = history.filter(h => h.id !== id);
        setHistory(newHistory);
        localStorage.setItem(storageKey, JSON.stringify(newHistory));
        if (expandedHistory === id) setExpandedHistory(null);
    };

    const handleClearAllHistory = () => {
        if (!window.confirm('모든 기록을 삭제하시겠습니까?')) return;
        setHistory([]);
        localStorage.setItem(storageKey, JSON.stringify([]));
        setExpandedHistory(null);
    };

    if (!students || students.length === 0) {
        return (
            <div className="ro-empty">
                <div className="ro-empty-icon">👥</div>
                <p>학생 명단이 없습니다.</p>
                <p className="ro-empty-sub">학생 관리에서 학생을 먼저 추가해주세요.</p>
            </div>
        );
    }

    return (
        <div className="ro-page">
            {/* 기록 섹션 */}
            <div className="ro-section ro-history-section">
                <div className="ro-section-header" onClick={() => setShowHistory(v => !v)}>
                    <h2 className="ro-section-title">
                        <span>📋</span> 이전 기록
                        {history.length > 0 && <span className="ro-badge">{history.length}</span>}
                    </h2>
                    <div className="ro-header-actions">
                        {history.length > 0 && (
                            <button
                                className="ro-clear-btn"
                                onClick={(e) => { e.stopPropagation(); handleClearAllHistory(); }}
                            >
                                전체 삭제
                            </button>
                        )}
                        <span className={`ro-toggle-arrow ${showHistory ? 'open' : ''}`}>▾</span>
                    </div>
                </div>

                {showHistory && (
                    <div className="ro-history-list">
                        {history.length === 0 ? (
                            <p className="ro-history-empty">아직 저장된 기록이 없습니다.</p>
                        ) : (
                            history.map(record => (
                                <div key={record.id} className="ro-history-item">
                                    <div
                                        className="ro-history-item-header"
                                        onClick={() => setExpandedHistory(expandedHistory === record.id ? null : record.id)}
                                    >
                                        <span className="ro-history-label">🍽️ {record.label}</span>
                                        <div className="ro-history-actions">
                                            <span className="ro-history-count">{record.order.length}명</span>
                                            <button
                                                className="ro-delete-btn"
                                                onClick={(e) => handleDeleteHistory(record.id, e)}
                                                title="기록 삭제"
                                            >
                                                ✕
                                            </button>
                                            <span className={`ro-toggle-arrow ${expandedHistory === record.id ? 'open' : ''}`}>▾</span>
                                        </div>
                                    </div>
                                    {expandedHistory === record.id && (
                                        <div className="ro-history-detail">
                                            {record.order.map((s, i) => (
                                                <div key={s.id} className="ro-history-row">
                                                    <span className="ro-rank">{i + 1}위</span>
                                                    <span className="ro-num">{s.attendanceNumber}번</span>
                                                    <span className="ro-name">{s.name}</span>
                                                    <span className={`ro-gender ro-gender-${s.gender}`}>{s.gender}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* 학생 선택 섹션 */}
            <div className="ro-section">
                <div className="ro-section-header-static">
                    <h2 className="ro-section-title">
                        <span>👤</span> 학생 선택
                        <span className="ro-badge-neutral">{selected.size}/{sortedStudents.length}명 선택됨</span>
                    </h2>
                    <button
                        className={`ro-select-all-btn ${allSelected ? 'active' : someSelected ? 'partial' : ''}`}
                        onClick={toggleSelectAll}
                    >
                        {allSelected ? '전체 해제' : '전체 선택'}
                    </button>
                </div>

                <div className="ro-student-grid">
                    {sortedStudents.map(student => (
                        <div
                            key={student.id}
                            className={`ro-student-card ${selected.has(student.id) ? 'selected' : ''} ro-gender-bg-${student.gender}`}
                            onClick={() => toggleStudent(student.id)}
                        >
                            <div className="ro-student-check">{selected.has(student.id) ? '✓' : ''}</div>
                            <div className="ro-student-num">{student.attendanceNumber}번</div>
                            <div className="ro-student-name">{student.name}</div>
                            <div className={`ro-student-gender ro-gender-${student.gender}`}>{student.gender}</div>
                        </div>
                    ))}
                </div>

                <div className="ro-shuffle-area">
                    <button
                        className={`ro-shuffle-btn ${shuffling ? 'shuffling' : ''}`}
                        onClick={handleShuffle}
                        disabled={selected.size === 0 || shuffling}
                    >
                        {shuffling ? '🔀 섞는 중...' : '🔀 랜덤 순서 정하기'}
                    </button>
                    {selected.size === 0 && (
                        <p className="ro-hint">학생을 한 명 이상 선택해주세요.</p>
                    )}
                </div>
            </div>

            {/* 결과 섹션 */}
            {result && (
                <div className="ro-section ro-result-section">
                    <div className="ro-section-header-static">
                        <h2 className="ro-section-title">
                            <span>🎲</span> 급식 순서
                        </h2>
                        <button className="ro-save-btn" onClick={handleSave}>
                            💾 기록 저장
                        </button>
                    </div>

                    <div className="ro-result-cards">
                        {result.map((student, i) => (
                            <div
                                key={student.id}
                                className={`ro-result-card ro-gender-bg-${student.gender} ${i < 3 ? 'ro-top-three' : ''}`}
                                style={{ animationDelay: `${i * 0.05}s` }}
                            >
                                <div className="ro-card-order">
                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}번째`}
                                </div>
                                <div className="ro-card-name">{student.name}</div>
                                <div className="ro-card-sub">
                                    <span className="ro-card-num">{student.attendanceNumber}번</span>
                                    <span className={`ro-card-gender ro-gender-${student.gender}`}>{student.gender}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="ro-reshuffle-area">
                        <button className="ro-reshuffle-btn" onClick={handleShuffle} disabled={shuffling}>
                            다시 섞기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RandomOrder;
