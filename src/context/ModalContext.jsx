import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import './ModalContext.css';

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
    const [modalState, setModalState] = useState({
        isOpen: false,
        type: 'alert', // 'alert' | 'confirm' | 'success' | 'error'
        title: '알림',
        message: '',
        confirmText: '확인',
        cancelText: '취소',
        onConfirm: null,
        onCancel: null
    });

    const showAlert = useCallback((message, title = '알림', confirmText = '확인', type = 'success') => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                type,
                title,
                message: String(message),
                confirmText,
                cancelText: '취소',
                onConfirm: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                }
            });
        });
    }, []);

    const showConfirm = useCallback((message, title = '확인', confirmText = '확인', cancelText = '취소') => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                type: 'confirm',
                title,
                message: String(message),
                confirmText,
                cancelText,
                onConfirm: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                }
            });
        });
    }, []);

    // Override browser window.alert and window.confirm seamlessly!
    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (msg) => {
            showAlert(msg, '알림', '확인', 'alert');
        };

        return () => {
            window.alert = originalAlert;
        };
    }, [showAlert]);

    // 선형 아이콘 렌더링
    const renderIcon = () => {
        switch (modalState.type) {
            case 'success':
                return (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                );
            case 'confirm':
                return (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                );
            case 'error':
                return (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                );
            default:
                return (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                );
        }
    };

    return (
        <ModalContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {modalState.isOpen && (
                <div className="global-modal-overlay" onClick={modalState.onCancel}>
                    <div className="global-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="global-modal-header">
                            <div className={`global-modal-icon ${modalState.type}`}>
                                {renderIcon()}
                            </div>
                            <h3>{modalState.title}</h3>
                        </div>
                        <div className="global-modal-body">
                            <p>{modalState.message}</p>
                        </div>
                        <div className="global-modal-footer">
                            {modalState.type === 'confirm' && (
                                <button className="global-modal-cancel-btn" onClick={modalState.onCancel}>
                                    {modalState.cancelText}
                                </button>
                            )}
                            <button className="global-modal-confirm-btn" onClick={modalState.onConfirm} autoFocus>
                                {modalState.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ModalContext.Provider>
    );
};

export const useModal = () => useContext(ModalContext);
