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

    // Mode: 'order' (랜덤 순서 정하기) vs 'picker' (발표자 랜덤 뽑기)
    const [mainMode, setMainMode] = useState('order');
    const [selected, setSelected] = useState(new Set());
    const [pickCount, setPickCount] = useState(1);

    // Records history for 'order' mode
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(true);

    // Animation state
    const [isAnimating, setIsAnimating] = useState(false);
    const [animatingName, setAnimatingName] = useState('');

    // Modal states
    // 1) Mode A: Order Result Large Modal
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [activeOrderRecord, setActiveOrderRecord] = useState(null); // { id, title, date, list: [] }
    const [orderTitleInput, setOrderTitleInput] = useState('');
    const [isOrderFullscreen, setIsOrderFullscreen] = useState(false);

    // 2) Mode B: Picker Celebration Modal
    const [showPickerModal, setShowPickerModal] = useState(false);
    const [pickerWinners, setPickerWinners] = useState([]);

    // Print state
    const [isPrintMode, setIsPrintMode] = useState(false);

    // Load saved history (only for order mode)
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try { setHistory(JSON.parse(saved)); } catch { setHistory([]); }
        } else {
            setHistory([]);
        }
        setSelected(new Set());
    }, [storageKey]);

    // Web Audio Synthesizer Sounds
    const playTickSound = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(550, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch (e) {}
    };

    const playFanfareSound = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            chord.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + idx * 0.08 + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.7);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.08);
                osc.stop(ctx.currentTime + idx * 0.08 + 0.7);
            });
        } catch (e) {}
    };

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
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Mode A: Random Sequence Generation
    const handleGenerateOrder = () => {
        if (selected.size === 0) return;
        const pool = sortedStudents.filter(s => selected.has(s.id));
        setIsAnimating(true);

        let counter = 0;
        const maxTicks = 20;
        const interval = setInterval(() => {
            counter++;
            const randomPick = pool[Math.floor(Math.random() * pool.length)];
            setAnimatingName(`${randomPick.attendanceNumber}번 ${randomPick.name}`);
            playTickSound();

            if (counter >= maxTicks) {
                clearInterval(interval);
                // Fisher-Yates shuffle
                const shuffled = [...pool];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                const now = new Date();
                const defaultTitle = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} 랜덤 순서`;

                setActiveOrderRecord({
                    id: Date.now(),
                    title: defaultTitle,
                    list: shuffled,
                    date: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                });
                setOrderTitleInput(defaultTitle);
                setIsAnimating(false);
                setShowOrderModal(true);
                playFanfareSound();
            }
        }, 80);
    };

    // Mode B: Random Speaker Picker (NO HISTORY SAVING, ONLY CELEBRATION MODAL)
    const handlePickWinners = () => {
        if (selected.size === 0) return;
        const pool = sortedStudents.filter(s => selected.has(s.id));
        const countToPick = Math.min(pickCount, pool.length);
        setIsAnimating(true);

        let counter = 0;
        const maxTicks = 25;
        const interval = setInterval(() => {
            counter++;
            const randomPick = pool[Math.floor(Math.random() * pool.length)];
            setAnimatingName(`${randomPick.attendanceNumber}번 ${randomPick.name}`);
            playTickSound();

            if (counter >= maxTicks) {
                clearInterval(interval);
                // Pick random N
                const shuffled = [...pool];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                const winners = shuffled.slice(0, countToPick);
                setPickerWinners(winners);
                setIsAnimating(false);
                setShowPickerModal(true);
                playFanfareSound();
            }
        }, 80);
    };

    // Save Active Order Record to History (Only for Mode A)
    const handleSaveOrderRecord = () => {
        if (!activeOrderRecord) return;
        const finalTitle = orderTitleInput.trim() || activeOrderRecord.title;
        const record = {
            ...activeOrderRecord,
            title: finalTitle
        };
        const updated = [record, ...history.filter(h => h.id !== record.id)];
        setHistory(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        alert('📋 순서 기록이 성공적으로 저장되었습니다!');
    };

    const handleDeleteHistoryItem = (id, e) => {
        e.stopPropagation();
        const updated = history.filter(h => h.id !== id);
        setHistory(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        if (activeOrderRecord?.id === id) setShowOrderModal(false);
    };

    const handleClearAllHistory = () => {
        if (!window.confirm('저장된 모든 순서 기록을 삭제하시겠습니까?')) return;
        setHistory([]);
        localStorage.setItem(storageKey, JSON.stringify([]));
    };

    const handlePrint = () => {
        setIsPrintMode(true);
        setTimeout(() => {
            window.print();
            setIsPrintMode(false);
        }, 300);
    };

    if (!students || students.length === 0) {
        return (
            <div className="ro-empty">
                <div className="ro-empty-icon">👥</div>
                <p>등록된 학생 명단이 없습니다.</p>
                <p className="ro-empty-sub">학생 관리 메뉴에서 학생 명단을 먼저 등록해 주세요.</p>
            </div>
        );
    }

    return (
        <div className={`ro-page-container ${isPrintMode ? 'printing-active' : ''}`}>
            {/* Shuffling Roulette Animation Overlay */}
            {isAnimating && (
                <div className="ro-anim-overlay">
                    <div className="ro-anim-card">
                        <div className="ro-anim-icon">🎲</div>
                        <div className="ro-anim-title">공정하게 추첨하고 있습니다!</div>
                        <div className="ro-anim-name-box">
                            <span className="ro-anim-name">{animatingName}</span>
                        </div>
                        <div className="ro-anim-bar"><div className="ro-anim-progress"></div></div>
                    </div>
                </div>
            )}

            {/* 상단 타이틀 바 및 메인 모드 탭 */}
            <div className="top-header-bar random-top-header">
                <div className="top-header-left">
                    <span className="top-header-emoji">🎲</span>
                    <h1 className="top-header-title">랜덤 순서 & 발표자 뽑기</h1>
                    <span className="top-header-badge">총 {sortedStudents.length}명 대기</span>
                </div>
                
                {/* 2단 메인 모드 선택 탭 */}
                <div className="ro-main-mode-tabs">
                    <button 
                        className={`ro-tab-btn ${mainMode === 'order' ? 'active' : ''}`}
                        onClick={() => setMainMode('order')}
                    >
                        🎲 랜덤 순서 정하기
                    </button>
                    <button 
                        className={`ro-tab-btn ${mainMode === 'picker' ? 'active' : ''}`}
                        onClick={() => setMainMode('picker')}
                    >
                        🎯 랜덤 뽑기
                    </button>
                </div>
            </div>

            <div className="ro-main-layout">
                {/* Mode A일 때만 저장된 순서 기록 보관함 사이드바 표시 */}
                {mainMode === 'order' && (
                    <aside className="ro-sidebar-panel">
                        <div className="ro-section ro-history-section">
                            <div className="ro-section-header" onClick={() => setShowHistory(v => !v)}>
                                <h2 className="ro-section-title">
                                    📋 저장된 순서 기록
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
                                            <div 
                                                key={record.id} 
                                                className="ro-history-item"
                                                onClick={() => {
                                                    setActiveOrderRecord(record);
                                                    setOrderTitleInput(record.title);
                                                    setShowOrderModal(true);
                                                }}
                                            >
                                                <div className="ro-history-item-header">
                                                    <div className="ro-history-item-info">
                                                        <span className="ro-history-title-text">📋 {record.title}</span>
                                                        <span className="ro-history-date">{record.date}</span>
                                                    </div>
                                                    <div className="ro-history-actions">
                                                        <span className="ro-history-count">{record.list.length}명</span>
                                                        <button 
                                                            className="ro-delete-btn" 
                                                            onClick={(e) => handleDeleteHistoryItem(record.id, e)} 
                                                            title="삭제"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </aside>
                )}

                {/* 우측 메인 콘텐츠 패널 */}
                <main className={`ro-content-panel ${mainMode === 'picker' ? 'full-width-panel' : ''}`}>
                    {/* Mode A: 랜덤 순서 정하기 */}
                    {mainMode === 'order' && (
                        <div className="ro-section">
                            <div className="ro-section-header-static">
                                <div className="section-title-wrap">
                                    <h2 className="ro-section-title">🎲 전체 학생 순서 정하기</h2>
                                    <span className="ro-badge-neutral">{selected.size}/{sortedStudents.length}명 선택됨</span>
                                </div>
                                <div className="section-header-actions">
                                    <button 
                                        className={`ro-select-all-btn ${allSelected ? 'active' : someSelected ? 'partial' : ''}`}
                                        onClick={toggleSelectAll}
                                    >
                                        {allSelected ? '전체 해제' : '전체 선택'}
                                    </button>
                                    <button 
                                        className="green-gradient-main-btn"
                                        onClick={handleGenerateOrder}
                                        disabled={selected.size === 0 || isAnimating}
                                    >
                                        🎲 순서 생성하기
                                    </button>
                                </div>
                            </div>

                            {/* 학생 선택 카드 그리드 */}
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
                        </div>
                    )}

                    {/* Mode B: 범용 랜덤 뽑기 (당첨자 연출) */}
                    {mainMode === 'picker' && (
                        <div className="ro-section">
                            <div className="ro-section-header-static picker-header">
                                <div className="section-title-wrap">
                                    <h2 className="ro-section-title">🎯 추첨 인원 선택</h2>
                                    <div className="picker-count-selector">
                                        {[1, 2, 3, 4, 5].map(n => (
                                            <button 
                                                key={n}
                                                className={`count-pill-btn ${pickCount === n ? 'active' : ''}`}
                                                onClick={() => setPickCount(n)}
                                            >
                                                {n}명
                                            </button>
                                        ))}
                                        <div className="custom-count-input-wrap">
                                            <input 
                                                type="number" 
                                                min="1" 
                                                max={sortedStudents.length} 
                                                value={pickCount} 
                                                onChange={(e) => setPickCount(Math.max(1, Math.min(sortedStudents.length, Number(e.target.value) || 1)))} 
                                            />
                                            <span>명</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="section-header-actions">
                                    <button 
                                        className={`ro-select-all-btn ${allSelected ? 'active' : someSelected ? 'partial' : ''}`}
                                        onClick={toggleSelectAll}
                                    >
                                        {allSelected ? '전체 해제' : '전체 선택'}
                                    </button>
                                    <button 
                                        className="green-gradient-main-btn picker-action-btn"
                                        onClick={handlePickWinners}
                                        disabled={selected.size === 0 || isAnimating}
                                    >
                                        🎯 {pickCount}명 뽑기
                                    </button>
                                </div>
                            </div>

                            {/* 학생 선택 카드 그리드 */}
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
                        </div>
                    )}
                </main>
            </div>

            {/* Mode A: 랜덤 순서 한눈에 전체 보기 대형 모달 (전체화면 모드 지원) */}
            {showOrderModal && activeOrderRecord && (
                <div className={`ro-modal-overlay ${isOrderFullscreen ? 'fullscreen-overlay' : ''}`} onClick={(e) => { if (e.target === e.currentTarget && !isOrderFullscreen) setShowOrderModal(false); }}>
                    <div className={`ro-modal-container order-large-modal ${isOrderFullscreen ? 'is-fullscreen-view' : ''}`}>
                        <div className="ro-modal-header">
                            <div className="modal-header-title">
                                <h3>📋 전체 학생 랜덤 순서</h3>
                                <span className="modal-sub-badge">총 {activeOrderRecord.list.length}명 전체 한눈에 보기</span>
                            </div>
                            <div className="modal-header-right-actions">
                                <button className="base-btn fullscreen-toggle-btn" onClick={() => setIsOrderFullscreen(v => !v)}>
                                    {isOrderFullscreen ? '🗗 창 크기로 복원' : '📺 전체화면 모드'}
                                </button>
                                <button className="modal-close-x" onClick={() => { setShowOrderModal(false); setIsOrderFullscreen(false); }}>✕</button>
                            </div>
                        </div>

                        {/* 기록 타이틀 설정 */}
                        <div className="modal-title-input-row">
                            <span className="input-label">📌 기록 타이틀</span>
                            <input 
                                type="text" 
                                className="record-title-input" 
                                value={orderTitleInput} 
                                onChange={(e) => setOrderTitleInput(e.target.value)} 
                                placeholder="예: 2025.03 1학기 청소/발표 순서" 
                            />
                        </div>

                        {/* 한눈에 보는 카드 그리드 (학번 없음, 소프트 그린 순서 뱃지, 이름 강조) */}
                        <div className="modal-result-body order-dense-body">
                            <div className="order-dense-grid">
                                {activeOrderRecord.list.map((student, idx) => (
                                    <div key={student.id} className="order-rank-card">
                                        <div className="rank-number-badge">{idx + 1}</div>
                                        <span className="rank-student-name">{student.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="ro-modal-footer">
                            <div className="footer-left">
                                <button className="base-btn print-btn" onClick={handlePrint}>
                                    🖨️ 게시판 출력 (PDF)
                                </button>
                            </div>
                            <div className="footer-right">
                                <button className="base-btn cancel-btn" onClick={() => { setShowOrderModal(false); setIsOrderFullscreen(false); }}>닫기</button>
                                <button className="green-gradient-main-btn" onClick={handleSaveOrderRecord}>💾 기록 저장</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mode B: 범용 당첨 대형 축하 모달 ("짜잔~ 당첨자를 소개합니다!") */}
            {showPickerModal && pickerWinners.length > 0 && (
                <div className="ro-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPickerModal(false); }}>
                    <div className="ro-modal-container celebration-picker-modal">
                        <div className="celebration-header">
                            <div className="celebration-icon">🎉</div>
                            <h2>짜잔~! 당첨자를 소개합니다!</h2>
                            <p className="celebration-sub">공정한 추첨을 통해 당첨되었습니다</p>
                        </div>

                        <div className="celebration-body">
                            <div className="winner-chips-grid">
                                {pickerWinners.map((winner, idx) => (
                                    <div key={winner.id} className={`winner-gold-card ${winner.gender === '남' ? 'male-winner' : 'female-winner'}`}>
                                        <div className="winner-star-badge">🌟 당첨자 {idx + 1}</div>
                                        <div className="winner-giant-name">{winner.name}</div>
                                        <div className="winner-sub-info">{winner.attendanceNumber}번 학생</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="celebration-footer">
                            <button className="green-gradient-main-btn celebration-confirm-btn" onClick={() => setShowPickerModal(false)}>
                                ✨ 확인 및 닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 인쇄 전용 A4 게시판 레이아웃 */}
            {isPrintMode && activeOrderRecord && (
                <div className="print-board-container">
                    <div className="print-board-header">
                        <h1>📋 {orderTitleInput || activeOrderRecord.title}</h1>
                        <p className="print-board-sub">
                            학급명: {currentClass?.name || '우리 반'} | 출력일: {new Date().toLocaleDateString('ko-KR')} | 총 {activeOrderRecord.list.length}명
                        </p>
                    </div>
                    <div className="print-board-grid">
                        {activeOrderRecord.list.map((student, idx) => (
                            <div key={student.id} className="print-rank-card">
                                <span className="print-seq-tag">{idx + 1}번</span>
                                <span className="print-name">{student.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RandomOrder;
