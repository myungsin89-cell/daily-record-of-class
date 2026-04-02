import React, { useState, useMemo } from 'react';
import { useStudentContext } from '../context/StudentContext';
import { useClass } from '../context/ClassContext';
import { groupConsecutiveDates, formatDateKorean, calculateSchoolDays } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import './AbsenceReport.css';

const AbsenceReport = () => {
    const { students, attendance, fieldTrips, saveFieldTripMetadata, updateAttendance, holidays } = useStudentContext();
    const { currentClass } = useClass();
    const { user } = useAuth();
    const [sortConfig, setSortConfig] = useState({ key: 'application', direction: 'asc' });
    const [isEditMode, setIsEditMode] = useState(false);

    // 인쇄용 설정 (localStorage 저장)
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

    // Process data to find absence records
    const absenceData = useMemo(() => {
        const records = [];

        students.forEach(student => {
            const sickDates = [];
            const otherDates = [];

            Object.keys(attendance).forEach(date => {
                const status = typeof attendance[date][student.id] === 'object'
                    ? attendance[date][student.id].status
                    : attendance[date][student.id];

                if (status === 'sick') sickDates.push(date);
                if (status === 'other') otherDates.push(date);
            });

            const processGroups = (dates, type) => {
                const grouped = groupConsecutiveDates(dates, holidays);

                grouped.forEach(group => {
                    const tripId = `${student.id}_${group.startDate}_${group.endDate}`;
                    const metadata = fieldTrips[student.id]?.[tripId] || {};

                    const schoolDays = calculateSchoolDays(group.startDate, group.endDate, holidays);
                    const startFormatted = formatDateKorean(group.startDate);
                    const endFormatted = formatDateKorean(group.endDate);

                    let grade = '?';
                    let classNumber = '?';

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
                    const affiliation = `${grade}-${classNumber}-${student.attendanceNumber}`;

                    // Get the reason from the first date of the group (assuming similar reason for consecutive days)
                    // or join unique reasons if they differ.
                    const reasons = [...new Set(group.allDates.map(date => {
                        const entry = attendance[date]?.[student.id];
                        return (typeof entry === 'object' ? entry.reason : '') || '';
                    }).filter(r => r))].join(', ');

                    records.push({
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
                        // Metadata mapping:
                        // activityName -> Used for 'Type' display (sick/other) usually, but here we enforce type based on status
                        type: type === 'sick' ? '질병' : '기타',
                        location: metadata.location || reasons || '', // Maps to 'Reason/Disease', prioritizes metadata then attendance reason
                        content: metadata.content || '',   // Maps to 'Note'
                        isSubmitted: metadata.isSubmitted || false
                    });
                });
            };

            if (sickDates.length > 0) processGroups(sickDates, 'sick');
            if (otherDates.length > 0) processGroups(otherDates, 'other');
        });

        // Sort records
        return records.sort((a, b) => {
            return a.startDate.localeCompare(b.startDate) || a.attendanceNumber - b.attendanceNumber;
        });
    }, [students, attendance, fieldTrips, holidays, currentClass, sortConfig]);

    // 월 범위 필터링
    const filteredAbsenceData = useMemo(() => {
        if (!isFilterEnabled) return absenceData;
        return absenceData.filter(record => {
            const month = parseInt(record.startDate.split('-')[1]);
            return month >= startMonth && month <= endMonth;
        });
    }, [absenceData, startMonth, endMonth, isFilterEnabled]);

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

    const handleDeleteRecord = (record) => {
        const confirmMessage = `${record.studentName}의 결석 기록 (${record.dateRange})을 삭제하시겠습니까?\n\n출석 체크에서도 모두 제거됩니다.`;

        if (!window.confirm(confirmMessage)) {
            return;
        }

        // 1. Delete attendance records
        record.allDates.forEach(date => {
            updateAttendance(date, record.studentId, null);
        });

        // 2. Delete metadata
        const studentTrips = fieldTrips[record.studentId] || {};
        const updatedMetadata = { ...studentTrips };
        delete updatedMetadata[record.id];

        saveFieldTripMetadata(record.studentId, updatedMetadata);
    };

    const handleExport = () => {
        const exportData = filteredAbsenceData.map((record, index) => ({
            '순': index + 1,
            '소속': record.affiliation,
            '이름': record.studentName,
            '시작일': record.startFormatted,
            '종료일': record.endFormatted,
            '일수': record.schoolDays,
            '결석종류': record.type,
            '사유(질병명)': record.location,
            '비고': record.content,
            '증빙서류': record.isSubmitted ? 'O' : 'X'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "결석계관리대장");

        XLSX.writeFile(wb, `결석계관리대장_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handlePrint = () => {
        const ROWS_PAGE_1 = 18;
        const ROWS_PAGE_OTHER = 25;

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

        const allRecords = filteredAbsenceData;
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
                        <td>${record.type}</td>
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
                        결석계 관리 대장
                    </div>
                    <div class="header-info ${isFirstPage ? 'p1-header' : 'other-header'}">
                        <div>${year}학년도 ${semester}</div>
                        <div style="display:flex; gap:20px">
                            <span>${grade} 학년</span>
                            <span>${classNumber} 반</span>
                            <span>담임 : ${teacherName || '       '} (인)</span>
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
                            <col style="width:18mm"/>
                            <col/> 
                            <col style="width:30mm"/>
                            <col style="width:11mm"/>
                        </colgroup>
                        <thead>
                            <tr style="height:${headerHeight}; background:#f2f2f2">
                                <th>순</th>
                                <th>소속</th>
                                <th>이름</th>
                                <th>시작일</th>
                                <th>종료일</th>
                                <th style="font-size:9px; line-height:1.2">결석<br/>일수</th>
                                <th>종류</th>
                                <th>사유 (질병명)</th>
                                <th>비고</th>
                                <th style="font-size:9px; line-height:1.2">증빙<br/>서류</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                    <div class="footer-note ${isFirstPage ? 'text-[11pt] mt-6mm' : 'text-[10pt] mt-3mm'}">
                        ※ 비고: 법정 감염병은 출석인정 처리됨
                    </div>
                    <div class="page-num">- ${pageIdx + 1} -</div>
                </div>`;
        });

        const win = window.open('', '', 'height=800,width=1000');
        if (!win) return;

        win.document.write(`
            <html>
            <head>
                <title>결석계 관리 대장</title>
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

    // 결석 신고서(담임확인서) 인쇄 (단일 또는 전체)
    const handlePrintForm = (recordsInput) => {
        const records = Array.isArray(recordsInput) ? recordsInput : [recordsInput];
        if (records.length === 0) return;

        let grade = '?';
        let classNumber = '?';

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

        // 도장 이미지 생성 함수
        const generateSealImage = (name) => {
            const canvas = document.createElement('canvas');
            canvas.width = 120; // 가로를 조금 더 늘림
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            const sealText = name ? (name.length <= 3 ? name + '인' : name) : '인';
            const centerX = 60;
            const centerY = 60;
            const radiusX = 42; // 타원 가로 반지름
            const radiusY = 52; // 타원 세로 반지름 (약간 길게)
            const color = '#c40000'; // 진한 인주 색상

            // 1. 테두리 그리기 (약간의 불규칙성 추가)
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.beginPath();

            // 단순 타원 대신 점들을 연결하여 미세한 떨림 효과
            for (let i = 0; i <= 360; i += 5) {
                const angle = (i * Math.PI) / 180;
                const jitter = (Math.random() - 0.5) * 0.8; // 미세한 떨림
                const x = centerX + (radiusX + jitter) * Math.cos(angle);
                const y = centerY + (radiusY + jitter) * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // 2. 글씨 쓰기
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
                drawTextWithJitter(sealText[0], centerX - 18, centerY - 18, 20); // 좌상
                drawTextWithJitter(sealText[1], centerX + 18, centerY - 18, 20); // 우상
                drawTextWithJitter(sealText[2], centerX - 18, centerY + 18, 20); // 좌하
                drawTextWithJitter(sealText[3], centerX + 18, centerY + 18, 20); // 우하
            } else {
                drawTextWithJitter(sealText, centerX, centerY, 24);
            }

            // 3. 질감(노이즈) 추가 - 잉크가 덜 묻거나 번진 느낌
            for (let i = 0; i < 150; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * radiusY;
                const x = centerX + (Math.random() - 0.5) * radiusX * 2.2;
                const y = centerY + (Math.random() - 0.5) * radiusY * 2.2;

                // 타원 내부 또는 근처에만 점 찍기
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

            // 일부 하얀 점 (잉크가 안 묻은 곳)
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

        // 결석 종료일 다음 첫 등교일 계산
        const getNextSchoolDay = (endDateStr) => {
            const [ey, em, ed] = endDateStr.split('-').map(Number);
            let d = new Date(ey, em - 1, ed);
            d.setDate(d.getDate() + 1); // 종료일 다음날부터
            const holidaySet = new Set(
                (holidays || []).map(h => (typeof h === 'string' ? h : h.date))
            );
            while (true) {
                const dow = d.getDay(); // 0=일, 6=토
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (dow !== 0 && dow !== 6 && !holidaySet.has(key)) break;
                d.setDate(d.getDate() + 1);
            }
            return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
        };

        // 각 레코드마다 1페이지씩 생성
        let pagesHtml = '';
        records.forEach((record) => {
            const startParts = record.startDate.split('-');
            const endParts = record.endDate.split('-');
            const sYear = startParts[0];
            const sMonth = parseInt(startParts[1]);
            const sDay = parseInt(startParts[2]);
            const eYear = endParts[0];
            const eMonth = parseInt(endParts[1]);
            const eDay = parseInt(endParts[2]);
            const reason = record.location || '';
            const nextDay = getNextSchoolDay(record.endDate);
            const tYear = nextDay.year;
            const tMonth = nextDay.month;
            const tDay = nextDay.day;

            pagesHtml += `
                <div class="a4-page">
                    <div class="title">결 석 신 고 서(담임확인서)</div>

                    <!-- 결재표: 절대배치로 PDF 좌표 그대로 -->
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

                    <div class="student-info">
                        제  ${grade}  학년  ${classNumber}  반  ${record.attendanceNumber}  번 이름 (  ${record.studentName}  )
                    </div>

                    <div class="confirm-text">
                        위 학생은 다음과 같은 사유로 결석하였음을 확인합니다.
                    </div>

                    <div class="section-area">
                        <p class="s-item">1. 결석기간:  ${sYear}년  ${sMonth}월  ${sDay}일  ~  ${eYear}년  ${eMonth}월  ${eDay}일  (${record.schoolDays}일간)</p>

                        <p class="s-item">2. 결석사유:  ${reason}</p>

                        <p class="s-item">3. 학부모 의견서</p>
                        <p class="s-sub">학부모 소견: </p>

                        <p class="s-item">4. 담임교사 확인서</p>
                        <p class="s-sub">담임소견: 위 학생은 ( ${reason || '    '} )으로 인하여 결석함</p>
                    </div>

                    <p class="notice"> ※ 3일 이상 연속으로 병결 시 의사 진단서 또는 소견서 제출</p>

                    <div class="date-line">${tYear}년    ${tMonth}월   ${tDay}일</div>

                    <div class="teacher-line">
                        <span>학부모/(담임교사) :</span>
                        <span class="teacher-name">${teacherName || ''}</span>
                        <span class="seal-cell">
                            (인)
                            ${sealImage ? `<img src="${sealImage}" class="bottom-seal"/>` : ''}
                        </span>
                    </div>
                </div>
            `;
        });

        const win = window.open('', '', 'height=900,width=800');
        if (!win) return;
        win.document.write(`
            <html>
            <head>
                <title>결석 신고서</title>
                <style>
                    @page { size: A4; margin: 0; }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: "HYGyeonyMyeongjo", "HY견명조", "Batang", "바탕", serif;
                        color: #000;
                        -webkit-print-color-adjust: exact;
                    }
                    .a4-page {
                        width: 210mm;
                        height: 297mm;
                        position: relative;
                        page-break-after: always;
                        overflow: hidden;
                    }
                    .a4-page:last-child {
                        page-break-after: auto;
                    }

                    /* 제목: PDF y=98.8pt → 34.9mm, 수평 가운데 */
                    .title {
                        position: absolute;
                        top: 32mm;
                        left: 0; right: 0;
                        text-align: center;
                        font-size: 26pt;
                        letter-spacing: 3px;
                    }

                    /* 결재표: PDF bbox 369~552 x, 141~204 y */
                    /* x: 369pt→130mm from left, right edge ~195mm → right: 15mm */
                    /* y: 141pt→49.7mm */
                    .approval-box {
                        position: absolute;
                        top: 48mm;
                        right: 15mm;
                        border: 1.5px solid #000;
                        border-collapse: collapse;
                    }
                    .approval-box td {
                        border: 1px solid #000;
                        text-align: center;
                        font-size: 12pt;
                        padding: 0;
                    }
                    .approval-box .label-cell {
                        width: 8mm;
                        font-size: 12pt;
                        padding: 2mm 1mm;
                        line-height: 1.5;
                    }
                    .approval-box .header-cell {
                        height: 8.5mm;
                        width: 28mm;
                        font-size: 12pt;
                    }
                    .approval-box .sign-cell {
                        height: 14mm;
                        width: 28mm;
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
                    .bottom-seal {
                        position: absolute;
                        left: 50%;
                        top: 50%;
                        transform: translate(-50%, -50%);
                        width: 11mm;
                        height: 14mm;
                        opacity: 0.85;
                    }
                    .seal-cell {
                        position: relative;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 15mm;
                    }

                    /* 학생정보: 오른쪽 정렬 */
                    .student-info {
                        position: absolute;
                        top: 85mm;
                        left: 0; right: 15mm;
                        text-align: right;
                        font-size: 16pt;
                    }
                    /* 확인문구: PDF y=296.5pt → 104.6mm */
                    .confirm-text {
                        position: absolute;
                        top: 103mm;
                        left: 0; right: 0;
                        text-align: center;
                        font-size: 16pt;
                    }

                    /* 섹션 영역: PDF 첫 항목 y=371.7pt → 131.2mm, x=42.5pt → 15mm */
                    .section-area {
                        position: absolute;
                        top: 128mm;
                        left: 15mm;
                        right: 15mm;
                        font-size: 15pt;
                    }
                    .s-item {
                        margin-bottom: 11mm;
                        line-height: 1.4;
                    }
                    .s-sub {
                        margin-top: -9mm;
                        margin-bottom: 5mm;
                        padding-left: 8.5mm;
                        line-height: 1.4;
                    }

                    /* ※ 안내: PDF y=611.4pt → 215.8mm, x=71.5pt → 25mm */
                    .notice {
                        position: absolute;
                        top: 214mm;
                        left: 15mm;
                        right: 15mm;
                        font-size: 15pt;
                    }

                    /* 날짜: PDF y=659.4pt → 232.7mm, 가운데 */
                    .date-line {
                        position: absolute;
                        top: 231mm;
                        left: 0; right: 0;
                        text-align: center;
                        font-size: 15pt;
                    }

                    /* 담임교사: PDF y=731.3pt → 258.1mm */
                    .teacher-line {
                        position: absolute;
                        top: 257mm;
                        left: 0; right: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        font-size: 15pt;
                        gap: 0;
                    }
                    .teacher-name {
                        display: inline-block;
                        min-width: 50mm;
                        text-align: center;
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
        }, 800);
    };

    return (
        <div className="absence-report-container">
            <div className="header-section">
                <h1>🏥 결석계 관리</h1>
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
                    <button className="export-btn" onClick={() => handlePrintForm(filteredAbsenceData)} style={{ backgroundColor: '#1e40af' }}>
                        🖨️ 인쇄/PDF
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
                <div class="print-setting-divider"></div>
                <div class="print-setting-item">
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

            <div className="info-note" style={{ borderColor: '#ef4444', backgroundColor: '#fef2f2' }}>
                <p style={{ color: '#b91c1c' }}>💡 <strong>질병/기타 결석</strong>만 표시됩니다. (미인정, 체험학습 제외)</p>
                <small>출석부에서 '질병' 또는 '기타'로 체크된 날짜가 자동으로 집계됩니다.</small>
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
                            <th width="80">일수</th>
                            <th width="80">종류</th>
                            <th style={{ minWidth: '150px' }}>사유 (질병명)</th>
                            <th width="150">비고</th>
                            <th width="80">증빙서류</th>
                            <th width="80">신고서</th>
                            {isEditMode && <th width="80">삭제</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAbsenceData.map((record, index) => (
                            <tr key={record.id}>
                                <td className="text-center">{index + 1}</td>
                                <td className="text-center">{record.affiliation}</td>
                                <td>{record.studentName}</td>
                                <td className="text-center">{record.startFormatted}</td>
                                <td className="text-center">{record.endFormatted}</td>
                                <td className="text-center"><strong>{record.schoolDays}일</strong></td>
                                <td className="text-center">
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        backgroundColor: record.type === '질병' ? '#fee2e2' : '#f3f4f6',
                                        color: record.type === '질병' ? '#dc2626' : '#4b5563',
                                        fontWeight: 'bold'
                                    }}>
                                        {record.type}
                                    </span>
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className="cell-input"
                                        value={record.location}
                                        onChange={(e) => handleMetadataChange(record.id, record.studentId, 'location', e.target.value)}
                                        placeholder={record.type === '질병' ? '질병명 입력' : '사유 입력'}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className="cell-input"
                                        value={record.content}
                                        onChange={(e) => handleMetadataChange(record.id, record.studentId, 'content', e.target.value)}
                                        placeholder="비고"
                                    />
                                </td>
                                <td className="text-center">
                                    <input
                                        type="checkbox"
                                        checked={record.isSubmitted}
                                        onChange={(e) => handleMetadataChange(record.id, record.studentId, 'isSubmitted', e.target.checked)}
                                    />
                                </td>
                                <td className="text-center">
                                    <button
                                        className="export-btn"
                                        onClick={() => handlePrintForm(record)}
                                        title="결석 신고서 인쇄"
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            minWidth: 'unset',
                                            backgroundColor: '#1e40af'
                                        }}
                                    >
                                        📄
                                    </button>
                                </td>
                                {isEditMode && (
                                    <td className="text-center">
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDeleteRecord(record)}
                                            title="삭제"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {filteredAbsenceData.length === 0 && (
                            <tr>
                                <td colSpan={isEditMode ? 12 : 11} className="empty-state">
                                    등록된 결석 기록이 없습니다.<br />
                                    <small>출석부에서 '질병' 또는 '기타' 결석을 체크하면 자동으로 표시됩니다.</small>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AbsenceReport;
