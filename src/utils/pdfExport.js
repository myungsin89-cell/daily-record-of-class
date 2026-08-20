import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 모달 리포트의 개별 섹션/블록이 중간에 잘리지 않고(Smart Page Break)
 * 인쇄물에 최적화된 콤팩트한 비율과 상하 사이즈로 A4 PDF를 생성하는 유틸리티
 */
export const exportElementToA4Pdf = async (element, fileName = '성적분석리포트.pdf', options = {}) => {
    if (!element) {
        throw new Error('PDF로 변환할 요소를 찾을 수 없습니다.');
    }

    const { onProgress } = options;

    try {
        if (onProgress) onProgress(true, 'PDF 생성 중...');

        // 1. 임시 복제 래퍼 생성
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.no-print, button').forEach(el => el.remove());

        // A4 PDF 레이아웃 상수 (단위: mm)
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = 210;
        const pdfHeight = 297;
        const marginTop = 10;
        const marginBottom = 10;
        const marginX = 10;
        const printableWidth = pdfWidth - (marginX * 2); // 190mm
        const printableHeight = pdfHeight - marginTop - marginBottom; // 277mm

        // 2. 가상 렌더링 컨테이너 설정 (860px로 설정하여 인쇄물에 맞는 정갈한 스케일 다운)
        const containerWidthPx = 860;
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-99999px';
        container.style.left = '0';
        container.style.width = `${containerWidthPx}px`;
        container.style.background = '#ffffff';
        container.style.color = '#0f172a';
        container.style.padding = '0';
        container.style.margin = '0';
        container.style.boxSizing = 'border-box';
        container.style.zIndex = '-9999';
        container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';

        // 3. 렌더링할 독립 블록(섹션) 리스트 구성
        const blockElements = [];

        // 3-1. 상단 인쇄 전용 헤더 + 1. KPI 카드 그리드 묶음
        const printHeader = clone.querySelector('.print-only-header');
        const kpiGrid = clone.querySelector('.dashboard-kpi-grid');
        if (printHeader || kpiGrid) {
            const headerBlock = document.createElement('div');
            headerBlock.style.padding = '4px 6px 8px 6px';
            headerBlock.style.background = '#ffffff';
            if (printHeader) {
                printHeader.style.display = 'block';
                printHeader.style.marginBottom = '10px';
                printHeader.style.paddingBottom = '6px';
                printHeader.style.borderBottom = '2px solid #16a34a';
                printHeader.style.textAlign = 'center';

                const h2 = printHeader.querySelector('h2');
                if (h2) {
                    h2.style.fontSize = '16pt';
                    h2.style.margin = '0 0 4px 0';
                }
                const profileInfo = printHeader.querySelector('.print-profile-info');
                if (profileInfo) {
                    profileInfo.style.fontSize = '9.5pt';
                    profileInfo.style.gap = '14px';
                }
                headerBlock.appendChild(printHeader.cloneNode(true));
            }
            if (kpiGrid) {
                const kpiClone = kpiGrid.cloneNode(true);
                kpiClone.style.display = 'grid';
                kpiClone.style.gridTemplateColumns = 'repeat(4, 1fr)';
                kpiClone.style.gap = '8px';
                kpiClone.style.marginBottom = '0';
                kpiClone.querySelectorAll('.kpi-card').forEach(c => {
                    c.style.padding = '8px 10px';
                    c.style.borderRadius = '8px';
                });
                headerBlock.appendChild(kpiClone);
            }
            blockElements.push(headerBlock);
        }

        // 3-2. 2. 교과별 성적 성취율 막대 차트 섹션
        const barSection = clone.querySelector('.dashboard-chart-section');
        if (barSection) {
            const barBlock = document.createElement('div');
            barBlock.style.padding = '4px 6px 8px 6px';
            barBlock.style.background = '#ffffff';

            const bTitle = barSection.querySelector('.section-title');
            if (bTitle) {
                bTitle.style.fontSize = '11.5pt';
                bTitle.style.margin = '0 0 6px 0';
            }
            barSection.querySelectorAll('.chart-bar-item').forEach(bi => {
                bi.style.marginBottom = '6px';
            });
            barSection.querySelectorAll('.bar-track').forEach(bt => {
                bt.style.height = '7px';
            });

            barBlock.appendChild(barSection.cloneNode(true));
            blockElements.push(barBlock);
        }

        // 3-3. 3. 단원평가 단원별 추이 그래프 섹션 (2열 블록화)
        const trendSection = clone.querySelector('.dashboard-trend-section');
        if (trendSection) {
            const titleEl = trendSection.querySelector('.section-title');
            const trendCards = trendSection.querySelectorAll('.trend-chart-card');

            if (trendCards.length > 0) {
                // 제목 블록
                if (titleEl) {
                    const trendTitleBlock = document.createElement('div');
                    trendTitleBlock.style.padding = '6px 6px 2px 6px';
                    trendTitleBlock.style.background = '#ffffff';
                    titleEl.style.fontSize = '11.5pt';
                    titleEl.style.margin = '0';
                    trendTitleBlock.appendChild(titleEl.cloneNode(true));
                    blockElements.push(trendTitleBlock);
                }

                // 2개씩 1행 단위로 블록화 (컴팩트 높이 적용)
                for (let i = 0; i < trendCards.length; i += 2) {
                    const rowBlock = document.createElement('div');
                    rowBlock.style.padding = '3px 6px 6px 6px';
                    rowBlock.style.display = 'grid';
                    rowBlock.style.gridTemplateColumns = 'repeat(2, 1fr)';
                    rowBlock.style.gap = '8px';
                    rowBlock.style.background = '#ffffff';

                    const card1 = trendCards[i].cloneNode(true);
                    card1.style.padding = '10px';
                    card1.style.borderRadius = '10px';
                    rowBlock.appendChild(card1);

                    if (trendCards[i + 1]) {
                        const card2 = trendCards[i + 1].cloneNode(true);
                        card2.style.padding = '10px';
                        card2.style.borderRadius = '10px';
                        rowBlock.appendChild(card2);
                    }
                    blockElements.push(rowBlock);
                }
            } else {
                const trendBlock = document.createElement('div');
                trendBlock.style.padding = '4px 6px 8px 6px';
                trendBlock.style.background = '#ffffff';
                trendBlock.appendChild(trendSection.cloneNode(true));
                blockElements.push(trendBlock);
            }
        }

        // 3-4. 4. 과정중심 수행평가 달성 현황 섹션 (2열 카드 쌍 단위 슬림 블록화)
        const perfSection = clone.querySelector('.dashboard-perf-section');
        if (perfSection) {
            const perfTitle = perfSection.querySelector('.section-title');
            const perfCards = perfSection.querySelectorAll('.perf-analysis-card');

            if (perfCards.length > 0) {
                // 제목 블록
                if (perfTitle) {
                    const perfTitleBlock = document.createElement('div');
                    perfTitleBlock.style.padding = '6px 6px 2px 6px';
                    perfTitleBlock.style.background = '#ffffff';
                    perfTitle.style.fontSize = '11.5pt';
                    perfTitle.style.margin = '0';
                    perfTitleBlock.appendChild(perfTitle.cloneNode(true));
                    blockElements.push(perfTitleBlock);
                }

                // 2개씩 1행 단위로 블록화하여 슬림한 상하 사이즈 적용
                for (let i = 0; i < perfCards.length; i += 2) {
                    const rowBlock = document.createElement('div');
                    rowBlock.style.padding = '3px 6px 6px 6px';
                    rowBlock.style.display = 'grid';
                    rowBlock.style.gridTemplateColumns = 'repeat(2, 1fr)';
                    rowBlock.style.gap = '8px';
                    rowBlock.style.background = '#ffffff';

                    const pCard1 = perfCards[i].cloneNode(true);
                    pCard1.style.padding = '8px 10px';
                    pCard1.style.borderRadius = '10px';
                    rowBlock.appendChild(pCard1);

                    if (perfCards[i + 1]) {
                        const pCard2 = perfCards[i + 1].cloneNode(true);
                        pCard2.style.padding = '8px 10px';
                        pCard2.style.borderRadius = '10px';
                        rowBlock.appendChild(pCard2);
                    }
                    blockElements.push(rowBlock);
                }
            } else {
                const perfBlock = document.createElement('div');
                perfBlock.style.padding = '4px 6px 8px 6px';
                perfBlock.style.background = '#ffffff';
                perfBlock.appendChild(perfSection.cloneNode(true));
                blockElements.push(perfBlock);
            }
        }

        // 3-5. 단원평가 상세표 등 기타 섹션
        const otherSections = clone.querySelectorAll('.dashboard-table-section, .eval-category-section');
        otherSections.forEach(sec => {
            const secBlock = document.createElement('div');
            secBlock.style.padding = '4px 6px 8px 6px';
            secBlock.style.background = '#ffffff';
            secBlock.appendChild(sec.cloneNode(true));
            blockElements.push(secBlock);
        });

        // 4. 각 블록을 순회하며 Canvas 캡처 & 스마트 페이지 자동 분할
        document.body.appendChild(container);

        let currentY = marginTop;
        let isFirstPage = true;

        for (let idx = 0; idx < blockElements.length; idx++) {
            const block = blockElements[idx];
            container.innerHTML = '';
            container.appendChild(block);

            // 고해상도 Canvas 캡처 (스케일 2 유지로 선명도 보장)
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: containerWidthPx
            });

            // mm 단위 높이 환산
            const blockHeightMm = (canvas.height * printableWidth) / canvas.width;
            const imgData = canvas.toDataURL('image/png', 1.0);

            // 남은 공간 검사: 현재 페이지에 들어갈 수 없으면 다음 페이지 맨 위로 넘김
            if (currentY + blockHeightMm > marginTop + printableHeight && !isFirstPage) {
                pdf.addPage();
                currentY = marginTop;
            }

            // 블록 이미지 출력
            pdf.addImage(imgData, 'PNG', marginX, currentY, printableWidth, blockHeightMm);
            currentY += blockHeightMm;
            isFirstPage = false;
        }

        // 임시 컨테이너 정리
        document.body.removeChild(container);

        // 5. 고해상도 PDF 다운로드 실행
        pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);

        if (onProgress) onProgress(false, '');
        return true;
    } catch (error) {
        console.error('Smart PDF export error:', error);
        if (onProgress) onProgress(false, '');
        throw error;
    }
};

/**
 * 자리배치표나 1인1역 등 단일 페이지 문서를 A4 가로/세로 규격에 딱 맞춰 고해상도 PDF로 내보내는 유틸리티
 */
export const exportSinglePageA4Pdf = async (element, fileName = '문서.pdf', options = {}) => {
    if (!element) throw new Error('PDF로 변환할 요소를 찾을 수 없습니다.');
    const { orientation = 'landscape', margin = 8, onProgress } = options;

    try {
        if (onProgress) onProgress(true, 'PDF 생성 중...');

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const isLandscape = orientation === 'landscape';
        const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = isLandscape ? 297 : 210;
        const pageHeight = isLandscape ? 210 : 297;

        const maxPrintWidth = pageWidth - (margin * 2);
        const maxPrintHeight = pageHeight - (margin * 2);

        // 원본 비율 유지하면서 A4 페이지에 맞춤
        const canvasRatio = canvas.width / canvas.height;
        let printWidth = maxPrintWidth;
        let printHeight = printWidth / canvasRatio;

        if (printHeight > maxPrintHeight) {
            printHeight = maxPrintHeight;
            printWidth = printHeight * canvasRatio;
        }

        // 페이지 정가운데 정렬
        const offsetX = margin + (maxPrintWidth - printWidth) / 2;
        const offsetY = margin + (maxPrintHeight - printHeight) / 2;

        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', offsetX, offsetY, printWidth, printHeight);

        pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
        if (onProgress) onProgress(false, '');
        return true;
    } catch (error) {
        console.error('Single page PDF export error:', error);
        if (onProgress) onProgress(false, '');
        throw error;
    }
};

/**
 * 부모 컨테이너(overflow, height 등)의 스타일 간섭 없이
 * 100% 독립된 iframe을 통해 깔끔하게 출력하는 안전 인쇄 헬퍼
 */
export const printHtmlElement = (element, options = {}) => {
    if (!element) return;
    const { orientation = 'landscape', title = '인쇄' } = options;

    // 기존 임시 print iframe이 있다면 제거
    const existingIframe = document.getElementById('print-sandbox-iframe');
    if (existingIframe) existingIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'print-sandbox-iframe';
    iframe.style.position = 'fixed';
    iframe.style.top = '-99999px';
    iframe.style.left = '-99999px';
    iframe.style.width = '1000px';
    iframe.style.height = '1000px';
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
                @page {
                    size: A4 ${orientation};
                    margin: 8mm;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    background: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
                    width: 100%;
                    height: 100%;
                }
                .print-container-wrapper {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
            </style>
        </head>
        <body>
            <div class="print-container-wrapper">
                ${element.outerHTML}
            </div>
        </body>
        </html>
    `);

    // 모든 현재 페이지의 link/style 태그 복사
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(styleTag => {
        doc.head.appendChild(styleTag.cloneNode(true));
    });

    doc.close();

    setTimeout(() => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error('Print iframe error:', e);
            window.print();
        } finally {
            setTimeout(() => {
                iframe.remove();
            }, 3000);
        }
    }, 300);
};
