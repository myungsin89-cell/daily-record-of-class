/**
 * Google Analytics 4 (GA4) 이벤트 로깅 유틸리티
 * 측정 ID: G-WFCG0JH9F1
 */

export const trackEvent = (eventName, eventParams = {}) => {
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', eventName, {
                ...eventParams,
                timestamp: new Date().toISOString()
            });
        }
    } catch (e) {
        // 오프라인이거나 GA 차단 환경일 때 에러 무시
        console.debug('[Analytics] Event send skipped:', e);
    }
};

export const trackPageView = (pageName, path = window.location.pathname) => {
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', 'page_view', {
                page_title: pageName,
                page_location: window.location.href,
                page_path: path
            });
        }
    } catch (e) {
        console.debug('[Analytics] PageView send skipped:', e);
    }
};
