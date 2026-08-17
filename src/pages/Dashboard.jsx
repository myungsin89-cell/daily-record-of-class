import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import MiniCalendar from '../components/MiniCalendar';
import { useSaveStatus } from '../context/SaveStatusContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useStudentContext } from '../context/StudentContext';

// TodoItem Component with Style Editor
const TodoItem = ({ todo, index, dateStr, toggleTodo, deleteTodo, updateTodoStyle, updateTodoText, onDragStart, onDragOver, onDrop }) => {
    const [showEditor, setShowEditor] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(todo.text);
    const editorRef = useRef(null);
    const inputRef = useRef(null);

    // Close editor when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (editorRef.current && !editorRef.current.contains(event.target)) {
                setShowEditor(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleDoubleClick = () => {
        setIsEditing(true);
        setEditText(todo.text);
    };

    const handleSaveEdit = () => {
        if (editText.trim() && editText !== todo.text) {
            updateTodoText(dateStr, todo.id, editText.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditText(todo.text);
        }
    };

    const handleStyleChange = (property, value) => {
        const currentStyle = todo.style || {};
        const newStyle = { ...currentStyle, [property]: value };
        updateTodoStyle(dateStr, todo.id, newStyle);
    };

    const toggleStyle = (property, valueOn, valueOff) => {
        const currentStyle = todo.style || {};
        const newValue = currentStyle[property] === valueOn ? valueOff : valueOn;
        handleStyleChange(property, newValue);
    };

    const colors = ['#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    const sizes = [
        { label: 'S', value: '0.85rem' },
        { label: 'M', value: '1rem' },
        { label: 'L', value: '1.25rem' }
    ];

    return (
        <div
            className="todo-item"
            draggable
            onDragStart={(e) => onDragStart(e, dateStr, index)}
            onDragOver={(e) => onDragOver(e)}
            onDrop={(e) => onDrop(e, dateStr, index)}
        >
            {/* Drag Handle */}
            <span className="drag-handle" title="드래그하여 이동">⋮⋮</span>

            <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(dateStr, todo.id)}
                className="todo-checkbox"
            />
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleKeyDown}
                    className="todo-edit-input"
                    style={{
                        color: todo.style?.color || 'inherit',
                        fontWeight: todo.style?.fontWeight || 'normal',
                        fontStyle: todo.style?.fontStyle || 'normal',
                        fontSize: todo.style?.fontSize || '1rem',
                    }}
                />
            ) : (
                <span
                    className={todo.completed ? 'completed' : ''}
                    onDoubleClick={handleDoubleClick}
                    style={{
                        color: todo.style?.color || 'inherit',
                        fontWeight: todo.style?.fontWeight || 'normal',
                        fontStyle: todo.style?.fontStyle || 'normal',
                        fontSize: todo.style?.fontSize || '1rem',
                        cursor: 'text',
                    }}
                    title="더블클릭하여 수정"
                >
                    {todo.text}
                </span>
            )}

            {/* Style Trigger Button */}
            <button
                className="icon-btn style-btn"
                onClick={() => setShowEditor(!showEditor)}
                title="스타일 꾸미기"
            >
                🎨
            </button>

            {/* Delete Button */}
            <button
                className="icon-btn delete-btn"
                onClick={() => deleteTodo(dateStr, todo.id)}
                title="삭제"
            >
                ×
            </button>

            {/* Style Editor Popover */}
            {showEditor && (
                <div className="style-editor" ref={editorRef}>
                    <div className="style-row">
                        {colors.map(color => (
                            <button
                                key={color}
                                className={`color-swatch ${todo.style?.color === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleStyleChange('color', color)}
                            />
                        ))}
                    </div>
                    <div className="style-row">
                        <button
                            className={`style-toggle ${todo.style?.fontWeight === 'bold' ? 'active' : ''}`}
                            onClick={() => toggleStyle('fontWeight', 'bold', 'normal')}
                            style={{ fontWeight: 'bold' }}
                        >
                            B
                        </button>
                        <button
                            className={`style-toggle ${todo.style?.fontStyle === 'italic' ? 'active' : ''}`}
                            onClick={() => toggleStyle('fontStyle', 'italic', 'normal')}
                            style={{ fontStyle: 'italic' }}
                        >
                            I
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { holidays, students = [], attendance = {} } = useStudentContext();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;
    const [currentDate, setCurrentDate] = useState(new Date());
    const [todos, setTodos] = useState({});
    const [timetable, setTimetable] = useState({});
    const [timetableDate, setTimetableDate] = useState(new Date());
    const [weeklyNotes, setWeeklyNotes] = useState({});
    const { updateSaveStatus } = useSaveStatus();
    const [isLoaded, setIsLoaded] = useState(false);
    const [showMiniCalendar, setShowMiniCalendar] = useState(false);
    const [perfCards, setPerfCards] = useState([]);

    // Notes collection view states
    const [showNotesCollection, setShowNotesCollection] = useState(false);
    const [notesSearchQuery, setNotesSearchQuery] = useState('');
    const [showWeeklyNotes, setShowWeeklyNotes] = useState(false);

    // Helper to format date as YYYY-MM-DD in local timezone
    const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Load performance evaluation cards for week alarm
    useEffect(() => {
        try {
            const rawKey = currentClass?.id || 'default';
            const possibleKeys = [
                user ? `grade_v4_${user.username}_${rawKey}` : null,
                `grade_v4_${rawKey}`,
                'grade_v4_default'
            ].filter(Boolean);

            for (const key of possibleKeys) {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    const cards = (parsed.evalCards || []).filter(c => c.isPerformance || c.evalType === 'performance');
                    if (cards.length > 0) {
                        setPerfCards(cards);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load performance cards in Dashboard:', e);
        }
    }, [currentClass, user, isLoaded]);

    // Load data from localStorage on mount or when class changes
    useEffect(() => {
        const todosKey = `teacher_diary_todos_${classId}`;
        const timetableKey = `teacher_diary_timetable_${classId}`;
        const notesKey = `teacher_diary_notes_${classId}`;

        const savedTodos = localStorage.getItem(todosKey);
        const savedTimetable = localStorage.getItem(timetableKey);
        const savedNotes = localStorage.getItem(notesKey);

        if (savedTodos) setTodos(JSON.parse(savedTodos));
        else setTodos({});

        if (savedTimetable) setTimetable(JSON.parse(savedTimetable));
        else setTimetable({});

        if (savedNotes) setWeeklyNotes(JSON.parse(savedNotes));
        else setWeeklyNotes({});

        setIsLoaded(true);
    }, [classId]);

    // Save data to localStorage whenever it changes
    useEffect(() => {
        if (!isLoaded) return;
        const todosKey = `teacher_diary_todos_${classId}`;
        localStorage.setItem(todosKey, JSON.stringify(todos));
        updateSaveStatus();
    }, [todos, updateSaveStatus, isLoaded, classId]);

    useEffect(() => {
        if (!isLoaded) return;
        const notesKey = `teacher_diary_notes_${classId}`;
        localStorage.setItem(notesKey, JSON.stringify(weeklyNotes));
        
        const timetableKey = `teacher_diary_timetable_${classId}`;
        localStorage.setItem(timetableKey, JSON.stringify(timetable));
        
        updateSaveStatus();
    }, [weeklyNotes, timetable, updateSaveStatus, isLoaded, classId]);

    // Helper to get the start of the week (Monday)
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        return new Date(d.setDate(diff));
    };

    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday
    const weekKey = formatDateLocal(startOfWeek);

    const getWeekRangeTitle = () => {
        const year = startOfWeek.getFullYear();
        const startM = startOfWeek.getMonth() + 1;
        const startD = startOfWeek.getDate();
        const endM = endOfWeek.getMonth() + 1;
        const endD = endOfWeek.getDate();

        if (startM === endM) {
            return `${year}년 ${startM}월 ${startD}일 ~ ${endD}일`;
        }
        return `${year}년 ${startM}월 ${startD}일 ~ ${endM}월 ${endD}일`;
    };

    // Generate 7 days of the week
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return d;
    });

    // 이번 주차 수행평가 일정 스마트 필터링
    const currentWeekPerfCards = useMemo(() => {
        if (!perfCards || perfCards.length === 0) return [];
        const startStr = formatDateLocal(weekDays[0]);
        const endStr = formatDateLocal(weekDays[6]);

        const startM = startOfWeek.getMonth() + 1;
        // 주차 번호 계산 (해당 월의 첫날 기준 주차)
        const firstDayOfMonth = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), 1);
        const firstDayOfWeek = firstDayOfMonth.getDay();
        const adjustedOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
        const weekNum = Math.ceil((startOfWeek.getDate() + adjustedOffset) / 7);

        return perfCards.filter(card => {
            // 1. 날짜 범위 매칭 (scheduleDate 또는 columns[0].date)
            const cDate = card.scheduleDate || card.columns?.[0]?.date;
            if (cDate && cDate >= startStr && cDate <= endStr) return true;

            // 2. 텍스트 주차 매칭 (예: "8월 3주", "8월 3주차")
            if (card.scheduleText) {
                const match = card.scheduleText.match(/(\d{1,2})월\s*(\d{1,2})주/);
                if (match) {
                    const m = parseInt(match[1], 10);
                    const w = parseInt(match[2], 10);
                    if (m === startM && w === weekNum) return true;
                }
                // 3. 텍스트 날짜 매칭 (예: "8월 19일")
                const mdMatch = card.scheduleText.match(/(\d{1,2})[월/.]\s*(\d{1,2})/);
                if (mdMatch) {
                    const m = String(parseInt(mdMatch[1], 10)).padStart(2, '0');
                    const d = String(parseInt(mdMatch[2], 10)).padStart(2, '0');
                    const formatted = `${startOfWeek.getFullYear()}-${m}-${d}`;
                    if (formatted >= startStr && formatted <= endStr) return true;
                }
            }
            return false;
        });
    }, [perfCards, weekDays, startOfWeek]);

    const handlePrevWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() - 7);
        setCurrentDate(newDate);
        setTimetableDate(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + 7);
        setCurrentDate(newDate);
        setTimetableDate(newDate);
    };

    const handleToday = () => {
        const today = new Date();
        setCurrentDate(today);
        setTimetableDate(today);
    };

    const handleDateClick = (date) => {
        setCurrentDate(date);
        setTimetableDate(date);
        setShowMiniCalendar(false); // 날짜 선택 후 달력 닫기
    };

    // 공휴일 확인 함수
    const getHolidayInfo = (date) => {
        const dateStr = formatDateLocal(date);
        const holiday = holidays.find(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate === dateStr;
        });
        if (!holiday) return null;
        return typeof holiday === 'string' ? { date: holiday, name: '공휴일' } : holiday;
    };

    // Todo Handlers
    const addTodo = (dateStr, text) => {
        if (!text.trim()) return;
        const newTodo = {
            id: crypto.randomUUID(),
            text,
            completed: false,
            style: { color: '#000000', fontSize: '1rem', fontWeight: 'normal', fontStyle: 'normal' }
        };
        setTodos(prev => ({
            ...prev,
            [dateStr]: [...(prev[dateStr] || []), newTodo]
        }));
    };

    const toggleTodo = (dateStr, todoId) => {
        setTodos(prev => ({
            ...prev,
            [dateStr]: prev[dateStr].map(todo =>
                todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
            )
        }));
    };

    const deleteTodo = (dateStr, todoId) => {
        setTodos(prev => ({
            ...prev,
            [dateStr]: prev[dateStr].filter(todo => todo.id !== todoId)
        }));
    };

    const updateTodoStyle = (dateStr, todoId, newStyle) => {
        setTodos(prev => ({
            ...prev,
            [dateStr]: prev[dateStr].map(todo =>
                todo.id === todoId ? { ...todo, style: newStyle } : todo
            )
        }));
    };

    const updateTodoText = (dateStr, todoId, newText) => {
        setTodos(prev => ({
            ...prev,
            [dateStr]: prev[dateStr].map(todo =>
                todo.id === todoId ? { ...todo, text: newText } : todo
            )
        }));
    };

    // Drag and Drop Handlers
    const handleDragStart = (e, dateStr, index) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ dateStr, index }));
        e.dataTransfer.effectAllowed = 'move';
        // Add a class to the dragged element for styling
        e.target.classList.add('dragging');
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetDateStr, targetIndex) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;

        const { dateStr: sourceDateStr, index: sourceIndex } = JSON.parse(data);

        // Remove dragging class
        const draggingEl = document.querySelector('.dragging');
        if (draggingEl) draggingEl.classList.remove('dragging');

        // If moving within the same list
        if (sourceDateStr === targetDateStr) {
            if (sourceIndex === targetIndex) return;

            setTodos(prev => {
                const newList = [...(prev[sourceDateStr] || [])];
                const [movedItem] = newList.splice(sourceIndex, 1);
                newList.splice(targetIndex, 0, movedItem);

                return {
                    ...prev,
                    [sourceDateStr]: newList
                };
            });
        } else {
            // Moving between days (Optional, but implemented for completeness)
            setTodos(prev => {
                const sourceList = [...(prev[sourceDateStr] || [])];
                const targetList = [...(prev[targetDateStr] || [])];

                const [movedItem] = sourceList.splice(sourceIndex, 1);
                targetList.splice(targetIndex, 0, movedItem);

                return {
                    ...prev,
                    [sourceDateStr]: sourceList,
                    [targetDateStr]: targetList
                };
            });
        }
    };

    // Notes & Timetable Handler
    const handleNoteChange = (text) => {
        setWeeklyNotes(prev => ({
            ...prev,
            [weekKey]: text
        }));
    };

    const handleTimetableChange = (dateStr, period, field, value) => {
        setTimetable(prev => {
            const current = prev[dateStr]?.[period];
            const currentObj = typeof current === 'object' && current !== null
                ? current
                : { subject: '', content: typeof current === 'string' ? current : '' };
            return {
                ...prev,
                [dateStr]: {
                    ...(prev[dateStr] || {}),
                    [period]: {
                        ...currentObj,
                        [field]: value
                    }
                }
            };
        });
    };

    const getPeriodSubject = (dateStr, period) => {
        const data = timetable[dateStr]?.[period];
        if (typeof data === 'object' && data !== null) return data.subject || '';
        return '';
    };

    const getPeriodContent = (dateStr, period) => {
        const data = timetable[dateStr]?.[period];
        if (typeof data === 'object' && data !== null) return data.content || '';
        if (typeof data === 'string') return data;
        return '';
    };

    // Keyboard navigation helper for timetable inputs
    const handleTimetableKeyDown = (e, period, field, isHorizontal = false) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const prefix = isHorizontal ? 'horiz-tt' : 'vert-tt';
            if (field === 'subject') {
                const nextEl = document.getElementById(`${prefix}-content-${period}`);
                if (nextEl) nextEl.focus();
            } else if (field === 'content') {
                if (period < 6) {
                    const nextEl = document.getElementById(`${prefix}-subject-${period + 1}`);
                    if (nextEl) nextEl.focus();
                }
            }
        }
    };

    // Timetable Date Navigation Handlers
    const handlePrevTimetableDay = () => {
        const d = new Date(timetableDate);
        d.setDate(timetableDate.getDate() - 1);
        setTimetableDate(d);
    };

    const handleNextTimetableDay = () => {
        const d = new Date(timetableDate);
        d.setDate(timetableDate.getDate() + 1);
        setTimetableDate(d);
    };

    const handleTodayTimetableDay = () => {
        const today = new Date();
        setTimetableDate(today);
        setCurrentDate(today);
    };

    // Attendance Summary Helper for Day Column
    const getAttendanceSummaryForDay = (dateStr) => {
        const dayAttendance = attendance[dateStr] || {};
        const result = {
            absent: [],
            fieldtrip: []
        };

        Object.keys(dayAttendance).forEach(studentIdStr => {
            const data = dayAttendance[studentIdStr];
            const status = typeof data === 'string' ? data : data?.status;
            if (!status || status === 'present') return;

            const student = students.find(s => String(s.id) === String(studentIdStr) || String(s.attendanceNumber) === String(studentIdStr));
            const studentName = student ? student.name : `학생${studentIdStr}`;

            if (status === 'sick' || status === 'absent' || status === 'other') {
                result.absent.push(studentName);
            } else if (status === 'fieldtrip') {
                result.fieldtrip.push(studentName);
            }
        });

        return result;
    };



    // Auto-refresh time display every minute
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => {
            setTick(prev => prev + 1);
        }, 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    // ESC key to close calendar modal
    useEffect(() => {
        const handleEscKey = (e) => {
            if (e.key === 'Escape' && showMiniCalendar) {
                setShowMiniCalendar(false);
            }
        };
        window.addEventListener('keydown', handleEscKey);
        return () => window.removeEventListener('keydown', handleEscKey);
    }, [showMiniCalendar]);

    return (
        <div className="dashboard-container">
            {/* Header & Navigation */}
            <div className="dashboard-header-bar flex justify-between items-center">
                <div className="flex items-center gap-md" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <span className="green-date-range-badge">
                        {startOfWeek.getFullYear()}년 {startOfWeek.getMonth() + 1}월
                    </span>
                    {currentWeekPerfCards.length > 0 && (
                        <div
                            className="dashboard-perf-week-pill"
                            onClick={() => navigate('/grades')}
                            title="클릭 시 성적 입력 / 수행평가 화면으로 바로 이동합니다."
                        >
                            <span className="perf-pill-bell">🔔</span>
                            <span className="perf-pill-label">이번 주 수행평가 ({currentWeekPerfCards.length}건):</span>
                            <div className="perf-pill-tags">
                                {currentWeekPerfCards.map((c, i) => (
                                    <span key={c.id || i} className="perf-pill-tag">
                                        {c.domain ? `[${c.domain}] ` : ''}{c.unit || c.name}
                                    </span>
                                ))}
                            </div>
                            <span className="perf-pill-arrow">➔</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <button
                        className={`green-calendar-btn ${showMiniCalendar ? 'active' : ''}`}
                        onClick={() => setShowMiniCalendar(!showMiniCalendar)}
                    >
                        📆 {showMiniCalendar ? '달력 닫기' : '달력 보기'}
                    </button>
                    <div className="green-btn-group">
                        <button className="green-pill-btn" onClick={handlePrevWeek}>&lt; 이전 주</button>
                        <button className="green-pill-btn active" onClick={handleToday}>오늘</button>
                        <button className="green-pill-btn" onClick={handleNextWeek}>다음 주 &gt;</button>
                    </div>
                </div>
            </div>

            {/* Mini Calendar Modal */}
            {showMiniCalendar && (
                <div className="calendar-modal-overlay" onClick={() => setShowMiniCalendar(false)}>
                    <div className="calendar-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="calendar-modal-close"
                            onClick={() => setShowMiniCalendar(false)}
                            title="닫기"
                        >
                            ×
                        </button>
                        <MiniCalendar todos={todos} onDateClick={handleDateClick} holidays={holidays} addTodo={addTodo} />
                    </div>
                </div>
            )}
            <div className="weekly-grid">
                {/* Weekdays (Mon-Fri) */}
                {weekDays.slice(0, 5).map((day) => {
                    const dateStr = formatDateLocal(day);
                    const isToday = formatDateLocal(new Date()) === dateStr;
                    const dayTodos = todos[dateStr] || [];
                    const dayName = day.toLocaleDateString('ko-KR', { weekday: 'short' });
                    const dateNum = day.getDate();
                    const holidayInfo = getHolidayInfo(day);

                    return (
                        <div key={dateStr} className={`day-column ${isToday ? 'today' : ''}`}>
                            <div className="day-header">
                                <span className="day-name">{dayName}</span>
                                <span className="day-num">{dateNum}</span>
                            </div>
                            {holidayInfo && (
                                <div className="holiday-badge">
                                    🎉 {holidayInfo.name}
                                </div>
                            )}

                            <div className="todo-list">
                                {Array.isArray(dayTodos) && dayTodos.map((todo, index) => (
                                    <TodoItem
                                        key={todo.id}
                                        index={index}
                                        todo={todo}
                                        dateStr={dateStr}
                                        toggleTodo={toggleTodo}
                                        deleteTodo={deleteTodo}
                                        updateTodoStyle={updateTodoStyle}
                                        updateTodoText={updateTodoText}
                                        onDragStart={handleDragStart}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                    />
                                ))}
                            </div>

                            {/* Fixed Attendance Summary at Bottom of Column */}
                            {(() => {
                                const att = getAttendanceSummaryForDay(dateStr);
                                const hasAbsent = att.absent.length > 0;
                                const hasFieldtrip = att.fieldtrip.length > 0;

                                if (!hasAbsent && !hasFieldtrip) return null;

                                return (
                                    <div className="day-attendance-summary" style={{
                                        padding: '0.4rem 0.6rem',
                                        background: '#f8fafc',
                                        borderTop: '1px solid #e2e8f0',
                                        fontSize: '0.78rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.2rem',
                                        flexShrink: 0
                                    }}>
                                        {hasAbsent && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#fee2e2', color: '#dc2626', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>결석</span>
                                                <span style={{ color: '#334155', fontWeight: 600 }}>{att.absent.join(', ')}</span>
                                            </div>
                                        )}
                                        {hasFieldtrip && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#f3e8ff', color: '#7c3aed', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>체험</span>
                                                <span style={{ color: '#334155', fontWeight: 600 }}>{att.fieldtrip.join(', ')}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="add-todo-form">
                                <input
                                    type="text"
                                    placeholder="+ 할 일 추가"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            addTodo(dateStr, e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}

                {/* Today's Timetable (Replaces Weekend in Maximize Mode) */}
                <div className="day-column weekend-column desktop-sidebar-timetable">
                    <div className="day-header weekend-header" style={{ justifyContent: 'center' }}>
                        <span className="day-name" style={{ color: '#15803d' }}>🌿 오늘의 시간표</span>
                    </div>

                    <div className="weekend-content" style={{ padding: '0.6rem 0.4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxSizing: 'border-box' }}>
                        {/* Date Navigation Bar */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            marginBottom: '0.2rem', 
                            background: '#ffffff',
                            padding: '0.3rem 0.5rem',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)'
                        }}>
                            <button
                                onClick={handlePrevTimetableDay}
                                style={{
                                    border: '1px solid var(--color-border)',
                                    background: '#f8fafc',
                                    borderRadius: '4px',
                                    padding: '0.15rem 0.45rem',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    color: '#475569',
                                    fontSize: '0.75rem'
                                }}
                                title="어제 시간표"
                            >
                                ◀
                            </button>
                            <span 
                                onClick={handleTodayTimetableDay}
                                style={{ 
                                    cursor: 'pointer', 
                                    userSelect: 'none', 
                                    color: '#1e293b', 
                                    fontSize: '0.85rem', 
                                    fontWeight: 700 
                                }}
                                title="클릭하여 오늘 날짜로 이동"
                            >
                                {timetableDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                            </span>
                            <button
                                onClick={handleNextTimetableDay}
                                style={{
                                    border: '1px solid var(--color-border)',
                                    background: '#f8fafc',
                                    borderRadius: '4px',
                                    padding: '0.15rem 0.45rem',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    color: '#475569',
                                    fontSize: '0.75rem'
                                }}
                                title="내일 시간표"
                            >
                                ▶
                            </button>
                        </div>

                        {[1, 2, 3, 4, 5, 6].map(period => (
                            <div key={period} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%', background: '#ffffff', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--color-border)', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ 
                                        padding: '0.15rem 0.4rem', 
                                        fontWeight: '800', 
                                        color: '#15803d', 
                                        fontSize: '0.8rem',
                                        background: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        borderRadius: '4px',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {period}교시
                                    </span>
                                    <input
                                        id={`vert-tt-subject-${period}`}
                                        type="text"
                                        placeholder="과목명"
                                        value={getPeriodSubject(formatDateLocal(timetableDate), period)}
                                        onChange={(e) => handleTimetableChange(formatDateLocal(timetableDate), period, 'subject', e.target.value)}
                                        onKeyDown={(e) => handleTimetableKeyDown(e, period, 'subject', false)}
                                        style={{
                                            flex: 1,
                                            width: 0,
                                            minWidth: 0,
                                            padding: '0.2rem 0.4rem',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '4px',
                                            fontSize: '0.88rem',
                                            fontWeight: '700',
                                            color: '#0f172a',
                                            textAlign: 'center',
                                            outline: 'none',
                                            background: '#f8fafc',
                                            boxSizing: 'border-box'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#16a34a'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                    />
                                </div>
                                <input
                                    id={`vert-tt-content-${period}`}
                                    type="text"
                                    placeholder="수업내용메모"
                                    value={getPeriodContent(formatDateLocal(timetableDate), period)}
                                    onChange={(e) => handleTimetableChange(formatDateLocal(timetableDate), period, 'content', e.target.value)}
                                    onKeyDown={(e) => handleTimetableKeyDown(e, period, 'content', false)}
                                    style={{
                                        width: '100%',
                                        padding: '0.28rem 0.45rem',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '4px',
                                        fontSize: '0.88rem',
                                        lineHeight: 1.45,
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        background: '#ffffff',
                                        boxSizing: 'border-box',
                                        fontFamily: 'inherit',
                                        color: '#334155',
                                        textAlign: 'center'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#16a34a'}
                                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Horizontal Today's Timetable for Unmaximized Default Mode */}
            <div className="horizontal-bottom-timetable">
                <div className="horizontal-timetable-card">
                    <div className="horizontal-timetable-header">
                        <span className="timetable-title-badge">🌿 오늘의 시간표</span>
                        <div className="timetable-header-nav">
                            <button onClick={handlePrevTimetableDay} title="어제 시간표">◀</button>
                            <span onClick={handleTodayTimetableDay} title="클릭하여 오늘 날짜로 이동" style={{ cursor: 'pointer' }}>
                                {timetableDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                            </span>
                            <button onClick={handleNextTimetableDay} title="내일 시간표">▶</button>
                        </div>
                    </div>
                    <div className="horizontal-timetable-grid">
                        {[1, 2, 3, 4, 5, 6].map(period => (
                            <div key={period} className="horizontal-period-box">
                                <div className="horizontal-period-top">
                                    <span className="period-badge">{period}교시</span>
                                    <input
                                        id={`horiz-tt-subject-${period}`}
                                        type="text"
                                        placeholder="과목명"
                                        value={getPeriodSubject(formatDateLocal(timetableDate), period)}
                                        onChange={(e) => handleTimetableChange(formatDateLocal(timetableDate), period, 'subject', e.target.value)}
                                        onKeyDown={(e) => handleTimetableKeyDown(e, period, 'subject', true)}
                                        className="period-subject-input"
                                    />
                                </div>
                                <input
                                    id={`horiz-tt-content-${period}`}
                                    type="text"
                                    placeholder="수업내용메모"
                                    value={getPeriodContent(formatDateLocal(timetableDate), period)}
                                    onChange={(e) => handleTimetableChange(formatDateLocal(timetableDate), period, 'content', e.target.value)}
                                    onKeyDown={(e) => handleTimetableKeyDown(e, period, 'content', true)}
                                    className="period-content-input"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Weekly Notes Section */}
            <div className="weekly-notes-section mt-md">
                {/* Unmaximized mode toggleable bar */}
                <div className="weekly-notes-unmaximized-toggle">
                    <div 
                        className="weekly-notes-toggle-bar"
                        onClick={() => setShowWeeklyNotes(!showWeeklyNotes)}
                    >
                        <span className="toggle-label">🌱 이번 주 메모 / 목표</span>
                        <span className="toggle-btn-text">
                            {showWeeklyNotes ? '접기 ▲' : '펼쳐보기 ▼'}
                        </span>
                    </div>

                    {showWeeklyNotes && (
                        <div className="weekly-notes-expanded-content mt-xs">
                            <Card style={{ padding: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
                                    <Button variant="secondary" onClick={() => { setShowNotesCollection(true); setNotesSearchQuery(''); }}>
                                        📋 모아보기
                                    </Button>
                                </div>
                                <textarea
                                    className="notes-textarea"
                                    placeholder="이번 주에 기억해야 할 내용이나 목표를 자유롭게 작성하세요..."
                                    value={weeklyNotes[weekKey] || ''}
                                    onChange={(e) => handleNoteChange(e.target.value)}
                                    style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                                />
                            </Card>
                        </div>
                    )}
                </div>

                {/* Maximized / Full Screen mode always visible card */}
                <div className="weekly-notes-maximized-card">
                    <Card style={{ padding: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#15803d', fontWeight: 800 }}>🌱 이번 주 메모 / 목표</h3>
                            <Button variant="secondary" onClick={() => { setShowNotesCollection(true); setNotesSearchQuery(''); }}>
                                📋 모아보기
                            </Button>
                        </div>
                        <textarea
                            className="notes-textarea"
                            placeholder="이번 주에 기억해야 할 내용이나 목표를 자유롭게 작성하세요..."
                            value={weeklyNotes[weekKey] || ''}
                            onChange={(e) => handleNoteChange(e.target.value)}
                            style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                        />
                    </Card>
                </div>
            </div>

            {/* Notes Collection Modal */}
            {showNotesCollection && (
                <div className="calendar-modal-overlay" onClick={() => setShowNotesCollection(false)}>
                    <div className="notes-collection-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="calendar-modal-close"
                            onClick={() => setShowNotesCollection(false)}
                            title="닫기"
                        >
                            ×
                        </button>
                        <h2 className="notes-collection-title">📋 주간 메모 모아보기</h2>
                        <div className="notes-search-wrap">
                            <input
                                type="text"
                                className="notes-search-input"
                                placeholder="🔍 메모 검색..."
                                value={notesSearchQuery}
                                onChange={(e) => setNotesSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="notes-collection-list">
                            {(() => {
                                const allNotes = Object.entries(weeklyNotes)
                                    .filter(([, text]) => text && text.trim())
                                    .sort(([a], [b]) => b.localeCompare(a))
                                    .filter(([, text]) => {
                                        if (!notesSearchQuery.trim()) return true;
                                        return text.toLowerCase().includes(notesSearchQuery.toLowerCase());
                                    });

                                if (allNotes.length === 0) {
                                    return (
                                        <div className="notes-empty">
                                            {notesSearchQuery.trim()
                                                ? `"${notesSearchQuery}"에 해당하는 메모가 없습니다.`
                                                : '아직 작성된 메모가 없습니다.'}
                                        </div>
                                    );
                                }

                                return allNotes.map(([dateKey, text]) => {
                                    const weekStart = new Date(dateKey + 'T00:00:00');
                                    const weekEnd = new Date(weekStart);
                                    weekEnd.setDate(weekEnd.getDate() + 4);
                                    const isCurrentWeek = dateKey === weekKey;

                                    const formatWeekDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

                                    return (
                                        <div key={dateKey} className={`notes-collection-item ${isCurrentWeek ? 'current-week' : ''}`}>
                                            <div className="notes-collection-header">
                                                <span className="notes-week-label">
                                                    📅 {formatWeekDate(weekStart)} ~ {formatWeekDate(weekEnd)}
                                                </span>
                                                {isCurrentWeek && <span className="notes-current-badge">이번 주</span>}
                                            </div>
                                            <div className="notes-collection-text">{text}</div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .dashboard-header-bar {
                    margin-bottom: 1.4rem !important;
                }

                .current-week-range-text {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -0.3px;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }

                .green-calendar-btn {
                    padding: 0.48rem 1rem;
                    font-size: 0.88rem;
                    font-weight: 700;
                    color: #15803d;
                    background: #ffffff;
                    border: 1.5px solid #86efac;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
                }

                .green-calendar-btn:hover,
                .green-calendar-btn.active {
                    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                    color: #ffffff;
                    border-color: #15803d;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.25);
                }

                .green-btn-group {
                    display: flex;
                    gap: 0.3rem;
                    background: rgba(240, 253, 244, 0.6);
                    padding: 0.2rem;
                    border-radius: 12px;
                    border: 1px solid #bbf7d0;
                }

                .green-pill-btn {
                    padding: 0.42rem 0.85rem;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #15803d;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.18s ease;
                }

                .green-pill-btn:hover {
                    background: #ffffff;
                    color: #16a34a;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
                }

                .green-pill-btn.active {
                    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                    color: #ffffff;
                    box-shadow: 0 3px 10px rgba(22, 163, 74, 0.25);
                }

                .horizontal-bottom-timetable {
                    margin-top: 0.75rem;
                    display: none;
                }

                .horizontal-timetable-card {
                    background: #ffffff;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    padding: 0.75rem;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
                }

                .horizontal-timetable-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.6rem;
                    padding-bottom: 0.4rem;
                    border-bottom: 1px solid #f1f5f9;
                }

                .timetable-title-badge {
                    font-weight: 800;
                    font-size: 0.95rem;
                    color: #15803d;
                }

                .timetable-header-nav {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #1e293b;
                }

                .timetable-header-nav button {
                    border: 1px solid var(--color-border);
                    background: #f8fafc;
                    border-radius: 4px;
                    padding: 0.15rem 0.45rem;
                    cursor: pointer;
                    font-weight: bold;
                    color: #475569;
                }

                .horizontal-timetable-grid {
                    display: grid;
                    grid-template-columns: repeat(6, 1fr);
                    gap: 0.5rem;
                }

                .horizontal-period-box {
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                    background: #f8fafc;
                    padding: 0.45rem;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }

                .horizontal-period-top {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                }

                .period-badge {
                    padding: 0.15rem 0.35rem;
                    font-weight: 800;
                    color: #15803d;
                    font-size: 0.78rem;
                    background: #f0fdf4;
                    border: 1px solid #bbf7d0;
                    border-radius: 4px;
                    white-space: nowrap;
                }

                .period-subject-input {
                    flex: 1;
                    width: 0;
                    min-width: 0;
                    padding: 0.2rem 0.35rem;
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #0f172a;
                    text-align: center;
                    outline: none;
                    background: #ffffff;
                }

                .period-content-input {
                    width: 100%;
                    padding: 0.28rem 0.4rem;
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    font-size: 0.85rem;
                    line-height: 1.4;
                    outline: none;
                    background: #ffffff;
                    color: #334155;
                    box-sizing: border-box;
                    text-align: center;
                }

                .weekly-notes-toggle-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.45rem 0.85rem;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.15s ease;
                }

                .weekly-notes-toggle-bar:hover {
                    background: #f1f5f9;
                    border-color: #cbd5e1;
                }

                .toggle-label {
                    font-size: 0.88rem;
                    font-weight: 700;
                    color: #475569;
                }

                .toggle-btn-text {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #15803d;
                }

                /* 기본 창 모드 vs 전체 화면 반응형 전환 */
                @media (max-width: 1450px) {
                    .weekly-grid {
                        grid-template-columns: repeat(5, 1fr) !important;
                        min-height: 480px !important;
                    }
                    .desktop-sidebar-timetable {
                        display: none !important;
                    }
                    .horizontal-bottom-timetable {
                        display: block !important;
                    }
                    .weekly-notes-unmaximized-toggle {
                        display: block !important;
                    }
                    .weekly-notes-maximized-card {
                        display: none !important;
                    }
                }

                @media (min-width: 1451px) {
                    .weekly-grid {
                        grid-template-columns: repeat(6, 1fr) !important;
                        min-height: 520px !important;
                    }
                    .desktop-sidebar-timetable {
                        display: flex !important;
                    }
                    .horizontal-bottom-timetable {
                        display: none !important;
                    }
                    .weekly-notes-unmaximized-toggle {
                        display: none !important;
                    }
                    .weekly-notes-maximized-card {
                        display: block !important;
                    }
                }

                /* 사이드바가 접혔을 때: 기본 창에서도 6컬럼 (월~금 + 우측 오늘의 시간표) 시원하게 확장 */
                .sidebar-collapsed .weekly-grid {
                    grid-template-columns: repeat(6, 1fr) !important;
                    min-height: 520px !important;
                }
                .sidebar-collapsed .desktop-sidebar-timetable {
                    display: flex !important;
                }
                .sidebar-collapsed .horizontal-bottom-timetable {
                    display: none !important;
                }
                .sidebar-collapsed .weekly-notes-unmaximized-toggle {
                    display: none !important;
                }
                .sidebar-collapsed .weekly-notes-maximized-card {
                    display: block !important;
                }

                .weekly-grid-wrapper {
                    width: 100%;
                    overflow-x: auto;
                    padding-bottom: 0.25rem;
                }

                .weekly-grid {
                    display: grid;
                    gap: 0.6rem;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .day-column {
                    background: white;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    min-width: 0;
                    position: relative; /* For popover positioning context if needed */
                }

                .day-column.weekend-column {
                    grid-column: span 1;
                    display: flex;
                    flex-direction: column;
                }

                .day-column.today {
                    border: 2px solid var(--color-primary);
                    background-color: #f0f9ff;
                }

                .day-header {
                    padding: 0.5rem 0.65rem;
                    border-bottom: 1px solid var(--color-border);
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f8fafc;
                    font-size: 0.9rem;
                }

                .day-header.weekend-header {
                    background: #f0fdf4;
                    color: #166534;
                    border-bottom: 1px solid #bbf7d0;
                }

                .day-column.today .day-header {
                    background: #e0f2fe;
                    color: var(--color-primary);
                }

                .holiday-badge {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    color: #991b1b;
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 0.35rem 0.6rem;
                    border-radius: 6px;
                    margin: 0.5rem 0.75rem 0.25rem 0.75rem;
                    text-align: center;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
                    border: 1px solid #fecaca;
                }

                .weekend-holiday-badge {
                    margin: 0.25rem 0.5rem;
                    font-size: 0.7rem;
                    padding: 0.25rem 0.5rem;
                }

                .weekend-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 0.5rem;
                }

                .weekend-day {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .weekend-day-label {
                    font-weight: 600;
                    font-size: 0.85rem;
                    padding: 0.25rem 0.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .weekend-date-num {
                    font-size: 0.75rem;
                    opacity: 0.7;
                }

                .weekend-todo-list {
                    padding: 0;
                    flex: 1;
                }

                .green-date-range-badge {
                    font-size: 0.92rem;
                    font-weight: 800;
                    color: #15803d;
                    background: rgba(240, 253, 244, 0.95);
                    border: 1px solid #bbf7d0;
                    padding: 0.4rem 0.85rem;
                    border-radius: 10px;
                    letter-spacing: -0.2px;
                    box-shadow: 0 2px 6px rgba(22, 163, 74, 0.08);
                    display: inline-flex;
                    align-items: center;
                }

                /* 상단 주차 수행평가 알림 필 뱃지 (연한 붉은색 로즈 카드 테마) */
                .dashboard-perf-week-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
                    border: 1.5px solid #fca5a5;
                    padding: 0.35rem 0.85rem;
                    border-radius: 10px;
                    color: #be123c;
                    font-size: 0.84rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(225, 29, 72, 0.12);
                    animation: perfPulseRed 3s infinite ease-in-out;
                }

                .dashboard-perf-week-pill:hover {
                    background: linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%);
                    border-color: #f87171;
                    color: #9f1239;
                    transform: translateY(-1.5px);
                    box-shadow: 0 4px 12px rgba(225, 29, 72, 0.22);
                }

                .perf-pill-bell {
                    font-size: 0.95rem;
                    display: inline-block;
                    animation: perfBellSwing 2s infinite ease-in-out;
                }

                .perf-pill-label {
                    font-weight: 800;
                    color: #be123c;
                    white-space: nowrap;
                }

                .perf-pill-tags {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    flex-wrap: wrap;
                }

                .perf-pill-tag {
                    background: #ffffff;
                    color: #be123c;
                    border: 1px solid #fecdd3;
                    padding: 1px 7px;
                    border-radius: 6px;
                    font-size: 0.78rem;
                    font-weight: 700;
                    box-shadow: 0 1px 2px rgba(225, 29, 72, 0.06);
                }

                .perf-pill-arrow {
                    font-size: 0.8rem;
                    color: #e11d48;
                    margin-left: 2px;
                    font-weight: 900;
                }

                @keyframes perfPulseRed {
                    0%, 100% { box-shadow: 0 2px 8px rgba(225, 29, 72, 0.12); }
                    50% { box-shadow: 0 0 14px rgba(244, 63, 94, 0.35); border-color: #fb7185; }
                }

                @keyframes perfBellSwing {
                    0%, 100% { transform: rotate(0deg); }
                    20% { transform: rotate(12deg); }
                    40% { transform: rotate(-12deg); }
                    60% { transform: rotate(8deg); }
                    80% { transform: rotate(-8deg); }
                }

                .todo-list {
                    flex: 1;
                    padding: 0.4rem;
                    overflow-y: visible !important;
                    overflow-x: visible !important;
                    scrollbar-width: none !important;
                }

                .todo-list::-webkit-scrollbar {
                    display: none !important;
                    width: 0 !important;
                }

                .todo-item {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.2rem 0.2rem 0.2rem 10px;
                    font-size: 0.88rem;
                    position: relative;
                    cursor: grab;
                    transition: background-color 0.2s, transform 0.2s;
                    border-radius: 4px;
                    width: 100%;
                    min-width: 0;
                }

                .todo-item.dragging {
                    opacity: 0.4;
                    background-color: #e0e7ff;
                    cursor: grabbing;
                    transform: scale(1.02);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                }

                .todo-item:hover {
                    background-color: #f8fafc;
                }

                .todo-list.drag-over {
                    background-color: #dbeafe;
                    border: 2px dashed var(--color-primary);
                    border-radius: 8px;
                }

                .drag-handle {
                    position: absolute;
                    left: -1px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--color-text-muted);
                    cursor: grab;
                    font-size: 0.85rem;
                    line-height: 1;
                    opacity: 0.25;
                    transition: opacity 0.2s, color 0.2s, transform 0.2s;
                    user-select: none;
                    width: 12px;
                    text-align: center;
                }

                .todo-item:hover .drag-handle {
                    opacity: 0.6;
                }

                .todo-item:hover .drag-handle:hover {
                    opacity: 1;
                    color: var(--color-primary);
                    transform: translateY(-50%) scale(1.1);
                }

                .drag-handle:active {
                    cursor: grabbing;
                }

                .todo-item .todo-checkbox {
                    cursor: pointer;
                    width: 16px;
                    height: 16px;
                    min-width: 16px;
                    flex-shrink: 0;
                    align-self: center;
                    accent-color: var(--color-primary);
                }

                .todo-edit-input {
                    flex: 1;
                    border: 1px solid var(--color-primary);
                    background: white;
                    padding: 0.2rem 0.4rem;
                    border-radius: 4px;
                    outline: none;
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.5;
                    width: 0;
                    min-width: 0;
                    max-width: 100%;
                }

                .todo-item span {
                    flex: 1;
                    word-break: break-all;
                    line-height: 1.5;
                    text-align: left;
                }

                .todo-item span.completed {
                    text-decoration: line-through;
                    color: var(--color-text-muted);
                    opacity: 0.7;
                }

                .icon-btn {
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 1rem;
                    line-height: 1;
                    padding: 0.2rem;
                    opacity: 0;
                    transition: opacity 0.2s;
                    color: var(--color-text-muted);
                    position: absolute;
                    top: 2px;
                }

                .delete-btn {
                    right: 0;
                }

                .style-btn {
                    right: 24px;
                }

                .todo-item:hover .icon-btn {
                    opacity: 1;
                }

                .icon-btn:hover {
                    color: var(--color-primary);
                    background-color: #f1f5f9;
                    border-radius: 4px;
                }
                
                .delete-btn:hover {
                    color: var(--color-error);
                }

                /* Style Editor Popover */
                .style-editor {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: white;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    padding: 0.75rem;
                    z-index: 50;
                    min-width: 180px;
                }

                .style-row {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                    align-items: center;
                }

                .style-row:last-child {
                    margin-bottom: 0;
                }

                .color-swatch {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    padding: 0;
                }

                .color-swatch.active {
                    border: 2px solid var(--color-primary);
                    transform: scale(1.1);
                }

                .style-toggle {
                    border: 1px solid var(--color-border);
                    background: white;
                    border-radius: 4px;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 0.8rem;
                }

                .style-toggle.active {
                    background-color: var(--color-primary);
                    color: white;
                    border-color: var(--color-primary);
                }

                .size-selector {
                    display: flex;
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .size-btn {
                    border: none;
                    background: white;
                    padding: 0.2rem 0.4rem;
                    font-size: 0.75rem;
                    cursor: pointer;
                    border-right: 1px solid var(--color-border);
                }

                .size-btn:last-child {
                    border-right: none;
                }

                .size-btn.active {
                    background-color: #f1f5f9;
                    font-weight: bold;
                }

                .add-todo-form {
                    padding: 0.6rem 0.7rem;
                    border-top: 1px solid var(--color-border);
                }

                .add-todo-form input {
                    width: 100%;
                    border: none;
                    background: transparent;
                    font-size: 0.92rem;
                    line-height: 1.6;
                    outline: none;
                    box-sizing: border-box;
                }

                .add-todo-form input::placeholder {
                    color: var(--color-text-muted);
                    opacity: 0.65;
                }

                .notes-textarea {
                    width: 100%;
                    min-height: 80px;
                    padding: 0.65rem 0.8rem;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    resize: vertical;
                    font-family: inherit;
                    font-size: 0.92rem;
                    line-height: 1.5;
                    outline: none;
                    box-sizing: border-box;
                }

                .notes-textarea:focus {
                    border-color: var(--color-primary);
                    box-shadow: 0 0 0 2px var(--color-primary-light);
                }

                @media (max-width: 1024px) {
                    .weekly-grid {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }

                @media (max-width: 640px) {
                    .weekly-grid {
                        grid-template-columns: 1fr;
                    }
                }

                /* Calendar Modal Styles */
                .calendar-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                .calendar-modal-content {
                    position: relative;
                    background: white;
                    border-radius: var(--radius-lg);
                    padding: 1.5rem 2rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    width: 92vw;
                    max-width: 1200px;
                    height: 88vh;
                    max-height: 88vh;
                    overflow: hidden;
                    animation: slideUp 0.3s ease-out;
                    display: flex;
                    flex-direction: column;
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .calendar-modal-close {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 2rem;
                    cursor: pointer;
                    color: var(--color-text-muted);
                    line-height: 1;
                    padding: 0.25rem;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: background-color 0.2s, color 0.2s;
                }

                .calendar-modal-close:hover {
                    background-color: #f1f5f9;
                    color: var(--color-text);
                }

                @media (max-width: 640px) {
                    .calendar-modal-content {
                        padding: 1rem;
                        max-width: 95vw;
                    }

                    .calendar-modal-close {
                        top: 0.5rem;
                        right: 0.5rem;
                    }
                }

                /* ===== Notes Collection Modal ===== */
                .notes-collection-modal {
                    position: relative;
                    background: white;
                    border-radius: var(--radius-lg);
                    padding: 2rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    width: 90vw;
                    max-width: 700px;
                    height: 80vh;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    animation: slideUp 0.3s ease-out;
                }

                .notes-collection-title {
                    font-size: 1.3rem;
                    font-weight: 700;
                    margin: 0 0 1rem 0;
                }

                .notes-search-wrap {
                    margin-bottom: 1rem;
                }

                .notes-search-input {
                    width: 100%;
                    padding: 0.6rem 1rem;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    font-family: inherit;
                }

                .notes-search-input:focus {
                    border-color: var(--color-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                }

                .notes-collection-list {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .notes-collection-item {
                    border: 1px solid #e2e8f0;
                    border-radius: var(--radius-md);
                    padding: 1rem;
                    transition: box-shadow 0.2s;
                }

                .notes-collection-item:hover {
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
                }

                .notes-collection-item.current-week {
                    border-color: var(--color-primary);
                    background: #f0f9ff;
                }

                .notes-collection-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                }

                .notes-week-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--color-text-muted);
                }

                .notes-current-badge {
                    font-size: 0.72rem;
                    font-weight: 600;
                    color: var(--color-primary);
                    background: #dbeafe;
                    padding: 0.15rem 0.5rem;
                    border-radius: 9999px;
                }

                .notes-collection-text {
                    font-size: 0.92rem;
                    line-height: 1.65;
                    color: var(--color-text);
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .notes-empty {
                    text-align: center;
                    color: var(--color-text-muted);
                    padding: 3rem 1rem;
                    font-size: 0.95rem;
                }

                /* ===== Schedule Extraction Modal ===== */
                .extract-modal-content {
                    position: relative;
                    background: white;
                    border-radius: var(--radius-lg);
                    padding: 2rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    max-width: 640px;
                    width: 90vw;
                    max-height: 85vh;
                    overflow: auto;
                    animation: slideUp 0.3s ease-out;
                }

                .extract-step {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .extract-title {
                    font-size: 1.4rem;
                    font-weight: 700;
                    margin: 0;
                }

                .extract-desc {
                    color: var(--color-text-muted);
                    font-size: 0.95rem;
                    margin: 0;
                    line-height: 1.5;
                }

                .extract-hint {
                    display: block;
                    font-size: 0.85rem;
                    color: #6366f1;
                    margin-top: 0.25rem;
                }

                .extract-error {
                    background: #fef2f2;
                    color: #991b1b;
                    border: 1px solid #fecaca;
                    border-radius: var(--radius-md);
                    padding: 0.75rem 1rem;
                    font-size: 0.9rem;
                }

                .extract-textarea {
                    width: 100%;
                    min-height: 220px;
                    padding: 1rem;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    font-family: inherit;
                    font-size: 0.95rem;
                    line-height: 1.6;
                    resize: vertical;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .extract-textarea:focus {
                    border-color: var(--color-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                }

                .extract-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    margin-top: 0.5rem;
                }

                /* Loading */
                .extract-loading {
                    align-items: center;
                    justify-content: center;
                    padding: 3rem 1rem;
                    text-align: center;
                }

                .extract-spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid #e5e7eb;
                    border-top-color: var(--color-primary);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Result Table */
                .extract-table-wrap {
                    max-height: 350px;
                    overflow-y: auto;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                }

                .extract-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.95rem;
                }

                .extract-table thead {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .extract-table th {
                    background: #f8fafc;
                    font-weight: 600;
                    text-align: left;
                    padding: 0.75rem 0.75rem;
                    border-bottom: 2px solid var(--color-border);
                    font-size: 0.85rem;
                }

                .extract-table td {
                    padding: 0.6rem 0.75rem;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                }

                .extract-table tbody tr:hover {
                    background-color: #f8fafc;
                }

                .extract-row-unchecked {
                    opacity: 0.45;
                }

                .extract-row-unchecked td span {
                    text-decoration: line-through;
                }

                .extract-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: var(--color-primary);
                }

                .extract-editable-cell {
                    cursor: default;
                    min-height: 32px;
                }

                .extract-editable-cell:hover {
                    background-color: #eef2ff;
                    border-radius: 4px;
                }

                .extract-date-display {
                    font-family: 'SF Mono', 'Consolas', monospace;
                    font-size: 0.9rem;
                    color: #4338ca;
                }

                .extract-inline-input {
                    width: 100%;
                    border: 2px solid var(--color-primary);
                    border-radius: 4px;
                    padding: 0.25rem 0.4rem;
                    font-family: inherit;
                    font-size: 0.9rem;
                    outline: none;
                    background: white;
                }

                .extract-text-input {
                    width: 100%;
                }

                @media (max-width: 640px) {
                    .extract-modal-content {
                        padding: 1.25rem;
                        width: 95vw;
                    }

                    .extract-textarea {
                        min-height: 160px;
                    }
                }
            `}</style>
        </div>
    );
};

export default Dashboard;
