import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { parseNoteContent, serializeNoteContent } from '../utils/noteUtils';
import { openLink, extractUrls, formatUrlDisplay, renderTextWithLinks } from '../utils/linkUtils';
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
    const [activeTextareaWidget, setActiveTextareaWidget] = useState(false);
    const [activeChecklistIdx, setActiveChecklistIdx] = useState(null);

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

    const syncTimerRef = React.useRef(null);

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

        // Notify main window via IPC (Debounced to protect Korean IME composition)
        if (window.electronAPI && window.electronAPI.syncMemoUpdate) {
            if (syncTimerRef.current) {
                clearTimeout(syncTimerRef.current);
            }
            syncTimerRef.current = setTimeout(() => {
                window.electronAPI.syncMemoUpdate(updated);
                syncTimerRef.current = null;
            }, 250);
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

    // 체크리스트 ([ ] ) 추가 핸들러
    const handleInsertChecklist = () => {
        if (!currentNote) return;
        const { checklist, plainText } = parseNoteContent(currentNote.content || '');
        checklist.push({ checked: false, text: '' });
        const newContent = serializeNoteContent(checklist, plainText);
        handleFieldChange('content', newContent);
        setTimeout(() => {
            const nextInput = document.querySelector(`input[data-widget-check="${checklist.length - 1}"]`);
            if (nextInput) nextInput.focus();
        }, 30);
    };

    // 체크리스트 텍스트 수정
    const handleChecklistTextChange = (itemIdx, newText) => {
        if (!currentNote) return;
        const { checklist, plainText } = parseNoteContent(currentNote.content || '');
        if (checklist[itemIdx]) {
            checklist[itemIdx].text = newText;
        }
        handleFieldChange('content', serializeNoteContent(checklist, plainText));
    };

    // 체크리스트 항목 완료/미완료 토글 ([ ] <-> [x])
    const handleToggleChecklistItem = (itemIdx, e) => {
        if (e) e.stopPropagation();
        if (!currentNote) return;
        const { checklist, plainText } = parseNoteContent(currentNote.content || '');
        if (checklist[itemIdx]) {
            checklist[itemIdx].checked = !checklist[itemIdx].checked;
        }
        handleFieldChange('content', serializeNoteContent(checklist, plainText));
    };

    // 체크리스트 항목 개별 삭제
    const handleDeleteChecklistItem = (itemIdx, e) => {
        if (e) e.stopPropagation();
        if (!currentNote) return;
        const { checklist, plainText } = parseNoteContent(currentNote.content || '');
        checklist.splice(itemIdx, 1);
        handleFieldChange('content', serializeNoteContent(checklist, plainText));
    };

    // 체크리스트 키보드 이벤트 (Enter: 다음 항목 / 빈칸 시 일반모드로 전환, Backspace, ArrowUp/Down)
    const handleChecklistKeyDown = (itemIdx, e) => {
        if (!currentNote) return;
        const { checklist, plainText } = parseNoteContent(currentNote.content || '');

        if (e.key === 'Enter') {
            e.preventDefault();
            const currentItem = checklist[itemIdx];
            if (currentItem && currentItem.text.trim() === '') {
                // 빈 체크박스에서 Enter -> 체크박스 삭제 후 일반 작성모드(textarea) 진입!
                checklist.splice(itemIdx, 1);
                handleFieldChange('content', serializeNoteContent(checklist, plainText));
                setTimeout(() => {
                    const textarea = document.querySelector('.widget-content-input');
                    if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(0, 0);
                    }
                }, 20);
            } else {
                // 내용이 있으면 -> 다음 체크박스 줄 생성
                checklist.splice(itemIdx + 1, 0, { checked: false, text: '' });
                handleFieldChange('content', serializeNoteContent(checklist, plainText));
                setTimeout(() => {
                    const nextInput = document.querySelector(`input[data-widget-check="${itemIdx + 1}"]`);
                    if (nextInput) nextInput.focus();
                }, 20);
            }
        } else if (e.key === 'Backspace' && e.target.value === '') {
            e.preventDefault();
            checklist.splice(itemIdx, 1);
            handleFieldChange('content', serializeNoteContent(checklist, plainText));
            setTimeout(() => {
                if (itemIdx > 0) {
                    const prevInput = document.querySelector(`input[data-widget-check="${itemIdx - 1}"]`);
                    if (prevInput) {
                        prevInput.focus();
                        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                    }
                } else {
                    const titleInput = document.querySelector('.widget-title-input');
                    if (titleInput) titleInput.focus();
                }
            }, 20);
        } else if (e.key === 'ArrowUp') {
            if (itemIdx > 0) {
                e.preventDefault();
                const prevInput = document.querySelector(`input[data-widget-check="${itemIdx - 1}"]`);
                if (prevInput) prevInput.focus();
            } else {
                const titleInput = document.querySelector('.widget-title-input');
                if (titleInput) titleInput.focus();
            }
        } else if (e.key === 'ArrowDown') {
            if (itemIdx < checklist.length - 1) {
                e.preventDefault();
                const nextInput = document.querySelector(`input[data-widget-check="${itemIdx + 1}"]`);
                if (nextInput) nextInput.focus();
            } else {
                const textarea = document.querySelector('.widget-content-input');
                if (textarea) {
                    e.preventDefault();
                    textarea.focus();
                    textarea.setSelectionRange(0, 0);
                }
            }
        }
    };

    // 일반 텍스트 수정
    const handlePlainTextChange = (newPlainText) => {
        if (!currentNote) return;
        const { checklist } = parseNoteContent(currentNote.content || '');
        handleFieldChange('content', serializeNoteContent(checklist, newPlainText));
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
                    {/* 체크리스트 추가 버튼 */}
                    <button 
                        className="widget-tool-btn checklist-btn"
                        onClick={handleInsertChecklist}
                        title="체크박스 추가 (클릭 시 추가 · Enter 시 다음 할 일 · 빈칸 Enter 시 일반 메모 전환)"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 11 12 14 22 4"></polyline>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                    </button>

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

                {/* 위젯 본문: 체크리스트 (상단) + 일반 작성 텍스트 영역 (하단) */}
                {(() => {
                    const { checklist, plainText } = parseNoteContent(currentNote?.content || '');

                    return (
                        <div className="widget-body-content-wrap">
                            {/* 1. 체크박스 할 일 목록 */}
                            {checklist.length > 0 && (
                                <div className="widget-direct-checklist-editor">
                                    {checklist.map((item, idx) => {
                                        const itemUrls = extractUrls(item.text);
                                        const hasUrls = itemUrls.length > 0;
                                        const isEditingThisItem = activeChecklistIdx === idx;

                                        return (
                                            <div key={idx} className={`widget-direct-checklist-row ${item.checked ? 'completed' : ''}`}>
                                                <button
                                                    type="button"
                                                    className={`widget-direct-checkbox-btn ${item.checked ? 'checked' : ''}`}
                                                    onClick={(e) => handleToggleChecklistItem(idx, e)}
                                                    title={item.checked ? '완료 취소' : '할 일 완료'}
                                                >
                                                    {item.checked ? (
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    ) : (
                                                        <span className="widget-direct-empty-square" />
                                                    )}
                                                </button>

                                                {(!isEditingThisItem && hasUrls) ? (
                                                    <div
                                                        className={`widget-direct-checklist-text-view ${item.checked ? 'completed' : ''}`}
                                                        onClick={() => setActiveChecklistIdx(idx)}
                                                        style={{ color: colorScheme.text }}
                                                        title="클릭하여 할 일 내용 수정 (링크 클릭 시 바로가기)"
                                                    >
                                                        {renderTextWithLinks(item.text)}
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        className={`widget-direct-checklist-input ${item.checked ? 'completed' : ''}`}
                                                        placeholder="할 일 입력... (Enter: 다음 할 일 / 빈칸 Enter: 일반 메모 전환)"
                                                        value={item.text}
                                                        data-widget-check={idx}
                                                        autoFocus={isEditingThisItem}
                                                        onFocus={() => setActiveChecklistIdx(idx)}
                                                        onBlur={() => setActiveChecklistIdx(null)}
                                                        onChange={(e) => handleChecklistTextChange(idx, e.target.value)}
                                                        onKeyDown={(e) => handleChecklistKeyDown(idx, e)}
                                                        style={{ color: colorScheme.text }}
                                                    />
                                                )}

                                                <button
                                                    type="button"
                                                    className="widget-direct-row-delete-btn"
                                                    onClick={(e) => handleDeleteChecklistItem(idx, e)}
                                                    title="항목 삭제"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 2. 일반 텍스트 작성 모드 (줄별 ✕ 버튼 없는 순수 메모란) */}
                            {(() => {
                                const hasUrls = extractUrls(plainText).length > 0;

                                if (!activeTextareaWidget && hasUrls) {
                                    return (
                                        <div
                                            className={`widget-content-view ${checklist.length > 0 ? 'has-checklist' : ''}`}
                                            onClick={() => setActiveTextareaWidget(true)}
                                            style={{ color: colorScheme.text }}
                                            title="클릭하여 메모 수정 (링크 클릭 시 바로가기)"
                                        >
                                            {renderTextWithLinks(plainText)}
                                        </div>
                                    );
                                }

                                return (
                                    <textarea
                                        autoFocus={activeTextareaWidget}
                                        onFocus={() => setActiveTextareaWidget(true)}
                                        onBlur={() => setActiveTextareaWidget(false)}
                                        className={`widget-content-input ${checklist.length > 0 ? 'has-checklist' : ''}`}
                                        value={plainText}
                                        onChange={(e) => handlePlainTextChange(e.target.value)}
                                        placeholder={checklist.length > 0 ? "메모를 입력하세요..." : "메모를 입력하세요..."}
                                        style={{ color: colorScheme.text }}
                                        onKeyDown={(e) => {
                                            if (checklist.length > 0 && e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
                                                if (e.key === 'ArrowUp' || (e.key === 'Backspace' && plainText === '')) {
                                                    e.preventDefault();
                                                    const lastIdx = checklist.length - 1;
                                                    const lastInput = document.querySelector(`input[data-widget-check="${lastIdx}"]`);
                                                    if (lastInput) {
                                                        lastInput.focus();
                                                        lastInput.setSelectionRange(lastInput.value.length, lastInput.value.length);
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                );
                            })()}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default Widget;
