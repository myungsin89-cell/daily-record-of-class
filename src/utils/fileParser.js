import mammoth from 'mammoth';

/**
 * Parse text content from various file formats
 * @param {File} file - The file to parse
 * @returns {Promise<string>} - Extracted text content
 */
export const parseFile = async (file) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();

    try {
        switch (fileExtension) {
            case 'txt':
                return await parseTxtFile(file);

            case 'docx':
                return await parseDocxFile(file);

            default:
                throw new Error(`ì§€?í•˜ì§€ ?ŠëŠ” ?Œì¼ ?•ì‹?…ë‹ˆ?? .${fileExtension}`);
        }
    } catch (error) {
        console.error('File parsing error:', error);
        throw error;
    }
};

/**
 * Parse plain text file
 */
const parseTxtFile = async (file) => {
    return await file.text();
};

/**
 * Parse Word document (.docx)
 */
const parseDocxFile = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });

    if (!result.value || result.value.trim().length === 0) {
        throw new Error('Word ?Œì¼?ì„œ ?ìŠ¤?¸ë? ì¶”ì¶œ?????†ìŠµ?ˆë‹¤.');
    }

    return result.value;
};

/**
 * Get supported file extensions
 */
export const getSupportedExtensions = () => {
    return ['.txt', '.docx'];
};

/**
 * Validate file type
 */
export const isFileSupported = (filename) => {
    const extension = '.' + filename.split('.').pop().toLowerCase();
    return getSupportedExtensions().includes(extension);
};
