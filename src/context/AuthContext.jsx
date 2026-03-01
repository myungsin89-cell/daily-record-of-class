import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 페이지 로드 시 localStorage에서 사용자 정보 확인
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const login = (username) => {
        const userData = {
            username,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(userData));
        setUser(userData);
    };

    const logout = () => {
        // 사용자별 currentClass 삭제
        if (user) {
            const currentClassKey = `${user.username}_currentClass`;
            localStorage.removeItem(currentClassKey);
        }
        localStorage.removeItem('currentUser');
        setUser(null);
    };

    const value = {
        user,
        login,
        logout,
        loading
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
