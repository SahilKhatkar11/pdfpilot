/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { 
  FileUp, FileDown, Scissors, Loader2, CheckCircle2, 
  AlertCircle, X, Sun, Moon, Sparkles, Menu, Home, 
  Layers, Lock, Unlock, Hash, ArrowUpDown, ExternalLink, 
  Type, ChevronRight, Download, Trash2, MoveUp, MoveDown,
  PlaneTakeoff, Eye, EyeOff, Check, FileText, GripVertical,
  ImageIcon, Plus
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type ToolType = 'split' | 'merge' | 'protect' | 'unlock' | 'number' | 'organize' | 'extract' | 'watermark' | 'rotate' | 'duplicate' | 'blank' | 'reverse' | 'pdf2img' | 'img2pdf' | 'draw' | 'extractText';

interface PDFFile {
  id: string;
  file: File;
}

interface Tool {
  id: ToolType;
  name: string;
  description: string;
  icon: any;
  color: string;
}

const TOOLS: Tool[] = [
  { id: 'img2pdf', name: 'Images to PDF', description: 'Convert images (JPG, PNG) into a PDF file.', icon: FileUp, color: 'bg-emerald-500' },
  { id: 'pdf2img', name: 'PDF to Images', description: 'Convert PDF pages into high-quality images.', icon: Eye, color: 'bg-amber-500' },
  { id: 'split', name: 'Split PDF', description: 'Split a PDF into multiple files by page range.', icon: Scissors, color: 'bg-blue-500' },
  { id: 'merge', name: 'Merge PDF', description: 'Combine multiple PDF files into one (max 15).', icon: Layers, color: 'bg-indigo-500' },
  { id: 'rotate', name: 'Rotate Pages', description: 'Rotate PDF pages by 90, 180, or 270 degrees.', icon: ArrowUpDown, color: 'bg-orange-600' },
  { id: 'duplicate', name: 'Duplicate Pages', description: 'Duplicate the first page multiple times.', icon: Layers, color: 'bg-teal-500' },
  { id: 'blank', name: 'Add Blank Pages', description: 'Insert empty pages into your PDF.', icon: FileText, color: 'bg-slate-500' },
  { id: 'reverse', name: 'Reverse PDF', description: 'Reverse the page order of your PDF.', icon: MoveUp, color: 'bg-rose-500' },
  { id: 'draw', name: 'Draw / Sign', description: 'Draw or add a signature to your PDF.', icon: Type, color: 'bg-violet-500' },
  { id: 'extractText', name: 'Extract Text', description: 'Extract all selectable text from your PDF.', icon: FileText, color: 'bg-lime-500' },
  { id: 'protect', name: 'Protect PDF', description: 'Add password protection to your PDF.', icon: Lock, color: 'bg-red-500' },
  { id: 'unlock', name: 'Unlock PDF', description: 'Remove password protection from your PDF.', icon: Unlock, color: 'bg-green-500' },
  { id: 'number', name: 'Page Numbers', description: 'Add page numbers to your PDF document.', icon: Hash, color: 'bg-purple-500' },
  { id: 'organize', name: 'Organize PDF', description: 'Rearrange or delete pages in your PDF.', icon: ArrowUpDown, color: 'bg-orange-500' },
  { id: 'extract', name: 'Extract Pages', description: 'Extract specific pages from your PDF.', icon: ExternalLink, color: 'bg-cyan-500' },
  { id: 'watermark', name: 'Watermark', description: 'Add a text watermark to your PDF pages.', icon: Type, color: 'bg-pink-500' },
];

interface SplitResult {
  name: string;
  blob: Blob;
  url: string;
  pageRange: string;
  text?: string; // For extract text
}

const Logo = ({ isDarkMode, className = "" }: { isDarkMode: boolean; className?: string }) => (
  <div className={`flex items-center gap-3 group ${className}`}>
    <div className="relative">
      <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center">
        <div className="relative">
          <PlaneTakeoff className="w-7 h-7 text-white" />
          <div className="absolute -bottom-1 -right-1 bg-white rounded-md p-0.5 shadow-sm">
            <FileText className="w-3 h-3 text-blue-600" />
          </div>
        </div>
      </div>
      <div className="absolute -top-1.5 -right-1.5">
        <Sparkles className="w-5 h-5 text-yellow-400 fill-yellow-400" />
      </div>
    </div>
    <span className={`text-2xl font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
      PDF<span className="text-blue-600">Pilot</span>
    </span>
  </div>
);

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Tool-specific states
  const [pagesPerSplit, setPagesPerSplit] = useState<number>(10);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [extractRange, setExtractRange] = useState('');
  const [pdfPages, setPdfPages] = useState<number[]>([]); // For organize tool
  const [previews, setPreviews] = useState<string[]>([]); // For organize tool previews
  const [selectedPages, setSelectedPages] = useState<number[]>([]); // For bulk organize
  const [numberPosition, setNumberPosition] = useState<'left' | 'center' | 'right'>('center');
  const [numberFormat, setNumberFormat] = useState<'simple' | 'fraction' | 'full'>('fraction');
  
  // New tool states
  const [rotationAngle, setRotationAngle] = useState<0 | 90 | 180 | 270>(90);
  const [duplicateCount, setDuplicateCount] = useState<number>(1);
  const [duplicatePageNum, setDuplicatePageNum] = useState<number>(1);
  const [blankPagePos, setBlankPagePos] = useState<number>(1);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [signPageNum, setSignPageNum] = useState<number>(1);
  const [signPosition, setSignPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'>('bottom-right');
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokes, setStrokes] = useState<{ points: { x: number; y: number }[] }[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Redraw canvas whenever strokes, currentStroke, or drawColor changes
  useEffect(() => {
    if (canvasRef.current && activeTool === 'draw') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = drawColor;
        
        const drawPath = (points: { x: number; y: number }[]) => {
          if (points.length === 0) return;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.forEach((p, i) => {
            if (i > 0) ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
        };

        strokes.forEach(s => drawPath(s.points));
        if (currentStroke) drawPath(currentStroke);
        
        // Update signatureData for PDF processing
        if (strokes.length > 0 || currentStroke) {
          setSignatureData(canvas.toDataURL());
        } else {
          setSignatureData(null);
        }
      }
    }
  }, [strokes, currentStroke, drawColor, activeTool]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
    
    setCurrentStroke([{ x, y }]);
    setIsDrawing(true);
  };

  const stopDrawing = () => {
    if (currentStroke) {
      setStrokes(prev => [...prev, { points: currentStroke }]);
    }
    setCurrentStroke(null);
    setIsDrawing(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
    
    setCurrentStroke(prev => prev ? [...prev, { x, y }] : [{ x, y }]);
  };

  const clearCanvas = () => {
    setStrokes([]);
    setCurrentStroke(null);
    setSignatureData(null);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Background screensaver-like wavy animation
  const BackgroundWaves = () => (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base background color */}
      <div className={`absolute inset-0 transition-colors duration-700 ${isDarkMode ? 'bg-[#020617]' : 'bg-[#f8fafc]'}`} />
      
      {/* Animated liquid-like blobs */}
      <div className="absolute inset-0 opacity-60">
        {[...Array(4)].map((_, i) => {
          const colors = isDarkMode 
            ? [
                'bg-blue-900/30', 
                'bg-indigo-900/20', 
                'bg-purple-900/20', 
                'bg-slate-900/30'
              ] 
            : [
                'bg-blue-200/40', 
                'bg-indigo-100/50', 
                'bg-purple-100/40', 
                'bg-sky-100/50'
              ];
          const color = colors[i % colors.length];
          
          return (
            <div
              key={i}
              className={`absolute w-[120vw] h-[120vh] rounded-[45%] mix-blend-multiply dark:mix-blend-screen transition-colors duration-1000 ${color}`}
              style={{
                filter: 'blur(120px)',
                left: `${(i % 3) * 20 - 10}%`,
                top: `${Math.floor(i / 3) * 30 - 10}%`,
                transform: `translate(${(i % 2 === 0 ? -100 : 100)}px, ${(i < 3 ? -100 : 100)}px)`,
                zIndex: -10 + i
              }}
            />
          );
        })}
      </div>

      {/* Subtle noise/grain overlay for texture */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  );

  // Initialize dark mode from system preference or local storage
  useEffect(() => {
    const savedMode = localStorage.getItem('pdf-splitter-dark-mode');
    if (savedMode === 'true') {
      setIsDarkMode(true);
    } else if (savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pdf-splitter-dark-mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (activeTool === 'organize' && files.length > 0 && pdfPages.length === 0) {
      loadPdfPages(files[0].file);
    }
  }, [activeTool, files]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    const isImageTool = activeTool === 'img2pdf';
    
    const validFiles = selectedFiles.filter(f => {
      if (isImageTool) return f.type.startsWith('image/');
      return f.type === 'application/pdf';
    });
    
    if (validFiles.length > 0) {
      if ((activeTool === 'merge' || activeTool === 'img2pdf') && files.length + validFiles.length > 15) {
        setError('Maximum 15 files can be processed at once.');
        return;
      }
      const newFiles = validFiles.map(f => ({ id: Math.random().toString(36).substring(2, 9) + Date.now(), file: f }));
      setFiles(prev => (activeTool === 'merge' || activeTool === 'img2pdf') ? [...prev, ...newFiles] : [newFiles[0]]);
      setResults([]);
      setError(null);
      
      // Reset input value to allow selecting same file again
      e.target.value = '';
      
      // Load pages for organize tool
      if (activeTool === 'organize' && newFiles[0] && !isImageTool) {
        loadPdfPages(newFiles[0].file);
      }
    } else if (selectedFiles.length > 0) {
      setError(isImageTool ? 'Please select valid image files (JPG, PNG).' : 'Please select valid PDF files.');
    }
  };

  const loadPdfPages = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const count = pdfDoc.getPageCount();
      setPdfPages(Array.from({ length: count }, (_, i) => i));
      
      // Generate previews
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      const newPreviews: string[] = [];
      
      for (let i = 1; i <= count; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        if (context) {
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          newPreviews.push(canvas.toDataURL());
        }
      }
      setPreviews(newPreviews);
    } catch (err) {
      console.error('Preview error:', err);
      setError('Could not load PDF pages or previews. Please try another file.');
    }
  };

  const processPdf = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    const newResults: SplitResult[] = [];

    try {
      // Helper to process a single PDF file
      const processSingleFile = async (pdfFile: PDFFile) => {
        const file = pdfFile.file;
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();

        if (activeTool === 'split') {
          const pageSize = pagesPerSplit;
          for (let i = 0; i < pageCount; i += pageSize) {
            const subPdfDoc = await PDFDocument.create();
            const end = Math.min(i + pageSize, pageCount);
            const pagesToCopy = Array.from({ length: end - i }, (_, index) => i + index);
            const copiedPages = await subPdfDoc.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach((page) => subPdfDoc.addPage(page));
            const pdfBytes = await subPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            newResults.push({
              name: `${file.name.replace('.pdf', '')}_part_${Math.floor(i / pageSize) + 1}.pdf`,
              blob,
              url: URL.createObjectURL(blob),
              pageRange: `${i + 1}-${end}`
            });
          }
        } else if (activeTool === 'rotate') {
          const pages = pdfDoc.getPages();
          pages.forEach((page, index) => {
            // If pages are selected, only rotate those. Otherwise rotate all.
            if (selectedPages.length === 0 || selectedPages.includes(index + 1)) {
              const currentRotation = page.getRotation().angle;
              page.setRotation(degrees((currentRotation + rotationAngle) % 360));
            }
          });
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `rotated_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: selectedPages.length > 0 ? `Selected Pages` : 'All Pages' });
        } else if (activeTool === 'duplicate') {
          // Duplicate specific page multiple times at the end of the document
          const pageIdx = Math.max(0, Math.min(duplicatePageNum - 1, pageCount - 1));
          for (let i = 0; i < duplicateCount; i++) {
            const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [pageIdx]);
            pdfDoc.addPage(copiedPage);
          }
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `duplicated_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: `Page ${pageIdx + 1} x${duplicateCount}` });
        } else if (activeTool === 'blank') {
          const pos = Math.max(0, Math.min(blankPagePos, pageCount));
          pdfDoc.insertPage(pos);
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `blank_added_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: `Blank at ${pos + 1}` });
        } else if (activeTool === 'reverse') {
          const subPdfDoc = await PDFDocument.create();
          const indices = Array.from({ length: pageCount }, (_, i) => pageCount - 1 - i);
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, indices);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `reversed_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: 'Reversed' });
        } else if (activeTool === 'pdf2img') {
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            if (context) {
              await page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise;
              const dataUrl = canvas.toDataURL('image/png');
              const res = await fetch(dataUrl);
              const blob = await res.blob();
              newResults.push({
                name: `${file.name.replace('.pdf', '')}_page_${i}.png`,
                blob,
                url: dataUrl,
                pageRange: `Page ${i}`
              });
            }
          }
        } else if (activeTool === 'extractText') {
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
          }
          const blob = new Blob([fullText], { type: 'text/plain' });
          newResults.push({
            name: `${file.name.replace('.pdf', '')}_text.txt`,
            blob,
            url: URL.createObjectURL(blob),
            pageRange: 'Text Content',
            text: fullText
          });
        } else if (activeTool === 'watermark') {
          const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          const pages = pdfDoc.getPages();
          pages.forEach(page => {
            const { width, height } = page.getSize();
            page.drawText(watermarkText, {
              x: width / 4,
              y: height / 2,
              size: 50,
              font,
              color: rgb(0.7, 0.7, 0.7),
              opacity: 0.3,
              rotate: { type: 'degrees', angle: 45 } as any,
            });
          });
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `watermarked_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: 'All pages' });
        } else if (activeTool === 'number') {
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const pages = pdfDoc.getPages();
          pages.forEach((page, i) => {
            const { width } = page.getSize();
            let text = '';
            if (numberFormat === 'simple') text = `${i + 1}`;
            else if (numberFormat === 'fraction') text = `${i + 1}/${pages.length}`;
            else text = `Page ${i + 1} of ${pages.length}`;

            const textWidth = font.widthOfTextAtSize(text, 10);
            let x = width / 2 - textWidth / 2;
            if (numberPosition === 'left') x = 40;
            else if (numberPosition === 'right') x = width - textWidth - 40;

            page.drawText(text, {
              x,
              y: 25,
              size: 10,
              font,
              color: rgb(0, 0, 0),
            });
          });
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `numbered_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: 'All pages' });
        } else if (activeTool === 'extract') {
          const indices = extractRange.split(',').flatMap(r => {
            if (r.includes('-')) {
              const [start, end] = r.split('-').map(Number);
              return Array.from({ length: end - start + 1 }, (_, i) => start + i - 1);
            }
            return [Number(r) - 1];
          }).filter(i => i >= 0 && i < pageCount);
          
          if (indices.length === 0) throw new Error('Invalid range');
          
          const subPdfDoc = await PDFDocument.create();
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, indices);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `extracted_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: extractRange });
        } else if (activeTool === 'organize') {
          const subPdfDoc = await PDFDocument.create();
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, pdfPages);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `organized_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: 'Custom' });
        } else if (activeTool === 'draw') {
          const pages = pdfDoc.getPages();
          const targetPageIdx = Math.max(0, Math.min(signPageNum - 1, pages.length - 1));
          const targetPage = pages[targetPageIdx];
          const { width, height } = targetPage.getSize();
          
          if (signatureData) {
            const sigImage = await pdfDoc.embedPng(signatureData);
            const sigDims = sigImage.scale(0.5);
            
            let x = 0;
            let y = 0;
            
            switch (signPosition) {
              case 'top-left':
                x = 50;
                y = height - sigDims.height - 50;
                break;
              case 'top-right':
                x = width - sigDims.width - 50;
                y = height - sigDims.height - 50;
                break;
              case 'bottom-left':
                x = 50;
                y = 50;
                break;
              case 'bottom-right':
                x = width - sigDims.width - 50;
                y = 50;
                break;
              case 'center':
                x = (width - sigDims.width) / 2;
                y = (height - sigDims.height) / 2;
                break;
            }
            
            targetPage.drawImage(sigImage, {
              x,
              y,
              width: sigDims.width,
              height: sigDims.height,
            });
          }

          const font = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);
          const hexToRgb = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            return rgb(r, g, b);
          };
          
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ name: `signed_${file.name}`, blob, url: URL.createObjectURL(blob), pageRange: `Signed Page ${targetPageIdx + 1}` });
        }
      };

      if (activeTool === 'merge') {
        const mergedPdf = await PDFDocument.create();
        for (const f of files) {
          const arrayBuffer = await f.file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `merged_document.pdf`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: `All pages`
        });
      } else if (activeTool === 'img2pdf') {
        const pdfDoc = await PDFDocument.create();
        for (const f of files) {
          const arrayBuffer = await f.file.arrayBuffer();
          let image;
          if (f.file.type === 'image/jpeg' || f.file.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(arrayBuffer);
          } else if (f.file.type === 'image/png') {
            image = await pdfDoc.embedPng(arrayBuffer);
          } else {
            continue;
          }
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({ name: `images_to_pdf.pdf`, blob, url: URL.createObjectURL(blob), pageRange: `${files.length} images` });
      } else if (activeTool === 'protect' || activeTool === 'unlock') {
        // Placeholder for static hosting compatibility
        throw new Error(`The "${activeTool === 'protect' ? 'Protect' : 'Unlock'}" tool is currently unavailable in this static version. For security reasons, this feature requires a specialized environment not supported by standard static hosting.`);
      } else {
        // Batch processing for other tools
        if (isBatchMode) {
          for (const f of files) {
            await processSingleFile(f);
          }
        } else {
          await processSingleFile(files[0]);
        }
      }

      setResults(newResults);
    } catch (err: any) {
      console.error('Error processing PDF:', err);
      setError(err.message || 'An error occurred while processing the PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearFiles = () => {
    setFiles([]);
    setResults([]);
    setError(null);
    setPdfPages([]);
    setPreviews([]);
    setSelectedPages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const continueWithTool = (result: SplitResult, toolId: ToolType) => {
    const file = new File([result.blob], result.name, { type: result.blob.type });
    setFiles([{ id: Math.random().toString(36).substring(2, 9) + Date.now(), file }]);
    setActiveTool(toolId);
    setResults([]);
    setError(null);
    if (toolId === 'organize') {
      loadPdfPages(file);
    }
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    if (direction === 'up' && index > 0) {
      [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
    } else if (direction === 'down' && index < files.length - 1) {
      [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
    }
    setFiles(newFiles);
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col transition-colors duration-300 relative ${isDarkMode ? 'bg-[#020617] text-slate-200' : 'bg-[#f8fafc] text-[#212529]'}`}>
      <BackgroundWaves />
      
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className={`fixed left-0 top-0 bottom-0 w-72 z-50 shadow-2xl p-6 flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-r border-slate-800' : 'bg-white border-r border-gray-100'}`}
            >
              <div className="mb-10">
                <Logo isDarkMode={isDarkMode} />
              </div>

              <nav className="flex-grow space-y-1 overflow-y-auto pr-2 custom-scrollbar">
                <button 
                  onClick={() => { setActiveTool(null); setIsMenuOpen(false); clearFiles(); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${!activeTool ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <Home className="w-5 h-5" />
                  <span className="font-semibold">Home</span>
                </button>
                <div className={`my-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`} />
                {TOOLS.map(tool => (
                  <button 
                    key={tool.id}
                    onClick={() => { setActiveTool(tool.id); setIsMenuOpen(false); clearFiles(); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTool === tool.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                  >
                    <tool.icon className="w-5 h-5" />
                    <span className="font-semibold">{tool.name}</span>
                  </button>
                ))}
              </nav>

              <div className="mt-auto pt-6 border-t border-slate-800/10">
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-gray-50 text-slate-600'}`}
                >
                  <span className="font-medium">Theme</span>
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-grow p-4 md:p-8 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <header className="mb-8 md:mb-12 flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              {activeTool && (
                <button 
                  onClick={() => setIsMenuOpen(true)}
                  className={`p-2.5 md:p-3 rounded-2xl transition-all shadow-lg ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                >
                  <Menu className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              )}
              <Logo isDarkMode={isDarkMode} className="scale-90 md:scale-100 origin-left" />
            </div>

            {!activeTool && (
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`p-3 rounded-2xl transition-all duration-300 shadow-lg ${
                  isDarkMode 
                    ? 'bg-slate-800 text-yellow-400 shadow-slate-900/50 hover:bg-slate-700' 
                    : 'bg-white text-slate-600 shadow-slate-200 hover:bg-slate-50'
                }`}
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            )}
          </header>

          <main>
            {!activeTool ? (
              <div className="space-y-10 md:space-y-16 py-6 md:py-10">
                <div className="text-center space-y-4 md:space-y-6">
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-4xl md:text-7xl font-black tracking-tighter leading-tight md:leading-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                  >
                    Your All-in-One <br />
                    <span className="text-blue-600">PDF Command Center.</span>
                  </motion.h2>
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className={`max-w-2xl mx-auto text-lg md:text-xl px-4 md:px-0 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}
                  >
                    PDFPilot is a powerful, browser-based suite designed to handle all your PDF needs with speed and privacy. No uploads, no limits, just pure performance.
                  </motion.p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                  {TOOLS.map((tool, idx) => (
                    <motion.button
                      key={tool.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      onClick={() => setActiveTool(tool.id)}
                      className={`group p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border text-left transition-all duration-500 hover:scale-[1.02] ${isDarkMode ? 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50' : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-xl'}`}
                    >
                      <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center mb-4 md:mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3 ${tool.color} shadow-lg shadow-current/20`}>
                        <tool.icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                      <h3 className={`text-lg md:text-xl font-bold mb-1 md:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tool.name}</h3>
                      <p className={`text-xs md:text-sm leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>{tool.description}</p>
                      <div className="mt-4 md:mt-6 flex items-center gap-2 text-blue-600 font-bold text-xs md:text-sm opacity-0 md:group-hover:opacity-100 transition-opacity">
                        Get Started <ChevronRight className="w-4 h-4" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
                  <div className="flex items-center gap-3 md:gap-4">
                    <button 
                      onClick={() => setActiveTool(null)}
                      className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                      <Home className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-1.5 md:gap-2 overflow-hidden">
                      <span className={`text-xs md:text-sm font-medium shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Tools</span>
                      <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-600 shrink-0" />
                      <span className={`text-xs md:text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {TOOLS.find(t => t.id === activeTool)?.name}
                      </span>
                    </div>
                  </div>
                  
                  {files.length > 0 && (
                    <button 
                      onClick={clearFiles}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700' : 'bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
                    >
                      <X className="w-4 h-4" /> Start Over
                    </button>
                  )}
                </div>

                <div className={`rounded-3xl md:rounded-[2.5rem] shadow-2xl border overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-gray-100'}`}>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={(e) => {
                          handleFileChange(e);
                          if (e.target) e.target.value = ''; // Reset to allow re-selecting same file
                        }} 
                        accept={activeTool === 'img2pdf' ? "image/*" : ".pdf"} 
                        multiple={activeTool === 'merge' || activeTool === 'img2pdf'} 
                        className="hidden" 
                      />
                      {files.length === 0 ? (
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const isImageTool = activeTool === 'img2pdf';
                            const droppedFiles = Array.from(e.dataTransfer.files as unknown as File[]).filter(f => {
                              if (isImageTool) return f.type.startsWith('image/');
                              return f.type === 'application/pdf';
                            });
                            if (droppedFiles.length > 0) {
                              if ((activeTool === 'merge' || activeTool === 'img2pdf') && files.length + droppedFiles.length > 15) {
                                setError('Max 15 files.');
                              } else {
                                setFiles(prev => (activeTool === 'merge' || activeTool === 'img2pdf') ? [...prev, ...droppedFiles] : [droppedFiles[0]]);
                                setError(null);
                              }
                            }
                          }}
                          className={`p-10 md:p-20 m-3 md:m-6 rounded-2xl md:rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all group ${isDarkMode ? 'border-slate-800 hover:border-blue-500 hover:bg-slate-800/50' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/30'}`}
                        >
                          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl flex items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform ${isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                            <FileUp className={`w-8 h-8 md:w-10 md:h-10 ${isDarkMode ? 'text-slate-500 group-hover:text-blue-400' : 'text-gray-400 group-hover:text-blue-500'}`} />
                          </div>
                          <p className={`text-xl md:text-2xl font-bold text-center px-4 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                            {activeTool === 'merge' || activeTool === 'img2pdf' ? 'Upload multiple files' : 'Select your PDF file'}
                          </p>
                          <p className={`mt-2 text-sm md:text-base text-center px-4 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            {activeTool === 'merge' || activeTool === 'img2pdf' ? 'Up to 15 files supported' : 'Drag and drop or click to browse'}
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 md:p-10 space-y-6 md:space-y-8">
                          <div className="flex items-center justify-between px-2 md:px-0">
                            <h3 className={`text-lg md:text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Selected Files</h3>
                            {files.length > 1 && activeTool !== 'merge' && activeTool !== 'img2pdf' && (
                              <div className="flex items-center gap-2 md:gap-3">
                                <span className={`text-xs md:text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Batch Mode</span>
                                <button 
                                  onClick={() => setIsBatchMode(!isBatchMode)}
                                  className={`w-10 h-5 md:w-12 md:h-6 rounded-full transition-colors relative ${isBatchMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                                >
                                  <motion.div 
                                    animate={{ x: isBatchMode ? 20 : 2 }}
                                    className="absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                                  />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {activeTool === 'merge' || activeTool === 'img2pdf' ? (
                              <>
                                <Reorder.Group axis="y" values={files} onReorder={setFiles} className="space-y-3 md:space-y-4">
                                  {files.map((f, i) => (
                                    <Reorder.Item 
                                      key={f.id} 
                                      value={f}
                                      layout
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      whileDrag={{ 
                                        scale: 1.02, 
                                        boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
                                        zIndex: 100
                                      }}
                                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                      className={`flex items-center justify-between p-3 md:p-5 rounded-xl md:rounded-2xl border cursor-grab active:cursor-grabbing transition-colors ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}
                                    >
                                      <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${activeTool === 'img2pdf' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                          {activeTool === 'img2pdf' ? <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-white" /> : <FileUp className="w-5 h-5 md:w-6 md:h-6 text-white" />}
                                        </div>
                                        <div className="overflow-hidden">
                                          <h3 className={`font-bold text-sm md:text-base truncate max-w-[150px] md:max-w-[300px] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{f.file.name}</h3>
                                          <p className="text-[10px] md:text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 md:gap-2">
                                        <GripVertical className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                                        <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 md:p-2 text-slate-500 hover:text-red-500 transition-colors">
                                          <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                                        </button>
                                      </div>
                                    </Reorder.Item>
                                  ))}
                                </Reorder.Group>
                                {files.length < 15 && (
                                  <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className={`w-full p-4 md:p-6 rounded-xl md:rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 md:gap-3 font-bold text-sm md:text-base transition-all ${isDarkMode ? 'border-slate-800 text-slate-500 hover:text-blue-400 hover:border-blue-500 hover:bg-slate-800/30' : 'border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/30'}`}
                                  >
                                    <Plus className="w-5 h-5 md:w-6 md:h-6" /> Add more {activeTool === 'img2pdf' ? 'images' : 'files'}
                                  </button>
                                )}
                              </>
                            ) : (
                              files.map((f, i) => (
                                <div key={f.id} className={`flex items-center justify-between p-5 rounded-2xl border ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                                      <FileUp className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                      <h3 className={`font-bold truncate max-w-[200px] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{f.file.name}</h3>
                                      <p className="text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                  </div>
                                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-slate-500 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                      {/* Tool Controls */}
                      <div className={`p-8 rounded-3xl border ${isDarkMode ? 'bg-slate-950/30 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                        {activeTool === 'split' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Pages per split</label>
                            <input type="number" value={pagesPerSplit} onChange={(e) => setPagesPerSplit(Number(e.target.value))} className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                        )}
                        {activeTool === 'rotate' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Rotation Angle</label>
                            <div className="flex gap-2">
                              {([90, 180, 270] as const).map(angle => (
                                <button
                                  key={angle}
                                  onClick={() => setRotationAngle(angle)}
                                  className={`flex-1 py-3 rounded-xl border font-bold transition-all ${rotationAngle === angle ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                >
                                  {angle}°
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeTool === 'duplicate' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Page to Duplicate</label>
                              <input type="number" min="1" value={duplicatePageNum} onChange={(e) => setDuplicatePageNum(Number(e.target.value))} className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Number of Copies</label>
                              <input type="number" min="1" max="100" value={duplicateCount} onChange={(e) => setDuplicateCount(Number(e.target.value))} className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                            </div>
                          </div>
                        )}
                        {activeTool === 'blank' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Insert Position (After Page #)</label>
                            <input type="number" min="0" value={blankPagePos} onChange={(e) => setBlankPagePos(Number(e.target.value))} className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                        )}
                        {activeTool === 'watermark' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Watermark Text</label>
                            <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                        )}
                        {activeTool === 'extract' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Page Range (e.g. 1,3,5-8)</label>
                            <input type="text" value={extractRange} onChange={(e) => setExtractRange(e.target.value)} placeholder="1, 3-5, 10" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                          </div>
                        )}
                        {activeTool === 'number' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Position</label>
                              <div className="flex gap-2">
                                {(['left', 'center', 'right'] as const).map(pos => (
                                  <button
                                    key={pos}
                                    onClick={() => setNumberPosition(pos)}
                                    className={`flex-1 py-3 rounded-xl border font-bold capitalize transition-all ${numberPosition === pos ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {pos}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Format</label>
                              <div className="flex flex-col gap-2">
                                {[
                                  { id: 'simple', label: '1 (Just number)' },
                                  { id: 'fraction', label: '1/5 (Fraction)' },
                                  { id: 'full', label: 'Page 1 of 5 (Full text)' }
                                ].map(fmt => (
                                  <button
                                    key={fmt.id}
                                    onClick={() => setNumberFormat(fmt.id as any)}
                                    className={`w-full py-3 px-4 rounded-xl border font-bold text-left transition-all ${numberFormat === fmt.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {fmt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {activeTool === 'organize' && (
                          <div className="space-y-6">
                            <div className="flex items-center justify-between">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Rearrange Pages</label>
                              <div className="flex gap-2">
                                {selectedPages.length > 0 && (
                                  <button 
                                    onClick={() => {
                                      const pagesToRemove = [...selectedPages].sort((a, b) => b - a);
                                      const newPages = [...pdfPages];
                                      const newPreviews = [...previews];
                                      pagesToRemove.forEach(idx => {
                                        newPages.splice(idx, 1);
                                        newPreviews.splice(idx, 1);
                                      });
                                      setPdfPages(newPages);
                                      setPreviews(newPreviews);
                                      setSelectedPages([]);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                                  >
                                    <Trash2 className="w-4 h-4" /> Delete Selected ({selectedPages.length})
                                  </button>
                                )}
                              </div>
                            </div>
                            <Reorder.Group 
                              axis="y" 
                              values={pdfPages} 
                              onReorder={setPdfPages} 
                              className="space-y-3"
                            >
                              {pdfPages.map((pageIdx, i) => {
                                const isSelected = selectedPages.includes(i);
                                return (
                                  <Reorder.Item 
                                    key={pageIdx}
                                    value={pageIdx}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    whileDrag={{ 
                                      scale: 1.05, 
                                      boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
                                      zIndex: 100
                                    }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className={`p-3 rounded-xl border flex items-center gap-4 relative group transition-all cursor-grab active:cursor-grabbing ${isSelected ? 'border-blue-500 bg-blue-500/5' : isDarkMode ? 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50' : 'bg-white border-gray-100 shadow-sm hover:shadow-md'}`}
                                  >
                                    <div className={`w-16 h-20 rounded-lg flex items-center justify-center text-xl font-black relative overflow-hidden shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-700' : 'bg-gray-50 text-gray-200'}`}>
                                      {previews[pageIdx] ? (
                                        <img src={previews[pageIdx]} alt={`Page ${pageIdx + 1}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="flex flex-col items-center gap-1">
                                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                          <span className="text-[10px] font-bold">{pageIdx + 1}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-grow">
                                      <span className={`text-sm font-bold ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Page {pageIdx + 1}</span>
                                      <p className="text-[10px] text-slate-500">Drag to reorder</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPages(prev => isSelected ? prev.filter(p => p !== i) : [...prev, i]);
                                        }}
                                        className={`p-2 rounded-lg transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-blue-600'}`}
                                      >
                                        <Check className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newPages = [...pdfPages];
                                          newPages.splice(i, 1);
                                          setPdfPages(newPages);
                                          setSelectedPages(prev => prev.filter(p => p !== i).map(p => p > i ? p - 1 : p));
                                        }}
                                        className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:text-red-600 transition-all"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                      <GripVertical className="w-5 h-5 text-slate-400 ml-2" />
                                    </div>
                                  </Reorder.Item>
                                );
                              })}
                            </Reorder.Group>
                          </div>
                        )}
                        {activeTool === 'extractText' && (
                          <p className="text-sm font-bold text-slate-500">Extract all text content from the PDF for viewing and downloading.</p>
                        )}
                        {activeTool === 'protect' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Set Password (Coming Soon)</label>
                            <div className="relative">
                              <input 
                                type={showPassword ? "text" : "password"} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="Enter password to protect PDF"
                                className={`w-full p-4 pr-12 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} 
                              />
                              <button 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-500 transition-colors"
                              >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            </div>
                            <p className="text-xs text-amber-500 font-medium">Note: This feature is currently a placeholder for static hosting compatibility.</p>
                          </div>
                        )}
                        {activeTool === 'unlock' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Enter Password (Coming Soon)</label>
                            <div className="relative">
                              <input 
                                type={showPassword ? "text" : "password"} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="Enter password to unlock PDF"
                                className={`w-full p-4 pr-12 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} 
                              />
                              <button 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-500 transition-colors"
                              >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            </div>
                            <p className="text-xs text-amber-500 font-medium">Note: This feature is currently a placeholder for static hosting compatibility.</p>
                          </div>
                        )}
                        {activeTool === 'pdf2img' && (
                          <p className="text-sm font-bold text-slate-500">Each page will be converted into a separate PNG image.</p>
                        )}
                        {activeTool === 'img2pdf' && (
                          <p className="text-sm font-bold text-slate-500">Images will be converted into a single PDF document.</p>
                        )}
                        {activeTool === 'reverse' && (
                          <p className="text-sm font-bold text-slate-500">The page order will be completely reversed.</p>
                        )}
                        {activeTool === 'draw' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest text-[10px]">Draw your signature</label>
                                <div className="flex items-center gap-2">
                                  {['#000000', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#f59e0b', '#06b6d4', '#ec4899'].map(color => (
                                    <button 
                                      key={color}
                                      onClick={() => setDrawColor(color)}
                                      className={`w-6 h-6 rounded-full border-2 transition-all ${drawColor === color ? 'border-blue-500 scale-125' : 'border-transparent'}`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                  <input 
                                    type="color" 
                                    value={drawColor} 
                                    onChange={(e) => setDrawColor(e.target.value)}
                                    className="w-6 h-6 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                                  />
                                </div>
                                <button 
                                  onClick={clearCanvas}
                                  className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className={`w-full h-48 border-2 border-dashed rounded-2xl relative overflow-hidden ${isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-gray-200 bg-white'}`}>
                                <canvas 
                                  ref={canvasRef}
                                  width={800}
                                  height={200}
                                  onMouseDown={startDrawing}
                                  onMouseMove={draw}
                                  onMouseUp={stopDrawing}
                                  onMouseLeave={stopDrawing}
                                  onTouchStart={startDrawing}
                                  onTouchMove={draw}
                                  onTouchEnd={stopDrawing}
                                  className="w-full h-full cursor-crosshair touch-none"
                                />
                                {!signatureData && !isDrawing && (
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <p className="text-slate-500 italic text-sm">Sign here with mouse or touch</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Page Number</label>
                                <input 
                                  type="number" 
                                  min="1" 
                                  value={signPageNum} 
                                  onChange={(e) => setSignPageNum(Number(e.target.value))} 
                                  className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} 
                                />
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Position</label>
                                <select 
                                  value={signPosition} 
                                  onChange={(e) => setSignPosition(e.target.value as any)}
                                  className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                                >
                                  <option value="top-left">Top Left</option>
                                  <option value="top-right">Top Right</option>
                                  <option value="bottom-left">Bottom Left</option>
                                  <option value="bottom-right">Bottom Right</option>
                                  <option value="center">Center</option>
                                </select>
                              </div>
                            </div>
                            
                            <p className="text-xs text-slate-500 italic">The signature will be added to the selected position on the specified page.</p>
                          </div>
                        )}
                        {activeTool === 'merge' && <p className="text-sm font-bold text-slate-500">Files will be merged in the order shown above.</p>}
                      </div>

                      <button
                        onClick={processPdf}
                        disabled={isProcessing}
                        className={`w-full py-4 md:py-5 rounded-2xl md:rounded-[2rem] font-black text-lg md:text-xl flex items-center justify-center gap-2 md:gap-3 transition-all shadow-2xl disabled:opacity-50 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'}`}
                      >
                        {isProcessing ? <><Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> Processing...</> : <><Download className="w-5 h-5 md:w-6 md:h-6" /> Process PDF</>}
                      </button>
                    </div>
                  )}
                </div>

                {/* Error & Results as before */}
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-3xl border flex items-center gap-4 ${isDarkMode ? 'bg-red-900/20 border-red-900/30 text-red-400' : 'bg-red-50 border-red-100 text-red-600'}`}>
                      <AlertCircle className="w-6 h-6" />
                      <p className="font-bold">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {results.length > 0 && (
                  <div className="space-y-6">
                    <h2 className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Results</h2>
                    <div className="grid grid-cols-1 gap-4">
                      {results.map((r, i) => (
                        <div key={i} className="space-y-4">
                          <div className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border flex items-center justify-between gap-4 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
                            <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                              <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500/20 text-green-500 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" /></div>
                              <div className="overflow-hidden">
                                {renamingId === i ? (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="text" 
                                      value={newName} 
                                      onChange={(e) => setNewName(e.target.value)}
                                      className={`w-full p-1 px-2 rounded border outline-none text-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                                      autoFocus
                                    />
                                    <button 
                                      onClick={() => {
                                        const updatedResults = [...results];
                                        updatedResults[i].name = newName.endsWith('.pdf') || newName.endsWith('.png') || newName.endsWith('.txt') ? newName : `${newName}${r.name.substring(r.name.lastIndexOf('.'))}`;
                                        setResults(updatedResults);
                                        setRenamingId(null);
                                      }}
                                      className="p-1.5 bg-green-500 text-white rounded"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <p className={`font-bold text-sm md:text-base truncate max-w-[120px] md:max-w-[300px] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{r.name}</p>
                                )}
                                <p className="text-[10px] md:text-xs text-slate-500">{r.pageRange}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <button 
                                onClick={() => {
                                  setRenamingId(i);
                                  setNewName(r.name);
                                }}
                                className={`p-2 md:p-2.5 md:p-4 rounded-xl md:rounded-2xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                                title="Rename"
                              >
                                <Type className="w-4 h-4 md:w-5 md:h-5" />
                              </button>
                              <a href={r.url} download={r.name} className="p-2 md:p-2.5 md:p-4 bg-blue-600 text-white rounded-xl md:rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                                <Download className="w-4 h-4 md:w-5 md:h-5" />
                              </a>
                            </div>
                          </div>
                          
                          {r.blob.type === 'application/pdf' && (
                            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border flex flex-col gap-3 md:gap-4 ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-blue-50/30 border-blue-100'}`}>
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500" />
                                <span className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest">Next Step: Continue with another tool</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {TOOLS.filter(t => t.id !== activeTool && t.id !== 'img2pdf').slice(0, 8).map(tool => (
                                  <button 
                                    key={tool.id}
                                    onClick={() => continueWithTool(r, tool.id)}
                                    className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300' : 'bg-white hover:bg-blue-600 hover:text-white text-slate-600 shadow-sm'}`}
                                  >
                                    <tool.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    {tool.name}
                                  </button>
                                ))}
                                <div className="relative">
                                  <button 
                                    onClick={() => setOpenDropdownIdx(openDropdownIdx === i ? null : i)}
                                    className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300' : 'bg-white hover:bg-blue-600 hover:text-white text-slate-600 shadow-sm'}`}
                                  >
                                    All Tools <ChevronRight className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${openDropdownIdx === i ? 'rotate-90' : ''}`} />
                                  </button>
                                  {openDropdownIdx === i && (
                                    <>
                                      <div 
                                        className="fixed inset-0 z-40" 
                                        onClick={() => setOpenDropdownIdx(null)}
                                      />
                                      <div className={`absolute bottom-full left-0 mb-2 w-56 p-2 rounded-2xl shadow-2xl z-50 border animate-in fade-in slide-in-from-bottom-2 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
                                        <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto custom-scrollbar">
                                          {TOOLS.filter(t => t.id !== activeTool && t.id !== 'img2pdf').map(tool => (
                                            <button 
                                              key={tool.id}
                                              onClick={() => {
                                                continueWithTool(r, tool.id);
                                                setOpenDropdownIdx(null);
                                              }}
                                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${isDarkMode ? 'hover:bg-blue-600 text-slate-300 hover:text-white' : 'hover:bg-blue-50 text-slate-600 hover:text-blue-600'}`}
                                            >
                                              <tool.icon className="w-4 h-4" />
                                              {tool.name}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {r.text && (
                            <div className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                              <textarea 
                                readOnly 
                                value={r.text} 
                                className={`w-full h-60 p-4 rounded-2xl border outline-none font-mono text-sm ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-gray-200 text-gray-600'}`}
                              />
                              <div className="flex gap-2 mt-4">
                                <button 
                                  onClick={() => {
                                    const blob = new Blob([r.text || ''], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = r.name.replace('.txt', '.txt');
                                    a.click();
                                  }}
                                  className="flex-1 py-3 bg-slate-600 text-white rounded-xl font-bold hover:bg-slate-700 transition-all"
                                >
                                  Download .txt
                                </button>
                                <button 
                                  onClick={() => {
                                    const json = JSON.stringify({ filename: r.name, content: r.text }, null, 2);
                                    const blob = new Blob([json], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = r.name.replace('.txt', '.json');
                                    a.click();
                                  }}
                                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                                >
                                  Download .json
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center pt-6">
                      <button onClick={clearFiles} className={`px-8 py-4 rounded-2xl border font-bold ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'}`}>
                        Start New Task
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </main>

          {/* Footer Info */}
          <footer className={`mt-16 pt-8 border-t text-center text-sm transition-colors duration-300 ${
            isDarkMode ? 'border-slate-800 text-slate-500' : 'border-gray-100 text-gray-400'
          }`}>
            <p>Your files are processed locally in your browser and are never uploaded to any server.</p>
          </footer>
        </div>
      </div>

      {/* Developer Credit Footer */}
      <motion.footer 
        whileHover="hover"
        className={`w-full py-12 mt-auto relative overflow-hidden transition-all duration-500 ${
          isDarkMode 
            ? 'bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-t border-slate-800' 
            : 'bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 border-t border-blue-100'
        }`}
      >
        {/* Sparkling particles on hover - Reduced count and removed continuous animation */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(20)].map((_, i) => {
            const colors = isDarkMode 
              ? ['bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-yellow-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-orange-400'] 
              : ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-yellow-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-orange-500'];
            const color = colors[i % colors.length];
            const size = Math.random() * 6 + 2; // 2px to 8px
            
            return (
              <motion.div
                key={i}
                variants={{
                  hover: {
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                    x: [0, (Math.random() - 0.5) * 1000],
                    y: [0, (Math.random() - 0.5) * 400],
                    transition: {
                      duration: Math.random() * 1.5 + 0.5,
                      delay: Math.random() * 0.5,
                      ease: "easeOut"
                    }
                  }
                }}
                initial={{ opacity: 0 }}
                className={`absolute rounded-full blur-[1px] ${color}`}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  boxShadow: isDarkMode ? '0 0 15px currentColor' : '0 0 10px currentColor'
                }}
              />
            );
          })}
        </div>

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <motion.div
            variants={{
              hover: { scale: 1.05, y: -5 }
            }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="flex flex-col items-center gap-2"
          >
            <div className={`flex items-center gap-2 md:gap-3 px-4 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl border transition-all duration-500 ${
              isDarkMode 
                ? 'bg-slate-900/80 border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)] backdrop-blur-md' 
                : 'bg-white/80 border-blue-200 shadow-[0_0_30px_rgba(59,130,246,0.1)] backdrop-blur-md'
            }`}>
              <Sparkles className={`w-5 h-5 md:w-6 md:h-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
              
              <p className={`text-sm md:text-xl font-medium tracking-tight ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Developed by{' '}
                <a 
                  href="https://github.com/sahilkhatkar11" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`font-black transition-all duration-300 relative group inline-block ${
                    isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                  }`}
                >
                  Sahil Khatkar
                  <span className={`absolute -bottom-1 left-0 w-0 h-1 transition-all duration-500 group-hover:w-full rounded-full ${
                    isDarkMode ? 'bg-gradient-to-r from-blue-400 to-purple-400' : 'bg-gradient-to-r from-blue-600 to-purple-600'
                  }`}></span>
                </a>
              </p>

              <Sparkles className={`w-5 h-5 md:w-6 md:h-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            </div>
          </motion.div>
        </div>
      </motion.footer>
    </div>
  );
}
