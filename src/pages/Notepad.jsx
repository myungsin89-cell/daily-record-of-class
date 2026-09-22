import React, { useState, useEffect, useRef } from 'react';
import Button from '../components/Button';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import { parseNoteContent, serializeNoteContent } from '../utils/noteUtils';
import { openLink, extractUrls, formatUrlDisplay, renderTextWithLinks } from '../utils/linkUtils';
import './Notepad.css';

const COLOR_OPTIONS = [
    { id: 'yellow', name: '노랑', bg: '#fef08a', border: '#fde047', header: '#eab308', text: '#713f12' },
    { id: 'green', name: '연두', bg: '#dcfce7', border: '#86efac', header: '#22c55e', text: '#14532d' },
    { id: 'blue', name: '하늘', bg: '#dbeafe', border: '#93c5fd', header: '#3b82f6', text: '#1e3a8a' },
    { id: 'pink', name: '핑크', bg: '#fce7f3', border: '#f472b6', header: '#ec4899', text: '#831843' },
    { id: 'orange', name: '주황', bg: '#ffedd5', border: '#fb923c', header: '#f97316', text: '#7c2d12' },
    { id: 'purple', name: '연보라', bg: '#f3e8ff', border: '#c084fc', header: '#a855f7', text: '#581c87' },
];

const Notepad = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { updateSaveStatus } = useSaveStatus();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

    const [notes, setNotes] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal state for Create / Edit
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState(null); // null = new, string = edit
    const [selectedColor, setSelectedColor] = useState('yellow');
    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalIsPinned, setModalIsPinned] = useState(false);
    const [activeTextareaNoteId, setActiveTextareaNoteId] = useState(null);
    const [activeChecklistKey, setActiveChecklistKey] = useState(null);

    const syncDebounceTimers = useRef({});
    const containerRef = useRef(null);

    // 포스트잇 본래 규격(~260px) 유지 반응형 컬럼 수 계산
    const POSTIT_TARGET_WIDTH = 260;
    const POSTIT_GAP = 20;

    const [columnCount, setColumnCount] = useState(() => {
        if (typeof window === 'undefined') return 3;
        const w = window.innerWidth;
        if (w < 560) return 1;
        return Math.max(1, Math.floor((w + POSTIT_GAP) / (POSTIT_TARGET_WIDTH + POSTIT_GAP)));
    });

    useEffect(() => {
        const updateColumns = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.offsetWidth;
            if (w < 560) {
                setColumnCount(1);
            } else {
                const cols = Math.max(1, Math.floor((w + POSTIT_GAP) / (POSTIT_TARGET_WIDTH + POSTIT_GAP)));
                setColumnCount(cols);
            }
        };

        updateColumns();
        const observer = new ResizeObserver(updateColumns);
        if (containerRef.current) observer.observe(containerRef.current);
        window.addEventListener('resize', updateColumns);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateColumns);
        };
    }, []);

    // 포스트잇 높이 추정 함수 (빈 공간 자동 채움 메이슨리용)
    const estimateNoteHeight = (note) => {
        let h = 85; // 헤더(핀, 메뉴) + 날짜/시간 + 패딩
        const { checklist, plainText } = parseNoteContent(note?.content || '');
        if (checklist.length > 0) {
            h += checklist.length * 36;
        }
        if (plainText) {
            const lines = plainText.split('\n');
            let lineCount = 0;
            lines.forEach(line => {
                lineCount += Math.max(1, Math.ceil((line.length || 1) / 22));
            });
            h += Math.max(50, lineCount * 24);
        }
        return Math.max(180, h);
    };

    useEffect(() => {
        const key = `memos_${classId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const migrated = parsed.map(n => ({
                    color: n.color || 'yellow',
                    isPinned: n.isPinned || false,
                    ...n
                }));
                setNotes(migrated);
            } catch (err) {
                console.error('Failed to parse notes:', err);
                setNotes([]);
            }
        } else {
            setNotes([]);
        }
        setIsLoaded(true);
    }, [classId]);

    useEffect(() => {
        if (!isLoaded) return;
        const key = `memos_${classId}`;
        localStorage.setItem(key, JSON.stringify(notes));
        if (notes.length > 0) updateSaveStatus();
    }, [notes, isLoaded, classId, updateSaveStatus]);

    const [activePaletteNoteId, setActivePaletteNoteId] = useState(null);

    const handleInlineNoteChange = (id, field, value) => {
        setNotes(prev => prev.map(note => {
            if (note.id === id) {
                const updated = { ...note, [field]: value, updatedAt: new Date().toISOString() };
                
                // Debounce electron IPC sync to prevent IME Korean stutter
                if (window.electronAPI) {
                    if (syncDebounceTimers.current[id]) {
                        clearTimeout(syncDebounceTimers.current[id]);
                    }
                    syncDebounceTimers.current[id] = setTimeout(() => {
                        window.electronAPI.syncMemoUpdate(updated);
                        delete syncDebounceTimers.current[id];
                    }, 250);
                }
                return updated;
            }
            return note;
        }));
    };

    const handleCreateQuickNote = () => {
        const newNote = {
            id: Date.now().toString(),
            title: '',
            content: '',
            color: 'yellow',
            isPinned: false,
            createdAt: new Date().toISOString()
        };
        setNotes([newNote, ...notes]);
        if (window.electronAPI) {
            window.electronAPI.syncMemoUpdate(newNote);
        }
    };

    const handleTogglePin = (id, e) => {
        if (e) e.stopPropagation();
        setNotes(prev => prev.map(note => {
            if (note.id === id) {
                const updated = { ...note, isPinned: !note.isPinned };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
    };

    const handleDeleteNote = (id, e) => {
        if (e) e.stopPropagation();
        setNotes(prev => prev.filter(note => note.id !== id));
    };

    // 체크리스트 ([ ] ) 추가 핸들러 - 상단 체크 버튼 클릭 시 새 체크박스 줄 추가 & 포커스
    const handleInsertChecklist = (id) => {
        let newIdx = 0;
        setNotes(prev => prev.map(note => {
            if (note.id === id) {
                const { checklist, plainText } = parseNoteContent(note.content || '');
                checklist.push({ checked: false, text: '' });
                newIdx = checklist.length - 1;
                const newContent = serializeNoteContent(checklist, plainText);
                const updated = { ...note, content: newContent, updatedAt: new Date().toISOString() };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
        setTimeout(() => {
            const nextInput = document.querySelector(`input[data-note-check="${id}_${newIdx}"]`);
            if (nextInput) nextInput.focus();
        }, 30);
    };

    // 체크리스트 텍스트 변경
    const handleChecklistTextChange = (noteId, itemIdx, newText) => {
        setNotes(prev => prev.map(note => {
            if (note.id === noteId) {
                const { checklist, plainText } = parseNoteContent(note.content || '');
                if (checklist[itemIdx]) {
                    checklist[itemIdx].text = newText;
                }
                const updated = { ...note, content: serializeNoteContent(checklist, plainText), updatedAt: new Date().toISOString() };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
    };

    // 체크리스트 항목 완료/미완료 토글
    const handleToggleChecklistItem = (noteId, itemIdx, e) => {
        if (e) e.stopPropagation();
        setNotes(prev => prev.map(note => {
            if (note.id === noteId) {
                const { checklist, plainText } = parseNoteContent(note.content || '');
                if (checklist[itemIdx]) {
                    checklist[itemIdx].checked = !checklist[itemIdx].checked;
                }
                const updated = { ...note, content: serializeNoteContent(checklist, plainText), updatedAt: new Date().toISOString() };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
    };

    // 체크리스트 항목 개별 삭제 (✕ 버튼)
    const handleDeleteChecklistItem = (noteId, itemIdx, e) => {
        if (e) e.stopPropagation();
        setNotes(prev => prev.map(note => {
            if (note.id === noteId) {
                const { checklist, plainText } = parseNoteContent(note.content || '');
                checklist.splice(itemIdx, 1);
                const updated = { ...note, content: serializeNoteContent(checklist, plainText), updatedAt: new Date().toISOString() };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
    };

    // 체크리스트 키보드 이벤트 (Enter: 다음 항목 추가 / 빈칸 시 일반모드로 전환, Backspace, 방향키)
    const handleChecklistKeyDown = (noteId, itemIdx, e) => {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        const { checklist, plainText } = parseNoteContent(note.content || '');

        if (e.key === 'Enter') {
            e.preventDefault();
            const currentItem = checklist[itemIdx];
            if (currentItem && currentItem.text.trim() === '') {
                // 빈 체크박스에서 엔터 한번 더 누르면 -> 체크박스 삭제 후 일반 작성모드로 진입!
                checklist.splice(itemIdx, 1);
                const newContent = serializeNoteContent(checklist, plainText);
                handleInlineNoteChange(noteId, 'content', newContent);
                setTimeout(() => {
                    const textarea = document.querySelector(`textarea[data-note-textarea="${noteId}"]`);
                    if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(0, 0);
                    }
                }, 20);
            } else {
                // 작성 중 엔터 누르면 -> 자연스럽게 다음 체크박스 할 일 추가!
                checklist.splice(itemIdx + 1, 0, { checked: false, text: '' });
                const newContent = serializeNoteContent(checklist, plainText);
                handleInlineNoteChange(noteId, 'content', newContent);
                setTimeout(() => {
                    const nextInput = document.querySelector(`input[data-note-check="${noteId}_${itemIdx + 1}"]`);
                    if (nextInput) nextInput.focus();
                }, 20);
            }
        } else if (e.key === 'Backspace' && e.target.value === '') {
            e.preventDefault();
            checklist.splice(itemIdx, 1);
            const newContent = serializeNoteContent(checklist, plainText);
            handleInlineNoteChange(noteId, 'content', newContent);
            setTimeout(() => {
                if (itemIdx > 0) {
                    const prevInput = document.querySelector(`input[data-note-check="${noteId}_${itemIdx - 1}"]`);
                    if (prevInput) {
                        prevInput.focus();
                        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                    }
                } else {
                    const titleInput = document.querySelector(`input[data-note-title="${noteId}"]`);
                    if (titleInput) titleInput.focus();
                }
            }, 20);
        } else if (e.key === 'ArrowUp') {
            if (itemIdx > 0) {
                e.preventDefault();
                const prevInput = document.querySelector(`input[data-note-check="${noteId}_${itemIdx - 1}"]`);
                if (prevInput) prevInput.focus();
            } else {
                const titleInput = document.querySelector(`input[data-note-title="${noteId}"]`);
                if (titleInput) {
                    e.preventDefault();
                    titleInput.focus();
                }
            }
        } else if (e.key === 'ArrowDown') {
            if (itemIdx < checklist.length - 1) {
                e.preventDefault();
                const nextInput = document.querySelector(`input[data-note-check="${noteId}_${itemIdx + 1}"]`);
                if (nextInput) nextInput.focus();
            } else {
                const textarea = document.querySelector(`textarea[data-note-textarea="${noteId}"]`);
                if (textarea) {
                    e.preventDefault();
                    textarea.focus();
                    textarea.setSelectionRange(0, 0);
                }
            }
        }
    };

    // 일반 텍스트 변경 (textarea)
    const handlePlainTextChange = (noteId, newPlainText) => {
        setNotes(prev => prev.map(note => {
            if (note.id === noteId) {
                const { checklist } = parseNoteContent(note.content || '');
                const newContent = serializeNoteContent(checklist, newPlainText);
                const updated = { ...note, content: newContent, updatedAt: new Date().toISOString() };
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
                }
                return updated;
            }
            return note;
        }));
    };

    // Filter + Sort by Pin state & Date
    const filteredNotes = notes.filter(n => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
    });

    const sortedNotes = [...filteredNotes].sort((a, b) => {
        const aPinned = a.isPinned ? 1 : 0;
        const bPinned = b.isPinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned; // Pinned notes first
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const formatDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) +
            ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.onMemoSync) return;
        const cleanup = window.electronAPI.onMemoSync((syncedNote) => {
            if (syncedNote) {
                setNotes(prev => {
                    const exists = prev.some(n => n.id === syncedNote.id);
                    if (exists) {
                        return prev.map(n => n.id === syncedNote.id ? syncedNote : n);
                    } else {
                        return [syncedNote, ...prev];
                    }
                });
            }
        });
        return () => {
            if (cleanup) cleanup();
        };
    }, []);

    const pinnedCount = notes.filter(n => n.isPinned).length;

    return (
        <div className="notepad-container" ref={containerRef}>
            {/* 상단 헤더 */}
            <div className="notepad-header">
                <div className="header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className="postit-count-badge">총 {notes.length}개</span>
                    {pinnedCount > 0 && (
                        <span className="postit-pinned-badge">고정 {pinnedCount}개</span>
                    )}
                    <span
                        className="postit-tip-pill"
                        title="체크박스 사용법: 상단 체크(☑) 클릭 시 추가 ➔ Enter로 다음 할 일 추가 ➔ 빈칸에서 Enter 시 일반 메모로 전환"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 11 12 14 22 4"></polyline>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                        <span>Enter: 다음 할 일 · 빈칸 Enter: 메모 전환</span>
                    </span>
                </div>
                <div style={{ flexShrink: 0 }}>
                    <button
                        className="add-postit-btn"
                        onClick={handleCreateQuickNote}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        새 포스트잇 추가
                    </button>
                </div>
            </div>

            {/* 검색 영역 */}
            <div className="notepad-search-card">
                <div className="search-input-wrapper">
                    <span className="search-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="포스트잇 제목 또는 내용 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="postit-search-input"
                    />
                    {searchQuery && (
                        <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                            ✕
                        </button>
                    )}
                </div>
                {searchQuery && (
                    <div className="search-meta">
                        검색 결과: <strong>{sortedNotes.length}</strong>건
                    </div>
                )}
            </div>

            {/* 원래 포스트잇 규격 유지 & 빈 공간 자동 채움 스마트 메이슨리 */}
            {(() => {
                const cols = Math.max(1, columnCount);
                const columnsData = Array.from({ length: cols }, () => []);
                const columnHeights = Array.from({ length: cols }, () => 0);

                sortedNotes.forEach((note) => {
                    // 현재 누적 높이가 가장 낮은 열을 찾아 배치 (빈 공간 자동 채움)
                    let minIdx = 0;
                    let minH = columnHeights[0];
                    for (let i = 1; i < cols; i++) {
                        if (columnHeights[i] < minH) {
                            minH = columnHeights[i];
                            minIdx = i;
                        }
                    }
                    columnsData[minIdx].push(note);
                    columnHeights[minIdx] += estimateNoteHeight(note) + POSTIT_GAP;
                });

                return (
                    <div className="notes-masonry-wrapper">
                        {columnsData.map((colNotes, colIdx) => (
                            <div key={colIdx} className="notes-masonry-col">
                                {colNotes.map((note) => {
                                    const colorScheme = COLOR_OPTIONS.find(c => c.id === note.color) || COLOR_OPTIONS[0];

                                    return (
                                        <div
                                            key={note.id}
                                            className={`postit-card ${note.isPinned ? 'is-pinned' : ''}`}
                                            style={{
                                                backgroundColor: colorScheme.bg,
                                                color: colorScheme.text,
                                                border: 'none'
                                            }}
                                        >
                                            {/* 포스트잇 헤더 */}
                                            <div className="postit-header" style={{ borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                                                {note.isPinned ? (
                                                    <button
                                                        className="postit-pin-btn active"
                                                        onClick={(e) => handleTogglePin(note.id, e)}
                                                        title="상단 고정 해제"
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <line x1="12" y1="17" x2="12" y2="22"></line>
                                                            <path d="M5 17h14l-1.5-6h-11z"></path>
                                                            <path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"></path>
                                                        </svg>
                                                        <span className="pinned-label">고정됨</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="postit-pin-btn"
                                                        onClick={(e) => handleTogglePin(note.id, e)}
                                                        title="상단 고정하기"
                                                        style={{ color: colorScheme.text }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <line x1="12" y1="17" x2="12" y2="22"></line>
                                                            <path d="M5 17h14l-1.5-6h-11z"></path>
                                                            <path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"></path>
                                                        </svg>
                                                    </button>
                                                )}

                                                <div className="postit-actions" style={{ position: 'relative' }}>
                                                    {/* 체크리스트 추가 버튼 */}
                                                    <button
                                                        className="postit-action-btn checklist-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleInsertChecklist(note.id);
                                                        }}
                                                        title="체크박스 추가 (클릭 시 추가 · Enter 시 다음 할 일 · 빈칸 Enter 시 일반 메모 전환)"
                                                        style={{ color: colorScheme.text }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="9 11 12 14 22 4"></polyline>
                                                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                                        </svg>
                                                    </button>

                                                    {/* 색상 팝오버 토글 버튼 */}
                                                    <button
                                                        className={`postit-action-btn palette-btn ${activePaletteNoteId === note.id ? 'active' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActivePaletteNoteId(activePaletteNoteId === note.id ? null : note.id);
                                                        }}
                                                        title="포스트잇 색상 변경"
                                                        style={{ color: colorScheme.text }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.72 1.7-1.61 0-.43-.17-.83-.44-1.13-.27-.3-.44-.7-.44-1.13 0-.89.72-1.61 1.61-1.61h1.9c3.08 0 5.67-2.49 5.67-5.57 0-4.9-4.03-8.95-9-8.95z"></path>
                                                        </svg>
                                                    </button>

                                                    {/* 상단 버튼 클릭시에만 뜨는 6색 팝오버 */}
                                                    {activePaletteNoteId === note.id && (
                                                        <div className="card-palette-popover">
                                                            {COLOR_OPTIONS.map(c => (
                                                                <button
                                                                    key={c.id}
                                                                    type="button"
                                                                    className={`card-palette-dot ${note.color === c.id ? 'active' : ''}`}
                                                                    style={{ background: c.bg, borderColor: c.border }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleInlineNoteChange(note.id, 'color', c.id);
                                                                        setActivePaletteNoteId(null);
                                                                    }}
                                                                    title={c.name}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}

                                                    <button
                                                        className="postit-action-btn sticker-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (window.electronAPI && window.electronAPI.openWidgetWindow) {
                                                                window.electronAPI.openWidgetWindow(note.id);
                                                            } else {
                                                                alert('바탕화면 스티커 띄우기는 학급일지 PC 데스크톱 앱(Electron)에서 지원되는 기능입니다.');
                                                            }
                                                        }}
                                                        title="이 포스트잇을 바탕화면 스티커로 띄우기"
                                                        style={{ color: colorScheme.text }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                                            <line x1="8" y1="21" x2="16" y2="21"></line>
                                                            <line x1="12" y1="17" x2="12" y2="21"></line>
                                                        </svg>
                                                    </button>
                                                    <button
                                                        className="postit-action-btn delete-btn"
                                                        onClick={(e) => handleDeleteNote(note.id, e)}
                                                        title="포스트잇 삭제"
                                                        style={{ color: colorScheme.text }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 카드 내부 직접 자유 편집 제목 인풋 */}
                                            <input
                                                type="text"
                                                className="inline-postit-title-input"
                                                placeholder="제목 입력 (선택)..."
                                                value={note.title || ''}
                                                data-note-title={note.id}
                                                onChange={(e) => handleInlineNoteChange(note.id, 'title', e.target.value)}
                                                style={{ color: colorScheme.text }}
                                            />

                                            {/* 카드 본문: 체크박스 할 일 목록(상단) + 일반 작성 텍스트 영역(하단) */}
                                            {(() => {
                                                const { checklist, plainText } = parseNoteContent(note.content || '');

                                                return (
                                                    <div className="postit-card-content-wrap">
                                                        {/* 1. 체크박스 할 일 목록 */}
                                                        {checklist.length > 0 && (
                                                            <div className="postit-direct-checklist-editor">
                                                                {checklist.map((item, itemIdx) => {
                                                                    const itemUrls = extractUrls(item.text);
                                                                    const hasUrls = itemUrls.length > 0;
                                                                    const isEditingThisItem = activeChecklistKey === `${note.id}_${itemIdx}`;

                                                                    return (
                                                                        <div
                                                                            key={itemIdx}
                                                                            className={`direct-checklist-row ${item.checked ? 'completed' : ''}`}
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                className={`direct-checkbox-btn ${item.checked ? 'checked' : ''}`}
                                                                                onClick={(e) => handleToggleChecklistItem(note.id, itemIdx, e)}
                                                                                title={item.checked ? '완료 취소' : '할 일 완료'}
                                                                            >
                                                                                {item.checked ? (
                                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                                                    </svg>
                                                                                ) : (
                                                                                    <span className="direct-empty-square" />
                                                                                )}
                                                                            </button>

                                                                            {(!isEditingThisItem && hasUrls) ? (
                                                                                <div
                                                                                    className={`direct-checklist-text-view ${item.checked ? 'completed' : ''}`}
                                                                                    onClick={() => setActiveChecklistKey(`${note.id}_${itemIdx}`)}
                                                                                    style={{ color: colorScheme.text }}
                                                                                    title="클릭하여 할 일 내용 수정 (링크 클릭 시 바로가기)"
                                                                                >
                                                                                    {renderTextWithLinks(item.text)}
                                                                                </div>
                                                                            ) : (
                                                                                <input
                                                                                    type="text"
                                                                                    className={`direct-checklist-text-input ${item.checked ? 'completed' : ''}`}
                                                                                    placeholder="할 일 입력... (Enter: 다음 할 일 / 빈칸 Enter: 일반 메모 전환)"
                                                                                    value={item.text}
                                                                                    data-note-check={`${note.id}_${itemIdx}`}
                                                                                    autoFocus={isEditingThisItem}
                                                                                    onFocus={() => setActiveChecklistKey(`${note.id}_${itemIdx}`)}
                                                                                    onBlur={() => setActiveChecklistKey(null)}
                                                                                    onChange={(e) => handleChecklistTextChange(note.id, itemIdx, e.target.value)}
                                                                                    onKeyDown={(e) => handleChecklistKeyDown(note.id, itemIdx, e)}
                                                                                    style={{ color: colorScheme.text }}
                                                                                />
                                                                            )}

                                                                            <button
                                                                                type="button"
                                                                                className="direct-row-delete-btn"
                                                                                onClick={(e) => handleDeleteChecklistItem(note.id, itemIdx, e)}
                                                                                title="항목 삭제"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* 2. 일반 텍스트 작성 모드 (줄별 ✕ 버튼 없는 순수 메모장 영역) */}
                                                        {(() => {
                                                            const isEditingText = activeTextareaNoteId === note.id;
                                                            const hasUrls = extractUrls(plainText).length > 0;

                                                            // 링크가 포함되어 있고 현재 편집 포커스가 없을 때는 직접 클릭 가능한 링크 뷰로 렌더링
                                                            if (!isEditingText && hasUrls) {
                                                                return (
                                                                    <div
                                                                        className={`inline-postit-content-view ${checklist.length > 0 ? 'has-checklist' : ''}`}
                                                                        onClick={() => setActiveTextareaNoteId(note.id)}
                                                                        style={{ color: colorScheme.text }}
                                                                        title="클릭하여 메모 수정 (링크 클릭 시 바로가기)"
                                                                    >
                                                                        {renderTextWithLinks(plainText)}
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <textarea
                                                                    ref={(el) => {
                                                                        if (el) {
                                                                            el.style.height = 'auto';
                                                                            el.style.height = Math.max(checklist.length > 0 ? 44 : 80, el.scrollHeight) + 'px';
                                                                            if (isEditingText) {
                                                                                el.focus();
                                                                            }
                                                                        }
                                                                    }}
                                                                    className={`inline-postit-content-input ${checklist.length > 0 ? 'has-checklist' : ''}`}
                                                                    placeholder="메모를 입력하세요..."
                                                                    value={plainText}
                                                                    data-note-textarea={note.id}
                                                                    onFocus={() => setActiveTextareaNoteId(note.id)}
                                                                    onBlur={() => setActiveTextareaNoteId(null)}
                                                                    onChange={(e) => {
                                                                        e.target.style.height = 'auto';
                                                                        e.target.style.height = Math.max(checklist.length > 0 ? 44 : 80, e.target.scrollHeight) + 'px';
                                                                        handlePlainTextChange(note.id, e.target.value);
                                                                    }}
                                                                    onInput={(e) => {
                                                                        e.target.style.height = 'auto';
                                                                        e.target.style.height = Math.max(checklist.length > 0 ? 44 : 80, e.target.scrollHeight) + 'px';
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (checklist.length > 0 && e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
                                                                            if (e.key === 'ArrowUp' || (e.key === 'Backspace' && plainText === '')) {
                                                                                e.preventDefault();
                                                                                const lastIdx = checklist.length - 1;
                                                                                const lastInput = document.querySelector(`input[data-note-check="${note.id}_${lastIdx}"]`);
                                                                                if (lastInput) {
                                                                                    lastInput.focus();
                                                                                    lastInput.setSelectionRange(lastInput.value.length, lastInput.value.length);
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
                                                                    style={{ color: colorScheme.text }}
                                                                    rows={checklist.length > 0 ? 2 : 3}
                                                                />
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })()}

                                            {/* 하단 툴바: 날짜 표시 (하단 색선택 제거로 극도의 깔끔함 확보) */}
                                            <div className="postit-footer" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.4rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.72rem', opacity: 0.65 }}>{formatDate(note.createdAt)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                );
            })()}

            {sortedNotes.length === 0 && (
                <div className="notepad-empty">
                    <p className="text-muted">
                        {searchQuery
                            ? `검색어 "${searchQuery}"와(과) 일치하는 메모가 없습니다.`
                            : '저장된 포스트잇 메모가 없습니다. 상단 버튼으로 새 포스트잇을 추가해보세요!'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default Notepad;
