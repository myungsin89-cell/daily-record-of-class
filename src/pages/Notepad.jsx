import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import { useSaveStatus } from '../context/SaveStatusContext';
import { useClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';

const COLORS = [
    { name: '노란색', value: '#fef08a', shadow: '#facc15' },
    { name: '파란색', value: '#bfdbfe', shadow: '#60a5fa' },
    { name: '분홍색', value: '#fbcfe8', shadow: '#f472b6' },
    { name: '초록색', value: '#bbf7d0', shadow: '#4ade80' },
    { name: '보라색', value: '#e9d5ff', shadow: '#c084fc' },
];

const StickyNote = ({ note, onUpdate, onDelete, onDragStart, onDragEnd, onDragOver, onDrop, isDragging, isDragOver }) => {
    const textareaRef = React.useRef(null);

    // Auto-resize textarea based on content
    React.useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';
            // Set height to scrollHeight to fit content (minimum 120px)
            textarea.style.height = `${Math.max(textarea.scrollHeight, 120)}px`;
        }
    }, [note.text]);

    return (
        <div
            className={`sticky-note ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
            style={{
                backgroundColor: note.color.value,
                boxShadow: `0 4px 6px -1px ${note.color.shadow}40, 0 2px 4px -1px ${note.color.shadow}30`
            }}
            draggable="true"
            onDragStart={(e) => onDragStart(e, note.id)}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, note.id)}
        >
            {/* Header with drag handle and delete button */}
            <div className="sticky-note-header">
                <div className="note-drag-handle" title="드래그하여 순서 변경">
                    ⋮⋮
                </div>
                <button
                    className="delete-note-btn"
                    onClick={() => onDelete(note.id)}
                    title="삭제"
                >
                    ×
                </button>
            </div>

            {/* Note Content */}
            <textarea
                ref={textareaRef}
                className="sticky-note-content"
                value={note.text}
                onChange={(e) => onUpdate(note.id, { ...note, text: e.target.value })}
                placeholder="메모를 입력하세요..."
            />

            {/* Timestamp */}
            <div className="sticky-note-footer">
                {new Date(note.createdAt).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric'
                })}
            </div>
        </div>
    );
};

const Notepad = () => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const rawClassId = currentClass?.id || 'default';
    const classId = user ? `${user.username}_${rawClassId}` : rawClassId;
    const [notes, setNotes] = useState([]);
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [draggedNoteId, setDraggedNoteId] = useState(null);
    const [dragOverNoteId, setDragOverNoteId] = useState(null);
    const { updateSaveStatus } = useSaveStatus();
    const [isLoaded, setIsLoaded] = useState(false);

    // Load notes from localStorage when class changes
    useEffect(() => {
        const notesKey = `teacher_notepad_${classId}`;
        const savedNotes = localStorage.getItem(notesKey);

        if (savedNotes) {
            setNotes(JSON.parse(savedNotes));
        } else {
            setNotes([]);
        }
        setIsLoaded(true);
    }, [classId]);

    // Save notes to localStorage
    useEffect(() => {
        if (!isLoaded) return;
        const notesKey = `teacher_notepad_${classId}`;
        localStorage.setItem(notesKey, JSON.stringify(notes));
        if (notes.length > 0) {
            updateSaveStatus();
        }
    }, [notes, updateSaveStatus, isLoaded, classId]);

    const addNote = () => {
        const newNote = {
            id: Date.now(),
            text: '',
            color: selectedColor,
            createdAt: new Date().toISOString()
        };
        setNotes([newNote, ...notes]); // Add to beginning
        setShowColorPicker(false); // Close color picker after adding
    };

    const updateNote = (id, updatedNote) => {
        setNotes(notes.map(note => note.id === id ? updatedNote : note));
    };

    const deleteNote = (id) => {
        setNotes(notes.filter(note => note.id !== id));
    };

    // Drag and drop handlers
    const handleDragStart = (e, noteId) => {
        setDraggedNoteId(noteId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target);
    };

    const handleDragEnd = () => {
        setDraggedNoteId(null);
        setDragOverNoteId(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetNoteId) => {
        e.preventDefault();

        if (draggedNoteId === targetNoteId) {
            return;
        }

        const draggedIndex = notes.findIndex(note => note.id === draggedNoteId);
        const targetIndex = notes.findIndex(note => note.id === targetNoteId);

        if (draggedIndex === -1 || targetIndex === -1) {
            return;
        }

        // Create a new array with reordered notes
        const newNotes = [...notes];
        const [draggedNote] = newNotes.splice(draggedIndex, 1);
        newNotes.splice(targetIndex, 0, draggedNote);

        setNotes(newNotes);
        setDragOverNoteId(null);
    };

    const handleDragEnter = (noteId) => {
        setDragOverNoteId(noteId);
    };

    return (
        <div className="notepad-container">
            {/* Header */}
            <div className="flex justify-between items-center mb-lg">
                <h1>📝 메모장</h1>
                <div className="add-note-controls">
                    {/* Color Picker */}
                    <div className="color-selector">
                        <button
                            className="selected-color-btn"
                            style={{ backgroundColor: selectedColor.value }}
                            onClick={() => setShowColorPicker(!showColorPicker)}
                            title="색상 선택"
                        />
                        {showColorPicker && (
                            <div className="color-picker-dropdown">
                                {COLORS.map(color => (
                                    <button
                                        key={color.value}
                                        className={`color-option ${selectedColor.value === color.value ? 'active' : ''}`}
                                        style={{ backgroundColor: color.value }}
                                        onClick={() => {
                                            setSelectedColor(color);
                                            setShowColorPicker(false);
                                        }}
                                        title={color.name}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <Button onClick={addNote}>+ 새 메모 추가</Button>
                </div>
            </div>

            {/* Notes Grid */}
            {notes.length === 0 ? (
                <div className="empty-state">
                    <p className="text-muted">메모가 없습니다. 새 메모를 추가해보세요!</p>
                </div>
            ) : (
                <div className="notes-grid">
                    {notes.map(note => (
                        <StickyNote
                            key={note.id}
                            note={note}
                            onUpdate={updateNote}
                            onDelete={deleteNote}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragging={draggedNoteId === note.id}
                            isDragOver={dragOverNoteId === note.id}
                        />
                    ))}
                </div>
            )}

            <style>{`
                .notepad-container {
                    padding: 2rem;
                }

                .add-note-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .color-selector {
                    position: relative;
                }

                .selected-color-btn {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid var(--color-border);
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .selected-color-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }

                .color-picker-dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 0.5rem;
                    display: flex;
                    gap: 0.5rem;
                    padding: 0.75rem;
                    background: white;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    z-index: 100;
                }

                .color-option {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 2px solid transparent;
                    cursor: pointer;
                    transition: transform 0.2s, border-color 0.2s;
                }

                .color-option:hover {
                    transform: scale(1.15);
                }

                .color-option.active {
                    border-color: #000;
                    transform: scale(1.2);
                }

                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                }

                .notes-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 1.5rem;
                    margin-top: 2rem;
                    align-items: start;
                }

                .sticky-note {
                    position: relative;
                    padding: 1rem;
                    border-radius: 4px;
                    display: flex;
                    flex-direction: column;
                    transition: transform 0.2s, box-shadow 0.2s;
                    transform: rotate(-1deg);
                }

                .sticky-note:nth-child(even) {
                    transform: rotate(1deg);
                }

                .sticky-note:hover {
                    transform: rotate(0deg) scale(1.02);
                    z-index: 10;
                }

                .sticky-note-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }

                .note-drag-handle {
                    cursor: grab;
                    font-size: 1rem;
                    opacity: 0.4;
                    transition: opacity 0.2s;
                    user-select: none;
                    padding: 0.25rem;
                }

                .note-drag-handle:hover {
                    opacity: 0.8;
                }

                .note-drag-handle:active {
                    cursor: grabbing;
                }

                .sticky-note.dragging {
                    opacity: 0.5;
                    cursor: grabbing;
                }

                .sticky-note.drag-over {
                    border: 2px dashed #000;
                    transform: scale(1.05);
                }

                .delete-note-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.5rem;
                    padding: 0.25rem;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                    line-height: 1;
                }

                .delete-note-btn:hover {
                    opacity: 1;
                }

                .sticky-note-content {
                    width: 100%;
                    border: none;
                    background: transparent;
                    resize: none;
                    outline: none;
                    font-family: inherit;
                    font-size: 1rem;
                    line-height: 1.6;
                    color: #1f2937;
                    overflow: hidden;
                    min-height: 120px;
                }

                .sticky-note-content::placeholder {
                    color: rgba(0, 0, 0, 0.3);
                }

                .sticky-note-footer {
                    margin-top: 0.5rem;
                    font-size: 0.75rem;
                    opacity: 0.5;
                    text-align: right;
                }

                @media (max-width: 768px) {
                    .notes-grid {
                        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                        gap: 1rem;
                    }

                    .sticky-note {
                        min-height: 180px;
                    }
                }
            `}</style>
        </div>
    );
};

export default Notepad;

