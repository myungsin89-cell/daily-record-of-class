import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSaveStatus } from '../context/SaveStatusContext';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
    const defaultMenuItems = [
        { id: 'diary', to: '/', label: '다이어리' },
        { id: 'notepad', to: '/notepad', label: '메모장' },
        { id: 'attendance', to: '/attendance', label: '출석 체크' },
        { id: 'journal', to: '/journal-entry', label: '학생 기록' },
        { id: 'grades', to: '/grades', label: '성적 입력' },
        { id: 'budget', to: '/budget', label: '예산 관리' },
        { id: 'assignments', to: '/assignments', label: '제출 체크' },
        { id: 'seating', to: '/seating', label: '자리 배치' },
        { id: 'random-order', to: '/random-order', label: '랜덤 순서' },
    ];

    const [menuItems, setMenuItems] = useState(() => {
        const saved = localStorage.getItem('menuOrder');
        if (saved) {
            const savedItems = JSON.parse(saved);
            // 저장된 항목의 라벨을 최신 기본값으로 동기화
            const updatedItems = savedItems
                .filter(savedItem => defaultMenuItems.some(d => d.id === savedItem.id))
                .map(savedItem => {
                    const defaultItem = defaultMenuItems.find(d => d.id === savedItem.id);
                    return { ...savedItem, label: defaultItem.label, to: defaultItem.to };
                });
            // 새로운 메뉴 항목이 있으면 추가
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

    // 설정에서 메뉴 변경 시 즉시 반영
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

    // Keep main-nav scroll at top when route changes
    useEffect(() => {
        if (mainNavRef.current) {
            mainNavRef.current.scrollTop = 0;
        }
    }, [location.pathname]);

    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

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
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="logo">
                <div className="logo-content">
                    <span>🌿</span> 학급 일지
                </div>
                <button className="close-sidebar-btn" onClick={onClose}>×</button>
            </div>

            <nav className="nav-links">
                {/* Fixed Top Section - Student Management */}
                <div className="top-nav">
                    <NavLink to="/students" className={({ isActive }) => `nav-item fixed-item ${isActive ? 'active' : ''}`}>
                        👥 학생 관리
                    </NavLink>
                </div>

                {/* Separator */}
                <div className="nav-separator"></div>

                {/* Draggable Main Navigation */}
                <div className="main-nav" ref={mainNavRef}>
                    {menuItems.filter(item => !item.hidden).map((item, index) => (
                        <NavLink
                            key={item.id}
                            to={item.to}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                        >
                            <span className="drag-handle">⋮⋮</span>
                            <span className="nav-item-label">{item.label}</span>
                        </NavLink>
                    ))}
                </div>

                {/* Bottom Section - Settings */}
                <div className="bottom-nav">
                    <NavLink to="/settings" className={({ isActive }) => `nav-item settings-item ${isActive ? 'active' : ''}`}>
                        ⚙️ 설정
                    </NavLink>
                    <div className="creator-signature">
                        Made by 초록덕후
                    </div>
                </div>
            </nav>
        </aside>
    );
};

export default Sidebar;
