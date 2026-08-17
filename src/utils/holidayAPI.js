/**
 * 한국천문연구원 특일정보 API 연동
 * 공공데이터 포털 - 한국 공휴일 정보 가져오기
 */

const API_BASE_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';
const DEFAULT_API_KEY = import.meta.env.VITE_HOLIDAY_API_KEY || 'd4d54ce3a6f7520be7c57ce17e5c009283af2f756c8e2084aae7ebbbd87111fd';

/**
 * XML 파싱 헬퍼 함수
 * @param {string} xmlString - XML 문자열
 * @returns {Document} - 파싱된 XML Document
 */
const parseXML = (xmlString) => {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, 'text/xml');
};

/**
 * XML에서 특정 태그의 텍스트 값 추출
 * @param {Element} element - XML 요소
 * @param {string} tagName - 태그 이름
 * @returns {string} - 태그 값
 */
const getTagValue = (element, tagName) => {
    const tag = element.getElementsByTagName(tagName)[0];
    return tag ? tag.textContent : '';
};

/**
 * 한국 공휴일 정보 가져오기
 * @param {number} year - 조회할 연도 (예: 2025)
 * @param {string} apiKey - API 서비스 키 (선택, 기본값 사용 가능)
 * @returns {Promise<Array>} - 공휴일 배열 [{date: 'YYYY-MM-DD', name: '공휴일명'}]
 */
export const fetchKoreanHolidays = async (year, apiKey = DEFAULT_API_KEY) => {
    try {
        // API 요청 URL 구성
        const params = new URLSearchParams({
            ServiceKey: apiKey,
            solYear: year.toString(),
            numOfRows: '100', // 한 해의 모든 특일 정보를 가져오기 위해 충분한 수
            pageNo: '1',
            _type: 'xml' // XML 형식으로 받기
        });

        const url = `${API_BASE_URL}/getRestDeInfo?${params.toString()}`;

        console.log(`🔍 ${year}년 공휴일 API 호출 중...`);

        // API 호출
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API 응답 에러:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();

        // XML 파싱
        const xmlDoc = parseXML(xmlText);

        // 에러 체크
        const resultCode = getTagValue(xmlDoc, 'resultCode');
        const resultMsg = getTagValue(xmlDoc, 'resultMsg');

        if (resultCode !== '00') {
            console.error('❌ API 에러:', resultCode, resultMsg);
            throw new Error(`API Error: ${resultCode} - ${resultMsg}`);
        }

        // 아이템 추출
        const items = xmlDoc.getElementsByTagName('item');
        const holidays = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isHoliday = getTagValue(item, 'isHoliday');
            const locdate = getTagValue(item, 'locdate');
            const dateName = getTagValue(item, 'dateName');

            // 공휴일만 필터링 (isHoliday === 'Y')
            if (isHoliday === 'Y') {
                // YYYYMMDD -> YYYY-MM-DD 변환
                if (locdate && locdate.length === 8) {
                    const formattedDate = `${locdate.substring(0, 4)}-${locdate.substring(4, 6)}-${locdate.substring(6, 8)}`;

                    holidays.push({
                        date: formattedDate,
                        name: dateName || '공휴일'
                    });
                }
            }
        }

        console.log(`✅ ${year}년 공휴일 ${holidays.length}개 가져오기 완료`);
        return holidays;

    } catch (error) {
        console.error('❌ 공휴일 API 호출 실패:', error);
        throw error;
    }
};

/**
 * 여러 연도의 공휴일 가져오기
 * @param {number[]} years - 연도 배열
 * @param {string} apiKey - API 서비스 키
 * @returns {Promise<Array>} - 모든 공휴일 배열
 */
export const fetchMultipleYearsHolidays = async (years, apiKey = DEFAULT_API_KEY) => {
    try {
        const allHolidays = [];

        for (const year of years) {
            const holidays = await fetchKoreanHolidays(year, apiKey);
            allHolidays.push(...holidays);

            // API 호출 간격 두기 (rate limiting 방지)
            if (years.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return allHolidays;
    } catch (error) {
        console.error('❌ 여러 연도 공휴일 가져오기 실패:', error);
        throw error;
    }
};

/**
 * 현재 연도의 공휴일 가져오기
 * @param {string} apiKey - API 서비스 키
 * @returns {Promise<Array>} - 공휴일 배열
 */
export const fetchCurrentYearHolidays = async (apiKey = DEFAULT_API_KEY) => {
    const currentYear = new Date().getFullYear();
    return fetchKoreanHolidays(currentYear, apiKey);
};
