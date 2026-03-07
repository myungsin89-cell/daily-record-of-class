import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GOOGLE_CONFIG } from '../config/googleConfig';

const GoogleContext = createContext();

export const useGoogle = () => {
    const context = useContext(GoogleContext);
    if (!context) {
        throw new Error('useGoogle must be used within a GoogleProvider');
    }
    return context;
};

export const GoogleProvider = ({ children }) => {
    const [isGoogleConnected, setIsGoogleConnected] = useState(false);
    const [googleUser, setGoogleUser] = useState(null); // { email, name, picture }
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const tokenClientRef = useRef(null);
    const tokenExpiryRef = useRef(null);

    // 저장된 연결 상태 + 토큰 즉시 복원 (UI 깜빡임 방지)
    useEffect(() => {
        const savedGoogle = localStorage.getItem('google_connected_user');
        if (savedGoogle) {
            try {
                const parsed = JSON.parse(savedGoogle);
                setGoogleUser(parsed);
                setIsGoogleConnected(true); // UI에 연결 상태 즉시 표시
            } catch {
                localStorage.removeItem('google_connected_user');
            }
        }

        // 저장된 토큰 복원 (아직 유효하면 즉시 사용 가능)
        const savedToken = localStorage.getItem('google_access_token');
        const savedExpiry = localStorage.getItem('google_token_expiry');
        if (savedToken && savedExpiry) {
            const expiryTime = parseInt(savedExpiry, 10);
            if (Date.now() < expiryTime - 60000) {
                // 토큰이 아직 유효 (만료 1분 전까지)
                setAccessToken(savedToken);
                tokenExpiryRef.current = expiryTime;
            } else {
                // 만료된 토큰 정리
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_token_expiry');
            }
        }
    }, []);

    // GIS 스크립트 동적 로드 + 자동 무음 재인증
    useEffect(() => {
        const loadGIS = () => {
            return new Promise((resolve, reject) => {
                if (window.google?.accounts?.oauth2) {
                    resolve();
                    return;
                }

                const existingScript = document.querySelector(`script[src="${GOOGLE_CONFIG.GIS_SCRIPT_URL}"]`);
                if (existingScript) {
                    existingScript.addEventListener('load', resolve);
                    existingScript.addEventListener('error', reject);
                    return;
                }

                const script = document.createElement('script');
                script.src = GOOGLE_CONFIG.GIS_SCRIPT_URL;
                script.async = true;
                script.defer = true;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };

        loadGIS()
            .then(() => {
                initTokenClient();
                setIsLoading(false);

                // 저장된 토큰이 유효하면 자동 재인증 불필요
                const savedToken = localStorage.getItem('google_access_token');
                const savedExpiry = localStorage.getItem('google_token_expiry');
                if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry, 10) - 60000) {
                    // 이미 유효한 토큰이 복원됨 — 재인증 스킵
                    return;
                }

                // 토큰이 없거나 만료된 경우, 저장된 사용자가 있으면 무음 재인증 시도
                const savedGoogle = localStorage.getItem('google_connected_user');
                if (savedGoogle && tokenClientRef.current) {
                    try {
                        // prompt: '' → 사용자의 브라우저에 Google 세션이 있으면 팝업 없이 토큰 발급
                        tokenClientRef.current.requestAccessToken({ prompt: '' });
                    } catch (err) {
                        console.warn('자동 재인증 실패 (수동 로그인 필요):', err);
                    }
                }
            })
            .catch((err) => {
                console.error('Failed to load Google Identity Services:', err);
                setError('Google 로그인 서비스를 불러오지 못했습니다.');
                setIsLoading(false);
            });
    }, []);

    // Token Client 초기화
    const initTokenClient = useCallback(() => {
        if (!window.google?.accounts?.oauth2) return;

        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleTokenResponse,
            error_callback: handleTokenError,
        });
    }, []);

    // 토큰 응답 처리
    const handleTokenResponse = useCallback(async (response) => {
        if (response.error) {
            console.error('Google token error:', response.error);
            // 무음 재인증(prompt: '') 실패는 사용자에게 에러를 직접 보여주지 않음 (필요할 때 수동 로그인 유도)
            if (response.error === 'immediate_failed' || response.error === 'interaction_required') {
                console.warn('Silent re-auth failed (manual interaction may be needed later)');
                return;
            }
            setError(`인증 실패: ${response.error}`);
            return;
        }

        setAccessToken(response.access_token);
        setIsGoogleConnected(true);
        setError(null);

        // 토큰 만료 시간 설정 (기본 3600초)
        const expiresIn = response.expires_in || 3600;
        const expiryTime = Date.now() + expiresIn * 1000;
        tokenExpiryRef.current = expiryTime;

        // 토큰을 localStorage에 저장 → 페이지 새로고침 후에도 유지
        localStorage.setItem('google_access_token', response.access_token);
        localStorage.setItem('google_token_expiry', String(expiryTime));

        // 사용자 정보 가져오기
        try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
            });
            if (userInfoRes.ok) {
                const userInfo = await userInfoRes.json();
                const userData = {
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                };
                setGoogleUser(userData);
                localStorage.setItem('google_connected_user', JSON.stringify(userData));
            }
        } catch (err) {
            console.warn('사용자 정보 가져오기 실패:', err);
        }
    }, []);

    // 토큰 에러 처리
    const handleTokenError = useCallback((error) => {
        console.error('Token client error:', error);
        if (error.type === 'popup_closed') {
            // 팝업 닫힘 — 사용자 취소
            return;
        }
        setError('Google 인증 중 오류가 발생했습니다.');
    }, []);

    // Google 계정 연결
    const connectGoogle = useCallback(() => {
        setError(null);
        if (!tokenClientRef.current) {
            setError('Google 로그인 서비스가 준비되지 않았습니다. 페이지를 새로고침 해주세요.');
            return;
        }

        // 토큰이 있고 아직 유효하면 재인증 불필요
        if (accessToken && tokenExpiryRef.current && Date.now() < tokenExpiryRef.current - 60000) {
            return;
        }

        tokenClientRef.current.requestAccessToken(); // 수동 연결 시에는 팝업이 뜨도록 prompt: '' 제거
    }, [accessToken]);

    // Google 계정 연결 해제
    const disconnectGoogle = useCallback(() => {
        if (accessToken) {
            // 토큰 revoke
            window.google?.accounts?.oauth2?.revoke(accessToken, () => {
                console.log('Google token revoked');
            });
        }

        setAccessToken(null);
        setIsGoogleConnected(false);
        setGoogleUser(null);
        setError(null);
        tokenExpiryRef.current = null;
        localStorage.removeItem('google_connected_user');
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
    }, [accessToken]);

    // 유효한 토큰 가져오기 (만료 시 자동 갱신)
    const getValidToken = useCallback(async () => {
        // 토큰이 아직 유효하면 그대로 반환 (만료 5분 전부터 갱신 시도)
        if (accessToken && tokenExpiryRef.current && Date.now() < tokenExpiryRef.current - 300000) {
            return accessToken;
        }

        // 토큰 만료 — 자동 갱신 시도
        return new Promise((resolve, reject) => {
            if (!tokenClientRef.current) {
                reject(new Error('Token client not initialized'));
                return;
            }

            // 기존 callback 일시 교체 후 복원
            const originalCallback = handleTokenResponse;
            tokenClientRef.current.callback = (response) => {
                // 콜백 복원
                tokenClientRef.current.callback = originalCallback;
                originalCallback(response);
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.access_token);
                }
            };

            tokenClientRef.current.requestAccessToken({ prompt: '' });
        });
    }, [accessToken, handleTokenResponse]);

    const value = {
        isGoogleConnected,
        googleUser,
        accessToken,
        isLoading,
        error,
        connectGoogle,
        disconnectGoogle,
        getValidToken,
    };

    return <GoogleContext.Provider value={value}>{children}</GoogleContext.Provider>;
};
