import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
    const [username, setUsername] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmedName = username.trim();
        if (trimmedName) {
            login(trimmedName);
            
            // 등록된 학급 목록이 있는지 검사
            const classesKey = `${trimmedName}_classes`;
            const savedClasses = localStorage.getItem(classesKey);
            let hasClasses = false;
            
            if (savedClasses) {
                try {
                    const parsed = JSON.parse(savedClasses);
                    if (parsed && parsed.length > 0) {
                        hasClasses = true;
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            if (hasClasses) {
                navigate('/');
            } else {
                navigate('/select-class');
            }
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-icon">📚</div>
                    <h1>학급일지</h1>
                    <p className="subtitle">AI 기반 학생 기록 관리 시스템</p>
                    <div className="decorative-line"></div>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username">사용자 이름</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="이름을 입력하세요"
                            autoFocus
                            required
                        />
                    </div>

                    <button type="submit" className="login-button">
                        로그인
                    </button>
                </form>

                <div className="login-footer">
                    <div className="feature-badges">
                        <span className="badge">🤖 AI 평가</span>
                        <span className="badge">📊 자동 저장</span>
                        <span className="badge">💻 데스크톱 앱</span>
                    </div>
                    <p className="welcome-text">간편하게 이름만 입력하고 시작하세요</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
