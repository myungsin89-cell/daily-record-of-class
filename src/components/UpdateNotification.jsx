import React from 'react';
import './UpdateNotification.css';

function formatToUserFriendly(notes) {
  if (!notes || !Array.isArray(notes)) {
    return [];
  }
  
  return notes.map(note => {
    if (note.friendly) {
      return note.friendly;
    }
    
    const simplifications = {
      'API': '데이터 연결',
      'timeout': '대기 시간',
      'refactored': '개선',
      'component': '구성요소',
      'React Hooks': '내부 기술',
      'cache': '저장 공간',
      'performance': '성능',
      'optimization': '최적화'
    };
    
    let simplified = note.technical || note;
    Object.keys(simplifications).forEach(term => {
      const regex = new RegExp(term, 'gi');
      simplified = simplified.replace(regex, simplifications[term]);
    });
    
    return simplified;
  });
}

function UpdateNotification({ updateAvailable, onUpdate, updateNotes = [] }) {
  if (!updateAvailable) {
    return null;
  }

  const friendlyNotes = formatToUserFriendly(updateNotes);

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        
        <div className="update-info">
          <h3 className="update-title"> 새로운 버전이 준비되었습니다!</h3>
          
          {friendlyNotes.length > 0 && (
            <div className="update-changes">
              <p className="update-changes-title">변경 사항:</p>
              <ul className="update-list">
                {friendlyNotes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <button 
          className="update-button" 
          onClick={onUpdate}
          aria-label="새 버전 적용하기"
        >
          <span>새 버전 적용하기</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2V14M8 14L12 10M8 14L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default UpdateNotification;
export { formatToUserFriendly };
