import React from 'react';

/**
 * URL 감지 정규식 (http://, https://, www. 지원)
 */
export const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+[^<.,:;"')\]\s])/gi;

/**
 * 안전한 외부 링크 열기 핸들러
 * - Electron 환경: 시스템 기본 브라우저(Chrome, Edge 등)로 열기
 * - 웹 환경: window.open 새 탭으로 열기
 */
export const openLink = (url, e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!url) return;

    let targetUrl = url.trim();
    if (/^www\./i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
    } else if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
    }

    try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
            window.electronAPI.openExternal(targetUrl);
        } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
    } catch (err) {
        console.error('Failed to open link:', err);
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
};

/**
 * 텍스트 내의 모든 고유 URL 추출
 */
export const extractUrls = (text) => {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(URL_REGEX);
    if (!matches) return [];
    return Array.from(new Set(matches.map(m => m.trim())));
};

/**
 * URL 표시용 간결한 라벨 생성 (예: youtube.com/watch...)
 */
export const formatUrlDisplay = (url) => {
    if (!url) return '';
    try {
        let clean = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        if (clean.length > 28) {
            return clean.slice(0, 26) + '...';
        }
        return clean;
    } catch {
        return url.length > 28 ? url.slice(0, 26) + '...' : url;
    }
};

/**
 * 텍스트 내의 링크를 클릭 가능한 <a> 태그로 자동 변환하여 렌더링
 */
export const renderTextWithLinks = (text, options = {}) => {
    if (!text || typeof text !== 'string') return text;

    const parts = text.split(URL_REGEX);
    if (parts.length <= 1) return text;

    return parts.map((part, idx) => {
        if (part && (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('www.'))) {
            return React.createElement(
                'a',
                {
                    key: idx,
                    href: part.startsWith('www.') ? `https://${part}` : part,
                    className: options.className || "auto-link-text",
                    onClick: (e) => openLink(part, e),
                    title: `${part} (클릭 시 새 창에서 열기)`,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: {
                        color: options.color || '#16a34a',
                        textDecoration: 'underline',
                        textUnderlineOffset: '3px',
                        cursor: 'pointer',
                        wordBreak: 'break-all',
                        fontWeight: 500,
                        ...options.style
                    }
                },
                part
            );
        }
        return part;
    });
};
