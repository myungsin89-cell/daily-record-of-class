/**
 * 스마트 포스트잇 메모장 콘텐츠 파싱 & 직렬화 유틸리티
 * 
 * 포스트잇 형식:
 * - 상단: [ ] / [x] 체크박스 할 일 목록
 * - 하단: 줄별 ✕ 버튼 없는 일반 텍스트 작성 메모란 (textarea)
 */

export const parseNoteContent = (content = '') => {
    if (content === null || content === undefined) {
        return { checklist: [], plainText: '' };
    }

    const rawLines = content.split('\n');
    const checklist = [];
    const plainLines = [];
    let parsingChecklist = true;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const match = line.match(/^(\s*)\[([ xXvV])\]\s*(.*)$/);
        if (match && parsingChecklist) {
            checklist.push({
                checked: match[2].toLowerCase() === 'x' || match[2].toLowerCase() === 'v',
                text: match[3] || ''
            });
        } else {
            parsingChecklist = false;
            plainLines.push(line);
        }
    }

    return {
        checklist,
        plainText: plainLines.join('\n')
    };
};

export const serializeNoteContent = (checklist = [], plainText = '') => {
    const lines = [];

    if (Array.isArray(checklist) && checklist.length > 0) {
        checklist.forEach(item => {
            lines.push(`[${item.checked ? 'x' : ' '}] ${item.text || ''}`);
        });
    }

    if (plainText !== undefined && plainText !== null && plainText !== '') {
        lines.push(plainText);
    }

    return lines.join('\n');
};
