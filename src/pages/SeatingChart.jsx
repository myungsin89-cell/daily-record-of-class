import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { getData, saveData, STORES } from '../db/indexedDB';
import { generateEmptyGrid, assignSeatsRandomly } from '../utils/seatingUtils';
import './SeatingChart.css';

const SeatingChart = () => {
    const { students } = useStudentContext();
    const { currentClass } = useClass();
    const containerRef = useRef(null);
    
    const [mode, setMode] = useState('teacher'); // 'teacher' or 'student'
    const [gridConfig, setGridConfig] = useState({ rows: 5, cols: 6, pairSize: 2 });
    const [grid, setGrid] = useState([]);
    const [constraints, setConstraints] = useState({
        fixedSeats: {}, // { studentId: { r, c } }
        frontPreference: [], // [studentId, ...]
        avoidances: [], // [{ id, studentIds: [...] }, ...]
        pairs: [] // [{ id, studentIds: [...] }, ...]
    });
    
    // Constraint Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState(null); // 'avoidance' or 'pairing'
    const [selectedInModal, setSelectedInModal] = useState([]);

    // Student Reveal State
    const [revealStrategy, setRevealStrategy] = useState('one-by-one'); // 'all', 'one-by-one', 'male-first', 'female-first'
    const [revealedCount, setRevealedCount] = useState(0);
    const [isRevealing, setIsRevealing] = useState(false);
    const [revealOrder, setRevealOrder] = useState([]);
    const [printMode, setPrintMode] = useState(null); // 'standard' | 'teacher'

    // New state for female seats
    const [useFemaleSeats, setUseFemaleSeats] = useState(true);
    
    // Drag and Drop State
    const [draggedStudent, setDraggedStudent] = useState(null);
    const [dragSource, setDragSource] = useState(null); // 'pool' or 'grid'
    const [dragCoords, setDragCoords] = useState(null); // {r, c}
    const [dropTarget, setDropTarget] = useState(null); // {r, c}
    
    // YouTube Music State
    const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=FcsS6c-mY0A'); // Default cinematic music
    const [isMusicEnabled, setIsMusicEnabled] = useState(true);
    const [showMusicSettings, setShowMusicSettings] = useState(false);
    const ytPlayerRef = useRef(null);

    // Calculate unassigned students
    const unassignedStudents = students?.filter(s => 
        !grid.some(row => row.some(seat => seat.studentId === s.id))
    ) || [];

    // Constraint Migration Helper
    const migrateConstraints = (rawConstraints) => {
        const migrateList = (list) => {
            if (!list || !Array.isArray(list)) return [];
            return list.map((item, idx) => {
                // If it's the old format { s1, s2 }
                if (item && item.s1 && item.s2 && !item.studentIds) {
                    return {
                        id: `migrated-${Date.now()}-${idx}`,
                        studentIds: [item.s1, item.s2]
                    };
                }
                return item;
            }).filter(item => item && item.studentIds);
        };

        return {
            fixedSeats: rawConstraints?.fixedSeats || {},
            frontPreference: rawConstraints?.frontPreference || [],
            avoidances: migrateList(rawConstraints?.avoidances),
            pairs: migrateList(rawConstraints?.pairs)
        };
    };

    // Initialize Grid and Load Saved Config
    useEffect(() => {
        const loadConfig = async () => {
            if (!currentClass?.id) return;
            
            try {
                const saved = await getData(STORES.SEATING_CONFIGS, currentClass.id);
                if (saved) {
                    setGridConfig(saved.gridConfig || { rows: 5, cols: 6, pairSize: 2 });
                    setConstraints(migrateConstraints(saved.constraints));
                    // Load useFemaleSeats from saved constraints, default to true if not found
                    setUseFemaleSeats(saved.useFemaleSeats !== undefined ? saved.useFemaleSeats : true);
                    setGrid(saved.grid || generateEmptyGrid(5, 6, 2));
                    if (saved.youtubeUrl) setYoutubeUrl(saved.youtubeUrl);
                } else {
                    setGrid(generateEmptyGrid(5, 6, 2));
                }
            } catch (e) {
                console.error("Failed to load seating config:", e);
                setGrid(generateEmptyGrid(5, 6, 2)); // Fallback to empty grid
            }
        };
        loadConfig();
    }, [currentClass]);

    // Handle Body Class for Student Mode (Hiding Sidebar/Header)
    useEffect(() => {
        if (mode === 'student') {
            document.body.classList.add('student-mode-active');
        } else {
            document.body.classList.remove('student-mode-active');
        }
        return () => document.body.classList.remove('student-mode-active');
    }, [mode]);

    const handleSave = async () => {
        if (!currentClass?.id) return;
        await saveData(STORES.SEATING_CONFIGS, {
            classId: currentClass.id,
            gridConfig,
            constraints,
            useFemaleSeats, // Save the useFemaleSeats state
            youtubeUrl,    // Save YouTube URL
            grid,
            updatedAt: new Date().toISOString()
        });
        alert('자리 배치가 저장되었습니다.');
    };

    // YouTube IFrame API Integration
    useEffect(() => {
        // Load YouTube API script
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
            console.log("YouTube API Ready");
        };

        return () => {
            if (ytPlayerRef.current) {
                ytPlayerRef.current.destroy();
                ytPlayerRef.current = null;
            }
        };
    }, []);

    const extractVideoId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const initYoutubePlayer = () => {
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) return;

        if (ytPlayerRef.current) {
            ytPlayerRef.current.loadVideoById(videoId);
            return;
        }

        ytPlayerRef.current = new window.YT.Player('yt-player-placeholder', {
            height: '0',
            width: '0',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0
            },
            events: {
                'onReady': (event) => {
                    event.target.setVolume(50);
                }
            }
        });
    };

    const handleRandomize = () => {
        if (!students || students.length === 0) {
            alert('학생 정보가 없습니다.');
            return;
        }
        const newGrid = assignSeatsRandomly(students, grid, constraints, useFemaleSeats);
        setGrid(newGrid);
    };

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        const numValue = parseInt(value, 10);
        const newConfig = { ...gridConfig, [name]: numValue };
        setGridConfig(newConfig);
        setGrid(generateEmptyGrid(newConfig.rows, newConfig.cols, newConfig.pairSize));
    };

    // Drag and Drop Logic
    const onDragStartPool = (e, student) => {
        setDragSource('pool');
        setDraggedStudent(student);
        e.dataTransfer.setData('studentId', student.id);
    };

    const onDragStartGrid = (e, r, c, student) => {
        setDragSource('grid');
        setDragCoords({ r, c });
        setDraggedStudent(student);
        e.dataTransfer.setData('studentId', student.id);
    };

    const onDragOver = (e, r, c) => {
        e.preventDefault();
        setDropTarget({ r, c });
    };

    const onDrop = (e, r, c) => {
        e.preventDefault();
        setDropTarget(null);
        if (!draggedStudent) return;

        const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
        const sourceId = draggedStudent.id;
        const targetSeat = newGrid[r][c];

        // Gender & Blocked Check
        if (targetSeat.genderPreference === 'blocked') {
            alert('이 좌석은 사용할 수 없는 자리입니다.');
            setDropTarget(null);
            return;
        }

        if (useFemaleSeats && targetSeat.genderPreference && draggedStudent.gender !== targetSeat.genderPreference) {
            if (!window.confirm(`이 자리는 ${targetSeat.genderPreference}학생 전용석입니다. 그대로 배치할까요?`)) {
                setDropTarget(null);
                return;
            }
        }

        if (!validation.isValid && dragSource === 'pool') {
            if (!window.confirm('현재 좌석 설정이 학생 수 또는 성별 비율과 맞지 않습니다. 그래도 배치할까요?')) {
                setDropTarget(null);
                return;
            }
        }

        if (dragSource === 'pool') {
            newGrid[r][c].studentId = sourceId;
        } else {
            const temp = targetSeat.studentId;
            newGrid[dragCoords.r][dragCoords.c].studentId = temp;
            newGrid[r][c].studentId = sourceId;
        }

        setGrid(newGrid);
        setDraggedStudent(null);
        setDragSource(null);
        setDragCoords(null);
    };

    const removeFromSeat = (r, c) => {
        const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
        newGrid[r][c].studentId = null;
        setGrid(newGrid);
    };

    const resetGrid = () => {
        if (!window.confirm('모든 자리 배치를 초기화하시겠습니까?')) return;
        setGrid(generateEmptyGrid(gridConfig.rows, gridConfig.cols, gridConfig.pairSize));
    };

    const toggleSeatGender = (r, c) => {
        if (mode !== 'teacher' || grid[r][c].studentId) return;
        const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
        const current = newGrid[r][c].genderPreference;
        
        // Cycle: null -> '여' (if enabled) -> 'blocked' -> null
        let next;
        if (current === null) {
            next = useFemaleSeats ? '여' : 'blocked';
        } else if (current === '여') {
            next = 'blocked';
        } else {
            next = null;
        }

        newGrid[r][c].genderPreference = next;
        setGrid(newGrid);
    };

    // Validation Logic
    const validateAssignment = () => {
        if (!students) return { isValid: false, errors: [], counts: { totalStudents: 0, totalAvailable: 0, femaleOnlySeats: 0, neutralSeats: 0, totalMale: 0, totalFemale: 0 } };

        const totalMale = students.filter(s => s.gender === '남').length;
        const totalFemale = students.filter(s => s.gender === '여').length;
        const totalStudents = students.length;

        const flattenedGrid = grid.flat();
        const blockedSeats = flattenedGrid.filter(s => s.genderPreference === 'blocked').length;
        const femaleOnlySeats = flattenedGrid.filter(s => s.genderPreference === '여').length;
        const neutralSeats = flattenedGrid.filter(s => s.genderPreference === null).length;
        const totalAvailable = femaleOnlySeats + neutralSeats;

        const errors = [];
        if (totalAvailable < totalStudents) {
            errors.push(`전체 좌석(${totalAvailable})이 학생 수(${totalStudents})보다 부족합니다. (${totalStudents - totalAvailable}석 부족)`);
        } else if (totalAvailable > totalStudents) {
            errors.push(`전체 좌석(${totalAvailable})이 학생 수(${totalStudents})보다 많습니다. (${totalAvailable - totalStudents}석 남음) 남는 자리를 '사용 불가'로 설정해주세요.`);
        }

        if (useFemaleSeats && femaleOnlySeats !== totalFemale) {
            errors.push(`여학생 전용석(${femaleOnlySeats})이 여학생 수(${totalFemale})와 일치해야 합니다.`);
        }
        if (useFemaleSeats && neutralSeats < totalMale) {
            errors.push(`일반석(${neutralSeats})이 남학생 수(${totalMale})보다 부족합니다.`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            counts: { totalStudents, totalAvailable, femaleOnlySeats, neutralSeats, totalMale, totalFemale }
        };
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                alert(`전체화면 전환 실패: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const validation = validateAssignment();

    // Reveal Logic
    const startReveal = () => {
        setIsRevealing(true);
        setRevealedCount(0);
        
        const filledSeats = [];
        grid.forEach((row, r) => {
            row.forEach((seat, c) => {
                if (seat.studentId) {
                    const student = students?.find(s => s.id === seat.studentId);
                    filledSeats.push({ r, c, gender: student?.gender });
                }
            });
        });

        if (revealStrategy === 'all') {
            setRevealOrder(filledSeats);
            setRevealedCount(filledSeats.length);
            setIsRevealing(false);
            return;
        }

        let ordered = [];
        if (revealStrategy === 'one-by-one') {
            ordered = [...filledSeats].sort(() => Math.random() - 0.5);
        } else if (revealStrategy === 'male-first') {
            const males = filledSeats.filter(s => s.gender === '남').sort(() => Math.random() - 0.5);
            const females = filledSeats.filter(s => s.gender === '여').sort(() => Math.random() - 0.5);
            ordered = [...males, ...females];
        } else if (revealStrategy === 'female-first') {
            const females = filledSeats.filter(s => s.gender === '여').sort(() => Math.random() - 0.5);
            const males = filledSeats.filter(s => s.gender === '남').sort(() => Math.random() - 0.5);
            ordered = [...females, ...males];
        }
        
        setRevealOrder(ordered);

        // YouTube Music Play
        if (isMusicEnabled) {
            initYoutubePlayer();
            setTimeout(() => {
                if (ytPlayerRef.current && ytPlayerRef.current.playVideo) {
                    ytPlayerRef.current.playVideo();
                }
            }, 500);
        }
    };

    useEffect(() => {
        let timer;
        if (isRevealing && revealedCount < revealOrder.length) {
            timer = setTimeout(() => setRevealedCount(prev => prev + 1), 800);
        } else if (revealedCount === revealOrder.length && revealOrder.length > 0) {
            setIsRevealing(false);
            // YouTube Stop
            if (ytPlayerRef.current && ytPlayerRef.current.stopVideo) {
                ytPlayerRef.current.stopVideo();
            }
        }
        return () => clearTimeout(timer);
    }, [isRevealing, revealedCount, revealOrder]);

    const isRevealed = (r, c) => {
        if (mode === 'teacher') return true;
        const index = revealOrder.findIndex(pos => pos.r === r && pos.c === c);
        return index !== -1 && index < revealedCount;
    };

    // Constraints
    const toggleFrontPreference = (studentId) => {
        setConstraints(prev => ({
            ...prev,
            frontPreference: prev.frontPreference.includes(studentId)
                ? prev.frontPreference.filter(id => id !== studentId)
                : [...prev.frontPreference, studentId]
        }));
    };

    // Modal Handlers
    const openConstraintModal = (target) => {
        setModalTarget(target);
        setSelectedInModal([]);
        setIsModalOpen(true);
    };

    const handleModalConfirm = () => {
        if (selectedInModal.length < 2) {
            alert("최소 2명 이상의 학생을 선택해야 합니다.");
            return;
        }

        const newGroup = {
            id: Date.now().toString(),
            studentIds: selectedInModal
        };

        if (modalTarget === 'avoidance') {
            setConstraints(prev => ({
                ...prev,
                avoidances: [...prev.avoidances, newGroup]
            }));
        } else {
            setConstraints(prev => ({
                ...prev,
                pairs: [...prev.pairs, newGroup]
            }));
        }

        setIsModalOpen(false);
    };

    const toggleStudentInModal = (id) => {
        setSelectedInModal(prev => 
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const removeAvoidance = (id) => {
        setConstraints(prev => ({
            ...prev,
            avoidances: prev.avoidances.filter(g => g.id !== id)
        }));
    };

    const removePairing = (id) => {
        setConstraints(prev => ({
            ...prev,
            pairs: prev.pairs.filter(g => g.id !== id)
        }));
    };

    const handlePrint = (view) => {
        setPrintMode(view);
        // Short delay to ensure state reaches rendering before print dialog
        setTimeout(() => {
            window.print();
            setPrintMode(null);
        }, 300);
    };

    return (
        <div ref={containerRef} className={`seating-chart-container ${printMode ? `printing print-${printMode}` : ''} ${mode === 'student' ? 'student-view-container' : ''}`}>
            {mode === 'teacher' && (
                <header className="seating-header">
                    <h1><span>🪑</span> 자리 배치</h1>
                    <div className="mode-toggle">
                        <button className={`mode-btn ${mode === 'teacher' ? 'active' : ''}`} onClick={() => setMode('teacher')}>선생님 설정</button>
                        <button className={`mode-btn ${mode === 'student' ? 'active' : ''}`} onClick={() => setMode('student')}>학생 공개용</button>
                    </div>
                </header>
            )}

            {mode === 'student' && (
                <button className="stealth-back-btn" onClick={() => {
                    setMode('teacher');
                    setIsRevealing(false);
                    setRevealedCount(0);
                }} title="설정으로 돌아가기">←</button>
            )}

            {mode === 'teacher' && (
                <div className="setup-bar">
                    {/* ...existing setup-bar content... */}
                    <div className="setup-group config-section">
                        <div className="setup-item">
                            <span className="setup-label">레이아웃</span>
                            <div className="input-row">
                                <input name="rows" type="number" value={gridConfig.rows} onChange={handleConfigChange} min="1" max="10" />
                                <span className="x">×</span>
                                <input name="cols" type="number" value={gridConfig.cols} onChange={handleConfigChange} min="1" max="20" />
                            </div>
                        </div>
                        <div className="setup-item">
                            <span className="setup-label">단위</span>
                            <select name="pairSize" value={gridConfig.pairSize} onChange={handleConfigChange}>
                                <option value={1}>1명</option>
                                <option value={2}>2명</option>
                                <option value={4}>4명</option>
                            </select>
                        </div>
                    </div>

                    <div className={`setup-group status-section ${validation.isValid ? 'valid' : 'invalid'}`}>
                        <div className="status-info">
                            <span className="status-text">
                                {unassignedStudents.length === 0 && validation.isValid ? '✨ 배정완료' : validation.isValid ? '✅ 정합성OK' : '⚠️ 배치오류'}
                            </span>
                            <div className="mini-badges">
                                <span className="m-badge">인원 {validation.counts.totalAvailable}/{validation.counts.totalStudents}</span>
                                <span className="m-badge">남 {validation.counts.neutralSeats}/{validation.counts.totalMale}</span>
                                <span className="m-badge">여 {validation.counts.femaleOnlySeats}/{validation.counts.totalFemale}</span>
                            </div>
                        </div>
                        <label className="gender-toggle-mini">
                            <input type="checkbox" checked={useFemaleSeats} onChange={(e) => setUseFemaleSeats(e.target.checked)} />
                            <span className="g-slider"></span>
                            <span className="g-text">남여구분</span>
                        </label>
                    </div>

                    <div className="setup-group actions-section">
                        <div className="btn-group main">
                            <button className="base-btn reset" onClick={resetGrid}>초기화</button>
                            <button className="base-btn randomize" onClick={handleRandomize} disabled={!validation.isValid}>자동 랜덤 배치</button>
                            <button className="base-btn save" onClick={handleSave}>저장</button>
                        </div>
                        <div className="btn-group print">
                            <button className="base-btn print-st" onClick={() => handlePrint('standard')}>학생용 인쇄</button>
                            <button className="base-btn print-tc" onClick={() => handlePrint('teacher')}>교사용 인쇄</button>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'student' && (
                <div className="disclosure-controls">
                    <div className="disclosure-header">
                        <div className="strategy-selector">
                            <button className={revealStrategy === 'one-by-one' ? 'active' : ''} onClick={() => setRevealStrategy('one-by-one')}>하나씩</button>
                            <button className={revealStrategy === 'all' ? 'active' : ''} onClick={() => setRevealStrategy('all')}>한번에</button>
                            <button className={revealStrategy === 'male-first' ? 'active' : ''} onClick={() => setRevealStrategy('male-first')}>남학생 먼저</button>
                            <button className={revealStrategy === 'female-first' ? 'active' : ''} onClick={() => setRevealStrategy('female-first')}>여학생 먼저</button>
                        </div>
                        <button className="base-btn fullscreen-btn" onClick={toggleFullscreen} title="전체화면">전체화면 📺</button>
                    </div>
                    <div className="reveal-main-action">
                        <button className="btn-reveal-start" onClick={startReveal} disabled={isRevealing || (revealedCount > 0 && revealedCount === revealOrder.length)}>
                            {revealedCount > 0 ? (revealedCount === revealOrder.length ? '전체 공개 완료' : '전체 공개 중...') : '자리 공개 시작!'}
                        </button>
                        <button 
                            className={`music-toggle-btn ${isMusicEnabled ? 'active' : ''}`} 
                            onClick={() => setIsMusicEnabled(!isMusicEnabled)}
                            title={isMusicEnabled ? "배경음악 끄기" : "배경음악 켜기"}
                        >
                            {isMusicEnabled ? '📺 ON' : '🔇 OFF'}
                        </button>
                        <button 
                            className="base-btn btn-music-setup" 
                            onClick={() => setShowMusicSettings(true)}
                        >
                            🎵 음악넣기
                        </button>
                    </div>

                    <div id="yt-player-placeholder" style={{ display: 'none' }}></div>

                    {showMusicSettings && (
                        <div 
                            className="music-help-overlay" 
                            onClick={(e) => {
                                if (e.target === e.currentTarget) setShowMusicSettings(false);
                            }}
                        >
                            <div className="music-help-modal">
                                <h3>📺 유튜브 배경 음악 설정</h3>
                                <p>자리 공개 시 재생할 유튜브 영상 주소를 입력해주세요.</p>
                                <div className="yt-input-group">
                                    <div className="yt-input-wrapper">
                                        <input 
                                            type="text" 
                                            placeholder="https://www.youtube.com/watch?v=..." 
                                            value={youtubeUrl}
                                            onChange={(e) => setYoutubeUrl(e.target.value)}
                                            autoFocus
                                        />
                                        {youtubeUrl && (
                                            <button className="yt-clear-btn" onClick={() => setYoutubeUrl('')} title="주소 지우기">×</button>
                                        )}
                                    </div>
                                    <p className="yt-hint">※ 주소를 넣고 창을 닫으면 자동 저장됩니다.</p>
                                </div>
                                <button className="m-btn confirm" onClick={() => setShowMusicSettings(false)}>설정 완료</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <main className={`seating-main-workspace ${mode === 'student' ? 'student-view' : ''}`}>
                <section className="classroom-area">
                    <div className="blackboard-indicator"></div>
                    <div className="grid-container">
                        {grid.map((row, r) => (
                            <div key={r} className="grid-row">
                                {row.map((seat, c) => {
                                    const student = students?.find(s => s.id === seat.studentId);
                                    const revealed = isRevealed(r, c);
                                    const isGap = ((c + 1) % gridConfig.pairSize === 0 && (c + 1) < gridConfig.cols);
                                    const isTarget = dropTarget?.r === r && dropTarget?.c === c;
                                    
                                    let statusClass = '';
                                    if (seat.genderPreference === '여') statusClass = 'gender-female';
                                    else if (seat.genderPreference === 'blocked') statusClass = 'blocked';

                                    return (
                                        <div 
                                            key={`${r}-${c}`}
                                            className={`seat-slot ${isGap ? 'gap' : ''} ${isTarget ? 'drop-target' : ''} ${statusClass} ${student ? 'occupied' : ''}`}
                                            onDragOver={(e) => mode === 'teacher' && onDragOver(e, r, c)}
                                            onDrop={(e) => mode === 'teacher' && onDrop(e, r, c)}
                                            onDragLeave={() => setDropTarget(null)}
                                            onClick={() => toggleSeatGender(r, c)}
                                            title={mode === 'teacher' && !student ? '클릭: 일반 > 여학생전용 > 사용불가' : ''}
                                        >
                                            {student && revealed ? (
                                                <div 
                                                    className={`student-card ${mode === 'student' ? 'revealed' : ''}`}
                                                    draggable={mode === 'teacher'}
                                                    onDragStart={(e) => onDragStartGrid(e, r, c, student)}
                                                >
                                                    {mode === 'teacher' && (
                                                        <button className="remove-seat-btn" onClick={(e) => { e.stopPropagation(); removeFromSeat(r, c); }}>×</button>
                                                    )}
                                                    <span className={`student-no ${student.gender === '남' ? 'male' : 'female'}`}>{student.attendanceNumber}번</span>
                                                    <span className="student-name">{student.name}</span>
                                                </div>
                                            ) : (mode === 'student' && student && !revealed) ? (
                                                <div className="student-card reveal-hidden"></div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </section>

                {mode === 'teacher' && (
                    <aside className="student-pool-panel">
                        <div className="pool-header">
                            <h3>미배정 학생 ({unassignedStudents.length})</h3>
                        </div>
                        <div className="pool-list">
                            {unassignedStudents.map(student => (
                                <div key={student.id} className="student-card" draggable onDragStart={(e) => onDragStartPool(e, student)}>
                                    <span className={`student-no ${student.gender === '남' ? 'male' : 'female'}`}>{student.attendanceNumber}번</span>
                                    <span className="student-name">{student.name}</span>
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            </main>

            {mode === 'teacher' && (
                <div className="constraints-panel">
                    <div className="constraints-header">
                        <h2>⚙️ 배치 제약 조건 설정</h2>
                        <p>자동 랜덤 배치 시 고려할 핵심 규칙을 설정하세요.</p>
                    </div>
                    
                    <div className="constraints-grid">
                        {/* 1. Front Preference */}
                        <div className="constraint-card front-card">
                            <div className="card-title">
                                <span className="icon">📍</span>
                                <h3>앞자리 선호 학생</h3>
                            </div>
                            <div className="preference-list">
                                {students?.map(s => (
                                    <button 
                                        key={s.id}
                                        className={`preference-btn ${constraints.frontPreference.includes(s.id) ? 'active' : ''}`}
                                        onClick={() => toggleFrontPreference(s.id)}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Pair Avoidance */}
                        <div className="constraint-card avoidance-card">
                            <div className="card-title">
                                <span className="icon">🚫</span>
                                <h3>짝꿍 금지 설정</h3>
                                <button className="mini-add-btn" onClick={() => openConstraintModal('avoidance')}>+ 추가</button>
                            </div>
                            <div className="constraint-active-list">
                                {constraints.avoidances.map((group) => (
                                    <div key={group.id} className="active-item avoidance">
                                        <span className="pair-names">
                                            {group.studentIds.map(id => students?.find(s => s.id === id)?.name).join(' ↔ ')}
                                        </span>
                                        <button className="del-btn" onClick={() => removeAvoidance(group.id)}>×</button>
                                    </div>
                                ))}
                                {constraints.avoidances.length === 0 && <p className="empty-msg">추가된 금지 그룹이 없습니다.</p>}
                            </div>
                        </div>

                        {/* 3. Mandatory Pairs */}
                        <div className="constraint-card pairing-card">
                            <div className="card-title">
                                <span className="icon">🤝</span>
                                <h3>필수 짝꿍 설정</h3>
                                <button className="mini-add-btn" onClick={() => openConstraintModal('pairing')}>+ 추가</button>
                            </div>
                            <div className="constraint-active-list">
                                {constraints.pairs.map((group) => (
                                    <div key={group.id} className="active-item pairing">
                                        <span className="pair-names">
                                            {group.studentIds.map(id => students?.find(s => s.id === id)?.name).join(' + ')}
                                        </span>
                                        <button className="del-btn" onClick={() => removePairing(group.id)}>×</button>
                                    </div>
                                ))}
                                {constraints.pairs.length === 0 && <p className="empty-msg">추가된 필수 그룹이 없습니다.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Student Select Modal */}
            {isModalOpen && (
                <div className="chart-modal-overlay">
                    <div className="chart-modal">
                        <div className="modal-header">
                            <h2>{modalTarget === 'avoidance' ? '짝꿍 금지 그룹 선택' : '필수 짝꿍 그룹 선택'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-desc">함께 앉을 수 없거나(금지), 꼭 여럿이 붙어 앉아야 하는(필수) 학생들을 선택하세요.</p>
                            <div className="modal-student-grid">
                                {students?.map(s => (
                                    <div 
                                        key={s.id} 
                                        className={`modal-student-item ${selectedInModal.includes(s.id) ? 'selected' : ''}`}
                                        onClick={() => toggleStudentInModal(s.id)}
                                    >
                                        <span className={`m-no ${s.gender === '남' ? 'male' : 'female'}`}>{s.attendanceNumber}</span>
                                        <span className="m-name">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <span className="selected-count">선택됨: <strong>{selectedInModal.length}</strong>명</span>
                            <div className="modal-btns">
                                <button className="m-btn cancel" onClick={() => setIsModalOpen(false)}>취소</button>
                                <button className="m-btn confirm" onClick={handleModalConfirm}>적용하기</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeatingChart;
