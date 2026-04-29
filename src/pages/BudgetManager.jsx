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

    // 편집 모달 상태
    const [editModal, setEditModal] = useState({ show: false, budgetId: null });
    const [editForm, setEditForm] = useState({ name: '', totalAmount: '' });
    const [editLimits, setEditLimits] = useState([]);
    const [newLimit, setNewLimit] = useState({ name: '', maxPercent: '' });

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

    const handleAddBudget = () => {
        const numericTotalAmount = parseFloat(newBudget.totalAmount.replace(/,/g, ''));
        if (!newBudget.name.trim() || !numericTotalAmount || numericTotalAmount <= 0) {
            alert('예산명과 총 예산 금액을 올바르게 입력해주세요.');
            return;
        }
        const budget = {
            id: Date.now().toString(),
            name: newBudget.name.trim(),
            totalAmount: numericTotalAmount,
            expenses: [],
            limits: [],
            createdAt: new Date().toISOString()
        };
        setBudgets([...budgets, budget]);
        setNewBudget({ name: '', totalAmount: '' });
    };

    const handleAddExpense = () => {
        if (!selectedBudgetId) {
            alert('예산을 먼저 선택해주세요.');
            return;
        }
        const numericAmount = parseFloat(newExpense.amount.replace(/,/g, ''));
        if (!newExpense.date || !newExpense.purpose.trim() || !numericAmount || numericAmount <= 0) {
            alert('모든 필드를 올바르게 입력해주세요.');
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
        setNewLimit({ name: '', maxPercent: '' });
        setEditModal({ show: true, budgetId });
    };

    const closeEditModal = () => {
        setEditModal({ show: false, budgetId: null });
        setNewLimit({ name: '', maxPercent: '' });
    };

    const handleAddLimit = () => {
        const percent = parseFloat(newLimit.maxPercent);
        if (!newLimit.name.trim() || isNaN(percent) || percent <= 0 || percent > 100) {
            alert('항목명과 올바른 비율(1~100)을 입력해주세요.');
            return;
        }
        setEditLimits([...editLimits, {
            id: Date.now().toString(),
            name: newLimit.name.trim(),
            maxPercent: percent
        }]);
        setNewLimit({ name: '', maxPercent: '' });
    };

    const handleRemoveLimit = (limitId) => {
        setEditLimits(editLimits.filter(l => l.id !== limitId));
    };

    const handleSaveEdit = () => {
        const numericAmount = parseFloat(editForm.totalAmount.replace(/,/g, ''));
        if (!editForm.name.trim() || !numericAmount || numericAmount <= 0) {
            alert('예산명과 총 예산 금액을 올바르게 입력해주세요.');
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
        const maxAmount = Math.floor(selectedBudget.totalAmount * match.maxPercent / 100);
        const used = calculateLimitUsage(selectedBudget.expenses, match.name);
        const adding = parseFloat(newExpense.amount.replace(/,/g, '') || '0');
        const isOver = used + adding > maxAmount;
        return { match, maxAmount, used, adding, isOver };
    };

    const expenseWarning = getExpenseWarning();

    return (
        <>
            <h1>💰 예산관리</h1>

            <div className="budget-manager-container">
                {/* 새 예산 추가 섹션 */}
                <div className="add-budget-section">
                    <h2>새 예산 추가</h2>
                    <div className="budget-form">
                        <input
                            type="text"
                            placeholder="예산명 (예: 학급운영비, 체험학습)"
                            value={newBudget.name}
                            onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                            className="form-input"
                        />
                        <div className="input-wrapper">
                            <input
                                type="text"
                                name="totalAmount"
                                placeholder="총 예산 금액"
                                value={newBudget.totalAmount}
                                onChange={(e) => handleAmountChange(e, setNewBudget, newBudget)}
                                className="form-input"
                            />
                            {newBudget.totalAmount && (
                                <span className="korean-amount-text">
                                    {numberToKorean(newBudget.totalAmount)}
                                </span>
                            )}
                        </div>
                        <Button variant="primary" onClick={handleAddBudget}>
                            예산 생성
                        </Button>
                    </div>
                </div>

                {/* 예산 목록 */}
                <div className="budget-list-section">
                    <h2>예산 목록</h2>
                    {budgets.length === 0 ? (
                        <p className="text-muted">등록된 예산이 없습니다. 위에서 새 예산을 추가해주세요.</p>
                    ) : (
                        <div className="budget-grid">
                            {budgets.map(budget => {
                                const balance = calculateBalance(budget);
                                const totalExpenses = calculateTotalExpenses(budget.expenses);
                                const isSelected = selectedBudgetId === budget.id;

                                return (
                                    <div
                                        key={budget.id}
                                        className={`budget-card ${isSelected ? 'selected' : ''}`}
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
                                                    const maxAmount = Math.floor(budget.totalAmount * limit.maxPercent / 100);
                                                    const used = calculateLimitUsage(budget.expenses, limit.name);
                                                    const remaining = maxAmount - used;
                                                    const barPercent = maxAmount > 0 ? Math.min(100, Math.round(used / maxAmount * 100)) : 0;
                                                    const isOver = used > maxAmount;
                                                    return (
                                                        <div key={limit.id} className="limit-item">
                                                            <div className="limit-header">
                                                                <span className="limit-name">
                                                                    {limit.name}
                                                                    <span className="limit-percent-badge"> ({limit.maxPercent}%)</span>
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
                                {formatCurrency(expenseWarning.used)} 사용 / 한도 {formatCurrency(expenseWarning.maxAmount)} ({expenseWarning.match.maxPercent}%)
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

            {/* 편집 모달 */}
            {editModal.show && (
                <div className="modal-overlay" onClick={closeEditModal}>
                    <div className="modal-content edit-modal-content" onClick={e => e.stopPropagation()}>
                        <h3>예산 편집</h3>

                        <div className="edit-modal-section">
                            <label className="edit-label">예산명</label>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="form-input"
                            />
                        </div>

                        <div className="edit-modal-section">
                            <label className="edit-label">총 예산 금액</label>
                            <input
                                type="text"
                                name="totalAmount"
                                value={editForm.totalAmount}
                                onChange={(e) => handleAmountChange(e, setEditForm, editForm)}
                                className="form-input"
                            />
                            {editForm.totalAmount && (
                                <span className="edit-korean-text">{numberToKorean(editForm.totalAmount)}</span>
                            )}
                        </div>

                        <div className="edit-modal-section">
                            <label className="edit-label">사용 제한 항목</label>
                            <p className="edit-section-desc">항목명이 지출 사용목적에 포함되면 자동으로 집계됩니다.</p>

                            {editLimits.length > 0 && (
                                <div className="edit-limits-list">
                                    {editLimits.map(limit => (
                                        <div key={limit.id} className="edit-limit-row">
                                            <span className="edit-limit-name">{limit.name}</span>
                                            <span className="edit-limit-percent">{limit.maxPercent}%</span>
                                            <button
                                                type="button"
                                                className="remove-limit-btn"
                                                onClick={() => handleRemoveLimit(limit.id)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="add-limit-form">
                                <input
                                    type="text"
                                    placeholder="항목명 (예: 간식비)"
                                    value={newLimit.name}
                                    onChange={(e) => setNewLimit({ ...newLimit, name: e.target.value })}
                                    className="form-input"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddLimit()}
                                />
                                <div className="limit-percent-wrapper">
                                    <input
                                        type="number"
                                        placeholder="비율"
                                        min="1"
                                        max="100"
                                        value={newLimit.maxPercent}
                                        onChange={(e) => setNewLimit({ ...newLimit, maxPercent: e.target.value })}
                                        className="form-input limit-percent-input"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddLimit()}
                                    />
                                    <span className="percent-suffix">%</span>
                                </div>
                                <Button variant="secondary" onClick={handleAddLimit}>추가</Button>
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
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>삭제 확인</h3>
                        <p>
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
        </>
    );
};

export default BudgetManager;
