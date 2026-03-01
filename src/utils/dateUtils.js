/**
 * Groups consecutive dates into range objects, considering weekends and holidays.
 * Dates separated only by weekends/holidays are considered consecutive.
 * @param {string[]} dates - Array of date strings (YYYY-MM-DD).
 * @param {string[]} holidays - Array of holiday date strings (optional).
 * @returns {object[]} - Array of grouped date objects.
 */
export const groupConsecutiveDates = (dates, holidays = []) => {
    if (!dates || !dates.length) return [];

    const sortedDates = [...dates].sort();
    const groups = [];
    let currentGroup = [sortedDates[0]];

    for (let i = 1; i < sortedDates.length; i++) {
        const prevDateStr = currentGroup[currentGroup.length - 1];
        const currDateStr = sortedDates[i];

        // Check if dates are consecutive (considering weekends and holidays)
        if (isConsecutiveSchoolDate(prevDateStr, currDateStr, holidays)) {
            currentGroup.push(sortedDates[i]);
        } else {
            groups.push(currentGroup);
            currentGroup = [sortedDates[i]];
        }
    }
    groups.push(currentGroup);

    return groups.map(group => ({
        startDate: group[0],
        endDate: group[group.length - 1],
        totalDays: group.length,
        allDates: group
    }));
};

/**
 * Checks if two dates are consecutive school dates (separated only by weekends/holidays)
 * @param {string} date1 - First date (YYYY-MM-DD)
 * @param {string} date2 - Second date (YYYY-MM-DD)
 * @param {string[]} holidays - Array of holiday date strings
 * @returns {boolean} - True if dates are consecutive school dates
 */
const isConsecutiveSchoolDate = (date1, date2, holidays = []) => {
    const [year1, month1, day1] = date1.split('-').map(Number);
    const [year2, month2, day2] = date2.split('-').map(Number);

    const startDate = new Date(year1, month1 - 1, day1);
    const endDate = new Date(year2, month2 - 1, day2);

    // Calculate difference in days
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    // If directly consecutive (1 day apart), return true
    if (diffDays === 1) return true;

    // If more than 1 day apart, check if only weekends/holidays are in between
    if (diffDays > 1 && diffDays <= 7) { // Only check up to 7 days (reasonable gap)
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + 1); // Start from next day

        while (currentDate < endDate) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;

            // If there's a school day (not weekend and not holiday) in between, not consecutive
            if (!isWeekend(dateString) && !isHoliday(dateString, holidays)) {
                return false;
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return true; // All days in between are weekends/holidays
    }

    return false; // More than 7 days apart
};

/**
 * Converts Date object to YYYY-MM-DD string in local timezone
 * @param {Date} date - Date object
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export const formatDateToString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Converts date string to Korean format (M.D)
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {string} - Korean formatted date (M.D)
 */
export const formatDateKorean = (dateString) => {
    // Parse as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    return `${month}.${day}`;
};

/**
 * Checks if a date is a weekend (Saturday or Sunday)
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {boolean} - True if weekend
 */
export const isWeekend = (dateString) => {
    // Parse as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
};

/**
 * Checks if a date is a holiday
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @param {string[]} holidays - Array of holiday date strings
 * @returns {boolean} - True if holiday
 */
export const isHoliday = (dateString, holidays = []) => {
    return holidays.some(holiday => {
        const holidayDate = typeof holiday === 'string' ? holiday : holiday.date;
        return holidayDate === dateString;
    });
};

/**
 * Calculates school days (excluding weekends and holidays)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string[]} holidays - Array of holiday date strings
 * @returns {number} - Number of school days
 */
export const calculateSchoolDays = (startDate, endDate, holidays = []) => {
    // Parse as local dates to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    let schoolDays = 0;

    const currentDate = new Date(start);
    while (currentDate <= end) {
        // Format date as YYYY-MM-DD
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        // Count only if not weekend and not holiday
        if (!isWeekend(dateString) && !isHoliday(dateString, holidays)) {
            schoolDays++;
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return schoolDays;
};
