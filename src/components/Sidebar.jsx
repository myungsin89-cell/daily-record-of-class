import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSaveStatus } from '../context/SaveStatusContext';
import { useClass } from '../context/ClassContext';
import { MenuIcon } from './SidebarIcons';
import { FEEDBACK_FORM_URL } from '../config/feedback';
import FeedbackModal from './FeedbackModal';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose, isCollapsed = false, onToggleCollapse, className = '' }) => {
    const { currentClass } = useClass();
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const defaultMenuItems = [
        { id: 'diary', to: '/dashboard', label: '다이어리' },
        { id: 'notepad', to: '/notepad', label: '메모장' },
        { id: 'attendance', to: '/attendance', label: '출석 체크' },
        { id: 'journal', to: '/journal-entry', label: '학생 기록' },
        { id: 'grades', to: '/grades', label: '성적 입력' },
        { id: 'budget', to: '/budget', label: '예산 관리' },
        { id: 'assignments', to: '/assignments', label: '제출 체크' },
        { id: 'seating', to: '/seating', label: '자리 배치' },
        { id: 'random-order', to: '/random-order', label: '랜덤 순서' },
        { id: 'class-role', to: '/class-role', label: '일인 일역' },
    ];

    const [menuItems, setMenuItems] = useState(() => {
        const saved = localStorage.getItem('menuOrder');
        if (saved) {
            const savedItems = JSON.parse(saved);
            const updatedItems = savedItems
                .filter(savedItem => defaultMenuItems.some(d => d.id === savedItem.id))
                .map(savedItem => {
                    const defaultItem = defaultMenuItems.find(d => d.id === savedItem.id);
                    return { ...savedItem, label: defaultItem.label, to: defaultItem.to };
                });
            const newItems = defaultMenuItems.filter(
                defaultItem => !updatedItems.some(item => item.id === defaultItem.id)
            );
            if (newItems.length > 0) {
                return [...updatedItems, ...newItems];
            }
            return updatedItems;
        }
        return defaultMenuItems;
    });

    const [draggedItem, setDraggedItem] = useState(null);
    const mainNavRef = useRef(null);
    const location = useLocation();
    const { getTimeText, isSaving, lastSaved } = useSaveStatus();

    useEffect(() => {
        localStorage.setItem('menuOrder', JSON.stringify(menuItems));
    }, [menuItems]);

    useEffect(() => {
        const handleMenuUpdate = () => {
            const saved = localStorage.getItem('menuOrder');
            if (saved) {
                const savedItems = JSON.parse(saved);
                const updatedItems = savedItems
                    .filter(savedItem => defaultMenuItems.some(d => d.id === savedItem.id))
                    .map(savedItem => {
                        const defaultItem = defaultMenuItems.find(d => d.id === savedItem.id);
                        return { ...savedItem, label: defaultItem.label, to: defaultItem.to };
                    });
                const newItems = defaultMenuItems.filter(
                    defaultItem => !updatedItems.some(item => item.id === defaultItem.id)
                );
                setMenuItems(newItems.length > 0 ? [...updatedItems, ...newItems] : updatedItems);
            }
        };
        window.addEventListener('menuOrderUpdated', handleMenuUpdate);
        return () => window.removeEventListener('menuOrderUpdated', handleMenuUpdate);
    }, []);

    useEffect(() => {
        if (mainNavRef.current) {
            mainNavRef.current.scrollTop = 0;
        }
    }, [location.pathname]);

    const handleDragStart = (e, index) => {
        if (isCollapsed) return; // Disable drag reorder in collapsed mode
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (isCollapsed || draggedItem === null || draggedItem === index) return;

        const newItems = [...menuItems];
        const draggedItemContent = newItems[draggedItem];
        newItems.splice(draggedItem, 1);
        newItems.splice(index, 0, draggedItemContent);

        setDraggedItem(index);
        setMenuItems(newItems);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''} ${className}`} style={{ position: 'relative' }}>
            {/* Collapse Toggle Button - Top Right of Gray Sidebar */}
            {onToggleCollapse && (
                <button
                    className="collapse-sidebar-btn"
                    onClick={onToggleCollapse}
                    title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                >
                    {isCollapsed ? '>' : '<'}
                </button>
            )}

            <div className="logo" style={{ padding: isCollapsed ? '0.75rem 0.2rem' : '0.85rem 2.5rem 0.85rem 0.85rem', display: 'flex', alignItems: 'center', minHeight: '48px', boxSizing: 'border-box' }}>
                <div className="logo-content" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>🌿</span>
                    {!isCollapsed && <span className="logo-title-text" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', WebkitTextFillColor: '#1e293b' }}>학급 일지</span>}
                </div>
            </div>

            <nav className="nav-links">
                {/* Draggable Main Navigation */}
                <div className="main-nav" ref={mainNavRef}>
                    {menuItems.filter(item => !item.hidden).map((item, index) => (
                        <NavLink
                            key={item.id}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            draggable={!isCollapsed}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            title={isCollapsed ? item.label : undefined}
                        >
                            {!isCollapsed && <span className="drag-handle">⋮⋮</span>}
                            <span className="nav-item-icon">
                                <MenuIcon id={item.id} size={19} />
                            </span>
                            {!isCollapsed && <span className="nav-item-label">{item.label}</span>}
                        </NavLink>
                    ))}
                </div>

                {/* Bottom Section - Student Registration & Feedback */}
                <div className="bottom-nav">
                    <NavLink 
                        to="/students" 
                        className={({ isActive }) => `nav-item student-reg-item ${isActive ? 'active' : ''}`}
                        title={isCollapsed ? '학생 등록' : undefined}
                    >
                        <span className="nav-item-icon">
                            <MenuIcon id="students" size={19} />
                        </span>
                        {!isCollapsed && <span className="nav-item-label">학생 등록</span>}
                    </NavLink>

                    {/* 개선 의견 보내기 (선형 SVG 아이콘 + 클린 텍스트) */}
                    <button
                        type="button"
                        className="nav-item feedback-btn-item"
                        onClick={() => {
                            try {
                                if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
                                    window.gtag('event', 'click_feedback_button');
                                }
                            } catch (e) {}
                            setShowFeedbackModal(true);
                        }}
                        title={isCollapsed ? '개선 의견 보내기' : undefined}
                    >
                        <span className="nav-item-icon">
                            <MenuIcon id="feedback" size={19} />
                        </span>
                        {!isCollapsed && <span className="nav-item-label">개선 의견 보내기</span>}
                    </button>

                    {!isCollapsed && (
                        <div className="creator-signature">
                            Made by 초록덕후
                        </div>
                    )}
                </div>
            </nav>

            {/* 개선 의견 보내기 전용 세련된 그린 모달 */}
            <FeedbackModal 
                isOpen={showFeedbackModal} 
                onClose={() => setShowFeedbackModal(false)} 
            />
        </aside>
    );
};

export default Sidebar;
