import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAPIKey } from '../db/indexedDB';

/**
 * Get Gemini AI instance with API key from IndexedDB
 * @throws {Error} if API key is not configured
 */
const getGenAI = async () => {
    const apiKey = await getAPIKey();

    if (!apiKey) {
        throw new Error(
            'API 키가 설정되지 않았습니다. 설정 페이지에서 Gemini API 키를 등록해주세요.'
        );
    }

    return new GoogleGenerativeAI(apiKey);
};

// Model priority list - try in this order
const MODEL_PRIORITY = ['gemini-2.0-flash-exp', 'gemini-2.5-flash'];

// Get last working model from localStorage
const getLastWorkingModel = () => {
    return localStorage.getItem('last_working_gemini_model') || MODEL_PRIORITY[0];
};

// Save successful model to localStorage
const saveWorkingModel = (model) => {
    localStorage.setItem('last_working_gemini_model', model);
};

// Try generating content with fallback
const tryGenerateWithFallback = async (genAI, prompt) => {
    const lastModel = getLastWorkingModel();

    // First try with last successful model
    try {
        const model = genAI.getGenerativeModel({ model: lastModel });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.log(`Model ${lastModel} failed, trying fallback...`);

        // Try other models in priority order
        for (const modelName of MODEL_PRIORITY) {
            if (modelName === lastModel) continue; // Skip already tried model

            try {
                console.log(`Trying model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;

                // Success! Save this model as working
                saveWorkingModel(modelName);
                console.log(`Model ${modelName} succeeded, saved as default`);

                return response.text();
            } catch (fallbackError) {
                console.log(`Model ${modelName} also failed:`, fallbackError.message);
                continue;
            }
        }

        // All models failed
        throw error;
    }
};

export const generateStudentEvaluation = async (studentName, journalEntries, systemInstructions = '', userInstructions = '', referenceFileContent = '', additionalNotes = '', revisionRequest = '') => {
    try {
        // Get GenAI instance with API key from IndexedDB
        const genAI = await getGenAI();

        // Prepare the content from journal entries and additional notes
        let observationContent = '';

        if (journalEntries && journalEntries.length > 0) {
            observationContent += '## [누가기록 (관찰 내용)]\n';
            journalEntries.forEach((entry, index) => {
                const date = new Date(entry.date).toLocaleDateString('ko-KR');
                observationContent += `- ${date}: ${entry.content}\n`;
            });
            observationContent += '\n';
        }

        if (additionalNotes && additionalNotes.trim() !== '') {
            observationContent += '## [추가 특이사항 (중요 반영)]\n';
            observationContent += additionalNotes + '\n\n';
        }

        // If no content at all, use generic prompt
        if (!observationContent.trim()) {
            observationContent = '구체적인 관찰 기록이 없음. 일반적이고 무난한 평가를 작성할 것.';
        }

        // Reference file content for style learning
        let styleGuideSection = '';
        if (referenceFileContent && referenceFileContent.trim() !== '') {
            styleGuideSection = `## [📋 작성 스타일 참고 자료 - 최우선 반영]
이 자료는 선생님의 실제 평가 작성 예시입니다. 반드시 이 자료에서 나타나는 **어투, 표현 방식, 문장 구조, 자주 사용하는 어휘**를 철저히 분석하고 동일한 스타일로 평가를 작성하십시오.

${referenceFileContent}

**[스타일 학습 지침]**
1. 위 참고 자료의 **문장 종결 방식**을 파악하여 동일하게 사용하십시오 (예: ~함, ~임, ~됨, ~나타남 등)
2. 위 참고 자료에서 **자주 사용되는 어휘와 표현**을 우선적으로 활용하십시오
3. 위 참고 자료의 **문장 길이와 구조**를 참고하여 비슷한 패턴으로 작성하십시오
4. 위 참고 자료의 **전반적인 어조**(따뜻함, 객관성, 격식 등)를 정확히 모방하십시오
5. 위 참고 자료에 없는 새로운 표현이나 어투는 최대한 지양하십시오

`;
        }

        // Check if user has custom settings
        const hasCustomSettings = (userInstructions && userInstructions.trim() !== '') ||
            (referenceFileContent && referenceFileContent.trim() !== '') ||
            (revisionRequest && revisionRequest.trim() !== '');

        // Build the full prompt - Structure for better adherence
        let fullPrompt = `
${systemInstructions}

---

## [평가 대상 학생]
이름: ${studentName || '이 학생'}

${observationContent}

${styleGuideSection}

${userInstructions && userInstructions.trim() !== '' ? `## [사용자 추가 요청사항 (최우선 반영)]\n${userInstructions}\n\n` : ''}

${revisionRequest && revisionRequest.trim() !== '' ? `## [🔥 수정 요청 사항 (최우선순위로 반영)]\n${revisionRequest}\n\n` : ''}

---

## [작성 지침 (최종 확인)]
1. 위 '누가기록'과 '추가 특이사항', '사용자 추가 요청사항', '수정 요청 사항'을 모두 종합하여 평가를 작성하십시오.
2. **분량은 공백 포함 300자 내외로 작성하십시오.** (너무 짧으면 안 됩니다.)
${hasCustomSettings ?
                `3. **사용자가 요청한 스타일과 형식을 최우선으로 따르십시오.** 기본 지침과 충돌 시, 사용자 요청사항을 우선 적용합니다.` :
                `3. 문체는 '~함', '~임' 등의 개조식 종결어를 사용하십시오.`}
4. 학생의 장점을 부각하되, 개선점은 발전 가능성으로 표현하십시오.
5. **절대 'AI 모델입니다' 등의 사족을 붙이지 말고, 바로 평가 내용만 출력하십시오.**
`;

        // Call Gemini API with automatic fallback
        const evaluation = await tryGenerateWithFallback(genAI, fullPrompt);

        return evaluation.trim();

    } catch (error) {
        console.error('Gemini API Error:', error);

        // Check if it's an API key error
        if (error.message && error.message.includes('API 키가 설정되지 않았습니다')) {
            throw error; // Re-throw to show in UI
        }

        // Fallback to enhanced evaluation if API fails
        const fallbackEval = generateEnhancedFallbackEvaluation(journalEntries, additionalNotes, userInstructions);
        return `[시스템 알림: AI 서비스 연결 실패로 인해 규칙 기반으로 생성된 평가입니다.]\n\n${fallbackEval}`;
    }
};

// Enhanced fallback function with better quality
function generateEnhancedFallbackEvaluation(journalEntries, additionalNotes, userInstructions) {
    let allContent = '';

    // Combine all content
    if (journalEntries && journalEntries.length > 0) {
        allContent += journalEntries.map(e => e.content).join(' ');
    }

    if (additionalNotes && additionalNotes.trim() !== '') {
        allContent += ' ' + additionalNotes;
    }

    if (userInstructions && userInstructions.trim() !== '') {
        allContent += ' ' + userInstructions;
    }

    // Enhanced keyword analysis by categories
    const keywords = {
        // 성격 및 태도
        personality: {
            positive: ['유쾌', '명랑', '밝', '긍정', '활발', '적극', '성실', '차분', '온순', '예의', '책임감'],
            leadership: ['리더십', '솔선수범', '주도', '이끌'],
            creative: ['창의', '재치', '유머']
        },
        // 학습 태도
        learning: {
            participation: ['참여', '발표', '적극', '집중', '경청', '질문'],
            achievement: ['우수', '뛰어', '이해력', '사고력', '해결력', '성취'],
            effort: ['노력', '성실', '꾸준', '열심', '최선'],
            subjects: ['수학', '국어', '영어', '과학', '사회', '체육', '미술', '음악']
        },
        // 교우 관계
        social: {
            relations: ['교우', '친구', '원만', '어울', '관계', '인기'],
            character: ['배려', '도움', '친절', '나눔', '협동', '협력', '존중', '공감'],
            communication: ['소통', '대화', '경청', '표현']
        },
        // 생활 습관
        habits: {
            responsibility: ['책임', '약속', '규칙', '준수', '정리', '청소'],
            improvement: ['개선', '발전', '성장', '기대', '가능성']
        },
        // 부정적 (긍정적으로 표현할 것)
        needsWork: ['지각', '결석', '산만', '집중 못', '부족', '떠듦', '고쳐']
    };

    // Analyze content and count keywords
    let analysis = {
        personality: { positive: 0, leadership: 0, creative: 0 },
        learning: { participation: 0, achievement: 0, effort: 0, subjects: [] },
        social: { relations: 0, character: 0, communication: 0 },
        habits: { responsibility: 0, improvement: 0 },
        needsWork: 0
    };

    // Count keywords
    Object.keys(keywords.personality).forEach(cat => {
        keywords.personality[cat].forEach(kw => {
            if (allContent.includes(kw)) analysis.personality[cat]++;
        });
    });

    Object.keys(keywords.learning).forEach(cat => {
        if (cat === 'subjects') {
            keywords.learning.subjects.forEach(subj => {
                if (allContent.includes(subj)) analysis.learning.subjects.push(subj);
            });
        } else {
            keywords.learning[cat].forEach(kw => {
                if (allContent.includes(kw)) analysis.learning[cat]++;
            });
        }
    });

    Object.keys(keywords.social).forEach(cat => {
        keywords.social[cat].forEach(kw => {
            if (allContent.includes(kw)) analysis.social[cat]++;
        });
    });

    Object.keys(keywords.habits).forEach(cat => {
        keywords.habits[cat].forEach(kw => {
            if (allContent.includes(kw)) analysis.habits[cat]++;
        });
    });

    keywords.needsWork.forEach(kw => {
        if (allContent.includes(kw)) analysis.needsWork++;
    });

    // Build evaluation following 4-part structure
    let parts = [];

    // Part 1: Overall characteristics and strengths (전체적 특성)
    let part1 = buildCharacteristicsPart(analysis, allContent);
    parts.push(part1);

    // Part 2: Learning attitude (학습 태도)
    let part2 = buildLearningPart(analysis, allContent);
    parts.push(part2);

    // Part 3: Social relationships (교우 관계)
    let part3 = buildSocialPart(analysis, allContent);
    parts.push(part3);

    // Part 4: Conclusion and future expectations (종합 및 발전)
    let part4 = buildConclusionPart(analysis, allContent);
    parts.push(part4);

    // Combine all parts
    let evaluation = parts.join(' ');

    // Ensure minimum length (aim for 280-320 characters)
    if (evaluation.length < 250) {
        // Add more detail if too short
        evaluation = expandEvaluation(evaluation, analysis, allContent);
    }

    return evaluation;
}

function buildCharacteristicsPart(analysis, content) {
    const templates = [
        // Positive personality
        () => {
            if (analysis.personality.positive > 2) {
                if (content.includes('유쾌') || content.includes('명랑')) {
                    return '유쾌하고 명랑한 성격으로 주변 사람들에게 밝은 기운을 전하는 학생임.';
                }
                if (content.includes('활발')) {
                    return '활발한 성격으로 학급 친구들과 두루두루 잘 어울림.';
                }
                if (content.includes('성실') || content.includes('차분')) {
                    return '성실하고 차분한 태도로 학교생활에 임함.';
                }
                return '긍정적인 마음가짐으로 학교생활에 임하며 밝은 모습을 보임.';
            }
            return '성실하게 학교생활에 임하며 기본 생활 습관이 잘 형성되어 있음.';
        },
        // Leadership
        () => {
            if (analysis.personality.leadership > 0) {
                return ' 모둠 활동에서 주도적으로 문제를 해결하는 리더십을 보임.';
            }
            if (analysis.habits.responsibility > 1) {
                return ' 자신에게 주어진 역할을 책임감 있게 수행함.';
            }
            return '';
        }
    ];

    return templates.map(t => t()).filter(s => s).join('') || '기본적인 생활 태도가 바르게 형성되어 있음.';
}

function buildLearningPart(analysis, content) {
    const templates = [
        () => {
            if (analysis.learning.participation > 2) {
                return ' 수업 시간에 적극적으로 참여하며 발표를 두려워하지 않는 태도가 돋보임.';
            }
            if (analysis.learning.participation > 0) {
                return ' 수업 시간에 집중하며 적극적인 자세로 참여함.';
            }
            return ' 기본적인 학습 태도를 갖추고 있으며 주어진 과제를 성실히 수행함.';
        },
        () => {
            if (analysis.learning.achievement > 1) {
                if (analysis.learning.subjects.length > 0) {
                    return ` 특히 ${analysis.learning.subjects[0]} 과목에서 우수한 이해력을 보이며 전반적인 학업 성취도가 높음.`;
                }
                return ' 학습 이해력이 뛰어나 전 과목 성적이 우수함.';
            }
            if (analysis.learning.effort > 1) {
                return ' 꾸준한 노력으로 학습 능력을 향상시키고 있음.';
            }
            return '';
        }
    ];

    return templates.map(t => t()).filter(s => s).join('');
}

function buildSocialPart(analysis, content) {
    const templates = [
        () => {
            if (analysis.social.character > 2) {
                if (content.includes('배려') || content.includes('도움')) {
                    return ' 친구들을 배려하고 어려운 일이 있을 때 먼저 도와주는 따뜻한 마음씨를 지님.';
                }
                if (content.includes('협동') || content.includes('협력')) {
                    return ' 모둠 활동에서 협력하는 태도가 우수하며 친구들과 긍정적인 상호작용을 함.';
                }
                return ' 다른 사람을 배려하는 마음이 습관화되어 있음.';
            }
            if (analysis.social.relations > 0) {
                return ' 친구들과 원만하게 지내며 교우 관계가 좋음.';
            }
            return ' 교우들과 무난하게 지내며 학급 규칙을 준수함.';
        },
        () => {
            if (content.includes('존중') || content.includes('신망')) {
                return ' 타인을 존중하는 태도로 친구들 사이에서 신망이 두터움.';
            }
            if (content.includes('인기')) {
                return ' 재치와 유머로 친구들에게 인기가 좋음.';
            }
            return '';
        }
    ];

    return templates.map(t => t()).filter(s => s).join('');
}

function buildConclusionPart(analysis, content) {
    if (analysis.needsWork > 1) {
        if (content.includes('고쳐') || content.includes('인정')) {
            return ' 부족한 부분을 스스로 인정하고 개선하려는 모습이 바람직하여 앞으로의 발전이 기대됨.';
        }
        return ' 몇 가지 개선이 필요한 부분이 있으나 꾸준한 노력을 통해 성장할 수 있을 것으로 기대됨.';
    }

    const totalPositive = analysis.personality.positive + analysis.learning.participation +
        analysis.learning.achievement + analysis.social.character;

    if (totalPositive > 5) {
        return ' 현재의 우수한 태도를 유지하며 더욱 발전할 것으로 기대됨.';
    }

    if (analysis.habits.improvement > 0) {
        return ' 지속적인 노력을 통해 더욱 성장할 가능성이 큰 학생임.';
    }

    return ' 앞으로 더욱 적극적인 자세로 학습 활동에 참여한다면 큰 발전이 있을 것임.';
}

function expandEvaluation(evaluation, analysis, content) {
    // Add more details if evaluation is too short
    const additions = [];

    if (content.includes('예의')) {
        additions.push(' 예의가 바르며 교사와 어른에 대한 존경심을 긍정적으로 표현할 줄 아는 학생임.');
    }

    if (content.includes('체육') || content.includes('운동')) {
        additions.push(' 체육 활동에 즐겁게 참여하며 승패를 떠나 경기를 즐기는 모습이 바람직함.');
    }

    if (content.includes('정리') || content.includes('청소')) {
        additions.push(' 자기 물건을 잘 정리하고 교실 환경 정돈에 솔선수범함.');
    }

    if (additions.length > 0) {
        // Insert additions before the conclusion
        const parts = evaluation.split('.');
        const conclusion = parts.pop();
        return parts.join('.') + '.' + additions.join('') + conclusion;
    }

    return evaluation;
}

/**
 * Generate AI Behavior Summary for Student (Life Record format or Parent Counseling format)
 */
export const generateStudentBehaviorSummary = async (studentName, records = [], styleType = 'report') => {
    try {
        const genAI = await getGenAI();

        let recordText = '';
        if (records && records.length > 0) {
            records.forEach(r => {
                const dateStr = new Date(r.date).toLocaleDateString('ko-KR');
                const tagStr = r.tag ? `[${r.tag}] ` : '';
                recordText += `- ${dateStr}: ${tagStr}${r.content}\n`;
            });
        } else {
            recordText = '작성된 행동 관찰 기록이 없음.';
        }

        let prompt = '';
        if (styleType === 'report') {
            prompt = `
다음은 초등학교 학생 '${studentName}'의 행동 관찰 누가기록입니다.
이 기록들을 바탕으로 초등학교 생활기록부 '행동특성 및 종합의견' 란에 기재할 수 있는 완성도 높은 종합 의견 문장을 작성해 주세요.

[관찰 누가기록]
${recordText}

[작성 수칙]
1. 문체는 개조식 종결어('~함', '~임', '~보임', '~나타남')를 사용하세요.
2. 학생의 긍정적인 행동 특성, 수업 태도, 교우 관계, 발전 가능성을 중심으로 250자~350자 분량으로 작성하세요.
3. 사족(예: '네, 작성해 드립니다' 등)을 전면 배제하고 오직 생활기록부 기재 문장만 출력하세요.
`;
        } else {
            prompt = `
다음은 학생 '${studentName}'의 행동 관찰 기록입니다.
학부모 상담 진행 시 교사가 유용하게 참고할 수 있도록 주요 관찰 포인트, 학생의 강점, 가정 연계 지도 팁을 정리해 주세요.

[관찰 누가기록]
${recordText}

[작성 수칙]
1. '1. 학생의 주요 강점 및 장점', '2. 학교생활 및 교우관계 특성', '3. 가정 연계 지도 및 당부 팁' 3가지 항목으로 명확히 구분하여 친절하고 따뜻한 어조로 정리해 주세요.
2. 사족 없이 바로 위 3개 항목 내용만 출력해 주세요.
`;
        }

        const summary = await tryGenerateWithFallback(genAI, prompt);
        return summary.trim();
    } catch (error) {
        console.error('Behavior summary AI generation failed:', error);
        throw error;
    }
};
