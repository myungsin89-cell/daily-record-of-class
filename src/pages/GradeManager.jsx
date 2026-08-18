import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useStudentContext } from '../context/StudentContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import { ELEMENTARY_CURRICULUM, generateNeisComment } from '../data/elementaryCurriculumData';
import { exportElementToA4Pdf } from '../utils/pdfExport';
import './GradeManager.css';

const DEFAULT_TEMPLATES = [
    { id: 'template_3_level_shape', name: '수행평가 척도 (◎/◯/△)', evaluationType: 'steps', levels: 3, labels: ['◎', '◯', '△'] },
    { id: 'template_3_level_text', name: '3단계 (상/중/하)', evaluationType: 'steps', levels: 3, labels: ['상', '중', '하'] },
    { id: 'template_score_100', name: '점수제 (100점 만점)', evaluationType: 'score', maxScore: 100, levels: 0, labels: [] },
    { id: 'template_5_level_korean', name: '5단계 (매우우수~매우미흡)', evaluationType: 'steps', levels: 5, labels: ['매우우수', '우수', '보통', '미흡', '매우미흡'] }
];

const COLS_PER_PAGE = 5;

const GradeManager = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { students } = useStudentContext();
    const { updateSaveStatus } = useSaveStatus();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

    // ── 데이터 상태 ──
    const [groups, setGroups] = useState([]);
    const [evalCards, setEvalCards] = useState([]);
    const [scores, setScores] = useState({});
    const [criteriaTemplates] = useState([...DEFAULT_TEMPLATES]);

    // ── UI 상태 ──
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const [activeCardId, setActiveCardId] = useState(null);
    const [colPage, setColPage] = useState(0);
    const [viewMode, setViewMode] = useState('area'); // 'area' or 'student'
    const [studentReportTab, setStudentReportTab] = useState('performance'); // 'performance' or 'general'
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    // ── 모달 상태 ──
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [showAddCardModal, setShowAddCardModal] = useState(false);
    const [cardAddTab, setCardAddTab] = useState('unit'); // 'unit' | 'general' | 'performance'
    
    // 단원평가 state
    const [unitCardName, setUnitCardName] = useState('');
    const [unitCardGroupId, setUnitCardGroupId] = useState('');
    const [unitCardCriteriaId, setUnitCardCriteriaId] = useState('template_score_100'); // 기본 점수제

    // 일반평가 state
    const [generalCardName, setGeneralCardName] = useState('');
    const [generalCardGroupId, setGeneralCardGroupId] = useState('');
    const [generalCardCriteriaId, setGeneralCardCriteriaId] = useState('template_3_level_text'); // 기본 상/중/하

    // ── 학급 학년군 자동 감지 (1-2 / 3-4 / 5-6) ──
    const classGradeBand = useMemo(() => {
        let gradeNum = Number(currentClass?.grade);
        if (isNaN(gradeNum) || !gradeNum) {
            const match = currentClass?.name?.match(/(\d+)학년/);
            if (match) gradeNum = Number(match[1]);
        }
        if (gradeNum === 1 || gradeNum === 2) return '1-2';
        if (gradeNum === 5 || gradeNum === 6) return '5-6';
        return '3-4'; // 기본값 3~4학년군
    }, [currentClass]);

    // ── 학기(1학기 / 2학기) 선택 상태 (localStorage 저장 및 유지) ──
    const [selectedSemester, setSelectedSemester] = useState(() => {
        if (classId) {
            const savedSem = localStorage.getItem(`grade_semester_${classId}`);
            if (savedSem === '1' || savedSem === '2') return Number(savedSem);
        }
        const m = new Date().getMonth() + 1;
        return (m >= 3 && m <= 8) ? 1 : 2;
    });

    const handleSelectSemester = (sem) => {
        setSelectedSemester(sem);
        if (classId) {
            localStorage.setItem(`grade_semester_${classId}`, String(sem));
        }
    };

    // 수행평가 전용 state
    const [newCardGroupId, setNewCardGroupId] = useState('');
    const [perfSubject, setPerfSubject] = useState('국어');
    const [perfDomain, setPerfDomain] = useState('');
    const [perfUnitName, setPerfUnitName] = useState(''); // 선생님 직접 작성 단원명
    const [perfEvalElement, setPerfEvalElement] = useState(''); // 직접 작성 평가요소
    const [perfSchedule, setPerfSchedule] = useState(''); // 예정 시기 (선택)
    const [perfEnableAlarm, setPerfEnableAlarm] = useState(false); // 알림 설정 여부 (선택)

    const [showAddColModal, setShowAddColModal] = useState(false);
    const [newColName, setNewColName] = useState('');
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);

    // ── 카드 점 3개(⋮) 드롭다운 & 카드 수정 모달 상태 ──
    const [cardMenuOpenId, setCardMenuOpenId] = useState(null);
    const [showEditCardModal, setShowEditCardModal] = useState(false);
    const [editingCard, setEditingCard] = useState(null);

    // ── 수행평가 상단 인라인 수정 상태 ──
    const [isEditingInlineElement, setIsEditingInlineElement] = useState(false);
    const [inlineElementText, setInlineElementText] = useState('');
    const [showSchedulePickerPopover, setShowSchedulePickerPopover] = useState(false);

    // 빠른 채점용 선택된 행 및 컬럼 인덱스
    const [activeRowIdx, setActiveRowIdx] = useState(null);
    const [activeColIdx, setActiveColIdx] = useState(0);

    // 다중 선택된 학생 ID 목록
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);

    // 복사 성공 토스트 안내 state
    const [toastMessage, setToastMessage] = useState('');

    // ── 형광펜(Highlighter) 상태 ──
    const [cardHighlights, setCardHighlights] = useState({}); // { [cardId]: { [colId]: { [studentId]: color } } }
    const [autoHighlightConfig, setAutoHighlightConfig] = useState({}); // { [cardId]: { enabled, threshold, color, levelThreshold } }
    const [showHighlightPopover, setShowHighlightPopover] = useState(false);
    const [selectedPenColor, setSelectedPenColor] = useState('yellow'); // 'yellow' | 'pink' | 'green' | 'blue'

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 2500);
    };

    const tableRef = useRef(null);

    const [onboardCreateUnit, setOnboardCreateUnit] = useState(true);
    const [onboardCreatePerformance, setOnboardCreatePerformance] = useState(true);

    // ── 기본 교과목 스마트 일괄 생성 (기존 과목 중복 제외) ──
    const handleCreateDefaultGroups = () => {
        const defaults = ['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과'];
        const existingNames = groups.map(g => g.name.trim());
        
        // 이미 존재하는 과목 제외
        const missingSubjects = defaults.filter(name => !existingNames.includes(name));

        if (missingSubjects.length === 0) {
            showToast('이미 모든 기본 교과목(국어, 수학 등)이 등록되어 있습니다.');
            return;
        }

        const now = Date.now();
        const newGroups = missingSubjects.map((name, idx) => ({
            id: `grp_${now}_${idx}`,
            name
        }));

        setGroups(prev => [...prev, ...newGroups]);
        showToast(`${missingSubjects.join(', ')} 과목이 추가되었습니다.`);
    };

    // ── 초기 데이터 로드 ──
    useEffect(() => {
        const storageKey = `grade_v4_${classId}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setGroups(parsed.groups || []);
                setEvalCards(parsed.evalCards || []);
                setScores(parsed.scores || {});
                setCardHighlights(parsed.cardHighlights || {});
                setAutoHighlightConfig(parsed.autoHighlightConfig || {});
                const savedSem = localStorage.getItem(`grade_semester_${classId}`);
                if (savedSem === '1' || savedSem === '2') {
                    setSelectedSemester(Number(savedSem));
                }
            } catch (e) {
                console.error('성적 데이터 로드 실패:', e);
            }
        }
    }, [classId]);

    // ── 데이터 저장 ──
    useEffect(() => {
        const storageKey = `grade_v4_${classId}`;
        const data = { groups, evalCards, scores, cardHighlights, autoHighlightConfig };
        localStorage.setItem(storageKey, JSON.stringify(data));
        updateSaveStatus();
    }, [groups, evalCards, scores, cardHighlights, autoHighlightConfig, classId, updateSaveStatus]);

    // ── 파생 데이터 ──
    const sortedStudents = useMemo(() => {
        return [...(students || [])].sort((a, b) => Number(a.attendanceNumber) - Number(b.attendanceNumber));
    }, [students]);

    const activeCard = useMemo(() => {
        return evalCards.find(c => c.id === activeCardId) || null;
    }, [evalCards, activeCardId]);

    const activeCardGroup = useMemo(() => {
        if (!activeCard) return null;
        return groups.find(g => g.id === activeCard.groupId) || null;
    }, [activeCard, groups]);

    const activeCriteria = useMemo(() => {
        if (!activeCard) return DEFAULT_TEMPLATES[0];
        return criteriaTemplates.find(c => c.id === activeCard.criteriaId) || DEFAULT_TEMPLATES[0];
    }, [activeCard, criteriaTemplates]);

    // ── 페이징된 컬럼 ──
    const allColumns = activeCard?.columns || [];
    const totalPages = Math.max(1, Math.ceil(allColumns.length / COLS_PER_PAGE));
    const pagedColumns = allColumns.slice(colPage * COLS_PER_PAGE, (colPage + 1) * COLS_PER_PAGE);

    // 카드 전환 시 페이지 및 선택 상태 리셋
    useEffect(() => {
        setColPage(0);
        setActiveRowIdx(null);
        setActiveColIdx(0);
        setSelectedStudentIds([]);
    }, [activeCardId]);

    // 학생별 보기 전환 시 기본 학생 선택
    useEffect(() => {
        if (viewMode === 'student' && sortedStudents.length > 0) {
            const hasSelected = sortedStudents.some(s => s.id === selectedStudentId);
            if (!hasSelected) {
                setSelectedStudentId(sortedStudents[0].id);
            }
        }
    }, [viewMode, sortedStudents, selectedStudentId]);

    // ── 커스텀 알림/확인 모달 상태 ──
    const [alertDialog, setAlertDialog] = useState({
        show: false,
        title: '알림',
        message: '',
        type: 'alert',
        onConfirm: null
    });

    const showAlert = (message, title = '알림') => {
        setAlertDialog({
            show: true,
            title,
            message,
            type: 'alert',
            onConfirm: null
        });
    };

    const showConfirm = (message, onConfirm, title = '확인') => {
        setAlertDialog({
            show: true,
            title,
            message,
            type: 'confirm',
            onConfirm
        });
    };

    const closeAlertDialog = () => {
        setAlertDialog(prev => ({ ...prev, show: false }));
    };

    // ── 수행평가 전용 카드 생성 핸들러 (스마트 과목 자동 매칭 & 100% 무조건 안심 생성) ──
    const handleAddPerformanceCard = (e) => {
        e.preventDefault();
        
        let targetGroupId = newCardGroupId;
        let selectedGroup = groups.find(g => g.id === targetGroupId);
        if (!selectedGroup) {
            if (groups.length > 0) {
                selectedGroup = groups[0];
                targetGroupId = selectedGroup.id;
            } else {
                selectedGroup = { id: `group_${Date.now()}_auto`, name: perfSubject || '국어' };
                setGroups(prev => [...prev, selectedGroup]);
                targetGroupId = selectedGroup.id;
            }
        }
        const currentSubject = selectedGroup.name;

        const curriculumByGrade = ELEMENTARY_CURRICULUM[classGradeBand] || ELEMENTARY_CURRICULUM['3-4'];
        const subjects = curriculumByGrade[currentSubject] || {};
        const domains = Object.keys(subjects);
        const currentDomain = perfDomain || domains[0] || '영역';

        const customUnit = perfUnitName.trim() || '단원';
        const evalElem = perfEvalElement.trim() || `${currentSubject} ${currentDomain} 영역 성취기준을 충실히 수행할 수 있는가?`;

        // ── 알림 및 캘린더 날짜 스마트 파싱 ──
        let eventDate = new Date().toISOString().split('T')[0];
        const schedStr = perfSchedule ? perfSchedule.trim() : '';

        if (schedStr) {
            const now = new Date();
            const year = now.getFullYear();

            // 1. YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(schedStr)) {
                eventDate = schedStr;
            } 
            // 2. M월 D일 or M/D
            else if (/(\d{1,2})[월/.]\s*(\d{1,2})[일]?/.test(schedStr)) {
                const md = schedStr.match(/(\d{1,2})[월/.]\s*(\d{1,2})[일]?/);
                const m = String(parseInt(md[1], 10)).padStart(2, '0');
                const d = String(parseInt(md[2], 10)).padStart(2, '0');
                eventDate = `${year}-${m}-${d}`;
            }
            // 3. M월 W주차
            else if (/(\d{1,2})월\s*(\d{1,2})주/.test(schedStr)) {
                const mw = schedStr.match(/(\d{1,2})월\s*(\d{1,2})주/);
                const m = parseInt(mw[1], 10);
                const w = parseInt(mw[2], 10);
                const calcDay = Math.min(28, (w - 1) * 7 + 3);
                eventDate = `${year}-${String(m).padStart(2, '0')}-${String(calcDay).padStart(2, '0')}`;
            }
            // 4. M월 말 or M월
            else if (/(\d{1,2})월/.test(schedStr)) {
                const mMatch = schedStr.match(/(\d{1,2})월/);
                const m = parseInt(mMatch[1], 10);
                const calcDay = schedStr.includes('말') ? '25' : '15';
                eventDate = `${year}-${String(m).padStart(2, '0')}-${calcDay}`;
            }
        }

        const newCard = {
            id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            groupId: targetGroupId,
            name: `${currentDomain} - ${customUnit}`,
            unit: customUnit,
            domain: currentDomain,
            evalElement: evalElem,
            templateId: 'template_3_level_shape',
            isPerformance: true, // 수행평가 플래그
            evalType: 'performance',
            semester: selectedSemester,
            scheduleText: schedStr,
            scheduleDate: eventDate,
            hasAlarm: perfEnableAlarm,
            columns: [
                {
                    id: `col_perf_${Date.now()}`,
                    name: customUnit || '수행평가',
                    date: eventDate
                }
            ]
        };

        setEvalCards(prev => [...prev, newCard]);
        setActiveCardId(newCard.id); // 생성이 완료되면 해당 카드 명렬표 입력 화면으로 바로 직행!

        // ── 대시보드 캘린더 / 오늘의 할일(dailyTodos) 자동 등록 ──
        if (perfEnableAlarm || schedStr) {
            try {
                const todoItem = {
                    id: `perf_todo_${Date.now()}`,
                    text: `[수행평가] ${currentSubject} - ${customUnit} (${currentDomain})`,
                    completed: false,
                    style: {
                        color: '#15803d',
                        isBold: true
                    }
                };

                const targetKeys = new Set([classId, rawClassId, 'default']);
                targetKeys.forEach(k => {
                    const storageKey = `dailyTodos_${k}`;
                    try {
                        const raw = localStorage.getItem(storageKey);
                        const existing = raw ? JSON.parse(raw) : {};
                        const dayList = existing[eventDate] || [];
                        if (!dayList.some(it => it.text.includes(`[수행평가] ${currentSubject} - ${customUnit}`))) {
                            existing[eventDate] = [...dayList, todoItem];
                            localStorage.setItem(storageKey, JSON.stringify(existing));
                        }
                    } catch (e) {
                        console.error('dailyTodos sync error for key:', storageKey, e);
                    }
                });
            } catch (err) {
                console.error('Failed to sync performance alarm:', err);
            }
        }

        setPerfUnitName('');
        setPerfEvalElement('');
        setPerfSchedule('');
        setPerfEnableAlarm(false);
        setShowAddCardModal(false);
        showToast(`수행평가 [${currentSubject} - ${customUnit}]이(가) 등록되고 대시보드 캘린더 알림이 연동되었습니다.`);
    };

    // ── 카드 수정 모달 열기 ──
    const handleOpenEditCard = (e, card) => {
        e.stopPropagation();
        setCardMenuOpenId(null);
        setEditingCard({
            ...card,
            name: card.unit || card.name || '',
            domain: card.domain || '',
            evalElement: card.evalElement || '',
            scheduleText: card.scheduleText || card.schedule || '',
            scheduleDate: card.scheduleDate || card.columns?.[0]?.date || new Date().toISOString().split('T')[0],
            hasAlarm: !!card.hasAlarm
        });
        setShowEditCardModal(true);
    };

    // ── 카드 수정 모달 저장 ──
    const handleSaveCardFullEdit = (e) => {
        e.preventDefault();
        if (!editingCard) return;

        const schedStr = editingCard.scheduleText ? editingCard.scheduleText.trim() : '';
        let eventDate = editingCard.scheduleDate || new Date().toISOString().split('T')[0];

        if (schedStr) {
            const now = new Date();
            const year = now.getFullYear();
            if (/^\d{4}-\d{2}-\d{2}$/.test(schedStr)) {
                eventDate = schedStr;
            } else if (/(\d{1,2})[월/.]\s*(\d{1,2})[일]?/.test(schedStr)) {
                const md = schedStr.match(/(\d{1,2})[월/.]\s*(\d{1,2})[일]?/);
                const m = String(parseInt(md[1], 10)).padStart(2, '0');
                const d = String(parseInt(md[2], 10)).padStart(2, '0');
                eventDate = `${year}-${m}-${d}`;
            } else if (/(\d{1,2})월\s*(\d{1,2})주/.test(schedStr)) {
                const mw = schedStr.match(/(\d{1,2})월\s*(\d{1,2})주/);
                const m = parseInt(mw[1], 10);
                const w = parseInt(mw[2], 10);
                const calcDay = Math.min(28, (w - 1) * 7 + 3);
                eventDate = `${year}-${String(m).padStart(2, '0')}-${String(calcDay).padStart(2, '0')}`;
            } else if (/(\d{1,2})월/.test(schedStr)) {
                const mMatch = schedStr.match(/(\d{1,2})월/);
                const m = parseInt(mMatch[1], 10);
                const calcDay = schedStr.includes('말') ? '25' : '15';
                eventDate = `${year}-${String(m).padStart(2, '0')}-${calcDay}`;
            }
        }

        const customUnit = editingCard.name?.trim() || editingCard.unit || '평가';

        setEvalCards(prev => prev.map(c => {
            if (c.id !== editingCard.id) return c;
            return {
                ...c,
                name: c.isPerformance ? `${editingCard.domain || c.domain || ''} - ${customUnit}` : customUnit,
                unit: customUnit,
                domain: editingCard.domain || c.domain,
                evalElement: editingCard.evalElement || c.evalElement,
                scheduleText: schedStr,
                scheduleDate: eventDate,
                schedule: schedStr,
                hasAlarm: editingCard.hasAlarm,
                columns: c.columns?.map((col, idx) => idx === 0 ? { ...col, name: customUnit, date: eventDate } : col)
            };
        }));

        // 대시보드 캘린더 동기화
        if (editingCard.hasAlarm || schedStr) {
            const groupObj = groups.find(g => g.id === editingCard.groupId);
            const subjName = groupObj?.name || editingCard.subject || '수행평가';
            const todoItem = {
                id: `perf_todo_${editingCard.id}`,
                text: `[수행평가] ${subjName} - ${customUnit} (${editingCard.domain || ''})`,
                completed: false,
                style: { color: '#15803d', isBold: true }
            };
            const targetKeys = new Set([classId, rawClassId, 'default']);
            targetKeys.forEach(k => {
                const storageKey = `dailyTodos_${k}`;
                try {
                    const raw = localStorage.getItem(storageKey);
                    const existing = raw ? JSON.parse(raw) : {};
                    const dayList = existing[eventDate] || [];
                    if (!dayList.some(it => it.text.includes(`[수행평가] ${subjName} - ${customUnit}`))) {
                        existing[eventDate] = [...dayList, todoItem];
                        localStorage.setItem(storageKey, JSON.stringify(existing));
                    }
                } catch (e) {
                    console.error('dailyTodos update error:', e);
                }
            });
        }

        setShowEditCardModal(false);
        setEditingCard(null);
        showToast('수행평가 정보가 성공적으로 수정되었습니다.');
    };

    // ── 명렬표 상단 빠른 예정 시기 변경 ──
    const handleQuickUpdateSchedule = (cardId, newDate, newText) => {
        setEvalCards(prev => prev.map(c => {
            if (c.id !== cardId) return c;
            return {
                ...c,
                scheduleText: newText,
                schedule: newText,
                scheduleDate: newDate,
                columns: c.columns?.map((col, idx) => idx === 0 ? { ...col, date: newDate } : col)
            };
        }));
        setShowSchedulePickerPopover(false);
        showToast(`예정 시기가 [${newText}] (으)로 변경되었습니다.`);
    };

    // ── 명렬표 상단 빠른 평가요소 인라인 저장 ──
    const handleSaveInlineElement = (cardId) => {
        if (!inlineElementText.trim()) {
            setIsEditingInlineElement(false);
            return;
        }
        setEvalCards(prev => prev.map(c => {
            if (c.id !== cardId) return c;
            return { ...c, evalElement: inlineElementText.trim() };
        }));
        setIsEditingInlineElement(false);
        showToast('평가 요소가 수정되었습니다.');
    };

    // ── 나이스(NEIS) 평어 클립보드 1클릭 복사 ──
    const handleCopyNeisComment = (text, studentName) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast(`📋 [${studentName}] 학생의 나이스 평어가 클립보드에 복사되었습니다!`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showAlert('클립보드 복사에 실패했습니다.', '오류');
        });
    };

    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // ── 성적 분석 리포트 고해상도 A4 PDF 다이렉트 다운로드 (흰 화면 원천 해결) ──
    const handleDownloadReportPdf = async () => {
        const modalEl = document.querySelector('.grade-analysis-modal');
        if (!modalEl) return;

        const fileName = `${selectedStudent?.name || '학생'}_성적분석리포트`;
        try {
            setIsExportingPdf(true);
            await exportElementToA4Pdf(modalEl, fileName);
            showAlert(`${fileName}.pdf 파일이 정상적으로 다운로드되었습니다.`, 'PDF 저장 완료', '확인', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            showAlert('PDF 파일 생성 중 오류가 발생했습니다. 다시 시도해 주세요.', '오류');
        } finally {
            setIsExportingPdf(false);
        }
    };

    // ── 과목 추가 핸들러 ──
    const handleAddGroup = (e) => {
        e.preventDefault();
        const trimmed = newGroupName.trim();
        if (!trimmed) return;
        const newGrp = { id: `grp_${Date.now()}`, name: trimmed };
        setGroups(prev => [...prev, newGrp]);
        setNewGroupName('');
        setShowAddGroupModal(false);
        showToast(`과목 [${trimmed}]이(가) 추가되었습니다.`);
    };

    // ── 과목 및 하위 카드 일괄 제거 헬퍼 ──
    const removeGroupAndCards = (groupId, subjectName) => {
        const deletedCardIds = evalCards.filter(c => c.groupId === groupId).map(c => c.id);

        if (activeCardId && deletedCardIds.includes(activeCardId)) {
            setActiveCardId(null);
        }

        setGroups(prev => prev.filter(g => g.id !== groupId));
        setEvalCards(prev => prev.filter(c => c.groupId !== groupId));
        setScores(prev => {
            const next = { ...prev };
            deletedCardIds.forEach(cId => { delete next[cId]; });
            return next;
        });

        showToast(`[${subjectName}] 과목이 비활성화되었습니다.`);
    };

    // ── 과목 삭제 핸들러 (안전 가드 처리) ──
    const handleDeleteGroup = (e, groupId) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const grp = groups.find(g => g.id === groupId);
        const subjectName = grp ? grp.name : '해당 과목';

        showConfirm(`[${subjectName}] 과목과 포함된 모든 평가 카드를 삭제하시겠습니까?`, () => {
            removeGroupAndCards(groupId, subjectName);
        }, '과목 삭제');
    };

    const toggleGroup = (groupId) => {
        setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    // ── 단원평가 카드 생성 핸들러 (기본 5개 단원: 1단원~5단원 자동 생성) ──
    const handleAddUnitCard = (e) => {
        e.preventDefault();
        let targetGroupId = unitCardGroupId;
        if (!targetGroupId) {
            if (groups.length > 0) {
                targetGroupId = groups[0].id;
            } else {
                const autoGrp = { id: `grp_${Date.now()}`, name: '일반' };
                setGroups(prev => [...prev, autoGrp]);
                targetGroupId = autoGrp.id;
            }
        }

        const trimmed = (unitCardName || '').trim() || '단원평가';

        // 1단원 ~ 5단원 (5개 기본 단원 구성)
        const defaultCols = [
            { id: `col_${Date.now()}_unit_1`, name: '1단원' },
            { id: `col_${Date.now()}_unit_2`, name: '2단원' },
            { id: `col_${Date.now()}_unit_3`, name: '3단원' },
            { id: `col_${Date.now()}_unit_4`, name: '4단원' },
            { id: `col_${Date.now()}_unit_5`, name: '5단원' }
        ];

        const newCard = {
            id: `eval_unit_${Date.now()}`,
            groupId: targetGroupId,
            name: trimmed,
            evalType: 'unit',
            semester: selectedSemester,
            criteriaId: unitCardCriteriaId || 'template_score_100',
            columns: defaultCols
        };
        setEvalCards(prev => [...prev, newCard]);
        setActiveCardId(newCard.id); // 명렬표 채점 화면으로 즉시 직행!
        setUnitCardName('');
        setShowAddCardModal(false);
        showToast(`단원평가 [${trimmed}]이(가) 5개 단원으로 생성되었습니다.`);
    };

    // ── 예시(샘플) 데이터 자동 생성 핸들러 (사용자 로컬 전용) ──
    const handleGenerateSampleData = () => {
        if (!students || students.length === 0) {
            showAlert('학급에 등록된 학생이 없습니다. 먼저 학생을 등록해 주세요.', '알림');
            return;
        }

        showConfirm('활성화된 교과목에 단원평가(100점 만점)와 수행평가(◎/◯/△) 예시 평가 및 점수를 로컬에 생성하시겠습니까?', () => {
            let targetGroups = groups;
            // 만약 등록된 과목이 하나도 없으면 기본 5개 교과 자동 생성
            if (targetGroups.length === 0) {
                targetGroups = [
                    { id: `grp_ko_${Date.now()}`, name: '국어' },
                    { id: `grp_ma_${Date.now()}`, name: '수학' },
                    { id: `grp_so_${Date.now()}`, name: '사회' },
                    { id: `grp_sc_${Date.now()}`, name: '과학' },
                    { id: `grp_en_${Date.now()}`, name: '영어' }
                ];
                setGroups(targetGroups);
            }

            const newCards = [];
            const newScores = { ...scores };

            targetGroups.forEach((group, gIdx) => {
                const subName = group.name;
                const baseTime = Date.now() + gIdx * 1000;

                // 1. 단원평가 카드 (100점 만점, 1~5단원)
                const unitCardId = `eval_unit_${baseTime}_${Math.random().toString(36).substr(2, 4)}`;
                const unitCols = [1, 2, 3, 4, 5].map(num => ({
                    id: `col_${baseTime}_u${num}`,
                    name: `${num}단원`
                }));

                const unitCard = {
                    id: unitCardId,
                    groupId: group.id,
                    name: `${subName} 단원평가`,
                    evalType: 'unit',
                    isPerformance: false,
                    semester: selectedSemester,
                    criteriaId: 'template_score_100', // 100점 만점
                    columns: unitCols
                };
                newCards.push(unitCard);

                // 단원평가 점수 생성 (60~100점 사이 현실적인 분포)
                newScores[unitCardId] = newScores[unitCardId] || {};
                unitCols.forEach((col, cIdx) => {
                    newScores[unitCardId][col.id] = newScores[unitCardId][col.id] || {};
                    students.forEach((student, sIdx) => {
                        const baseScore = 70 + ((sIdx * 7 + cIdx * 5) % 28);
                        const finalScore = Math.min(100, Math.max(55, baseScore + ((sIdx + cIdx) % 3 === 0 ? 5 : -5)));
                        newScores[unitCardId][col.id][student.id] = finalScore;
                    });
                });

                // 2. 수행평가 카드 1 (과정중심 ◎/◯/△)
                const curLvlMap = ELEMENTARY_CURRICULUM[classGradeBand]?.[subName] || ELEMENTARY_CURRICULUM['3-4']?.[subName] || {};
                const domains = Object.keys(curLvlMap);
                const domain1 = domains[0] || '기본 영역';
                const unitItem1 = curLvlMap[domain1]?.[0] || { unit: `${subName} 기초 탐구`, element: `${subName} 핵심 성취기준을 충실히 수행할 수 있는가?` };

                const perfCardId1 = `eval_perf_${baseTime + 10}_${Math.random().toString(36).substr(2, 4)}`;
                const perfCard1 = {
                    id: perfCardId1,
                    groupId: group.id,
                    name: unitItem1.unit,
                    evalType: 'performance',
                    isPerformance: true,
                    semester: selectedSemester,
                    gradeLevel: classGradeBand,
                    subject: subName,
                    domain: domain1,
                    unit: unitItem1.unit,
                    evalElement: unitItem1.element,
                    schedule: `${4 + (gIdx % 6)}월 ${(gIdx % 4) + 1}주차`,
                    enableAlarm: false,
                    criteriaId: 'template_3_level_shape', // ◎/◯/△ (3: ◎, 2: ◯, 1: △)
                    columns: [{ id: `col_${baseTime + 10}_perf`, name: unitItem1.unit }]
                };
                newCards.push(perfCard1);

                // 수행평가 1 점수 및 비고 생성
                newScores[perfCardId1] = newScores[perfCardId1] || {};
                newScores[perfCardId1][perfCard1.columns[0].id] = {};
                newScores[perfCardId1]['remarks'] = {};
                students.forEach((student, sIdx) => {
                    const stepVal = (sIdx % 7 === 0) ? 1 : ((sIdx % 4 === 0) ? 2 : 3);
                    newScores[perfCardId1][perfCard1.columns[0].id][student.id] = stepVal;
                    if (stepVal === 3 && sIdx % 3 === 0) {
                        newScores[perfCardId1]['remarks'][student.id] = `${unitItem1.unit} 활동에 매우 적극적으로 참여하고 성취기준을 훌륭히 도달함.`;
                    }
                });

                // 3. 수행평가 카드 2 (두 번째 영역)
                if (domains.length > 1 || (curLvlMap[domain1] && curLvlMap[domain1].length > 1)) {
                    const domain2 = domains[1] || domain1;
                    const unitItem2 = curLvlMap[domain2]?.[1] || curLvlMap[domain2]?.[0] || { unit: `${subName} 심화 적용`, element: `${subName} 실생활 문제해결 능력을 갖추고 있는가?` };
                    const perfCardId2 = `eval_perf_${baseTime + 20}_${Math.random().toString(36).substr(2, 4)}`;
                    const perfCard2 = {
                        id: perfCardId2,
                        groupId: group.id,
                        name: unitItem2.unit,
                        evalType: 'performance',
                        isPerformance: true,
                        gradeLevel: classGradeBand,
                        subject: subName,
                        domain: domain2,
                        unit: unitItem2.unit,
                        evalElement: unitItem2.element,
                        schedule: `${9 + (gIdx % 3)}월 ${(gIdx % 3) + 2}주차`,
                        enableAlarm: false,
                        criteriaId: 'template_3_level_shape',
                        columns: [{ id: `col_${baseTime + 20}_perf`, name: unitItem2.unit }]
                    };
                    newCards.push(perfCard2);

                    newScores[perfCardId2] = newScores[perfCardId2] || {};
                    newScores[perfCardId2][perfCard2.columns[0].id] = {};
                    newScores[perfCardId2]['remarks'] = {};
                    students.forEach((student, sIdx) => {
                        const stepVal = (sIdx % 8 === 0) ? 1 : ((sIdx % 5 === 0) ? 2 : 3);
                        newScores[perfCardId2][perfCard2.columns[0].id][student.id] = stepVal;
                    });
                }
            });

            setEvalCards(prev => [...prev, ...newCards]);
            setScores(newScores);
            showToast('🎉 로컬 예시 자료(단원평가 100점 만점 & 수행평가 상중하)가 성공적으로 생성되었습니다!');
        }, '예시 데이터 생성');
    };

    // ── 일반평가 카드 생성 핸들러 (기본 5회차 자동 생성) ──
    const handleAddGeneralCard = (e) => {
        e.preventDefault();
        const trimmed = generalCardName.trim();
        let targetGroupId = generalCardGroupId;
        if (!targetGroupId) {
            if (groups.length > 0) {
                targetGroupId = groups[0].id;
            } else {
                const autoGrp = { id: `grp_${Date.now()}`, name: '일반' };
                setGroups(prev => [...prev, autoGrp]);
                targetGroupId = autoGrp.id;
            }
        }
        if (!trimmed) {
            showToast('평가 이름을 입력해 주세요.');
            return;
        }

        const defaultCols = Array.from({ length: 5 }, (_, i) => ({
            id: `col_${Date.now()}_gen_${i + 1}`,
            name: `${i + 1}회차`
        }));

        const newCard = {
            id: `eval_gen_${Date.now()}`,
            groupId: targetGroupId,
            name: trimmed,
            evalType: 'general',
            semester: selectedSemester,
            criteriaId: generalCardCriteriaId || 'template_3_level_text',
            columns: defaultCols
        };
        setEvalCards(prev => [...prev, newCard]);
        setGeneralCardName('');
        setShowAddCardModal(false);
        showToast(`일반평가 [${trimmed}]이(가) 추가되었습니다.`);
    };

    // ── 평가 카드 삭제 핸들러 (안전 가드 처리) ──
    const handleDeleteCard = (e, cardId) => {
        e.stopPropagation();
        const card = evalCards.find(c => c.id === cardId);
        const cardName = card ? card.name : '해당 평가 카드';

        showConfirm(`[${cardName}] 평가 카드를 삭제하시겠습니까?`, () => {
            if (activeCardId === cardId) {
                setActiveCardId(null);
            }

            setEvalCards(prev => prev.filter(c => c.id !== cardId));
            setScores(prev => {
                const next = { ...prev };
                delete next[cardId];
                return next;
            });

            showToast(`[${cardName}] 평가 카드가 삭제되었습니다.`);
        }, '평가 카드 삭제');
    };

    // ── 회차(컬럼) 이름 인라인 수정 ──
    const handleUpdateColumnName = (colId, newName) => {
        setEvalCards(prev => prev.map(card => {
            if (card.id !== activeCardId) return card;
            return {
                ...card,
                columns: card.columns.map(col => col.id === colId ? { ...col, name: newName } : col)
            };
        }));
    };

    // ── 단원/회차 개별 삭제 핸들러 (✕ 버튼 클릭) ──
    const handleDeleteColumn = (colId) => {
        if (!activeCardId || !activeCard) return;
        if (activeCard.columns.length <= 1) {
            showAlert('최소 1개 이상의 단원이 필요합니다.', '알림');
            return;
        }
        showConfirm('해당 단원(회차)과 입력된 점수를 삭제하시겠습니까?', () => {
            setEvalCards(prev => prev.map(card => {
                if (card.id !== activeCardId) return card;
                return {
                    ...card,
                    columns: card.columns.filter(c => c.id !== colId)
                };
            }));
            setScores(prev => {
                const cardGrades = { ...(prev[activeCardId] || {}) };
                delete cardGrades[colId];
                return { ...prev, [activeCardId]: cardGrades };
            });
            showToast('단원이 삭제되었습니다.');
        }, '단원 삭제');
    };

    // ── 5개 회차/단원 세트 추가 (다음 페이지 생성) ──
    const handleAddColumnSet = () => {
        if (!activeCardId || !activeCard) return;
        const currentCount = activeCard.columns?.length || 0;
        const isUnitType = activeCard.evalType === 'unit' || activeCard.name?.includes('단원');
        const unitLabel = isUnitType ? '단원' : '회차';
        const newCols = Array.from({ length: 5 }, (_, i) => ({
            id: `col_${Date.now()}_${currentCount + i + 1}`,
            name: `${currentCount + i + 1}${unitLabel}`
        }));

        setEvalCards(prev => prev.map(card =>
            card.id === activeCardId
                ? { ...card, columns: [...card.columns, ...newCols] }
                : card
        ));

        // 생성 직후 새로 생성된 페이지로 이동
        const newTotalPages = Math.ceil((currentCount + 5) / COLS_PER_PAGE);
        setColPage(newTotalPages - 1);
    };

    // ── 수동 형광펜 토글 (더블클릭 또는 우클릭) ──
    const handleToggleCellHighlight = (e, colId, studentId) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!activeCardId) return;

        const currentColor = cardHighlights[activeCardId]?.[colId]?.[studentId];
        const newColor = currentColor ? null : (selectedPenColor || 'yellow');

        setCardHighlights(prev => {
            const cardHl = { ...(prev[activeCardId] || {}) };
            const colHl = { ...(cardHl[colId] || {}) };
            if (newColor) {
                colHl[studentId] = newColor;
            } else {
                delete colHl[studentId];
            }
            cardHl[colId] = colHl;
            return { ...prev, [activeCardId]: cardHl };
        });
    };

    // ── 셀 형광펜 색상 계산 (수동 형광펜 + 기준점수 자동 필터) ──
    const isCellHighlighted = (cardId, colId, studentId, scoreValue) => {
        // 1. 직접 칠한 수동 형광펜 우선 적용
        const manualColor = cardHighlights[cardId]?.[colId]?.[studentId];
        if (manualColor) return manualColor;

        // 2. 기준점수 자동 필터 형광펜
        const config = autoHighlightConfig[cardId];
        if (config?.enabled && scoreValue !== undefined && scoreValue !== null && scoreValue !== '') {
            const isScore = activeCriteria.evaluationType === 'score';
            if (isScore) {
                const numVal = Number(scoreValue);
                if (!isNaN(numVal) && numVal <= (config.threshold ?? 70)) {
                    return config.color || 'yellow';
                }
            } else {
                const targetLvl = config.levelThreshold || '하';
                if (String(scoreValue) === targetLvl || (targetLvl === '하' && (scoreValue === 1 || scoreValue === '1' || scoreValue === '하' || scoreValue === '노력요함'))) {
                    return config.color || 'yellow';
                }
            }
        }
        return null;
    };

    // ── 성적 입력 핸들러 (특정 카드 ID 지정) ──
    const handleScoreChangeForCard = (cardId, colId, studentId, value) => {
        setScores(prev => {
            const cardScores = prev[cardId] || {};
            const colScores = cardScores[colId] || {};
            return {
                ...prev,
                [cardId]: {
                    ...cardScores,
                    [colId]: { ...colScores, [studentId]: value }
                }
            };
        });
    };

    // ── 성적 입력 핸들러 (활성 카드 기준, 테이블용 토글 동작 유지) ──
    const handleScoreChange = (colId, studentId, value) => {
        if (!activeCardId) return;
        setScores(prev => {
            const cardScores = prev[activeCardId] || {};
            const colScores = cardScores[colId] || {};
            const currentVal = colScores[studentId];
            const nextVal = currentVal === value ? undefined : value;
            return {
                ...prev,
                [activeCardId]: {
                    ...cardScores,
                    [colId]: { ...colScores, [studentId]: nextVal }
                }
            };
        });
    };

    // ── 체크박스 다중 선택 제어 ──
    const handleToggleSelectStudent = (studentId) => {
        setSelectedStudentIds(prev => 
            prev.includes(studentId) 
                ? prev.filter(id => id !== studentId) 
                : [...prev, studentId]
        );
    };

    const handleToggleSelectAll = () => {
        if (selectedStudentIds.length === sortedStudents.length) {
            setSelectedStudentIds([]);
        } else {
            setSelectedStudentIds(sortedStudents.map(s => s.id));
        }
    };

    const handleClearSelection = () => {
        setSelectedStudentIds([]);
    };

    // ── 선택된 학생들에 대한 통합 일괄 점수 적용 ──
    const handleApplyScoreToSelected = (val) => {
        if (!activeCardId || pagedColumns.length === 0) return;
        
        if (selectedStudentIds.length === 0) {
            showToast('먼저 성적을 부여할 학생을 1명 이상 선택해 주세요.');
            return;
        }

        const targetColId = pagedColumns[0].id;
        setScores(prev => {
            const cardScores = prev[activeCardId] || {};
            const colScores = { ...(cardScores[targetColId] || {}) };

            selectedStudentIds.forEach(studentId => {
                colScores[studentId] = val;
            });

            return {
                ...prev,
                [activeCardId]: {
                    ...cardScores,
                    [targetColId]: colScores
                }
            };
        });

        const scoreLabel = val === 3 ? '◎ 매우잘함' : (val === 2 ? '◯ 잘함' : (val === 1 ? '△ 보통' : (val === 'UNRATED' ? '미평가' : '비우기')));
        showToast(`선택된 ${selectedStudentIds.length}명의 학생에게 [${scoreLabel}] 성적이 적용되었습니다!`);
    };

    // ── 수행평가 비고/관찰 메모 입력 ──
    const handleRemarkChange = (studentId, text) => {
        if (!activeCardId) return;
        setScores(prev => {
            const cardScores = prev[activeCardId] || {};
            const remarkScores = { ...(cardScores['remarks'] || {}) };
            remarkScores[studentId] = text;
            return {
                ...prev,
                [activeCardId]: {
                    ...cardScores,
                    remarks: remarkScores
                }
            };
        });
    };

    // ── 키보드 네비게이션 (점수제) ──
    const focusCell = useCallback((row, col) => {
        if (!tableRef.current) return;
        const el = tableRef.current.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (el) el.focus();
    }, []);

    const handleCellKeyDown = useCallback((e, row, col, totalRows, totalCols) => {
        let nextRow = row;
        let nextCol = col;

        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            nextRow = row + 1 < totalRows ? row + 1 : row;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nextRow = row - 1 >= 0 ? row - 1 : row;
        } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (col + 1 < totalCols) {
                nextCol = col + 1;
            } else if (row + 1 < totalRows) {
                nextRow = row + 1;
                nextCol = 0;
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (col - 1 >= 0) {
                nextCol = col - 1;
            } else if (row - 1 >= 0) {
                nextRow = row - 1;
                nextCol = totalCols - 1;
            }
        } else {
            return;
        }
        focusCell(nextRow, nextCol);
    }, [focusCell]);

    // ── 단계형 키보드: 선택 후 자동으로 다음 행으로 ──
    const handleStepSelect = useCallback((colId, studentId, val, rowIdx, colIdx, totalRows) => {
        handleScoreChange(colId, studentId, val);
        setTimeout(() => {
            if (rowIdx + 1 < totalRows) {
                focusCell(rowIdx + 1, colIdx);
            }
        }, 50);
    }, [focusCell]);

    // ── 평가 추가 모달 열 때 ──
    const openAddCardModal = (tab = 'unit') => {
        const firstGroupId = groups.length > 0 ? groups[0].id : '';
        setUnitCardGroupId(firstGroupId);
        setGeneralCardGroupId(firstGroupId);
        setNewCardGroupId(firstGroupId);
        const validTab = (typeof tab === 'string' && ['unit', 'general', 'performance'].includes(tab)) ? tab : 'unit';
        setCardAddTab(validTab);
        setShowAddCardModal(true);
    };

    // ── 학생별 성적 포맷팅 (리포트용, 완벽한 Null Guard 적용) ──
    const getFormattedScore = (card, col, studentId) => {
        if (!card || !col || !studentId) return null;
        const cardScores = scores[card.id] || {};
        const colScores = cardScores[col.id] || {};
        const currentVal = colScores[studentId];
        if (currentVal === undefined || currentVal === null || currentVal === '') return null;

        const criteria = criteriaTemplates.find(t => t.id === card.criteriaId) || DEFAULT_TEMPLATES[0];
        if (criteria.evaluationType === 'score') {
            return `${currentVal}점`;
        } else {
            if (currentVal === 'UNRATED') return '미평가';
            const labels = criteria.labels || ['상', '중', '하'];
            const labelIdx = labels.length - currentVal;
            return labels[labelIdx] || currentVal;
        }
    };

    const studentHasScoresForCard = (card, studentId) => {
        if (!card || !card.columns || !studentId) return false;
        return card.columns.some(col => {
            if (!col) return false;
            const val = scores[card.id]?.[col.id]?.[studentId];
            return val !== undefined && val !== null && val !== '';
        });
    };

    // ── 단계형 평균을 한글 라벨로 변환 ──
    const getStepAverageLabel = (average, templateId) => {
        if (average === null || isNaN(average)) return '-';
        const template = criteriaTemplates.find(t => t.id === templateId) || DEFAULT_TEMPLATES[0];
        const labels = template.labels || ['상', '중', '하'];
        const levels = labels.length;

        if (levels === 3) {
            if (average > 2.6) return labels[0]; // '상' 또는 '◎'
            if (average > 2.3) return `${labels[1]}-${labels[0]}`; // '중-상'
            if (average > 1.7) return labels[1]; // '중'
            if (average > 1.3) return `${labels[2]}-${labels[1]}`; // '하-중'
            return labels[2]; // '하'
        }
        
        // 5단계 등 기타 등급형은 가장 가까운 라벨 매핑
        const floatIndex = levels - average;
        const roundedIndex = Math.round(floatIndex);
        return labels[Math.max(0, Math.min(levels - 1, roundedIndex))];
    };

    // ── 대시보드 성적 통계 산출 함수 (선택된 학기 기준 단원평가 & 수행평가 분리 분석) ──
    const getGradeAnalysis = (studentId) => {
        if (!studentId) return null;

        const currentSemesterCards = evalCards.filter(c => (c.semester || 1) === selectedSemester);
        const unitCards = currentSemesterCards.filter(c => c.evalType === 'unit' || (!c.isPerformance && c.name?.includes('단원')));
        const perfCards = currentSemesterCards.filter(c => c.isPerformance || c.evalType === 'performance');

        // 1. 단원평가 기반 학생별/과목별 점수 산출
        const getStudentSubjectScore = (sId, groupId) => {
            const cardsInSubject = unitCards.filter(c => c.groupId === groupId);
            let sum = 0;
            let count = 0;
            cardsInSubject.forEach(card => {
                card.columns.forEach(col => {
                    const raw = scores[card.id]?.[col.id]?.[sId];
                    if (raw !== undefined && raw !== '' && raw !== 'UNRATED') {
                        const num = parseFloat(raw);
                        if (!isNaN(num)) {
                            sum += num;
                            count++;
                        }
                    }
                });
            });
            return count > 0 ? sum / count : null;
        };

        // 절대평가 5단계 성취도 환산 헬퍼 (90점+ 최우수, 80점+ 우수, 70점+ 양호, 60점+ 보통, 60점 미만 보완 필요)
        const getAchievementLevel = (score) => {
            if (score === null || score === undefined || isNaN(score)) return null;
            const rounded = Math.round(score);
            if (rounded >= 90) return { label: '최우수', level: 1, color: '#15803d', bg: '#dcfce7', border: '#86efac', desc: '성취기준 탁월 달성' };
            if (rounded >= 80) return { label: '우수', level: 2, color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc', desc: '성취기준 도달' };
            if (rounded >= 70) return { label: '양호', level: 3, color: '#6366f1', bg: '#e0e7ff', border: '#a5b4fc', desc: '기본 개념 충실' };
            if (rounded >= 60) return { label: '보통', level: 4, color: '#d97706', bg: '#fef3c7', border: '#fcd34d', desc: '기초 학습 중' };
            return { label: '보완 필요', level: 5, color: '#ef4444', bg: '#fee2e2', border: '#fca5a5', desc: '개별 보충 지도 요망' };
        };

        // 각 학생의 전체 단원평가 종합 평균 점수 산출
        const getStudentOverallScore = (sId) => {
            let sum = 0;
            let count = 0;
            unitCards.forEach(card => {
                card.columns.forEach(col => {
                    const raw = scores[card.id]?.[col.id]?.[sId];
                    if (raw !== undefined && raw !== '' && raw !== 'UNRATED') {
                        const num = parseFloat(raw);
                        if (!isNaN(num)) {
                            sum += num;
                            count++;
                        }
                    }
                });
            });
            return count > 0 ? sum / count : null;
        };

        // 전체 학생 종합 점수 목록 & 현재 학생 성취도
        const allStudentOverallScores = sortedStudents
            .map(s => ({ studentId: s.id, score: getStudentOverallScore(s.id) }))
            .filter(item => item.score !== null);

        const currentStudentOverall = getStudentOverallScore(studentId);
        let overallClassAvg = null;
        let overallAchievement = getAchievementLevel(currentStudentOverall);

        if (allStudentOverallScores.length > 0) {
            const totalSum = allStudentOverallScores.reduce((acc, curr) => acc + curr.score, 0);
            overallClassAvg = totalSum / allStudentOverallScores.length;
        }

        // 2. 과목별 분석 (단원평가 점수 + 절대평가 성취도 + 회차별 학급 평균 대비)
        const subjectAnalyses = groups.map(group => {
            const cardsInGroup = unitCards.filter(c => c.groupId === group.id);
            if (cardsInGroup.length === 0) return null;

            const studentSubjectAvg = getStudentSubjectScore(studentId, group.id);
            const subjectAchievement = getAchievementLevel(studentSubjectAvg);

            // 해당 과목 전체 학생 평균 계산
            const allStudentSubjectScores = sortedStudents
                .map(s => ({ studentId: s.id, score: getStudentSubjectScore(s.id, group.id) }))
                .filter(item => item.score !== null);

            let classSubjectAvg = null;
            if (allStudentSubjectScores.length > 0) {
                const totalSubSum = allStudentSubjectScores.reduce((acc, curr) => acc + curr.score, 0);
                classSubjectAvg = totalSubSum / allStudentSubjectScores.length;
            }

            // 각 단원평가 카드의 컬럼(회차)별 학생 점수 vs 학급 평균
            const cardsData = cardsInGroup.map(card => {
                const columnsData = card.columns.map(col => {
                    const studentRaw = scores[card.id]?.[col.id]?.[studentId];
                    const studentVal = (studentRaw !== undefined && studentRaw !== '' && studentRaw !== 'UNRATED') 
                        ? parseFloat(studentRaw) : null;

                    // 해당 회차 학급 전체 평균 계산
                    let colSum = 0;
                    let colCount = 0;
                    sortedStudents.forEach(s => {
                        const val = scores[card.id]?.[col.id]?.[s.id];
                        if (val !== undefined && val !== '' && val !== 'UNRATED') {
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                                colSum += num;
                                colCount++;
                            }
                        }
                    });
                    const classAvg = colCount > 0 ? colSum / colCount : null;

                    return {
                        id: col.id,
                        name: col.name,
                        studentVal,
                        classAvg,
                        diff: (studentVal !== null && classAvg !== null) ? (studentVal - classAvg) : null
                    };
                });

                return {
                    id: card.id,
                    name: card.name,
                    columns: columnsData
                };
            });

            return {
                id: group.id,
                name: group.name,
                studentSubjectAvg,
                classSubjectAvg,
                subjectAchievement,
                totalStudentsCount: allStudentSubjectScores.length,
                cards: cardsData
            };
        }).filter(Boolean);

        // 최우수 / 보완 필요 과목 찾기 (점수 기준)
        const rankedSubjects = subjectAnalyses
            .filter(s => s.studentSubjectAvg !== null)
            .sort((a, b) => b.studentSubjectAvg - a.studentSubjectAvg);

        const bestSubject = rankedSubjects.length > 0 ? rankedSubjects[0] : null;
        const worstSubject = rankedSubjects.length > 1 ? rankedSubjects[rankedSubjects.length - 1] : null;

        // 3. 수행평가 전용 분석 (점수화하지 않고 척도 및 학급 분포 비교)
        const perfAnalyses = perfCards.map(card => {
            const group = groups.find(g => g.id === card.groupId);
            const col = card.columns[0];
            if (!col) return null;

            const studentVal = scores[card.id]?.[col.id]?.[studentId];
            const studentLabel = getFormattedScore(card, col, studentId);
            const studentRemark = scores[card.id]?.['remarks']?.[studentId];

            // 학급 전체 분포 계산 (◎, ◯, △ 등)
            const distribution = {};
            let ratedCount = 0;
            sortedStudents.forEach(s => {
                const val = scores[card.id]?.[col.id]?.[s.id];
                if (val !== undefined && val !== '' && val !== 'UNRATED') {
                    const label = getFormattedScore(card, col, s.id);
                    distribution[label] = (distribution[label] || 0) + 1;
                    ratedCount++;
                }
            });

            return {
                id: card.id,
                subjectName: group?.name || card.subject || '과목',
                domain: card.domain || '영역',
                unit: card.unit || card.name,
                evalElement: card.evalElement || `${card.domain || ''} 영역 성취기준 평가`,
                schedule: card.schedule,
                studentLabel,
                studentRemark,
                distribution,
                ratedCount
            };
        }).filter(Boolean);

        return {
            currentStudentOverall,
            overallClassAvg,
            overallAchievement,
            totalStudentsCount: allStudentOverallScores.length,
            bestSubject,
            worstSubject,
            subjectAnalyses,
            perfAnalyses
        };
    };

    // ── 학생별 보기 선택된 학생 객체 및 분석 지표 ──
    const selectedStudent = useMemo(() => {
        return sortedStudents.find(s => s.id === selectedStudentId) || null;
    }, [sortedStudents, selectedStudentId]);

    const analysis = useMemo(() => {
        return getGradeAnalysis(selectedStudentId);
    }, [selectedStudentId, scores, evalCards, groups, sortedStudents]);

    // ── 과목 카드 토글 켜기/끄기 (활성화/해제) ──
    const handleToggleSubject = (subjectName) => {
        const existingGroup = groups.find(g => g.name === subjectName);
        if (existingGroup) {
            const hasCards = evalCards.some(c => c.groupId === existingGroup.id);
            if (hasCards) {
                showConfirm(`[${subjectName}] 과목을 끄면 해당 과목에 포함된 평가 카드도 함께 비활성화(삭제)됩니다. 끄시겠습니까?`, () => {
                    removeGroupAndCards(existingGroup.id, subjectName);
                }, '과목 끄기');
            } else {
                removeGroupAndCards(existingGroup.id, subjectName);
            }
        } else {
            const newGroup = {
                id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                name: subjectName
            };
            setGroups(prev => [...prev, newGroup]);
            showToast(`[${subjectName}] 과목이 활성화되었습니다.`);
        }
    };

    // ── SVG 아이콘 ──
    const SettingsIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );

    const CheckIcon = () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );

    const ChevronIcon = ({ collapsed }) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.2s ease', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );

    const FolderIcon = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    );

    const FileIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
    );

    const BackIcon = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
        </svg>
    );

    const PlusIcon = () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );

    const PageLeftIcon = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    );

    const PageRightIcon = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );

    // ═══════════════════════════════════════════
    //  화면 B: 평가 카드 내부 (다중 컬럼 명렬표)
    // ═══════════════════════════════════════════
    if (activeCardId && activeCard) {
        const cardScores = scores[activeCardId] || {};
        const isScoreType = activeCriteria.evaluationType === 'score';
        const labels = activeCriteria.labels || ['상', '중', '하'];
        const totalRows = sortedStudents.length;

        // 수행평가는 단 1개의 평가 입력 컬럼만 사용
        const displayColumns = activeCard.isPerformance ? pagedColumns.slice(0, 1) : pagedColumns;
        const totalCols = displayColumns.length;

        return (
            <div className="grade-manager-page">
                {/* 상단 네비게이션 */}
                <div className="detail-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button className="detail-back-btn" onClick={() => setActiveCardId(null)}>
                            <BackIcon />
                            <span>돌아가기</span>
                        </button>
                        <div className="detail-breadcrumb">
                            <span className="breadcrumb-group">{activeCardGroup?.name}</span>
                            <span className="breadcrumb-sep">&gt;</span>
                            <span className="breadcrumb-card">{activeCard.isPerformance ? `${activeCard.domain || '수행평가'} (${activeCard.unit})` : activeCard.name}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* 형광펜 도구 & 기준점수 필터 버튼 및 팝오버 */}
                        <div className="highlight-toolbar-container" style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className={`detail-highlight-btn ${autoHighlightConfig[activeCardId]?.enabled ? 'active' : ''}`}
                                onClick={() => setShowHighlightPopover(prev => !prev)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 13px',
                                    borderRadius: '10px',
                                    border: autoHighlightConfig[activeCardId]?.enabled ? '1.5px solid #facc15' : '1px solid #e2e8f0',
                                    background: autoHighlightConfig[activeCardId]?.enabled ? '#fef9c3' : '#ffffff',
                                    color: autoHighlightConfig[activeCardId]?.enabled ? '#854d0e' : '#475569',
                                    fontWeight: '700',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                                    <path d="M2 2l7.586 7.586" />
                                    <circle cx="11" cy="11" r="2" />
                                </svg>
                                <span>형광펜 필터</span>
                                {autoHighlightConfig[activeCardId]?.enabled && (
                                    <span style={{ fontSize: '11px', background: '#facc15', color: '#713f12', padding: '1px 6px', borderRadius: '99px', fontWeight: '800' }}>
                                        {isScoreType ? `≤${autoHighlightConfig[activeCardId]?.threshold ?? 70}점` : `${autoHighlightConfig[activeCardId]?.levelThreshold || '하'}`}
                                    </span>
                                )}
                            </button>

                            {/* 형광펜 설정 팝오버 */}
                            {showHighlightPopover && (
                                <div className="highlight-popover-box" style={{
                                    position: 'absolute',
                                    top: '120%',
                                    right: 0,
                                    background: '#ffffff',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                                    border: '1px solid #e2e8f0',
                                    zIndex: 1000,
                                    width: '280px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <span style={{ fontWeight: '800', fontSize: '13.5px', color: '#1e293b' }}>형광펜 표시 설정</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowHighlightPopover(false)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* 자동 기준 점수 필터 */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '12px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>기준 이하 자동 표시</span>
                                            <label className="grade-toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={!!autoHighlightConfig[activeCardId]?.enabled}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setAutoHighlightConfig(prev => ({
                                                            ...prev,
                                                            [activeCardId]: {
                                                                ...(prev[activeCardId] || { threshold: 70, color: 'yellow', levelThreshold: '하' }),
                                                                enabled: checked
                                                            }
                                                        }));
                                                    }}
                                                />
                                                <span className="grade-toggle-slider" />
                                            </label>
                                        </div>

                                        {autoHighlightConfig[activeCardId]?.enabled && (
                                            <div>
                                                {isScoreType ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={autoHighlightConfig[activeCardId]?.threshold ?? 70}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value);
                                                                setAutoHighlightConfig(prev => ({
                                                                    ...prev,
                                                                    [activeCardId]: {
                                                                        ...(prev[activeCardId] || { color: 'yellow', levelThreshold: '하' }),
                                                                        threshold: val,
                                                                        enabled: true
                                                                    }
                                                                }));
                                                            }}
                                                            style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700', textAlign: 'center' }}
                                                        />
                                                        <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>점 이하 자동 형광펜</span>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                                        <select
                                                            value={autoHighlightConfig[activeCardId]?.levelThreshold || '하'}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setAutoHighlightConfig(prev => ({
                                                                    ...prev,
                                                                    [activeCardId]: {
                                                                        ...(prev[activeCardId] || { threshold: 70, color: 'yellow' }),
                                                                        levelThreshold: val,
                                                                        enabled: true
                                                                    }
                                                                }));
                                                            }}
                                                            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                                                        >
                                                            {labels.map(l => (
                                                                <option key={l} value={l}>{l} 이하</option>
                                                            ))}
                                                        </select>
                                                        <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>자동 형광펜</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* 형광펜 색상 팔레트 */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>형광펜 색상</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {[
                                                { id: 'yellow', bg: '#fef08a', border: '#facc15', label: '레몬 노랑' },
                                                { id: 'pink', bg: '#fecdd3', border: '#f43f5e', label: '피치 핑크' },
                                                { id: 'green', bg: '#bbf7d0', border: '#22c55e', label: '멜론 초록' },
                                                { id: 'blue', bg: '#bae6fd', border: '#38bdf8', label: '스카이 파랑' }
                                            ].map(c => {
                                                const currentC = autoHighlightConfig[activeCardId]?.color || selectedPenColor;
                                                const isSel = currentC === c.id;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPenColor(c.id);
                                                            setAutoHighlightConfig(prev => ({
                                                                ...prev,
                                                                [activeCardId]: {
                                                                    ...(prev[activeCardId] || { threshold: 70, enabled: false }),
                                                                    color: c.id
                                                                }
                                                            }));
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            height: '28px',
                                                            background: c.bg,
                                                            border: isSel ? `2.5px solid ${c.border}` : '1px solid #cbd5e1',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: isSel ? '0 2px 6px rgba(0,0,0,0.12)' : 'none'
                                                        }}
                                                        title={c.label}
                                                    >
                                                        {isSel && <span style={{ color: '#0f172a', fontSize: '11px', fontWeight: '900' }}>✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 직접 칠하기 안내 / 초기화 */}
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '12px', color: '#64748b' }}>💡 점수 더블클릭 시 직접 칠하기</span>
                                        {Object.keys(cardHighlights[activeCardId] || {}).length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCardHighlights(prev => ({ ...prev, [activeCardId]: {} }));
                                                    showToast('직접 칠한 형광펜이 초기화되었습니다.');
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}
                                            >
                                                전체 지우기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {activeCard.isPerformance ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                {/* 예정 시기 클릭형 뱃지 및 빠른 선택 팝오버 */}
                                <div
                                    className="perf-schedule-badge"
                                    onClick={() => setShowSchedulePickerPopover(prev => !prev)}
                                    title="클릭하여 평가 예정 시기 및 날짜를 수정할 수 있습니다."
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#fff7ed',
                                        border: '1.5px solid #fdba74',
                                        padding: '6px 12px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 1px 3px rgba(234, 88, 12, 0.1)'
                                    }}
                                >
                                    <span style={{ fontSize: '13px', color: '#ea580c', fontWeight: '800' }}>
                                        📅 {activeCard.scheduleText || activeCard.schedule || '시기 미정'} ✏️
                                    </span>
                                </div>

                                {showSchedulePickerPopover && (
                                    <div className="perf-schedule-popover" style={{
                                        position: 'absolute',
                                        top: '120%',
                                        right: 0,
                                        background: '#ffffff',
                                        borderRadius: '14px',
                                        padding: '16px',
                                        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                                        border: '1px solid #fed7aa',
                                        zIndex: 1000,
                                        width: '290px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '13px', color: '#c2410c' }}>📅 예정 시기 / 날짜 변경</span>
                                            <button
                                                type="button"
                                                onClick={() => setShowSchedulePickerPopover(false)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {/* 빠른 주차 선택 칩 */}
                                        <div style={{ marginBottom: '12px' }}>
                                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '6px' }}>빠른 주차 선택 (현재 월 기준)</span>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                {(() => {
                                                    const curM = new Date().getMonth() + 1;
                                                    const curY = new Date().getFullYear();
                                                    return [1, 2, 3, 4].map(w => {
                                                        const txt = `${curM}월 ${w}주차`;
                                                        const calcDay = Math.min(28, (w - 1) * 7 + 3);
                                                        const dateStr = `${curY}-${String(curM).padStart(2, '0')}-${String(calcDay).padStart(2, '0')}`;
                                                        return (
                                                            <button
                                                                key={w}
                                                                type="button"
                                                                onClick={() => handleQuickUpdateSchedule(activeCard.id, dateStr, txt)}
                                                                style={{
                                                                    background: '#fff7ed',
                                                                    border: '1px solid #ffedd5',
                                                                    color: '#ea580c',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '12px',
                                                                    fontWeight: '700',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {w}주차
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>

                                        {/* 직접 날짜 선택 */}
                                        <div>
                                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', marginBottom: '4px' }}>달력에서 직접 날짜 선택</span>
                                            <input
                                                type="date"
                                                defaultValue={activeCard.scheduleDate || activeCard.columns?.[0]?.date || new Date().toISOString().split('T')[0]}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const parts = val.split('-');
                                                        const txt = `${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일`;
                                                        handleQuickUpdateSchedule(activeCard.id, val, txt);
                                                    }
                                                }}
                                                style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 전체 정보 수정 모달 버튼 */}
                                <button
                                    type="button"
                                    onClick={(e) => handleOpenEditCard(e, activeCard)}
                                    title="수행평가 정보 전체 수정"
                                    style={{
                                        background: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        color: '#15803d',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    수정
                                </button>
                            </div>
                        ) : (
                            <button className="detail-add-col-btn" onClick={handleAddColumnSet}>
                                <PlusIcon />
                                <span>{activeCard.evalType === 'unit' || activeCard.name?.includes('단원') ? '다음 5개 단원 추가' : '다음 5개 회차 생성'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* 평가 요소 가이드 박스 (인라인 수정 지원) */}
                {activeCard.isPerformance && (
                    <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '12px', borderLeft: '4px solid #16a34a', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', margin: '14px 0 18px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '99px' }}>
                                평가 요소
                            </span>
                            {!isEditingInlineElement && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setInlineElementText(activeCard.evalElement || '');
                                        setIsEditingInlineElement(true);
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#16a34a', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    평가요소 수정
                                </button>
                            )}
                        </div>

                        {isEditingInlineElement ? (
                            <div style={{ marginTop: '8px' }}>
                                <textarea
                                    value={inlineElementText}
                                    onChange={(e) => setInlineElementText(e.target.value)}
                                    rows={2}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #16a34a', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                    placeholder="평가 요소 / 성취기준을 입력하세요"
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingInlineElement(false)}
                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveInlineElement(activeCard.id)}
                                        style={{ background: '#16a34a', border: 'none', color: '#ffffff', padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <h4
                                onClick={() => {
                                    setInlineElementText(activeCard.evalElement || '');
                                    setIsEditingInlineElement(true);
                                }}
                                title="클릭하여 평가요소를 직접 수정할 수 있습니다."
                                style={{ margin: '4px 0 0 0', fontSize: '14.5px', color: '#0f172a', fontWeight: '700', cursor: 'pointer' }}
                            >
                                {activeCard.evalElement || '해당 영역 성취기준 평가 (클릭 시 수정)'}
                            </h4>
                        )}
                    </div>
                )}

                {/* 수행평가 전용 단일 통합 채점 툴바 (체크박스 다중 선택 + 일괄/개별 통합 점수 부여) */}
                {activeCard.isPerformance && displayColumns.length > 0 && (
                    <div className="perf-unified-grading-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#f8fafc', padding: '12px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                        {/* 좌측: 선택 현황 및 선택 제어 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>선택 학생:</span>
                                <span style={{ fontSize: '13px', fontWeight: '800', background: selectedStudentIds.length > 0 ? '#dcfce7' : '#f1f5f9', color: selectedStudentIds.length > 0 ? '#15803d' : '#64748b', padding: '4px 10px', borderRadius: '8px', border: selectedStudentIds.length > 0 ? '1px solid #bbf7d0' : '1px solid #cbd5e1' }}>
                                    {selectedStudentIds.length === 0 ? '선택 없음' : (selectedStudentIds.length === sortedStudents.length ? `전체 (${sortedStudents.length}명)` : `${selectedStudentIds.length}명 / ${sortedStudents.length}명`)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={handleToggleSelectAll}
                                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                >
                                    {selectedStudentIds.length === sortedStudents.length ? '전체 해제' : '전체 선택'}
                                </button>
                                {selectedStudentIds.length > 0 && selectedStudentIds.length < sortedStudents.length && (
                                    <button
                                        type="button"
                                        onClick={handleClearSelection}
                                        style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#64748b', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        선택 해제
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 우측: 통합 등급 부여 버튼군 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginRight: '4px' }}>선택 학생 점수 부여:</span>
                            <button
                                type="button"
                                className="batch-btn batch-high"
                                style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer' }}
                                onClick={() => handleApplyScoreToSelected(3)}
                            >
                                ◎ 매우잘함
                            </button>
                            <button
                                type="button"
                                className="batch-btn batch-mid"
                                style={{ background: '#22c55e', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer' }}
                                onClick={() => handleApplyScoreToSelected(2)}
                            >
                                ◯ 잘함
                            </button>
                            <button
                                type="button"
                                className="batch-btn batch-low"
                                style={{ background: '#eab308', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer' }}
                                onClick={() => handleApplyScoreToSelected(1)}
                            >
                                △ 보통
                            </button>
                            <button
                                type="button"
                                className="batch-btn batch-unrated"
                                style={{ background: '#94a3b8', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer' }}
                                onClick={() => handleApplyScoreToSelected('UNRATED')}
                            >
                                미평가
                            </button>
                            <button
                                type="button"
                                style={{ background: '#ffffff', color: '#ef4444', border: '1px solid #fca5a5', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                onClick={() => handleApplyScoreToSelected(undefined)}
                                title="선택한 학생들의 점수를 비웁니다"
                            >
                                비우기
                            </button>
                        </div>
                    </div>
                )}

                {/* 단원평가 / 일반평가 다중 페이지(5개 초과)일 때 미니멀 이전/다음 이동 바 */}
                {!activeCard.isPerformance && totalPages > 1 && (
                    <div className="unit-pagination-bar" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        marginBottom: '12px'
                    }}>
                        <button
                            type="button"
                            className="unit-page-nav-btn"
                            disabled={colPage === 0}
                            onClick={() => setColPage(prev => Math.max(0, prev - 1))}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: colPage === 0 ? '#f1f5f9' : '#ffffff',
                                color: colPage === 0 ? '#94a3b8' : '#334155',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: colPage === 0 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            ◀ 이전
                        </button>

                        <button
                            type="button"
                            className="unit-page-nav-btn"
                            disabled={colPage >= totalPages - 1}
                            onClick={() => setColPage(prev => Math.min(totalPages - 1, prev + 1))}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: colPage >= totalPages - 1 ? '#f1f5f9' : '#ffffff',
                                color: colPage >= totalPages - 1 ? '#94a3b8' : '#334155',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: colPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            다음 ▶
                        </button>
                    </div>
                )}

                {/* 다중 컬럼 명렬표 */}
                {displayColumns.length > 0 ? (
                    <>
                        <div className="multi-col-table-wrapper" ref={tableRef}>
                            <table className="multi-col-grade-table">
                            <thead>
                                <tr>
                                    {activeCard.isPerformance && (
                                        <th className="th-check" style={{ width: '44px', textAlign: 'center', padding: '8px 4px' }}>
                                            <input
                                                type="checkbox"
                                                checked={sortedStudents.length > 0 && selectedStudentIds.length === sortedStudents.length}
                                                onChange={handleToggleSelectAll}
                                                style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer', verticalAlign: 'middle' }}
                                                title="전체 선택 / 해제"
                                            />
                                        </th>
                                    )}
                                    <th className="th-num" style={{ width: '48px' }}>번호</th>
                                    <th className="th-name" style={{ width: '80px' }}>이름</th>
                                    {displayColumns.map(col => (
                                        <th key={col.id} className="th-col-header" style={{ minWidth: activeCard.isPerformance ? '240px' : '90px' }}>
                                            <div className="col-header-content" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                {activeCard.isPerformance ? (
                                                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803d' }}>
                                                        {activeCard.unit || '수행평가'}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <input
                                                            type="text"
                                                            className="col-header-input"
                                                            value={col.name}
                                                            onChange={(e) => handleUpdateColumnName(col.id, e.target.value)}
                                                            placeholder="단원 제목"
                                                            style={{ paddingRight: '22px' }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="col-delete-btn"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteColumn(col.id); }}
                                                            title="단원 삭제"
                                                            style={{
                                                                position: 'absolute',
                                                                right: '4px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#94a3b8',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                padding: '2px 4px',
                                                                lineHeight: 1,
                                                                borderRadius: '4px'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                                                            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                                                        >
                                                            ✕
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    {/* 수행평가일 때 비고/관찰메모 헤더 추가 (넉넉한 360px 너비) */}
                                    {activeCard.isPerformance && (
                                        <th style={{ minWidth: '360px', background: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: '700', padding: '10px 16px', boxSizing: 'border-box' }}>
                                            비고 / 관찰 메모 (교사 참고용)
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedStudents.map((student, rowIdx) => {
                                    const isChecked = selectedStudentIds.includes(student.id);
                                    return (
                                        <tr 
                                            key={student.id} 
                                            className={`grade-row ${isChecked ? 'is-checked' : ''} ${activeRowIdx === rowIdx ? 'active-grading-row' : ''}`}
                                            onClick={() => setActiveRowIdx(rowIdx)}
                                        >
                                            {activeCard.isPerformance && (
                                                <td className="td-check" style={{ width: '44px', textAlign: 'center', padding: '8px 4px' }} onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleSelectStudent(student.id)}
                                                        style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer', verticalAlign: 'middle' }}
                                                    />
                                                </td>
                                            )}
                                            <td className="td-num">{student.attendanceNumber}</td>
                                            <td 
                                                className="td-name" 
                                                style={{ cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleSelectStudent(student.id);
                                                    setActiveRowIdx(rowIdx);
                                                    setTimeout(() => {
                                                        focusCell(rowIdx, activeColIdx ?? 0);
                                                    }, 50);
                                                }}
                                                title="클릭하여 학생 선택/해제 토글"
                                            >
                                                {student.name}
                                            </td>
                                            {displayColumns.map((col, colIdx) => {
                                                const colScores = cardScores[col.id] || {};
                                                const currentVal = colScores[student.id];
                                                const hlColor = isCellHighlighted(activeCardId, col.id, student.id, currentVal);

                                                return (
                                                    <td
                                                        key={col.id}
                                                        className={`td-input ${hlColor ? `td-hl-${hlColor}` : ''}`}
                                                        onContextMenu={(e) => handleToggleCellHighlight(e, col.id, student.id)}
                                                        onDoubleClick={(e) => handleToggleCellHighlight(e, col.id, student.id)}
                                                        title={hlColor ? "형광펜 표시됨 (더블클릭/우클릭으로 토글)" : "더블클릭/우클릭으로 형광펜 칠하기"}
                                                    >
                                                        {isScoreType ? (
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                className={`score-number-input no-spin ${hlColor ? `hl-${hlColor}` : ''}`}
                                                                value={currentVal ?? ''}
                                                                data-row={rowIdx}
                                                                data-col={colIdx}
                                                                onFocus={() => {
                                                                    setActiveRowIdx(rowIdx);
                                                                    setActiveColIdx(colIdx);
                                                                }}
                                                                onChange={(e) => handleScoreChange(col.id, student.id, e.target.value)}
                                                                onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx, totalRows, totalCols)}
                                                            />
                                                        ) : (
                                                            <select
                                                                className={`clean-step-select ${currentVal ? 'has-value' : 'empty'} ${currentVal === 'UNRATED' ? 'unrated' : ''} ${hlColor ? `hl-${hlColor}` : ''}`}
                                                                value={currentVal ?? ''}
                                                                data-row={rowIdx}
                                                                data-col={colIdx}
                                                                onFocus={() => {
                                                                    setActiveRowIdx(rowIdx);
                                                                    setActiveColIdx(colIdx);
                                                                }}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    handleScoreChange(col.id, student.id, val === '' ? undefined : (val === 'UNRATED' ? 'UNRATED' : Number(val)));
                                                                    setTimeout(() => {
                                                                        if (rowIdx + 1 < totalRows) {
                                                                            focusCell(rowIdx + 1, colIdx);
                                                                        }
                                                                    }, 50);
                                                                }}
                                                                onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx, totalRows, totalCols)}
                                                            >
                                                                <option value="">- 미입력 -</option>
                                                                {labels.map((label, lIdx) => {
                                                                    const val = labels.length - lIdx;
                                                                    return (
                                                                        <option key={lIdx} value={val}>{label}</option>
                                                                    );
                                                                })}
                                                                <option value="UNRATED">미평가</option>
                                                            </select>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            {/* 수행평가 비고 메모 텍스트 입력창 */}
                                            {activeCard.isPerformance && (
                                                <td style={{ padding: '6px 16px 6px 10px', boxSizing: 'border-box' }}>
                                                    <input
                                                        type="text"
                                                        className="perf-remark-input"
                                                        placeholder="비고 / 특이사항 메모"
                                                        value={cardScores['remarks']?.[student.id] || ''}
                                                        onChange={(e) => handleRemarkChange(student.id, e.target.value)}
                                                        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', display: 'block' }}
                                                    />
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 하단 페이지네이션 컨트롤 바 */}
                    {!activeCard.isPerformance && totalPages > 1 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            marginTop: '16px',
                            padding: '10px 0'
                        }}>
                            <button
                                type="button"
                                disabled={colPage === 0}
                                onClick={() => {
                                    setColPage(prev => Math.max(0, prev - 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: colPage === 0 ? '#f1f5f9' : '#ffffff',
                                    color: colPage === 0 ? '#94a3b8' : '#334155',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: colPage === 0 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ◀ 이전
                            </button>

                            <button
                                type="button"
                                disabled={colPage >= totalPages - 1}
                                onClick={() => {
                                    setColPage(prev => Math.min(totalPages - 1, prev + 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: colPage >= totalPages - 1 ? '#f1f5f9' : '#ffffff',
                                    color: colPage >= totalPages - 1 ? '#94a3b8' : '#334155',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: colPage >= totalPages - 1 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                다음 ▶
                            </button>
                        </div>
                    )}
                    </>
                ) : (
                    <div className="grade-empty-state">
                        <FileIcon />
                        <p>회차가 생성되어 있지 않습니다.</p>
                    </div>
                )}
            </div>
        );
    }

    // ═══════════════════════════════════════════
    //  화면 A: 메인 목록 (그룹 폴더 + 평가 카드)
    // ═══════════════════════════════════════════
    return (
        <div className="grade-manager-page">
            {/* 최상단: 1학기 / 2학기 동그라미 선택 바 */}
            <div className="semester-selection-top-bar" style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '12px', padding: '2px 4px' }}>
                <label 
                    onClick={() => handleSelectSemester(1)}
                    style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        cursor: 'pointer', 
                        userSelect: 'none',
                        fontSize: '14.5px',
                        fontWeight: selectedSemester === 1 ? '800' : '600',
                        color: selectedSemester === 1 ? '#15803d' : '#64748b'
                    }}
                >
                    <span style={{ 
                        width: '18px', 
                        height: '18px', 
                        borderRadius: '50%', 
                        border: selectedSemester === 1 ? '5.5px solid #16a34a' : '2px solid #cbd5e1', 
                        background: '#ffffff',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease',
                        display: 'inline-block'
                    }} />
                    <span>1학기</span>
                </label>

                <label 
                    onClick={() => handleSelectSemester(2)}
                    style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        cursor: 'pointer', 
                        userSelect: 'none',
                        fontSize: '14.5px',
                        fontWeight: selectedSemester === 2 ? '800' : '600',
                        color: selectedSemester === 2 ? '#15803d' : '#64748b'
                    }}
                >
                    <span style={{ 
                        width: '18px', 
                        height: '18px', 
                        borderRadius: '50%', 
                        border: selectedSemester === 2 ? '5.5px solid #16a34a' : '2px solid #cbd5e1', 
                        background: '#ffffff',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease',
                        display: 'inline-block'
                    }} />
                    <span>2학기</span>
                </label>
            </div>

            {/* 상단 헤더 카드 */}
            <div className="main-page-top-nav-bar">
                <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <h2 style={{ margin: 0 }}>성적 입력</h2>
                    
                    {/* 영역별 / 학생별 보기 토글 탭 */}
                    <div className="grade-view-mode-tabs">
                        <button 
                            className={`grade-view-tab-btn ${viewMode === 'area' ? 'active' : ''}`}
                            onClick={() => setViewMode('area')}
                        >
                            영역별 보기
                        </button>
                        <button 
                            className={`grade-view-tab-btn ${viewMode === 'student' ? 'active' : ''}`}
                            onClick={() => setViewMode('student')}
                        >
                            학생별 보기
                        </button>
                    </div>
                </div>
                <div className="top-tab-button-group">
                    {/* 필요 시 개발/테스트용으로 복구 가능하도록 숨김 처리
                    <button className="top-tab-btn" onClick={handleGenerateSampleData} style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }} title="활성화된 과목에 단원평가(100점 만점) 및 수행평가(상중하 동그라미) 예시 자료를 로컬에 생성합니다.">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        <span>예시 데이터 채우기</span>
                    </button>
                    */}
                    <button className="top-tab-btn" onClick={() => setShowAddGroupModal(true)}>
                        <SettingsIcon />
                        <span>과목 설정</span>
                    </button>
                    <button className="top-tab-btn active" onClick={() => openAddCardModal('unit')}>
                        <PlusIcon />
                        <span>평가 추가</span>
                    </button>
                </div>
            </div>

            {viewMode === 'area' && (
                <div className="grade-guide-banner">
                    <div className="guide-icon-wrapper">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                    </div>
                    <div className="guide-text-content">
                        <h4>성적 입력 및 수행평가 관리 가이드</h4>
                        <ul>
                            <li><strong>과목 관리</strong>: <code>[과목 설정]</code>에서 국어, 수학, 사회, 과학 등 교과목을 정갈하게 관리합니다.</li>
                            <li><strong>수행평가 & 단원평가 등록</strong>: <code>[평가 추가]</code> 버튼을 눌러 평가를 생성하며, <strong>수행평가와 단원평가는 학생 성적 분석 리포트에 반영</strong>됩니다.</li>
                            <li><strong>성적 리포트 조회</strong>: <strong>[학생별 보기]</strong>에서 학생별 성적 분석 리포트를 조회할 수 있습니다.</li>
                        </ul>
                    </div>
                </div>
            )}

            {viewMode === 'student' ? (
                <div className="student-view-container">
                    {/* 좌측 학생명렬표 */}
                    <div className="student-list-sidebar">
                        {sortedStudents.map(student => (
                            <button
                                key={student.id}
className={`student-list-item-btn ${selectedStudentId === student.id ? 'active' : ''}`}
                                onClick={() => setSelectedStudentId(student.id)}
                            >
                                <span className="student-item-num">{student.attendanceNumber}번</span>
                                <span className="student-item-name">{student.name}</span>
                                <span className={`student-item-gender-badge gender-${student.gender}`}>
                                    {student.gender}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* 우측 성적 디테일 패널 */}
                    <div className="student-grade-detail-pane">
                        {(() => {
                            if (!selectedStudent) {
                                return (
                                    <div className="grade-empty-state">
                                        <p>선택된 학생이 없습니다.</p>
                                    </div>
                                );
                            }

                            const currentSemesterCards = evalCards.filter(c => (c.semester || 1) === selectedSemester);
                            const unitCards = currentSemesterCards.filter(c => c.evalType === 'unit' || (!c.isPerformance && c.name?.includes('단원')));
                            const perfCards = currentSemesterCards.filter(c => c.isPerformance || c.evalType === 'performance');
                            const generalCards = currentSemesterCards.filter(c => !c.isPerformance && c.evalType !== 'unit' && !c.name?.includes('단원'));

                            return (
                                <>
                                    <div className="student-detail-header">
                                        <div className="student-profile-title">
                                            <span className="profile-num-badge">{selectedStudent.attendanceNumber}번</span>
                                            <h3 className="profile-name">{selectedStudent.name} 성적</h3>
                                        </div>
                                        <button className="grade-analysis-btn" onClick={() => setShowAnalysisModal(true)}>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                            </svg>
                                            성적분석리포트
                                        </button>
                                    </div>

                                    {evalCards.length === 0 ? (
                                        <div className="grade-empty-state" style={{ padding: '4rem 2rem' }}>
                                            <FolderIcon />
                                            <p style={{ fontWeight: '700', color: '#64748b' }}>등록된 평가 카드가 없습니다.</p>
                                            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                                                상단의 <strong>[영역별 보기]</strong> 탭에서 평가를 생성하고 성적을 입력해 주세요.
                                            </p>
                                        </div>
                                    ) : (
                                        /* ── 3대 평가 유형별 그룹화 리포트 (단원평가 ➔ 수행평가 ➔ 일반평가) ── */
                                        <div className="student-groups-list">
                                            {/* 1. 단원평가 섹션 */}
                                            {unitCards.length > 0 && (
                                                <div className="student-eval-category-section" style={{ marginBottom: '32px' }}>
                                                    <div className="eval-category-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '2px solid #bae6fd', paddingBottom: '8px' }}>
                                                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: '800' }}>단원평가</span>
                                                            <span>단원평가 성적 현황</span>
                                                        </h4>
                                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: '99px', border: '1px solid #bae6fd' }}>
                                                            {unitCards.length}개 평가
                                                        </span>
                                                    </div>

                                                    <div className="student-cards-grid">
                                                        {unitCards.map(card => {
                                                            const group = groups.find(g => g.id === card.groupId);
                                                            const subjectName = group?.name || card.subject || '과목';
                                                            const criteria = criteriaTemplates.find(t => t.id === card.criteriaId) || DEFAULT_TEMPLATES[0];

                                                            return (
                                                                <div key={card.id} className="student-grade-card unit-report-card" style={{ border: '1.5px solid #bae6fd', borderRadius: '14px', padding: '16px', background: '#ffffff', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)' }}>
                                                                    <div className="card-header-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <span style={{ background: '#0284c7', color: '#ffffff', fontSize: '11.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '6px' }}>
                                                                                {subjectName}
                                                                            </span>
                                                                            <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>
                                                                                {card.name}
                                                                            </span>
                                                                        </div>
                                                                        <span className="card-criteria-badge">{criteria.name}</span>
                                                                    </div>

                                                                    <div className="card-rounds-list">
                                                                        {card.columns.map(col => {
                                                                            const formattedVal = getFormattedScore(card, col, selectedStudent.id);
                                                                            return (
                                                                                <div key={col.id} className="round-score-row-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                                                                    <span className="round-name" style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{col.name}</span>
                                                                                    <span className={`round-score-badge-label ${formattedVal === '미평가' || formattedVal === '미입력' ? 'unrated' : ''}`} style={{ fontSize: '13px', fontWeight: '800' }}>
                                                                                        {formattedVal}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 2. 수행평가 섹션 */}
                                            {perfCards.length > 0 && (
                                                <div className="student-eval-category-section" style={{ marginBottom: '32px' }}>
                                                    <div className="eval-category-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '2px solid #86efac', paddingBottom: '8px' }}>
                                                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: '800' }}>수행평가</span>
                                                            <span>과정중심 수행평가 현황</span>
                                                        </h4>
                                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', background: '#f0fdf4', padding: '2px 8px', borderRadius: '99px', border: '1px solid #86efac' }}>
                                                            {perfCards.length}개 평가
                                                        </span>
                                                    </div>

                                                    <div className="student-cards-grid">
                                                        {perfCards.map(card => {
                                                            const group = groups.find(g => g.id === card.groupId);
                                                            const subjectName = group?.name || card.subject || '과목';
                                                            const col = card.columns[0];
                                                            const formattedVal = col ? getFormattedScore(card, col, selectedStudent.id) : null;
                                                            const studentRemark = scores[card.id]?.['remarks']?.[selectedStudent.id];

                                                            return (
                                                                <div key={card.id} className="student-grade-card perf-report-card" style={{ background: '#ffffff', border: '1.5px solid #86efac', borderRadius: '14px', padding: '16px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.06)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '11.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '6px' }}>
                                                                                {subjectName}
                                                                            </span>
                                                                            <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                                                                                {card.domain || '수행영역'}
                                                                            </span>
                                                                        </div>
                                                                        {card.schedule && (
                                                                            <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#ea580c' }}>
                                                                                예정: {card.schedule}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#166534', margin: '0 0 6px 0' }}>
                                                                        {card.unit || card.name}
                                                                    </h4>
                                                                    <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px', lineHeight: '1.4' }}>
                                                                        <strong>성취기준:</strong> {card.evalElement || '영역 성취기준 평가'}
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                                        <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#15803d' }}>평가 결과</span>
                                                                        <span className={`round-score-badge-label ${formattedVal === '미평가' || formattedVal === '미입력' ? 'unrated' : ''}`} style={{ fontSize: '14px', fontWeight: '800' }}>
                                                                            {formattedVal || '미입력'}
                                                                        </span>
                                                                    </div>
                                                                    {studentRemark && (
                                                                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#15803d', background: '#dcfce7', padding: '6px 10px', borderRadius: '6px', lineHeight: '1.4' }}>
                                                                            <strong>비고:</strong> {studentRemark}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 3. 일반평가 섹션 */}
                                            {generalCards.length > 0 && (
                                                <div className="student-eval-category-section" style={{ marginBottom: '32px' }}>
                                                    <div className="eval-category-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                                                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: '800' }}>일반평가</span>
                                                            <span>학급 일반평가(쪽지시험 등) 현황</span>
                                                        </h4>
                                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '99px', border: '1px solid #e2e8f0' }}>
                                                            {generalCards.length}개 평가
                                                        </span>
                                                    </div>

                                                    <div className="student-cards-grid">
                                                        {generalCards.map(card => {
                                                            const group = groups.find(g => g.id === card.groupId);
                                                            const subjectName = group?.name || card.subject || '과목';
                                                            const criteria = criteriaTemplates.find(t => t.id === card.criteriaId) || DEFAULT_TEMPLATES[0];

                                                            return (
                                                                <div key={card.id} className="student-grade-card general-report-card" style={{ border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '16px', background: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                                                                    <div className="card-header-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <span style={{ background: '#64748b', color: '#ffffff', fontSize: '11.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '6px' }}>
                                                                                {subjectName}
                                                                            </span>
                                                                            <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>
                                                                                {card.name}
                                                                            </span>
                                                                        </div>
                                                                        <span className="card-criteria-badge">{criteria.name}</span>
                                                                    </div>

                                                                    <div className="card-rounds-list">
                                                                        {card.columns.map(col => {
                                                                            const formattedVal = getFormattedScore(card, col, selectedStudent.id);
                                                                            return (
                                                                                <div key={col.id} className="round-score-row-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                                                                    <span className="round-name" style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>{col.name}</span>
                                                                                    <span className={`round-score-badge-label ${formattedVal === '미평가' || formattedVal === '미입력' ? 'unrated' : ''}`} style={{ fontSize: '13px', fontWeight: '800' }}>
                                                                                        {formattedVal}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            ) : (
                /* 그룹 목록 */
                groups.length > 0 ? (
                    <div className="grade-groups-container">
                        {groups.map(group => {
                            const isCollapsed = collapsedGroups[group.id];
                            const cardsInGroup = evalCards.filter(c => c.groupId === group.id && (c.semester || 1) === selectedSemester);

                            return (
                                <div key={group.id} className="grade-group-section">
                                    <div className="group-header" onClick={() => toggleGroup(group.id)}>
                                        <div className="group-header-left">
                                            <span className="group-fold-icon">
                                                <ChevronIcon collapsed={isCollapsed} />
                                            </span>
                                            <FolderIcon />
                                            <span className="group-name">{group.name}</span>
                                            <span className="group-card-count">{cardsInGroup.length}</span>
                                        </div>
                                        <div className="group-header-right">
                                            <button className="group-delete-btn" onClick={(e) => handleDeleteGroup(e, group.id)}>
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="eval-cards-grid">
                                            {cardsInGroup.map(card => {
                                                const colCount = card.columns?.length || 0;
                                                const criteria = criteriaTemplates.find(c => c.id === card.criteriaId);
                                                return (
                                                    <div
                                                        key={card.id}
                                                        className={`eval-card ${card.isPerformance ? 'perf-eval-card' : ''}`}
                                                        onClick={() => setActiveCardId(card.id)}
                                                    >
                                                        <div className="eval-card-top" style={{ position: 'relative' }}>
                                                            <span className="eval-card-name">
                                                                {card.isPerformance || card.evalType === 'performance' ? (
                                                                    <span className="mini-tag tag-perf">수행</span>
                                                                ) : (card.evalType === 'unit' || card.name?.includes('단원')) ? (
                                                                    <span className="mini-tag tag-unit">단원</span>
                                                                ) : (
                                                                    <span className="mini-tag tag-general">일반</span>
                                                                )}
                                                                {card.name}
                                                            </span>

                                                            {/* 점 3개 (⋮) 더보기 메뉴 버튼 */}
                                                            <button
                                                                type="button"
                                                                className="eval-card-more-menu-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCardMenuOpenId(cardMenuOpenId === card.id ? null : card.id);
                                                                }}
                                                                title="평가 카드 수정 및 삭제"
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: '#94a3b8',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '17px',
                                                                    fontWeight: '900',
                                                                    lineHeight: 1,
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                ⋮
                                                            </button>

                                                            {/* 점 3개 드롭다운 팝오버 메뉴 */}
                                                            {cardMenuOpenId === card.id && (
                                                                <div
                                                                    className="eval-card-dropdown-popover"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: '100%',
                                                                        right: 0,
                                                                        background: '#ffffff',
                                                                        borderRadius: '10px',
                                                                        padding: '6px',
                                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                                                        border: '1px solid #e2e8f0',
                                                                        zIndex: 100,
                                                                        minWidth: '120px',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '3px'
                                                                    }}
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => handleOpenEditCard(e, card)}
                                                                        style={{
                                                                            background: 'transparent',
                                                                            border: 'none',
                                                                            padding: '6px 10px',
                                                                            borderRadius: '6px',
                                                                            fontSize: '12px',
                                                                            fontWeight: '700',
                                                                            color: '#334155',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            textAlign: 'left',
                                                                            width: '100%'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdf4'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                                        </svg>
                                                                        <span>정보 수정</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            setCardMenuOpenId(null);
                                                                            handleDeleteCard(e, card.id);
                                                                        }}
                                                                        style={{
                                                                            background: 'transparent',
                                                                            border: 'none',
                                                                            padding: '6px 10px',
                                                                            borderRadius: '6px',
                                                                            fontSize: '12px',
                                                                            fontWeight: '700',
                                                                            color: '#ef4444',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            textAlign: 'left',
                                                                            width: '100%'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                            <polyline points="3 6 5 6 21 6" />
                                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                                        </svg>
                                                                        <span>카드 삭제</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="eval-card-info">
                                                            <span>{card.isPerformance ? `${card.domain || ''} (${card.scheduleText || card.schedule || '미정'})` : criteria?.name || ''}</span>
                                                            {colCount > 0 && <span>{colCount}개 회차</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* 점선 평가 생성하기 카드 (과목 연동 단일 생성 카드) */}
                                            <div
                                                className="eval-card eval-card-create-dashed"
                                                onClick={() => {
                                                    setUnitCardGroupId(group.id);
                                                    setNewCardGroupId(group.id);
                                                    setGeneralCardGroupId(group.id);
                                                    setPerfSubject(group.name);
                                                    setPerfDomain('');
                                                    setShowAddCardModal(true);
                                                }}
                                            >
                                                <div className="dashed-create-inner">
                                                    <div className="dashed-create-icon-circle">
                                                        <PlusIcon />
                                                    </div>
                                                    <span className="dashed-create-text">평가 생성하기</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grade-empty-state" style={{ padding: '4rem 2rem' }}>
                        <FolderIcon />
                        <p style={{ fontWeight: '700', color: '#64748b' }}>아직 생성된 과목이 없습니다.</p>
                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px', marginBottom: '20px' }}>
                            기본 교과목(국어, 수학, 사회, 과학, 영어 등)을 자동 생성하거나 직접 새 과목을 만들어 보세요.
                        </p>
                        <div className="onboarding-options-wrapper" style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '24px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '700', color: '#475569' }}>
                                <input type="checkbox" checked={onboardCreateUnit} onChange={(e) => setOnboardCreateUnit(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                                <span>단원평가 자동 생성 (3회차 구성)</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '700', color: '#475569' }}>
                                <input type="checkbox" checked={onboardCreatePerformance} onChange={(e) => setOnboardCreatePerformance(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                                <span>수행평가 자동 생성 (2회차 구성)</span>
                            </label>
                        </div>
                        <button className="grade-btn-submit" onClick={handleCreateDefaultGroups} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <PlusIcon />
                            <span>기본 과목 일괄 생성</span>
                        </button>
                    </div>
                )
            )}

            {/* ── 과목 설정 모달 (교과목 카드 토글 방식) ── */}
            {showAddGroupModal && (
                <div className="grade-modal-overlay" onClick={() => setShowAddGroupModal(false)}>
                    <div className="grade-modal" style={{ maxWidth: '540px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
                        <div className="grade-modal-top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <SettingsIcon />
                                <h3 style={{ margin: 0 }}>과목 설정</h3>
                            </div>
                            <button className="grade-modal-close" onClick={() => setShowAddGroupModal(false)}>✕</button>
                        </div>

                        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 16px 0', lineHeight: '1.5' }}>
                            카드를 클릭하여 학급에서 관리할 교과목을 즉시 켜거나(활성화) 끄세요.
                        </p>

                        {/* 기본 11대 교과목 카드/칩 토글 그리드 */}
                        <div className="subject-setting-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px', marginBottom: '24px' }}>
                            {['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과', '통합교과'].map(subjectName => {
                                const isActive = groups.some(g => g.name === subjectName);
                                return (
                                    <div
                                        key={subjectName}
                                        className={`subject-toggle-card ${isActive ? 'active' : ''}`}
                                        onClick={() => handleToggleSubject(subjectName)}
                                        style={{
                                            padding: '12px 10px',
                                            borderRadius: '12px',
                                            border: isActive ? '1.8px solid #16a34a' : '1px solid #e2e8f0',
                                            background: isActive ? '#f0fdf4' : '#ffffff',
                                            color: isActive ? '#15803d' : '#64748b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justify: 'space-between',
                                            fontWeight: '700',
                                            fontSize: '13.5px',
                                            boxShadow: isActive ? '0 2px 8px rgba(22, 163, 74, 0.12)' : 'none',
                                            transition: 'all 0.18s ease'
                                        }}
                                    >
                                        <span>{subjectName}</span>
                                        {isActive && (
                                            <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center' }}>
                                                <CheckIcon />
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* 커스텀 사용자 정의 과목 직접 추가 */}
                        <form onSubmit={handleAddGroup} className="grade-modal-form" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                            <div className="grade-form-group">
                                <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>기타 과목 직접 추가</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        className="grade-form-input"
                                        placeholder="예: 자율, 창체, 동아리 등"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <button type="submit" className="grade-btn-submit" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                                        과목 추가
                                    </button>
                                </div>
                            </div>
                            <div className="grade-modal-actions" style={{ marginTop: '16px' }}>
                                <button type="button" className="grade-btn-cancel" onClick={() => setShowAddGroupModal(false)} style={{ width: '100%' }}>
                                    설정 완료
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── 평가 추가 모달 (수행평가 계획 생성 vs 일반/단원 평가 탭) ── */}
            {showAddCardModal && (
                <div className="grade-modal-overlay" onClick={() => setShowAddCardModal(false)}>
                    <div className="grade-modal perf-modal-wide" style={{ maxWidth: '580px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
                        <div className="grade-modal-top">
                            <h3>평가 추가</h3>
                            <button className="grade-modal-close" onClick={() => setShowAddCardModal(false)}>✕</button>
                        </div>

                        {/* 모달 상단 탭: 단원평가 vs 수행평가 vs 일반평가 */}
                        <div className="card-add-modal-tabs">
                            <button
                                type="button"
                                className={`card-modal-tab-btn ${cardAddTab === 'unit' ? 'active' : ''}`}
                                onClick={() => setCardAddTab('unit')}
                            >
                                단원평가
                            </button>
                            <button
                                type="button"
                                className={`card-modal-tab-btn ${cardAddTab === 'performance' ? 'active' : ''}`}
                                onClick={() => setCardAddTab('performance')}
                            >
                                수행평가
                            </button>
                            <button
                                type="button"
                                className={`card-modal-tab-btn ${cardAddTab === 'general' ? 'active' : ''}`}
                                onClick={() => setCardAddTab('general')}
                            >
                                일반평가
                            </button>
                        </div>

                        {cardAddTab === 'unit' && (
                            /* 단원평가 등록 폼 */
                            <form onSubmit={handleAddUnitCard} className="grade-modal-form">
                                <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>성적 리포트 반영</span>
                                    <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: '600' }}>단원평가 결과는 학생 성적 분석 리포트에 반영됩니다.</span>
                                </div>

                                <div className="grade-form-group">
                                    <label>과목 선택</label>
                                    <div className="modal-group-cards-flex">
                                        {groups.map(g => (
                                            <div
                                                key={g.id}
                                                className={`group-select-chip ${unitCardGroupId === g.id ? 'active' : ''}`}
                                                onClick={() => setUnitCardGroupId(g.id)}
                                            >
                                                <FolderIcon />
                                                <span>{g.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grade-form-group">
                                    <label>평가 방식</label>
                                    <select
                                        className="grade-form-select"
                                        value={unitCardCriteriaId}
                                        onChange={(e) => setUnitCardCriteriaId(e.target.value)}
                                    >
                                        {criteriaTemplates.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                        💡 기본 5개 단원(1단원~5단원)이 자동 생성되며, 생성 즉시 명렬표 점수 입력 화면으로 이동합니다.
                                    </p>
                                </div>
                                <div className="grade-modal-actions">
                                    <button type="button" className="grade-btn-cancel" onClick={() => setShowAddCardModal(false)}>취소</button>
                                    <button type="submit" className="grade-btn-submit">단원평가 생성</button>
                                </div>
                            </form>
                        )}

                        {cardAddTab === 'performance' && (
                            /* 수행평가 전용 등록 폼 (간결하고 직관적인 구성) */
                            <form onSubmit={handleAddPerformanceCard} className="grade-modal-form">
                                <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>성적 리포트 반영</span>
                                    <span style={{ fontSize: '12px', color: '#166534', fontWeight: '600' }}>수행평가 결과는 학생 성적 분석 리포트에 반영됩니다.</span>
                                </div>

                                <div className="grade-form-group">
                                    <label>과목 선택</label>
                                    <div className="modal-group-cards-flex">
                                        {groups.map(g => (
                                            <div
                                                key={g.id}
                                                className={`group-select-chip ${newCardGroupId === g.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setNewCardGroupId(g.id);
                                                    setPerfSubject(g.name);
                                                    setPerfDomain('');
                                                }}
                                            >
                                                <FolderIcon />
                                                <span>{g.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(() => {
                                    const selectedGroup = groups.find(g => g.id === newCardGroupId);
                                    const currentSubject = selectedGroup?.name || perfSubject || '국어';
                                    
                                    // 1. 해당 과목에 존재하는 모든 초등 교육과정 표준 영역들을 스마트 병합
                                    const domainsSet = new Set();
                                    
                                    // 현재 학급 학년군 영역 우선 추가
                                    const curLevelMap = ELEMENTARY_CURRICULUM[classGradeBand]?.[currentSubject];
                                    if (curLevelMap) Object.keys(curLevelMap).forEach(d => domainsSet.add(d));

                                    // 전 학년군 표준 영역 병합 (누락 방지)
                                    ['1-2', '3-4', '5-6'].forEach(lvl => {
                                        const dMap = ELEMENTARY_CURRICULUM[lvl]?.[currentSubject];
                                        if (dMap) Object.keys(dMap).forEach(d => domainsSet.add(d));
                                    });

                                    // 대표 교과목 표준 영역 fallback (통합 보강)
                                    const STANDARD_SUBJECT_DOMAINS = {
                                        '국어': ['듣기·말하기', '읽기', '쓰기', '문법', '문학', '매체'],
                                        '수학': ['수와 연산', '도형과 측정', '변화와 관계', '자료와 가능성'],
                                        '사회': ['지리 인식', '자연환경과 인간생활', '인문환경과 인간생활', '지속가능한 세계', '정치', '법', '경제', '사회·문화', '역사', '지역사', '한국사'],
                                        '과학': ['운동과 에너지', '물질', '생명', '지구와 우주', '과학과 사회'],
                                        '영어': ['이해', '표현', '듣기·말하기', '읽기·쓰기'],
                                        '도덕': ['자신과의 관계', '타인과의 관계', '사회·공동체와의 관계', '자연과의 관계'],
                                        '체육': ['운동', '스포츠', '표현', '건강', '안전'],
                                        '음악': ['연주', '감상', '창작', '표현', '생활화'],
                                        '미술': ['미적 체험', '표현', '감상'],
                                        '실과': ['인간발달과 가족', '기술의 세계', '정보와 SW', '지속가능한 삶', '가정생활', '기술활용'],
                                        '통합교과': ['우리는 누구로 살아갈까', '우리는 어디서 살아갈까', '우리는 지금 어떻게 살아갈까', '우리는 무엇을 하며 살아갈까', '봄', '여름', '가을', '겨울']
                                    };

                                    if (STANDARD_SUBJECT_DOMAINS[currentSubject]) {
                                        STANDARD_SUBJECT_DOMAINS[currentSubject].forEach(d => domainsSet.add(d));
                                    }

                                    const domainsList = Array.from(domainsSet);

                                    return (
                                        <>
                                            <div className="grade-form-group">
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                    <label>영역 선택 / 직접 입력</label>
                                                    {perfDomain && !domainsList.includes(perfDomain) && (
                                                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '700' }}>직접 작성 영역</span>
                                                    )}
                                                </div>
                                                {domainsList.length > 0 && (
                                                    <div className="domain-select-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                                                        {domainsList.map(dom => (
                                                            <button
                                                                key={dom}
                                                                type="button"
                                                                className={`domain-chip-btn ${perfDomain === dom ? 'active' : ''}`}
                                                                onClick={() => setPerfDomain(dom)}
                                                            >
                                                                {dom}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <input
                                                    type="text"
                                                    className="grade-form-input"
                                                    placeholder="위 칩을 누르거나 직접 영역명을 입력할 수 있습니다"
                                                    value={perfDomain}
                                                    onChange={(e) => setPerfDomain(e.target.value)}
                                                    style={{ padding: '6px 8px', fontSize: '13px' }}
                                                />
                                            </div>

                                            <div className="grade-form-group">
                                                <label>단원명</label>
                                                <input
                                                    type="text"
                                                    className="grade-form-input"
                                                    placeholder="예: 4. 분수의 덧셈과 뺄셈, 3. 마음을 담아서"
                                                    value={perfUnitName}
                                                    onChange={(e) => setPerfUnitName(e.target.value)}
                                                />
                                            </div>

                                            <div className="grade-form-group">
                                                <label>평가 요소</label>
                                                <textarea
                                                    className="grade-form-textarea"
                                                    rows={2}
                                                    placeholder="예: 분수의 뺄셈 원리를 이해하고 계산 과정을 설명할 수 있는가?"
                                                    value={perfEvalElement}
                                                    onChange={(e) => setPerfEvalElement(e.target.value)}
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                />
                                            </div>

                                            {/* 간결한 한 줄 예정 시기 & 알림 체크 */}
                                            <div className="grade-form-group" style={{ margin: '4px 0 8px 0' }}>
                                                <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: '700' }}>평가 예정 시기 (선택)</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <input
                                                        type="text"
                                                        className="grade-form-input"
                                                        placeholder="예: 5월 3주차, 10월 말"
                                                        value={perfSchedule}
                                                        onChange={(e) => setPerfSchedule(e.target.value)}
                                                        style={{ flex: 1, padding: '7px 10px', fontSize: '13px' }}
                                                    />
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#334155', fontWeight: '700', whiteSpace: 'nowrap', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={perfEnableAlarm}
                                                            onChange={(e) => setPerfEnableAlarm(e.target.checked)}
                                                            style={{ width: '15px', height: '15px', accentColor: '#16a34a' }}
                                                        />
                                                        <span>일정 알림</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}

                                <div className="grade-modal-actions" style={{ marginTop: '6px' }}>
                                    <button type="button" className="grade-btn-cancel" onClick={() => setShowAddCardModal(false)}>취소</button>
                                    <button type="submit" className="grade-btn-submit">수행평가 생성</button>
                                </div>
                            </form>
                        )}

                        {cardAddTab === 'general' && (
                            /* 일반평가 등록 폼 */
                            <form onSubmit={handleAddGeneralCard} className="grade-modal-form">
                                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>리포트 미반영</span>
                                    <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: '600' }}>일반평가(쪽지시험, 형성평가 등)는 학생 성적 분석 리포트에 반영되지 않습니다.</span>
                                </div>

                                <div className="grade-form-group">
                                    <label>과목 선택</label>
                                    <div className="modal-group-cards-flex">
                                        {groups.map(g => (
                                            <div
                                                key={g.id}
                                                className={`group-select-chip ${generalCardGroupId === g.id ? 'active' : ''}`}
                                                onClick={() => setGeneralCardGroupId(g.id)}
                                            >
                                                <FolderIcon />
                                                <span>{g.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grade-form-group">
                                    <label>평가 이름</label>
                                    <input
                                        type="text"
                                        className="grade-form-input"
                                        placeholder="예: 어휘 쪽지시험, 받아쓰기, 형성평가"
                                        value={generalCardName}
                                        onChange={(e) => setGeneralCardName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="grade-form-group">
                                    <label>평가 방식</label>
                                    <select
                                        className="grade-form-select"
                                        value={generalCardCriteriaId}
                                        onChange={(e) => setGeneralCardCriteriaId(e.target.value)}
                                    >
                                        {criteriaTemplates.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                        💡 기본 5개 회차(1회차~5회차)가 자동 생성됩니다.
                                    </p>
                                </div>
                                <div className="grade-modal-actions">
                                    <button type="button" className="grade-btn-cancel" onClick={() => setShowAddCardModal(false)}>취소</button>
                                    <button type="submit" className="grade-btn-submit">일반평가 생성</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* 토스트 알림 안내 */}
            {toastMessage && (
                <div className="grade-toast-notification">
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* ── 커스텀 알림/확인 모달 팝업 (알버트 대체) ── */}
            {alertDialog.show && (
                <div className="grade-modal-overlay" onClick={closeAlertDialog}>
                    <div className="grade-modal alert-dialog-box" onClick={(e) => e.stopPropagation()}>
                        <div className="grade-modal-top">
                            <h3>{alertDialog.title}</h3>
                            <button className="grade-modal-close" onClick={closeAlertDialog}>✕</button>
                        </div>
                        <div className="alert-dialog-body">
                            <p>{alertDialog.message}</p>
                        </div>
                        <div className="grade-modal-actions">
                            {alertDialog.type === 'confirm' ? (
                                <>
                                    <button type="button" className="grade-btn-cancel" onClick={closeAlertDialog}>취소</button>
                                    <button
                                        type="button"
                                        className="grade-btn-submit"
                                        onClick={() => {
                                            if (alertDialog.onConfirm) alertDialog.onConfirm();
                                            closeAlertDialog();
                                        }}
                                    >
                                        확인
                                    </button>
                                </>
                            ) : (
                                <button type="button" className="grade-btn-submit" onClick={closeAlertDialog}>확인</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* ── 성적 분석 리포트 모달 ── */}
            {showAnalysisModal && selectedStudent && analysis && (
                <div className="grade-analysis-modal-overlay" onClick={() => setShowAnalysisModal(false)}>
                    <div className="grade-analysis-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="grade-analysis-modal-top no-print">
                            <h3>{selectedStudent.name} 학생 {selectedSemester}학기 성적분석리포트</h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button 
                                    className="grade-print-btn pdf-download-btn" 
                                    onClick={handleDownloadReportPdf}
                                    disabled={isExportingPdf}
                                    title="화면에 보이는 성적분석 리포트를 A4 규격 PDF로 즉시 다운로드합니다."
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    {isExportingPdf ? 'PDF 생성 중...' : 'PDF 다운로드'}
                                </button>
                                <button className="grade-analysis-modal-close" onClick={() => setShowAnalysisModal(false)}>✕</button>
                            </div>
                        </div>

                        {/* 인쇄 시에만 나타나는 프린트 전용 헤더 */}
                        <div className="print-only-header">
                            <h2>학생 성적 분석 결과지 (리포트)</h2>
                            <div className="print-profile-info">
                                <span><strong>학급:</strong> {currentClass?.name || '학급'}</span>
                                <span><strong>번호:</strong> {selectedStudent.attendanceNumber}번</span>
                                <span><strong>이름:</strong> {selectedStudent.name}</span>
                                <span><strong>성별:</strong> {selectedStudent.gender}</span>
                            </div>
                        </div>

                        <div className="grade-analysis-modal-content">
                            {/* 1. 요약 KPI 그리드 */}
                            <div className="dashboard-kpi-grid">
                                <div className="kpi-card">
                                    <span className="kpi-title">종합 성취도 (단원평가)</span>
                                    <span className="kpi-value">
                                        {analysis.currentStudentOverall !== null ? `${Math.round(analysis.currentStudentOverall)}점` : '-'}
                                    </span>
                                    <span className="kpi-subtitle">
                                        학급 평균: {analysis.overallClassAvg !== null ? `${Math.round(analysis.overallClassAvg)}점` : '-'}
                                    </span>
                                </div>
                                <div className="kpi-card highlight-green">
                                    <span className="kpi-title">종합 성취 수준</span>
                                    <span className="kpi-value" style={{ 
                                        color: analysis.overallAchievement ? analysis.overallAchievement.color : '#15803d',
                                        fontSize: '1.5rem',
                                        fontWeight: '800'
                                    }}>
                                        {analysis.overallAchievement ? `${analysis.overallAchievement.label}` : '-'}
                                    </span>
                                    <span className="kpi-subtitle" style={{ color: '#166534', fontWeight: '700' }}>
                                        {analysis.overallAchievement ? analysis.overallAchievement.desc : '단원평가 기준'}
                                    </span>
                                </div>
                                <div className="kpi-card highlight-green">
                                    <span className="kpi-title">최고 성취 교과</span>
                                    <span className="kpi-value-small">
                                        {analysis.bestSubject ? analysis.bestSubject.name : '-'}
                                    </span>
                                    <span className="kpi-subtitle">
                                        {analysis.bestSubject && analysis.bestSubject.studentSubjectAvg !== null ? `${analysis.bestSubject.subjectAchievement?.label || ''} (${Math.round(analysis.bestSubject.studentSubjectAvg)}점)` : '-'}
                                    </span>
                                </div>
                                <div className="kpi-card highlight-red">
                                    <span className="kpi-title">보완 필요 교과</span>
                                    <span className="kpi-value-small">
                                        {analysis.worstSubject ? analysis.worstSubject.name : '-'}
                                    </span>
                                    <span className="kpi-subtitle">
                                        {analysis.worstSubject && analysis.worstSubject.studentSubjectAvg !== null ? `${analysis.worstSubject.subjectAchievement?.label || ''} (${Math.round(analysis.worstSubject.studentSubjectAvg)}점)` : '-'}
                                    </span>
                                </div>
                            </div>

                            {/* 2. 교과별 성적 성취율 및 학급 평균 대비 */}
                            {analysis.subjectAnalyses.length > 0 && (
                                <div className="dashboard-chart-section">
                                    <h4 className="section-title">📊 교과별 성적 성취 수준 및 학급 평균 대비 (단원평가 기준)</h4>
                                    <div className="chart-bars-list">
                                        {analysis.subjectAnalyses.map(g => {
                                            const studentScore = g.studentSubjectAvg !== null ? Math.round(g.studentSubjectAvg) : 0;
                                            const classScore = g.classSubjectAvg !== null ? Math.round(g.classSubjectAvg) : 0;
                                            const diff = studentScore - classScore;
                                            const ach = g.subjectAchievement;

                                            return (
                                                <div key={g.id} className="chart-bar-item">
                                                    <div className="bar-label-group">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span className="bar-subject-name">{g.name}</span>
                                                            {ach && (
                                                                <span style={{ 
                                                                    fontSize: '11.5px', 
                                                                    fontWeight: '800', 
                                                                    background: ach.bg, 
                                                                    color: ach.color, 
                                                                    padding: '2px 8px', 
                                                                    borderRadius: '6px', 
                                                                    border: `1px solid ${ach.border}` 
                                                                }}>
                                                                    {ach.label} ({studentScore}점)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="bar-comparison-text">
                                                            본인: <strong>{studentScore}점</strong> | 학급평균: {classScore}점
                                                            <span className={`diff-badge ${diff >= 0 ? 'plus' : 'minus'}`} style={{ marginLeft: '6px' }}>
                                                                {diff >= 0 ? ` (+${diff}점)` : ` (${diff}점)`}
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <div className="bar-track-wrapper">
                                                        <div className="bar-track student-track" title={`학생: ${studentScore}점`}>
                                                            <div className="bar-fill student-fill" style={{ width: `${Math.min(100, studentScore)}%` }}></div>
                                                        </div>
                                                        <div className="bar-track class-track" title={`학급 평균: ${classScore}점`}>
                                                            <div className="bar-fill class-fill" style={{ width: `${Math.min(100, classScore)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 3. 단원평가 단원별 성적: 듀얼 세로 막대 + 꺾은선 혼합 차트 */}
                            {analysis.subjectAnalyses.some(g => g.cards.some(c => c.columns.some(col => col.studentVal !== null))) && (
                                <div className="dashboard-trend-section">
                                    <h4 className="section-title">📈 단원평가 단원(회차)별 성적 & 학급 평균 비교</h4>
                                    <div className="trend-charts-grid">
                                        {analysis.subjectAnalyses.flatMap(g => {
                                            return g.cards.map(card => {
                                                const validCols = card.columns.filter(c => c.studentVal !== null);
                                                if (validCols.length === 0) return null;

                                                const chartW = 420;
                                                const chartH = 180;
                                                const padL = 40;
                                                const padR = 15;
                                                const padT = 20;
                                                const padB = 35;
                                                const innerW = chartW - padL - padR;
                                                const innerH = chartH - padT - padB;
                                                const barGroupWidth = innerW / validCols.length;
                                                const barW = Math.min(24, barGroupWidth * 0.32);
                                                const barGap = 4;

                                                const maxVal = Math.max(100, ...validCols.map(c => Math.max(c.studentVal || 0, c.classAvg || 0)));
                                                const yScale = (v) => padT + innerH - (v / maxVal) * innerH;
                                                const xCenter = (i) => padL + barGroupWidth * i + barGroupWidth / 2;

                                                const avgLinePts = validCols.map((c, i) => ({ x: xCenter(i), y: yScale(c.classAvg || 0) }));
                                                const avgLinePath = avgLinePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

                                                return (
                                                    <div key={card.id} className="trend-chart-card">
                                                        <span className="trend-chart-subject">
                                                            <span style={{ background: '#0284c7', color: '#fff', fontSize: '10.5px', fontWeight: '800', padding: '1px 6px', borderRadius: '4px', marginRight: '6px' }}>
                                                                {g.name}
                                                            </span>
                                                            {card.name}
                                                        </span>
                                                        <div className="trend-svg-wrapper">
                                                            <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH}>
                                                                {[0, 25, 50, 75, 100].map(v => (
                                                                    <g key={`gy-${v}`}>
                                                                        <line x1={padL} y1={yScale(v)} x2={chartW - padR} y2={yScale(v)} stroke="#f1f5f9" strokeWidth="1" />
                                                                        <text x={padL - 6} y={yScale(v)} textAnchor="end" dominantBaseline="central" fontSize="9" fill="#94a3b8" fontWeight="600" className="chart-text">{v}</text>
                                                                    </g>
                                                                ))}
                                                                {validCols.map((col, i) => {
                                                                    const xC = xCenter(i);
                                                                    const sH = ((col.studentVal || 0) / maxVal) * innerH;
                                                                    const cH = ((col.classAvg || 0) / maxVal) * innerH;
                                                                    return (
                                                                        <g key={col.id}>
                                                                            <rect x={xC + barGap / 2} y={yScale(col.classAvg || 0)} width={barW} height={cH} rx="3" fill="#cbd5e1" />
                                                                            <rect x={xC - barW - barGap / 2} y={yScale(col.studentVal || 0)} width={barW} height={sH} rx="3" fill="#16a34a" />
                                                                            <text x={xC - barGap / 2 - barW / 2} y={yScale(col.studentVal || 0) - 5} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#15803d" className="chart-text">
                                                                                {col.studentVal}
                                                                            </text>
                                                                            <text x={xC} y={chartH - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569" className="chart-text">
                                                                                {col.name}
                                                                            </text>
                                                                        </g>
                                                                    );
                                                                })}
                                                                <path d={avgLinePath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                                                {avgLinePts.map((p, i) => (
                                                                    <rect key={`ap-${i}`} x={p.x - 3} y={p.y - 3} width="6" height="6" rx="1" fill="#94a3b8" />
                                                                ))}
                                                            </svg>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center', marginTop: '2px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#16a34a' }}></div>
                                                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#15803d' }}>학생 점수</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#cbd5e1' }}></div>
                                                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#64748b' }}>학급 평균</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ width: '14px', height: '0', borderTop: '2px dashed #94a3b8' }}></div>
                                                                <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#64748b' }}>평균 추이</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        }).filter(Boolean)}
                                    </div>
                                </div>
                            )}

                            {/* 4. 과정중심 수행평가 달성 현황 (평가요소 & 척도 분포) - 2열 콤팩트 그리드 */}
                            {analysis.perfAnalyses && analysis.perfAnalyses.length > 0 && (
                                <div className="dashboard-perf-section" style={{ marginTop: '12px' }}>
                                    <h4 className="section-title">📗 과정중심 수행평가 달성 현황 (평가요소 & 학급 척도 분포)</h4>
                                    <div className="perf-compare-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                        {analysis.perfAnalyses.map(item => {
                                            const totalRated = item.ratedCount || 1;
                                            const countVeryGood = item.distribution['◎'] || item.distribution['매우우수'] || 0;
                                            const countGood = item.distribution['◯'] || item.distribution['보통'] || item.distribution['우수'] || 0;
                                            const countNeedEffort = item.distribution['△'] || item.distribution['미흡'] || item.distribution['매우미흡'] || 0;

                                            const pctVeryGood = Math.round((countVeryGood / totalRated) * 100);
                                            const pctGood = Math.round((countGood / totalRated) * 100);
                                            const pctNeedEffort = Math.round((countNeedEffort / totalRated) * 100);

                                            return (
                                                <div key={item.id} className="perf-analysis-card" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '10.5px', fontWeight: '800', padding: '1px 6px', borderRadius: '4px' }}>
                                                                {item.subjectName}
                                                            </span>
                                                            <span style={{ fontSize: '10.5px', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px' }}>
                                                                {item.domain}
                                                            </span>
                                                        </div>
                                                        {item.schedule && (
                                                            <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#64748b' }}>
                                                                예정: {item.schedule}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h4 style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a', margin: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.unit}>
                                                        {item.unit}
                                                    </h4>

                                                    <div style={{ fontSize: '11.5px', color: '#334155', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                                                        <strong style={{ color: '#0f172a' }}>평가요소:</strong> {item.evalElement}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', padding: '6px 10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                        <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#15803d' }}>학생 척도</span>
                                                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#166534', background: '#ffffff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #86efac' }}>
                                                            {item.studentLabel || '미입력'}
                                                        </span>
                                                    </div>

                                                    {/* 학급 전체 척도 분포 */}
                                                    <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>
                                                            <span>학급 분포 ({totalRated}명)</span>
                                                            <span>◎ {pctVeryGood}% | ◯ {pctGood}% | △ {pctNeedEffort}%</span>
                                                        </div>
                                                        <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', gap: '1.5px' }}>
                                                            <div style={{ width: `${pctVeryGood}%`, background: '#22c55e' }} title={`◎: ${countVeryGood}명 (${pctVeryGood}%)`}></div>
                                                            <div style={{ width: `${pctGood}%`, background: '#94a3b8' }} title={`◯: ${countGood}명 (${pctGood}%)`}></div>
                                                            <div style={{ width: `${pctNeedEffort}%`, background: '#f87171' }} title={`△: ${countNeedEffort}명 (${pctNeedEffort}%)`}></div>
                                                        </div>
                                                    </div>

                                                    {item.studentRemark && (
                                                        <div style={{ fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '4px 8px', borderRadius: '6px', lineHeight: '1.35' }}>
                                                            <strong>비고:</strong> {item.studentRemark}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── 수행평가 & 평가 카드 정보 전체 수정 모달 ── */}
            {showEditCardModal && editingCard && (
                <div className="grade-modal-overlay" onClick={() => setShowEditCardModal(false)}>
                    <div className="grade-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="grade-modal-header">
                            <h3>✏️ {editingCard.isPerformance ? '수행평가 정보 수정' : '평가 정보 수정'}</h3>
                            <button className="grade-modal-close" onClick={() => setShowEditCardModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSaveCardFullEdit} className="grade-modal-form">
                            {editingCard.isPerformance && (
                                <div className="grade-form-group">
                                    <label>영역</label>
                                    <input
                                        type="text"
                                        className="grade-form-input"
                                        value={editingCard.domain || ''}
                                        onChange={(e) => setEditingCard({ ...editingCard, domain: e.target.value })}
                                        placeholder="예: 수와 연산, 읽기"
                                    />
                                </div>
                            )}

                            <div className="grade-form-group">
                                <label>{editingCard.isPerformance ? '단원명 / 평가명' : '평가 이름'}</label>
                                <input
                                    type="text"
                                    className="grade-form-input"
                                    value={editingCard.name || ''}
                                    onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })}
                                    required
                                    placeholder="단원명 또는 평가명을 입력하세요"
                                />
                            </div>

                            {editingCard.isPerformance && (
                                <>
                                    <div className="grade-form-group">
                                        <label>평가 요소 (성취기준)</label>
                                        <textarea
                                            className="grade-form-textarea"
                                            rows={2}
                                            value={editingCard.evalElement || ''}
                                            onChange={(e) => setEditingCard({ ...editingCard, evalElement: e.target.value })}
                                            placeholder="평가 요소를 입력하세요"
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                        />
                                    </div>

                                    <div className="grade-form-group">
                                        <label>평가 예정 시기</label>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                className="grade-form-input"
                                                value={editingCard.scheduleText || ''}
                                                onChange={(e) => setEditingCard({ ...editingCard, scheduleText: e.target.value })}
                                                placeholder="예: 5월 3주차, 6월 15일"
                                                style={{ flex: 1 }}
                                            />
                                            <input
                                                type="date"
                                                value={editingCard.scheduleDate || ''}
                                                onChange={(e) => setEditingCard({ ...editingCard, scheduleDate: e.target.value })}
                                                style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                                                title="달력에서 정확한 날짜 선택"
                                            />
                                        </div>
                                    </div>

                                    <div className="grade-form-group" style={{ margin: '4px 0 10px 0' }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#166534' }}>
                                            <input
                                                type="checkbox"
                                                checked={!!editingCard.hasAlarm}
                                                onChange={(e) => setEditingCard({ ...editingCard, hasAlarm: e.target.checked })}
                                                style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                                            />
                                            <span>대시보드 캘린더 및 주차 알림 등록</span>
                                        </label>
                                    </div>
                                </>
                            )}

                            <div className="grade-modal-actions">
                                <button type="button" className="grade-btn-cancel" onClick={() => setShowEditCardModal(false)}>취소</button>
                                <button type="submit" className="grade-btn-submit">수정 완료</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GradeManager;
