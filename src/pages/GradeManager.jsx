import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useStudentContext } from '../context/StudentContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import './GradeManager.css';

// 기본 평가 기준 템플릿
const DEFAULT_TEMPLATES = [
    {
        id: 'template_score',
        name: '점수제',
        evaluationType: 'score',
        maxScore: 100,
        levels: 0,
        labels: []
    },
    {
        id: 'template_3_level_shape',
        name: '3단계 (◎○△)',
        levels: 3,
        labels: ['◎', '○', '△']
    },
    {
        id: 'template_3_level_text',
        name: '3단계 (상/중/하)',
        levels: 3,
        labels: ['상', '중', '하']
    },
    {
        id: 'template_5_level_korean',
        name: '5단계 (수우미양가)',
        levels: 5,
        labels: ['수', '우', '미', '양', '가']
    }
];

const GradeManager = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { students } = useStudentContext();
    const { updateSaveStatus } = useSaveStatus();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

    // 상태 관리
    const [criteriaTemplates, setCriteriaTemplates] = useState([]);
    const [gradeGroups, setGradeGroups] = useState([]);
    const [gradeData, setGradeData] = useState({});

    // View Mode: 'list' | 'detail'
    const [viewMode, setViewMode] = useState('list');
    const [activeGradeId, setActiveGradeId] = useState(null);

    // Modal State (Only for Setup now)
    const [showSetupModal, setShowSetupModal] = useState(false);

    // 새 성적 입력 폼 상태 (Setup & Detail 공유)
    const [currentGrade, setCurrentGrade] = useState({
        id: '',
        assessmentName: '',
        groupName: '',
        useExistingGroup: true,
        selectedGroupName: '',
        useExistingCriteria: true,
        selectedCriteriaId: '',
        newCriteriaName: '',
        evaluationType: 'steps', // 'steps' | 'score'
        maxScore: 100,
        levels: 5,
        labels: ['매우우수', '우수', '보통', '미흡', '매우미흡'],
        studentGrades: {},
        createdAt: '',
        updatedAt: ''
    });

    // 데이터 초기화 및 로드
    useEffect(() => {
        const isCleared = localStorage.getItem(`grade_redesign_cleared_${classId}`);

        if (!isCleared) {
            localStorage.removeItem(`grade_criteria_${classId}`);
            localStorage.removeItem(`grade_groups_${classId}`);
            localStorage.removeItem(`grade_data_${classId}`);
            localStorage.setItem(`grade_redesign_cleared_${classId}`, 'true');

            setCriteriaTemplates([...DEFAULT_TEMPLATES]);
            setGradeGroups([]);
            setGradeData({});
        } else {
            const savedTemplates = localStorage.getItem(`grade_criteria_${classId}`);
            const savedGroups = localStorage.getItem(`grade_groups_${classId}`);
            const savedGrades = localStorage.getItem(`grade_data_${classId}`);

            if (savedTemplates) setCriteriaTemplates(JSON.parse(savedTemplates));
            else setCriteriaTemplates([...DEFAULT_TEMPLATES]);

            if (savedGroups) setGradeGroups(JSON.parse(savedGroups));
            if (savedGrades) setGradeData(JSON.parse(savedGrades));
        }
    }, [classId]);

    // 데이터 저장
    useEffect(() => {
        if (localStorage.getItem(`grade_redesign_cleared_${classId}`)) {
            localStorage.setItem(`grade_criteria_${classId}`, JSON.stringify(criteriaTemplates));
            updateSaveStatus();
        }
    }, [criteriaTemplates, classId, updateSaveStatus]);

    useEffect(() => {
        if (localStorage.getItem(`grade_redesign_cleared_${classId}`)) {
            localStorage.setItem(`grade_groups_${classId}`, JSON.stringify(gradeGroups));
            updateSaveStatus();
        }
    }, [gradeGroups, classId, updateSaveStatus]);

    useEffect(() => {
        if (localStorage.getItem(`grade_redesign_cleared_${classId}`)) {
            localStorage.setItem(`grade_data_${classId}`, JSON.stringify(gradeData));
            updateSaveStatus();
        }
    }, [gradeData, classId, updateSaveStatus]);

    // --- Actions ---

    // 1. Start New Grade (Open Setup Modal)
    const handleStartNewGrade = () => {
        setCurrentGrade({
            id: '',
            assessmentName: '',
            groupName: '',
            useExistingGroup: gradeGroups.length > 0,
            selectedGroupName: '',
            useExistingCriteria: true,
            selectedCriteriaId: '',
            newCriteriaName: '',
            evaluationType: 'steps',
            maxScore: 100,
            levels: 5,
            labels: ['매우우수', '우수', '보통', '미흡', '매우미흡'],
            studentGrades: {},
            createdAt: '',
            updatedAt: ''
        });
        setShowSetupModal(true);
    };

    // 2. Open Existing Grade (Switch to Detail View)
    const handleOpenGrade = (gradeId) => {
        const grade = gradeData[gradeId];
        if (!grade) return;

        // Reconstruct currentGrade state from saved data
        const criteria = criteriaTemplates.find(c => c.id === grade.criteriaId);

        setCurrentGrade({
            id: grade.id,
            assessmentName: grade.assessmentName,
            groupName: grade.groupName,
            useExistingCriteria: true, // Effectively using existing
            selectedCriteriaId: grade.criteriaId,
            newCriteriaName: criteria?.name || '',
            evaluationType: criteria?.evaluationType || 'steps',
            maxScore: criteria?.maxScore || 100,
            levels: criteria?.levels || 5,
            labels: criteria?.labels || [],
            studentGrades: grade.studentGrades,
            createdAt: grade.createdAt,
            updatedAt: grade.updatedAt
        });

        setActiveGradeId(gradeId);
        setViewMode('detail');
    };

    // 3. Setup Complete -> Go to Detail View
    const handleSetupComplete = () => {
        // Validation
        if (!currentGrade.assessmentName.trim()) { alert('평가 이름을 입력해주세요.'); return; }
        if (!currentGrade.groupName.trim()) { alert('그룹명을 입력해주세요.'); return; }

        let criteriaId = currentGrade.selectedCriteriaId;
        let finalLabels = currentGrade.labels;
        let finalLevels = currentGrade.levels;
        let finalType = currentGrade.evaluationType;
        let finalMaxScore = currentGrade.maxScore;

        // Handle Criteria
        if (currentGrade.useExistingCriteria) {
            if (!currentGrade.selectedCriteriaId) { alert('평가 기준을 선택해주세요.'); return; }
            const criteria = criteriaTemplates.find(c => c.id === currentGrade.selectedCriteriaId);
            if (criteria) {
                finalType = criteria.evaluationType || 'steps';
                finalMaxScore = criteria.maxScore || 100;
                finalLevels = criteria.levels;
                finalLabels = criteria.labels;
            }
        } else {
            if (!currentGrade.newCriteriaName.trim()) { alert('평가 기준 이름을 입력해주세요.'); return; }
            if (currentGrade.evaluationType === 'steps' && currentGrade.labels.some(l => !l.trim())) {
                alert('모든 단계 명칭을 입력해주세요.');
                return;
            }

            // Create New Criteria Immediately
            const newCriteria = {
                id: `criteria_${Date.now()}`,
                name: currentGrade.newCriteriaName,
                evaluationType: currentGrade.evaluationType,
                maxScore: currentGrade.maxScore,
                levels: currentGrade.levels,
                labels: currentGrade.labels,
                isCustom: true
            };
            setCriteriaTemplates(prev => [...prev, newCriteria]);
            criteriaId = newCriteria.id;
        }

        // Handle Group
        let group = gradeGroups.find(g => g.name === currentGrade.groupName);
        if (!group) {
            group = {
                id: `group_${Date.now()}`,
                name: currentGrade.groupName,
                createdAt: new Date().toISOString()
            };
            setGradeGroups(prev => [...prev, group]);
        }

        // Initialize Grades
        const initialGrades = {};
        students.forEach(student => {
            if (finalType === 'score') {
                initialGrades[student.id] = 0;
            } else {
                initialGrades[student.id] = Math.ceil(finalLevels / 2);
            }
        });

        // Update State for Detail View
        const newGradeId = `grade_${Date.now()}`;
        const newGradeRecord = {
            id: newGradeId,
            assessmentName: currentGrade.assessmentName,
            groupId: group.id,
            groupName: group.name,
            criteriaId: criteriaId,
            studentGrades: initialGrades,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save initial record
        setGradeData(prev => ({ ...prev, [newGradeId]: newGradeRecord }));

        // Update currentGrade state for the view
        setCurrentGrade({
            ...currentGrade,
            id: newGradeId,
            selectedCriteriaId: criteriaId,
            evaluationType: finalType,
            maxScore: finalMaxScore,
            levels: finalLevels,
            labels: finalLabels,
            studentGrades: initialGrades
        });

        setShowSetupModal(false);
        setActiveGradeId(newGradeId);
        setViewMode('detail');
    };

    // 4. Save & Exit / Save
    const handleSave = (exit = false) => {
        if (!activeGradeId) return;

        setGradeData(prev => ({
            ...prev,
            [activeGradeId]: {
                ...prev[activeGradeId],
                studentGrades: currentGrade.studentGrades,
                updatedAt: new Date().toISOString()
            }
        }));

        if (exit) {
            setViewMode('list');
            setActiveGradeId(null);
        } else {
            alert('✅ 저장되었습니다.');
        }
    };

    // 5. Delete Grade
    const handleDeleteGrade = (e, gradeId) => {
        e.stopPropagation();
        if (!window.confirm('이 성적을 삭제하시겠습니까?')) return;

        setGradeData(prev => {
            const newData = { ...prev };
            delete newData[gradeId];
            return newData;
        });
    };

    // 6. Delete Criteria
    const handleDeleteCriteria = (criteriaId) => {
        if (!window.confirm('이 평가 기준을 삭제하시겠습니까? 이 기준을 사용하는 성적 데이터에는 영향을 주지 않습니다.')) return;

        setCriteriaTemplates(prev => prev.filter(c => c.id !== criteriaId));
        if (currentGrade.selectedCriteriaId === criteriaId) {
            setCurrentGrade(prev => ({ ...prev, selectedCriteriaId: '' }));
        }
    };

    // 7. Create Group
    const handleAddGroup = () => {
        const name = prompt('새로운 그룹 이름을 입력하세요:');
        if (!name || !name.trim()) return;

        if (gradeGroups.some(g => g.name === name.trim())) {
            alert('이미 존재하는 그룹 이름입니다.');
            return;
        }

        const newGroup = {
            id: `group_${Date.now()}`,
            name: name.trim(),
            createdAt: new Date().toISOString()
        };
        setGradeGroups(prev => [...prev, newGroup]);
    };

    // 8. Drag and Drop
    const handleDragStart = (e, gradeId) => {
        e.dataTransfer.setData('text/plain', gradeId);
        e.dataTransfer.effectAllowed = 'move';
        // Add a class to the dragged element for styling
        e.target.classList.add('dragging');
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('dragging');
        // Remove drag-over class from all sections
        document.querySelectorAll('.grade-section').forEach(el => {
            el.classList.remove('drag-over');
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e, targetGroupId) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const gradeId = e.dataTransfer.getData('text/plain');

        if (!gradeId) return;

        setGradeData(prev => ({
            ...prev,
            [gradeId]: {
                ...prev[gradeId],
                groupId: targetGroupId,
                updatedAt: new Date().toISOString()
            }
        }));
    };

    // --- Helpers ---
    const handleStudentGradeChange = (studentId, value) => {
        setCurrentGrade(prev => ({
            ...prev,
            studentGrades: {
                ...prev.studentGrades,
                [studentId]: parseInt(value) || 0
            }
        }));
    };

    const handleLevelsChange = (levels) => {
        const newLevels = parseInt(levels);
        const newLabels = Array(newLevels).fill('').map((_, i) => {
            if (i < currentGrade.labels.length) return currentGrade.labels[i];
            return '';
        });
        setCurrentGrade(prev => ({ ...prev, levels: newLevels, labels: newLabels }));
    };

    const handleLabelChange = (index, value) => {
        setCurrentGrade(prev => {
            const newLabels = [...prev.labels];
            newLabels[index] = value;
            return { ...prev, labels: newLabels };
        });
    };

    const grades = Object.values(gradeData);

    // --- Render ---

    if (viewMode === 'detail') {
        return (
            <div className="grade-manager detail-view">
                <div className="detail-header">
                    <div className="detail-title-group">
                        <Button variant="secondary" onClick={() => setViewMode('list')} className="back-btn">
                            ← 목록으로
                        </Button>
                        <div>
                            <h1>{currentGrade.assessmentName}</h1>
                            <span className="detail-subtitle">
                                {currentGrade.groupName} • {currentGrade.evaluationType === 'score' ? `${currentGrade.maxScore}점 만점` : `${currentGrade.levels}단계 평가`}
                            </span>
                        </div>
                    </div>
                    <div className="detail-actions">
                        <Button variant="secondary" onClick={() => handleSave(false)}>중간 저장</Button>
                        <Button variant="primary" onClick={() => handleSave(true)}>저장하고 나가기</Button>
                    </div>
                </div>

                <div className="grade-table-container full-page">
                    <table className="grade-table">
                        <thead>
                            <tr>
                                <th style={{ width: '80px' }}>번호</th>
                                <th style={{ width: '120px' }}>이름</th>
                                <th>평가 입력</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.sort((a, b) => a.attendanceNumber - b.attendanceNumber).map(student => {
                                const gradeValue = currentGrade.studentGrades[student.id];

                                return (
                                    <tr key={student.id}>
                                        <td>{student.attendanceNumber}</td>
                                        <td>{student.name}</td>
                                        <td>
                                            {currentGrade.evaluationType === 'score' ? (
                                                <input
                                                    type="number"
                                                    className="form-input grade-input-number"
                                                    value={gradeValue}
                                                    onChange={(e) => handleStudentGradeChange(student.id, e.target.value)}
                                                    max={currentGrade.maxScore}
                                                    min="0"
                                                />
                                            ) : (
                                                <div className="grade-radio-group">
                                                    {currentGrade.labels.map((label, index) => {
                                                        const val = currentGrade.labels.length - index;
                                                        return (
                                                            <label key={index} className={`grade-radio-item ${gradeValue === val ? 'selected' : ''}`}>
                                                                <input
                                                                    type="radio"
                                                                    name={`grade-${student.id}`}
                                                                    value={val}
                                                                    checked={gradeValue === val}
                                                                    onChange={() => handleStudentGradeChange(student.id, val)}
                                                                />
                                                                {label}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="grade-manager">
            <div className="grade-header">
                <h1>📊 학생 성적 입력</h1>
                <div className="header-actions">
                    <Button variant="secondary" onClick={handleAddGroup}>
                        + 그룹 추가
                    </Button>
                    <Button variant="primary" onClick={handleStartNewGrade}>
                        + 새 성적 입력
                    </Button>
                </div>
            </div>

            <div className="grade-sections">
                {gradeGroups.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-state-icon">📝</span>
                        <p>아직 등록된 성적이 없습니다.</p>
                        <p>새 성적 입력 버튼을 눌러 시작해보세요!</p>
                    </div>
                ) : (
                    gradeGroups.map(group => {
                        const groupGrades = grades.filter(g => g.groupId === group.id)
                            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                        return (
                            <div
                                key={group.id}
                                className="grade-section"
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, group.id)}
                            >
                                <div className="grade-section-header">
                                    <div className="grade-section-title">
                                        {group.name}
                                        <span className="grade-section-count">{groupGrades.length}</span>
                                    </div>
                                </div>
                                <div className="grade-grid">
                                    {groupGrades.length === 0 ? (
                                        <div style={{
                                            padding: '2rem',
                                            textAlign: 'center',
                                            color: '#64748b',
                                            fontSize: '0.95rem',
                                            width: '100%'
                                        }}>
                                            아직 등록된 성적이 없습니다.
                                        </div>
                                    ) : (
                                        groupGrades.map(grade => {
                                            const criteria = criteriaTemplates.find(c => c.id === grade.criteriaId);
                                            const isScoreType = criteria?.evaluationType === 'score';

                                            return (
                                                <div
                                                    key={grade.id}
                                                    className="grade-card"
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, grade.id)}
                                                    onDragEnd={handleDragEnd}
                                                    onClick={() => handleOpenGrade(grade.id)}
                                                >
                                                    <div className="grade-card-header">
                                                        <div className="grade-card-title">{grade.assessmentName}</div>
                                                        <div className={`grade-card-badge ${isScoreType ? 'score' : 'steps'}`}>
                                                            {isScoreType ? '점수제' : `${criteria?.levels || 5}단계`}
                                                        </div>
                                                    </div>
                                                    <div className="grade-card-meta">
                                                        <span>{new Date(grade.createdAt).toLocaleDateString()}</span>
                                                        <span>{Object.keys(grade.studentGrades).length}명</span>
                                                    </div>
                                                    <button
                                                        className="grade-card-delete"
                                                        onClick={(e) => handleDeleteGrade(e, grade.id)}
                                                        title="삭제"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Setup Modal */}
            {showSetupModal && (
                <div className="grade-modal-overlay" onClick={() => setShowSetupModal(false)}>
                    <div className="grade-modal-content setup-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="grade-modal-close" onClick={() => setShowSetupModal(false)}>×</button>

                        <h2 className="grade-modal-title">새 성적 설정</h2>

                        <div className="form-section">
                            <label className="form-label">그룹 (과목/분류)</label>
                            {gradeGroups.length > 0 ? (
                                <>
                                    <div className="type-selector">
                                        <div
                                            className={`type-card ${currentGrade.useExistingGroup ? 'active' : ''}`}
                                            onClick={() => setCurrentGrade({ ...currentGrade, useExistingGroup: true, groupName: currentGrade.selectedGroupName || '' })}
                                        >
                                            <span className="type-icon">📂</span>
                                            <span className="type-title">기존 그룹 선택</span>
                                        </div>
                                        <div
                                            className={`type-card ${!currentGrade.useExistingGroup ? 'active' : ''}`}
                                            onClick={() => setCurrentGrade({ ...currentGrade, useExistingGroup: false, groupName: '' })}
                                        >
                                            <span className="type-icon">✨</span>
                                            <span className="type-title">새 그룹 만들기</span>
                                        </div>
                                    </div>
                                    {currentGrade.useExistingGroup ? (
                                        <select
                                            className="form-input"
                                            value={currentGrade.selectedGroupName}
                                            onChange={(e) => setCurrentGrade({ ...currentGrade, selectedGroupName: e.target.value, groupName: e.target.value })}
                                        >
                                            <option value="">그룹을 선택하세요...</option>
                                            {gradeGroups.map(group => (
                                                <option key={group.id} value={group.name}>
                                                    {group.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="새 그룹명 입력 (예: 국어, 수학)"
                                            value={currentGrade.groupName}
                                            onChange={(e) => setCurrentGrade({ ...currentGrade, groupName: e.target.value })}
                                        />
                                    )}
                                </>
                            ) : (
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="새 그룹명 입력 (예: 국어, 수학)"
                                    value={currentGrade.groupName}
                                    onChange={(e) => setCurrentGrade({ ...currentGrade, groupName: e.target.value })}
                                />
                            )}
                        </div>

                        <div className="form-section">
                            <label className="form-label">평가 이름</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="예: 1학기 중간고사"
                                value={currentGrade.assessmentName}
                                onChange={(e) => setCurrentGrade({ ...currentGrade, assessmentName: e.target.value })}
                            />
                        </div>

                        <div className="form-section">
                            <label className="form-label">평가 기준 설정</label>
                            <div className="type-selector">
                                <div
                                    className={`type-card ${currentGrade.useExistingCriteria ? 'active' : ''}`}
                                    onClick={() => setCurrentGrade({ ...currentGrade, useExistingCriteria: true })}
                                >
                                    <span className="type-icon">📋</span>
                                    <span className="type-title">기존 기준 사용</span>
                                </div>
                                <div
                                    className={`type-card ${!currentGrade.useExistingCriteria ? 'active' : ''}`}
                                    onClick={() => setCurrentGrade({ ...currentGrade, useExistingCriteria: false })}
                                >
                                    <span className="type-icon">✨</span>
                                    <span className="type-title">새 기준 만들기</span>
                                </div>
                            </div>

                            {currentGrade.useExistingCriteria ? (
                                <div className="criteria-select-container">
                                    <select
                                        className="form-input"
                                        value={currentGrade.selectedCriteriaId}
                                        onChange={(e) => setCurrentGrade({ ...currentGrade, selectedCriteriaId: e.target.value })}
                                    >
                                        <option value="">평가 기준 선택...</option>
                                        {criteriaTemplates.map(criteria => (
                                            <option key={criteria.id} value={criteria.id}>
                                                {criteria.name} ({criteria.evaluationType === 'score' ? '점수제' : `${criteria.levels}단계`})
                                            </option>
                                        ))}
                                    </select>
                                    {currentGrade.selectedCriteriaId && criteriaTemplates.find(c => c.id === currentGrade.selectedCriteriaId)?.isCustom && (
                                        <button
                                            className="criteria-delete-btn"
                                            onClick={() => handleDeleteCriteria(currentGrade.selectedCriteriaId)}
                                            title="이 기준 삭제"
                                        >
                                            삭제
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="new-criteria-form">
                                    {/* ... Same New Criteria Form ... */}
                                    <div className="form-section">
                                        <label className="form-label">평가 방식</label>
                                        <div className="type-selector compact">
                                            <div
                                                className={`type-card ${currentGrade.evaluationType === 'score' ? 'active' : ''}`}
                                                onClick={() => setCurrentGrade({ ...currentGrade, evaluationType: 'score' })}
                                            >
                                                <span className="type-title">점수제</span>
                                            </div>
                                            <div
                                                className={`type-card ${currentGrade.evaluationType === 'steps' ? 'active' : ''}`}
                                                onClick={() => setCurrentGrade({ ...currentGrade, evaluationType: 'steps' })}
                                            >
                                                <span className="type-title">단계별 평가</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-section">
                                        <label className="form-label">기준 이름</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="예: 5단계 평가"
                                            value={currentGrade.newCriteriaName}
                                            onChange={(e) => setCurrentGrade({ ...currentGrade, newCriteriaName: e.target.value })}
                                        />
                                    </div>

                                    {currentGrade.evaluationType === 'steps' ? (
                                        <>
                                            <div className="form-section">
                                                <label className="form-label">단계 수</label>
                                                <select
                                                    className="form-input"
                                                    value={currentGrade.levels}
                                                    onChange={(e) => handleLevelsChange(e.target.value)}
                                                >
                                                    <option value="3">3단계</option>
                                                    <option value="5">5단계</option>
                                                    <option value="7">7단계</option>
                                                </select>
                                            </div>
                                            <div className="form-section">
                                                <label className="form-label">단계 명칭</label>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {currentGrade.labels.map((label, index) => (
                                                        <input
                                                            key={index}
                                                            type="text"
                                                            className="form-input"
                                                            style={{ width: 'auto', flex: 1, minWidth: '80px' }}
                                                            value={label}
                                                            onChange={(e) => handleLabelChange(index, e.target.value)}
                                                            placeholder={`${currentGrade.levels - index}단계`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="form-section">
                                            <label className="form-label">만점 점수</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={currentGrade.maxScore}
                                                onChange={(e) => setCurrentGrade({ ...currentGrade, maxScore: parseInt(e.target.value) || 100 })}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '2rem' }}>
                            <Button variant="primary" onClick={handleSetupComplete} style={{ width: '100%', padding: '0.9rem 1.5rem', fontSize: '1.05rem' }}>입력 시작</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GradeManager;
