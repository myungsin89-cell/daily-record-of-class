import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { useSaveStatus } from '../context/SaveStatusContext';
import './Notepad.css';

const Notepad = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const { updateSaveStatus } = useSaveStatus();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;

    const [notes, setNotes] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [form, setForm] = useState({ title: '', content: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        const key = `memos_${classId}`;
        const saved = localStorage.getItem(key);
        setNotes(saved ? JSON.parse(saved) : []);
        setIsLoaded(true);
    }, [classId]);

    useEffect(() => {
        if (!isLoaded) return;
        const key = `memos_${classId}`;
        localStorage.setItem(key, JSON.stringify(notes));
        if (notes.length > 0) updateSaveStatus();
    }, [notes, isLoaded, classId, updateSaveStatus]);

    const handleSave = () => {
        if (!form.title.trim() && !form.content.trim()) return;
        const note = {
            id: Date.now().toString(),
            title: form.title.trim(),
            content: form.content.trim(),
            createdAt: new Date().toISOString()
        };
        setNotes([note, ...notes]);
        setForm({ title: '', content: '' });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSave();
        }
    };

    const handleDelete = (id) => {
        setNotes(notes.filter(n => n.id !== id));
        if (expandedId === id) setExpandedId(null);
    };

    const filteredNotes = notes.filter(n => {
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    });

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) +
            ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="notepad-container">
            <h1>📝 메모장</h1>

            {/* 입력 폼 */}
            <div className="note-form">
                <input
                    type="text"
                    placeholder="제목"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="form-input note-title-input"
                    onKeyDown={handleKeyDown}
                />
                <textarea
                    placeholder="내용을 입력하거나 붙여넣기 하세요 (Ctrl+Enter로 저장)"
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    className="note-content-input"
                    onKeyDown={handleKeyDown}
                    rows={4}
                />
                <div className="note-form-footer">
                    <Button variant="primary" onClick={handleSave}>저장</Button>
                </div>
            </div>

            {/* 검색 */}
            <div className="note-search-bar">
                <input
                    type="text"
                    placeholder="제목 또는 내용으로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input"
                />
                {searchQuery && (
                    <span className="search-result-count">{filteredNotes.length}건</span>
                )}
            </div>

            {/* 메모 목록 */}
            {filteredNotes.length === 0 ? (
                <p className="text-muted notepad-empty">
                    {searchQuery ? '검색 결과가 없습니다.' : '저장된 메모가 없습니다.'}
                </p>
            ) : (
                <div className="note-list">
                    {filteredNotes.map(note => (
                        <div
                            key={note.id}
                            className={`note-item ${expandedId === note.id ? 'expanded' : ''}`}
                            onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                        >
                            <div className="note-item-header">
                                <div className="note-item-meta">
                                    <span className="note-date">{formatDate(note.createdAt)}</span>
                                    {note.title && <span className="note-title">{note.title}</span>}
                                </div>
                                <button
                                    className="note-delete-btn"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                                    title="삭제"
                                >
                                    ✕
                                </button>
                            </div>
                            {note.content && (
                                <div className={`note-content-preview ${expandedId === note.id ? 'expanded' : ''}`}>
                                    {note.content}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Notepad;
