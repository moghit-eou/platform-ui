import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface CapturedHtmlImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Render an HTMLElement to a PNG data-URL with a white background. */
export async function captureHtmlToPng(
  element: HTMLElement,
  scale: number
): Promise<CapturedHtmlImage> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
  });
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

interface MipVersionFooterOptions {
  pageWidth: number;
  pageHeight: number;
  /** Distance from the right edge to the end of the text. */
  right: number;
  /** Distance from the bottom edge to the baseline of the text. */
  bottom: number;
}

/**
 * Draw the "MIP Version: …" footer on the last page of the document.
 * x = pageWidth - right - textWidth, y = pageHeight - bottom.
 */
export function renderMipVersion(
  doc: jsPDF,
  version: string,
  options: MipVersionFooterOptions
): void {
  const { pageWidth, pageHeight, right, bottom } = options;
  const totalPages = doc.getNumberOfPages();
  doc.setPage(totalPages);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(150);

  const versionText = `MIP Version: ${version}`;
  const textWidth = doc.getTextWidth(versionText);
  doc.text(versionText, pageWidth - right - textWidth, pageHeight - bottom);
}
