import React, { useState, useEffect, useMemo } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import './ClassRole.css';

const ClassRole = () => {
    const { students } = useStudentContext();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;
    const storageKey = `class_roles_${classId}`;

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

    const [roles, setRoles] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(null); // role index
    const [editingRole, setEditingRole] = useState(null); // role index for editing
    const [form, setForm] = useState({ name: '', description: '', count: 1 });
    const [selectedStudents, setSelectedStudents] = useState([]);

    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try { setRoles(JSON.parse(saved)); } catch { setRoles([]); }
        } else {
            setRoles([]);
        }
    }, [storageKey]);

    const saveRoles = (newRoles) => {
        setRoles(newRoles);
        localStorage.setItem(storageKey, JSON.stringify(newRoles));
    };

    const openAddModal = () => {
        setForm({ name: '', description: '', count: 1 });
        setEditingRole(null);
        setShowAddModal(true);
    };

    const openEditModal = (index) => {
        const role = roles[index];
        setForm({ name: role.name, description: role.description, count: role.count });
        setEditingRole(index);
        setShowAddModal(true);
    };

    const handleFormSubmit = () => {
        if (!form.name.trim()) return;
        const count = Math.max(1, Number(form.count) || 1);

        if (editingRole !== null) {
            // 편집: 인원 수가 줄었으면 초과된 배정 학생 잘라내기
            const updated = roles.map((r, i) => {
                if (i !== editingRole) return r;
                const trimmedStudents = (r.assignedStudents || []).slice(0, count);
                return { ...r, name: form.name.trim(), description: form.description.trim(), count, assignedStudents: trimmedStudents };
            });
            saveRoles(updated);
        } else {
            const newRole = {
                id: Date.now(),
                name: form.name.trim(),
                description: form.description.trim(),
                count,
                assignedStudents: [],
            };
            saveRoles([...roles, newRole]);
        }
        setShowAddModal(false);
    };

    const handleDeleteRole = (index) => {
        if (!window.confirm(`'${roles[index].name}' 역할을 삭제하시겠습니까?`)) return;
        saveRoles(roles.filter((_, i) => i !== index));
    };

    // 현재 역할(index 제외)에 이미 배정된 학생 ID 집합
    const getAlreadyAssigned = (excludeIndex) => {
        const ids = new Set();
        roles.forEach((r, i) => {
            if (i === excludeIndex) return;
            (r.assignedStudents || []).forEach(id => ids.add(id));
        });
        return ids;
    };

    const openAssignModal = (index) => {
        setSelectedStudents(roles[index].assignedStudents || []);
        setShowAssignModal(index);
    };

    const toggleStudentAssign = (studentId) => {
        const role = roles[showAssignModal];
        const maxCount = role.count;
        setSelectedStudents(prev => {
            if (prev.includes(studentId)) {
                return prev.filter(id => id !== studentId);
            }
            if (prev.length >= maxCount) return prev;
            return [...prev, studentId];
        });
    };

    const handleRemoveAssigned = (roleIndex, studentId) => {
        const updated = roles.map((r, i) => {
            if (i !== roleIndex) return r;
            return { ...r, assignedStudents: (r.assignedStudents || []).filter(id => id !== studentId) };
        });
        saveRoles(updated);
    };

    const handleAssignSave = () => {
        const updated = roles.map((r, i) =>
            i === showAssignModal ? { ...r, assignedStudents: selectedStudents } : r
        );
        saveRoles(updated);
        setShowAssignModal(null);
    };

    const getStudentById = (id) => sortedStudents.find(s => s.id === id);

    // 총합 통계
    const totalCapacity = roles.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    const totalAssigned = roles.reduce((sum, r) => sum + (r.assignedStudents || []).length, 0);
    const allFull = roles.length > 0 && totalAssigned === totalCapacity;

    const handlePrint = () => {
        const printArea = document.querySelector('.cr-print-area');
        if (!printArea) { window.print(); return; }

        // 높이 측정: 임시로 화면에 표시
        printArea.style.cssText = 'display:block;position:absolute;top:-9999px;left:0;width:178mm;zoom:1;';
        const naturalHeight = printArea.scrollHeight;
        printArea.style.cssText = '';

        // A4 콘텐츠 높이: 297mm - 28mm(여백) = 269mm → 96dpi 기준 px
        const A4_H_PX = 269 * (96 / 25.4);
        const zoom = Math.min(1.5, Math.max(0.45, A4_H_PX / naturalHeight));

        // zoom을 인라인 스타일로 직접 적용 (@ media print 인젝션보다 안정적)
        printArea.style.zoom = String(zoom);
        window.print();
        printArea.style.zoom = '';
    };

    if (!students || students.length === 0) {
        return (
            <div className="cr-empty">
                <div className="cr-empty-icon">👥</div>
                <p>학생 명단이 없습니다.</p>
                <p className="cr-empty-sub">학생 관리에서 학생을 먼저 추가해주세요.</p>
            </div>
        );
    }

    return (
        <div className="cr-page">
            <div className="cr-header">
                <h1 className="cr-title">🎭 일인 일역</h1>
                <div className="cr-header-actions">
                    {roles.length > 0 && (
                        <button className="cr-print-btn" onClick={handlePrint}>🖨️ 인쇄</button>
                    )}
                    <button className="cr-add-btn" onClick={openAddModal}>+ 역할 추가</button>
                </div>
            </div>

            {roles.length > 0 && (
                <div className={`cr-summary ${allFull ? 'cr-summary-full' : ''}`}>
                    <div className="cr-summary-item">
                        <span className="cr-summary-label">전체 역할</span>
                        <span className="cr-summary-value">{roles.length}개</span>
                    </div>
                    <div className="cr-summary-divider" />
                    <div className="cr-summary-item">
                        <span className="cr-summary-label">총 인원 설정</span>
                        <span className="cr-summary-value">{totalCapacity}명</span>
                    </div>
                    <div className="cr-summary-divider" />
                    <div className="cr-summary-item">
                        <span className="cr-summary-label">배정 완료</span>
                        <span className={`cr-summary-value ${allFull ? 'cr-summary-done' : 'cr-summary-incomplete'}`}>
                            {totalAssigned}/{totalCapacity}명
                        </span>
                    </div>
                    {allFull && <span className="cr-summary-badge">✅ 배정 완료</span>}
                </div>
            )}

            {roles.length === 0 ? (
                <div className="cr-no-roles">
                    <p>아직 등록된 역할이 없습니다.</p>
                    <p className="cr-no-roles-sub">역할 추가 버튼을 눌러 일인일역을 만들어보세요.</p>
                </div>
            ) : (
                <div className="cr-table-wrap">
                    <table className="cr-table">
                        <thead>
                            <tr>
                                <th>역할</th>
                                <th>내용</th>
                                <th>인원</th>
                                <th>담당 학생</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role, index) => {
                                const assigned = (role.assignedStudents || []).map(id => getStudentById(id)).filter(Boolean);
                                const filled = assigned.length;
                                const isFull = filled >= role.count;
                                return (
                                    <tr key={role.id} className={isFull ? 'cr-row-full' : 'cr-row-incomplete'}>
                                        <td className="cr-role-name">{role.name}</td>
                                        <td className="cr-role-desc">{role.description || <span className="cr-empty-desc">-</span>}</td>
                                        <td className="cr-role-count">
                                            <span className={`cr-count-badge ${isFull ? 'full' : ''}`}>
                                                {filled}/{role.count}
                                            </span>
                                        </td>
                                        <td className="cr-role-students">
                                            {assigned.length === 0 ? (
                                                <span className="cr-unassigned">미배정</span>
                                            ) : (
                                                <div className="cr-student-chips">
                                                    {assigned.map(s => (
                                                        <span key={s.id} className={`cr-chip cr-chip-${s.gender}`}>
                                                            {s.attendanceNumber}번 {s.name}
                                                            <button
                                                                className="cr-chip-remove"
                                                                onClick={() => handleRemoveAssigned(index, s.id)}
                                                                title="배정 해제"
                                                            >×</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="cr-role-actions">
                                            <button className="cr-btn cr-btn-assign" onClick={() => openAssignModal(index)}>
                                                배정
                                            </button>
                                            <button className="cr-btn cr-btn-edit" onClick={() => openEditModal(index)}>
                                                수정
                                            </button>
                                            <button className="cr-btn cr-btn-delete" onClick={() => handleDeleteRole(index)}>
                                                삭제
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 역할 추가/수정 모달 */}
            {showAddModal && (
                <div className="cr-modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="cr-modal" onClick={e => e.stopPropagation()}>
                        <div className="cr-modal-header">
                            <h2>{editingRole !== null ? '역할 수정' : '역할 추가'}</h2>
                            <button className="cr-modal-close" onClick={() => setShowAddModal(false)}>×</button>
                        </div>
                        <div className="cr-modal-body">
                            <div className="cr-form-group">
                                <label>역할명 *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="예: 청소 담당, 환경 미화원"
                                    className="cr-input"
                                />
                            </div>
                            <div className="cr-form-group">
                                <label>내용</label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="예: 매일 교실 바닥 청소"
                                    className="cr-input"
                                />
                            </div>
                            <div className="cr-form-group">
                                <label>인원 수</label>
                                <input
                                    type="number"
                                    value={form.count}
                                    min={1}
                                    max={sortedStudents.length}
                                    onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                                    className="cr-input cr-input-number"
                                />
                            </div>
                        </div>
                        <div className="cr-modal-footer">
                            <button className="cr-modal-cancel" onClick={() => setShowAddModal(false)}>취소</button>
                            <button
                                className="cr-modal-confirm"
                                onClick={handleFormSubmit}
                                disabled={!form.name.trim()}
                            >
                                {editingRole !== null ? '수정 완료' : '추가'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 인쇄 전용 영역 */}
            <div className="cr-print-area">
                <div className="cr-print-header-bar">
                    <div>
                        <div className="cr-print-title">일인 일역</div>
                    </div>
                    <div className="cr-print-subtitle">{currentClass?.name || ''}</div>
                </div>
                <div className="cr-print-deco" />
                <div className="cr-print-stats">
                    <div className="cr-print-stat-box">
                        <span className="cr-print-stat-label">전체 역할</span>
                        <span className="cr-print-stat-value">{roles.length}개</span>
                    </div>
                    <div className="cr-print-stat-box">
                        <span className="cr-print-stat-label">총 인원</span>
                        <span className="cr-print-stat-value">{totalCapacity}명</span>
                    </div>
                    <div className="cr-print-stat-box">
                        <span className="cr-print-stat-label">배정 완료</span>
                        <span className="cr-print-stat-value">{totalAssigned}명</span>
                    </div>
                </div>
                <table className="cr-print-table">
                    <colgroup>
                        <col /><col /><col /><col />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>역할</th>
                            <th>내용</th>
                            <th>인원</th>
                            <th>담당 학생</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map(role => {
                            const assigned = (role.assignedStudents || []).map(id => getStudentById(id)).filter(Boolean);
                            return (
                                <tr key={role.id}>
                                    <td className="cr-print-role">{role.name}</td>
                                    <td className="cr-print-desc">{role.description || '-'}</td>
                                    <td className="cr-print-count">{role.count}명</td>
                                    <td className="cr-print-students">
                                        {assigned.length === 0
                                            ? '미배정'
                                            : assigned.map(s => `${s.attendanceNumber}번 ${s.name}`).join('  ·  ')}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="cr-print-footer">
                    <span className="cr-print-footer-left">인쇄일: {new Date().toLocaleDateString('ko-KR')}</span>
                    <span className="cr-print-footer-right">총 {roles.length}개 역할 · {totalCapacity}명 배정</span>
                </div>
            </div>

            {/* 학생 배정 모달 */}
            {showAssignModal !== null && (
                <div className="cr-modal-overlay" onClick={() => setShowAssignModal(null)}>
                    <div className="cr-modal cr-assign-modal" onClick={e => e.stopPropagation()}>
                        <div className="cr-modal-header">
                            <h2>학생 배정 — {roles[showAssignModal]?.name}</h2>
                            <button className="cr-modal-close" onClick={() => setShowAssignModal(null)}>×</button>
                        </div>
                        <div className="cr-modal-sub">
                            {selectedStudents.length}/{roles[showAssignModal]?.count}명 선택됨
                        </div>
                        <div className="cr-assign-grid">
                            {sortedStudents
                                .filter(student => {
                                    // 다른 역할에 이미 배정된 학생 제외 (현재 역할에 있는 학생은 유지)
                                    const alreadyAssigned = getAlreadyAssigned(showAssignModal);
                                    return !alreadyAssigned.has(student.id);
                                })
                                .map(student => {
                                    const isSelected = selectedStudents.includes(student.id);
                                    const maxReached = selectedStudents.length >= roles[showAssignModal]?.count;
                                    const disabled = !isSelected && maxReached;
                                    return (
                                        <div
                                            key={student.id}
                                            className={`cr-assign-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''} cr-gender-${student.gender}`}
                                            onClick={() => !disabled && toggleStudentAssign(student.id)}
                                        >
                                            <div className="cr-assign-check">{isSelected ? '✓' : ''}</div>
                                            <div className="cr-assign-num">{student.attendanceNumber}번</div>
                                            <div className="cr-assign-name">{student.name}</div>
                                        </div>
                                    );
                                })}
                        </div>
                        <div className="cr-modal-footer">
                            <button className="cr-modal-cancel" onClick={() => setShowAssignModal(null)}>취소</button>
                            <button className="cr-modal-confirm" onClick={handleAssignSave}>저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassRole;
