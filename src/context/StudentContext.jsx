import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useClass } from './ClassContext';
import { useAuth } from './AuthContext';
import useIndexedDB from '../hooks/useIndexedDB';
import { STORES } from '../db/indexedDB';
import { fetchKoreanHolidays } from '../utils/holidayAPI';

const StudentContext = createContext();

// Define initial values outside component to avoid recreating on each render
const INITIAL_ARRAY = [];
const INITIAL_OBJECT = {}

    ;

export const useStudentContext = () => useContext(StudentContext); // eslint-disable-line react-refresh/only-export-components

export const StudentProvider = ({ children }) => {
    const { currentClass } = useClass();
    const { user } = useAuth();
    const classId = currentClass?.id || 'default';
    const dataKey = user ? `${user.username}_${classId}` : classId;

    const [students, setStudents, isLoadingStudents] = useIndexedDB(STORES.STUDENTS, dataKey, INITIAL_ARRAY);
    const [attendance, setAttendance, isLoadingAttendance] = useIndexedDB(STORES.ATTENDANCE, dataKey, INITIAL_OBJECT);
    const [journals, setJournals, isLoadingJournals] = useIndexedDB(STORES.JOURNALS, dataKey, INITIAL_OBJECT);
    const [evaluations, setEvaluations, isLoadingEvaluations] = useIndexedDB(STORES.EVALUATIONS, dataKey, INITIAL_OBJECT);
    const [finalizedEvaluations, setFinalizedEvaluations, isLoadingFinalized] = useIndexedDB(STORES.FINALIZED_EVALUATIONS, dataKey, INITIAL_OBJECT);
    const [fieldTrips, setFieldTrips, isLoadingFieldTrips] = useIndexedDB(STORES.FIELD_TRIPS, dataKey, INITIAL_OBJECT);
    const [holidays, setHolidays, isLoadingHolidays] = useIndexedDB(STORES.HOLIDAYS, new Date().getFullYear().toString(), INITIAL_ARRAY);
    const holidayAutoFetchDone = useRef(false);

    const isLoading = isLoadingStudents || isLoadingAttendance || isLoadingJournals || isLoadingEvaluations || isLoadingFinalized || isLoadingFieldTrips || isLoadingHolidays;

    // 앱 시작 시 공휴일이 비어있으면 자동으로 API에서 가져오기
    useEffect(() => {
        if (isLoadingHolidays || holidayAutoFetchDone.current) return;

        // 이미 공휴일 데이터가 있으면 API 호출 불필요
        if (holidays && holidays.length > 0) {
            holidayAutoFetchDone.current = true;
            return;
        }

        holidayAutoFetchDone.current = true;
        const currentYear = new Date().getFullYear();

        console.log(`📅 공휴일 데이터가 없습니다. ${currentYear}년 공휴일을 자동으로 가져옵니다...`);

        fetchKoreanHolidays(currentYear)
            .then((fetchedHolidays) => {
                if (fetchedHolidays && fetchedHolidays.length > 0) {
                    const sorted = [...fetchedHolidays].sort((a, b) => a.date.localeCompare(b.date));
                    setHolidays(sorted);
                    console.log(`✅ ${currentYear}년 공휴일 ${sorted.length}개 자동 등록 완료`);
                }
            })
            .catch((error) => {
                console.warn('⚠️ 공휴일 자동 가져오기 실패 (설정에서 수동으로 가져올 수 있습니다):', error.message);
            });
    }, [isLoadingHolidays, holidays, setHolidays]);

    const addStudent = (student) => {
        setStudents([...students, student]);
    };

    const addStudents = (newStudents) => {
        setStudents([...students, ...newStudents]);
    };

    const removeStudent = (id) => {
        setStudents(students.filter((s) => s.id !== id));
        // Optional: Cleanup attendance and journals for removed student
    };

    const updateAttendance = (date, studentId, status) => {
        setAttendance((prev) => {
            const newAttendance = { ...prev };

            // If status is null, remove the student's attendance for that date
            if (status === null) {
                if (newAttendance[date]) {
                    const updatedDate = { ...newAttendance[date] };
                    delete updatedDate[studentId];

                    // If no students left for this date, remove the date entry
                    if (Object.keys(updatedDate).length === 0) {
                        delete newAttendance[date];
                    } else {
                        newAttendance[date] = updatedDate;
                    }
                }
            } else {
                // Set or update the status
                newAttendance[date] = {
                    ...newAttendance[date],
                    [studentId]: status,
                };
            }

            return newAttendance;
        });
    };

    const addJournalEntry = (studentId, entry) => {
        setJournals((prev) => ({
            ...prev,
            [studentId]: [...(prev[studentId] || []), entry],
        }));
    };

    const saveEvaluation = (studentId, evaluation) => {
        setEvaluations((prev) => ({
            ...prev,
            [studentId]: evaluation,
        }));
    };

    const saveFinalizedEvaluation = (studentId, evaluation) => {
        setFinalizedEvaluations((prev) => ({
            ...prev,
            [studentId]: evaluation,
        }));
    };

    const saveFieldTripMetadata = (studentId, metadata) => {
        setFieldTrips((prev) => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                ...metadata
            }
        }));
    };

    const addHoliday = (holiday) => {
        setHolidays((prev) => {
            // Handle both old format (string) and new format (object)
            const existingDates = prev.map(h => typeof h === 'string' ? h : h.date);
            const newDate = typeof holiday === 'string' ? holiday : holiday.date;

            if (!existingDates.includes(newDate)) {
                return [...prev, holiday].sort((a, b) => {
                    const dateA = typeof a === 'string' ? a : a.date;
                    const dateB = typeof b === 'string' ? b : b.date;
                    return dateA.localeCompare(dateB);
                });
            }
            return prev;
        });
    };

    const removeHoliday = (dateString) => {
        setHolidays((prev) => prev.filter(h => {
            const holidayDate = typeof h === 'string' ? h : h.date;
            return holidayDate !== dateString;
        }));
    };

    return (
        <StudentContext.Provider
            value={{
                students,
                addStudent,
                addStudents,
                removeStudent,
                attendance,
                updateAttendance,
                journals,
                addJournalEntry,
                evaluations,
                saveEvaluation,
                finalizedEvaluations,
                saveFinalizedEvaluation,
                fieldTrips,
                saveFieldTripMetadata,
                holidays,
                addHoliday,
                removeHoliday,
                isLoading,
            }}
        >
            {children}
        </StudentContext.Provider>
    );
};
