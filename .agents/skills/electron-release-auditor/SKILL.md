---
name: electron-release-auditor
description: 학급일지 Electron 앱의 릴리즈 빌드, 패키징 검수, 자동 업데이트 무결성(app-update.yml, latest.yml, blockmap, NSIS 중복 아이콘 방지) 및 GitHub Release 배포 전과정을 완벽하게 검증하고 수행하는 전용 릴리즈 감사 스킬. '릴리즈', '배포', '패키징', 'electron build', '업데이트 검수' 요청 시 활성화.
---

# 학급일지 Electron 릴리즈 & 패키징 무결성 감사 스킬 (electron-release-auditor)

학급일지 앱의 릴리즈 시 **자동 업데이트가 누락되거나 실패하는 사고를 100% 방지**하고, 바탕화면 아이콘 중복 없이 완벽한 설치/업데이트 바이너리를 생성하여 배포하는 표준 운영 절차(SOP)입니다.

---

## 🛑 릴리즈 3대 절대 원칙 (Failure-Proof Rules)

1. **자동 업데이트 설정(`publish`) 누락 절대 금지**:
   - `package.json`의 `publish`가 반드시 `owner: "myungsin89-cell"`, `repo: "daily-record-of-class"`로 고정되어 있어야 합니다.
   - 빌드 후 `win-unpacked/resources/app-update.yml` 파일이 존재하는지 반드시 물리적으로 검증합니다.
2. **바탕화면 아이콘 중복 방지 스크립트(`build/installer.nsh`) 포함 필수**:
   - NSIS 빌드 시 구버전 바로가기(`학급일지*.lnk`, `class-diary*.lnk`)를 청소하는 `installer.nsh`가 누락되지 않아야 합니다.
3. **GitHub Release 3종 필수 에셋 업로드 확인**:
   - `ClassDiary_Setup_v${version}.exe`
   - `latest.yml` (자동 업데이트 감지 핵심)
   - `ClassDiary_Setup_v${version}.exe.blockmap` (초고속 차분 업데이트 지도)

---

## 📋 릴리즈 6단계 표준 감사 프로세스

### 1단계: 사전 설정 검증 (Pre-Build Audit)
릴리즈 빌드 전 반드시 아래 파일들을 검사합니다:

1. **`package.json`**:
   * `version`: 직전 버전보다 올바르게 증가했는지 확인 (예: `2.0.2` ➔ `2.0.3`)
   * `publish`:
     ```json
     "publish": {
       "provider": "github",
       "owner": "myungsin89-cell",
       "repo": "daily-record-of-class"
     }
     ```
   * `nsis`:
     ```json
     "nsis": {
       "oneClick": true,
       "allowToChangeInstallationDirectory": false,
       "createDesktopShortcut": "always",
       "createStartMenuShortcut": true,
       "shortcutName": "학급일지",
       "artifactName": "ClassDiary_Setup_v${version}.${ext}",
       "include": "build/installer.nsh"
     }
     ```
2. **`build/installer.nsh`**:
   * `customInstall` 및 `customUnInstall` 매크로에서 `SetShellVarContext current` / `SetShellVarContext all`로 구버전 바로가기를 삭제하고 단일 바로가기를 생성하는지 확인.
3. **`src/data/changelog.js` & `src/changelog.js`**:
   * 새 버전에 대한 한글 변경 내역이 최상단에 정확하게 작성되었는지 확인.
4. **`electron/main.js`**:
   * `autoUpdater` 대화상자 알림 모달 리스너(`update-available`, `update-downloaded`, `error`)가 온전히 유지되고 있는지 확인.

---

### 2단계: 프론트엔드 빌드 검증
```bash
npm run build
```
* Vite 빌드 오류(컴파일 에러, 깨진 import)가 없는지 1차 확인합니다.

---

### 3단계: Electron 설치 파일 패키징
```bash
npm run electron:build
```
* `electron-builder`가 정상 종료(exit code 0)되는지 확인합니다.

---

### 4단계: 빌드 산출물 무결성 물리 검증 (Post-Build Audit)
출력 폴더(`C:\Users\소미네\Desktop\학급일지_설치파일_출력\`)에서 다음 항목을 스크립트로 직접 검증합니다:

1. **필수 3대 파일 존재 여부 및 용량 확인**:
   * `ClassDiary_Setup_v${version}.exe` (약 200~500MB)
   * `latest.yml` (정상적인 sha512 해시 및 파일명 기재 확인)
   * `ClassDiary_Setup_v${version}.exe.blockmap`
2. **언팩 바이너리의 `app-update.yml` 존재 확인 (핵심!)**:
   * 경로: `C:\Users\소미네\Desktop\학급일지_설치파일_출력\win-unpacked\resources\app-update.yml`
   * 내용에 `owner: myungsin89-cell`, `repo: daily-record-of-class`가 명시되어 있는지 파일 읽기 도구로 반드시 확인합니다.

---

### 5단계: Git 커밋 & 태그 생성
```bash
git add .
git commit -m "release: v${version} - [주요 변경 내용 요약]"
git tag -a v${version} -m "Release v${version}"
```

---

### 6단계: GitHub Release 배포 및 라이브 검증
1. **GitHub Releases 등록 안내**:
   * 릴리즈 태그(`v${version}`), 타이틀, 마크다운 기호가 정돈된 본문 제공.
   * `Setup.exe`, `latest.yml`, `.blockmap` 3종 에셋 첨부 안내.
2. **라이브 API 검증**:
   * 배포 후 `https://api.github.com/repos/myungsin89-cell/daily-record-of-class/releases`를 조회하여 `latest.yml`과 바이너리가 정상 활성화되었는지 사용자에게 최종 확인 보고합니다.
