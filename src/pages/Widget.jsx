import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Widget.css';

const COLOR_OPTIONS = [
    { id: 'yellow', name: '노랑', bg: '#fef08a', border: '#fde047', header: '#eab308', text: '#713f12' },
    { id: 'green', name: '연두', bg: '#dcfce7', border: '#86efac', header: '#22c55e', text: '#14532d' },
    { id: 'blue', name: '하늘', bg: '#dbeafe', border: '#93c5fd', header: '#3b82f6', text: '#1e3a8a' },
    { id: 'pink', name: '핑크', bg: '#fce7f3', border: '#f472b6', header: '#ec4899', text: '#831843' },
    { id: 'orange', name: '주황', bg: '#ffedd5', border: '#fb923c', header: '#f97316', text: '#7c2d12' },
    { id: 'purple', name: '연보라', bg: '#f3e8ff', border: '#c084fc', header: '#a855f7', text: '#581c87' },
];

const Widget = () => {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const targetNoteId = queryParams.get('id');

    const [allNotes, setAllNotes] = useState([]);
    const [currentNote, setCurrentNote] = useState(null);
    const [storageKey, setStorageKey] = useState('');
    const [opacity, setOpacity] = useState(1.0);
    const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
    const [showPalette, setShowPalette] = useState(false);

    // Load target note from localStorage
    useEffect(() => {
        let foundKey = '';
        let foundNote = null;
        let allItems = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('memos_')) {
                try {
                    const items = JSON.parse(localStorage.getItem(key) || '[]');
                    if (Array.isArray(items)) {
                        if (targetNoteId) {
                            const match = items.find(n => String(n.id) === String(targetNoteId));
                            if (match) {
                                foundNote = match;
                                foundKey = key;
                                allItems = items;
                                break;
                            }
                        }
                        if (!foundKey && items.length > 0) {
                            foundKey = key;
                            allItems = items;
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
        }

        if (!foundNote && allItems.length > 0) {
            foundNote = allItems[0];
        }

        setStorageKey(foundKey || 'memos_default');
        setAllNotes(allItems);
        setCurrentNote(foundNote);
    }, [targetNoteId]);

    // Sync updates across windows
    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.onMemoSync) return;

        const cleanup = window.electronAPI.onMemoSync((syncedNote) => {
            if (syncedNote && currentNote && syncedNote.id === currentNote.id) {
                setCurrentNote(syncedNote);
            }
        });

        return () => {
            if (cleanup) cleanup();
        };
    }, [currentNote]);

    // Handle Title / Content change
    const handleFieldChange = (field, value) => {
        if (!currentNote) return;

        const updated = {
            ...currentNote,
            [field]: value,
            updatedAt: new Date().toISOString()
        };
        setCurrentNote(updated);

        // Save to localStorage if key exists
        if (storageKey) {
            const updatedList = allNotes.map(n => n.id === updated.id ? updated : n);
            if (!allNotes.some(n => n.id === updated.id)) {
                updatedList.unshift(updated);
            }
            setAllNotes(updatedList);
            localStorage.setItem(storageKey, JSON.stringify(updatedList));
        }

        // Notify main window via IPC
        if (window.electronAPI && window.electronAPI.syncMemoUpdate) {
            window.electronAPI.syncMemoUpdate(updated);
        }
    };

    // Change Color
    const handleChangeColor = (colorId) => {
        handleFieldChange('color', colorId);
        setShowPalette(false);
    };

    // Opacity toggle (100% -> 80% -> 60% -> 40%)
    const handleToggleOpacity = () => {
        let nextOpacity = 1.0;
        if (opacity === 1.0) nextOpacity = 0.8;
        else if (opacity === 0.8) nextOpacity = 0.6;
        else if (opacity === 0.6) nextOpacity = 0.4;
        else nextOpacity = 1.0;

        setOpacity(nextOpacity);
        if (window.electronAPI && window.electronAPI.setWidgetOpacity) {
            window.electronAPI.setWidgetOpacity(nextOpacity);
        }
    };

    // Toggle Always on Top
    const handleToggleAlwaysOnTop = () => {
        const nextState = !isAlwaysOnTop;
        setIsAlwaysOnTop(nextState);
        if (window.electronAPI && window.electronAPI.setAlwaysOnTop) {
            window.electronAPI.setAlwaysOnTop(nextState);
        }
    };

    // Close Widget
    const handleCloseWidget = () => {
        if (window.electronAPI && window.electronAPI.closeWidgetWindow) {
            window.electronAPI.closeWidgetWindow();
        }
    };

    const colorScheme = COLOR_OPTIONS.find(c => c.id === currentNote?.color) || COLOR_OPTIONS[0];

    return (
        <div 
            className="widget-sticker-container"
            style={{
                backgroundColor: colorScheme.bg,
                color: colorScheme.text,
                border: 'none'
            }}
        >
            {/* 상단 드래그 헤더 */}
            <div className="widget-drag-header">
                <div className="drag-handle-area" title="드래그하여 바탕화면 위치 이동" />

                <div className="widget-controls no-drag">
                    {/* 색상 선택 버튼 */}
                    <button 
                        className={`widget-tool-btn ${showPalette ? 'active' : ''}`}
                        onClick={() => setShowPalette(!showPalette)}
                        title="포스트잇 색상 변경"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
                            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
                            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
                            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.72 1.7-1.61 0-.43-.17-.83-.44-1.13-.27-.3-.44-.7-.44-1.13 0-.89.72-1.61 1.61-1.61h1.9c3.08 0 5.67-2.49 5.67-5.57 0-4.9-4.03-8.95-9-8.95z"></path>
                        </svg>
                    </button>

                    {/* 투명도 조절 버튼 */}
                    <button 
                        className="widget-tool-btn opacity-btn"
                        onClick={handleToggleOpacity}
                        title={`투명도: ${Math.round(opacity * 100)}% (클릭하여 조절)`}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                        </svg>
                        <span>{Math.round(opacity * 100)}%</span>
                    </button>

                    {/* 닫기 버튼 */}
                    <button 
                        className="widget-tool-btn close-btn" 
                        onClick={handleCloseWidget}
                        title="스티커 닫기"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            {/* 색상 팔레트 드롭다운 */}
            {showPalette && (
                <div className="widget-palette-popover no-drag" style={{ background: colorScheme.bg, borderColor: colorScheme.border }}>
                    {COLOR_OPTIONS.map(c => (
                        <button
                            key={c.id}
                            className={`palette-dot ${currentNote?.color === c.id ? 'active' : ''}`}
                            style={{ background: c.bg, borderColor: c.border }}
                            onClick={() => handleChangeColor(c.id)}
                            title={c.name}
                        />
                    ))}
                </div>
            )}

            {/* 본문 콘텐츠 (제목 및 내용 수정가능) */}
            <div className="widget-body-area no-drag">
                <input
                    type="text"
                    className="widget-title-input"
                    value={currentNote?.title || ''}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    placeholder="제목 입력..."
                    style={{ color: colorScheme.text }}
                />

                <textarea
                    className="widget-content-input"
                    value={currentNote?.content || ''}
                    onChange={(e) => handleFieldChange('content', e.target.value)}
                    placeholder="메모 내용을 입력하세요..."
                    style={{ color: colorScheme.text }}
                />
            </div>
        </div>
    );
};

export default Widget;
