/**
 * Google OAuth & API Configuration
 */

export const GOOGLE_CONFIG = {
    CLIENT_ID: '948591543680-7rrpt2236vpafp248p8phlt3fenk344m.apps.googleusercontent.com',

    // Drive: appDataFolder 또는 일반 파일 접근, Sheets: 스프레드시트 생성/편집
    SCOPES: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
    ].join(' '),

    // Google Identity Services 라이브러리 URL
    GIS_SCRIPT_URL: 'https://accounts.google.com/gsi/client',

    // Drive 백업 파일 설정
    DRIVE_BACKUP_FOLDER: '학급일지_백업',
    DRIVE_BACKUP_MIME: 'application/json',

    // API 엔드포인트
    DRIVE_API: 'https://www.googleapis.com/drive/v3',
    DRIVE_UPLOAD_API: 'https://www.googleapis.com/upload/drive/v3',
    SHEETS_API: 'https://sheets.googleapis.com/v4/spreadsheets',
};
