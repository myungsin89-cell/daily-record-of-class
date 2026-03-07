import React, { useState } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import { useStudentContext } from '../context/StudentContext';
import ExperientialLearning from './ExperientialLearning';
import AbsenceReport from './AbsenceReport';
import { formatDateToString } from '../utils/dateUtils';
import './AttendanceTracker.css';

const AttendanceTracker = () => {
    const { students, attendance, updateAttendance, holidays } = useStudentContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(formatDateToString(new Date()));
    const [reasons, setReasons] = useState({});
    const [showMonthlySummary, setShowMonthlySummary] = useState(false);
    const [showFieldtripModal, setShowFieldtripModal] = useState(false);
    const [showAbsenceModal, setShowAbsenceModal] = useState(false);

    // Sort students by attendance number
    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    // Calendar navigation
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    // Get calendar days
    const getCalendarDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const firstDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const days = [];

        // Previous month days
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, month - 1, prevMonthLastDay - i),
                isCurrentMonth: false
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, month, i),
                isCurrentMonth: true
            });
        }

        // Next month days to fill the grid
        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false
            });
        }

        return days;
    };

    // 이전 출석일의 같은 상태 사유를 찾기 (연속 병결 사유 자동 입력)
    const getPrevSchoolDayReason = (dateStr, studentId, status) => {
        const holidaySet = new Set(
            (holidays || []).map(h => (typeof h === 'string' ? h : h.date))
        );
        const [y, m, d] = dateStr.split('-').map(Number);
        let date = new Date(y, m - 1, d);

        // 최대 10일 뒤로 탐색
        for (let i = 0; i < 10; i++) {
            date.setDate(date.getDate() - 1);
            const dow = date.getDay();
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

            // 주말/공휴일이면 건너뜀
            if (dow === 0 || dow === 6 || holidaySet.has(key)) continue;

            // 출석일 찾음 — 같은 학생/상태인지 확인
            const data = attendance[key]?.[studentId];
            if (data) {
                const prevStatus = typeof data === 'object' ? data.status : data;
                const prevReason = typeof data === 'object' ? data.reason : '';
                if (prevStatus === status && prevReason) {
                    return prevReason;
                }
            }
            // 이전 출석일에 같은 상태가 아니면 연속이 아님
            break;
        }
        return '';
    };

    const handleStatusChange = (studentId, status) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;
        const currentStatus = getStatus(studentId);

        // If clicking the same status again, remove it (toggle off)
        if (currentStatus === status) {
            updateAttendance(dateKey, studentId, null);
            // Clear the reason from temporary state
            setReasons(prev => {
                const newReasons = { ...prev };
                delete newReasons[tempKey];
                return newReasons;
            });
            return;
        }

        // Set new status
        let autoReason = '';
        if (status === 'sick' || status === 'other') {
            const existingData = attendance[dateKey]?.[studentId];
            const existingReason = typeof existingData === 'object' ? existingData.reason : '';

            // 기존 사유 없으면 이전 출석일 사유 자동 입력
            autoReason = existingReason || getPrevSchoolDayReason(dateKey, studentId, status);

            setReasons(prev => ({
                ...prev,
                [tempKey]: autoReason
            }));
        }

        updateAttendance(dateKey, studentId, { status, reason: autoReason || reasons[tempKey] || '' });
    };

    const handleReasonChange = (studentId, reason, currentStatus) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;

        setReasons(prev => ({
            ...prev,
            [tempKey]: reason
        }));

        if (currentStatus === 'sick' || currentStatus === 'other') {
            updateAttendance(dateKey, studentId, { status: currentStatus, reason });
        }
    };

    const getStatus = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data) return '';

        if (typeof data === 'string') {
            return data === 'absent' ? 'sick' : data;
        }

        return data.status || '';
    };

    const getReason = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data || typeof data === 'string') return '';
        return data.reason || '';
    };

    // Get students with special status for a specific date
    const getSpecialStatusStudents = (date) => {
        const dateKey = formatDateToString(date);
        const dayAttendance = attendance[dateKey] || {};

        const specialStudents = [];

        Object.keys(dayAttendance).forEach(studentId => {
            const data = dayAttendance[studentId];
            const status = typeof data === 'string' ? data : data.status;

            if (status && status !== 'present' && status !== 'late') {
                const student = students.find(s => s.id === parseInt(studentId));
                if (student) {
                    specialStudents.push({
                        name: student.name,
                        status: status
                    });
                }
            }
        });

        return specialStudents;
    };

    // Get monthly summary
    const getMonthlySummary = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const summary = [];

        // Get all dates in current month
        const lastDay = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= lastDay; day++) {
            const date = new Date(year, month, day);
            const dateKey = formatDateToString(date);
            const dayAttendance = attendance[dateKey] || {};

            const specialRecords = [];

            Object.keys(dayAttendance).forEach(studentId => {
                const data = dayAttendance[studentId];
                const status = typeof data === 'string' ? data : data.status;
                const reason = typeof data === 'object' ? data.reason : '';

                // Only include special statuses
                if (status && status !== 'present') {
                    const student = students.find(s => s.id === parseInt(studentId));
                    if (student) {
                        specialRecords.push({
                            studentName: student.name,
                            attendanceNumber: student.attendanceNumber,
                            status: status,
                            reason: reason
                        });
                    }
                }
            });

            if (specialRecords.length > 0) {
                summary.push({
                    date: date,
                    dateString: date.toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short'
                    }),
                    records: specialRecords.sort((a, b) => a.attendanceNumber - b.attendanceNumber)
                });
            }
        }

        return summary;
    };

    const calendarDays = getCalendarDays();
    const today = formatDateToString(new Date());

    const hasAttendanceRecords = (date) => {
        const dateKey = formatDateToString(date);
        return attendance[dateKey] && Object.keys(attendance[dateKey]).length > 0;
    };

    const handleDateClick = (date) => {
        setSelectedDate(formatDateToString(date));
    };

    const isHoliday = (date) => {
        const dateStr = formatDateToString(date);
        return holidays.some(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate === dateStr;
        });
    };

    const getHolidayName = (date) => {
        const dateStr = formatDateToString(date);
        const holiday = holidays.find(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate === dateStr;
        });
        if (!holiday) return '';
        return typeof holiday === 'string' ? '공휴일' : holiday.name || '공휴일';
    };

    const formatSelectedDate = () => {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };

    const statusOptions = [
        { value: 'fieldtrip', label: '체험학습', color: '#8b5cf6' },
        { value: 'sick', label: '병결', color: '#3b82f6' },
        { value: 'other', label: '기타', color: '#6b7280', small: true }
    ];

    const getStatusColor = (status) => {
        const option = statusOptions.find(opt => opt.value === status);
        return option ? option.color : '#6b7280';
    };

    const getStatusLabel = (status) => {
        const option = statusOptions.find(opt => opt.value === status);
        return option ? option.label : status;
    };

    return (
        <>
            <div className="flex justify-between items-center mb-lg">
                <h1>출석 관리</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => setShowFieldtripModal(true)}>
                        🚌 체험학습 대장
                    </Button>
                    <Button variant="secondary" onClick={() => setShowAbsenceModal(true)}>
                        🏥 결석계 관리
                    </Button>
                </div>
            </div>

            {/* Month Navigation */}
            <div className="month-navigation">
                <button className="month-nav-btn" onClick={goToPreviousMonth}>◀</button>
                <h2 className="current-month">
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                </h2>
                <button className="month-nav-btn" onClick={goToNextMonth}>▶</button>
            </div>

            {/* Main Content */}
            <div className="calendar-attendance-section-full">
                {/* Calendar - LEFT SIDE */}
                <div className="calendar-container">
                    <div className="calendar">
                        <div className="calendar-header">
                            {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                                <div key={index} className="calendar-day-name">{day}</div>
                            ))}
                        </div>
                        <div className="calendar-grid">
                            {calendarDays.map((day, index) => {
                                const dateKey = formatDateToString(day.date);
                                const isSelected = dateKey === selectedDate;
                                const isToday = dateKey === today;
                                const hasRecords = hasAttendanceRecords(day.date);
                                const specialStudents = getSpecialStatusStudents(day.date);
                                const isHolidayDate = isHoliday(day.date);
                                const holidayName = isHolidayDate ? getHolidayName(day.date) : '';

                                return (
                                    <div
                                        key={index}
                                        className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isHolidayDate ? 'holiday-day' : ''}`}
                                        onClick={() => day.isCurrentMonth && handleDateClick(day.date)}
                                        title={holidayName}
                                    >
                                        <span className="day-number">
                                            {day.date.getDate()}
                                            {isHolidayDate && <span className="holiday-icon">🎉</span>}
                                        </span>
                                        {hasRecords && <span className="record-indicator">●</span>}
                                        {specialStudents.length > 0 && (
                                            <div className="special-status-names">
                                                {specialStudents.map((s, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="status-name"
                                                        style={{ color: getStatusColor(s.status) }}
                                                    >
                                                        {s.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Monthly Summary Button */}
                    <div className="monthly-summary-btn-container">
                        <Button
                            variant="primary"
                            onClick={() => setShowMonthlySummary(true)}
                            style={{ width: '100%' }}
                        >
                            📊 {currentDate.getMonth() + 1}월 출결 특이사항 종합
                        </Button>
                    </div>
                </div>

                {/* Attendance Checklist - RIGHT SIDE */}
                <div className="attendance-checklist-section">
                    <h3 className="checklist-title">📅 {formatSelectedDate()}</h3>

                    {sortedStudents.length === 0 ? (
                        <Card className="text-center">
                            <p>등록된 학생이 없습니다.</p>
                        </Card>
                    ) : (
                        <div className="attendance-checklist">
                            {sortedStudents.map((student) => {
                                const currentStatus = getStatus(student.id);
                                const reason = getReason(student.id);
                                const tempKey = `${selectedDate}_${student.id}`;

                                return (
                                    <Card key={student.id} className="attendance-card-compact">
                                        <div className="student-info-compact">
                                            <span className="student-number">{student.attendanceNumber}.</span>
                                            <span className="student-name">{student.name}</span>
                                        </div>

                                        <div className="status-buttons-full">
                                            {statusOptions.map(option => (
                                                <button
                                                    key={option.value}
                                                    className={`status-btn-full ${currentStatus === option.value ? 'active' : ''}`}
                                                    onClick={() => handleStatusChange(student.id, option.value)}
                                                    style={{
                                                        backgroundColor: currentStatus === option.value ? option.color : 'transparent',
                                                        borderColor: option.color,
                                                        color: currentStatus === option.value ? 'white' : option.color
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>

                                        {(currentStatus === 'sick' || currentStatus === 'other') && (
                                            <div className="reason-input-container">
                                                <input
                                                    type="text"
                                                    className="reason-input-full"
                                                    placeholder={currentStatus === 'sick' ? '병결 사유 입력' : '기타 사유 입력'}
                                                    value={reasons[tempKey] || reason || ''}
                                                    onChange={(e) => handleReasonChange(student.id, e.target.value, currentStatus)}
                                                />
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Monthly Summary Modal */}
            {showMonthlySummary && (
                <div className="modal-overlay" onClick={() => setShowMonthlySummary(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 출결 특이사항</h2>
                            <button className="modal-close" onClick={() => setShowMonthlySummary(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {getMonthlySummary().length === 0 ? (
                                <p className="text-muted text-center">이번 달 특이사항이 없습니다.</p>
                            ) : (
                                getMonthlySummary().map((daySummary, idx) => (
                                    <div key={idx} className="summary-date-group">
                                        <h3 className="summary-date-header">{daySummary.dateString}</h3>
                                        <div className="summary-records">
                                            {daySummary.records.map((record, ridx) => (
                                                <div key={ridx} className="summary-record-item">
                                                    <span className="summary-student">
                                                        {record.attendanceNumber}. {record.studentName}
                                                    </span>
                                                    <span
                                                        className="summary-status"
                                                        style={{ color: getStatusColor(record.status) }}
                                                    >
                                                        {getStatusLabel(record.status)}
                                                    </span>
                                                    {record.reason && (
                                                        <span className="summary-reason">({record.reason})</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Fieldtrip Modal */}
            {showFieldtripModal && (
                <div className="calendar-modal-overlay" onClick={() => setShowFieldtripModal(false)}>
                    <div className="fieldtrip-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="calendar-modal-close"
                            onClick={() => setShowFieldtripModal(false)}
                            title="닫기"
                        >
                            ×
                        </button>
                        <ExperientialLearning />
                    </div>
                </div>
            )}
            {/* Absence Report Modal */}
            {showAbsenceModal && (
                <div className="calendar-modal-overlay" onClick={() => setShowAbsenceModal(false)}>
                    <div className="fieldtrip-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="calendar-modal-close"
                            onClick={() => setShowAbsenceModal(false)}
                            title="닫기"
                        >
                            ×
                        </button>
                        <AbsenceReport />
                    </div>
                </div>
            )}
        </>
    );
};

export default AttendanceTracker;
