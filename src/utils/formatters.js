export const formatNumberWithCommas = (value) => {
    if (!value) return '';
    // Remove non-numeric characters first to ensure clean input
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    return new Intl.NumberFormat('ko-KR').format(numericValue);
};

export const numberToKorean = (value) => {
    if (!value) return '';
    const numericValue = parseInt(value.toString().replace(/[^0-9]/g, ''), 10);
    if (isNaN(numericValue) || numericValue === 0) return '';

    const units = ['', '만', '억', '조', '경'];
    const smallUnits = ['', '십', '백', '천'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    let result = [];
    let unitIndex = 0;
    let num = numericValue;

    while (num > 0) {
        const part = num % 10000;
        if (part > 0) {
            let partStr = '';
            let partNum = part;
            let smallUnitIndex = 0;

            while (partNum > 0) {
                const digit = partNum % 10;
                if (digit > 0) {
                    partStr = digits[digit] + smallUnits[smallUnitIndex] + partStr;
                }
                partNum = Math.floor(partNum / 10);
                smallUnitIndex++;
            }
            result.unshift(partStr + units[unitIndex]);
        }
        num = Math.floor(num / 10000);
        unitIndex++;
    }

    return result.join('') + ' 원';
};
