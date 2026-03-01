/**
 * Google Drive & Sheets API Service
 * 
 * 학급일지 데이터의 Drive 백업 및 Sheets 내보내기를 담당합니다.
 */

import { GOOGLE_CONFIG } from '../config/googleConfig';

// ==================== Google Drive API ====================

/**
 * 학급일지 백업 전용 폴더를 찾거나 생성합니다.
 */
async function getOrCreateBackupFolder(accessToken) {
    const { DRIVE_API } = GOOGLE_CONFIG;
    const folderName = GOOGLE_CONFIG.DRIVE_BACKUP_FOLDER;

    // 기존 폴더 검색
    const searchRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!searchRes.ok) {
        throw new Error(`Drive 폴더 검색 실패: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // 폴더 생성
    const createRes = await fetch(`${DRIVE_API}/files`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        }),
    });

    if (!createRes.ok) {
        throw new Error(`Drive 폴더 생성 실패: ${createRes.status}`);
    }

    const folder = await createRes.json();
    return folder.id;
}

/**
 * JSON 데이터를 Google Drive에 업로드합니다.
 */
export async function uploadToDrive(accessToken, data, fileName) {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const { DRIVE_UPLOAD_API } = GOOGLE_CONFIG;

    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
    };

    const jsonContent = JSON.stringify(data, null, 2);

    // Multipart upload
    const boundary = '---ClassDiaryBoundary';
    const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        jsonContent,
        `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Drive 업로드 실패: ${res.status} - ${errorText}`);
    }

    return await res.json();
}

/**
 * Drive 백업 파일 목록을 조회합니다.
 */
export async function listDriveBackups(accessToken) {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const { DRIVE_API } = GOOGLE_CONFIG;

    const query = `'${folderId}' in parents and trashed=false and mimeType='application/json'`;
    const res = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
        throw new Error(`Drive 목록 조회 실패: ${res.status}`);
    }

    const data = await res.json();
    return data.files || [];
}

/**
 * Drive에서 백업 파일을 다운로드합니다.
 */
export async function downloadFromDrive(accessToken, fileId) {
    const { DRIVE_API } = GOOGLE_CONFIG;

    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        throw new Error(`Drive 다운로드 실패: ${res.status}`);
    }

    return await res.json();
}

/**
 * Drive 백업 파일을 삭제합니다.
 */
export async function deleteDriveBackup(accessToken, fileId) {
    const { DRIVE_API } = GOOGLE_CONFIG;

    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        throw new Error(`Drive 파일 삭제 실패: ${res.status}`);
    }

    return true;
}

// ==================== Google Sheets API ====================

/**
 * 새 스프레드시트를 생성합니다.
 */
export async function createSpreadsheet(accessToken, title, sheetNames = ['Sheet1']) {
    const { SHEETS_API } = GOOGLE_CONFIG;

    const body = {
        properties: { title },
        sheets: sheetNames.map(name => ({
            properties: { title: name },
        })),
    };

    const res = await fetch(SHEETS_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`시트 생성 실패: ${res.status} - ${errorText}`);
    }

    return await res.json();
}

/**
 * 스프레드시트에 데이터를 작성합니다.
 */
export async function writeToSheet(accessToken, spreadsheetId, range, values) {
    const { SHEETS_API } = GOOGLE_CONFIG;

    const res = await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values }),
        }
    );

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`시트 작성 실패: ${res.status} - ${errorText}`);
    }

    return await res.json();
}

/**
 * 스프레드시트에 서식을 적용합니다. (헤더 볼드, 자동 너비 등)
 */
async function formatSheet(accessToken, spreadsheetId, sheetId, headerRowCount = 1, columnCount = 10) {
    const { SHEETS_API } = GOOGLE_CONFIG;

    const requests = [
        // 헤더 행 볼드 + 배경색
        {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: headerRowCount,
                    startColumnIndex: 0,
                    endColumnIndex: columnCount,
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 },
                        textFormat: { bold: true },
                        horizontalAlignment: 'CENTER',
                    },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
        },
        // 자동 열 너비
        {
            autoResizeDimensions: {
                dimensions: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: columnCount,
                },
            },
        },
        // 헤더 고정
        {
            updateSheetProperties: {
                properties: {
                    sheetId,
                    gridProperties: { frozenRowCount: headerRowCount },
                },
                fields: 'gridProperties.frozenRowCount',
            },
        },
    ];

    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
    });
}

// ==================== 학급일지 전용 내보내기 ====================

/**
 * 학생 기록(journals)을 Google Sheets로 내보냅니다.
 */
export async function exportJournalsToSheet(accessToken, students, journals, className = '학급') {
    const title = `${className} 학생기록_${new Date().toLocaleDateString('ko-KR')}`;

    // 시트 생성
    const spreadsheet = await createSpreadsheet(accessToken, title, ['학생 기록']);

    // 데이터 구성
    const header = ['번호', '이름', '날짜', '기록 내용'];
    const rows = [];

    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    sortedStudents.forEach(student => {
        const studentJournals = journals[student.id] || [];
        if (studentJournals.length === 0) {
            rows.push([student.attendanceNumber, student.name, '', '(기록 없음)']);
        } else {
            studentJournals.forEach(entry => {
                const date = entry.date || entry.createdAt?.split('T')[0] || '';
                const content = entry.content || entry.text || '';
                rows.push([student.attendanceNumber, student.name, date, content]);
            });
        }
    });

    // 데이터 쓰기
    await writeToSheet(accessToken, spreadsheet.spreadsheetId, '학생 기록!A1', [header, ...rows]);

    // 서식 적용
    const sheetId = spreadsheet.sheets[0].properties.sheetId;
    await formatSheet(accessToken, spreadsheet.spreadsheetId, sheetId, 1, header.length);

    return {
        spreadsheetId: spreadsheet.spreadsheetId,
        spreadsheetUrl: spreadsheet.spreadsheetUrl,
    };
}

/**
 * 성적 데이터를 Google Sheets로 내보냅니다.
 */
export async function exportGradesToSheet(accessToken, students, gradeData, criteriaTemplates, gradeGroups, className = '학급') {
    const title = `${className} 성적관리_${new Date().toLocaleDateString('ko-KR')}`;
    const grades = Object.values(gradeData);

    if (grades.length === 0) {
        throw new Error('내보낼 성적 데이터가 없습니다.');
    }

    // 그룹별로 시트 나누기
    const groupNames = [...new Set(grades.map(g => g.groupName || '기타'))];
    const spreadsheet = await createSpreadsheet(accessToken, title, groupNames);

    const sortedStudents = [...students].sort((a, b) => a.attendanceNumber - b.attendanceNumber);

    for (let gIdx = 0; gIdx < groupNames.length; gIdx++) {
        const groupName = groupNames[gIdx];
        const groupGrades = grades.filter(g => (g.groupName || '기타') === groupName);

        if (groupGrades.length === 0) continue;

        // 헤더: 번호, 이름, [평가1, 평가2, ...]
        const header = ['번호', '이름', ...groupGrades.map(g => g.assessmentName)];

        // 각 학생 행
        const rows = sortedStudents.map(student => {
            const row = [student.attendanceNumber, student.name];

            groupGrades.forEach(grade => {
                const rawValue = grade.studentGrades?.[student.id];
                const criteria = criteriaTemplates.find(c => c.id === grade.criteriaId);

                if (criteria?.evaluationType === 'score') {
                    row.push(rawValue ?? '');
                } else if (criteria?.labels) {
                    // 단계 → 레이블로 변환
                    const labelIndex = criteria.labels.length - (rawValue || 0);
                    row.push(criteria.labels[labelIndex] ?? rawValue ?? '');
                } else {
                    row.push(rawValue ?? '');
                }
            });

            return row;
        });

        // 데이터 쓰기
        const sheetName = groupName;
        await writeToSheet(accessToken, spreadsheet.spreadsheetId, `${sheetName}!A1`, [header, ...rows]);

        // 서식 적용
        const sheetId = spreadsheet.sheets[gIdx].properties.sheetId;
        await formatSheet(accessToken, spreadsheet.spreadsheetId, sheetId, 1, header.length);
    }

    return {
        spreadsheetId: spreadsheet.spreadsheetId,
        spreadsheetUrl: spreadsheet.spreadsheetUrl,
    };
}
