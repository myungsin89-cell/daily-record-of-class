import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { useModal } from '../context/ModalContext';
import { getData, saveData, deleteData, getAllDataByIndex, STORES } from '../db/indexedDB';
import { generateEmptyGrid, assignSeatsRandomly } from '../utils/seatingUtils';
import SeatingPrintModal from '../components/SeatingPrintModal';
import './SeatingChart.css';

const SeatingChart = () => {
    const { students } = useStudentContext();
    const { currentClass } = useClass();
    const { showConfirm, showAlert } = useModal();
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
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [isFlipped, setIsFlipped] = useState(true); // false: student view (blackboard top), true: teacher view (blackboard bottom)

    // Seating History State
    const [seatingHistory, setSeatingHistory] = useState([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveNameInput, setSaveNameInput] = useState('');
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [previewRecord, setPreviewRecord] = useState(null);
    const [hasChanges, setHasChanges] = useState(false); // 자리 변동 감지 state

    // New state for female seats
    const [useFemaleSeats, setUseFemaleSeats] = useState(true);
    const [showInitialSetupModal, setShowInitialSetupModal] = useState(false);
    
    // Drag and Drop State
    const [draggedStudent, setDraggedStudent] = useState(null);
    const [dragSource, setDragSource] = useState(null); // 'pool' or 'grid'
    const [dragCoords, setDragCoords] = useState(null); // {r, c}
    const [dropTarget, setDropTarget] = useState(null); // {r, c}
    
    // YouTube Music State
    const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=RqnLUQAt2K4'); // Default music link
    const [isMusicEnabled, setIsMusicEnabled] = useState(true);
    const [showMusicSettings, setShowMusicSettings] = useState(false);
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const [isApiLoaded, setIsApiLoaded] = useState(window.YT && window.YT.Player ? true : false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isShuffling, setIsShuffling] = useState(false);
    const ytPlayerRef = useRef(null);
    const lastInitId = useRef(0);

    // memoize sorted students
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

    // Calculate unassigned students
    const unassignedStudents = useMemo(() => {
        return sortedStudents.filter(s => 
            !grid.some(row => row.some(seat => seat.studentId === s.id))
        );
    }, [sortedStudents, grid]);

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
            if (!currentClass?.id) {
                setIsConfigLoaded(true);
                return;
            }
            
            try {
                const saved = await getData(STORES.SEATING_CONFIGS, currentClass.id);
                if (saved) {
                    setGridConfig(saved.gridConfig || { rows: 5, cols: 6, pairSize: 2 });
                    setConstraints(migrateConstraints(saved.constraints));
                    setUseFemaleSeats(saved.useFemaleSeats !== undefined ? saved.useFemaleSeats : true);
                    setGrid(saved.grid || generateEmptyGrid(5, 6, 2));
                    if (saved.youtubeUrl) setYoutubeUrl(saved.youtubeUrl);
                } else {
                    // Fallback to localStorage seating layout if available
                    const localSaved = localStorage.getItem(`seating_layout_${currentClass.id}`) || localStorage.getItem(`seating_layout_default`);
                    if (localSaved) {
                        try {
                            const parsedGrid = JSON.parse(localSaved);
                            if (Array.isArray(parsedGrid) && parsedGrid.length > 0) {
                                setGrid(parsedGrid);
                                setIsConfigLoaded(true);
                                setHasChanges(false);
                                return;
                            }
                        } catch (e) {}
                    }
                    setGrid(generateEmptyGrid(5, 6, 2));
                }
            } catch (e) {
                console.error("Failed to load seating config:", e);
                const localSaved = localStorage.getItem(`seating_layout_${currentClass.id}`) || localStorage.getItem(`seating_layout_default`);
                if (localSaved) {
                    try {
                        const parsedGrid = JSON.parse(localSaved);
                        if (Array.isArray(parsedGrid) && parsedGrid.length > 0) {
                            setGrid(parsedGrid);
                            setIsConfigLoaded(true);
                            setHasChanges(false);
                            return;
                        }
                    } catch (err) {}
                }
                setGrid(generateEmptyGrid(5, 6, 2));
            } finally {
                setIsConfigLoaded(true);
                setHasChanges(false);
            }
        };
        loadConfig();
    }, [currentClass]);

    // Load seating history for current class
    useEffect(() => {
        const loadHistory = async () => {
            if (!currentClass?.id) return;
            try {
                const history = await getAllDataByIndex(STORES.SEATING_HISTORY, 'classId', currentClass.id);
                // Sort newest first
                const sorted = [...history].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
                setSeatingHistory(sorted);
            } catch (e) {
                console.error('Failed to load seating history:', e);
            }
        };
        loadHistory();
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

    // ── 실시간 자동 저장 (Auto-Save to IndexedDB & LocalStorage) ──
    useEffect(() => {
        if (!isConfigLoaded || !currentClass?.id || !grid || grid.length === 0) return;

        setHasChanges(true); // 변동 감지 -> 저장 버튼 주황색 활성화

        // LocalStorage 동기화 (자리표 연동)
        try {
            localStorage.setItem(`seating_layout_${currentClass.id}`, JSON.stringify(grid));
            localStorage.setItem(`seating_layout_default`, JSON.stringify(grid));
        } catch (e) {
            console.error('LocalStorage seating sync failed:', e);
        }

        // IndexedDB 자동 저장 (디바운스 300ms)
        const timer = setTimeout(async () => {
            try {
                await saveData(STORES.SEATING_CONFIGS, {
                    classId: currentClass.id,
                    gridConfig,
                    constraints,
                    useFemaleSeats,
                    youtubeUrl,
                    grid,
                    updatedAt: new Date().toISOString()
                });
            } catch (err) {
                console.error('Auto save seating config failed:', err);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [grid, gridConfig, constraints, useFemaleSeats, youtubeUrl, isConfigLoaded, currentClass]);

    const handleSave = async () => {
        if (!currentClass?.id) return;
        await saveData(STORES.SEATING_CONFIGS, {
            classId: currentClass.id,
            gridConfig,
            constraints,
            useFemaleSeats,
            youtubeUrl,
            grid,
            updatedAt: new Date().toISOString()
        });
        alert('자리 배치가 저장되었습니다.');
    };

    // Open save modal
    const handleSaveClick = () => {
        const now = new Date();
        const defaultName = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} 자리배치`;
        setSaveNameInput(defaultName);
        setShowSaveModal(true);
    };

    // Extract seat pairs from grid (students sitting in same pairSize group)
    const extractSeatPairs = (currentGrid) => {
        const pairs = [];
        currentGrid.forEach(row => {
            for (let c = 0; c < row.length; c += gridConfig.pairSize) {
                const group = [];
                for (let p = 0; p < gridConfig.pairSize; p++) {
                    const seat = row[c + p];
                    if (seat?.studentId) group.push(seat.studentId);
                }
                if (group.length >= 2) pairs.push(group);
            }
        });
        return pairs;
    };

    // LocalStorage sync helper for JournalEntry.jsx integration
    const syncLocalStorageSeating = useCallback((targetGrid) => {
        try {
            if (currentClass?.id) {
                localStorage.setItem(`seating_layout_${currentClass.id}`, JSON.stringify(targetGrid));
            }
            localStorage.setItem(`seating_layout_default`, JSON.stringify(targetGrid));
        } catch (e) {
            console.error("Failed to sync seating layout to localStorage:", e);
        }
    }, [currentClass]);

    // Grid state update wrapper with auto-sync
    const updateGridAndSync = useCallback((newGrid) => {
        setGrid(newGrid);
        syncLocalStorageSeating(newGrid);
    }, [syncLocalStorageSeating]);

    // Confirm save: persist config + history entry
    const handleHistorySave = async () => {
        const name = saveNameInput.trim();
        if (!name) { alert('저장 이름을 입력해주세요.'); return; }
        if (!currentClass?.id) return;

        // Save current config (existing behavior)
        await saveData(STORES.SEATING_CONFIGS, {
            classId: currentClass.id,
            gridConfig,
            constraints,
            useFemaleSeats,
            youtubeUrl,
            grid,
            updatedAt: new Date().toISOString()
        });

        // Sync localStorage for JournalEntry integration
        syncLocalStorageSeating(grid);

        // Save history entry
        const pairs = extractSeatPairs(grid);
        await saveData(STORES.SEATING_HISTORY, {
            classId: currentClass.id,
            name,
            grid,
            gridConfig,
            pairs, // [[ studentId, studentId, ... ], ...]
            savedAt: new Date().toISOString()
        });

        // Reload history
        const updated = await getAllDataByIndex(STORES.SEATING_HISTORY, 'classId', currentClass.id);
        setSeatingHistory([...updated].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)));

        setHasChanges(false); // 저장 완료 -> 주황색 해제
        setShowSaveModal(false);
        showAlert(`'${name}' 이름으로 자리배치가 기록되었습니다.`, '저장 완료', '확인', 'success');
    };

    // Load a history record into the current grid
    const handleLoadRecord = async (record) => {
        const confirmed = await showConfirm(`'${record.name}' 자리배치를 불러올까요?\n현재 배치가 덮어씌워집니다.`, '기록 불러오기', '불러오기', '취소');
        if (!confirmed) return;
        setGrid(record.grid);
        setGridConfig(record.gridConfig);
        syncLocalStorageSeating(record.grid);
        await saveData(STORES.SEATING_CONFIGS, {
            classId: currentClass.id,
            gridConfig: record.gridConfig,
            constraints,
            useFemaleSeats,
            youtubeUrl,
            grid: record.grid,
            updatedAt: new Date().toISOString()
        });
        setHasChanges(false);
        setShowLoadModal(false);
        setPreviewRecord(null);
    };

    // Delete a history entry
    const handleDeleteHistory = async (id) => {
        const confirmed = await showConfirm('이 기록을 삭제하시겠습니까?', '기록 삭제', '삭제', '취소');
        if (!confirmed) return;
        await deleteData(STORES.SEATING_HISTORY, id);
        setSeatingHistory(prev => prev.filter(h => h.id !== id));
    };

    const saveMusicLink = async (newUrl) => {
        if (!currentClass?.id) return;
        const saved = await getData(STORES.SEATING_CONFIGS, currentClass.id) || {};
        await saveData(STORES.SEATING_CONFIGS, {
            ...saved,
            classId: currentClass.id,
            youtubeUrl: newUrl,
            updatedAt: new Date().toISOString()
        });
    };

    // 1. YouTube API Loading
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setIsApiLoaded(true);
            return;
        }

        const scriptId = 'youtube-iframe-api';
        if (!document.getElementById(scriptId)) {
            const tag = document.createElement('script');
            tag.id = scriptId;
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
            console.log("YouTube API Ready Event");
            setIsApiLoaded(true);
        };
    }, []);

    // 2. Reactive Player Initialization
    useEffect(() => {
        if (isApiLoaded && isConfigLoaded && youtubeUrl && mode === 'student') {
            // Small delay to ensure the DOM element (#yt-player-container) is rendered
            const timer = setTimeout(() => {
                initYoutubePlayer();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isApiLoaded, isConfigLoaded, youtubeUrl, mode]);

    const extractVideoId = (url) => {
        if (!url) return null;
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(shorts\/)|(\&v=))([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[9].length === 11) ? match[9] : null;
    };

    const initYoutubePlayer = () => {
        const urlToUse = youtubeUrl || 'https://www.youtube.com/watch?v=17_n3286YpY';
        const videoId = extractVideoId(urlToUse);
        if (!videoId || !window.YT || !window.YT.Player) return;

        // Unique ID for this initialization attempt
        const currentInitId = ++lastInitId.current;

        console.log(`[YT] Starting init #${currentInitId} for ${videoId}`);

        // Destroy existing player instance to free resources
        if (ytPlayerRef.current) {
            try {
                if (typeof ytPlayerRef.current.destroy === 'function') {
                    ytPlayerRef.current.destroy();
                }
            } catch (e) {
                console.warn("[YT] Destroy failed:", e);
            }
            ytPlayerRef.current = null;
        }

        const container = document.getElementById('yt-player-container');
        if (container) {
            container.innerHTML = '<div id="yt-player-placeholder"></div>';
        } else {
            return;
        }

        setIsPlayerReady(false);

        try {
            ytPlayerRef.current = new window.YT.Player('yt-player-placeholder', {
                height: '200',
                width: '200',
                videoId: videoId,
                playerVars: {
                    'autoplay': 0,
                    'controls': 0,
                    'disablekb': 1,
                    'fs': 0,
                    'rel': 0,
                    'modestbranding': 1,
                    'showinfo': 0,
                    'enablejsapi': 1,
                    'playsinline': 1
                },
                events: {
                    'onReady': (event) => {
                        if (lastInitId.current !== currentInitId) {
                            console.log(`[YT] Ignoring stale ready for init #${currentInitId}`);
                            return;
                        }
                        console.log(`[YT] Player Ready for init #${currentInitId}`);
                        setIsPlayerReady(true);
                        try {
                            event.target.setVolume(70);
                            event.target.unMute();
                        } catch (e) {}
                    },
                    'onError': (e) => {
                        if (lastInitId.current !== currentInitId) return;
                        console.error("[YT] Error:", e.data);
                        setIsPlayerReady(false);
                    },
                    'onStateChange': (event) => {
                        if (lastInitId.current !== currentInitId) return;
                        if (event.data === -1 || event.data === 1 || event.data === 2) {
                            setIsPlayerReady(true);
                        }
                    }
                }
            });
        } catch (err) {
            console.error("[YT] Crash:", err);
        }
    };

    const handleRandomize = () => {
        if (!students || students.length === 0) {
            showAlert('학생 정보가 없습니다.', '안내', '확인', 'error');
            return;
        }
        const newGrid = assignSeatsRandomly(students, grid, constraints, useFemaleSeats);
        setGrid(newGrid);
        syncLocalStorageSeating(newGrid);
    };

    const resetGrid = async () => {
        const confirmed = await showConfirm('모든 학생 배치를 초기화하시겠습니까? (빈 좌석 설정은 유지됩니다)', '자리 초기화', '초기화', '취소');
        if (confirmed) {
            const newGrid = grid.map(row => row.map(seat => ({ ...seat, studentId: null })));
            setGrid(newGrid);
            syncLocalStorageSeating(newGrid);
        }
    };

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        const numValue = parseInt(value, 10);
        const newConfig = { ...gridConfig, [name]: numValue };
        setGridConfig(newConfig);
        setGrid(generateEmptyGrid(newConfig.rows, newConfig.cols, newConfig.pairSize));
    };

    // Drag and Drop Logic
    const [selectedPoolStudent, setSelectedPoolStudent] = useState(null);
    const [avoidanceWarningModal, setAvoidanceWarningModal] = useState({
        isOpen: false,
        student1: null,
        student2: null,
        pendingGrid: null
    });
    const [genderWarningModal, setGenderWarningModal] = useState({
        isOpen: false,
        student: null,
        requiredGender: '',
        pendingGrid: null
    });

    // Check if placing targetStudentId at (r, c) violates avoidance constraints (left/right, front/behind)
    const checkAvoidanceViolation = (targetStudentId, r, c, targetGrid) => {
        if (!constraints.avoidances || constraints.avoidances.length === 0) return null;

        const neighbors = [
            { r, c: c - 1 }, // left
            { r, c: c + 1 }, // right
            { r: r - 1, c }, // front
            { r: r + 1, c }  // behind
        ];

        for (const group of constraints.avoidances) {
            if (!group.studentIds || !group.studentIds.includes(targetStudentId)) continue;

            const partnerIds = group.studentIds.filter(id => id !== targetStudentId);

            for (const pos of neighbors) {
                if (pos.r >= 0 && pos.r < targetGrid.length && pos.c >= 0 && pos.c < targetGrid[0].length) {
                    const neighborSeat = targetGrid[pos.r][pos.c];
                    if (neighborSeat.studentId && partnerIds.includes(neighborSeat.studentId)) {
                        const st1 = students?.find(s => s.id === targetStudentId);
                        const st2 = students?.find(s => s.id === neighborSeat.studentId);
                        return { student1: st1, student2: st2 };
                    }
                }
            }
        }
        return null;
    };

    const onDragStartPool = (e, student) => {
        setDragSource('pool');
        setDraggedStudent(student);
        setSelectedPoolStudent(student);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(student.id));
            e.dataTransfer.setData('studentId', String(student.id));
        }
    };

    const onDragStartGrid = (e, r, c, student) => {
        setDragSource('grid');
        setDragCoords({ r, c });
        setDraggedStudent(student);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(student.id));
            e.dataTransfer.setData('studentId', String(student.id));
        }
    };

    const onDragOver = (e, r, c) => {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        setDropTarget({ r, c });
    };

    const onDrop = (e, r, c) => {
        e.preventDefault();
        setDropTarget(null);
        if (!draggedStudent) return;

        const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
        const sourceId = draggedStudent.id;
        const targetSeat = newGrid[r][c];

        // Blocked Check
        if (targetSeat.genderPreference === 'blocked') {
            alert('이 좌석은 사용할 수 없는 자리입니다.');
            setDropTarget(null);
            return;
        }

        if (dragSource === 'pool') {
            newGrid[r][c].studentId = sourceId;
        } else {
            const temp = targetSeat.studentId;
            newGrid[dragCoords.r][dragCoords.c].studentId = temp;
            newGrid[r][c].studentId = sourceId;
        }

        // Gender Check
        const expectedGender = targetSeat.genderPreference === '여' ? '여' : (useFemaleSeats && targetSeat.genderPreference === null ? '남' : null);
        const isGenderMismatch = expectedGender && draggedStudent.gender !== expectedGender;

        setDraggedStudent(null);
        setDragSource(null);
        setDragCoords(null);
        setSelectedPoolStudent(null);

        if (isGenderMismatch) {
            setGenderWarningModal({
                isOpen: true,
                student: draggedStudent,
                requiredGender: expectedGender,
                pendingGrid: newGrid
            });
            return;
        }

        const violation = checkAvoidanceViolation(sourceId, r, c, newGrid);
        if (violation) {
            setAvoidanceWarningModal({
                isOpen: true,
                student1: violation.student1,
                student2: violation.student2,
                pendingGrid: newGrid
            });
        } else {
            setGrid(newGrid);
            syncLocalStorageSeating(newGrid);
        }
    };

    const removeFromSeat = (r, c) => {
        const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
        newGrid[r][c].studentId = null;
        setGrid(newGrid);
        syncLocalStorageSeating(newGrid);
    };

    const handleSeatClick = (r, c) => {
        if (mode !== 'teacher') return;

        // If a student in pool is selected, click seat to place student immediately
        if (selectedPoolStudent && !grid[r][c].studentId && grid[r][c].genderPreference !== 'blocked') {
            const targetSeat = grid[r][c];
            const newGrid = [...grid.map(row => [...row.map(seat => ({...seat}))])];
            newGrid[r][c].studentId = selectedPoolStudent.id;
            const targetStudent = selectedPoolStudent;
            setSelectedPoolStudent(null);

            const expectedGender = targetSeat.genderPreference === '여' ? '여' : (useFemaleSeats && targetSeat.genderPreference === null ? '남' : null);
            const isGenderMismatch = expectedGender && targetStudent.gender !== expectedGender;

            if (isGenderMismatch) {
                setGenderWarningModal({
                    isOpen: true,
                    student: targetStudent,
                    requiredGender: expectedGender,
                    pendingGrid: newGrid
                });
                return;
            }

            const violation = checkAvoidanceViolation(targetStudent.id, r, c, newGrid);
            if (violation) {
                setAvoidanceWarningModal({
                    isOpen: true,
                    student1: violation.student1,
                    student2: violation.student2,
                    pendingGrid: newGrid
                });
            } else {
                setGrid(newGrid);
                syncLocalStorageSeating(newGrid);
            }
            return;
        }

        if (grid[r][c].studentId) {
            setSelectedPoolStudent(null);
            return;
        }

        toggleSeatGender(r, c);
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
    const startReveal = (shouldRandomize = true) => {
        if (!students || students.length === 0) {
            alert('학생 정보가 없습니다.');
            return;
        }

        let newGrid = grid;
        if (shouldRandomize) {
            newGrid = assignSeatsRandomly(students, grid, constraints, useFemaleSeats);
            setGrid(newGrid);
        }

        setIsShuffling(true); // Start shuffling animation
        setRevealedCount(0);
        
        // 2. YouTube Music Play - Start immediately with shuffling
        if (isMusicEnabled) {
            if (ytPlayerRef.current && ytPlayerRef.current.playVideo) {
                try {
                    ytPlayerRef.current.unMute();
                    ytPlayerRef.current.seekTo(0);
                    ytPlayerRef.current.playVideo();
                    console.log("Reveal Play Command Sent (Shuffle Start)");
                } catch (e) {
                    console.warn("Reveal play failed, trying re-init", e);
                    initYoutubePlayer();
                }
            } else {
                console.warn("Player not fully ready for reveal, attempting forced start");
                initYoutubePlayer();
            }
        }

        // 3. Prepare reveal order based on the NEW grid
        const filledSeats = [];
        newGrid.forEach((row, r) => {
            row.forEach((seat, c) => {
                if (seat.studentId) {
                    const student = students?.find(s => s.id === seat.studentId);
                    filledSeats.push({ r, c, gender: student?.gender });
                }
            });
        });

        let ordered = [];
        if (revealStrategy === 'all') {
            ordered = filledSeats;
        } else if (revealStrategy === 'one-by-one') {
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

        // 4. Let the shuffling animation play for 6 seconds (Increased from 4s)
        setTimeout(() => {
            setIsShuffling(false);
            if (revealStrategy === 'all') {
                setRevealedCount(ordered.length);
                setIsRevealing(false);
            } else {
                setIsRevealing(true);
            }
        }, 6000);
    };

    const isGridAssigned = useMemo(() => {
        return grid.some(row => row.some(seat => seat.studentId !== null));
    }, [grid]);

    useEffect(() => {
        let timer;
        if (isRevealing && revealedCount < revealOrder.length) {
            // Reveal interval
            const delay = (revealedCount === 0) ? 1000 : 2000;
            timer = setTimeout(() => setRevealedCount(prev => prev + 1), delay);
        } else if (isRevealing && revealedCount === revealOrder.length && revealOrder.length > 0) {
            // End reveal state
            setIsRevealing(false);
            // We removed the automatic stopVideo here to prevent premature cutoff (especially in 'all' mode)
            // Music will keep playing until manual stop or back button
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
        setSelectedInModal(target === 'front' ? [...constraints.frontPreference] : []);
        setIsModalOpen(true);
    };

    const handleModalConfirm = () => {
        if (modalTarget === 'front') {
            if (selectedInModal.length === 0) {
                setConstraints(prev => ({ ...prev, frontPreference: [] }));
            } else {
                setConstraints(prev => ({ ...prev, frontPreference: [...selectedInModal] }));
            }
            setIsModalOpen(false);
            return;
        }

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

    const removeFrontPreference = (studentId) => {
        setConstraints(prev => ({
            ...prev,
            frontPreference: prev.frontPreference.filter(id => id !== studentId)
        }));
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
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                setPrintMode(null);
            }, 1000);
        }, 150);
    };

    const [isExpandedWorkspace, setIsExpandedWorkspace] = useState(false);
    const [shouldRerandomOnReveal, setShouldRerandomOnReveal] = useState(false);

    // Automatically detect window maximize/resize to switch workspace mode
    useEffect(() => {
        const handleResize = () => {
            const isScreenMaximized = (window.outerWidth >= ((window.screen?.availWidth || 1920) - 60)) || (window.innerWidth >= 1600);
            setIsExpandedWorkspace(isScreenMaximized);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleExpandWorkspace = () => {
        if (window.electronAPI?.maximizeWindow) {
            try { window.electronAPI.maximizeWindow(); } catch(e) {}
        } else {
            setIsExpandedWorkspace(prev => !prev);
        }
    };

    return (
        <div ref={containerRef} className={`seating-chart-container ${isExpandedWorkspace ? 'expanded-workspace-active' : ''} ${printMode ? `printing print-${printMode}` : ''} ${mode === 'student' ? 'student-view-container' : ''}`}>
            {/* Shuffling Animation Overlay */}
            {isShuffling && (
                <div className="shuffle-overlay">
                    <div className="shuffle-content">
                        <div className="shuffle-dice">🎲</div>
                        <div className="shuffle-text">
                            <h2>학생들을 공정하게 랜덤 배치 중입니다...</h2>
                            <p>잠시만 기다려 주세요!</p>
                        </div>
                        <div className="shuffle-loader">
                            <div className="shuffle-bar"></div>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'teacher' && (
                <header className="seating-top-header">
                    <div className="header-title">
                        <h1>🪑 자리 배치</h1>
                        <span className="grid-size-badge">{gridConfig.rows}행 {gridConfig.cols}열</span>
                        {isExpandedWorkspace && <span className="grid-size-badge expanded-badge">🖥️ 전체창 배치 작업 모드</span>}
                    </div>
                    <div className="mode-toggle">
                        <button className={`expand-view-btn ${isExpandedWorkspace ? 'active' : ''}`} onClick={toggleExpandWorkspace}>
                            {isExpandedWorkspace ? '🗗 기본창(확인/인쇄 전용)으로 축소' : '🖥️ 자리배치 작업하기(전체창)'}
                        </button>
                        <button className={`mode-btn ${mode === 'teacher' ? 'active' : ''}`} onClick={() => setMode('teacher')}>교사용 View</button>
                        <button className={`mode-btn ${mode === 'student' ? 'active' : ''}`} onClick={() => setMode('student')}>학생 공개용</button>
                    </div>
                </header>
            )}

            {mode === 'teacher' && (
                <div className="setup-bar">
                    {/* 배치 설정 모달 카드 버튼 */}
                    <div className="setup-group config-section">
                        <button className="base-btn text-card-btn initial-setup-card-btn" onClick={() => setShowInitialSetupModal(true)}>
                            ⚙️ 배치 설정
                        </button>
                    </div>

                    {/* 액션 버튼 그룹 (시점 반전, 자리 초기화, 저장, 불러오기, 인쇄) */}
                    <div className="setup-group actions-section">
                        <div className="btn-group main">
                            <button 
                                className={`base-btn text-card-btn ${isFlipped ? 'active' : ''}`}
                                onClick={() => setIsFlipped(prev => !prev)}
                                title={isFlipped ? '학생 시점으로 전환 (칠판 위)' : '교사 시점으로 전환 (칠판 아래)'}
                            >
                                시점 반전
                            </button>
                            <button className="base-btn reset" onClick={resetGrid} title="전체 자리 초기화">
                                자리 초기화
                            </button>
                            <button 
                                className={`base-btn text-card-btn ${hasChanges ? 'save-btn-dirty' : ''}`} 
                                onClick={handleSaveClick} 
                                title={hasChanges ? "자리 변동 사항이 있습니다. 클릭하여 배치 기록 저장" : "배치 저장"}
                                style={hasChanges ? {
                                    backgroundColor: '#ea580c',
                                    background: '#ea580c',
                                    color: '#ffffff',
                                    borderColor: '#c2410c',
                                    fontWeight: '800',
                                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.4)'
                                } : {}}
                            >
                                {hasChanges ? '💾 배치 저장 (변동됨)' : '💾 배치 저장'}
                            </button>
                            <button className="base-btn text-card-btn" onClick={() => setShowLoadModal(true)} title="기록 불러오기">
                                📂 기록 불러오기
                            </button>
                        </div>

                        <div className="btn-group print">
                            <button className="base-btn text-card-btn print-open-btn" onClick={() => setShowPrintModal(true)} title="자리배치표 A4 가로 인쇄 및 미리보기">
                                🖨️ 자리배치표 인쇄 / 미리보기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'student' && (
                <div className="student-unified-header">
                    <button className="stealth-back-btn green-back-pill" onClick={() => {
                        setMode('teacher');
                        setIsRevealing(false);
                        setRevealedCount(0);
                        if (ytPlayerRef.current && ytPlayerRef.current.stopVideo) {
                            try { ytPlayerRef.current.stopVideo(); } catch(e) {}
                        }
                    }} title="교사 설정으로 돌아가기">← 돌아가기</button>

                    <div className="student-main-title">
                        🌱 우리 반 자리 배치
                    </div>

                    <div className="student-actions-group">
                        <button className="green-action-pill" onClick={() => setShowMusicSettings(true)}>
                            ⚙️ 설정
                        </button>

                        <div className="music-switch-wrapper" title="배경음악 토글">
                            <span className="switch-label">🎵 배경음악</span>
                            <div 
                                className={`green-toggle-pill ${isMusicEnabled ? 'active' : ''}`}
                                onClick={() => {
                                    const nextValue = !isMusicEnabled;
                                    setIsMusicEnabled(nextValue);
                                    if (!nextValue && ytPlayerRef.current && ytPlayerRef.current.stopVideo) {
                                        try { ytPlayerRef.current.stopVideo(); } catch(e) {}
                                    }
                                }}
                            >
                                <div className="pill-thumb"></div>
                            </div>
                            <span className={`switch-state-badge ${isMusicEnabled ? 'on' : 'off'}`}>
                                {isMusicEnabled ? 'ON' : 'OFF'}
                            </span>
                        </div>

                        <button className="green-action-pill dark" onClick={toggleFullscreen} title="전체화면">
                            📺 전체화면
                        </button>

                        {isRevealing && (
                            <button 
                                className="green-gradient-main-btn" 
                                style={{ background: '#f59e0b', borderColor: '#d97706' }}
                                onClick={() => {
                                    setRevealedCount(revealOrder.length);
                                    setIsRevealing(false);
                                }}
                            >
                                ⚡ 한번에 전체 공개
                            </button>
                        )}

                        {revealedCount > 0 && revealedCount === revealOrder.length && !isShuffling && (
                            <>
                                <button 
                                    className="green-action-pill"
                                    onClick={() => {
                                        setRevealedCount(0);
                                        startReveal(false);
                                    }}
                                    title="현재 배치된 자리 그대로 다시 공개 애니메이션 시작"
                                >
                                    🔄 다시 공개하기
                                </button>
                                <button 
                                    className="green-gradient-main-btn" 
                                    onClick={() => {
                                        setRevealedCount(0);
                                        startReveal(true);
                                    }}
                                    title="자리를 새로 섞고 공개 시작"
                                >
                                    🎲 새로 섞고 공개
                                </button>
                            </>
                        )}

                        {!isRevealing && !(revealedCount > 0 && revealedCount === revealOrder.length) && (
                            <button 
                                className="green-gradient-main-btn" 
                                onClick={() => startReveal(shouldRerandomOnReveal || !isGridAssigned)} 
                                disabled={isShuffling}
                            >
                                {isShuffling ? '자리 배치 중...' : '🎉 자리 공개 시작'}
                            </button>
                        )}
                    </div>

                    {/* YouTube Player Container */}
                    <div id="yt-player-container" style={{ 
                        position: 'fixed', 
                        top: '-20px', 
                        left: '-20px', 
                        width: '10px', 
                        height: '10px', 
                        opacity: 0.01, 
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: -9999
                    }}>
                        <div id="yt-player-placeholder"></div>
                    </div>

                    {/* 학생 공개용 설정 및 배경음악 모달 */}
                    {showMusicSettings && (
                        <div 
                            className="music-help-overlay" 
                            onClick={(e) => {
                                if (e.target === e.currentTarget) setShowMusicSettings(false);
                            }}
                        >
                            <div className="music-help-modal student-reveal-config-modal">
                                <div className="student-modal-header">
                                    <h3>학생 공개 설정</h3>
                                    <button className="modal-close-x-btn" onClick={() => setShowMusicSettings(false)}>×</button>
                                </div>
                                
                                {/* 1. 공개 방식 선택 (하나씩 vs 한번에) */}
                                <div className="modal-config-group">
                                    <label className="config-group-title">1. 공개 방식 선택</label>
                                    <div className="strategy-selector modal-selector single-line-selector">
                                        <button 
                                            className={revealStrategy !== 'all' ? 'active' : ''} 
                                            onClick={() => setRevealStrategy('one-by-one')}
                                        >
                                            하나씩 순차 공개
                                        </button>
                                        <button 
                                            className={revealStrategy === 'all' ? 'active' : ''} 
                                            onClick={() => setRevealStrategy('all')}
                                        >
                                            한번에 전체 공개
                                        </button>
                                    </div>
                                </div>

                                {/* 2. 공개 순서 선택 (하나씩 순차 공개 선택 시 활성화) */}
                                {revealStrategy !== 'all' && (
                                    <div className="modal-config-group sub-config-group">
                                        <label className="config-group-title">2. 순서 세부 설정</label>
                                        <div className="strategy-selector modal-selector triple-selector">
                                            <button 
                                                className={revealStrategy === 'one-by-one' ? 'active' : ''} 
                                                onClick={() => setRevealStrategy('one-by-one')}
                                            >
                                                전체 무작위
                                            </button>
                                            <button 
                                                className={revealStrategy === 'male-first' ? 'active' : ''} 
                                                onClick={() => setRevealStrategy('male-first')}
                                            >
                                                남학생 먼저
                                            </button>
                                            <button 
                                                className={revealStrategy === 'female-first' ? 'active' : ''} 
                                                onClick={() => setRevealStrategy('female-first')}
                                            >
                                                여학생 먼저
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 3. 자리 배치 방식 */}
                                <div className="modal-config-group">
                                    <label className="config-group-title">3. 자리 배치 선택</label>
                                    <div className="strategy-selector modal-selector single-line-selector">
                                        <button 
                                            className={!shouldRerandomOnReveal ? 'active' : ''} 
                                            onClick={() => setShouldRerandomOnReveal(false)}
                                        >
                                            현재 작성 배치 사용
                                        </button>
                                        <button 
                                            className={shouldRerandomOnReveal ? 'active' : ''} 
                                            onClick={() => setShouldRerandomOnReveal(true)}
                                        >
                                            시작 시 새로 랜덤 배치
                                        </button>
                                    </div>
                                </div>

                                {/* 4. 배경 음악 연동 */}
                                <div className="modal-config-group">
                                    <label className="config-group-title">4. 배경 음악 연동 (유튜브)</label>
                                    <div className="yt-input-group">
                                        <div className="yt-input-wrapper">
                                            <input 
                                                type="text" 
                                                placeholder="https://www.youtube.com/watch?v=..." 
                                                value={youtubeUrl}
                                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                            />
                                            {youtubeUrl && (
                                                <button className="yt-clear-btn" onClick={() => setYoutubeUrl('')} title="주소 지우기">×</button>
                                            )}
                                        </div>
                                        <div className="yt-test-actions">
                                            <button 
                                                className={`m-btn test-play-btn ${!isPlayerReady ? 'loading' : ''}`}
                                                disabled={!isPlayerReady}
                                                onClick={() => {
                                                    if (ytPlayerRef.current && ytPlayerRef.current.playVideo) {
                                                        ytPlayerRef.current.playVideo();
                                                    }
                                                }}
                                            >
                                                {isPlayerReady ? '테스트 재생' : '준비 중...'}
                                            </button>
                                            <button 
                                                className="m-btn test-stop-btn"
                                                onClick={() => {
                                                    if (ytPlayerRef.current && ytPlayerRef.current.stopVideo) {
                                                        ytPlayerRef.current.stopVideo();
                                                    }
                                                }}
                                            >
                                                정지
                                            </button>
                                            <button 
                                                className="m-btn retry-btn"
                                                title="음악이 나오지 않으면 눌러주세요"
                                                onClick={initYoutubePlayer}
                                            >
                                                재연결
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button className="m-btn confirm-full" onClick={() => {
                                    setShowMusicSettings(false);
                                    saveMusicLink(youtubeUrl);
                                }}>설정 완료</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <main className={`seating-main-workspace ${mode === 'student' ? 'student-view' : ''}`}>
                <div className="seating-chart-and-status-column">
                    <section className={`classroom-area ${!printMode && isFlipped && mode === 'teacher' ? 'flipped' : ''}`}>
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
                                        else if (useFemaleSeats && seat.genderPreference === null) statusClass = 'gender-male';

                                        return (
                                            <div 
                                                key={`${r}-${c}`}
                                                className={`seat-slot ${isGap ? 'gap' : ''} ${isTarget ? 'drop-target' : ''} ${statusClass} ${student ? 'occupied' : ''}`}
                                                onDragOver={(e) => mode === 'teacher' && onDragOver(e, r, c)}
                                                onDrop={(e) => mode === 'teacher' && onDrop(e, r, c)}
                                                onDragLeave={() => setDropTarget(null)}
                                                onClick={() => handleSeatClick(r, c)}
                                                title={mode === 'teacher' && !student ? '클릭/드래그하여 학생 배치 (클릭시: 일반 > 여학생전용 > 사용불가)' : ''}
                                            >
                                                {student && revealed ? (
                                                    <div
                                                        className={`student-card ${mode === 'student' ? 'revealed' : ''} ${useFemaleSeats ? (student.gender === '남' ? 'card-male' : 'card-female') : ''}`}
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

                    {/* 자리배치표 하단 실시간 배정 상태 알림 바 */}
                    {mode === 'teacher' && (
                        <div className="classroom-bottom-status-wrap">
                            <div className={`validation-status-pill ${validation.isValid ? 'valid' : 'invalid'}`} title={validation.errors.join(' / ') || '모든 학생 배정 준비가 완료되었습니다.'}>
                                <span className="status-main-badge">
                                    {validation.isValid ? '🟢 배치 준비 완료' : '⚠️ 좌석 조정 필요'}
                                </span>
                                <span className="status-sub-text">
                                    {validation.isValid 
                                        ? (useFemaleSeats ? `남 ${validation.counts.totalMale}명 / 여 ${validation.counts.totalFemale}명 좌석 수 일치` : `총 ${validation.counts.totalStudents}명 좌석 수 일치`)
                                        : (validation.errors[0] || '좌석 수를 확인해 주세요')}
                                </span>
                            </div>
                            <p className="faded-seat-click-hint">
                                💡 빈 좌석을 클릭할 때마다 [남학생 ➔ 여학생 ➔ 사용 불가 ➔ 남학생] 순으로 전환됩니다.
                            </p>
                        </div>
                    )}
                </div>

                {mode === 'teacher' && (
                    <aside className="student-pool-panel">
                        <div className="pool-header">
                            <h3>미배정 학생 ({unassignedStudents.length})</h3>
                            <button className="green-gradient-main-btn pool-auto-btn" onClick={handleRandomize}>
                                🎲 자동 배치
                            </button>
                        </div>
                        <div className="pool-list">
                            {unassignedStudents.map(student => (
                                <div 
                                    key={student.id} 
                                    className={`student-card ${useFemaleSeats ? (student.gender === '남' ? 'card-male' : 'card-female') : ''} ${selectedPoolStudent?.id === student.id ? 'selected-pool-student' : ''}`} 
                                    draggable={true} 
                                    onDragStart={(e) => onDragStartPool(e, student)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPoolStudent(prev => prev?.id === student.id ? null : student);
                                    }}
                                    title="드래그하거나 클릭 후 빈 자리를 클릭하세요"
                                >
                                    <span className={`student-no ${student.gender === '남' ? 'male' : 'female'}`}>{student.attendanceNumber}번</span>
                                    <span className="student-name">{student.name}</span>
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            </main>

            {mode === 'teacher' && (
                <div className="teacher-bottom-settings-grid">
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
                                    <button className="mini-add-btn" onClick={() => openConstraintModal('front')}>+ 추가</button>
                                </div>
                                <div className="constraint-active-list">
                                    {constraints.frontPreference.map((studentId) => {
                                        const st = students?.find(s => s.id === studentId);
                                        return st ? (
                                            <div key={studentId} className="active-item preference-chip">
                                                <span className="pair-names">
                                                    {st.attendanceNumber ? `${st.attendanceNumber}번 ${st.name}` : st.name}
                                                </span>
                                                <button className="del-btn" onClick={() => removeFrontPreference(studentId)}>×</button>
                                            </div>
                                        ) : null;
                                    })}
                                    {constraints.frontPreference.length === 0 && <p className="empty-msg">등록된 앞자리 선호 학생이 없습니다.</p>}
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
                                                {group.studentIds.map(id => {
                                                    const st = students?.find(s => s.id === id);
                                                    return st ? (st.attendanceNumber ? `${st.attendanceNumber}번 ${st.name}` : st.name) : '';
                                                }).filter(Boolean).join(' ↔ ')}
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
                                                {group.studentIds.map(id => {
                                                    const st = students?.find(s => s.id === id);
                                                    return st ? (st.attendanceNumber ? `${st.attendanceNumber}번 ${st.name}` : st.name) : '';
                                                }).filter(Boolean).join(' + ')}
                                            </span>
                                            <button className="del-btn" onClick={() => removePairing(group.id)}>×</button>
                                        </div>
                                    ))}
                                    {constraints.pairs.length === 0 && <p className="empty-msg">추가된 필수 그룹이 없습니다.</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="seating-history-panel">
                        <div className="history-header">
                            <h2>📁 자리배치 기록</h2>
                            <p>저장된 자리배치 기록입니다. 향후 짝 배정 시 이전 짝 정보가 활용됩니다.</p>
                        </div>
                        {seatingHistory.length === 0 ? (
                            <p className="history-empty">아직 저장된 기록이 없습니다. 저장 버튼을 눌러 기록을 남겨보세요.</p>
                        ) : (
                            <div className="history-list">
                                {seatingHistory.map(entry => {
                                    const date = new Date(entry.savedAt);
                                    const dateStr = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                                    return (
                                        <div key={entry.id} className="history-item">
                                            <div className="history-info">
                                                <span className="history-name">{entry.name}</span>
                                                <span className="history-date">{dateStr}</span>
                                            </div>
                                            <div className="history-actions">
                                                <button className="history-load-btn" onClick={() => { setPreviewRecord(entry); setShowLoadModal(true); }}>불러오기</button>
                                                <button className="history-del-btn" onClick={() => handleDeleteHistory(entry.id)}>삭제</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Student Select Modal */}
            {isModalOpen && (
                <div className="chart-modal-overlay">
                    <div className="chart-modal">
                        <div className="modal-header">
                            <h2>{modalTarget === 'front' ? '📍 앞자리 선호 학생 선택' : (modalTarget === 'avoidance' ? '🚫 짝꿍 금지 그룹 선택' : '🤝 필수 짝꿍 그룹 선택')}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-desc">
                                {modalTarget === 'front' 
                                    ? '앞자리(1~2분단 앞쪽) 배치를 원하는 학생들을 클릭하여 선택하세요.'
                                    : '함께 앉을 수 없거나(금지), 꼭 여럿이 붙어 앉아야 하는(필수) 학생들을 선택하세요.'}
                            </p>
                            <div className="modal-student-grid">
                                {sortedStudents.map(s => (
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
            {/* 학급 자리 배열 & 분류 초기 설정 모달 (이모티콘 제거, 가상 예시 뷰 추가) */}
            {showInitialSetupModal && (
                <div className="ro-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowInitialSetupModal(false); }}>
                    <div className="ro-modal-container initial-setup-modal">
                        <div className="ro-modal-header">
                            <div className="modal-header-title">
                                <h3>학급 자리 배열 & 분류 초기 설정</h3>
                            </div>
                            <button className="modal-close-x" onClick={() => setShowInitialSetupModal(false)}>✕</button>
                        </div>

                        <div className="modal-result-body setup-modal-body">
                            {/* 1. 학급 자리 배열 */}
                            <div className="modal-config-group">
                                <label className="config-group-title">1. 학급 자리 배열 (행 × 열)</label>
                                <div className="grid-dim-inputs-row">
                                    <div className="dim-input-box">
                                        <span>행 (세로):</span>
                                        <input
                                            type="number"
                                            name="rows"
                                            min="1"
                                            max="10"
                                            value={gridConfig.rows}
                                            onChange={handleConfigChange}
                                        />
                                        <span>행</span>
                                    </div>
                                    <span className="dim-multiply">×</span>
                                    <div className="dim-input-box">
                                        <span>열 (가로):</span>
                                        <input
                                            type="number"
                                            name="cols"
                                            min="1"
                                            max="12"
                                            value={gridConfig.cols}
                                            onChange={handleConfigChange}
                                        />
                                        <span>열</span>
                                    </div>
                                    <span className="dim-total-badge">총 {gridConfig.rows * gridConfig.cols}석 생성</span>
                                </div>
                            </div>

                            {/* 2. 좌석 배치 분류 */}
                            <div className="modal-config-group">
                                <label className="config-group-title">2. 좌석 배치 분류</label>
                                <div className="strategy-selector modal-selector single-line-selector">
                                    {[
                                        { value: 1, label: '1명씩 (단독)' },
                                        { value: 2, label: '2명씩 (짝지어)' },
                                        { value: 3, label: '3명씩 (모둠)' },
                                        { value: 4, label: '4명씩 (모둠)' }
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            className={gridConfig.pairSize === opt.value ? 'active' : ''}
                                            onClick={() => {
                                                const newConfig = { ...gridConfig, pairSize: opt.value };
                                                setGridConfig(newConfig);
                                                setGrid(generateEmptyGrid(newConfig.rows, newConfig.cols, opt.value));
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 3. 남녀 좌석 구분 */}
                            <div className="modal-config-group">
                                <label className="config-group-title">3. 남녀 좌석 구분 설정</label>
                                <div className="strategy-selector modal-selector single-line-selector">
                                    <button
                                        className={useFemaleSeats ? 'active' : ''}
                                        onClick={() => setUseFemaleSeats(true)}
                                    >
                                        남녀 구분 좌석 사용
                                    </button>
                                    <button
                                        className={!useFemaleSeats ? 'active' : ''}
                                        onClick={() => setUseFemaleSeats(false)}
                                    >
                                        구분 없이 자유 배치
                                    </button>
                                </div>
                            </div>

                            {/* 4. 가상 배치 구조 미리보기 */}
                            <div className="modal-config-group">
                                <label className="config-group-title">4. 가상 배치 구조 미리보기 ({gridConfig.rows}행 × {gridConfig.cols}열, {gridConfig.pairSize}명씩)</label>
                                <div className="preview-layout-box">
                                    <div className="preview-blackboard-tag">칠 판 (교탁)</div>
                                    <div className="preview-grid-mini">
                                        {Array.from({ length: gridConfig.rows }).map((_, r) => (
                                            <div key={r} className="preview-row-mini">
                                                {Array.from({ length: gridConfig.cols }).map((_, c) => {
                                                    const isGap = ((c + 1) % gridConfig.pairSize === 0 && (c + 1) < gridConfig.cols);
                                                    return (
                                                        <div key={c} className={`preview-desk-chip ${isGap ? 'has-gap' : ''}`}>
                                                            {r + 1}-{c + 1}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ro-modal-footer">
                            <div className="footer-right">
                                <button className="green-gradient-main-btn" onClick={() => setShowInitialSetupModal(false)}>
                                    설정 완료
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 짝꿍 금지 학생 근접 경고 모달 */}
            {avoidanceWarningModal.isOpen && (
                <div className="music-help-overlay" onClick={() => setAvoidanceWarningModal({ isOpen: false, student1: null, student2: null, pendingGrid: null })}>
                    <div className="initial-setup-modal warning-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="setup-modal-header warning-header">
                            <h3>⚠️ 짝꿍 금지 학생 근접 경고</h3>
                        </div>
                        <div className="warning-modal-body">
                            <div className="warning-icon-badge">🚫</div>
                            <p className="warning-main-msg">
                                <strong>
                                    {avoidanceWarningModal.student1?.attendanceNumber ? `${avoidanceWarningModal.student1.attendanceNumber}번 ` : ''}{avoidanceWarningModal.student1?.name}
                                </strong> 학생과 <strong>
                                    {avoidanceWarningModal.student2?.attendanceNumber ? `${avoidanceWarningModal.student2.attendanceNumber}번 ` : ''}{avoidanceWarningModal.student2?.name}
                                </strong> 학생은 <strong>'짝꿍 금지'</strong>로 설정되어 있습니다.
                            </p>
                            <p className="warning-sub-msg">
                                수동 배치 시 짝꿍(좌우) 또는 앞뒤로 서로 부딪히는 위치입니다. 그래도 이 자리에 배치하시겠습니까?
                            </p>
                        </div>
                        <div className="ro-modal-footer warning-modal-footer">
                            <button className="base-btn cancel-btn" onClick={() => setAvoidanceWarningModal({ isOpen: false, student1: null, student2: null, pendingGrid: null })}>
                                배치 취소
                            </button>
                            <button className="green-gradient-main-btn override-btn" onClick={() => {
                                setGrid(avoidanceWarningModal.pendingGrid);
                                syncLocalStorageSeating(avoidanceWarningModal.pendingGrid);
                                setAvoidanceWarningModal({ isOpen: false, student1: null, student2: null, pendingGrid: null });
                            }}>
                                그대로 배치하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 성별 불일치 좌석 배치 경고 모달 */}
            {genderWarningModal.isOpen && (
                <div className="music-help-overlay" onClick={() => setGenderWarningModal({ isOpen: false, student: null, requiredGender: '', pendingGrid: null })}>
                    <div className="initial-setup-modal warning-modal-card gender-warning-card" onClick={e => e.stopPropagation()}>
                        <div className="setup-modal-header warning-header gender-warning-header">
                            <h3>⚠️ 좌석 성별 불일치 배치 경고</h3>
                        </div>
                        <div className="warning-modal-body">
                            <div className="warning-icon-badge gender-icon-badge">🚻</div>
                            <p className="warning-main-msg">
                                <strong>
                                    {genderWarningModal.student?.attendanceNumber ? `${genderWarningModal.student.attendanceNumber}번 ` : ''}{genderWarningModal.student?.name}
                                </strong> ({genderWarningModal.student?.gender}학생) 학생이 <strong>'{genderWarningModal.requiredGender}학생 지정석'</strong>에 배치되려고 합니다.
                            </p>
                            <p className="warning-sub-msg">
                                설정된 성별 구분 규칙과 일치하지 않는 좌석입니다. 그래도 이 자리에 배치하시겠습니까?
                            </p>
                        </div>
                        <div className="ro-modal-footer warning-modal-footer">
                            <button className="base-btn cancel-btn" onClick={() => setGenderWarningModal({ isOpen: false, student: null, requiredGender: '', pendingGrid: null })}>
                                배치 취소
                            </button>
                            <button className="green-gradient-main-btn override-btn" onClick={() => {
                                const pendingGrid = genderWarningModal.pendingGrid;
                                const st = genderWarningModal.student;
                                setGenderWarningModal({ isOpen: false, student: null, requiredGender: '', pendingGrid: null });

                                if (st && pendingGrid) {
                                    let placedR = -1, placedC = -1;
                                    pendingGrid.forEach((row, rIdx) => {
                                        row.forEach((seat, cIdx) => {
                                            if (seat.studentId === st.id) { placedR = rIdx; placedC = cIdx; }
                                        });
                                    });
                                    if (placedR !== -1) {
                                        const violation = checkAvoidanceViolation(st.id, placedR, placedC, pendingGrid);
                                        if (violation) {
                                            setAvoidanceWarningModal({
                                                isOpen: true,
                                                student1: violation.student1,
                                                student2: violation.student2,
                                                pendingGrid
                                            });
                                            return;
                                        }
                                    }
                                }
                                setGrid(pendingGrid);
                                syncLocalStorageSeating(pendingGrid);
                            }}>
                                그대로 배치하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 자리배치 기록 저장 모달 ── */}
            {showSaveModal && (
                <div className="seating-dialog-overlay" onClick={() => setShowSaveModal(false)}>
                    <div className="seating-dialog-card" style={{ maxWidth: '440px', width: '92%' }} onClick={e => e.stopPropagation()}>
                        <div className="seating-dialog-header">
                            <h3>💾 자리배치 기록 저장</h3>
                            <button className="seating-dialog-close-btn" onClick={() => setShowSaveModal(false)}>✕</button>
                        </div>
                        <div className="seating-dialog-body">
                            <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '800', color: '#334155', marginBottom: '8px' }}>
                                자리배치 기록 이름
                            </label>
                            <input
                                type="text"
                                value={saveNameInput}
                                onChange={(e) => setSaveNameInput(e.target.value)}
                                placeholder="예: 2026.03.02 1학기 첫 자리배치"
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #cbd5e1',
                                    fontSize: '14.5px',
                                    boxSizing: 'border-box',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#16a34a'}
                                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleHistorySave(); }}
                            />
                            <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '10px', lineHeight: '1.45', margin: '10px 0 0 0' }}>
                                현재 배치 상태가 이 이름으로 기록 보관함에 영구 저장됩니다.
                            </p>
                        </div>
                        <div className="seating-dialog-footer">
                            <button 
                                type="button"
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    color: '#475569',
                                    padding: '9px 16px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setShowSaveModal(false)}
                            >
                                취소
                            </button>
                            <button 
                                type="button"
                                style={{
                                    background: '#16a34a',
                                    border: 'none',
                                    color: '#ffffff',
                                    padding: '9px 20px',
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                }}
                                onClick={handleHistorySave}
                            >
                                저장 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 자리배치 기록 보관함 및 불러오기 모달 ── */}
            {showLoadModal && (
                <div className="seating-dialog-overlay" onClick={() => setShowLoadModal(false)}>
                    <div className="seating-dialog-card" style={{ maxWidth: '640px', width: '92%' }} onClick={e => e.stopPropagation()}>
                        <div className="seating-dialog-header">
                            <h3>📂 자리배치 기록 보관함</h3>
                            <button className="seating-dialog-close-btn" onClick={() => setShowLoadModal(false)}>✕</button>
                        </div>
                        <div className="seating-dialog-body" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                            {seatingHistory.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>📂</div>
                                    <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#64748b' }}>저장된 자리배치 기록이 없습니다.</p>
                                    <p style={{ margin: '6px 0 0 0', fontSize: '12.5px' }}>상단의 [배치 저장] 버튼을 눌러 현재 자리를 저장해 보세요.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {seatingHistory.map(record => {
                                        const dateStr = new Date(record.savedAt).toLocaleDateString('ko-KR', {
                                            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                        });
                                        const assignedCount = record.grid ? record.grid.reduce((acc, row) => acc + row.filter(s => s.studentId).length, 0) : 0;

                                        return (
                                            <div 
                                                key={record.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '14px 18px',
                                                    background: '#ffffff',
                                                    border: '1.5px solid #e2e8f0',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div>
                                                    <h4 style={{ margin: '0 0 5px 0', fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                                                        {record.name}
                                                    </h4>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
                                                        <span>📅 {dateStr}</span>
                                                        <span>•</span>
                                                        <span style={{ color: '#15803d', fontWeight: '800', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px' }}>
                                                            {assignedCount}명 배치됨
                                                        </span>
                                                        <span>•</span>
                                                        <span>{record.gridConfig?.rows || 5}행 {record.gridConfig?.cols || 6}열</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLoadRecord(record)}
                                                        style={{
                                                            background: '#16a34a',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '7px 14px',
                                                            borderRadius: '8px',
                                                            fontSize: '12.5px',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 1px 4px rgba(22, 163, 74, 0.2)'
                                                        }}
                                                    >
                                                        불러오기
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteHistory(record.id)}
                                                        style={{
                                                            background: '#ffffff',
                                                            color: '#ef4444',
                                                            border: '1px solid #fca5a5',
                                                            padding: '6px 10px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: '700',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="기록 삭제"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="seating-dialog-footer">
                            <button 
                                type="button"
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    color: '#475569',
                                    padding: '9px 18px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setShowLoadModal(false)}
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* A4 가로 전용 고해상도 인쇄 뷰 (window.print 실행 시 렌더링) */}
            {printMode && (
                <div className="seating-print-overlay">
                    <div className="seating-print-sheet">
                        <div className="print-sheet-header">
                            <h1 className="print-main-title">
                                {currentClass ? `${currentClass.grade || ''}학년 ${currentClass.classNumber || ''}반` : '우리 반'} 자리배치표
                                <span className="print-type-badge">
                                    {printMode === 'teacher' ? '교사용 (칠판 아래)' : '학생용 (칠판 위)'}
                                </span>
                            </h1>
                            <div className="print-date-info">
                                <span>인쇄일자: {new Date().toLocaleDateString('ko-KR')}</span>
                                <span>총원: {students?.length || 0}명</span>
                            </div>
                        </div>

                        {/* 칠판 영역 (학생용일 때는 위, 교사용일 때는 아래) */}
                        {printMode !== 'teacher' && (
                            <div className="print-blackboard top">
                                <span>칠 판 (앞 쪽)</span>
                            </div>
                        )}

                        <div className={`print-grid-container ${printMode === 'teacher' ? 'flipped' : ''}`}>
                            {(printMode === 'teacher' ? [...grid].reverse() : grid).map((row, rIdx) => {
                                const actualR = printMode === 'teacher' ? (grid.length - 1 - rIdx) : rIdx;
                                const cols = printMode === 'teacher' ? [...row].reverse() : row;

                                return (
                                    <div key={rIdx} className="print-grid-row">
                                        {cols.map((seat, cIdx) => {
                                            const actualC = printMode === 'teacher' ? (row.length - 1 - cIdx) : cIdx;
                                            const actualSeat = grid[actualR][actualC];
                                            const student = students?.find(s => s.id === actualSeat.studentId);
                                            const isBlocked = actualSeat.genderPreference === 'blocked';

                                            return (
                                                <div 
                                                    key={cIdx} 
                                                    className={`print-seat-box ${isBlocked ? 'blocked' : ''} ${student ? (student.gender === '남' ? 'male' : 'female') : 'empty'}`}
                                                >
                                                    {isBlocked ? (
                                                        <span className="print-blocked-text">통로</span>
                                                    ) : student ? (
                                                        <>
                                                            <span className="print-seat-num">{student.attendanceNumber}번</span>
                                                            <span className="print-seat-name">{student.name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="print-seat-empty">빈자리</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                        {/* 칠판 영역 (교사용일 때는 아래) */}
                        {printMode === 'teacher' && (
                            <div className="print-blackboard bottom">
                                <span>칠 판 / 교 탁 (교사 시점)</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* A4 가로 인쇄 & 실시간 미리보기 모달 */}
            <SeatingPrintModal 
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                currentClass={currentClass}
                students={students}
                grid={grid}
            />
        </div>
    );
};

export default SeatingChart;

