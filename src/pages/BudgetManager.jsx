import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { formatNumberWithCommas, numberToKorean } from '../utils/formatters';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import './BudgetManager.css';

const BudgetManager = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

    const [budgets, setBudgets] = useState([]);
    const [selectedBudgetId, setSelectedBudgetId] = useState(null);
    const [newBudget, setNewBudget] = useState({ name: '', totalAmount: '' });
    const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], purpose: '', amount: '', note: '' });
    const [deleteModal, setDeleteModal] = useState({ show: false, type: null, id: null, budgetId: null });

    // 경고 알림 모달 상태
    const [warningModal, setWarningModal] = useState({ show: false, message: '' });

    // 예산 생성 모달 상태
    const [createModal, setCreateModal] = useState({ show: false });
    const [createForm, setCreateForm] = useState({ name: '', totalAmount: '' });
    const [createLimits, setCreateLimits] = useState([]);
    const [newCreateLimit, setNewCreateLimit] = useState({ name: '', type: 'percent', value: '' });

    // 편집 모달 상태
    const [editModal, setEditModal] = useState({ show: false, budgetId: null });
    const [editForm, setEditForm] = useState({ name: '', totalAmount: '' });
    const [editLimits, setEditLimits] = useState([]);
    const [newEditLimit, setNewEditLimit] = useState({ name: '', type: 'percent', value: '' });

    const showAlert = (message) => {
        setWarningModal({ show: true, message });
    };

    const closeWarningModal = () => {
        setWarningModal({ show: false, message: '' });
    };

    useEffect(() => {
        const budgetsKey = `budgets_${classId}`;
        const savedBudgets = localStorage.getItem(budgetsKey);
        if (savedBudgets) {
            setBudgets(JSON.parse(savedBudgets));
        } else {
            setBudgets([]);
        }
    }, [classId]);

    useEffect(() => {
        const budgetsKey = `budgets_${classId}`;
        if (budgets.length > 0) {
            localStorage.setItem(budgetsKey, JSON.stringify(budgets));
        } else {
            localStorage.removeItem(budgetsKey);
        }
    }, [budgets, classId]);

    const handleAmountChange = (e, setter, state) => {
        const value = e.target.value;
        const numericValue = value.replace(/[^0-9]/g, '');
        const formattedValue = formatNumberWithCommas(numericValue);
        setter({ ...state, [e.target.name]: formattedValue });
    };

    // 예산 생성 모달 열기/닫기
    const openCreateModal = () => {
        setCreateForm({ name: '', totalAmount: '' });
        setCreateLimits([]);
        setNewCreateLimit({ name: '', type: 'percent', value: '' });
        setCreateModal({ show: true });
    };

    const closeCreateModal = () => {
        setCreateModal({ show: false });
        setCreateForm({ name: '', totalAmount: '' });
        setCreateLimits([]);
        setNewCreateLimit({ name: '', type: 'percent', value: '' });
    };

    const handleAddCreateLimit = () => {
        if (!newCreateLimit.name.trim()) {
            showAlert('제한 항목명을 입력해주세요.');
            return;
        }
        const numericVal = parseFloat(newCreateLimit.value.replace(/,/g, ''));
        if (isNaN(numericVal) || numericVal <= 0) {
            showAlert('올바른 제한 수치를 입력해주세요.');
            return;
        }
        if (newCreateLimit.type === 'percent' && numericVal > 100) {
            showAlert('비율은 100% 이하로 입력해주세요.');
            return;
        }

        setCreateLimits([
            ...createLimits,
            {
                id: Date.now().toString(),
                name: newCreateLimit.name.trim(),
                type: newCreateLimit.type,
                value: numericVal,
                maxPercent: newCreateLimit.type === 'percent' ? numericVal : undefined
            }
        ]);
        setNewCreateLimit({ name: '', type: 'percent', value: '' });
    };

    const handleRemoveCreateLimit = (limitId) => {
        setCreateLimits(createLimits.filter(l => l.id !== limitId));
    };

    const handleSaveCreateBudget = () => {
        const numericTotalAmount = parseFloat(createForm.totalAmount.replace(/,/g, ''));
        if (!createForm.name.trim() || !numericTotalAmount || numericTotalAmount <= 0) {
            showAlert('예산명과 총 예산 금액을 올바르게 입력해주세요.');
            return;
        }
        const budget = {
            id: Date.now().toString(),
            name: createForm.name.trim(),
            totalAmount: numericTotalAmount,
            expenses: [],
            limits: createLimits,
            createdAt: new Date().toISOString()
        };
        setBudgets([...budgets, budget]);
        setSelectedBudgetId(budget.id);
        closeCreateModal();
    };

    const handleAddExpense = () => {
        if (!selectedBudgetId) {
            showAlert('예산을 먼저 선택해주세요.');
            return;
        }
        const numericAmount = parseFloat(newExpense.amount.replace(/,/g, ''));
        if (!newExpense.date || !newExpense.purpose.trim() || !numericAmount || numericAmount <= 0) {
            showAlert('모든 필드를 올바르게 입력해주세요.');
            return;
        }
        const expense = {
            id: Date.now().toString(),
            date: newExpense.date,
            purpose: newExpense.purpose.trim(),
            amount: numericAmount,
            note: newExpense.note.trim()
        };
        setBudgets(budgets.map(budget =>
            budget.id === selectedBudgetId
                ? { ...budget, expenses: [...budget.expenses, expense] }
                : budget
        ));
        setNewExpense({ date: new Date().toISOString().split('T')[0], purpose: '', amount: '', note: '' });
    };

    // 편집 모달
    const openEditModal = (e, budgetId) => {
        e.preventDefault();
        e.stopPropagation();
        const budget = budgets.find(b => b.id === budgetId);
        if (!budget) return;
        setEditForm({
            name: budget.name,
            totalAmount: formatNumberWithCommas(String(budget.totalAmount))
        });
        setEditLimits(budget.limits ? [...budget.limits] : []);
        setNewEditLimit({ name: '', type: 'percent', value: '' });
        setEditModal({ show: true, budgetId });
    };

    const closeEditModal = () => {
        setEditModal({ show: false, budgetId: null });
        setNewEditLimit({ name: '', type: 'percent', value: '' });
    };

    const handleAddEditLimit = () => {
        if (!newEditLimit.name.trim()) {
            showAlert('제한 항목명을 입력해주세요.');
            return;
        }
        const numericVal = parseFloat(newEditLimit.value.replace(/,/g, ''));
        if (isNaN(numericVal) || numericVal <= 0) {
            showAlert('올바른 제한 수치를 입력해주세요.');
            return;
        }
        if (newEditLimit.type === 'percent' && numericVal > 100) {
            showAlert('비율은 100% 이하로 입력해주세요.');
            return;
        }

        setEditLimits([
            ...editLimits,
            {
                id: Date.now().toString(),
                name: newEditLimit.name.trim(),
                type: newEditLimit.type,
                value: numericVal,
                maxPercent: newEditLimit.type === 'percent' ? numericVal : undefined
            }
        ]);
        setNewEditLimit({ name: '', type: 'percent', value: '' });
    };

    const handleRemoveEditLimit = (limitId) => {
        setEditLimits(editLimits.filter(l => l.id !== limitId));
    };

    const handleSaveEdit = () => {
        const numericAmount = parseFloat(editForm.totalAmount.replace(/,/g, ''));
        if (!editForm.name.trim() || !numericAmount || numericAmount <= 0) {
            showAlert('예산명과 총 예산 금액을 올바르게 입력해주세요.');
            return;
        }
        setBudgets(budgets.map(b =>
            b.id === editModal.budgetId
                ? { ...b, name: editForm.name.trim(), totalAmount: numericAmount, limits: editLimits }
                : b
        ));
        closeEditModal();
    };

    // 삭제 모달
    const openDeleteModal = (type, id, budgetId = null) => {
        setDeleteModal({ show: true, type, id, budgetId });
    };

    const closeDeleteModal = () => {
        setDeleteModal({ show: false, type: null, id: null, budgetId: null });
    };

    const confirmDelete = () => {
        if (deleteModal.type === 'budget') {
            setBudgets(prevBudgets => prevBudgets.filter(b => b.id !== deleteModal.id));
            if (selectedBudgetId === deleteModal.id) setSelectedBudgetId(null);
        } else if (deleteModal.type === 'expense') {
            setBudgets(prevBudgets => prevBudgets.map(budget =>
                budget.id === deleteModal.budgetId
                    ? { ...budget, expenses: budget.expenses.filter(exp => exp.id !== deleteModal.id) }
                    : budget
            ));
        }
        closeDeleteModal();
    };

    const calculateLimitMaxAmount = (budget, limit) => {
        if (limit.type === 'amount') {
            return limit.value;
        }
        const percent = limit.value || limit.maxPercent || 0;
        return Math.floor((budget.totalAmount * percent) / 100);
    };

    const calculateTotalExpenses = (expenses) =>
        expenses.reduce((sum, e) => sum + e.amount, 0);

    const calculateBalance = (budget) =>
        budget.totalAmount - calculateTotalExpenses(budget.expenses);

    const calculateLimitUsage = (expenses, limitName) =>
        expenses
            .filter(e => e.purpose.toLowerCase().includes(limitName.toLowerCase()))
            .reduce((sum, e) => sum + e.amount, 0);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('ko-KR').format(amount) + '원';

    const selectedBudget = budgets.find(b => b.id === selectedBudgetId);

    // 지출 입력 중 한도 체크
    const getExpenseWarning = () => {
        if (!selectedBudget?.limits?.length || !newExpense.purpose) return null;
        const match = selectedBudget.limits.find(l =>
            newExpense.purpose.toLowerCase().includes(l.name.toLowerCase())
        );
        if (!match) return null;
        const maxAmount = calculateLimitMaxAmount(selectedBudget, match);
        const used = calculateLimitUsage(selectedBudget.expenses, match.name);
        const adding = parseFloat(newExpense.amount.replace(/,/g, '') || '0');
        const isOver = used + adding > maxAmount;
        return { match, maxAmount, used, adding, isOver };
    };

    const expenseWarning = getExpenseWarning();

    return (
        <>
            <div className="budget-manager-container">
                {/* 상단 컨트롤 바: 예산 목록 & 새 예산 생성 버튼 */}
                <div className="budget-top-header">
                    <div className="budget-top-title">
                        <h2>💰 학급 예산 관리</h2>
                        <span className="budget-count-badge">총 {budgets.length}개 예산</span>
                    </div>
                    <button className="create-budget-btn" onClick={openCreateModal}>
                        ➕ 새 예산 생성
                    </button>
                </div>

                {/* 예산 목록 */}
                <div className="budget-list-section">
                    <div className="budget-section-header">
                        <h2>예산 목록</h2>
                        <p className="section-subtitle">카드를 클릭하여 지출 내역을 확인하고 작성하세요.</p>
                    </div>
                    {budgets.length === 0 ? (
                        <div className="empty-budget-box" onClick={openCreateModal}>
                            <span className="empty-icon">➕</span>
                            <p>등록된 예산이 없습니다. 버튼을 눌러 새 예산을 생성하세요.</p>
                        </div>
                    ) : (
                        <div className="budget-grid">
                            {budgets.map(budget => {
                                const balance = calculateBalance(budget);
                                const totalExpenses = calculateTotalExpenses(budget.expenses);
                                const isSelected = selectedBudgetId === budget.id;

                                return (
                                    <div
                                        key={budget.id}
                                        className={`budget-card green-theme-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => setSelectedBudgetId(budget.id)}
                                    >
                                        <button
                                            type="button"
                                            className="card-action-btn edit-btn"
                                            onClick={(e) => openEditModal(e, budget.id)}
                                            title="편집"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            type="button"
                                            className="card-action-btn delete-btn-small"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                openDeleteModal('budget', budget.id);
                                            }}
                                        >
                                            ✕
                                        </button>
                                        <div className="budget-card-header">
                                            <h3>{budget.name}</h3>
                                        </div>
                                        <div className="budget-info">
                                            <div className="budget-row">
                                                <span>총 예산:</span>
                                                <strong>{formatCurrency(budget.totalAmount)}</strong>
                                            </div>
                                            <div className="budget-row">
                                                <span>총 지출:</span>
                                                <span className="expense-amount">{formatCurrency(totalExpenses)}</span>
                                            </div>
                                            <div className="budget-row balance-row">
                                                <span>잔액:</span>
                                                <strong className={balance >= 0 ? 'balance-positive' : 'balance-negative'}>
                                                    {formatCurrency(balance)}
                                                </strong>
                                            </div>
                                        </div>

                                        {/* 사용 제한 항목 진행 바 */}
                                        {budget.limits && budget.limits.length > 0 && (
                                            <div className="budget-limits">
                                                {budget.limits.map(limit => {
                                                    const maxAmount = calculateLimitMaxAmount(budget, limit);
                                                    const used = calculateLimitUsage(budget.expenses, limit.name);
                                                    const remaining = maxAmount - used;
                                                    const barPercent = maxAmount > 0 ? Math.min(100, Math.round((used / maxAmount) * 100)) : 0;
                                                    const isOver = used > maxAmount;
                                                    const limitBadgeText = limit.type === 'amount'
                                                        ? formatCurrency(limit.value)
                                                        : `${limit.value || limit.maxPercent}%`;

                                                    return (
                                                        <div key={limit.id} className="limit-item">
                                                            <div className="limit-header">
                                                                <span className="limit-name">
                                                                    🚫 {limit.name}
                                                                    <span className="limit-percent-badge"> ({limitBadgeText})</span>
                                                                </span>
                                                                <span className={`limit-remaining ${isOver ? 'over' : ''}`}>
                                                                    {isOver ? `${formatCurrency(Math.abs(remaining))} 초과` : `잔여 ${formatCurrency(remaining)}`}
                                                                </span>
                                                            </div>
                                                            <div className="limit-detail">
                                                                사용 {formatCurrency(used)} / 한도 {formatCurrency(maxAmount)}
                                                            </div>
                                                            <div className="limit-bar-bg">
                                                                <div
                                                                    className={`limit-bar ${isOver ? 'over' : ''}`}
                                                                    style={{ width: `${barPercent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div className="budget-footer">
                                            <small>{budget.expenses.length}개의 지출 내역</small>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 선택된 예산의 지출 내역 */}
                {selectedBudget && (
                    <div className="expense-section">
                        <h2>{selectedBudget.name} - 지출 내역</h2>

                        <div className="add-expense-form">
                            <input
                                type="date"
                                value={newExpense.date}
                                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                                className="form-input"
                            />
                            <input
                                type="text"
                                placeholder="사용 목적"
                                value={newExpense.purpose}
                                onChange={(e) => setNewExpense({ ...newExpense, purpose: e.target.value })}
                                className="form-input"
                            />
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    name="amount"
                                    placeholder="금액"
                                    value={newExpense.amount}
                                    onChange={(e) => handleAmountChange(e, setNewExpense, newExpense)}
                                    className="form-input"
                                />
                                {newExpense.amount && (
                                    <span className="korean-amount-text">
                                        {numberToKorean(newExpense.amount)}
                                    </span>
                                )}
                            </div>
                            <input
                                type="text"
                                placeholder="비고 (선택사항)"
                                value={newExpense.note}
                                onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
                                className="form-input"
                            />
                            <Button variant="accent" onClick={handleAddExpense}>
                                지출 추가
                            </Button>
                        </div>

                        {/* 한도 경고 */}
                        {expenseWarning && (
                            <div className={`expense-limit-hint ${expenseWarning.isOver ? 'over' : 'ok'}`}>
                                <span className="hint-label">{expenseWarning.match.name} 한도</span>
                                {formatCurrency(expenseWarning.used)} 사용 / 한도 {formatCurrency(expenseWarning.maxAmount)}
                                {expenseWarning.isOver && <span className="hint-warn"> ⚠️ 한도를 초과합니다</span>}
                            </div>
                        )}

                        {selectedBudget.expenses.length === 0 ? (
                            <p className="text-muted">등록된 지출 내역이 없습니다.</p>
                        ) : (
                            <table className="expense-table">
                                <thead>
                                    <tr>
                                        <th>날짜</th>
                                        <th>사용 목적</th>
                                        <th>금액</th>
                                        <th>비고</th>
                                        <th style={{ width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...selectedBudget.expenses]
                                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                                        .map(expense => (
                                            <tr key={expense.id}>
                                                <td>{new Date(expense.date).toLocaleDateString('ko-KR')}</td>
                                                <td>{expense.purpose}</td>
                                                <td className="expense-amount">{formatCurrency(expense.amount)}</td>
                                                <td className="expense-note">{expense.note || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        className="delete-expense-btn"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            openDeleteModal('expense', expense.id, selectedBudget.id);
                                                        }}
                                                        title="삭제"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* 예산 생성 모달 */}
            {createModal.show && (
                <div className="modal-overlay" onClick={closeCreateModal}>
                    <div className="modal-content budget-form-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>➕ 새 예산 생성</h2>
                            <button className="modal-close" onClick={closeCreateModal}>×</button>
                        </div>

                        <div className="modal-body-fields">
                            {/* 예산명 (좌: 라벨, 우: 입력칸 가로 배치) */}
                            <div className="horizontal-form-row">
                                <label className="horizontal-label">예산명 <span className="req-star">*</span></label>
                                <div className="horizontal-input-wrap">
                                    <input
                                        type="text"
                                        placeholder="예: 학급운영비, 체험학습비"
                                        value={createForm.name}
                                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            {/* 총 예산 금액 (좌: 라벨, 우: 입력칸 가로 배치) */}
                            <div className="horizontal-form-row">
                                <label className="horizontal-label">총 예산 금액 <span className="req-star">*</span></label>
                                <div className="horizontal-input-wrap relative-input-wrap">
                                    <input
                                        type="text"
                                        name="totalAmount"
                                        placeholder="금액 입력 (원)"
                                        value={createForm.totalAmount}
                                        onChange={(e) => handleAmountChange(e, setCreateForm, createForm)}
                                        className="form-input"
                                    />
                                    {createForm.totalAmount && (
                                        <span className="inline-korean-preview">{numberToKorean(createForm.totalAmount)}</span>
                                    )}
                                </div>
                            </div>

                            {/* 사용 제한 항목 설정 (한줄 구성) */}
                            <div className="horizontal-limit-section">
                                <div className="limit-section-header">
                                    <label className="horizontal-label">사용 제한 항목 <small style={{ fontWeight: 400, color: '#64748b' }}>(선택사항)</small></label>
                                </div>

                                {/* 한줄 추가 폼: [항목명] [비율/금액 선택] [수치 입력] [➕ 추가] */}
                                <div className="single-line-limit-builder">
                                    <input
                                        type="text"
                                        placeholder="항목명 (예: 간식비)"
                                        value={newCreateLimit.name}
                                        onChange={(e) => setNewCreateLimit({ ...newCreateLimit, name: e.target.value })}
                                        className="form-input builder-name-input"
                                    />

                                    <div className="builder-type-pills">
                                        <button
                                            type="button"
                                            className={`pill-option ${newCreateLimit.type === 'percent' ? 'active' : ''}`}
                                            onClick={() => setNewCreateLimit({ ...newCreateLimit, type: 'percent', value: '' })}
                                        >
                                            비율 (%)
                                        </button>
                                        <button
                                            type="button"
                                            className={`pill-option ${newCreateLimit.type === 'amount' ? 'active' : ''}`}
                                            onClick={() => setNewCreateLimit({ ...newCreateLimit, type: 'amount', value: '' })}
                                        >
                                            금액 (원)
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder={newCreateLimit.type === 'percent' ? '비율 (%)' : '금액 (원)'}
                                        value={newCreateLimit.value}
                                        onChange={(e) => {
                                            if (newCreateLimit.type === 'amount') {
                                                const numericVal = e.target.value.replace(/[^0-9]/g, '');
                                                setNewCreateLimit({ ...newCreateLimit, value: formatNumberWithCommas(numericVal) });
                                            } else {
                                                setNewCreateLimit({ ...newCreateLimit, value: e.target.value });
                                            }
                                        }}
                                        className="form-input builder-value-input"
                                    />

                                    <button type="button" className="builder-add-btn" onClick={handleAddCreateLimit}>
                                        ➕ 추가
                                    </button>
                                </div>

                                {/* 등록된 제한 항목 태그 리스트 */}
                                {createLimits.length > 0 && (
                                    <div className="builder-tags-list">
                                        {createLimits.map(limit => (
                                            <div key={limit.id} className="builder-tag-item">
                                                <span className="tag-name">🚫 {limit.name}</span>
                                                <span className="tag-val">
                                                    {limit.type === 'amount' ? formatCurrency(limit.value) : `${limit.value}%`}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="tag-del-btn"
                                                    onClick={() => handleRemoveCreateLimit(limit.id)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-actions">
                            <Button variant="secondary" onClick={closeCreateModal}>취소</Button>
                            <Button variant="primary" onClick={handleSaveCreateBudget}>예산 생성 완료</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 편집 모달 */}
            {editModal.show && (
                <div className="modal-overlay" onClick={closeEditModal}>
                    <div className="modal-content budget-form-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>✎ 예산 편집</h2>
                            <button className="modal-close" onClick={closeEditModal}>×</button>
                        </div>

                        <div className="modal-body-fields">
                            <div className="horizontal-form-row">
                                <label className="horizontal-label">예산명 <span className="req-star">*</span></label>
                                <div className="horizontal-input-wrap">
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <div className="horizontal-form-row">
                                <label className="horizontal-label">총 예산 금액 <span className="req-star">*</span></label>
                                <div className="horizontal-input-wrap relative-input-wrap">
                                    <input
                                        type="text"
                                        name="totalAmount"
                                        value={editForm.totalAmount}
                                        onChange={(e) => handleAmountChange(e, setEditForm, editForm)}
                                        className="form-input"
                                    />
                                    {editForm.totalAmount && (
                                        <span className="inline-korean-preview">{numberToKorean(editForm.totalAmount)}</span>
                                    )}
                                </div>
                            </div>

                            <div className="horizontal-limit-section">
                                <div className="limit-section-header">
                                    <label className="horizontal-label">사용 제한 항목 <small style={{ fontWeight: 400, color: '#64748b' }}>(선택사항)</small></label>
                                </div>

                                <div className="single-line-limit-builder">
                                    <input
                                        type="text"
                                        placeholder="항목명 (예: 간식비)"
                                        value={newEditLimit.name}
                                        onChange={(e) => setNewEditLimit({ ...newEditLimit, name: e.target.value })}
                                        className="form-input builder-name-input"
                                    />

                                    <div className="builder-type-pills">
                                        <button
                                            type="button"
                                            className={`pill-option ${newEditLimit.type === 'percent' ? 'active' : ''}`}
                                            onClick={() => setNewEditLimit({ ...newEditLimit, type: 'percent', value: '' })}
                                        >
                                            비율 (%)
                                        </button>
                                        <button
                                            type="button"
                                            className={`pill-option ${newEditLimit.type === 'amount' ? 'active' : ''}`}
                                            onClick={() => setNewEditLimit({ ...newEditLimit, type: 'amount', value: '' })}
                                        >
                                            금액 (원)
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder={newEditLimit.type === 'percent' ? '비율 (%)' : '금액 (원)'}
                                        value={newEditLimit.value}
                                        onChange={(e) => {
                                            if (newEditLimit.type === 'amount') {
                                                const numericVal = e.target.value.replace(/[^0-9]/g, '');
                                                setNewEditLimit({ ...newEditLimit, value: formatNumberWithCommas(numericVal) });
                                            } else {
                                                setNewEditLimit({ ...newEditLimit, value: e.target.value });
                                            }
                                        }}
                                        className="form-input builder-value-input"
                                    />

                                    <button type="button" className="builder-add-btn" onClick={handleAddEditLimit}>
                                        ➕ 추가
                                    </button>
                                </div>

                                {editLimits.length > 0 && (
                                    <div className="builder-tags-list">
                                        {editLimits.map(limit => (
                                            <div key={limit.id} className="builder-tag-item">
                                                <span className="tag-name">🚫 {limit.name}</span>
                                                <span className="tag-val">
                                                    {limit.type === 'amount' ? formatCurrency(limit.value) : `${limit.value || limit.maxPercent}%`}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="tag-del-btn"
                                                    onClick={() => handleRemoveEditLimit(limit.id)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-actions">
                            <Button variant="secondary" onClick={closeEditModal}>취소</Button>
                            <Button variant="primary" onClick={handleSaveEdit}>저장</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 삭제 확인 모달 */}
            {deleteModal.show && (
                <div className="modal-overlay" onClick={closeDeleteModal}>
                    <div className="modal-content delete-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>🗑️ 삭제 확인</h2>
                            <button className="modal-close" onClick={closeDeleteModal}>×</button>
                        </div>
                        <p className="delete-modal-msg">
                            {deleteModal.type === 'budget'
                                ? '이 예산을 삭제하시겠습니까? 모든 지출 내역도 함께 삭제됩니다.'
                                : '이 지출 내역을 삭제하시겠습니까?'}
                        </p>
                        <div className="modal-actions">
                            <Button variant="secondary" onClick={closeDeleteModal}>취소</Button>
                            <Button variant="danger" onClick={confirmDelete} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}>삭제</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 경고 알림 모달 */}
            {warningModal.show && (
                <div className="modal-overlay warning-modal-overlay" onClick={closeWarningModal}>
                    <div className="modal-content warning-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="warning-modal-header">
                            <span className="warning-modal-icon">⚠️</span>
                            <h3>알림</h3>
                        </div>
                        <p className="warning-modal-message">{warningModal.message}</p>
                        <div className="warning-modal-actions">
                            <button type="button" className="warning-confirm-btn" onClick={closeWarningModal}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BudgetManager;
