/**
 * Seating Chart Utility Module
 * 
 * Handles generation of seating grids, random placement with constraints,
 * and manual swapping of seats.
 */

/**
 * Generates an empty seating grid layout
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @param {number} pairSize - Number of students per pair group (e.g., 2)
 * @returns {Array} - Array of row objects containing seat positions
 */
export const generateEmptyGrid = (rows, cols, pairSize = 2) => {
    const grid = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                row: r,
                col: c,
                studentId: null,
                genderPreference: null, // '남' or '여'
                isGap: ((c + 1) % pairSize === 0 && (c + 1) < cols)
            });
        }
        grid.push(row);
    }
    return grid;
};

/**
 * Shuffle array using Fisher-Yates algorithm
 */
const shuffle = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

/**
 * Checks if two students can sit together based on avoidance constraints
 */
const canSitTogether = (student1Id, student2Id, avoidances) => {
    if (!student1Id || !student2Id || !avoidances) return true;
    return !avoidances.some(pair => 
        (pair.s1 === student1Id && pair.s2 === student2Id) ||
        (pair.s1 === student2Id && pair.s2 === student1Id)
    );
};

/**
 * Assigns students to seats based on complex AI constraints with strict avoidance verification
 */
export const assignSeatsRandomly = (students, grid, constraints, useFemaleSeats) => {
    const { avoidances = [], frontPreference = [], pairs = [] } = constraints;

    // Helper: Find student ID at specific coordinates
    const getStudentAt = (targetGrid, r, c) => {
        if (r < 0 || r >= targetGrid.length || c < 0 || c >= targetGrid[0].length) return null;
        return targetGrid[r][c].studentId;
    };

    // Helper: Verify all avoidance constraints for a given grid
    const verifyAvoidances = (targetGrid) => {
        for (let r = 0; r < targetGrid.length; r++) {
            for (let c = 0; c < targetGrid[r].length; c++) {
                const s1Id = targetGrid[r][c].studentId;
                if (!s1Id) continue;

                const neighbors = [
                    { r: r, c: c + 1 }, // Right
                    { r: r, c: c - 1 }, // Left
                    { r: r + 1, c: c }, // Back
                    { r: r - 1, c: c }  // Front
                ];

                for (let n of neighbors) {
                    const s2Id = getStudentAt(targetGrid, n.r, n.c);
                    if (!s2Id) continue;

                    // If both students are in the same avoidance group, it's invalid
                    if (avoidances.some(group => 
                        group.studentIds.includes(s1Id) && group.studentIds.includes(s2Id)
                    )) {
                        return false;
                    }
                }
            }
        }
        return true;
    };

    let bestGrid = null;
    let maxAttempts = 200; // Increased attempts
    
    // Retry loop to find a configuration that satisfies ALL avoidances
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let resultGrid = JSON.parse(JSON.stringify(grid));
        resultGrid.forEach(row => row.forEach(seat => seat.studentId = null));

        const femaleOnlySeats = [];
        const neutralSeats = [];
        const frontSideSeats = []; 
        resultGrid.forEach((row, r) => {
            row.forEach((seat, c) => {
                if (seat.genderPreference === 'blocked') return;
                const seatRef = { r, c };
                // use useFemaleSeats from the parameter properly
                if (useFemaleSeats && seat.genderPreference === '여') femaleOnlySeats.push(seatRef);
                else neutralSeats.push(seatRef);
                if (r <= 1) frontSideSeats.push(seatRef);
            });
        });

        const getSeat = (r, c) => resultGrid[r][c];
        
        // Helper to find N adjacent seats starting from (r, c)
        const findAdjacentSeats = (r, c, n, pool) => {
            const seats = [];
            for (let i = 0; i < n; i++) {
                const currentC = c + i;
                // Check if seat exists in pool and is not already taken
                const seatInPool = pool.find(s => s.r === r && s.c === currentC);
                if (!seatInPool) return null;
                
                const seat = getSeat(r, currentC);
                if (seat.studentId) return null;
                
                seats.push({r, c: currentC});
                
                // If we need more seats but the current one is an aisle (isGap), 
                // we cannot continue for a mandatory pair
                if (i < n - 1 && seat.isGap) return null;
            }
            return seats;
        };

        let unplacedStudents = shuffle([...students]);
        
        // Step 1: Mandatory Groups (Pairs/Groups)
        pairs.forEach(group => {
            const groupStudents = unplacedStudents.filter(s => group.studentIds.includes(s.id));
            if (groupStudents.length < 2) return;

            // Sort group students by gender if useFemaleSeats is on to match pool structure
            const sortedGroup = [...groupStudents].sort((a, b) => {
                if (a.gender === '여' && b.gender !== '여') return -1;
                if (a.gender !== '여' && b.gender === '여') return 1;
                return 0;
            });

            const targetPool = shuffle([...femaleOnlySeats, ...neutralSeats]);
            for (let seat of targetPool) {
                if (getSeat(seat.r, seat.c).studentId) continue;
                
                const adjacent = findAdjacentSeats(seat.r, seat.c, sortedGroup.length, targetPool);
                if (adjacent) {
                    // Check gender constraints for the whole group
                    let genderOk = true;
                    for(let i=0; i<adjacent.length; i++) {
                        const s = sortedGroup[i];
                        const st = getSeat(adjacent[i].r, adjacent[i].c);
                        if (useFemaleSeats && st.genderPreference === '여' && s.gender !== '여') {
                            genderOk = false;
                            break;
                        }
                    }
                    if (!genderOk) continue;

                    // Place them
                    adjacent.forEach((seatPos, idx) => {
                        getSeat(seatPos.r, seatPos.c).studentId = sortedGroup[idx].id;
                    });
                    unplacedStudents = unplacedStudents.filter(s => !group.studentIds.includes(s.id));
                    break;
                }
            }
        });

        // Step 2: Front Preference
        const frontStudents = unplacedStudents.filter(s => frontPreference.includes(s.id));
        shuffle(frontStudents).forEach(student => {
            const targetPool = shuffle(frontSideSeats.filter(s => !getSeat(s.r, s.c).studentId));
            for (let seat of targetPool) {
                if (useFemaleSeats && getSeat(seat.r, seat.c).genderPreference === '여' && student.gender !== '여') continue;
                getSeat(seat.r, seat.c).studentId = student.id;
                unplacedStudents = unplacedStudents.filter(s => s.id !== student.id);
                break;
            }
        });

        // Step 3: Females in Female Seats (Only if enabled)
        if (useFemaleSeats) {
            unplacedStudents.filter(s => s.gender === '여').forEach(student => {
                const femaleSeats = femaleOnlySeats.filter(s => !getSeat(s.r, s.c).studentId);
                if (femaleSeats.length > 0) {
                    const seat = femaleSeats[0];
                    getSeat(seat.r, seat.c).studentId = student.id;
                    unplacedStudents = unplacedStudents.filter(s => s.id !== student.id);
                }
            });
        }

        // Step 4: Others
        const remainingSeats = shuffle([...femaleOnlySeats, ...neutralSeats].filter(s => !getSeat(s.r, s.c).studentId));
        shuffle(unplacedStudents).forEach((student, i) => {
            if (i < remainingSeats.length) {
                const seat = remainingSeats[i];
                getSeat(seat.r, seat.c).studentId = student.id;
            }
        });

        // Verification
        if (verifyAvoidances(resultGrid)) {
            return resultGrid; // Found perfect grid!
        }
        bestGrid = resultGrid; // Keep last one if we fail to find perfect
    }

    return bestGrid;
};
