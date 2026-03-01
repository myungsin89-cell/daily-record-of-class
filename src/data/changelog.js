// 업데이트 변경 로그
// 최신 업데이트가 맨 위에 오도록 작성

export const changelog = [
    {
        version: "2025.12.06.2",
        date: "2025-12-06",
        title: "학급 수 확장 및 PWA 업데이트 기능 활성화",
        changes: [
            {
                category: "새 기능",
                items: [
                    "학급 생성 시 반 선택 범위를 10개에서 20개로 확장",
                    "PWA Service Worker 활성화로 실시간 업데이트 알림 기능 작동",
                    "자동 업데이트 감지 및 적용 기능 활성화"
                ]
            },
            {
                category: "개선 사항",
                items: [
                    "대규모 학교 환경 지원 강화",
                    "업데이트 알림이 실제로 작동하도록 수정"
                ]
            }
        ]
    },
    {
        version: "2025.12.06",
        date: "2025-12-06",
        title: "로그인 화면 개선 및 버그 수정",
        changes: [
            {
                category: "UI 개선",
                items: [
                    "로그인 페이지를 한글 '학급일지'로 변경",
                    "기능 배지 추가 (AI 평가, 자동 저장, PWA 지원)",
                    "더 세련된 디자인과 장식 요소 추가"
                ]
            },
            {
                category: "버그 수정",
                items: [
                    "업데이트 알림이 중복으로 표시되는 문제 수정",
                    "데이터 가져오기 시 빠른 새로고침으로 개선",
                    "저장 현황 배너의 아이콘 제거 (텍스트만 표시)"
                ]
            },
            {
                category: "새 기능",
                items: [
                    "PWA 설치 가이드 추가 (브라우저별 설치 방법 안내)",
                    "업데이트 알림 시스템 추가"
                ]
            }
        ]
    },
    {
        version: "2025.12.05",
        date: "2025-12-05",
        title: "설정 페이지 UI 통일 및 데이터 안정성 개선",
        changes: [
            {
                category: "UI 개선",
                items: [
                    "설정 페이지 전체 디자인 통일",
                    "피드백 섹션 추가 (구글 폼 연동)",
                    "API 키 삭제 버튼 디자인 개선"
                ]
            },
            {
                category: "버그 수정",
                items: [
                    "학생 누가기록 데이터 손실 문제 수정",
                    "IndexedDB race condition 해결"
                ]
            }
        ]
    }
];

// 최신 업데이트 정보만 가져오기
export const getLatestUpdate = () => changelog[0];

// 특정 개수의 최신 업데이트 가져오기
export const getRecentUpdates = (count = 3) => changelog.slice(0, count);
