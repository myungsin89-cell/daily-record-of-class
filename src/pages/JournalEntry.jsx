import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { getData, STORES } from '../db/indexedDB';
import { trackEvent } from '../utils/analytics';
import './JournalEntry.css';

const TAG_OPTIONS = [
    { id: '수업태도', label: '수업태도', badgeClass: 'tag-emerald' },
    { id: '교우관계', label: '교우관계', badgeClass: 'tag-sky' },
    { id: '상담', label: '상담', badgeClass: 'tag-violet' },
    { id: '칭찬선행', label: '칭찬/선행', badgeClass: 'tag-amber' },
    { id: '지도주의', label: '지도/주의', badgeClass: 'tag-rose' },
    { id: '기타', label: '기타', badgeClass: 'tag-slate' }
];

const DEFAULT_SCORE_CARDS = [
    { id: 'default_1', type: 'merit', title: '수업 태도 우수', points: 1 },
    { id: 'default_2', type: 'demerit', title: '과제 미제출', points: -1 }
];

const JournalEntry = () => {
    const { showAlert, showConfirm } = useModal();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const classId = currentClass?.id || 'default';
    const storageKey = user ? `${user.username}_${classId}` : classId;

    const { students, journals, addJournalEntry, updateJournalEntry, deleteJournalEntry, attendance } = useStudentContext();
    
    // 메인 탭: 'scores' (학급보상) | 'journals' (누가기록)
    const [defaultTab, setDefaultTab] = useState(() => {
        return localStorage.getItem('journal_default_tab') || 'scores';
    });
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('journal_default_tab') || 'scores';
    });

    const handleSetDefaultTab = (tabKey) => {
        setDefaultTab(tabKey);
        localStorage.setItem('journal_default_tab', tabKey);
        setActiveTab(tabKey);
    };
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    // ==========================================
    // 1. 학급보상 (점수 카드 & 자리표) State
    // ==========================================
    const [scoreCards, setScoreCards] = useState([...DEFAULT_SCORE_CARDS]);
    const [studentScores, setStudentScores] = useState({});
    const [selectedCardForScoring, setSelectedCardForScoring] = useState(null);
    const [selectedStudentIdsForScoring, setSelectedStudentIdsForScoring] = useState([]);
    const [showCreateCardModal, setShowCreateCardModal] = useState(false);
    const [newCardTitle, setNewCardTitle] = useState('');
    const [newCardPoints, setNewCardPoints] = useState(1);
    const [showClassScoreModal, setShowClassScoreModal] = useState(false);
    const [detailStudentId, setDetailStudentId] = useState(null);
    const [manageRewardStudentId, setManageRewardStudentId] = useState(null);

    // 자리배치 레이아웃 State
    const [seatingLayout, setSeatingLayout] = useState(null);
    const [isTeacherView, setIsTeacherView] = useState(() => {
        const saved = localStorage.getItem('journal_seating_teacher_view');
        return saved !== 'false'; // 기본값: 선생님 시점 (칠판 아래)
    });

    const toggleTeacherView = () => {
        setIsTeacherView(prev => {
            const next = !prev;
            localStorage.setItem('journal_seating_teacher_view', next ? 'true' : 'false');
            return next;
        });
    };

    // 칠판 위치에 따른 실제 학생 자리 그리드 계산 (선생님 시점 = 180도 회전)
    const displaySeatingLayout = useMemo(() => {
        if (!seatingLayout || !Array.isArray(seatingLayout) || seatingLayout.length === 0) return null;
        if (isTeacherView) {
            return [...seatingLayout].reverse().map(row => [...row].reverse());
        } else {
            return seatingLayout;
        }
    }, [seatingLayout, isTeacherView]);

    // ==========================================
    // 2. 누가기록 State
    // ==========================================
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedTag, setSelectedTag] = useState('수업태도');
    const [entryContent, setEntryContent] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterTag, setFilterTag] = useState('all');
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [editTag, setEditTag] = useState('수업태도');

    // ==========================================
    // 학생 목록 정렬 및 필터링
    // ==========================================
    const sortedStudents = useMemo(() => {
        if (!students) return [];
        return [...students].sort((a, b) => Number(a.attendanceNumber || 0) - Number(b.attendanceNumber || 0));
    }, [students]);

    useEffect(() => {
        if (sortedStudents.length > 0 && !selectedStudentId) {
            setSelectedStudentId(sortedStudents[0].id);
        }
    }, [sortedStudents, selectedStudentId]);

    const selectedStudent = useMemo(() => {
        return sortedStudents.find(s => s.id === selectedStudentId) || sortedStudents[0] || null;
    }, [sortedStudents, selectedStudentId]);

    const filteredStudents = useMemo(() => {
        if (!studentSearch.trim()) return sortedStudents;
        const q = studentSearch.toLowerCase().trim();
        return sortedStudents.filter(s =>
            s.name.toLowerCase().includes(q) || String(s.attendanceNumber).includes(q)
        );
    }, [sortedStudents, studentSearch]);

    // ==========================================
    // 데이터 로드: 자리배치, 카드, 점수
    // ==========================================
    useEffect(() => {
        const loadSeating = async () => {
            try {
                let loadedGrid = null;
                if (currentClass?.id) {
                    const config = await getData(STORES.SEATING_CONFIGS, currentClass.id);
                    if (config?.grid && Array.isArray(config.grid) && config.grid.length > 0) {
                        loadedGrid = config.grid;
                    }
                }
                if (!loadedGrid) {
                    const raw = localStorage.getItem(`seating_layout_${currentClass?.id}`) 
                             || localStorage.getItem(`seating_layout_${storageKey}`)
                             || localStorage.getItem('seating_layout_default');
                    if (raw) {
                        loadedGrid = JSON.parse(raw);
                    }
                }
                setSeatingLayout(loadedGrid);
            } catch (e) {
                console.error('Failed to load seating layout in JournalEntry:', e);
                setSeatingLayout(null);
            }
        };
        loadSeating();
    }, [currentClass, storageKey]);

    useEffect(() => {
        try {
            const savedCards = localStorage.getItem(`custom_score_cards_${storageKey}`);
            if (savedCards) {
                setScoreCards(JSON.parse(savedCards));
            } else {
                setScoreCards([...DEFAULT_SCORE_CARDS]);
            }
        } catch (e) {
            console.error('Failed to load score cards:', e);
            setScoreCards([...DEFAULT_SCORE_CARDS]);
        }
    }, [storageKey]);

    const saveScoreCards = (newCards) => {
        setScoreCards(newCards);
        try {
            localStorage.setItem(`custom_score_cards_${storageKey}`, JSON.stringify(newCards));
        } catch (e) {
            console.error('Failed to save score cards:', e);
        }
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem(`student_scores_${storageKey}`);
            if (saved) {
                setStudentScores(JSON.parse(saved));
            } else {
                setStudentScores({});
            }
        } catch (e) {
            console.error('Failed to load student scores:', e);
        }
    }, [storageKey]);

    const saveScores = (newScores) => {
        setStudentScores(newScores);
        try {
            localStorage.setItem(`student_scores_${storageKey}`, JSON.stringify(newScores));
        } catch (e) {
            console.error('Failed to save student scores:', e);
        }
    };

    // ==========================================
    // 카드 점수 핸들러
    // ==========================================
    const handleCreateCardSubmit = (e) => {
        e.preventDefault();
        const trimmedTitle = newCardTitle.trim();
        if (!trimmedTitle) {
            showAlert('카드 이름을 입력해 주세요 (예: 봉사활동 참여, 발표 우수 등).', '카드 이름 필요', '확인', 'alert');
            return;
        }

        const pts = Number(newCardPoints);
        const newCard = {
            id: `card_${Date.now()}`,
            type: pts > 0 ? 'merit' : 'demerit',
            title: trimmedTitle,
            points: pts
        };

        const updatedCards = [...scoreCards, newCard];
        saveScoreCards(updatedCards);
        setNewCardTitle('');
        setNewCardPoints(1);
        setShowCreateCardModal(false);
    };

    const handleDeleteCard = async (e, cardId) => {
        e.stopPropagation();
        const confirmed = await showConfirm('이 카드를 삭제하시겠습니까?', '카드 삭제', '삭제', '취소');
        if (confirmed) {
            const updated = scoreCards.filter(c => c.id !== cardId);
            saveScoreCards(updated);
        }
    };

    const toggleStudentSelectionForScoring = (studentId) => {
        setSelectedStudentIdsForScoring(prev => {
            if (prev.includes(studentId)) {
                return prev.filter(id => id !== studentId);
            } else {
                return [...prev, studentId];
            }
        });
    };

    const handleSelectAllStudentsForScoring = () => {
        if (!students) return;
        if (selectedStudentIdsForScoring.length === students.length) {
            setSelectedStudentIdsForScoring([]);
        } else {
            setSelectedStudentIdsForScoring(students.map(s => s.id));
        }
    };

    const handleClearSelectedStudentsForScoring = () => {
        setSelectedStudentIdsForScoring([]);
    };

    const handleApplyScoreToSelectedStudents = async () => {
        if (!selectedCardForScoring) {
            await showAlert('부여할 카드를 좌측에서 먼저 선택해 주세요.', '카드 선택 필요', '확인', 'alert');
            return;
        }
        if (selectedStudentIdsForScoring.length === 0) {
            await showAlert('점수를 부여할 학생을 자리표에서 선택해 주세요.', '학생 선택 필요', '확인', 'alert');
            return;
        }

        const targetTitle = selectedCardForScoring.title;
        const targetPoints = Number(selectedCardForScoring.points);
        const updatedScores = { ...studentScores };
        let addedCount = 0;

        selectedStudentIdsForScoring.forEach(studentId => {
            const currentList = updatedScores[studentId] || [];
            const newRecord = {
                id: `score_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                reason: targetTitle,
                points: targetPoints,
                date: new Date().toISOString()
            };
            // 항상 새 카드를 누적으로 추가
            updatedScores[studentId] = [newRecord, ...currentList];
            addedCount += 1;
        });

        saveScores(updatedScores);

        showAlert(`${addedCount}명에게 [${targetTitle}] 카드가 부여되었습니다.`, '카드 부여 완료', '확인', 'success');

        setSelectedStudentIdsForScoring([]);
    };

    // 개별 학생의 특정 보상 카드 1건 취소(삭제)
    const handleDeleteStudentScoreItem = async (studentId, scoreItemId, scoreReason) => {
        const student = sortedStudents.find(s => s.id === studentId);
        const studentName = student ? `${student.name} 학생의 ` : '';
        const confirmed = await showConfirm(
            `${studentName}[${scoreReason || '선택한'}] 카드를 취소(삭제)하시겠습니까?`,
            '카드 부여 취소',
            '취소 실행',
            '닫기'
        );
        if (confirmed) {
            const currentList = studentScores[studentId] || [];
            let updated = currentList.filter(item => item.id !== scoreItemId);
            // 만약 id가 불일치하거나 레거시 데이터인 경우 매칭되는 첫 번째 항목 제거
            if (updated.length === currentList.length) {
                const idx = currentList.findIndex(item => item.id === scoreItemId || item.reason === scoreReason);
                if (idx !== -1) {
                    const copy = [...currentList];
                    copy.splice(idx, 1);
                    updated = copy;
                }
            }
            const newAllScores = { ...studentScores, [studentId]: updated };
            saveScores(newAllScores);
            showAlert(`[${scoreReason || '보상'}] 카드가 취소되었습니다.`, '취소 완료', '확인', 'success');
        }
    };

    // ==========================================
    // 상벌점 엑셀 다운로드 (행동특성 및 종합의견 작성용)
    // ==========================================
    const classScoreRankList = useMemo(() => {
        if (!sortedStudents || sortedStudents.length === 0) return [];
        return sortedStudents.map(student => {
            const list = studentScores[student.id] || [];
            let meritSum = 0;
            let demeritSum = 0;
            list.forEach(item => {
                if (item.points > 0) meritSum += item.points;
                else demeritSum += Math.abs(item.points);
            });
            const total = meritSum - demeritSum;
            return {
                id: student.id,
                attendanceNumber: student.attendanceNumber,
                name: student.name,
                meritSum,
                demeritSum,
                total
            };
        }).sort((a, b) => b.total - a.total);
    }, [sortedStudents, studentScores]);

    const handleExportClassScoreDetailsExcel = async () => {
        if (!sortedStudents || sortedStudents.length === 0) {
            showAlert('다운로드할 학생 명단이 없습니다.', '알림', '확인', 'alert');
            return;
        }

        const cardHeaders = scoreCards.map(c => `${c.title} (${c.points > 0 ? '+' : ''}${c.points}점)`);
        const headers = ['번호', '이름', ...cardHeaders, '상점 합계', '벌점 합계', '최종 총점'];

        const rows = sortedStudents.map(student => {
            const list = studentScores[student.id] || [];
            let meritSum = 0;
            let demeritSum = 0;
            list.forEach(item => {
                if (item.points > 0) meritSum += item.points;
                else demeritSum += Math.abs(item.points);
            });
            const total = meritSum - demeritSum;

            const cardCounts = scoreCards.map(c => {
                const count = list.filter(item => item.reason === c.title && Number(item.points) === Number(c.points)).length;
                return count > 0 ? count : 0;
            });

            return [
                student.attendanceNumber,
                student.name,
                ...cardCounts,
                meritSum,
                demeritSum,
                total
            ];
        });

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '학급카드현황_종합');
        XLSX.writeFile(workbook, `학급카드점수_행발종합_${new Date().toISOString().split('T')[0]}.xlsx`);
        showAlert('학급 카드 점수 현황 엑셀이 다운로드되었습니다.', '엑셀 다운로드 완료', '확인', 'success');
    };

    // ==========================================
    // 누가기록 핸들러
    // ==========================================
    const studentJournals = useMemo(() => {
        if (!selectedStudentId || !journals[selectedStudentId]) return [];
        return journals[selectedStudentId];
    }, [journals, selectedStudentId]);

    const filteredJournals = useMemo(() => {
        if (filterTag === 'all') return studentJournals;
        return studentJournals.filter(j => j.tag === filterTag);
    }, [studentJournals, filterTag]);

    const groupedJournals = useMemo(() => {
        const sorted = [...filteredJournals].sort((a, b) => new Date(b.date) - new Date(a.date));
        const groups = {};
        sorted.forEach(entry => {
            const dateKey = entry.date ? entry.date.split('T')[0] : '기타 일자';
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(entry);
        });
        return Object.entries(groups).map(([dateKey, entries]) => ({ dateKey, entries }));
    }, [filteredJournals]);

    const handleAddEntry = () => {
        if (!selectedStudentId) {
            showAlert('기록할 학생을 선택해 주세요.', '알림', '확인', 'alert');
            return;
        }
        if (!entryContent.trim()) {
            showAlert('행동 관찰 내용을 입력해 주세요.', '내용 필요', '확인', 'alert');
            return;
        }

        addJournalEntry(selectedStudentId, {
            date: selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString(),
            tag: selectedTag,
            content: entryContent.trim()
        });

        setEntryContent('');
        showAlert('관찰 기록이 저장되었습니다.', '저장 완료', '확인', 'success');
    };

    const handleStartEdit = (entry) => {
        setEditingId(entry.id);
        setEditContent(entry.content);
        setEditTag(entry.tag || '수업태도');
    };

    const handleSaveEdit = (entryId) => {
        if (!editContent.trim()) {
            showAlert('내용을 입력해 주세요.', '내용 필요', '확인', 'alert');
            return;
        }
        updateJournalEntry(selectedStudentId, entryId, {
            tag: editTag,
            content: editContent.trim()
        });
        setEditingId(null);
        showAlert('수정되었습니다.', '수정 완료', '확인', 'success');
    };

    const handleDeleteJournal = async (entryId) => {
        const confirmed = await showConfirm('이 누가기록을 삭제하시겠습니까?', '기록 삭제', '삭제', '취소');
        if (confirmed) {
            deleteJournalEntry(selectedStudentId, entryId);
            showAlert('기록이 삭제되었습니다.', '삭제 완료', '확인', 'success');
        }
    };

    // ==========================================
    // 학생 개인 종합 엑셀 다운로드 (행발 작성용 멀티 시트)
    // ==========================================
    const handleExportStudentExcel = () => {
        if (!selectedStudent) {
            showAlert('선택된 학생이 없습니다.', '알림', '확인', 'alert');
            return;
        }

        const workbook = XLSX.utils.book_new();

        // 1. [시트 1: 학생종합요약]
        const summaryRows = [
            ['[ 학생 기초 및 행발 핵심 종합 요약 ]'],
            ['학번/번호', selectedStudent.attendanceNumber, '성명', selectedStudent.name],
            ['기준일시', new Date().toLocaleString('ko-KR')],
            [''],
            ['[ 1. 출결 종합 통계 ]'],
            ['총 기록일수', `${studentAttendanceDetail.totalDays}일`, '정상 출석일수', `${studentAttendanceDetail.present}일`],
            ['출석률', `${studentAttendanceDetail.rate}%`, '결석(병결 등)', `${studentAttendanceDetail.absent}회`],
            ['지각', `${studentAttendanceDetail.late}회`, '조퇴/결과', `${studentAttendanceDetail.early + studentAttendanceDetail.result}회`],
            ['체험학습', `${studentAttendanceDetail.fieldtrip}회`, '출결 특이사항 건수', `${studentAttendanceDetail.records.length}건`],
            [''],
            ['[ 2. 학급 보상 카드 통계 ]'],
            ['발급 카드 총합', `${selectedStudentRewardData.totalCardsCount}장`, '최종 총점', `${selectedStudentRewardData.totalPoints > 0 ? '+' : ''}${selectedStudentRewardData.totalPoints}점`],
            ['상점 합계', `+${selectedStudentRewardData.meritSum}점`, '벌점 합계', `-${selectedStudentRewardData.demeritSum}점`],
            ['주요 획득 카드', selectedStudentRewardData.cardSummaryList.map(c => `${c.reason}(${c.count}회)`).join(', ') || '없음'],
            [''],
            ['[ 3. 누가기록 관찰일지 요약 ]'],
            ['누가기록 작성 건수', `${studentJournals.length}건`],
            ['작성된 태그 분포', TAG_OPTIONS.map(t => {
                const cnt = studentJournals.filter(j => j.tag === t.id).length;
                return cnt > 0 ? `${t.label}(${cnt}건)` : null;
            }).filter(Boolean).join(', ') || '기록 없음']
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(workbook, wsSummary, '학생종합요약');

        // 2. [시트 2: 누가기록상세]
        const journalHeaders = ['번호', '이름', '일자', '시간', '태그', '관찰 내용'];
        const journalData = studentJournals.map(j => {
            const dateObj = new Date(j.date);
            return [
                selectedStudent.attendanceNumber,
                selectedStudent.name,
                dateObj.toLocaleDateString('ko-KR'),
                dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                j.tag || '기타',
                j.content
            ];
        });
        const wsJournals = XLSX.utils.aoa_to_sheet([journalHeaders, ...journalData]);
        XLSX.utils.book_append_sheet(workbook, wsJournals, '누가기록상세');

        // 3. [시트 3: 출결특이사항]
        const attHeaders = ['일자', '출결상태', '사유 및 메모'];
        const attData = studentAttendanceDetail.records.map(r => [
            r.date,
            getStatusBadgeLabel(r.status),
            r.note || '(사유 미입력)'
        ]);
        const wsAtt = XLSX.utils.aoa_to_sheet([attHeaders, ...attData]);
        XLSX.utils.book_append_sheet(workbook, wsAtt, '출결특이사항');

        XLSX.writeFile(workbook, `${selectedStudent.attendanceNumber}번_${selectedStudent.name}_행발종합기록_${new Date().toISOString().split('T')[0]}.xlsx`);
        trackEvent('export_student_excel', { student_name: selectedStudent.name });
        showAlert(`${selectedStudent.name} 학생의 행발 종합 엑셀이 다운로드되었습니다.`, '엑셀 다운로드 완료', '확인', 'success');
    };

    // ==========================================
    // 학급 전체 종합 엑셀 다운로드 (행발 AI 잼 프롬프트 연계용 멀티 시트)
    // ==========================================
    const handleExportAllStudentsExcel = () => {
        if (!sortedStudents || sortedStudents.length === 0) {
            showAlert('학생 명단이 없습니다.', '알림', '확인', 'alert');
            return;
        }

        const workbook = XLSX.utils.book_new();

        // -------------------------------------------------------------
        // 1. [시트 1: 📋 행발_AI_종합요약] (AI 프롬프트 복사용 최적화)
        // -------------------------------------------------------------
        const aiSummaryHeaders = [
            '번호',
            '이름',
            '출석률(%)',
            '출결 요약 (특이사항)',
            '상벌점 총점',
            '주요 획득 카드 (강점/태도)',
            '누가기록 건수',
            '누가기록 종합 요약 (AI 참조용 상세 텍스트)'
        ];

        const aiSummaryRows = sortedStudents.map(student => {
            // 학생 출결 집계
            let stPresent = 0; let stAbsent = 0; let stLate = 0; let stEarly = 0; let stFieldtrip = 0; let stTotalDays = 0;
            const attIssues = [];
            if (attendance) {
                Object.keys(attendance).forEach(dKey => {
                    const dayData = attendance[dKey]?.[student.id];
                    if (dayData && dayData.status) {
                        stTotalDays += 1;
                        const st = dayData.status;
                        if (st === 'present') stPresent += 1;
                        else if (st.includes('absent')) stAbsent += 1;
                        else if (st.includes('late')) stLate += 1;
                        else if (st.includes('early') || st.includes('result')) stEarly += 1;
                        else if (st === 'fieldtrip') stFieldtrip += 1;

                        if (st !== 'present') {
                            attIssues.push(`${dKey}(${getStatusBadgeLabel(st)}${dayData.reason ? `: ${dayData.reason}` : ''})`);
                        }
                    }
                });
            }
            const rate = stTotalDays > 0 ? Math.round(((stPresent + stFieldtrip) / stTotalDays) * 100) : 100;
            let attSummaryText = '개근 (특이사항 없음)';
            if (attIssues.length > 0) {
                const parts = [];
                if (stAbsent > 0) parts.push(`결석 ${stAbsent}회`);
                if (stLate > 0) parts.push(`지각 ${stLate}회`);
                if (stEarly > 0) parts.push(`조퇴/결과 ${stEarly}회`);
                if (stFieldtrip > 0) parts.push(`체험학습 ${stFieldtrip}회`);
                attSummaryText = `${parts.join(', ')} [${attIssues.slice(0, 3).join('; ')}${attIssues.length > 3 ? ' 외' : ''}]`;
            }

            // 학생 보상 카드 집계
            const scoreList = studentScores[student.id] || [];
            let meritSum = 0; let demeritSum = 0;
            const cardMap = {};
            scoreList.forEach(item => {
                const pts = Number(item.points) || 0;
                if (pts > 0) meritSum += pts;
                else demeritSum += Math.abs(pts);
                cardMap[item.reason] = (cardMap[item.reason] || 0) + 1;
            });
            const totalScore = meritSum - demeritSum;
            const topCards = Object.entries(cardMap)
                .map(([reason, count]) => `${reason}(${count}회)`)
                .join(', ') || '받은 카드 없음';

            // 학생 누가기록 관찰 내용 결합
            const jList = journals[student.id] || [];
            const sortedJList = [...jList].sort((a, b) => new Date(a.date) - new Date(b.date));
            const journalCombinedText = sortedJList.length > 0
                ? sortedJList.map((j, idx) => `[${j.date ? j.date.split('T')[0] : '일자미상'} | ${j.tag || '일반'}] ${j.content}`).join('\n')
                : '작성된 관찰 기록 없음';

            return [
                student.attendanceNumber,
                student.name,
                `${rate}%`,
                attSummaryText,
                `${totalScore > 0 ? '+' : ''}${totalScore}점 (상:${meritSum}, 벌:${demeritSum})`,
                topCards,
                `${sortedJList.length}건`,
                journalCombinedText
            ];
        });

        const wsAiSummary = XLSX.utils.aoa_to_sheet([aiSummaryHeaders, ...aiSummaryRows]);
        XLSX.utils.book_append_sheet(workbook, wsAiSummary, '행발_AI_종합요약');

        // -------------------------------------------------------------
        // 2. [시트 2: 📝 누가기록_전체일지]
        // -------------------------------------------------------------
        const allJournalHeaders = ['번호', '이름', '날짜', '시간', '태그', '관찰 내용'];
        const allJournalData = [];

        sortedStudents.forEach(student => {
            const list = journals[student.id] || [];
            list.forEach(j => {
                const dateObj = new Date(j.date);
                allJournalData.push([
                    student.attendanceNumber,
                    student.name,
                    dateObj.toLocaleDateString('ko-KR'),
                    dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                    j.tag || '기타',
                    j.content
                ]);
            });
        });

        const wsAllJournals = XLSX.utils.aoa_to_sheet([allJournalHeaders, ...allJournalData]);
        XLSX.utils.book_append_sheet(workbook, wsAllJournals, '누가기록_전체일지');

        // -------------------------------------------------------------
        // 3. [시트 3: 🏆 학급보상_출결_통계매트릭스]
        // -------------------------------------------------------------
        const cardHeaders = scoreCards.map(c => `${c.title} (${c.points > 0 ? '+' : ''}${c.points}점)`);
        const statsHeaders = [
            '번호', '이름', '출석일', '결석', '지각', '조퇴/결과', '체험학습', '출석률(%)',
            '상점합계', '벌점합계', '최종총점',
            ...cardHeaders
        ];

        const statsRows = sortedStudents.map(student => {
            // 출결
            let stPresent = 0; let stAbsent = 0; let stLate = 0; let stEarly = 0; let stFieldtrip = 0; let stTotalDays = 0;
            if (attendance) {
                Object.keys(attendance).forEach(dKey => {
                    const dayData = attendance[dKey]?.[student.id];
                    if (dayData && dayData.status) {
                        stTotalDays += 1;
                        const st = dayData.status;
                        if (st === 'present') stPresent += 1;
                        else if (st.includes('absent')) stAbsent += 1;
                        else if (st.includes('late')) stLate += 1;
                        else if (st.includes('early') || st.includes('result')) stEarly += 1;
                        else if (st === 'fieldtrip') stFieldtrip += 1;
                    }
                });
            }
            const rate = stTotalDays > 0 ? Math.round(((stPresent + stFieldtrip) / stTotalDays) * 100) : 100;

            // 보상 카드
            const list = studentScores[student.id] || [];
            let meritSum = 0; let demeritSum = 0;
            list.forEach(item => {
                if (item.points > 0) meritSum += item.points;
                else demeritSum += Math.abs(item.points);
            });
            const total = meritSum - demeritSum;

            const cardCounts = scoreCards.map(c => {
                const count = list.filter(item => item.reason === c.title && Number(item.points) === Number(c.points)).length;
                return count > 0 ? count : 0;
            });

            return [
                student.attendanceNumber,
                student.name,
                stPresent,
                stAbsent,
                stLate,
                stEarly,
                stFieldtrip,
                `${rate}%`,
                meritSum,
                demeritSum,
                total,
                ...cardCounts
            ];
        });

        const wsStats = XLSX.utils.aoa_to_sheet([statsHeaders, ...statsRows]);
        XLSX.utils.book_append_sheet(workbook, wsStats, '학급보상_출결_통계');

        XLSX.writeFile(workbook, `학급전체_행발AI_종합데이터_${new Date().toISOString().split('T')[0]}.xlsx`);
        trackEvent('export_all_students_excel', { student_count: sortedStudents.length });
        showAlert('학급 전체 행발 종합 엑셀(AI 연계용 3개 시트)이 다운로드되었습니다.', '엑셀 다운로드 완료', '확인', 'success');
    };

    // ==========================================
    // 3. 선택된 학생의 출결 통계 및 특이사항 상세 계산
    // ==========================================
    const studentAttendanceDetail = useMemo(() => {
        if (!selectedStudentId || !attendance) {
            return {
                present: 0,
                absent: 0,
                late: 0,
                early: 0,
                result: 0,
                fieldtrip: 0,
                totalDays: 0,
                rate: 100,
                records: []
            };
        }

        let present = 0;
        let absent = 0;
        let late = 0;
        let early = 0;
        let result = 0;
        let fieldtrip = 0;
        let totalDays = 0;
        const records = [];

        Object.keys(attendance).sort().forEach(dateKey => {
            const dayData = attendance[dateKey]?.[selectedStudentId];
            if (dayData && dayData.status) {
                totalDays += 1;
                const st = dayData.status;
                const note = dayData.reason || '';

                if (st === 'present') present += 1;
                else if (st.includes('absent')) absent += 1;
                else if (st.includes('late')) late += 1;
                else if (st.includes('early')) early += 1;
                else if (st.includes('result')) result += 1;
                else if (st === 'fieldtrip') fieldtrip += 1;

                if (st !== 'present') {
                    records.push({
                        date: dateKey,
                        status: st,
                        note: note
                    });
                }
            }
        });

        const validDays = present + fieldtrip;
        const rate = totalDays > 0 ? Math.round((validDays / totalDays) * 100) : 100;

        return {
            present,
            absent,
            late,
            early,
            result,
            fieldtrip,
            totalDays,
            rate,
            records: records.sort((a, b) => b.date.localeCompare(a.date))
        };
    }, [selectedStudentId, attendance]);

    // 4. 선택된 학생의 학급보상(카드) 종합 내역 계산
    const selectedStudentRewardData = useMemo(() => {
        if (!selectedStudentId || !studentScores[selectedStudentId]) {
            return {
                totalPoints: 0,
                meritSum: 0,
                demeritSum: 0,
                totalCardsCount: 0,
                cardSummaryList: [],
                historyList: []
            };
        }

        const list = studentScores[selectedStudentId] || [];
        let meritSum = 0;
        let demeritSum = 0;
        const cardMap = {};

        list.forEach(item => {
            const pts = Number(item.points) || 0;
            if (pts > 0) meritSum += pts;
            else demeritSum += Math.abs(pts);

            const key = `${item.reason}_${pts}`;
            if (!cardMap[key]) {
                cardMap[key] = {
                    reason: item.reason,
                    points: pts,
                    count: 0,
                    totalPoints: 0
                };
            }
            cardMap[key].count += 1;
            cardMap[key].totalPoints += pts;
        });

        const totalPoints = meritSum - demeritSum;
        const cardSummaryList = Object.values(cardMap);
        const historyList = [...list].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return {
            totalPoints,
            meritSum,
            demeritSum,
            totalCardsCount: list.length,
            cardSummaryList,
            historyList
        };
    }, [selectedStudentId, studentScores]);

    // 상태 라벨 헬퍼
    const getStatusBadgeLabel = (status) => {
        if (status.includes('absent')) return '결석';
        if (status.includes('late')) return '지각';
        if (status.includes('early')) return '조퇴';
        if (status.includes('result')) return '결과';
        if (status === 'fieldtrip') return '체험학습';
        return status;
    };

    return (
        <div className="journal-entry-page-redesign">
            {/* 상단 메인 탭 선택 바 (원래대로 2단 탭: 학급보상 | 누가기록) */}
            <div className="main-page-top-nav-bar">
                <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <h2 style={{ margin: 0 }}>학생 기록</h2>
                    <span className="student-count-tag">학급 전체 {sortedStudents.length}명</span>

                    <div className="journal-view-mode-tabs">
                        <button
                            type="button"
                            className={`journal-view-tab-btn ${activeTab === 'scores' ? 'active' : ''}`}
                            onClick={() => setActiveTab('scores')}
                        >
                            학급보상
                        </button>
                        <button
                            type="button"
                            className={`journal-view-tab-btn ${activeTab === 'journals' ? 'active' : ''}`}
                            onClick={() => setActiveTab('journals')}
                        >
                            누가기록
                        </button>
                    </div>

                    {/* 기본 시작 화면 설정 */}
                    <div className="default-tab-setting-badge" title="학생 기록에 들어올 때 처음 열릴 기본 화면을 설정합니다 (자동 저장)">
                        <span className="default-tab-text">기본 시작:</span>
                        <select 
                            value={defaultTab} 
                            onChange={(e) => handleSetDefaultTab(e.target.value)}
                            className="default-tab-select"
                        >
                            <option value="journals">누가기록</option>
                            <option value="scores">학급보상</option>
                        </select>
                    </div>
                </div>

                <div className="top-tab-button-group">
                    {activeTab === 'scores' && (
                        <button
                            type="button"
                            className="top-action-outline-btn"
                            onClick={() => setShowClassScoreModal(true)}
                            title="학급 전체 카드 점수 현황표 보기"
                        >
                            📊 점수 현황표
                        </button>
                    )}
                    {activeTab === 'journals' && (
                        <button
                            type="button"
                            className="top-action-outline-btn"
                            onClick={handleExportAllStudentsExcel}
                            title="학급 전체 행발 종합 엑셀(AI 연계용 3개 시트) 다운로드"
                        >
                            📥 전체 종합 엑셀 (행발용)
                        </button>
                    )}
                </div>
            </div>

            {/* ───── MODE A: 카드 전용 좌-우 2단 분할 레이아웃 (scores 탭) ───── */}
            {activeTab === 'scores' ? (
                <div className="score-split-layout">
                    {/* [좌측 패널]: 카드 선택 덱 사이드바 */}
                    <aside className="left-score-card-sidebar">
                        <div className="sidebar-header-block">
                            <div className="title-with-add-btn">
                                <h3 className="highlighted-deck-title">카드</h3>
                                <button
                                    type="button"
                                    className="plus-add-card-btn"
                                    onClick={() => setShowCreateCardModal(true)}
                                    title="새 카드 추가"
                                >
                                    +
                                </button>
                            </div>
                            <p className="deck-sub-tip">부여할 카드를 선택해 주세요</p>
                        </div>

                        <div className="score-cards-vertical-list">
                            {scoreCards.map(c => {
                                const isSelected = selectedCardForScoring?.id === c.id;
                                return (
                                    <div
                                        key={c.id}
                                        className={`score-card-item-box ${c.type} ${isSelected ? 'active-target' : ''}`}
                                        onClick={() => setSelectedCardForScoring(isSelected ? null : c)}
                                    >
                                        <div className="card-main-content">
                                            <span className="card-item-title">{c.title}</span>
                                            <div className="card-info-right">
                                                <span className={`card-item-points ${c.type}`}>
                                                    {c.points > 0 ? `+${c.points}점` : `${c.points}점`}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="card-delete-corner-btn"
                                            onClick={(e) => handleDeleteCard(e, c.id)}
                                            title="카드 삭제"
                                        >
                                            ×
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </aside>

                    {/* [우측 메인 영역]: 교실 자리배치표 & 하단 선택 학생 부여 바 */}
                    <main className="right-seating-workspace">
                        <section className="seating-grid-section">
                            <div className="section-title-bar">
                                <div className="title-with-badge">
                                    <h3>교실 자리표 (학생 선택)</h3>
                                    <span className="seating-view-pill">
                                        {isTeacherView ? '선생님 시점 (교탁 기준)' : '학생 시점 (교실 뒤 기준)'}
                                    </span>
                                </div>
                                {seatingLayout && Array.isArray(seatingLayout) && seatingLayout.length > 0 && (
                                    <button
                                        type="button"
                                        className={`seating-view-toggle-btn ${isTeacherView ? 'teacher-mode' : 'student-mode'}`}
                                        onClick={toggleTeacherView}
                                        title={isTeacherView ? '학생 시점으로 전환 (칠판 위)' : '선생님 시점으로 전환 (칠판 아래)'}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
                                            <polyline points="23 4 23 10 17 10" />
                                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                        </svg>
                                        {isTeacherView ? '학생 시점으로 보기 (칠판 위)' : '선생님 시점으로 보기 (칠판 아래)'}
                                    </button>
                                )}
                            </div>

                            {/* 자리배치 없을 때 안내 띠 */}
                            {(!seatingLayout || !Array.isArray(seatingLayout) || seatingLayout.length === 0) && (
                                <div className="no-seating-layout-banner">
                                    <span>⚠️ 저장된 자리배치가 없어 기본 번호순 카드로 표시됩니다. (자리배치 메뉴에서 배치를 저장하시면 실제 교실 자리표와 연동됩니다)</span>
                                </div>
                            )}

                            {displaySeatingLayout && Array.isArray(displaySeatingLayout) && displaySeatingLayout.length > 0 ? (
                                <div className={`seating-matrix-wrapper ${isTeacherView ? 'teacher-view' : 'student-view'}`}>
                                    {/* 1. 학생 시점일 때: 칠판이 상단(위쪽)에 위치 */}
                                    {!isTeacherView && (
                                        <div className="classroom-chalkboard-indicator top-blackboard">
                                            <span>칠 판 (교실 앞 / 학생 시점)</span>
                                        </div>
                                    )}

                                    {/* 실제 교실 2D 격자 자리배치표 */}
                                    <div className="seating-classroom-matrix">
                                        {displaySeatingLayout.map((row, rIdx) => (
                                            <div key={rIdx} className="seating-matrix-row">
                                                {row.map((seat, cIdx) => {
                                                    if (!seat) return null;
                                                    const student = seat.studentId ? students.find(s => s.id === seat.studentId) : null;
                                                    const isBlocked = seat.genderPreference === 'blocked';

                                                    if (!student) {
                                                        return (
                                                            <div 
                                                                key={seat.id || `${rIdx}-${cIdx}`} 
                                                                className={`seating-matrix-desk empty-desk ${isBlocked ? 'blocked' : ''}`}
                                                            >
                                                                <span className="empty-seat-label">{isBlocked ? '빈 공간' : '빈 좌석'}</span>
                                                            </div>
                                                        );
                                                    }

                                                    const isSelected = selectedStudentIdsForScoring.includes(student.id);
                                                    const stScores = studentScores[student.id] || [];
                                                    let m = 0; let d = 0;
                                                    stScores.forEach(s => {
                                                        if (s.points > 0) m += s.points;
                                                        else d += Math.abs(s.points);
                                                    });
                                                    const stTotal = m - d;

                                                    return (
                                                        <div
                                                            key={seat.id || student.id}
                                                            className={`seating-matrix-desk assigned-desk ${isSelected ? 'selected-desk' : ''}`}
                                                            onClick={() => toggleStudentSelectionForScoring(student.id)}
                                                            onDoubleClick={(e) => {
                                                                e.stopPropagation();
                                                                setManageRewardStudentId(student.id);
                                                            }}
                                                            title={`클릭하여 선택/해제 | 점수 뱃지 클릭 또는 더블클릭 시 [${student.name}] 카드 관리/취소`}
                                                        >
                                                            <div className="desk-header-row">
                                                                <span className="desk-student-no">{student.attendanceNumber}번</span>
                                                                <span
                                                                    className={`desk-score-tag ${stTotal > 0 ? 'plus' : stTotal < 0 ? 'minus' : 'zero'}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setManageRewardStudentId(student.id);
                                                                    }}
                                                                    title="클릭하여 받은 카드 내역 보기 및 취소(삭제)"
                                                                >
                                                                    {stTotal > 0 ? `+${stTotal}` : stTotal}
                                                                </span>
                                                            </div>
                                                            <div className="desk-student-name">{student.name}</div>
                                                            {isSelected && (
                                                                <div className="selected-check-badge">✓</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>

                                    {/* 2. 선생님 시점일 때: 칠판/교탁이 하단(아래쪽)에 위치 */}
                                    {isTeacherView && (
                                        <div className="classroom-chalkboard-indicator bottom-blackboard">
                                            <span>칠 판 (교탁 / 선생님 시점)</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Fallback 기본 명렬 카드 */
                                <div className="seating-grid-board">
                                    {sortedStudents.map(st => {
                                        const isStudentSelected = selectedStudentIdsForScoring.includes(st.id);
                                        const stScores = studentScores[st.id] || [];
                                        let m = 0; let d = 0;
                                        stScores.forEach(s => {
                                            if (s.points > 0) m += s.points;
                                            else d += Math.abs(s.points);
                                        });
                                        const stTotal = m - d;

                                        return (
                                            <div
                                                key={st.id}
                                                className={`seating-desk-card ${isStudentSelected ? 'selected-desk' : ''}`}
                                                onClick={() => toggleStudentSelectionForScoring(st.id)}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    setManageRewardStudentId(st.id);
                                                }}
                                                title={`클릭하여 선택/해제 | 점수 뱃지 클릭 또는 더블클릭 시 [${st.name}] 카드 관리/취소`}
                                            >
                                                <div className="card-top-row">
                                                    <span className="student-num-badge">{st.attendanceNumber}번</span>
                                                    <span
                                                        className={`total-score-badge ${stTotal > 0 ? 'plus' : stTotal < 0 ? 'minus' : 'zero'}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setManageRewardStudentId(st.id);
                                                        }}
                                                        title="클릭하여 받은 카드 내역 보기 및 취소(삭제)"
                                                    >
                                                        {stTotal > 0 ? `+${stTotal}` : stTotal}점
                                                    </span>
                                                </div>
                                                <div className="student-name-label">{st.name}</div>
                                                {isStudentSelected && (
                                                    <div className="selected-check-indicator">✓</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* 하단 점수 부여 실행 바 (원래의 세련된 디자인 복원) */}
                        <section className="tier-3-selected-students-bottom-bar">
                            <div className="selected-summary-left">
                                <div className="summary-title">
                                    <span>
                                        부여할 카드: {selectedCardForScoring ? (
                                            <strong style={{ color: selectedCardForScoring.points > 0 ? '#15803d' : '#be123c' }}>
                                                {selectedCardForScoring.title} ({selectedCardForScoring.points > 0 ? `+${selectedCardForScoring.points}` : selectedCardForScoring.points}점)
                                            </strong>
                                        ) : (
                                            <span className="no-selected-msg">좌측에서 카드를 선택해 주세요</span>
                                        )}
                                        {' · '}선택된 학생: <strong>{selectedStudentIdsForScoring.length}명</strong>
                                    </span>
                                    <button
                                        type="button"
                                        className="select-all-inline-btn"
                                        onClick={handleSelectAllStudentsForScoring}
                                    >
                                        {selectedStudentIdsForScoring.length === sortedStudents.length ? '전체 해제' : '전체 선택'}
                                    </button>
                                </div>
                                <div className="selected-chips-scroll-wrap">
                                    {selectedStudentIdsForScoring.length === 0 ? (
                                        <span className="no-selected-msg">자리표에서 점수를 부여할 학생 좌석을 클릭해 주세요</span>
                                    ) : (
                                        selectedStudentIdsForScoring.map(id => {
                                            const st = sortedStudents.find(s => s.id === id);
                                            if (!st) return null;
                                            return (
                                                <span 
                                                    key={st.id} 
                                                    className="selected-student-chip"
                                                    onClick={() => toggleStudentSelectionForScoring(st.id)}
                                                    title="클릭 시 선택 해제"
                                                >
                                                    {st.attendanceNumber}번 {st.name} ×
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="apply-action-right">
                                {selectedStudentIdsForScoring.length > 0 && (
                                    <button
                                        type="button"
                                        className="clear-all-chips-btn"
                                        onClick={handleClearSelectedStudentsForScoring}
                                    >
                                        선택 초기화
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="green-gradient-main-btn apply-score-submit-btn"
                                    onClick={handleApplyScoreToSelectedStudents}
                                >
                                    점수 부여
                                </button>
                            </div>
                        </section>
                    </main>
                </div>
            ) : (
                /* ───── MODE B: 누가기록 & 카드형 출결 통계 (좌-우 2단 분할 레이아웃) ───── */
                <div className="neis-split-layout">
                    {/* [좌측]: 학생 선택 명렬표 패널 */}
                    <aside className="left-student-sidebar">
                        <div className="sidebar-header">
                            <h3>학생 명렬표</h3>
                            <span className="student-count-tag">전체 {sortedStudents.length}명</span>
                        </div>
                        <div className="sidebar-search-box">
                            <input
                                type="text"
                                placeholder="학생 이름 / 번호 검색..."
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                            />
                            {studentSearch && (
                                <button className="clear-search" onClick={() => setStudentSearch('')}>×</button>
                            )}
                        </div>

                        <div className="sidebar-student-list">
                            {filteredStudents.length === 0 ? (
                                <p className="no-students-found">검색 조건에 해당 학생이 없습니다.</p>
                            ) : (
                                filteredStudents.map(student => {
                                    const isSelected = selectedStudentId === student.id;
                                    const journalCnt = (journals[student.id] || []).length;

                                    return (
                                        <div
                                            key={student.id}
                                            className={`sidebar-student-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => setSelectedStudentId(student.id)}
                                        >
                                            <div className="item-left">
                                                <span className="item-num">{student.attendanceNumber}번</span>
                                                <span className="item-name">{student.name}</span>
                                            </div>
                                            <div className="item-right">
                                                <span className="journal-badge">기록 {journalCnt}건</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    {/* [우측]: 누가기록 작성 & 타임라인 & 카드형 출결 통계 영역 */}
                    <main className="right-journal-workspace">
                        {selectedStudent ? (
                            <div className="student-detail-workspace">
                                <div className="selected-student-header-bar">
                                    <div className="student-profile-info">
                                        <span className="profile-num">{selectedStudent.attendanceNumber}번</span>
                                        <h2 className="profile-name">{selectedStudent.name} 학생</h2>
                                        <div className="profile-score-pills">
                                            <span className="sub-score-pill journal-count-pill">
                                                누가기록: <strong>{studentJournals.length}건</strong>
                                            </span>
                                            <span className="att-summary-mini-pill" title="출결 요약">
                                                출결: 결석 {studentAttendanceDetail.absent}회 | 지각 {studentAttendanceDetail.late}회 | 체험 {studentAttendanceDetail.fieldtrip}회
                                            </span>
                                        </div>
                                    </div>
                                    <div className="student-profile-actions">
                                        <button 
                                            type="button" 
                                            className="student-profile-excel-btn" 
                                            onClick={handleExportStudentExcel} 
                                            title={`${selectedStudent.name} 학생의 행발 종합 엑셀(3개 시트) 다운로드`}
                                        >
                                            📥 학생 종합 엑셀 (행발용)
                                        </button>
                                    </div>
                                </div>

                                {/* 누가기록 작성 카드 */}
                                <section className="quick-record-card">
                                    <div className="card-header-row">
                                        <h3 className="section-title">
                                            <strong>{selectedStudent.name}</strong> 관찰 내용 입력
                                        </h3>
                                        <div className="record-date-picker">
                                            <label>날짜:</label>
                                            <input 
                                                type="date"
                                                value={selectedDate}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                                max={new Date().toISOString().split('T')[0]}
                                                className="date-picker-input"
                                            />
                                        </div>
                                    </div>

                                    <div className="tag-selector-row">
                                        <span className="tag-row-label">태그 선택:</span>
                                        <div className="tag-pills-group">
                                            {TAG_OPTIONS.map(tag => (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    className={`tag-pill-btn ${tag.badgeClass} ${selectedTag === tag.id ? 'active' : ''}`}
                                                    onClick={() => setSelectedTag(tag.id)}
                                                >
                                                    {tag.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="record-input-wrap">
                                        <textarea 
                                            className="quick-textarea"
                                            placeholder="오늘 관찰하거나 상담한 내용을 입력하세요..."
                                            value={entryContent}
                                            onChange={(e) => setEntryContent(e.target.value)}
                                            rows={3}
                                        />
                                        <div className="input-action-bar">
                                            <button className="green-gradient-main-btn save-record-btn" onClick={handleAddEntry}>
                                                기록 저장하기
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                {/* 누가기록 타임라인 & 태그 필터링 */}
                                <section className="timeline-records-section">
                                    <div className="timeline-header-row">
                                        <h3 className="section-title">
                                            누가기록 타임라인 ({filteredJournals.length}건)
                                        </h3>
                                        <div className="timeline-header-actions">
                                            <button 
                                                className={`tag-toggle-btn ${showTagFilter ? 'active' : ''} ${filterTag !== 'all' ? 'has-filter' : ''}`}
                                                onClick={() => setShowTagFilter(!showTagFilter)}
                                            >
                                                태그 필터 {filterTag !== 'all' ? `(${filterTag})` : ''} {showTagFilter ? '▲' : '▼'}
                                            </button>
                                        </div>
                                    </div>

                                    {showTagFilter && (
                                        <div className="filter-chips-wrapper">
                                            <div className="filter-chips-group">
                                                <button 
                                                    className={`filter-chip ${filterTag === 'all' ? 'active' : ''}`}
                                                    onClick={() => setFilterTag('all')}
                                                >
                                                    전체 ({studentJournals.length})
                                                </button>
                                                {TAG_OPTIONS.map(tag => {
                                                    const count = studentJournals.filter(j => j.tag === tag.id).length;
                                                    return (
                                                        <button
                                                            key={tag.id}
                                                            className={`filter-chip ${filterTag === tag.id ? 'active' : ''}`}
                                                            onClick={() => setFilterTag(tag.id)}
                                                        >
                                                            {tag.id} ({count})
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="timeline-content-list">
                                        {groupedJournals.length === 0 ? (
                                            <div className="empty-timeline-card">
                                                <p>작성된 관찰 기록이 없습니다.</p>
                                            </div>
                                        ) : (
                                            groupedJournals.map(({ dateKey, entries }) => (
                                                <div key={dateKey} className="timeline-date-group">
                                                    <div className="timeline-date-badge">
                                                        {dateKey}
                                                    </div>
                                                    <div className="timeline-card-items">
                                                        {entries.map(entry => {
                                                            const tagObj = TAG_OPTIONS.find(t => t.id === entry.tag) || TAG_OPTIONS[5];
                                                            const isEditingThis = editingId === entry.id;

                                                            return (
                                                                <div key={entry.id} className={`timeline-entry-card ${tagObj.badgeClass}`}>
                                                                    <div className="entry-card-header">
                                                                        <div className="entry-meta">
                                                                            <span className={`entry-tag-badge ${tagObj.badgeClass}`}>
                                                                                {tagObj.label}
                                                                            </span>
                                                                            <span className="entry-time-str">
                                                                                {new Date(entry.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                        <div className="entry-actions">
                                                                            {isEditingThis ? (
                                                                                <>
                                                                                    <button className="action-btn save" onClick={() => handleSaveEdit(entry.id)}>저장</button>
                                                                                    <button className="action-btn cancel" onClick={() => setEditingId(null)}>취소</button>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <button className="action-btn edit" onClick={() => handleStartEdit(entry)}>수정</button>
                                                                                    <button 
                                                                                        className="action-btn delete" 
                                                                                        onClick={() => handleDeleteJournal(entry.id)}
                                                                                    >
                                                                                        삭제
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {isEditingThis ? (
                                                                        <div className="entry-edit-box">
                                                                            <div className="edit-tag-select">
                                                                                {TAG_OPTIONS.map(t => (
                                                                                    <button
                                                                                        key={t.id}
                                                                                        type="button"
                                                                                        className={`tag-mini-btn ${editTag === t.id ? 'active' : ''}`}
                                                                                        onClick={() => setEditTag(t.id)}
                                                                                    >
                                                                                        {t.label}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                            <textarea
                                                                                className="edit-textarea"
                                                                                value={editContent}
                                                                                onChange={(e) => setEditContent(e.target.value)}
                                                                                rows={3}
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <p className="entry-body-text">{entry.content}</p>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>

                                {/* ─────────────────────────────────────────────────────────────
                                    [초록덕후 클린 그린 테마: 텍스트 중심 출결 통계 & 특이사항 카드]
                                   ───────────────────────────────────────────────────────────── */}
                                <section className="att-summary-card green-clean-card">
                                    <div className="att-card-header">
                                        <div className="att-header-left">
                                            <h3 className="att-main-title">{selectedStudent.name} 학생 출결 종합 통계</h3>
                                            <span className="att-sub-text">총 {studentAttendanceDetail.totalDays}일 중 {studentAttendanceDetail.present}일 출석</span>
                                        </div>
                                        <div className="att-rate-badge">
                                            <span className="rate-label">출석률</span>
                                            <strong className="rate-percent">{studentAttendanceDetail.rate}%</strong>
                                        </div>
                                    </div>

                                    {/* 이모지 없이 순수 텍스트 중심의 초록덕후 4대 지표 카드 */}
                                    <div className="att-stats-green-grid">
                                        <div className="att-green-box">
                                            <span className="green-box-label">결석(병결)</span>
                                            <strong className={`green-box-val ${studentAttendanceDetail.absent > 0 ? 'highlight-absent' : ''}`}>
                                                {studentAttendanceDetail.absent}회
                                            </strong>
                                        </div>
                                        <div className="att-green-box">
                                            <span className="green-box-label">지각</span>
                                            <strong className={`green-box-val ${studentAttendanceDetail.late > 0 ? 'highlight-late' : ''}`}>
                                                {studentAttendanceDetail.late}회
                                            </strong>
                                        </div>
                                        <div className="att-green-box">
                                            <span className="green-box-label">체험학습</span>
                                            <strong className="green-box-val">
                                                {studentAttendanceDetail.fieldtrip}회
                                            </strong>
                                        </div>
                                        <div className="att-green-box">
                                            <span className="green-box-label">조퇴/결과</span>
                                            <strong className="green-box-val">
                                                {studentAttendanceDetail.early + studentAttendanceDetail.result}회
                                            </strong>
                                        </div>
                                    </div>
                                </section>

                                {/* 출결 특이사항 타임라인 카드 */}
                                {studentAttendanceDetail.records.length > 0 ? (
                                    <section className="att-history-card green-clean-card">
                                        <div className="att-history-header">
                                            <h3 className="history-title">
                                                출결 특이사항 내역 ({studentAttendanceDetail.records.length}건)
                                            </h3>
                                        </div>
                                        <div className="att-clean-history-list">
                                            {studentAttendanceDetail.records.map((r, idx) => (
                                                <div key={idx} className="att-clean-history-item">
                                                    <div className="clean-date">{r.date}</div>
                                                    <div className="clean-status-wrap">
                                                        <span className="clean-status-tag">
                                                            {getStatusBadgeLabel(r.status)}
                                                        </span>
                                                        {r.note && (
                                                            <span className="clean-note-text">{r.note}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ) : (
                                    <div className="att-clean-perfect-card">
                                        <span className="clean-perfect-label">특이사항 없음</span>
                                        <span className="clean-perfect-sub">지각, 결석, 조퇴 등의 특이사항 없이 성실하게 출석 중입니다.</span>
                                    </div>
                                )}

                                {/* ─────────────────────────────────────────────────────────────
                                    [누가기록 우측 하단: 학생이 받은 학급보상 카드 종합 내역]
                                   ───────────────────────────────────────────────────────────── */}
                                <section className="student-rewards-summary-card green-clean-card">
                                    <div className="att-card-header">
                                        <div className="att-header-left">
                                            <h3 className="att-main-title">{selectedStudent.name} 학생 학급보상 카드 현황</h3>
                                            <span className="att-sub-text">
                                                총 {selectedStudentRewardData.totalCardsCount}장의 카드 발급 (상점 +{selectedStudentRewardData.meritSum}점, 벌점 -{selectedStudentRewardData.demeritSum}점)
                                            </span>
                                        </div>
                                        <div className="att-rate-badge">
                                            <span className="rate-label">최종 총점</span>
                                            <strong className="rate-percent" style={{ color: selectedStudentRewardData.totalPoints > 0 ? '#15803d' : selectedStudentRewardData.totalPoints < 0 ? '#be123c' : '#64748b' }}>
                                                {selectedStudentRewardData.totalPoints > 0 ? `+${selectedStudentRewardData.totalPoints}` : selectedStudentRewardData.totalPoints}점
                                            </strong>
                                        </div>
                                    </div>

                                    {selectedStudentRewardData.cardSummaryList.length > 0 ? (
                                        <div className="reward-cards-container">
                                            {/* 1. 카드별 누적 요약 칩 그리드 */}
                                            <div className="reward-chips-summary-grid">
                                                {selectedStudentRewardData.cardSummaryList.map((card, idx) => (
                                                    <div key={idx} className={`reward-summary-chip ${card.totalPoints > 0 ? 'merit' : 'demerit'}`}>
                                                        <div className="chip-reason-title">{card.reason}</div>
                                                        <div className="chip-count-and-pts">
                                                            <span className="chip-count">{card.count}회 발급</span>
                                                            <span className="chip-pts">
                                                                {card.totalPoints > 0 ? `+${card.totalPoints}` : card.totalPoints}점
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 2. 최근 발급 타임라인 내역 (최신 10건) */}
                                            <div className="reward-history-timeline-wrap">
                                                <div className="reward-history-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h4 className="reward-history-sub-title">최근 발급 이력</h4>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>우측 × 버튼을 눌러 잘못 부여된 카드를 취소할 수 있습니다</span>
                                                </div>
                                                <div className="reward-history-list">
                                                    {selectedStudentRewardData.historyList.slice(0, 10).map((h, idx) => (
                                                        <div key={h.id || idx} className="reward-history-item">
                                                            <span className="reward-history-date">
                                                                {h.date ? new Date(h.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '일자 미기록'}
                                                            </span>
                                                            <div className="reward-history-right">
                                                                <span className="reward-history-name">{h.reason}</span>
                                                                <span className={`reward-history-badge ${Number(h.points) > 0 ? 'merit' : 'demerit'}`}>
                                                                    {Number(h.points) > 0 ? `+${h.points}점` : `${h.points}점`}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="reward-item-cancel-btn"
                                                                    onClick={() => handleDeleteStudentScoreItem(selectedStudent.id, h.id, h.reason)}
                                                                    title="이 카드 부여 취소 (삭제)"
                                                                >
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="att-clean-perfect-card" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                                            <span className="clean-perfect-label" style={{ color: '#64748b' }}>받은 카드 없음</span>
                                            <span className="clean-perfect-sub" style={{ color: '#94a3b8' }}>{selectedStudent.name} 학생에게 아직 부여된 학급보상 카드가 없습니다.</span>
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : (
                            <div className="no-student-selected-card">
                                <h3>학생을 선택해 주세요</h3>
                                <p>좌측 학생 명렬표에서 학생을 클릭하시면 상세 누가기록 및 출결 현황을 보실 수 있습니다.</p>
                            </div>
                        )}
                    </main>
                </div>
            )}

            {/* =========================================================================
                MODALS
            ========================================================================= */}
            {/* 1. 새 카드 만들기 전용 모달 */}
            {showCreateCardModal && (
                <div className="custom-modal-overlay" onClick={() => setShowCreateCardModal(false)}>
                    <div className="custom-modal-card card-create-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="custom-modal-title">새 카드 만들기</h3>
                        <form onSubmit={handleCreateCardSubmit}>
                            <div className="card-form-body">
                                <div className="form-group-item">
                                    <label>카드 이름 (사유)</label>
                                    <input
                                        type="text"
                                        className="modal-card-input"
                                        placeholder="예: 봉사활동 참여, 무단 잡담, 청소 솔선수범 등"
                                        value={newCardTitle}
                                        onChange={(e) => setNewCardTitle(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group-item">
                                    <label>부여 점수</label>
                                    <select
                                        className="modal-card-select"
                                        value={newCardPoints}
                                        onChange={(e) => setNewCardPoints(Number(e.target.value))}
                                    >
                                        <option value={5}>+5점 (상점)</option>
                                        <option value={3}>+3점 (상점)</option>
                                        <option value={2}>+2점 (상점)</option>
                                        <option value={1}>+1점 (상점)</option>
                                        <option value={-1}>-1점 (벌점)</option>
                                        <option value={-2}>-2점 (벌점)</option>
                                        <option value={-3}>-3점 (벌점)</option>
                                        <option value={-5}>-5점 (벌점)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="custom-modal-btn-row">
                                <button type="button" className="custom-modal-btn cancel" onClick={() => setShowCreateCardModal(false)}>
                                    취소
                                </button>
                                <button type="submit" className="custom-modal-btn confirm">
                                    카드 저장
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. 학급 전체 카드 현황 종합 모달 */}
            {showClassScoreModal && (
                <div className="custom-modal-overlay" onClick={() => setShowClassScoreModal(false)}>
                    <div className="custom-modal-card class-score-status-modal" style={{ maxWidth: '750px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
                        <div className="class-modal-header">
                            <h3 className="custom-modal-title">📊 학급 카드 점수 현황표</h3>
                            <button className="excel-export-btn" onClick={handleExportClassScoreDetailsExcel}>
                                📥 엑셀 다운로드
                            </button>
                        </div>
                        <div className="class-modal-body" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                            <table className="class-score-table">
                                <thead>
                                    <tr>
                                        <th>순위</th>
                                        <th>번호</th>
                                        <th>이름</th>
                                        <th>상점</th>
                                        <th>벌점</th>
                                        <th>최종 총점</th>
                                        <th>상세 내역</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classScoreRankList.map((st, idx) => {
                                        const stList = studentScores[st.id] || [];
                                        const isExpanded = detailStudentId === st.id;

                                        const cardSummaryMap = {};
                                        stList.forEach(item => {
                                            const key = item.reason;
                                            if (!cardSummaryMap[key]) {
                                                cardSummaryMap[key] = { reason: item.reason, count: 0, totalPts: 0, ptsPerCard: Number(item.points) };
                                            }
                                            cardSummaryMap[key].count += 1;
                                            cardSummaryMap[key].totalPts += Number(item.points);
                                        });

                                        const summaryList = Object.values(cardSummaryMap);

                                        return (
                                            <React.Fragment key={st.id}>
                                                <tr className={idx < 3 ? 'top-rank' : ''}>
                                                    <td className="rank-td">{idx + 1}위</td>
                                                    <td>{st.attendanceNumber}번</td>
                                                    <td className="name-td">{st.name}</td>
                                                    <td className="merit-td">+{st.meritSum}점</td>
                                                    <td className="demerit-td">-{st.demeritSum}점</td>
                                                    <td className="total-td">
                                                        <span className={`score-badge ${st.total > 0 ? 'plus' : st.total < 0 ? 'minus' : 'zero'}`}>
                                                            {st.total > 0 ? `+${st.total}` : st.total}점
                                                        </span>
                                                    </td>
                                                    <td className="action-td">
                                                        <button
                                                            type="button"
                                                            className="view-detail-btn"
                                                            onClick={() => setDetailStudentId(isExpanded ? null : st.id)}
                                                        >
                                                            {isExpanded ? '닫기 ▲' : '상세보기 ▼'}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="detail-expanded-row" style={{ background: '#f8faf9' }}>
                                                        <td colSpan={7} style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#15803d' }}>
                                                                    <span>📋 {st.name} 학생의 카드별 받은 점수 내역</span>
                                                                </div>
                                                                {summaryList.length > 0 ? (
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                        {summaryList.map((c, i) => (
                                                                            <div
                                                                                key={i}
                                                                                style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '6px',
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: '8px',
                                                                                    background: '#ffffff',
                                                                                    border: `1px solid ${c.totalPts > 0 ? '#bbf7d0' : '#fecdd3'}`
                                                                                }}
                                                                            >
                                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#334155' }}>{c.reason}</span>
                                                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({c.count}회)</span>
                                                                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: c.totalPts > 0 ? '#15803d' : '#be123c' }}>
                                                                                    {c.totalPts > 0 ? `+${c.totalPts}` : c.totalPts}점
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    style={{
                                                                                        background: 'none',
                                                                                        border: 'none',
                                                                                        color: '#94a3b8',
                                                                                        fontSize: '0.9rem',
                                                                                        cursor: 'pointer',
                                                                                        padding: '0 2px',
                                                                                        marginLeft: '2px'
                                                                                    }}
                                                                                    onClick={async () => {
                                                                                        const confirmed = await showConfirm(`[${c.reason}] 카드를 1회 취소하시겠습니까?`, '카드 취소', '취소 실행', '닫기');
                                                                                        if (confirmed) {
                                                                                            const currentList = studentScores[st.id] || [];
                                                                                            const idx = currentList.findIndex(item => item.reason === c.reason);
                                                                                            if (idx !== -1) {
                                                                                                const updated = [...currentList];
                                                                                                updated.splice(idx, 1);
                                                                                                const newAllScores = { ...studentScores, [st.id]: updated };
                                                                                                saveScores(newAllScores);
                                                                                                showAlert(`[${c.reason}] 카드가 1회 취소되었습니다.`, '완료', '확인', 'success');
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    title="1회 취소 (삭제)"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>받은 카드가 없습니다.</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="custom-modal-btn-row">
                            <button type="button" className="custom-modal-btn confirm" onClick={() => setShowClassScoreModal(false)}>
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. 학생 개별 학급보상 카드 관리/취소 모달 (자리표에서 더블클릭 또는 점수 클릭 시) */}
            {manageRewardStudentId && (() => {
                const targetStudent = sortedStudents.find(s => s.id === manageRewardStudentId);
                if (!targetStudent) return null;

                const studentCardList = studentScores[manageRewardStudentId] || [];
                let meritSum = 0;
                let demeritSum = 0;
                studentCardList.forEach(item => {
                    const pts = Number(item.points) || 0;
                    if (pts > 0) meritSum += pts;
                    else demeritSum += Math.abs(pts);
                });
                const totalPoints = meritSum - demeritSum;
                const sortedHistory = [...studentCardList].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

                return (
                    <div className="custom-modal-overlay" onClick={() => setManageRewardStudentId(null)}>
                        <div className="custom-modal-card student-reward-manage-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="reward-manage-modal-header">
                                <div className="student-info-headline">
                                    <div className="student-badge-title">
                                        <span className="student-no-pill">{targetStudent.attendanceNumber}번</span>
                                        <h3 className="student-name-heading">{targetStudent.name} 학생 카드 관리</h3>
                                    </div>
                                    <p className="student-sub-desc">잘못 부여된 카드를 선택하여 취소(삭제)할 수 있습니다.</p>
                                </div>
                                <button
                                    type="button"
                                    className="minimal-close-btn"
                                    onClick={() => setManageRewardStudentId(null)}
                                    title="닫기"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            {/* 총점 요약 바 */}
                            <div className="reward-manage-score-summary-bar">
                                <div className="score-sum-box merit">
                                    <span className="sum-label">상점 합계</span>
                                    <strong className="sum-value">+{meritSum}점</strong>
                                </div>
                                <div className="score-sum-box demerit">
                                    <span className="sum-label">벌점 합계</span>
                                    <strong className="sum-value">-{demeritSum}점</strong>
                                </div>
                                <div className="score-sum-box total">
                                    <span className="sum-label">최종 총점</span>
                                    <strong className={`sum-value ${totalPoints > 0 ? 'plus' : totalPoints < 0 ? 'minus' : 'zero'}`}>
                                        {totalPoints > 0 ? `+${totalPoints}` : totalPoints}점
                                    </strong>
                                </div>
                            </div>

                            {/* 카드 발급 내역 리스트 */}
                            <div className="reward-manage-list-wrap">
                                <div className="reward-manage-list-title-row">
                                    <span className="list-title">발급된 카드 내역 ({sortedHistory.length}건)</span>
                                </div>
                                {sortedHistory.length > 0 ? (
                                    <div className="reward-manage-items-list">
                                        {sortedHistory.map((item, idx) => (
                                            <div key={item.id || idx} className="reward-manage-item-row">
                                                <div className="item-left-info">
                                                    <span className="item-date">
                                                        {item.date ? new Date(item.date).toLocaleDateString('ko-KR', {
                                                            month: 'numeric',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        }) : '일자 미기록'}
                                                    </span>
                                                    <span className="item-reason">{item.reason}</span>
                                                </div>
                                                <div className="item-right-actions">
                                                    <span className={`item-score-badge ${Number(item.points) > 0 ? 'merit' : 'demerit'}`}>
                                                        {Number(item.points) > 0 ? `+${item.points}점` : `${item.points}점`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="item-cancel-action-btn"
                                                        onClick={() => handleDeleteStudentScoreItem(targetStudent.id, item.id, item.reason)}
                                                        title="이 카드 취소(삭제)"
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                                        </svg>
                                                        취소
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="reward-manage-empty-state">
                                        <span>부여된 학급보상 카드가 없습니다.</span>
                                    </div>
                                )}
                            </div>

                            <div className="custom-modal-btn-row center-aligned">
                                <button
                                    type="button"
                                    className="custom-modal-btn confirm"
                                    onClick={() => setManageRewardStudentId(null)}
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default JournalEntry;
