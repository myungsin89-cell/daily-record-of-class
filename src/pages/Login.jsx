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
        if (username.trim()) {
            login(username.trim());
            navigate('/select-class');
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
                        <span className="badge">📱 PWA 지원</span>
                    </div>
                    <p className="welcome-text">간편하게 이름만 입력하고 시작하세요</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
