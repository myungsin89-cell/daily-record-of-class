import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClass } from '../context/ClassContext';
import './ClassSelect.css';

const ClassSelect = () => {
    const { user, logout } = useAuth();
    const { classes, selectClass, deleteClass } = useClass();
    const navigate = useNavigate();

    const handleSelectClass = (classData) => {
        selectClass(classData);
        navigate('/');
    };

    const handleCreateNew = () => {
        navigate('/create-class');
    };

    const handleDeleteClass = (e, classId) => {
        e.stopPropagation();
        if (window.confirm('이 학급을 삭제하시겠습니까?')) {
            deleteClass(classId);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="class-select-container">
            <div className="class-select-header">
                <div>
                    <h1>학급 선택</h1>
                    <p>{user?.username}님, 환영합니다!</p>
                </div>
                <button onClick={handleLogout} className="logout-btn">
                    로그아웃
                </button>
            </div>

            <div className="class-select-content">
                <div className="classes-grid">
                    <div className="class-card create-new-card" onClick={handleCreateNew}>
                        <div className="create-icon">➕</div>
                        <h3>새 학급 만들기</h3>
                        <p>새로운 학급을 생성하세요</p>
                    </div>

                    {classes.map((classItem) => (
                        <div
                            key={classItem.id}
                            className="class-card"
                            onClick={() => handleSelectClass(classItem)}
                        >
                            <button
                                className="delete-class-btn"
                                onClick={(e) => handleDeleteClass(e, classItem.id)}
                                title="학급 삭제"
                            >
                                ✕
                            </button>
                            <div className="class-emoji">🏫</div>
                            <h3>{classItem.name}</h3>
                            {classItem.year && (
                                <div className="class-year">{classItem.year}년</div>
                            )}
                        </div>
                    ))}
                </div>

                {classes.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">📚</div>
                        <h2>학급이 없습니다</h2>
                        <p>새 학급을 만들어서 시작하세요!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClassSelect;
