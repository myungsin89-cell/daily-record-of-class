# 🚀 학급일지 배포 및 자동 업데이트(Release) 가이드

본 문서는 다른 컴퓨터에서 작업하거나 다음 버전을 빌드/릴리즈할 때 참고하는 표준 가이드입니다.

---

## 📌 핵심 원칙 (반드시 숙지)

1. **설치 파일명은 무조건 영문으로 생성/업로드**
   - 파일명 형식: `ClassDiary_Setup_v{버전}.exe` (예: `ClassDiary_Setup_v2.0.2.exe`)
   - ⚠️ **이유:** GitHub Release는 한글 파일명을 인식하지 못하고 제거하여 `_v2.0.1_.exe`처럼 깨진 파일명으로 업로드됩니다. 이로 인해 `latest.yml`과 파일명이 불일치하여 자동 업데이트 404 오류가 발생합니다.
   - `package.json`의 `artifactName`에 `"ClassDiary_Setup_v${version}.${ext}"`로 영문 설정되어 있습니다.

2. **GitHub Release에는 항상 2개 파일을 세트로 업로드**
   - ① `ClassDiary_Setup_v{버전}.exe` (실제 설치 프로그램)
   - ② `latest.yml` (버전 및 SHA512 체크섬 메타데이터)
   - ⚠️ `latest.yml`이 누락되면 클라이언트가 새 버전을 감지하지 못합니다.

3. **Release 태그명은 반드시 `v` 접두사 포함**
   - 형식: `v2.0.2`, `v2.0.3` (O) / `2.0.2` (X)
   - Draft(초안)나 Pre-release가 아닌 **정식 Release**로 발행해야 사용자에게 자동 배포됩니다.

---

## 🗺️ 버전별 릴리즈 저장소 로드맵 (저장소 이전 단계)

현재 기존 사용자들이 바라보고 있는 저장소와 신규 저장소(`new-daily`) 간의 매핑 구조입니다.

```
[v2.0.0 & v2.0.1 사용자] 
         │ (내부 app-update.yml이 daily-record-of-class를 바라봄)
         ▼
[v2.0.2 릴리즈 위치: daily-record-of-class]
         │ (v2.0.2 내부 설정: repo = new-daily로 세팅되어 빌드됨)
         ▼
[v2.0.2로 자동 업데이트 완료된 사용자]
         │ (이제 모든 사용자가 new-daily를 바라보게 됨!)
         ▼
[v2.0.3 이후 릴리즈 위치: new-daily]
```

### 📋 릴리즈 대상 저장소 정리

| 배포할 버전 | 빌드 시 `package.json` repo | 업로드할 GitHub 저장소 | 설명 |
| :--- | :--- | :--- | :--- |
| **v2.0.2** | `"new-daily"` | **`daily-record-of-class`** | ⭐️ **저장소 이전 브릿지 버전** (기존 사용자가 업데이트를 받아 `new-daily`로 갈아타게 만듦) |
| **v2.0.3 이상** | `"new-daily"` | **`new-daily`** | 이제 모든 사용자가 `new-daily`를 바라보므로 새 저장소에만 릴리즈 |

---

## 🛠️ 새 버전 릴리즈 단계별 절차 (Step-by-Step)

### 1단계: 버전 번호 올리기
`package.json`의 `version`을 수정합니다:
```json
"version": "2.0.2"
```

### 2단계: 일렉트론 빌드 실행
프로젝트 터미널에서 다음 명령어를 실행합니다:
```bash
npm run electron:build
```
> 빌드가 완료되면 프로젝트 내 `release-build/` 폴더에 아래 파일들이 생성됩니다:
> - `ClassDiary_Setup_v2.0.2.exe`
> - `latest.yml`
> - `ClassDiary_Setup_v2.0.2.exe.blockmap`

### 3단계: GitHub Release 등록
1. 대상 저장소의 **Releases** 페이지로 이동합니다.
   - v2.0.2의 경우: `https://github.com/myungsin89-cell/daily-record-of-class/releases/new`
   - v2.0.3 이상의 경우: `https://github.com/myungsin89-cell/new-daily/releases/new`
2. **Tag version**: `v2.0.2` 입력 (v 필수)
3. **Release title**: `학급일지 v2.0.2 업데이트 안내`
4. **Attach binaries (파일 첨부)**:
   - `release-build/ClassDiary_Setup_v2.0.2.exe` 드래그&드롭
   - `release-build/latest.yml` 드래그&드롭
5. **Publish release** 클릭하여 정식 배포!

---

## 💡 사용자 자동 업데이트 동작 방식
1. 사용자가 앱을 켜면 백그라운드에서 `latest.yml`과 새 설치 파일을 조용히 다운로드합니다.
2. 다운로드가 끝나면 Windows 알림창이 뜹니다:
   *"A new update is ready to install... will be automatically installed on exit"*
3. 사용자가 앱을 종료하면(X 버튼), 자동으로 새 버전이 설치되고 업데이트가 완료됩니다.
