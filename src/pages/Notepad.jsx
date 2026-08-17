import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useSaveStatus } from '../context/SaveStatusContext';
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
                if (window.electronAPI) {
                    window.electronAPI.syncMemoUpdate(updated);
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
        <div className="notepad-container">
            {/* 상단 헤더 */}
            <div className="notepad-header">
                <div className="header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className="postit-count-badge">총 {notes.length}개</span>
                    {pinnedCount > 0 && (
                        <span className="postit-pinned-badge">고정 {pinnedCount}개</span>
                    )}
                    {window.electronAPI && (
                        <span className="postit-tip-pill" style={{ fontSize: '0.8rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.25rem 0.65rem', borderRadius: '99px', fontWeight: 600 }}>
                            💡 카드 안에서 자유롭게 메모를 수정할 수 있습니다. 상단 모니터 아이콘을 누르면 바탕화면 스티커로 띄워집니다.
                        </span>
                    )}
                </div>
                <div>
                    <button
                        className="add-postit-btn"
                        onClick={handleCreateQuickNote}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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

            {/* 인라인 직접 수정 가능한 포스트잇 그리드 */}
            <div className="notes-grid">
                {sortedNotes.map((note) => {
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
                                        style={{ color: colorScheme.text }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
                                        title="상단 고정"
                                        style={{ color: colorScheme.text, opacity: 0.4 }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="17" x2="12" y2="22"></line>
                                            <path d="M5 17h14l-1.5-6h-11z"></path>
                                            <path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"></path>
                                        </svg>
                                    </button>
                                )}

                                <div className="postit-actions" style={{ position: 'relative' }}>
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

                                    {window.electronAPI && (
                                        <button
                                            className="postit-action-btn sticker-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.electronAPI.openWidgetWindow(note.id);
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
                                    )}
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
                                onChange={(e) => handleInlineNoteChange(note.id, 'title', e.target.value)}
                                style={{ color: colorScheme.text }}
                            />

                            {/* 카드 내부 직접 자유 편집 본문 텍스트에어리어 (내용 길이에 맞춰 높이 자동 수직 확장) */}
                            <textarea
                                className="inline-postit-content-input"
                                placeholder="메모 내용을 자유롭게 입력하세요..."
                                value={note.content || ''}
                                onChange={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                    handleInlineNoteChange(note.id, 'content', e.target.value);
                                }}
                                ref={(el) => {
                                    if (el) {
                                        el.style.height = 'auto';
                                        el.style.height = `${el.scrollHeight}px`;
                                    }
                                }}
                                style={{ color: colorScheme.text }}
                                rows={3}
                            />

                            {/* 하단 툴바: 날짜 표시 (하단 색선택 제거로 극도의 깔끔함 확보) */}
                            <div className="postit-footer" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.4rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', opacity: 0.65 }}>{formatDate(note.createdAt)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

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
