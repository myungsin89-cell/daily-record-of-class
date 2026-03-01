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

    // Load budgets from localStorage when class changes
    useEffect(() => {
        const budgetsKey = `budgets_${classId}`;
        const savedBudgets = localStorage.getItem(budgetsKey);
        if (savedBudgets) {
            setBudgets(JSON.parse(savedBudgets));
        } else {
            setBudgets([]);
        }
    }, [classId]);

    // Save budgets to localStorage whenever they change
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

    // 모달 상태 관리
    const [deleteModal, setDeleteModal] = useState({ show: false, type: null, id: null, budgetId: null });

    const openDeleteModal = (type, id, budgetId = null) => {
        setDeleteModal({ show: true, type, id, budgetId });
    };

    const closeDeleteModal = () => {
        setDeleteModal({ show: false, type: null, id: null, budgetId: null });
    };

    const confirmDelete = () => {
        if (deleteModal.type === 'budget') {
            setBudgets(prevBudgets => {
                const updatedBudgets = prevBudgets.filter(b => b.id !== deleteModal.id);
                return updatedBudgets;
            });
            if (selectedBudgetId === deleteModal.id) {
                setSelectedBudgetId(null);
            }
        } else if (deleteModal.type === 'expense') {
            setBudgets(prevBudgets => prevBudgets.map(budget =>
                budget.id === deleteModal.budgetId
                    ? { ...budget, expenses: budget.expenses.filter(exp => exp.id !== deleteModal.id) }
                    : budget
            ));
        }
        closeDeleteModal();
    };

    const calculateTotalExpenses = (expenses) => {
        return expenses.reduce((sum, expense) => sum + expense.amount, 0);
    };

    const calculateBalance = (budget) => {
        const totalExpenses = calculateTotalExpenses(budget.expenses);
        return budget.totalAmount - totalExpenses;
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR').format(amount) + '원';
    };

    const selectedBudget = budgets.find(b => b.id === selectedBudgetId);

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
                                            className="delete-btn-small"
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

                        {/* 새 지출 추가 폼 */}
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

                        {/* 지출 내역 테이블 */}
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
