import React, { useState, useMemo } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { groupConsecutiveDates, formatDateKorean, calculateSchoolDays } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import './ExperientialLearning.css';

const ExperientialLearning = () => {
    const { students, attendance, fieldTrips, saveFieldTripMetadata, updateAttendance, holidays } = useStudentContext();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const [sortConfig, setSortConfig] = useState({ key: 'application', direction: 'asc' });
    const [isEditMode, setIsEditMode] = useState(false);

    const [teacherName, setTeacherName] = useState(() => {
        return localStorage.getItem('fieldtrip_teacherName') || '';
    });
    const [semester, setSemester] = useState(() => {
        return localStorage.getItem('fieldtrip_semester') || '1학기';
    });
    const [useSeal, setUseSeal] = useState(() => {
        return localStorage.getItem('fieldtrip_useSeal') === 'true';
    });

    const handleTeacherNameChange = (value) => {
        setTeacherName(value);
        localStorage.setItem('fieldtrip_teacherName', value);
    };
    const handleSemesterChange = (value) => {
        setSemester(value);
        localStorage.setItem('fieldtrip_semester', value);
    };
    const handleUseSealChange = (value) => {
        setUseSeal(value);
        localStorage.setItem('fieldtrip_useSeal', value);
    };

    // 월 범위 필터
    const [isFilterEnabled, setIsFilterEnabled] = useState(false);
    const [startMonth, setStartMonth] = useState(3);
    const [endMonth, setEndMonth] = useState(8);

    // Process data to find field trips
    const tripData = useMemo(() => {
        const trips = [];

        students.forEach(student => {
            // 1. Find all dates marked as 'fieldtrip' for this student
            const studentFieldTripDates = [];

            Object.keys(attendance).forEach(date => {
                const status = typeof attendance[date][student.id] === 'object'
                    ? attendance[date][student.id].status
                    : attendance[date][student.id];

                if (status === 'fieldtrip') {
                    studentFieldTripDates.push(date);
                }
            });

            // 2. Group consecutive dates (considering weekends and holidays)
            if (studentFieldTripDates.length > 0) {
                const groupedTrips = groupConsecutiveDates(studentFieldTripDates, holidays);

                // 3. Merge with metadata
                groupedTrips.forEach(group => {
                    // Create a unique key for this trip
                    const tripId = `${student.id}_${group.startDate}_${group.endDate}`;
                    const metadata = fieldTrips[student.id]?.[tripId] || {};

                    // Calculate school days
                    const schoolDays = calculateSchoolDays(group.startDate, group.endDate, holidays);

                    // Format dates in Korean
                    const startFormatted = formatDateKorean(group.startDate);
                    const endFormatted = formatDateKorean(group.endDate);

                    // Generate affiliation (Grade-Class-Number)
                    let grade = '?';
                    let classNumber = '?';

                    if (currentClass) {
                        // First try to get from properties
                        grade = currentClass.grade || '?';
                        classNumber = currentClass.classNumber || '?';

                        // If not available, extract from name (e.g., "3학년 2반")
                        if ((grade === '?' || classNumber === '?') && currentClass.name) {
                            const nameMatch = currentClass.name.match(/(\d+)학년\s*(\d+)반/);
                            if (nameMatch) {
                                grade = nameMatch[1];
                                classNumber = nameMatch[2];
                            }
                        }
                    }
                    const affiliation = `${grade}-${classNumber}-${student.attendanceNumber}`;

                    trips.push({
                        id: tripId,
                        studentId: student.id,
                        studentName: student.name,
                        attendanceNumber: student.attendanceNumber,
                        affiliation: affiliation,
                        startDate: group.startDate,
                        endDate: group.endDate,
                        allDates: group.allDates,
                        startFormatted,
                        endFormatted,
                        dateRange: `${startFormatted} ~ ${endFormatted}`,
                        schoolDays: schoolDays,
                        applicationDate: metadata.applicationDate || group.startDate,
                        activityName: metadata.activityName || '교외체험학습',
                        location: metadata.location || '',
                        content: metadata.content || '가족동반여행',
                        isSubmitted: metadata.isSubmitted || false
                    });
                });
            }
        });

        // Sort trips
        return trips.sort((a, b) => {
            if (sortConfig.key === 'application') {
                return sortConfig.direction === 'asc'
                    ? a.applicationDate.localeCompare(b.applicationDate)
                    : b.applicationDate.localeCompare(a.applicationDate);
            }
            if (sortConfig.key === 'student') {
                return sortConfig.direction === 'asc'
                    ? a.attendanceNumber - b.attendanceNumber
                    : b.attendanceNumber - a.attendanceNumber;
            }
            return 0;
        });
    }, [students, attendance, fieldTrips, holidays, currentClass, sortConfig]);

    // 월 범위 필터링
    const filteredTripData = useMemo(() => {
        if (!isFilterEnabled) return tripData;
        return tripData.filter(trip => {
            const month = parseInt(trip.startDate.split('-')[1]);
            return month >= startMonth && month <= endMonth;
        });
    }, [tripData, startMonth, endMonth, isFilterEnabled]);

    const handleMetadataChange = (tripId, studentId, field, value) => {
        const studentTrips = fieldTrips[studentId] || {};

        const updatedMetadata = {
            ...studentTrips,
            [tripId]: {
                ...(studentTrips[tripId] || {}),
                [field]: value
            }
        };

        saveFieldTripMetadata(studentId, updatedMetadata);
    };

    const handleDeleteTrip = (trip) => {
        const confirmMessage = `${trip.studentName}의 체험학습 (${trip.dateRange})을 삭제하시겠습니까?\n\n출석 체크에서도 모두 제거됩니다.`;

        if (!window.confirm(confirmMessage)) {
            return;
        }

        // 1. Delete attendance records for all dates
        trip.allDates.forEach(date => {
            updateAttendance(date, trip.studentId, null);
        });

        // 2. Delete field trip metadata
        const studentTrips = fieldTrips[trip.studentId] || {};
        const updatedMetadata = { ...studentTrips };
        delete updatedMetadata[trip.id];

        saveFieldTripMetadata(trip.studentId, updatedMetadata);
    };

    const handleExport = () => {
        const exportData = filteredTripData.map((trip, index) => ({
            '순': index + 1,
            '소속': trip.affiliation,
            '이름': trip.studentName,
            '시작일': trip.startFormatted,
            '종료일': trip.endFormatted,
            '교육과정일수': trip.schoolDays,
            '체험활동명': trip.activityName,
            '장소(기관)': trip.location,
            '활동내용': trip.content,
            '서류완결확인': trip.isSubmitted ? 'O' : 'X'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "체험학습대장");

        XLSX.writeFile(wb, `체험학습대장_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // PDF 인쇄 기능 (A4 교외 체험 학습 대장 양식)
    const handlePrint = () => {
        const ROWS_PAGE_1 = 18;
        const ROWS_PAGE_OTHER = 25;

        // 학급 정보 추출
        let grade = '?';
        let classNumber = '?';
        const year = new Date().getFullYear();

        if (currentClass) {
            grade = currentClass.grade || '?';
            classNumber = currentClass.classNumber || '?';
            if ((grade === '?' || classNumber === '?') && currentClass.name) {
                const nameMatch = currentClass.name.match(/(\d+)학년\s*(\d+)반/);
                if (nameMatch) {
                    grade = nameMatch[1];
                    classNumber = nameMatch[2];
                }
            }
        }

        // 도장 이미지 생성 함수 (인감 스타일)
        const generateSealImage = (name) => {
            const canvas = document.createElement('canvas');
            canvas.width = 120;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            const sealText = name ? (name.length <= 3 ? name + '인' : name) : '인';
            const centerX = 60;
            const centerY = 60;
            const radiusX = 42;
            const radiusY = 52;
            const color = '#c40000';

            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            for (let i = 0; i <= 360; i += 5) {
                const angle = (i * Math.PI) / 180;
                const jitter = (Math.random() - 0.5) * 0.8;
                const x = centerX + (radiusX + jitter) * Math.cos(angle);
                const y = centerY + (radiusY + jitter) * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const drawTextWithJitter = (text, x, y, size) => {
                ctx.font = `${size}pt "HYGyeonyMyeongjo", "HY견명조", serif`;
                const jitterX = (Math.random() - 0.5) * 0.5;
                const jitterY = (Math.random() - 0.5) * 0.5;
                ctx.fillText(text, x + jitterX, y + jitterY);
            };

            if (sealText.length === 2) {
                drawTextWithJitter(sealText[0], centerX, centerY - 15, 24);
                drawTextWithJitter(sealText[1], centerX, centerY + 15, 24);
            } else if (sealText.length === 3) {
                drawTextWithJitter(sealText[0], centerX, centerY - 18, 22);
                drawTextWithJitter(sealText[1], centerX - 18, centerY + 12, 22);
                drawTextWithJitter(sealText[2], centerX + 18, centerY + 12, 22);
            } else if (sealText.length === 4) {
                drawTextWithJitter(sealText[0], centerX - 18, centerY - 18, 20);
                drawTextWithJitter(sealText[1], centerX + 18, centerY - 18, 20);
                drawTextWithJitter(sealText[2], centerX - 18, centerY + 18, 20);
                drawTextWithJitter(sealText[3], centerX + 18, centerY + 18, 20);
            } else {
                drawTextWithJitter(sealText, centerX, centerY, 24);
            }

            for (let i = 0; i < 150; i++) {
                const x = centerX + (Math.random() - 0.5) * radiusX * 2.2;
                const y = centerY + (Math.random() - 0.5) * radiusY * 2.2;
                const normalizedX = (x - centerX) / radiusX;
                const normalizedY = (y - centerY) / radiusY;
                if (normalizedX * normalizedX + normalizedY * normalizedY < 1.1) {
                    ctx.fillStyle = color;
                    ctx.globalAlpha = Math.random() * 0.4;
                    ctx.beginPath();
                    ctx.arc(x, y, Math.random() * 1.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 40; i++) {
                const x = centerX + (Math.random() - 0.5) * radiusX * 2;
                const y = centerY + (Math.random() - 0.5) * radiusY * 2;
                ctx.beginPath();
                ctx.arc(x, y, Math.random() * 0.8, 0, Math.PI * 2);
                ctx.fill();
            }

            return canvas.toDataURL();
        };

        const sealImage = useSeal ? generateSealImage(teacherName) : null;

        // 페이지 분할
        const allRecords = filteredTripData;
        const pages = [];
        if (allRecords.length === 0) {
            pages.push([]);
        } else {
            pages.push(allRecords.slice(0, ROWS_PAGE_1));
            let remaining = allRecords.slice(ROWS_PAGE_1);
            while (remaining.length > 0) {
                pages.push(remaining.slice(0, ROWS_PAGE_OTHER));
                remaining = remaining.slice(ROWS_PAGE_OTHER);
            }
        }

        // 페이지 HTML 생성
        let pagesHtml = '';
        pages.forEach((pageRecords, pageIdx) => {
            const isFirstPage = pageIdx === 0;
            const maxRows = isFirstPage ? ROWS_PAGE_1 : ROWS_PAGE_OTHER;
            const emptyRowsCount = maxRows - pageRecords.length;
            const startIndex = isFirstPage ? 0 : ROWS_PAGE_1 + (pageIdx - 1) * ROWS_PAGE_OTHER;
            const rowHeight = isFirstPage ? '10.5mm' : '9.2mm';
            const fontSize = isFirstPage ? '9.5pt' : '8.5pt';
            const headerHeight = isFirstPage ? '12mm' : '10mm';

            let rowsHtml = '';
            pageRecords.forEach((record, index) => {
                const globalIndex = startIndex + index + 1;
                const startDate = record.startFormatted.replace(/\d{4}년\s*/, '').replace('월 ', '.').replace('일', '');
                const endDate = record.endFormatted.replace(/\d{4}년\s*/, '').replace('월 ', '.').replace('일', '');
                rowsHtml += `
                    <tr style="height:${rowHeight}; font-size:${fontSize}">
                        <td>${globalIndex}</td>
                        <td style="font-size:8pt">${record.affiliation}</td>
                        <td style="font-weight:bold">${record.studentName}</td>
                        <td>${startDate}</td>
                        <td>${endDate}</td>
                        <td style="font-weight:bold">${record.schoolDays}일</td>
                        <td style="font-size:8pt; padding:0 1px; overflow:hidden">${record.activityName}</td>
                        <td style="font-size:8pt; padding:0 3px; line-height:1.2; overflow:hidden">${record.location}</td>
                        <td style="font-size:8pt; padding:0 4px; line-height:1.2; overflow:hidden">${record.content}</td>
                        <td>${record.isSubmitted ? 'O' : ''}</td>
                    </tr>`;
            });

            for (let i = 0; i < emptyRowsCount; i++) {
                rowsHtml += `
                    <tr style="height:${rowHeight}">
                        <td>${startIndex + pageRecords.length + i + 1}</td>
                        <td></td><td></td><td></td><td></td>
                        <td></td><td></td><td></td><td></td><td></td>
                    </tr>`;
            }

            pagesHtml += `
                <div class="a4-page">
                    <div class="title ${isFirstPage ? 'p1-title' : 'other-title'}">
                        교외 체험 학습 대장
                    </div>
                    <table class="approval-box">
                        <tr>
                            <td class="label-cell" rowspan="2">결<br/>재</td>
                            <td class="header-cell">담임</td>
                            <td class="header-cell">학년부장</td>
                        </tr>
                        <tr>
                            <td class="sign-cell">${sealImage ? `<img src="${sealImage}" class="box-seal"/>` : ''}</td>
                            <td class="sign-cell"></td>
                        </tr>
                    </table>
                    <div class="header-info ${isFirstPage ? 'p1-header' : 'other-header'}">
                        <div>${year}학년도 ${semester}</div>
                        <div style="display:flex; gap:20px">
                            <span>${grade} 학년</span>
                            <span>${classNumber} 반</span>
                            <span class="seal-cell">담임 : ${teacherName || '       '} (인)
                                ${sealImage ? `<img src="${sealImage}" class="seal-img"/>` : ''}
                            </span>
                        </div>
                    </div>
                    <table>
                        <colgroup>
                            <col style="width:8mm"/>
                            <col style="width:15mm"/>
                            <col style="width:16mm"/>
                            <col style="width:11.5mm"/>
                            <col style="width:11.5mm"/>
                            <col style="width:11mm"/>
                            <col style="width:20mm"/>
                            <col style="width:35mm"/>
                            <col/>
                            <col style="width:11mm"/>
                        </colgroup>
                        <thead>
                            <tr style="height:${headerHeight}; background:#f2f2f2">
                                <th>순</th>
                                <th>소속</th>
                                <th>이름</th>
                                <th>시작일</th>
                                <th>종료일</th>
                                <th style="font-size:9px; line-height:1.2">교육<br/>과정<br/>일수</th>
                                <th>체험활동명</th>
                                <th>장소(기관)</th>
                                <th>활동내용</th>
                                <th style="font-size:9px; line-height:1.2">서류<br/>완결<br/>확인</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                    <div class="footer-note ${isFirstPage ? 'text-[11pt] mt-6mm' : 'text-[10pt] mt-3mm'}">
                        ※ 비고: 기본 체험 학습 일수 초과 시 교감 선생님 확인
                    </div>
                    <div class="page-num">- ${pageIdx + 1} -</div>
                </div>`;
        });

        const win = window.open('', '', 'height=800,width=1000');
        if (!win) return;

        win.document.write(`
            <html>
            <head>
                <title>교외 체험 학습 대장</title>
                <style>
                    @page { size: A4; margin: 0; }
                    body { font-family: "Malgun Gothic", "Dotum", sans-serif; padding:0; margin:0; background:#fff; -webkit-print-color-adjust:exact; }
                    .a4-page {
                        width:210mm; height:297mm; padding:12mm 15mm; box-sizing:border-box;
                        position:relative; page-break-after:always; display:flex; flex-direction:column; overflow:hidden;
                    }
                    .title { text-align:center; font-weight:bold; letter-spacing:1px; color:#000; }
                    .p1-title { font-size:26pt; margin-top:5mm; margin-bottom:12mm; }
                    .other-title { font-size:18pt; margin-top:2mm; margin-bottom:5mm; }
                    .header-info { display:flex; justify-content:space-between; font-weight:bold; align-items:flex-end; color:#000; }
                    .p1-header { font-size:13pt; margin-bottom:4mm; }
                    .other-header { font-size:11pt; margin-bottom:2mm; }
                    table { width:100%; border-collapse:collapse; border:1.5px solid #000; table-layout:fixed; }
                    th, td { border:1px solid #000; padding:2px 1px; text-align:center; font-size:9pt; box-sizing:border-box; word-break:break-all; color:#000; }
                    th { background:#f2f2f2 !important; font-weight:bold; }
                    .footer-note { font-weight:bold; color:#000; }
                    .mt-6mm { margin-top:6mm; font-size:11pt; }
                    .mt-3mm { margin-top:3mm; font-size:10pt; }
                    .page-num { position:absolute; bottom:10mm; left:0; width:100%; text-align:center; font-size:11pt; color:#000; }
                    .seal-cell { position:relative; display:inline-flex; align-items:center; }
                    .seal-img { 
                        position:absolute; 
                        right:-2mm; 
                        top:50%; 
                        transform:translateY(-50%); 
                        width:11mm; 
                        height:14mm; 
                        opacity:0.85; 
                    }
                    .approval-box {
                        position: absolute;
                        top: 15mm;
                        right: 15mm;
                        border: 1.2px solid #000;
                        border-collapse: collapse;
                    }
                    .approval-box td {
                        border: 1px solid #000;
                        text-align: center;
                        font-size: 10pt;
                        padding: 0;
                        color: #000;
                    }
                    .approval-box .label-cell {
                        width: 7mm;
                        font-size: 10pt;
                        padding: 1.5mm 0;
                        line-height: 1.3;
                    }
                    .approval-box .header-cell {
                        height: 7mm;
                        width: 22mm;
                    }
                    .approval-box .sign-cell {
                        height: 12mm;
                        width: 22mm;
                        position: relative;
                    }
                    .box-seal {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 11mm;
                        height: 14mm;
                        opacity: 0.85;
                    }
                </style>
            </head>
            <body>
                ${pagesHtml}
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => {
            win.print();
            win.close();
        }, 500);
    };

    return (
        <div className="experiential-learning-container">
            <div className="header-section">
                <h1>🚌 체험학습 관리</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
                        onClick={() => setIsEditMode(!isEditMode)}
                    >
                        {isEditMode ? '✓ 완료' : '✏️ 편집'}
                    </button>
                    <button className="export-btn" onClick={handleExport}>
                        📥 엑셀 다운로드
                    </button>
                    <button className="export-btn" onClick={handlePrint} style={{ backgroundColor: '#1e293b' }}>
                        🖨️ 인쇄 / PDF
                    </button>
                </div>
            </div>

            {/* 인쇄 설정 */}
            <div className="print-settings">
                <div className="print-setting-item">
                    <label>학기</label>
                    <select
                        value={semester}
                        onChange={(e) => handleSemesterChange(e.target.value)}
                        className="print-setting-input"
                    >
                        <option value="1학기">1학기</option>
                        <option value="2학기">2학기</option>
                    </select>
                </div>
                <div className="print-setting-item">
                    <label>담임교사</label>
                    <input
                        type="text"
                        value={teacherName}
                        onChange={(e) => handleTeacherNameChange(e.target.value)}
                        placeholder="성함 입력"
                        className="print-setting-input"
                    />
                </div>
                <div className="print-setting-divider"></div>
                <div className="print-setting-item">
                    <button
                        className={`filter-toggle-btn ${isFilterEnabled ? 'active' : ''}`}
                        onClick={() => setIsFilterEnabled(!isFilterEnabled)}
                    >
                        📅 {isFilterEnabled ? '기간 필터 ON' : '기간 필터'}
                    </button>
                    {isFilterEnabled && (
                        <>
                            <select
                                value={startMonth}
                                onChange={(e) => setStartMonth(parseInt(e.target.value))}
                                className="print-setting-input"
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                    <option key={m} value={m}>{m}월</option>
                                ))}
                            </select>
                            <span style={{ color: '#92400e', fontWeight: 600 }}>~</span>
                            <select
                                value={endMonth}
                                onChange={(e) => setEndMonth(parseInt(e.target.value))}
                                className="print-setting-input"
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                    <option key={m} value={m}>{m}월</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>
                <div className="print-setting-divider"></div>
                <div className="print-setting-item">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={useSeal}
                            onChange={(e) => handleUseSealChange(e.target.checked)}
                        />
                        <span>도장 포함</span>
                    </label>
                </div>
            </div>
            <div className="info-note">
                <p>💡 <strong>교육과정일수</strong>: 주말과 공휴일을 제외한 실제 수업일수입니다.</p>
                <p>📅 공휴일 관리는 <strong>설정</strong> 메뉴에서 할 수 있습니다.</p>
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th width="60">순</th>
                            <th width="100">소속</th>
                            <th width="100">이름</th>
                            <th width="120">시작일</th>
                            <th width="120">종료일</th>
                            <th width="100">교육과정일수</th>
                            <th width="150">체험활동명</th>
                            <th width="150">장소(기관)</th>
                            <th style={{ minWidth: '200px' }}>활동내용</th>
                            <th width="80">서류완결</th>
                            {isEditMode && <th width="80">삭제</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTripData.map((trip, index) => (
                            <tr key={trip.id}>
                                <td className="text-center">{index + 1}</td>
                                <td className="text-center">{trip.affiliation}</td>
                                <td>{trip.studentName}</td>
                                <td className="text-center">{trip.startFormatted}</td>
                                <td className="text-center">{trip.endFormatted}</td>
                                <td className="text-center"><strong>{trip.schoolDays}일</strong></td>
                                <td>
                                    <input
                                        type="text"
                                        className="cell-input"
                                        value={trip.activityName}
                                        onChange={(e) => handleMetadataChange(trip.id, trip.studentId, 'activityName', e.target.value)}
                                        placeholder="교외체험학습"
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className="cell-input"
                                        value={trip.location}
                                        onChange={(e) => handleMetadataChange(trip.id, trip.studentId, 'location', e.target.value)}
                                        placeholder="장소 입력"
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className="cell-input"
                                        value={trip.content}
                                        onChange={(e) => handleMetadataChange(trip.id, trip.studentId, 'content', e.target.value)}
                                        placeholder="가족동반여행"
                                    />
                                </td>
                                <td className="text-center">
                                    <input
                                        type="checkbox"
                                        checked={trip.isSubmitted}
                                        onChange={(e) => handleMetadataChange(trip.id, trip.studentId, 'isSubmitted', e.target.checked)}
                                    />
                                </td>
                                {isEditMode && (
                                    <td className="text-center">
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDeleteTrip(trip)}
                                            title="삭제"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ExperientialLearning;
