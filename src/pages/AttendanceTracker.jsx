import React, { useState } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import { useStudentContext } from '../context/StudentContext';
import ExperientialLearning from './ExperientialLearning';
import AbsenceReport from './AbsenceReport';
import { formatDateToString, groupConsecutiveDates } from '../utils/dateUtils';
import './AttendanceTracker.css';

const OTHER_SUB_TYPES = [
    { key: 'other_absent', label: '기타결석', color: '#64748b', placeholder: '기타결석 사유 입력 (예: 개인사정, 경조사)' },
    { key: 'late', label: '지각', color: '#d97706', placeholder: '지각 사유 입력 (예: 병원 진료, 늦잠)' },
    { key: 'early', label: '조퇴', color: '#0284c7', placeholder: '조퇴 사유 입력 (예: 발열, 병원 진료)' },
    { key: 'other', label: '기타/인정', color: '#475569', placeholder: '기타 사유 입력' },
];

const AttendanceTracker = () => {
    const { students, attendance, updateAttendance, holidays, fieldTrips, saveFieldTripMetadata } = useStudentContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(formatDateToString(new Date()));
    const [reasons, setReasons] = useState({});
    const [showMonthlySummary, setShowMonthlySummary] = useState(false);
    const [showFieldtripModal, setShowFieldtripModal] = useState(false);
    const [showAbsenceModal, setShowAbsenceModal] = useState(false);

    // Sort students by attendance number
    const safeStudents = Array.isArray(students) ? students : [];
    const sortedStudents = [...safeStudents].sort((a, b) => (a.attendanceNumber || 0) - (b.attendanceNumber || 0));

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

    const getStatus = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data) return '';

        if (typeof data === 'string') {
            return data === 'absent' ? 'sick' : data;
        }

        return data.status || '';
    };

    const getSubType = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data || typeof data === 'string') return 'other_absent';
        return data.subType || 'other_absent';
    };

    const getLocation = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data || typeof data === 'string') return '';
        return data.location || data.reason || '';
    };

    const getReason = (studentId) => {
        const data = attendance[selectedDate]?.[studentId];
        if (!data || typeof data === 'string') return '';
        return data.reason || '';
    };

    // 체험학습 대장 메타데이터와 장소 동기화
    const syncFieldTripLocation = (studentId, dateKey, location) => {
        if (!saveFieldTripMetadata) return;
        try {
            const studentFieldTripDates = [];
            Object.keys(attendance).forEach(d => {
                const att = attendance[d]?.[studentId];
                const st = typeof att === 'object' ? att?.status : att;
                if (st === 'fieldtrip' || d === dateKey) {
                    studentFieldTripDates.push(d);
                }
            });
            if (!studentFieldTripDates.includes(dateKey)) {
                studentFieldTripDates.push(dateKey);
            }
            const grouped = groupConsecutiveDates(studentFieldTripDates, holidays);
            grouped.forEach(group => {
                if (group.allDates && group.allDates.includes(dateKey)) {
                    const tripId = `${studentId}_${group.startDate}_${group.endDate}`;
                    const prevMeta = fieldTrips?.[studentId]?.[tripId] || {};
                    saveFieldTripMetadata(studentId, {
                        [tripId]: {
                            ...prevMeta,
                            location: location
                        }
                    });
                }
            });
        } catch (e) {
            console.warn('Field trip metadata sync error:', e);
        }
    };

    const handleStatusChange = (studentId, status) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;
        const currentStatus = getStatus(studentId);

        // 이미 선택된 상태 클릭 시 토글 해제
        if (currentStatus === status) {
            updateAttendance(dateKey, studentId, null);
            setReasons(prev => {
                const newReasons = { ...prev };
                delete newReasons[tempKey];
                return newReasons;
            });
            return;
        }

        const existingData = attendance[dateKey]?.[studentId];
        const existingReason = typeof existingData === 'object' ? existingData.reason : '';
        const existingLocation = typeof existingData === 'object' ? (existingData.location || existingData.reason) : '';
        const existingSubType = typeof existingData === 'object' ? (existingData.subType || 'other_absent') : 'other_absent';

        let autoReason = '';
        if (status === 'sick' || status === 'other') {
            autoReason = existingReason || getPrevSchoolDayReason(dateKey, studentId, status);
            setReasons(prev => ({
                ...prev,
                [tempKey]: autoReason
            }));
        }

        if (status === 'fieldtrip') {
            const locVal = existingLocation || autoReason || '';
            updateAttendance(dateKey, studentId, {
                status: 'fieldtrip',
                location: locVal,
                reason: locVal
            });
            if (locVal) {
                syncFieldTripLocation(studentId, dateKey, locVal);
            }
        } else if (status === 'other') {
            updateAttendance(dateKey, studentId, {
                status: 'other',
                subType: existingSubType,
                reason: autoReason || existingReason || reasons[tempKey] || ''
            });
        } else {
            updateAttendance(dateKey, studentId, {
                status,
                reason: autoReason || existingReason || reasons[tempKey] || ''
            });
        }
    };

    const handleSubTypeChange = (studentId, subType) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;
        const existingData = attendance[dateKey]?.[studentId];
        const existingReason = reasons[tempKey] || (typeof existingData === 'object' ? existingData.reason : '') || '';

        updateAttendance(dateKey, studentId, {
            status: 'other',
            subType,
            reason: existingReason
        });
    };

    const handleLocationChange = (studentId, location) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;

        setReasons(prev => ({
            ...prev,
            [tempKey]: location
        }));

        updateAttendance(dateKey, studentId, {
            status: 'fieldtrip',
            location,
            reason: location
        });

        syncFieldTripLocation(studentId, dateKey, location);
    };

    const handleReasonChange = (studentId, reason, currentStatus) => {
        const dateKey = selectedDate;
        const tempKey = `${dateKey}_${studentId}`;

        setReasons(prev => ({
            ...prev,
            [tempKey]: reason
        }));

        if (currentStatus === 'sick' || currentStatus === 'other') {
            const existingData = attendance[dateKey]?.[studentId];
            const subType = typeof existingData === 'object' ? (existingData.subType || 'other_absent') : 'other_absent';
            updateAttendance(dateKey, studentId, {
                status: currentStatus,
                subType: currentStatus === 'other' ? subType : undefined,
                reason
            });
        }
    };

    // 달력 날짜 타일에 표시할 학생 출결 특이사항 (지각, 조퇴, 기타결, 병결, 체험)
    const getSpecialStatusStudents = (date) => {
        const dateKey = formatDateToString(date);
        const dayAttendance = attendance[dateKey] || {};

        const specialStudents = [];

        Object.keys(dayAttendance).forEach(studentId => {
            const data = dayAttendance[studentId];
            if (!data) return;

            const status = typeof data === 'string' ? data : data.status;
            if (!status || status === 'present') return;

            const student = students.find(s => String(s.id) === String(studentId));
            if (!student) return;

            if (status === 'fieldtrip') {
                const loc = (typeof data === 'object' ? (data.location || data.reason) : '') || '';
                specialStudents.push({
                    name: student.name,
                    status: 'fieldtrip',
                    label: '체험',
                    color: '#8b5cf6',
                    extra: loc ? `(${loc})` : ''
                });
            } else if (status === 'sick' || status === 'absent') {
                specialStudents.push({
                    name: student.name,
                    status: 'sick',
                    label: '병결',
                    color: '#3b82f6'
                });
            } else if (status === 'other') {
                const subType = typeof data === 'object' ? (data.subType || 'other_absent') : 'other_absent';
                if (subType === 'late') {
                    specialStudents.push({
                        name: student.name,
                        status: 'late',
                        label: '지각',
                        color: '#d97706'
                    });
                } else if (subType === 'early') {
                    specialStudents.push({
                        name: student.name,
                        status: 'early',
                        label: '조퇴',
                        color: '#0284c7'
                    });
                } else if (subType === 'other') {
                    specialStudents.push({
                        name: student.name,
                        status: 'other',
                        label: '기타',
                        color: '#475569'
                    });
                } else {
                    specialStudents.push({
                        name: student.name,
                        status: 'other_absent',
                        label: '기타',
                        color: '#64748b'
                    });
                }
            }
        });

        return specialStudents;
    };

    // Get monthly summary sorted by student attendance number with consecutive date grouping (NEIS / 나이스 input friendly!)
    const getStudentMonthlySummary = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const summaryByStudent = [];

        sortedStudents.forEach(student => {
            const studentRecords = [];

            const lastDay = new Date(year, month + 1, 0).getDate();
            for (let day = 1; day <= lastDay; day++) {
                const date = new Date(year, month, day);
                const dateKey = formatDateToString(date);
                const data = attendance[dateKey]?.[student.id];

                if (data) {
                    const status = typeof data === 'string' ? data : data.status;
                    const subType = typeof data === 'object' ? data.subType : undefined;
                    const reason = typeof data === 'object' ? (data.reason || data.location) : '';

                    if (status && status !== 'present') {
                        let effectiveStatus = status;
                        if (status === 'other') {
                            if (subType === 'late') effectiveStatus = 'late';
                            else if (subType === 'early') effectiveStatus = 'early';
                            else if (subType === 'other') effectiveStatus = 'other';
                            else effectiveStatus = 'other_absent';
                        }

                        studentRecords.push({
                            date,
                            dateKey,
                            status: effectiveStatus,
                            reason: reason || ''
                        });
                    }
                }
            }

            if (studentRecords.length > 0) {
                const groupedRanges = [];
                let currentRange = null;

                studentRecords.forEach(rec => {
                    if (!currentRange) {
                        currentRange = {
                            startDate: rec.date,
                            endDate: rec.date,
                            dates: [rec.date],
                            status: rec.status,
                            reason: rec.reason
                        };
                    } else {
                        const prevDate = currentRange.endDate;
                        const diffDays = Math.round((rec.date - prevDate) / (1000 * 60 * 60 * 24));
                        const isConsecutive = diffDays === 1 || (diffDays <= 3 && prevDate.getDay() === 5 && rec.date.getDay() === 1);

                        if (isConsecutive && rec.status === currentRange.status && rec.reason === currentRange.reason) {
                            currentRange.endDate = rec.date;
                            currentRange.dates.push(rec.date);
                        } else {
                            groupedRanges.push(currentRange);
                            currentRange = {
                                startDate: rec.date,
                                endDate: rec.date,
                                dates: [rec.date],
                                status: rec.status,
                                reason: rec.reason
                            };
                        }
                    }
                });

                if (currentRange) {
                    groupedRanges.push(currentRange);
                }

                const formattedRanges = groupedRanges.map(range => {
                    const startStr = range.startDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
                    const count = range.dates.length;
                    let dateText = '';

                    if (count === 1) {
                        dateText = startStr;
                    } else {
                        const endStr = range.endDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
                        dateText = `${startStr} ~ ${endStr} [${count}일간]`;
                    }

                    return {
                        dateText,
                        count,
                        status: range.status,
                        reason: range.reason
                    };
                });

                summaryByStudent.push({
                    student,
                    totalDays: studentRecords.length,
                    ranges: formattedRanges
                });
            }
        });

        return summaryByStudent;
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
        { value: 'other', label: '기타', color: '#64748b' }
    ];

    const getStatusColor = (status) => {
        if (status === 'fieldtrip') return '#8b5cf6';
        if (status === 'sick' || status === 'absent') return '#3b82f6';
        if (status === 'late') return '#d97706';
        if (status === 'early') return '#0284c7';
        if (status === 'other_absent') return '#64748b';
        if (status === 'other') return '#475569';
        const option = statusOptions.find(opt => opt.value === status);
        return option ? option.color : '#64748b';
    };

    const getStatusLabel = (status) => {
        if (status === 'fieldtrip') return '체험학습';
        if (status === 'sick' || status === 'absent') return '병결';
        if (status === 'late') return '지각';
        if (status === 'early') return '조퇴';
        if (status === 'other_absent') return '기타';
        if (status === 'other') return '기타';
        const option = statusOptions.find(opt => opt.value === status);
        return option ? option.label : status;
    };

    const goToTodayMonth = () => {
        const now = new Date();
        setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    };

    return (
        <>
            {/* 상단 창 (Top Month & Action Control Box) */}
            <div className="attendance-top-card mb-md">
                <div className="attendance-month-nav">
                    <span className="green-date-range-badge">
                        {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                    </span>

                    <div className="date-nav-buttons">
                        <button className="green-pill-btn" onClick={goToPreviousMonth} title="지난달">
                            ◀ 지난달
                        </button>
                        <button 
                            className={`green-pill-btn ${currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear() ? 'active' : ''}`}
                            onClick={goToTodayMonth} 
                            title="이번달"
                        >
                            이번달
                        </button>
                        <button className="green-pill-btn" onClick={goToNextMonth} title="다음달">
                            다음달 ▶
                        </button>
                    </div>
                </div>

                <div className="attendance-action-buttons">
                    <button className="action-btn-fieldtrip" onClick={() => setShowFieldtripModal(true)}>
                        🚌 체험학습 대장
                    </button>
                    <button className="action-btn-absence" onClick={() => setShowAbsenceModal(true)}>
                        🏥 결석계 관리
                    </button>
                </div>
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
                                                        style={{ color: s.color }}
                                                        title={`${s.label}: ${s.name}${s.extra || ''}`}
                                                    >
                                                        <span
                                                            className="status-pill-mini"
                                                            style={{
                                                                backgroundColor: s.color + '18',
                                                                color: s.color,
                                                                borderColor: s.color + '40'
                                                            }}
                                                        >
                                                            {s.label}
                                                        </span>
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
                            📊 {currentDate.getMonth() + 1}월 출결 특이사항 종합 (나이스 입력용)
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

                                        {/* 1. 체험학습 선택 시: 장소 입력 (체험학습대장 자동 연동) */}
                                        {currentStatus === 'fieldtrip' && (
                                            <div className="reason-input-container">
                                                <div className="fieldtrip-loc-label-row">
                                                    <span className="fieldtrip-loc-badge">📍 체험 장소</span>
                                                    <span className="fieldtrip-loc-hint">체험학습대장 자동 반영</span>
                                                </div>
                                                <input
                                                    type="text"
                                                    className="reason-input-full"
                                                    placeholder="체험학습 장소 (예: 제주도, 에버랜드, 강원도)"
                                                    value={getLocation(student.id)}
                                                    onChange={(e) => handleLocationChange(student.id, e.target.value)}
                                                />
                                            </div>
                                        )}

                                        {/* 2. 병결 선택 시: 병결 사유 입력 */}
                                        {currentStatus === 'sick' && (
                                            <div className="reason-input-container">
                                                <input
                                                    type="text"
                                                    className="reason-input-full"
                                                    placeholder="병결 사유 입력 (예: 감기, 장염, 발열 진료)"
                                                    value={reasons[tempKey] || reason || ''}
                                                    onChange={(e) => handleReasonChange(student.id, e.target.value, currentStatus)}
                                                />
                                            </div>
                                        )}

                                        {/* 3. 기타 선택 시: 세부 출결 칩(기타결석, 지각, 조퇴, 기타/인정) 및 사유 입력 */}
                                        {currentStatus === 'other' && (() => {
                                            const subType = getSubType(student.id);
                                            const subOption = OTHER_SUB_TYPES.find(st => st.key === subType) || OTHER_SUB_TYPES[0];
                                            return (
                                                <div className="reason-input-container">
                                                    <div className="sub-type-chips">
                                                        {OTHER_SUB_TYPES.map(st => (
                                                            <button
                                                                key={st.key}
                                                                type="button"
                                                                className={`sub-type-chip ${subType === st.key ? `active ${st.key}` : ''}`}
                                                                onClick={() => handleSubTypeChange(student.id, st.key)}
                                                            >
                                                                {st.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        className="reason-input-full"
                                                        placeholder={subOption.placeholder}
                                                        value={reasons[tempKey] || reason || ''}
                                                        onChange={(e) => handleReasonChange(student.id, e.target.value, currentStatus)}
                                                    />
                                                </div>
                                            );
                                        })()}
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
                    <div className="modal-content monthly-summary-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>📊 {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 출결 특이사항 (나이스 입력용 번호순)</h2>
                            <button className="modal-close" onClick={() => setShowMonthlySummary(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {getStudentMonthlySummary().length === 0 ? (
                                <p className="text-muted text-center" style={{ padding: '2rem' }}>이번 달 특이사항 기록이 없습니다.</p>
                            ) : (
                                <div className="student-summary-grid">
                                    {getStudentMonthlySummary().map((item) => (
                                        <div key={item.student.id} className="student-summary-card">
                                            <div className="student-summary-header">
                                                <div className="student-badge-title">
                                                    <span className="summary-student-num">{item.student.attendanceNumber}번</span>
                                                    <span className="summary-student-name">{item.student.name}</span>
                                                </div>
                                                <span className="summary-total-badge">총 {item.totalDays}일</span>
                                            </div>
                                            <div className="student-summary-body">
                                                {item.ranges.map((range, ridx) => (
                                                    <div key={ridx} className="summary-range-row">
                                                        <span className="summary-range-date">{range.dateText}</span>
                                                        <span
                                                            className="summary-status-pill"
                                                            style={{
                                                                backgroundColor: getStatusColor(range.status) + '15',
                                                                color: getStatusColor(range.status),
                                                                borderColor: getStatusColor(range.status) + '40'
                                                            }}
                                                        >
                                                            {getStatusLabel(range.status)}
                                                        </span>
                                                        {range.reason && (
                                                            <span className="summary-range-reason">: {range.reason}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
