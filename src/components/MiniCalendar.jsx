import React, { useState } from 'react';

const MiniCalendar = ({ todos, onDateClick, holidays = [], addTodo }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [activeInputDate, setActiveInputDate] = useState(null);

    // 날짜를 YYYY-MM-DD 형식으로 변환
    const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 달의 첫날과 마지막날 구하기
    const getMonthData = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // 첫 주의 시작 (월요일 기준)
        const startDay = new Date(firstDay);
        const dayOfWeek = firstDay.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startDay.setDate(firstDay.getDate() + diff);

        return { firstDay, lastDay, startDay };
    };

    const { firstDay, lastDay, startDay } = getMonthData(currentMonth);

    // 6주 × 7일 = 42일의 날짜 배열 생성
    const days = [];
    const tempDate = new Date(startDay);
    for (let i = 0; i < 42; i++) {
        days.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
    }

    const handlePrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    const handleToday = () => {
        setCurrentMonth(new Date());
    };

    const handleDateClick = (date) => {
        const dateStr = formatDateLocal(date);
        if (addTodo) {
            // 할일 추가 input 토글
            setActiveInputDate(activeInputDate === dateStr ? null : dateStr);
        } else if (onDateClick) {
            onDateClick(date);
        }
    };

    const handleAddTodo = (dateStr, e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
            addTodo(dateStr, e.target.value.trim());
            e.target.value = '';
        } else if (e.key === 'Escape') {
            setActiveInputDate(null);
        }
    };

    const isToday = (date) => {
        const today = new Date();
        return formatDateLocal(date) === formatDateLocal(today);
    };

    const isCurrentMonth = (date) => {
        return date.getMonth() === currentMonth.getMonth();
    };

    const getDayTodos = (date) => {
        const dateStr = formatDateLocal(date);
        return todos[dateStr] || [];
    };

    const isHoliday = (date) => {
        const dateStr = formatDateLocal(date);
        return holidays.some(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate === dateStr;
        });
    };

    const getHolidayName = (date) => {
        const dateStr = formatDateLocal(date);
        const holiday = holidays.find(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate === dateStr;
        });
        if (!holiday) return '';
        return typeof holiday === 'string' ? '공휴일' : holiday.name || '공휴일';
    };

    const MAX_VISIBLE_TODOS = 3;

    return (
        <div className="full-calendar">
            {/* Header */}
            <div className="full-cal-header">
                <button onClick={handlePrevMonth} className="full-cal-nav" title="이전 달">
                    ‹
                </button>
                <div className="full-cal-title">
                    {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </div>
                <button onClick={handleNextMonth} className="full-cal-nav" title="다음 달">
                    ›
                </button>
                <button onClick={handleToday} className="full-cal-today-btn">
                    오늘
                </button>
            </div>

            {/* Weekday Headers */}
            <div className="full-cal-weekdays">
                <div>월</div>
                <div>화</div>
                <div>수</div>
                <div>목</div>
                <div>금</div>
                <div className="weekend-label">토</div>
                <div className="weekend-label sunday-label">일</div>
            </div>

            {/* Days Grid */}
            <div className="full-cal-grid">
                {days.map((date, index) => {
                    const dateStr = formatDateLocal(date);
                    const dayTodos = getDayTodos(date);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const isSunday = dayOfWeek === 0;
                    const isHolidayDate = isHoliday(date);
                    const holidayName = isHolidayDate ? getHolidayName(date) : '';
                    const visibleTodos = dayTodos.slice(0, MAX_VISIBLE_TODOS);
                    const overflowCount = dayTodos.length - MAX_VISIBLE_TODOS;
                    const isActive = activeInputDate === dateStr;

                    return (
                        <div
                            key={index}
                            className={`full-cal-day ${!isCurrentMonth(date) ? 'other-month' : ''} ${isToday(date) ? 'is-today' : ''
                                } ${isActive ? 'is-active' : ''}`}
                            onClick={() => handleDateClick(date)}
                        >
                            {/* Day Number */}
                            <div className={`full-cal-day-num ${isSunday || isHolidayDate ? 'sunday' : ''} ${isWeekend && !isSunday ? 'saturday' : ''}`}>
                                {date.getDate()}
                                {isHolidayDate && (
                                    <span className="full-cal-holiday-name">{holidayName}</span>
                                )}
                            </div>

                            {/* Todo List */}
                            <div className="full-cal-todos">
                                {visibleTodos.map((todo) => (
                                    <div
                                        key={todo.id}
                                        className={`full-cal-todo-item ${todo.completed ? 'completed' : ''}`}
                                        style={{ color: todo.style?.color || 'inherit' }}
                                    >
                                        <span className="full-cal-todo-dot" style={{ backgroundColor: todo.completed ? '#9ca3af' : (todo.style?.color || '#10b981') }} />
                                        <span className="full-cal-todo-text">{todo.text}</span>
                                    </div>
                                ))}
                                {overflowCount > 0 && (
                                    <div className="full-cal-overflow">
                                        + {overflowCount}개 더
                                    </div>
                                )}
                            </div>

                            {/* Inline Todo Input */}
                            {isActive && addTodo && (
                                <div className="full-cal-input-wrap" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="text"
                                        className="full-cal-todo-input"
                                        placeholder="할 일 입력 후 Enter"
                                        onKeyDown={(e) => handleAddTodo(dateStr, e)}
                                        autoFocus
                                        onBlur={() => setActiveInputDate(null)}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <style>{`
                .full-calendar {
                    background: white;
                    border-radius: var(--radius-md);
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .full-cal-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.5rem 0 1rem 0;
                }

                .full-cal-title {
                    font-weight: 700;
                    font-size: 1.35rem;
                    color: var(--color-text);
                    min-width: 140px;
                    text-align: center;
                }

                .full-cal-nav {
                    background: none;
                    border: 1px solid var(--color-border);
                    font-size: 1.4rem;
                    cursor: pointer;
                    padding: 0.3rem 0.7rem;
                    color: var(--color-text-muted);
                    transition: all 0.2s;
                    border-radius: var(--radius-md);
                    line-height: 1;
                }

                .full-cal-nav:hover {
                    color: var(--color-primary);
                    border-color: var(--color-primary);
                    background: #f0f9ff;
                }

                .full-cal-today-btn {
                    background: var(--color-primary);
                    color: white;
                    border: none;
                    padding: 0.4rem 1rem;
                    border-radius: var(--radius-md);
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    margin-left: 0.5rem;
                }

                .full-cal-today-btn:hover {
                    background: #0369a1;
                }

                .full-cal-weekdays {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    text-align: center;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--color-text-muted);
                    padding-bottom: 0.5rem;
                    border-bottom: 2px solid var(--color-border);
                }

                .full-cal-weekdays .weekend-label {
                    color: #3b82f6;
                }

                .full-cal-weekdays .sunday-label {
                    color: #ef4444;
                }

                .full-cal-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    flex: 1;
                    border-left: 1px solid #f1f5f9;
                }

                .full-cal-day {
                    border-right: 1px solid #f1f5f9;
                    border-bottom: 1px solid #f1f5f9;
                    padding: 0.4rem 0.5rem;
                    min-height: 90px;
                    cursor: pointer;
                    transition: background-color 0.15s;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                }

                .full-cal-day:hover {
                    background-color: #f8fafc;
                }

                .full-cal-day.other-month {
                    opacity: 0.35;
                    background: #fafafa;
                }

                .full-cal-day.is-today {
                    background: #eff6ff;
                    border: 2px solid var(--color-primary);
                    border-radius: 6px;
                }

                .full-cal-day.is-active {
                    background: #f0f9ff;
                    box-shadow: inset 0 0 0 2px var(--color-primary);
                    border-radius: 6px;
                }

                .full-cal-day-num {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin-bottom: 0.3rem;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }

                .full-cal-day-num.sunday {
                    color: #ef4444;
                }

                .full-cal-day-num.saturday {
                    color: #3b82f6;
                }

                .full-cal-holiday-name {
                    font-size: 0.7rem;
                    font-weight: 500;
                    color: #ef4444;
                    background: #fef2f2;
                    padding: 0.1rem 0.35rem;
                    border-radius: 3px;
                }

                /* Todo Items inside cells */
                .full-cal-todos {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    overflow: hidden;
                }

                .full-cal-todo-item {
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    font-size: 0.75rem;
                    line-height: 1.3;
                    padding: 0.1rem 0;
                    white-space: nowrap;
                    overflow: hidden;
                }

                .full-cal-todo-item.completed {
                    opacity: 0.5;
                }

                .full-cal-todo-item.completed .full-cal-todo-text {
                    text-decoration: line-through;
                }

                .full-cal-todo-dot {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }

                .full-cal-todo-text {
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .full-cal-overflow {
                    font-size: 0.7rem;
                    color: var(--color-primary);
                    font-weight: 600;
                    padding: 0.1rem 0;
                    cursor: pointer;
                }

                .full-cal-overflow:hover {
                    text-decoration: underline;
                }

                /* Inline Input */
                .full-cal-input-wrap {
                    margin-top: auto;
                    padding-top: 0.25rem;
                }

                .full-cal-todo-input {
                    width: 100%;
                    border: 1px solid var(--color-primary);
                    border-radius: 4px;
                    padding: 0.25rem 0.4rem;
                    font-size: 0.78rem;
                    outline: none;
                    background: white;
                    font-family: inherit;
                }

                .full-cal-todo-input:focus {
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }
            `}</style>
        </div>
    );
};

export default MiniCalendar;
