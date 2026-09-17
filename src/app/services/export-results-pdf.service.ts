import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { captureHtmlToPng, renderMipVersion } from '../core/pdf.utils';
import { prettifyLabel } from '../core/algorithm-mappers';
import { getAlgorithmTableBuilder, TableSpec } from '../pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry';

interface ExperimentPdfDetails {
  experimentName: string;
  createdBy?: string | null;
  createdAt?: Date | string | null;
  algorithm?: string | null;
  params?: Record<string, unknown> | null;
  preprocessing?: string | null;
  domain?: string | null;
  datasets?: string[] | null;
  variables?: string[] | null;
  covariates?: string[] | null;
  filters?: string[] | null;
  interactions?: string | string[] | null;
  transformations?: string | string[] | null;
  mipVersion?: string | null;
}

interface ExperimentPdfPayload {
  filename: string;
  details: ExperimentPdfDetails;
  algorithmKey?: string | null;
  result?: any;
  chartContainer?: HTMLElement | null;
}

@Injectable({ providedIn: 'root' })
export class ResultsPdfExportService {
  private readonly platformName = 'Medical Informatics Platform';
  private readonly logoUrl = '/assets/mip-logo.png';

  async exportExperimentPdf(payload: ExperimentPdfPayload): Promise<void> {
    if (!payload?.details?.experimentName) {
      console.warn('PdfExportService: missing experiment details.');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = { left: 18, right: 18, top: 24, bottom: 18 };
    const contentWidth = pageWidth - margin.left - margin.right;

    const logoData = await this.loadImageData(this.logoUrl);
    const createdAt = this.formatDate(payload.details.createdAt);
    const timestamp = this.formatTimestamp(new Date());

    // Cover page
    this.renderCoverPage(doc, {
      margin,
      experimentName: payload.details.experimentName,
      createdBy: payload.details.createdBy,
      createdAt,
    });

    // Details page
    doc.addPage();
    this.renderDetailsPage(doc, {
      margin,
      contentWidth,
      details: payload.details,
    });

    // Results pages
    const tables = this.getTablesForAlgorithm(payload.algorithmKey, payload.result);
    const chartImages = await this.captureChartImages(payload.chartContainer);

    const resultItems: Array<
      { type: 'table'; table: TableSpec } | { type: 'chart'; title: string; image: string }
    > = [];

    tables.forEach((table) => resultItems.push({ type: 'table', table }));
    chartImages.forEach((image, index) =>
      resultItems.push({ type: 'chart', title: `Chart ${index + 1}`, image })
    );

    if (resultItems.length === 0) {
      doc.addPage();
      this.renderResultEmptyPage(doc, { pageWidth, margin });
    } else {
      for (const item of resultItems) {
        doc.addPage();
        if (item.type === 'table') {
          this.renderTablePage(doc, {
            margin,
            contentWidth,
            table: item.table,
          });
        } else {
          this.renderChartPage(doc, {
            pageWidth,
            pageHeight,
            margin,
            contentWidth,
            title: item.title,
            image: item.image,
          });
        }
      }
    }

    this.applyHeadersAndFooters(doc, {
      logoData,
      pageWidth,
      pageHeight,
      margin,
      timestamp,
      platformName: this.platformName,
    });

    if (payload.details.mipVersion) {
      renderMipVersion(doc, payload.details.mipVersion, {
        pageWidth,
        pageHeight,
        right: margin.right,
        bottom: margin.bottom + 2,
      });
    }

    const safeName = (payload.filename || 'experiment-report').replace(/\s+/g, '_');
    doc.save(safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`);
  }

  private renderCoverPage(
    doc: jsPDF,
    options: {
      margin: { left: number; right: number; top: number };
      experimentName: string;
      createdBy?: string | null;
      createdAt: string;
    }
  ): void {
    const { margin, experimentName, createdBy, createdAt } = options;
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setTextColor(0);
    doc.setFontSize(22);

    const nameLines: string[] = doc.splitTextToSize(experimentName, pageWidth - margin.left - margin.right);
    let currentY = 110;

    nameLines.forEach((line) => {
      doc.text(line, margin.left, currentY);
      currentY += 10;
    });

    doc.setDrawColor(2, 122, 122);
    doc.setLineWidth(0.6);
    doc.line(margin.left, currentY - 8, margin.left + 50, currentY - 8);

    doc.setFontSize(11);
    doc.setTextColor(110);
    const createdLine = this.buildCreatedLine(createdBy, createdAt);
    const createdLines: string[] = doc.splitTextToSize(createdLine, pageWidth - margin.left - margin.right);

    createdLines.forEach((line) => {
      doc.text(line, margin.left, currentY - 2);
      currentY += 6;
    });
  }

  private renderDetailsPage(
    doc: jsPDF,
    options: {
      margin: { left: number; right: number; top: number };
      contentWidth: number;
      details: ExperimentPdfDetails;
    }
  ): void {
    const { margin, contentWidth, details } = options;
    let y = margin.top + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text('Experiment details', margin.left, y);
    doc.setDrawColor(2, 122, 122);
    doc.setLineWidth(0.6);
    doc.line(margin.left, y + 2, margin.left + 52, y + 2);
    y += 8;

    const cardTop = y + 2;
    const cardPadding = 8;
    const cardWidth = contentWidth;
    const gutter = 8;
    const columnWidth = (cardWidth - gutter) / 2;
    const lineHeight = 5.5;

    const paramLines = this.formatParams(details.params);
    const entries = [
      { label: 'Algorithm', value: details.algorithm || 'Unknown' },
      { label: 'Params', value: paramLines.length ? paramLines : ['none'] },
      { label: 'Preprocessing', value: details.preprocessing || 'none' },
      { label: 'Domain', value: details.domain || 'none' },
      { label: 'Datasets', value: this.formatList(details.datasets) },
      { label: 'Variables', value: this.formatList(details.variables) },
      { label: 'Covariates', value: this.formatList(details.covariates) },
      { label: 'Filter', value: this.formatList(details.filters) },
    ].filter(e => e.value && e.value !== 'none' && (!Array.isArray(e.value) || e.value.length > 0));

    const normalizeLines = (value: string | string[]) => {
      if (Array.isArray(value)) {
        return value.flatMap((item: string) => {
          const bullet = '• ';
          const bulletWidth = doc.getTextWidth(bullet);
          const wrapped = doc.splitTextToSize(String(item), columnWidth - 4 - bulletWidth);
          return wrapped.map((line: string, index: number) =>
            index === 0 ? bullet + line : '  ' + line
          );
        });
      }
      return doc.splitTextToSize(String(value), columnWidth - 4);
    };

    const getBlockHeight = (value: string | string[]) => {
      const lines = normalizeLines(value);
      return lineHeight + lines.length * lineHeight + 2;
    };

    let rowY = cardTop + cardPadding;
    doc.setFontSize(11);
    doc.setTextColor(30);

    for (let i = 0; i < entries.length; i += 2) {
      const left = entries[i];
      const right = entries[i + 1];
      const leftHeight = getBlockHeight(left.value);
      const rightHeight = right ? getBlockHeight(right.value) : 0;
      const rowHeight = Math.max(leftHeight, rightHeight);

      const renderCell = (entry: { label: string; value: string | string[] }, x: number) => {
        doc.setFont('helvetica', 'bold');
        doc.text(entry.label, x, rowY);
        doc.setFont('helvetica', 'normal');
        const lines = normalizeLines(entry.value);
        let textY = rowY + lineHeight;
        lines.forEach((line: string) => {
          doc.text(String(line), x, textY);
          textY += lineHeight;
        });
      };

      renderCell(left, margin.left + cardPadding);
      if (right) {
        renderCell(right, margin.left + cardPadding + columnWidth + gutter);
      }

      rowY += rowHeight + 2;
    }

    const cardHeight = rowY - cardTop + cardPadding;
    doc.setDrawColor(218);
    doc.setFillColor(249, 251, 251);
    doc.roundedRect(margin.left, cardTop, cardWidth, cardHeight, 3, 3, 'FD');

    // Redraw text on top of the card
    rowY = cardTop + cardPadding;
    doc.setTextColor(30);
    for (let i = 0; i < entries.length; i += 2) {
      const left = entries[i];
      const right = entries[i + 1];
      const leftHeight = getBlockHeight(left.value);
      const rightHeight = right ? getBlockHeight(right.value) : 0;
      const rowHeight = Math.max(leftHeight, rightHeight);

      const renderCell = (entry: { label: string; value: string | string[] }, x: number) => {
        doc.setFont('helvetica', 'bold');
        doc.text(entry.label, x, rowY);
        doc.setFont('helvetica', 'normal');
        const lines = normalizeLines(entry.value);
        let textY = rowY + lineHeight;
        lines.forEach((line: string) => {
          doc.text(String(line), x, textY);
          textY += lineHeight;
        });
      };

      renderCell(left, margin.left + cardPadding);
      if (right) {
        renderCell(right, margin.left + cardPadding + columnWidth + gutter);
      }

      rowY += rowHeight + 2;
    }

    y = cardTop + cardHeight + 10;

    const hasInteractions = details.interactions && details.interactions !== 'none' && (!Array.isArray(details.interactions) || details.interactions.length > 0);
    const hasTransformations = details.transformations && details.transformations !== 'none' && (!Array.isArray(details.transformations) || details.transformations.length > 0);

    if (hasInteractions || hasTransformations) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('Formula', margin.left, y);
      doc.setDrawColor(230);
      doc.setLineWidth(0.4);
      doc.line(margin.left, y + 2, margin.left + 26, y + 2);
      y += 8;
      doc.setFont('helvetica', 'normal');

      if (hasInteractions) {
        y = this.renderKeyValue(doc, {
          label: 'Interactions',
          value: details.interactions ?? 'none',
          x: margin.left,
          y,
          maxWidth: contentWidth,
        });
      }

      if (hasTransformations) {
        y = this.renderKeyValue(doc, {
          label: 'Transformations',
          value: details.transformations ?? 'none',
          x: margin.left,
          y,
          maxWidth: contentWidth,
        });
      }
    }
  }

  private renderTablePage(
    doc: jsPDF,
    options: {
      margin: { left: number; right: number; top: number; bottom: number };
      contentWidth: number;
      table: TableSpec;
    }
  ): void {
    const { margin, contentWidth, table } = options;
    let y = margin.top + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(table.title || 'Results Table', margin.left, y);
    y += 6;

    const rows = (table.rows || []).map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
    );

    autoTable(doc, {
      head: [table.columns || []],
      body: rows,
      startY: y,
      margin: { left: margin.left, right: margin.right },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [220, 230, 230] },
      headStyles: { fillColor: [2, 122, 122], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 249, 249] },
      tableWidth: contentWidth,
      rowPageBreak: 'avoid',
    });
  }

  private renderChartPage(
    doc: jsPDF,
    options: {
      pageWidth: number;
      pageHeight: number;
      margin: { left: number; right: number; top: number; bottom: number };
      contentWidth: number;
      title: string;
      image: string;
    }
  ): void {
    const { pageWidth, pageHeight, margin, contentWidth, title, image } = options;
    let y = margin.top + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(title, margin.left, y);
    y += 6;

    const availableHeight = pageHeight - y - margin.bottom;

    const imgProps = (doc as any).getImageProperties(image);
    const imgWidth = contentWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    const finalHeight = Math.min(imgHeight, availableHeight);
    const finalWidth = (imgProps.width * finalHeight) / imgProps.height;
    const x = (pageWidth - finalWidth) / 2;

    doc.addImage(image, 'PNG', x, y, finalWidth, finalHeight);
  }

  private renderResultEmptyPage(
    doc: jsPDF,
    options: { pageWidth: number; margin: { left: number; right: number; top: number } }
  ): void {
    const { margin } = options;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Results', margin.left, margin.top + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('No result data available for this experiment.', margin.left, margin.top + 18);
  }

  private applyHeadersAndFooters(
    doc: jsPDF,
    options: {
      logoData: string | null;
      pageWidth: number;
      pageHeight: number;
      margin: { left: number; right: number; top: number; bottom: number };
      platformName: string;
      timestamp: string;
    }
  ): void {
    const { logoData, pageWidth, pageHeight, margin, platformName, timestamp } = options;
    const totalPages = (doc as any).getNumberOfPages();

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      if (logoData) {
        doc.addImage(logoData, 'PNG', margin.left, 8, 10, 10);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(130);
      doc.text(platformName, pageWidth - margin.right, 14, { align: 'right' });

      doc.setDrawColor(230);
      doc.line(margin.left, 20, pageWidth - margin.right, 20);

      doc.setTextColor(140);
      doc.text(`${page}/${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text(timestamp, pageWidth - margin.right, pageHeight - 10, { align: 'right' });
    }
  }

  private renderKeyValue(
    doc: jsPDF,
    options: {
      label: string;
      value: string | string[];
      x: number;
      y: number;
      maxWidth: number;
      indent?: number;
    }
  ): number {
    const { label, value, x, y, maxWidth, indent = 0 } = options;
    let currentY = y;
    const labelText = `${label}:`;
    const labelWidth = doc.getTextWidth(labelText);

    doc.setFont('helvetica', 'bold');
    doc.text(labelText, x, currentY);
    doc.setFont('helvetica', 'normal');

    const startX = x + labelWidth + 2;
    const availableWidth = maxWidth - (startX - x);
    const lines = Array.isArray(value) ? value : doc.splitTextToSize(value, availableWidth);

    if (Array.isArray(lines)) {
      if (lines.length === 0) {
        doc.text('none', startX, currentY);
        return currentY + 6;
      }

      if (Array.isArray(value)) {
        const bullet = '• ';
        const bulletWidth = doc.getTextWidth(bullet);
        value.forEach((item) => {
          const innerLines = doc.splitTextToSize(String(item), availableWidth - bulletWidth);
          innerLines.forEach((line: string, index: number) => {
            const lineX = index === 0 ? startX : startX + 3;
            const prefix = index === 0 ? bullet : '';
            doc.text(prefix + line, lineX, currentY);
            currentY += 6;
          });
        });
        return currentY;
      }

      lines.forEach((line, index) => {
        const lineX = index === 0 ? startX : startX + indent;
        doc.text(String(line), lineX, currentY);
        currentY += 6;
      });
      return currentY;
    }

    doc.text(String(value), startX, currentY);
    return currentY + 6;
  }

  private formatParams(params?: Record<string, unknown> | null): string[] {
    if (!params || Object.keys(params).length === 0) return [];
    return Object.entries(params).map(([key, value]) => {
      const prettyKey = prettifyLabel(key);
      return `${prettyKey}: ${this.formatValue(value)}`;
    });
  }

  private formatList(list?: string[] | null): string[] | 'none' {
    if (!list || list.length === 0) return 'none';
    return list;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'none';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => this.formatValue(item)).join(', ');
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private getTablesForAlgorithm(algorithmKey?: string | null, result?: any): TableSpec[] {
    if (!algorithmKey || !result) return [];
    const builder = getAlgorithmTableBuilder(algorithmKey);
    if (!builder) return [];
    try {
      return builder(result) || [];
    } catch (error) {
      console.warn('[PdfExportService] Table builder failed', error);
      return [];
    }
  }

  private async captureChartImages(container?: HTMLElement | null): Promise<string[]> {
    if (!container) return [];
    const chartElements = Array.from(
      container.querySelectorAll('.chart-container')
    ) as HTMLElement[];

    if (chartElements.length === 0) return [];

    const images: string[] = [];
    for (const el of chartElements) {
      try {
        images.push((await captureHtmlToPng(el, 2)).dataUrl);
      } catch (error) {
        console.warn('[PdfExportService] Chart capture failed', error);
      }
    }
    return images;
  }

  private async loadImageData(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image.'));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('[PdfExportService] Logo load failed', error);
      return null;
    }
  }

  private buildCreatedLine(createdBy?: string | null, createdAt?: string): string {
    if (createdBy && createdAt) return `Created by ${createdBy} on ${createdAt}.`;
    if (createdBy) return `Created by ${createdBy}.`;
    if (createdAt) return `Created on ${createdAt}.`;
    return '';
  }

  private formatDate(value?: Date | string | null): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toUTCString();
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleString();
  }
}
