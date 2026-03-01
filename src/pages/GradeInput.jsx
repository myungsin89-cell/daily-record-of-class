import React from 'react';
import Card from '../components/Card';

const GradeInput = () => {
    return (
        <div className="grade-input-container">
            <div className="flex justify-between items-center mb-lg">
                <h1>성적 입력</h1>
            </div>

            <Card className="text-center" style={{ padding: '3rem' }}>
                <h2 style={{ marginBottom: '1rem' }}>성적 입력 기능</h2>
                <p style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                    이 페이지에서 학생들의 성적을 입력하고 관리할 수 있습니다.
                </p>
                <p style={{ fontSize: '0.95rem', color: 'var(--color-text-secondary)' }}>
                    기능을 개선 중입니다.
                </p>
            </Card>
        </div>
    );
};

export default GradeInput;
