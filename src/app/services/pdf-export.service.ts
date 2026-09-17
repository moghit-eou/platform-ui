import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { captureHtmlToPng, renderMipVersion } from '../core/pdf.utils';

interface PdfExportOptions {
    title: string;
    nodeLabel: string;
    modelLabel: string;
    datasetLabels: string[];
    description?: string;
    meta?: {
        pathNodes?: Array<{ code: string; label: string }>;
        groupCount: number;
        hasGroups: boolean;
    } | null;
    isGroupView: boolean;
}

interface DescriptiveStatsData {
    pathologyName?: string;
    variables: any[];
    models: any[];
    charts?: NodeListOf<HTMLElement>;
    nonNominalVariables?: any[];
    nominalCharts?: NodeListOf<HTMLElement>;
    nominalVariables?: any[];
    mipVersion?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class PdfExportService {

    constructor() { }

    async exportHistogramPdf(
        element: HTMLElement,
        options: PdfExportOptions
    ): Promise<void> {
        return this.withExportClass(async () => {
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const { title, nodeLabel, modelLabel, datasetLabels, description, meta, isGroupView } = options;

            doc.setFontSize(16);
            const titleLines = doc.splitTextToSize(title, 180);
            doc.text(titleLines, 12, 14);

            let cursorY = 14 + (titleLines.length * 6);

            if (nodeLabel) {
                doc.setFontSize(11);
                const nodeLabelLines = doc.splitTextToSize(nodeLabel, 180);
                doc.text(nodeLabelLines, 12, cursorY);
                cursorY += (nodeLabelLines.length * 5);
            }

            cursorY += 2;
            if (modelLabel) {
                doc.setFontSize(9);
                doc.text(`Data model: ${modelLabel}`, 12, cursorY);
                cursorY += 5;
            }
            if (!isGroupView && datasetLabels.length) {
                doc.setFontSize(9);
                const datasetLines = doc.splitTextToSize(`Datasets: ${datasetLabels.join(', ')}`, 180);
                doc.text(datasetLines, 12, cursorY);
                cursorY += datasetLines.length * 4 + 1;
            }
            if (!isGroupView && description) {
                doc.setFontSize(9);
                const descriptionLines = doc.splitTextToSize(`Description: ${description}`, 180);
                doc.text(descriptionLines, 12, cursorY);
                cursorY += descriptionLines.length * 4 + 1;
            }
            if (!isGroupView && meta?.pathNodes?.length) {
                const pathText = meta.pathNodes.map((node) => node.label).join(' > ');
                doc.setFontSize(9);
                const pathLines = doc.splitTextToSize(`Path: ${pathText}`, 180);
                doc.text(pathLines, 12, cursorY);
                cursorY += pathLines.length * 4 + 2;
            }
            if (!isGroupView && meta) {
                doc.setFontSize(9);
                const countLabel = meta.hasGroups ? 'Number of groups in' : 'Number of variables in';
                doc.text(`${countLabel} ${nodeLabel}: ${meta.groupCount}`, 12, cursorY);
                cursorY += 6;
            }

            const svgElement = element.querySelector('#histogram-chart svg') as SVGSVGElement | null;
            let imgData: string | null = null;
            let rawWidth = 0;
            let rawHeight = 0;

            if (svgElement) {
                const cloned = svgElement.cloneNode(true) as SVGSVGElement;
                if (!cloned.getAttribute('xmlns')) {
                    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                }
                const widthAttr = cloned.getAttribute('width');
                const heightAttr = cloned.getAttribute('height');
                rawWidth = widthAttr ? parseFloat(widthAttr) : svgElement.getBoundingClientRect().width;
                rawHeight = heightAttr ? parseFloat(heightAttr) : svgElement.getBoundingClientRect().height;

                const serializer = new XMLSerializer();
                const svgData = serializer.serializeToString(cloned);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                imgData = await new Promise<string | null>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const qualityScale = 3; // Increase resolution
                        const canvas = document.createElement('canvas');
                        const width = (rawWidth || img.width) * qualityScale;
                        const height = (rawHeight || img.height) * qualityScale;
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                            resolve(canvas.toDataURL('image/png', 1.0));
                        } else {
                            resolve(null);
                        }
                        URL.revokeObjectURL(url);
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        resolve(null);
                    };
                    img.src = url;
                });
            }

            if (!imgData) {
                const canvas = await html2canvas(element, {
                    backgroundColor: '#ffffff',
                    scale: 3.0,
                    useCORS: true,
                    logging: false,
                });
                imgData = canvas.toDataURL('image/png');
                rawWidth = canvas.width;
                rawHeight = canvas.height;
            }

            const pageWidth = 210;
            const margin = 12;
            const maxWidth = 150; // Reduced from 186 for better proportion and quality
            const imgHeight = rawWidth && rawHeight ? (rawHeight * maxWidth) / rawWidth : 120;
            const startY = cursorY;
            const maxHeight = 297 - startY - margin;

            let renderWidth = maxWidth;
            let renderHeight = imgHeight;
            if (imgHeight > maxHeight) {
                renderHeight = maxHeight;
                renderWidth = rawWidth && rawHeight ? (rawWidth * renderHeight) / rawHeight : maxWidth;
            }

            const renderX = (pageWidth - renderWidth) / 2;
            doc.addImage(imgData, 'PNG', renderX, startY, renderWidth, renderHeight);
            doc.save(`${nodeLabel ? nodeLabel.replace(/[^\w\s-]/g, '').trim() : 'histogram'}_summary.pdf`);
        } catch (err) {
            console.error('Histogram PDF export failed:', err);
            throw err;
        }
        });
    }

    async exportDescriptiveStatisticsPdf(data: DescriptiveStatsData): Promise<void> {
        return this.withExportClass(async () => {
        const doc = new jsPDF();
        let yOffset = 10;

        try {
            // Add pathology name header if provided
            if (data.pathologyName) {
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                const pathLines = doc.splitTextToSize(data.pathologyName, 180);
                doc.text(pathLines, 10, yOffset);
                yOffset += (pathLines.length * 7);
                doc.setFont('helvetica', 'normal');
            }

            const addSection = (title: string, tableData: any[]) => {
                if (!tableData?.length) return;
                doc.setFontSize(14);
                doc.text(title, 10, yOffset);
                yOffset += 8;
                tableData.forEach((v: any) => {
                    doc.setFontSize(12);
                    doc.text(v.name, 10, yOffset);
                    yOffset += 6;
                    const head = [['Metric', ...v.columns]];
                    const body = v.rows.map((r: any) => [
                        r.metric,
                        ...v.columns.map((ds: any) => r.values[ds])
                    ]);
                    autoTable(doc, {
                        startY: yOffset,
                        head,
                        body,
                        styles: { fontSize: 9 },
                        margin: { left: 10, right: 10 },
                    });
                    const last = (doc as any).lastAutoTable?.finalY ?? yOffset;
                    yOffset = last + 10;
                    if (yOffset > 270) { doc.addPage(); yOffset = 20; }
                });
            };

            // Variables + Model
            addSection('Variables', data.variables || []);
            addSection('Model', data.models || []);

            // Boxplots (Numeric Variables)
            if (data.charts?.length && data.nonNominalVariables?.length) {
                for (let i = 0; i < data.charts.length; i++) {
                    doc.addPage();
                    yOffset = 20;

                    if (i === 0) {
                        doc.setFontSize(14);
                        doc.text('Box Plot Charts (Numeric)', 10, yOffset);
                        yOffset += 10;
                    }

                    const label =
                        data.nonNominalVariables[i]?.name ||
                        data.nonNominalVariables[i]?.label ||
                        `Variable ${i + 1}`;
                    const chartEl = data.charts[i];
                    if (!chartEl) continue;

                    try {
                        const { dataUrl: imgData, width: canvasWidth, height: canvasHeight } = await captureHtmlToPng(chartEl, 3);
                        const imgWidth = 180;
                        const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

                        doc.setFontSize(11);
                        doc.text(label, 15, yOffset);
                        yOffset += 6;

                        doc.addImage(imgData, 'PNG', 15, yOffset, imgWidth, imgHeight);
                        yOffset += imgHeight + 12;
                    } catch (err) {
                        console.warn('Failed to render chart', label, err);
                        doc.text(`${label} — (chart not ready)`, 15, yOffset);
                        yOffset += 10;
                    }
                }
            }

            // Nominal Charts (Grouped Bar Charts)
            if (data.nominalCharts?.length && data.nominalVariables?.length) {
                for (let i = 0; i < data.nominalCharts.length; i++) {
                    doc.addPage();
                    yOffset = 20;

                    if (i === 0) {
                        doc.setFontSize(14);
                        doc.text('Frequency Charts (Nominal)', 10, yOffset);
                        yOffset += 10;
                    }

                    const label =
                        data.nominalVariables[i]?.name ||
                        data.nominalVariables[i]?.label ||
                        `Nominal Variable ${i + 1}`;
                    const chartEl = data.nominalCharts[i];
                    if (!chartEl) continue;

                    try {
                        const { dataUrl: imgData, width: canvasWidth, height: canvasHeight } = await captureHtmlToPng(chartEl, 3);
                        const imgWidth = 180;
                        const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

                        doc.setFontSize(11);
                        doc.text(label, 15, yOffset);
                        yOffset += 6;

                        doc.addImage(imgData, 'PNG', 15, yOffset, imgWidth, imgHeight);
                        yOffset += imgHeight + 12;
                    } catch (err) {
                        console.warn('Failed to render nominal chart', label, err);
                        doc.text(`${label} — (chart not ready)`, 15, yOffset);
                        yOffset += 10;
                    }
                }
            }

            if (data.mipVersion) {
                renderMipVersion(doc, data.mipVersion, {
                    pageWidth: doc.internal.pageSize.getWidth(),
                    pageHeight: doc.internal.pageSize.getHeight(),
                    right: 10,
                    bottom: 10,
                });
            }

            doc.save('descriptive_statistics.pdf');
        } catch (err) {
            console.error('Descriptive statistics PDF export failed:', err);
            throw err;
        }
        });
    }

    private async withExportClass<T>(fn: () => Promise<T>): Promise<T> {
        document.body.classList.add('pdf-exporting');
        await new Promise((res) => setTimeout(res, 50));
        try {
            return await fn();
        } finally {
            document.body.classList.remove('pdf-exporting');
        }
    }
}
