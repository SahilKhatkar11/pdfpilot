/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees, PDFName } from 'pdf-lib';
import ReactMarkdown from 'react-markdown';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Register custom list types for Quill with better attribute persistence
if (typeof window !== 'undefined' && Quill) {
  try {
    const List = Quill.import('formats/list');

    if (List) {
      class CustomList extends (List as any) {
        static create(value: any) {
          // Standard Quill values are 'ordered' and 'bullet'
          const standardValue = (['bullet', 'circle', 'square'].includes(value)) ? 'bullet' : 'ordered';
          const node = super.create(standardValue);
          if (value && typeof value === 'string') {
            node.setAttribute('data-list', value);
          }
          return node;
        }
        static formats(node: HTMLElement) {
          return node.getAttribute('data-list') || super.formats(node);
        }
        format(name: string, value: any) {
          if (name === 'list' && value) {
            this.domNode.setAttribute('data-list', value);
          }
          super.format(name, value);
        }
      }
      CustomList.blotName = 'list';
      Quill.register(CustomList, true);
    }
  } catch (e: any) {
    if (e?.message && !e.message.includes('not valid JSON')) {
      console.error('Error during Quill CustomList registration:', e);
    }
  }
}

import TurndownService from 'turndown';
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { 
  FileUp, FileDown, Scissors, Loader2, CheckCircle2, 
  AlertCircle, X, Sun, Moon, Sparkles, Zap, Menu, Home, 
  Layers, Lock, Unlock, Hash, ArrowUpDown, ExternalLink, 
  Type, ChevronRight, ChevronDown, Download, Trash2, MoveUp, MoveDown,
  PlaneTakeoff, Eye, EyeOff, Check, FileText, GripVertical,
  ImageIcon, Plus, Minus, Info, ShieldCheck, Droplets, Maximize,
  Paperclip, Copy, Layout, CheckSquare, Shapes, MousePointer2,
  Undo2, Redo2, Bold, Italic, List as ListIcon, ListOrdered, AlignLeft,
  AlignCenter, AlignRight, AlignJustify, Link, Smile,
  Indent, Outdent, Eraser, Baseline, ClipboardPaste, ChevronUp,
  RotateCw, PenTool, Stamp, Files, FileOutput, FilePlus, Image, ArrowDownUp,
  Images, ImagePlus, Shuffle, LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const sanitizeForPdf = (str: string): string => {
  if (!str) return '';
  // Map common non-WinAnsi characters to WinAnsi/ASCII equivalents
  const mapping: Record<string, string> = {
    '✅': '[OK]',
    '⚡': '[FLASH]',
    '┣': '|',
    '┗': '|',
    '┃': '|',
    '━': '-',
    '┳': '|',
    '┻': '|',
    '╋': '+',
    '•': '*',
    '–': '-',
    '—': '-',
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '…': '...',
    '™': '(TM)',
    '©': '(C)',
    '®': '(R)',
  };

  let sanitized = str;
  for (const [char, replacement] of Object.entries(mapping)) {
    sanitized = sanitized.split(char).join(replacement);
  }

  // Remove other characters that are outside basic Latin and WinAnsi range
  // WinAnsi (Windows-1252) covers characters from 0x00 to 0xFF, but 
  // PDF standard fonts can still be picky about certain control codes.
  // We'll keep basic ASCII (0-127) and common extended Latin (160-255).
  return sanitized.replace(/[^\x00-\x7F\xA0-\xFF]/g, (char) => {
    // Optionally log removed chars for debugging
    // console.warn(`Stripped character: ${char} (0x${char.charCodeAt(0).toString(16)})`);
    return '?';
  });
};

type ToolType = 'text2pdf' | 'split' | 'merge' | 'number' | 'organize' | 'extract' | 'watermark' | 'rotate' | 'duplicate' | 'blank' | 'reverse' | 'pdf2img' | 'img2pdf' | 'draw' | 'extractText' | 'metadata' | 'grayscale' | 'flatten' | 'sanitize' | 'copyPages' | 'addAttachments' | 'drawImages' | 'drawVectors' | 'viewerPreferences';

interface PDFFile {
  id: string;
  file: File;
}

interface Tool {
  id: ToolType;
  name: string;
  description: string;
  toolInfo: string;
  icon: any;
  color: string;
}

const TOOLS: Tool[] = [
  { 
    id: 'text2pdf', 
    name: 'Text to PDF', 
    description: 'Convert plain text or rich markdown content into professional PDF documents with full formatting support.', 
    toolInfo: 'Create high-fidelity PDF documents from raw text or Markdown. Our advanced rendering engine supports bolding, italics, lists, and headers, ensuring your notes or documentation look professional when exported. Ideal for quick reports, structured notes, or converting simple text files into portable document formats.',
    icon: Type, 
    color: 'bg-blue-600' 
  },
  { 
    id: 'img2pdf', 
    name: 'Image to PDF', 
    description: 'Convert your JPG, PNG, and other image formats into a single, high-quality PDF document instantly.', 
    toolInfo: 'Efficiently package multiple images (JPG, PNG, WebP) into a single, cohesive PDF file. You can reorder images before conversion to match your desired sequence. This tool is perfect for creating digital photo albums, compiling scanned receipts, or turning physical document photos into a clean digital PDF.',
    icon: FileUp, 
    color: 'bg-emerald-500' 
  },
  { 
    id: 'pdf2img', 
    name: 'PDF to Image', 
    description: 'Transform any PDF page into a high-resolution image file, perfect for sharing or embedding in other documents.', 
    toolInfo: 'Extract every page of your PDF as a high-resolution image file. This allows you to easily share specific pages on social media, embed them in presentations, or use them in graphic design software without needing a PDF viewer. Each page becomes a standalone image while maintaining original document quality.',
    icon: Images, 
    color: 'bg-amber-500' 
  },
  { 
    id: 'split', 
    name: 'Split PDF', 
    description: 'Divide your PDF files into separate documents by selecting specific page ranges or extracting individual pages.', 
    toolInfo: 'Deconstruct large PDF files into smaller segments. You can extract individual pages or define specific page ranges (e.g., 1-5, 10-12) to create entirely new, separate PDF files. This is essential for managing dense reports or separating confidential sections from larger documents.',
    icon: Scissors, 
    color: 'bg-blue-500' 
  },
  { 
    id: 'merge', 
    name: 'Merge PDF', 
    description: 'Combine multiple PDF files into one organized document with support for up to 15 files at once.', 
    toolInfo: 'Join multiple independent PDF files into one single, continuous document. You have full control over the order of merging, allowing you to build comprehensive sets from separate components. Ideal for combining chapters of a book, monthly financial statements, or varied project documentation.',
    icon: Layers, 
    color: 'bg-indigo-500' 
  },
  { 
    id: 'extract', 
    name: 'Extract Pages', 
    description: 'Select and extract specific pages from a large PDF to create a new, focused document with just the content you need.', 
    toolInfo: 'Create a specialized document by pulling only the necessary pages from a larger source file. This tool is perfect for sending only relevant sections of a massive manual or report to a client, reducing file size and focusing attention.',
    icon: FileOutput, 
    color: 'bg-cyan-500' 
  },
  { 
    id: 'organize', 
    name: 'Organize PDF', 
    description: 'Take full control of your PDF structure by rearranging, deleting, or reordering pages exactly how you need.', 
    toolInfo: 'Gain total mastery over your PDF layout with an intuitive drag-and-drop interface. Reorder pages, delete unnecessary ones, or rotate individual sheets to clean up complex documents and ensure the most logical flow of information.',
    icon: LayoutGrid, 
    color: 'bg-orange-500' 
  },
  { 
    id: 'number', 
    name: 'Page Numbers', 
    description: 'Automatically add professional page numbers to your PDF with customizable positions and formatting styles.', 
    toolInfo: 'Apply consistent page numbering across your entire document. You can customize the positioning (top/bottom, left/center/right), select font styles, and define the starting number to ensure your documents follow professional archival and academic standards.',
    icon: Hash, 
    color: 'bg-purple-500' 
  },
  { 
    id: 'copyPages', 
    name: 'Copy Pages', 
    description: 'Easily copy specific pages from one PDF document and insert them directly into another PDF file.', 
    toolInfo: 'Transfer specific pages from one PDF directly into another. This specialized tool allows for cross-document editing, letting you mix and match content between files with precise control over where the new pages are inserted.',
    icon: Copy, 
    color: 'bg-blue-400' 
  },
  { 
    id: 'duplicate', 
    name: 'Duplicate Pages', 
    description: 'Easily duplicate any page within your PDF document multiple times to create templates or repetitive forms.', 
    toolInfo: 'Clone any existing page within your PDF to create identical copies. This is particularly useful for creating repetitive forms, adding template-based sections, or expanding a document with structured layouts that need to be filled multiple times.',
    icon: Files, 
    color: 'bg-teal-500' 
  },
  { 
    id: 'blank', 
    name: 'Add Blank Pages', 
    description: 'Insert clean, empty pages anywhere in your PDF to provide extra space for notes or future content.', 
    toolInfo: 'Insert clean, empty white pages into any position within your PDF. Use this to create space for physical signatures, add section breaks, or provide room for manual annotations and sketches in printed versions of your documents.',
    icon: FilePlus, 
    color: 'bg-slate-500' 
  },
  { 
    id: 'rotate', 
    name: 'Rotate PDF', 
    description: 'Fix the orientation of your PDF pages by rotating them 90, 180, or 270 degrees with a single click.', 
    toolInfo: 'Correct improperly scanned documents or landscape-oriented pages. You can rotate specific pages or the entire document by 90, 180, or 270 degrees. The changes are applied instantly, ensuring your document is always oriented correctly for reading and printing.',
    icon: RotateCw, 
    color: 'bg-orange-600' 
  },
  { 
    id: 'reverse', 
    name: 'Reverse PDF', 
    description: 'Flip the entire page order of your PDF document from back to front with this quick and efficient tool.', 
    toolInfo: 'Invert the page sequence of your entire document with one click. This is a vital tool for correcting PDFs that were scanned in reverse order or for re-arranging slideshows and presentations that need to be reviewed from last to first.',
    icon: ArrowDownUp, 
    color: 'bg-rose-500' 
  },
  { 
    id: 'extractText', 
    name: 'Extract Text', 
    description: 'Quickly pull all selectable text from your PDF files for easy editing, searching, or repurposing elsewhere.', 
    toolInfo: 'Scan your PDF for all selectable text layers and extract them into a clean, copyable format. This saves time by eliminating the need to re-type content from PDFs, making it easy to repurpose data for emails, reports, or research databases.',
    icon: Baseline, 
    color: 'bg-lime-500' 
  },
  { 
    id: 'draw', 
    name: 'Draw / Sign', 
    description: 'Add your personal signature or freehand drawings directly onto any page of your PDF document.', 
    toolInfo: 'Electronically sign documents or add freehand annotations using our integrated drawing tool. You can adjust the brush size and transparency to create precise signatures or callout sketches directly on top of your existing PDF content.',
    icon: PenTool, 
    color: 'bg-violet-500' 
  },
  { 
    id: 'watermark', 
    name: 'Watermark', 
    description: 'Protect your intellectual property by adding custom text watermarks across all pages of your PDF document.', 
    toolInfo: 'Protect your sensitive documents or establish branding by adding semi-transparent text watermarks. You can control the text content, font size, and rotation to ensure your document remains identified and protected against unauthorized use.',
    icon: Stamp, 
    color: 'bg-pink-500' 
  },
  { 
    id: 'drawImages', 
    name: 'Draw Images', 
    description: 'Embed and position PNG and JPEG images anywhere on your PDF pages with full transparency support.', 
    toolInfo: 'Overlay external images onto your PDF pages. This tool supports PNG and JPEG formats, allowing you to add company logos, illustrative photos, or digital seals to your documents with adjustable positioning and scaling.',
    icon: ImagePlus, 
    color: 'bg-rose-400' 
  },
  { 
    id: 'drawVectors', 
    name: 'Draw Graphics', 
    description: 'Add precise vector shapes like lines, rectangles, and circles to illustrate your PDF documents.', 
    toolInfo: 'Add professional vector annotations such as rectangles, circles, and straight lines. These shapes are ideal for highlighting specific data points, redacting information, or illustrating workflows directly on the PDF canvas.',
    icon: Shapes, 
    color: 'bg-purple-400' 
  },
  { 
    id: 'addAttachments', 
    name: 'Add Attachments', 
    description: 'Securely attach external files directly to your PDF document for consolidated file sharing.', 
    toolInfo: 'Package external resources directly inside your PDF. By adding file attachments, you can distribute spreadsheets, source code, or supplemental media as part of a single PDF package, ensuring all related data stays together.',
    icon: Paperclip, 
    color: 'bg-amber-400' 
  },
  { 
    id: 'grayscale', 
    name: 'Grayscale PDF', 
    description: 'Convert your full-color PDF into black and white to save printer ink and create a classic look.', 
    toolInfo: 'Convert all colors in your document to high-quality grayscale. This process significantly reduces potential file size and saves expensive colored printer ink, while often making document text appear sharper and more academic.',
    icon: Droplets, 
    color: 'bg-gray-600' 
  },
  { 
    id: 'flatten', 
    name: 'Flatten PDF', 
    description: 'Make interactive forms and annotations permanent so they can no longer be edited or changed by others.', 
    toolInfo: 'Solidify your document by "baking" annotations, digital signatures, and form data into the base page layer. Once flattened, these elements cannot be edited individually, ensuring the finality and security of your signed or filled documents.',
    icon: Maximize, 
    color: 'bg-orange-700' 
  },
  { 
    id: 'sanitize', 
    name: 'Sanitize PDF', 
    description: 'Remove hidden sensitive data like undo history, hidden layers, and metadata before sharing your documents.', 
    toolInfo: 'Remove deeply embedded sensitive information from your PDF. Our sanitation process strips hidden metadata, private annotations, and edit history, ensuring that the version you share contains only the visible information you intend to provide.',
    icon: ShieldCheck, 
    color: 'bg-teal-600' 
  },
  { 
    id: 'viewerPreferences', 
    name: 'Viewer Preferences', 
    description: 'Control how your PDF is displayed in external viewers, including layout, scaling, and privacy UI constraints.', 
    toolInfo: 'Define precisely how external PDF viewers (like Acrobat or Chrome) display your document upon opening. You can hide toolbars, force full-screen mode, or set initial zoom levels to provide the best possible viewing experience for your audience.',
    icon: Layout, 
    color: 'bg-indigo-600' 
  },
  { 
    id: 'metadata', 
    name: 'Manage Metadata', 
    description: 'View and edit document properties like Title, Author, Subject, and Creator to keep your files professional and organized.', 
    toolInfo: 'Edit the internal properties of your PDF file. Managing metadata like the Title, Author, and Subject ensures your files are correctly indexed by search engines and displayed professionally in file managers and library software.',
    icon: Info, 
    color: 'bg-indigo-600' 
  },
];

interface SplitResult {
  name: string;
  blob: Blob;
  url: string;
  pageRange: string;
  size: number;
  pageCount: number;
  text?: string; // For extract text
}

const Logo = ({ isDarkMode, className = "", onClick }: { isDarkMode: boolean; className?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={`flex items-center gap-3 group cursor-pointer ${className}`}
  >
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

const toRoman = (num: number): string => {
  const roman: { [key: string]: number } = {
    M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1
  };
  let result = '';
  let n = num;
  for (let i of Object.keys(roman)) {
    let q = Math.floor(n / roman[i]);
    n -= q * roman[i];
    result += i.repeat(q);
  }
  return result;
};

const fromRoman = (roman: string): number => {
  const romanMap: { [key: string]: number } = {
    M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1
  };
  let result = 0;
  let str = roman.toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const s1 = str[i];
    const s2 = str[i + 1];
    if (s2 && romanMap[s1 + s2]) {
      result += romanMap[s1 + s2];
      i++;
    } else {
      result += romanMap[s1] || 0;
    }
  }
  return result || 1;
};

const toAlpha = (num: number): string => {
  let alpha = '';
  let n = num;
  while (n > 0) {
    let rem = (n - 1) % 26;
    alpha = String.fromCharCode(65 + rem) + alpha;
    n = Math.floor((n - 1) / 26);
  }
  return alpha;
};

const fromAlpha = (alpha: string): number => {
  let result = 0;
  let str = alpha.toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode >= 65 && charCode <= 90) {
      result = result * 26 + (charCode - 64);
    }
  }
  return result || 1;
};

const SlickNumberInput = ({ 
  value, 
  onChange, 
  min = 1, 
  max,
  isDarkMode, 
  formattedValue,
  formatType = 'number'
}: { 
  value: number; 
  onChange: (val: number) => void; 
  min?: number; 
  max?: number;
  isDarkMode: boolean;
  formattedValue?: string;
  formatType?: string;
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [editingValue, setEditingValue] = React.useState("");

  React.useEffect(() => {
    if (isFocused) {
      setEditingValue(formattedValue || value.toString());
    }
  }, [isFocused, formattedValue, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    let processed = raw;
    let numericValue = value;

    if (formatType.startsWith('alpha')) {
      processed = raw.replace(/[^a-zA-Z]/g, '');
      if (formatType === 'alpha-upper') processed = processed.toUpperCase();
      else if (formatType === 'alpha-lower') processed = processed.toLowerCase();
      
      if (processed) {
        numericValue = fromAlpha(processed);
      }
    } else if (formatType.startsWith('roman')) {
      processed = raw.replace(/[^ivxlcdmIVXLCDM]/g, '');
      if (formatType === 'roman-upper') processed = processed.toUpperCase();
      else if (formatType === 'roman-lower') processed = processed.toLowerCase();
      
      if (processed) {
        numericValue = fromRoman(processed);
      }
    } else {
      processed = raw.replace(/[^0-9]/g, '');
      if (processed) {
        numericValue = parseInt(processed, 10);
      }
    }

    setEditingValue(processed);
    
    if (processed) {
      let finalVal = Math.max(min, numericValue);
      if (max !== undefined) finalVal = Math.min(max, finalVal);
      if (!isNaN(finalVal)) {
        onChange(finalVal);
      }
    }
  };

  return (
    <div className={`group flex items-center p-1 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} ${isFocused ? 'ring-2 ring-blue-500/20 border-blue-600' : 'hover:border-gray-200 shadow-sm'}`}>
      <div className="flex-grow flex items-center justify-center min-w-[50px] px-2">
        {isFocused ? (
          <input 
            type="text" 
            autoFocus
            value={editingValue}
            onBlur={() => setIsFocused(false)}
            onChange={handleInputChange}
            className={`w-full bg-transparent text-center font-bold outline-none text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
          />
        ) : (
          <button 
            type="button"
            onClick={() => setIsFocused(true)}
            className={`w-full bg-transparent text-center font-bold outline-none text-sm transition-colors ${isDarkMode ? 'text-white group-hover:text-blue-400' : 'text-gray-900 group-hover:text-blue-600'}`}
          >
            {formattedValue || value}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5 pr-0.5">
        <button 
          type="button"
          onClick={() => {
            let next = value + 1;
            if (max !== undefined) next = Math.min(max, next);
            onChange(next);
          }}
          className={`p-1 rounded-md transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button 
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className={`p-1 rounded-md transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const InfoModal = ({ isOpen, onClose, isDarkMode }: { isOpen: boolean; onClose: () => void; isDarkMode: boolean }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 md:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-xl z-10 overflow-hidden rounded-3xl shadow-2xl border ${
                isDarkMode 
                  ? 'bg-slate-900/90 border-white/10 text-white shadow-black/50' 
                  : 'bg-white/90 border-slate-200/60 text-slate-900'
              } backdrop-blur-xl relative`}
            >
            <button 
              onClick={onClose}
              className={`absolute top-5 right-5 p-2 rounded-full transition-colors z-20 ${
                isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 md:p-10 space-y-8">
              <Logo isDarkMode={isDarkMode} />

              <p className={`text-lg leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                PDFPilot is a high-performance, browser-based PDF utility suite. We prioritize your data security by performing all operations 100% locally on your machine—your files never touch a server.
              </p>

              <div className="space-y-4">
                <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Main Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: 'Local Processing', desc: 'Secure & Offline' },
                    { title: 'Privacy Focused', desc: 'No data collection' },
                    { title: 'Merge & Split', desc: 'Organize pages' },
                    { title: 'Metadata Tools', desc: 'Sanitize & Edit' }
                  ].map((f, i) => (
                    <div key={i} className={`p-4 rounded-2xl border transition-colors ${isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                      <p className="font-bold text-sm tracking-tight">{f.title}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8 border-t border-slate-200 dark:border-white/10 text-center">
                <p className={`text-sm italic ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Crafted for excellence by <span className="font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Sahil Khatkar</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      )}
    </AnimatePresence>
  );
};

const FileSelector = ({ 
  onChange, 
  accept, 
  multiple = false, 
  label = "Choose File", 
  selectedFileName,
  isDarkMode 
}: { 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  accept?: string; 
  multiple?: boolean; 
  label?: string;
  selectedFileName?: string | null;
  isDarkMode: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`p-1.5 rounded-2xl border flex items-center gap-3 transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-800 focus-within:border-blue-500/50' : 'bg-white border-gray-200 focus-within:border-blue-400'}`}>
      <button
        onClick={() => inputRef.current?.click()}
        className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all shrink-0 whitespace-nowrap ${
          isDarkMode 
            ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20 active:scale-95' 
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-95'
        }`}
      >
        {label}
      </button>
      <span className={`text-[11px] md:text-sm font-medium truncate flex-grow text-left italic ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
        {selectedFileName || 'No file chosen'}
      </span>
      <input 
        type="file" 
        ref={inputRef}
        onChange={onChange}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />
    </div>
  );
};

const PdfPreviewModal = ({ isOpen, onClose, url, name, isDarkMode }: { isOpen: boolean; onClose: () => void; url: string | null; name: string; isDarkMode: boolean }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && url) {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjs.getDocument(url);
          const pdf = await loadingTask.promise;
          setNumPages(pdf.numPages);
          
          if (containerRef.current) {
            containerRef.current.innerHTML = '';
            for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) { // Limit to 20 pages for preview performance
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              canvas.className = "w-full mb-4 rounded-lg shadow-lg";
              
              if (context) {
                await page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise;
                containerRef.current.appendChild(canvas);
              }
            }
          }
        } catch (error) {
          console.error('Error rendering PDF preview:', error);
        }
      };
      loadPdf();
    }
  }, [isOpen, url]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`w-full h-full md:max-w-4xl md:h-[90vh] z-10 overflow-hidden flex flex-col ${
              isDarkMode 
                ? 'bg-slate-950 border-white/10 text-white' 
                : 'bg-gray-100 border-slate-200 text-slate-900'
            } md:rounded-3xl border shadow-2xl relative`}
          >
            <div className={`p-4 md:p-6 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="overflow-hidden">
                  <h3 className="font-bold truncate">{name}</h3>
                  <p className="text-xs text-slate-500">{numPages ? `${numPages} pages` : 'Loading...'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={url || '#'} download={name} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                  <Download className="w-5 h-5" />
                </a>
                <button 
                  onClick={onClose}
                  className={`p-2 rounded-xl transition-colors ${
                    isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 flex flex-col items-center">
              <div ref={containerRef} className="w-full max-w-2xl mx-auto" />
              {numPages && numPages > 20 && (
                <div className={`p-6 rounded-2xl border text-center ${isDarkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-gray-100'}`}>
                  <p className="text-slate-500">Previewing first 20 pages. Download to view the full document.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  
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
  const [numberVPosition, setNumberVPosition] = useState<'top' | 'bottom'>('bottom');
  const [numberFormat, setNumberFormat] = useState<string>('fraction');
  const [numberStartPageIndex, setNumberStartPageIndex] = useState<number>(1);
  const [numberStartValue, setNumberStartValue] = useState<number>(1);
  
  // New tool states
  const [imgResolution, setImgResolution] = useState<150 | 300>(150);
  const [imgFormat, setImgFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/png');
  const [filePageCounts, setFilePageCounts] = useState<Record<string, number>>({});
  
  const [metadataTitle, setMetadataTitle] = useState('');
  const [metadataAuthor, setMetadataAuthor] = useState('');
  const [metadataSubject, setMetadataSubject] = useState('');
  const [metadataCreator, setMetadataCreator] = useState('');

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

  // New tool states
  const [text2pdfInput, setText2pdfInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>(['']);
  const [historyIdx, setHistoryIdx] = useState(0);
  const quillRef = useRef<ReactQuill>(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection();
            const index = (range && range.index !== undefined) ? range.index : quill.getLength();
            quill.insertText(index, text);
            // Update selection to end of inserted text
            quill.setSelection(index + text.length, 0);
          } else {
            setText2pdfInput(prev => prev + text);
          }
        }
      };
      reader.readAsText(file);
    }
    // Reset input so the same file can be uploaded again
    if (e.target) e.target.value = '';
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const quill = quillRef.current?.getEditor();
        if (quill) {
          const range = quill.getSelection();
          const index = (range && range.index !== undefined) ? range.index : quill.getLength();
          quill.insertText(index, text);
          quill.setSelection(index + text.length, 0);
        } else {
          setText2pdfInput(prev => prev + text);
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  // Dialog states for text2pdf
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkData, setLinkData] = useState({ url: '', text: '', title: '', target: '_self' });
  const [showEmojiDialog, setShowEmojiDialog] = useState(false);

  const [copyPagesTargetFile, setCopyPagesTargetFile] = useState<PDFFile | null>(null);
  const [copyPagesRange, setCopyPagesRange] = useState('');
  const [pdfAttachments, setPdfAttachments] = useState<File[]>([]);
  const [drawImgFile, setDrawImgFile] = useState<File | null>(null);
  const [drawShape, setDrawShape] = useState<'rect' | 'circle' | 'line'>('rect');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [drawX, setDrawX] = useState(50);
  const [drawY, setDrawY] = useState(50);
  const [drawWidth, setDrawWidth] = useState(100);
  const [drawHeight, setDrawHeight] = useState(100);
  const [drawShapeColor, setDrawShapeColor] = useState('#3b82f6');
  const [drawFontSize, setDrawFontSize] = useState(12);
  const [showAdvancedPos, setShowAdvancedPos] = useState(false);

  // Viewer Preferences states
  const [prefHideToolbar, setPrefHideToolbar] = useState(false);
  const [prefHideMenubar, setPrefHideMenubar] = useState(false);
  const [prefHideWindowUI, setPrefHideWindowUI] = useState(false);
  const [prefFitWindow, setPrefFitWindow] = useState(false);
  const [prefCenterWindow, setPrefCenterWindow] = useState(false);
  const [prefDisplayDocTitle, setPrefDisplayDocTitle] = useState(false);
  const [prefPageLayout, setPrefPageLayout] = useState<'SinglePage' | 'OneColumn' | 'TwoColumnLeft' | 'TwoColumnRight' | 'TwoPageLeft' | 'TwoPageRight'>('SinglePage');
  const [prefPageMode, setPrefPageMode] = useState<'UseNone' | 'UseOutlines' | 'UseThumbs' | 'FullScreen' | 'UseOC' | 'UseAttachments'>('UseNone');
  const [prefNonFullScreenPageMode, setPrefNonFullScreenPageMode] = useState<'UseNone' | 'UseOutlines' | 'UseThumbs' | 'UseOC'>('UseNone');
  const [prefReadingDirection, setPrefReadingDirection] = useState<'L2R' | 'R2L'>('L2R');
  const [prefPrintScaling, setPrefPrintScaling] = useState<'None' | 'AppDefault'>('AppDefault');
  const [prefDuplex, setPrefDuplex] = useState<'None' | 'Simplex' | 'DuplexFlipShortEdge' | 'DuplexFlipLongEdge'>('None');
  const [prefPickTrayByPDFSize, setPrefPickTrayByPDFSize] = useState(false);
  const [prefNumCopies, setPrefNumCopies] = useState(1);

  const [featureClickCounts, setFeatureClickCounts] = useState([0, 0, 0, 0]);
  const [highlightedTool, setHighlightedTool] = useState<string | null>(null);

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

  // History management and count for Text to PDF
  useEffect(() => {
    if (activeTool === 'text2pdf') {
      // Calculate counts using a more robust regex-based extraction for word counting
      // to ensure block-level elements are treated as separators
      const strippedHtml = text2pdfInput.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
      const cleanText = strippedHtml.replace(/\s+/g, ' ').trim();
      
      setCharCount(cleanText.length);
      setWordCount(cleanText === '' ? 0 : cleanText.split(/\s+/).length);

      // History
      if (text2pdfInput !== inputHistory[historyIdx]) {
        const timer = setTimeout(() => {
          const newHistory = inputHistory.slice(0, historyIdx + 1);
          newHistory.push(text2pdfInput);
          if (newHistory.length > 50) newHistory.shift();
          setInputHistory(newHistory);
          setHistoryIdx(newHistory.length - 1);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [text2pdfInput, activeTool, historyIdx, inputHistory]);

  const insertFormat = useCallback((format: string, value: any = true) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    
    // Always focus the editor first to ensure selection is active
    quill.focus();
    
    // If no selection, focus will restore it or we can just apply format
    quill.format(format, value);
  }, []);

  const undo = () => {
    if (historyIdx > 0) {
      const prev = inputHistory[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setText2pdfInput(prev);
    }
  };

  const redo = () => {
    if (historyIdx < inputHistory.length - 1) {
      const next = inputHistory[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setText2pdfInput(next);
    }
  };


  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  // Scroll to top when tool changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTool]);

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
      
      // Detect page counts for PDF files
      newFiles.forEach(async (f) => {
        if (f.file.type === 'application/pdf') {
          try {
            const arrayBuffer = await f.file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            setFilePageCounts(prev => ({ ...prev, [f.id]: pdfDoc.getPageCount() }));
          } catch (e) {
            console.error('Error getting page count:', e);
          }
        }
      });

      setFiles(prev => (activeTool === 'merge' || activeTool === 'img2pdf') ? [...prev, ...newFiles] : [newFiles[0]]);
      setResults([]);
      setError(null);
      
      // Reset input value to allow selecting same file again
      e.target.value = '';
      
      // Load pages for organize tool
      if (activeTool === 'organize' && newFiles[0] && !isImageTool) {
        loadPdfPages(newFiles[0].file);
      }

      // Load metadata for metadata tool
      if (activeTool === 'metadata' && newFiles[0] && !isImageTool) {
        loadMetadata(newFiles[0].file);
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

  const loadMetadata = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      setMetadataTitle(pdfDoc.getTitle() || '');
      setMetadataAuthor(pdfDoc.getAuthor() || '');
      setMetadataSubject(pdfDoc.getSubject() || '');
      setMetadataCreator(pdfDoc.getCreator() || '');
    } catch (err) {
      console.error('Metadata load error:', err);
      setError('Could not load PDF metadata.');
    }
  };

  const processPdf = async () => {
    if (activeTool !== 'text2pdf' && files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    const newResults: SplitResult[] = [];

    try {
      if (activeTool === 'text2pdf') {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
        pdfDoc.setProducer('PDFPilot (https://github.com/ SahilKhatkar11/pdfpilot)');
        
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const fontSize = 12;
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        
        const margin = 50;
        const maxWidth = width - (margin * 2);
        let currentY = height - margin;
        let currentPage = page;

        const splitText = (text: string, font: any, size: number, maxWidth: number) => {
          // Normalize text: replace newlines with a marker or split by them
          const paragraphs = sanitizeForPdf(text).split(/\r?\n/);
          const resultLines: string[] = [];
          
          for (const paragraph of paragraphs) {
            const words = paragraph.split(' ');
            let currentLine = '';
            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const width = font.widthOfTextAtSize(testLine, size);
              if (width > maxWidth && currentLine) {
                resultLines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
            if (currentLine) resultLines.push(currentLine);
            else if (paragraphs.length > 1) resultLines.push(''); // Keep empty lines if there were manual line breaks
          }
          return resultLines;
        };

        const div = document.createElement('div');
        div.innerHTML = text2pdfInput;
        
        // Flatten blocks (we'll look at the children of the editor)
        // Standard Quill output: <p>, <h1>, <ul><li>...</li></ul>, etc.
        const blocks = Array.from(div.childNodes);

        for (const node of blocks) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (!text) continue;
            // Handle plain text
            const wrapped = splitText(text, font, fontSize, maxWidth);
            for (const line of wrapped) {
              if (currentY < margin + fontSize) {
                currentPage = pdfDoc.addPage([595.28, 841.89]);
                currentY = height - margin;
              }
              currentPage.drawText(line, { x: margin, y: currentY, size: fontSize, font, color: rgb(0,0,0) });
              currentY -= fontSize * 1.4;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            let currentFont = font;
            let currentFontSize = fontSize;
            let xOffset = 0;
            let isList = false;
            let listType: 'bullet' | 'ordered' | 'circle' | 'square' = 'bullet';

            // Check for indent classes: ql-indent-1, etc.
            const indentMatch = el.className.match(/ql-indent-(\d+)/);
            if (indentMatch) {
              xOffset += parseInt(indentMatch[1]) * 20;
            }

            if (tag.startsWith('h')) {
              currentFont = fontBold;
              const level = parseInt(tag.substring(1));
              currentFontSize = fontSize + (7 - level) * 2;
            } else if (tag === 'pre') {
              currentFont = fontItalic;
              currentFontSize = fontSize - 1;
            } else if (tag === 'ul' || tag === 'ol') {
              isList = true;
            }

            const processElement = (element: HTMLElement, subXOffset: number, subFont: any, subSize: number, inheritedListStyle: string | null = null) => {
              // Handle indentation for individual elements (like LI)
              const elementIndentMatch = element.className.match(/ql-indent-(\d+)/);
              if (elementIndentMatch) {
                subXOffset += parseInt(elementIndentMatch[1]) * 20;
              }

              const text = element.innerText || element.textContent || '';
              if (!text.trim() && element.tagName.toLowerCase() !== 'li') return;

              const wrapped = splitText(text, subFont, subSize, maxWidth - subXOffset);
              for (const line of wrapped) {
                if (currentY < margin + subSize) {
                  currentPage = pdfDoc.addPage([595.28, 841.89]);
                  currentY = height - margin;
                }
                
                // Draw bullet/number for first line of LI
                if (element.tagName.toLowerCase() === 'li' && line === wrapped[0]) {
                  const parent = element.parentElement;
                  
                  // Extremely robust list detection and style extraction
                  const getStyleData = (node: HTMLElement) => {
                    const dataList = node.getAttribute('data-list');
                    const className = node.className;
                    const styleType = node.style.listStyleType;
                    const htmlType = node.getAttribute('type');
                    
                    // Priority order for type detection
                    const val = (dataList || htmlType || styleType || '').toLowerCase();
                    
                    let type = 'ordered'; // default assumption for OL
                    if (parent?.tagName.toLowerCase() === 'ul') type = 'bullet';
                    
                    if (val.includes('bullet') || val === 'disc') type = 'bullet';
                    else if (val.includes('circle') || val === 'o') type = 'circle';
                    else if (val.includes('square') || val === 's') type = 'square';
                    else if (val.includes('alpha') || val.includes('latin') || val === 'a' || val === 'A') type = 'alpha';
                    else if (val.includes('roman') || val === 'i' || val === 'I') type = 'roman';
                    else if (val.includes('decimal') || val.includes('ordered') || val.includes('number') || val === '1') type = 'ordered';
                    
                    // Detect case from raw values
                    const isUpper = (dataList?.includes('upper') || htmlType === 'A' || htmlType === 'I' || styleType?.includes('upper') || val.includes('upper'));
                    
                    return { type, isUpper };
                  };

                  const styleData = getStyleData(element) || (parent ? getStyleData(parent) : { type: 'bullet', isUpper: false });
                  const { type, isUpper } = styleData;
                  
                  const isOrdered = ['ordered', 'alpha', 'roman'].includes(type);

                  if (isOrdered) {
                    // Numbering/Lettering logic
                    const listItems = Array.from(parent?.children || []).filter(c => c.tagName.toLowerCase() === 'li');
                    const index = listItems.indexOf(element) + 1;
                    let prefix = "";
                    
                    if (type === 'alpha') {
                      const alphaChar = String.fromCharCode((isUpper ? 65 : 97) + ((index - 1) % 26));
                      prefix = `${alphaChar}.`;
                    } else if (type === 'roman') {
                      const toRoman = (num: number) => {
                        const lookup: [string, number][] = [['m',1000],['cm',900],['d',500],['cd',400],['c',100],['xc',90],['l',50],['xl',40],['x',10],['ix',9],['v',5],['iv',4],['i',1]];
                        let roman = '';
                        let n = num;
                        for (const [char, val] of lookup) {
                          while (n >= val) { roman += char; n -= val; }
                        }
                        return roman;
                      };
                      prefix = `${toRoman(index)}.`;
                      if (isUpper) prefix = prefix.toUpperCase();
                    } else {
                      prefix = `${index}.`;
                    }

                    currentPage.drawText(prefix, { x: margin + subXOffset - 25, y: currentY, size: subSize, font: fontBold, color: rgb(0,0,0) });
                  } else {
                    // Bullets
                    if (type === 'circle') {
                      currentPage.drawCircle({ x: margin + subXOffset - 12, y: currentY + 4, size: 2.5, borderWidth: 1, borderColor: rgb(0,0,0) });
                    } else if (type === 'square') {
                      currentPage.drawRectangle({ x: margin + subXOffset - 14, y: currentY + 2, width: 4.5, height: 4.5, color: rgb(0,0,0) });
                    } else {
                      // Default bullet (solid disc)
                      currentPage.drawCircle({ x: margin + subXOffset - 12, y: currentY + 4, size: 2.5, color: rgb(0,0,0) });
                    }
                  }
                }

                currentPage.drawText(line, { x: margin + subXOffset, y: currentY, size: subSize, font: subFont, color: rgb(0,0,0) });
                currentY -= subSize * 1.4;
              }
            };

            if (isList) {
              const detectedListStyle = el.getAttribute('data-list');
              const items = Array.from(el.children) as HTMLElement[];
              for (const li of items) {
                processElement(li, xOffset + 20, font, fontSize, detectedListStyle);
              }
            } else {
              processElement(el, xOffset, currentFont, currentFontSize);
            }

            // Margin after blocks
            currentY -= 5;
          }
        }
        
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `text_document.pdf`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: `Text document`,
          size: blob.size,
          pageCount: pdfDoc.getPageCount()
        });
      }

      // Helper to process a single PDF file
      const processSingleFile = async (pdfFile: PDFFile) => {
        const file = pdfFile.file;
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();

        // Set default creator and producer
        pdfDoc.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
        pdfDoc.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');

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
              pageRange: `${i + 1}-${end}`,
              size: blob.size,
              pageCount: subPdfDoc.getPageCount()
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
          newResults.push({ 
            name: `rotated_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: selectedPages.length > 0 ? `Selected Pages` : 'All Pages',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'duplicate') {
          // Duplicate specific page multiple times at the end of the document
          const pageIdx = Math.max(0, Math.min(duplicatePageNum - 1, pageCount - 1));
          for (let i = 0; i < duplicateCount; i++) {
            const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [pageIdx]);
            pdfDoc.addPage(copiedPage);
          }
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `duplicated_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: `Page ${pageIdx + 1} x${duplicateCount}`,
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'blank') {
          const pos = Math.max(0, Math.min(blankPagePos, pageCount));
          pdfDoc.insertPage(pos);
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `blank_added_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: `Blank at ${pos + 1}`,
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'reverse') {
          const subPdfDoc = await PDFDocument.create();
          const indices = Array.from({ length: pageCount }, (_, i) => pageCount - 1 - i);
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, indices);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `reversed_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Reversed',
            size: blob.size,
            pageCount: subPdfDoc.getPageCount()
          });
        } else if (activeTool === 'pdf2img') {
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          const scale = imgResolution / 72; // Convert DPI to scale (PDF.js default is 72dpi)
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            if (context) {
              await page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise;
              const extension = imgFormat.split('/')[1];
              const dataUrl = canvas.toDataURL(imgFormat, 0.9);
              const res = await fetch(dataUrl);
              const blob = await res.blob();
              newResults.push({
                name: `${file.name.replace('.pdf', '')}_page_${i}.${extension}`,
                blob,
                url: dataUrl,
                pageRange: `Page ${i}`,
                size: blob.size,
                pageCount: 1
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
            text: fullText,
            size: blob.size,
            pageCount: pdf.numPages
          });
        } else if (activeTool === 'watermark') {
          const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          const pages = pdfDoc.getPages();
          pages.forEach(page => {
            const rotation = page.getRotation().angle;
            const { width, height } = page.getSize();
            
            // Visual dimensions
            const vx = width / 4;
            const vy = height / 2;

            // Mapping visual to internal coordinates
            const isHorizontal = rotation === 90 || rotation === 270;
            const originalWidth = isHorizontal ? height : width;
            const originalHeight = isHorizontal ? width : height;

            let drawX, drawY;
            if (rotation === 0) {
              drawX = vx; drawY = vy;
            } else if (rotation === 90) {
              drawX = originalWidth - vy; drawY = vx;
            } else if (rotation === 180) {
              drawX = originalWidth - vx; drawY = originalHeight - vy;
            } else { // 270
              drawX = vy; drawY = originalHeight - vx;
            }

            page.drawText(sanitizeForPdf(watermarkText.replace(/\r?\n/g, ' ')), {
              x: drawX,
              y: drawY,
              size: 50,
              font,
              color: rgb(0.7, 0.7, 0.7),
              opacity: 0.3,
              rotate: degrees(45 - rotation), // Keep visual 45 degrees regardless of page rotation
            });
          });
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `watermarked_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'All pages',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'number') {
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const pages = pdfDoc.getPages();

          const toRoman = (num: number): string => {
            const roman: { [key: string]: number } = {
              M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1
            };
            let str = '';
            for (let i of Object.keys(roman)) {
              let q = Math.floor(num / roman[i]);
              num -= q * roman[i];
              str += i.repeat(q);
            }
            return str;
          };

          const toAlpha = (num: number): string => {
            let alpha = '';
            while (num > 0) {
              let m = (num - 1) % 26;
              alpha = String.fromCharCode(65 + m) + alpha;
              num = Math.floor((num - m) / 26);
            }
            return alpha;
          };

          pages.forEach((page, i) => {
            const currentDocPage = i + 1;
            if (currentDocPage < numberStartPageIndex) return;

            const displayNum = (currentDocPage - numberStartPageIndex) + numberStartValue;

            const rotation = page.getRotation().angle;
            const { width, height } = page.getSize();
            
            const isHorizontal = rotation === 90 || rotation === 270;
            const originalWidth = isHorizontal ? height : width;
            const originalHeight = isHorizontal ? width : height;

            let text = '';
            if (numberFormat === 'simple') text = `${displayNum}`;
            else if (numberFormat === 'fraction') text = `${displayNum}/${pages.length}`;
            else if (numberFormat === 'full') text = `Page ${displayNum} of ${pages.length}`;
            else if (numberFormat === 'roman-upper') text = toRoman(displayNum);
            else if (numberFormat === 'roman-lower') text = toRoman(displayNum).toLowerCase();
            else if (numberFormat === 'alpha-upper') text = toAlpha(displayNum);
            else if (numberFormat === 'alpha-lower') text = toAlpha(displayNum).toLowerCase();

            const textWidth = font.widthOfTextAtSize(text, 10);
            
            // Visual coordinates
            let vx = width / 2 - textWidth / 2;
            if (numberPosition === 'left') vx = 40;
            else if (numberPosition === 'right') vx = width - textWidth - 40;
            
            let vy = numberVPosition === 'bottom' ? 25 : height - 35;

            let drawX, drawY;
            if (rotation === 0) {
              drawX = vx; drawY = vy;
            } else if (rotation === 90) {
              // 90 Deg Clockwise: Origin (drawX, drawY) for text should be adjusted
              drawX = originalWidth - vy; 
              drawY = vx; 
            } else if (rotation === 180) {
              drawX = originalWidth - vx; 
              drawY = originalHeight - vy;
            } else { // 270
              drawX = vy; 
              drawY = originalHeight - vx;
            }

            page.drawText(sanitizeForPdf(text), {
              x: drawX,
              y: drawY,
              size: 10,
              font,
              color: rgb(0, 0, 0),
              rotate: degrees(-rotation), // Counter-rotate text to stay upright
            });
          });
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `numbered_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'All pages',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
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
          subPdfDoc.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          subPdfDoc.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, indices);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `extracted_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: extractRange,
            size: blob.size,
            pageCount: subPdfDoc.getPageCount()
          });
        } else if (activeTool === 'organize') {
          const subPdfDoc = await PDFDocument.create();
          subPdfDoc.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          subPdfDoc.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          const copiedPages = await subPdfDoc.copyPages(pdfDoc, pdfPages);
          copiedPages.forEach(p => subPdfDoc.addPage(p));
          const pdfBytes = await subPdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `organized_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Custom',
            size: blob.size,
            pageCount: subPdfDoc.getPageCount()
          });
        } else if (activeTool === 'draw') {
          const pages = pdfDoc.getPages();
          const targetPageIdx = Math.max(0, Math.min(signPageNum - 1, pages.length - 1));
          const targetPage = pages[targetPageIdx];
          const rotation = targetPage.getRotation().angle;
          const { width, height } = targetPage.getSize();
          
          const isHorizontal = rotation === 90 || rotation === 270;
          const originalWidth = isHorizontal ? height : width;
          const originalHeight = isHorizontal ? width : height;

          if (signatureData) {
            const sigImage = await pdfDoc.embedPng(signatureData);
            const sigDims = sigImage.scale(0.5);
            
            // Visual coordinates
            let vx = 0;
            let vy = 0;
            
            switch (signPosition) {
              case 'top-left':
                vx = 50;
                vy = height - sigDims.height - 50;
                break;
              case 'top-right':
                vx = width - sigDims.width - 50;
                vy = height - sigDims.height - 50;
                break;
              case 'bottom-left':
                vx = 50;
                vy = 50;
                break;
              case 'bottom-right':
                vx = width - sigDims.width - 50;
                vy = 50;
                break;
              case 'center':
                vx = (width - sigDims.width) / 2;
                vy = (height - sigDims.height) / 2;
                break;
            }

            // Map visual to internal
            let drawX, drawY;
            if (rotation === 0) {
              drawX = vx; drawY = vy;
            } else if (rotation === 90) {
              drawX = originalWidth - vy; drawY = vx;
            } else if (rotation === 180) {
              drawX = originalWidth - vx; drawY = originalHeight - vy;
            } else { // 270
              drawX = vy; drawY = originalHeight - vx;
            }
            
            targetPage.drawImage(sigImage, {
              x: drawX,
              y: drawY,
              width: sigDims.width,
              height: sigDims.height,
              rotate: degrees(-rotation), // Counter-rotate image
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
          newResults.push({ 
            name: `signed_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: `Signed Page ${targetPageIdx + 1}`,
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'metadata') {
          pdfDoc.setTitle(sanitizeForPdf(metadataTitle));
          pdfDoc.setAuthor(sanitizeForPdf(metadataAuthor));
          pdfDoc.setSubject(sanitizeForPdf(metadataSubject));
          pdfDoc.setCreator(sanitizeForPdf(metadataCreator));
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `metadata_updated_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Metadata Updated',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'viewerPreferences') {
          const catalog = pdfDoc.catalog;
          catalog.set(PDFName.of('PageLayout'), PDFName.of(prefPageLayout));
          catalog.set(PDFName.of('PageMode'), PDFName.of(prefPageMode));
          
          const viewerPrefs = pdfDoc.context.obj({
            HideToolbar: prefHideToolbar,
            HideMenubar: prefHideMenubar,
            HideWindowUI: prefHideWindowUI,
            FitWindow: prefFitWindow,
            CenterWindow: prefCenterWindow,
            DisplayDocTitle: prefDisplayDocTitle,
            NonFullScreenPageMode: PDFName.of(prefNonFullScreenPageMode),
            Direction: PDFName.of(prefReadingDirection === 'L2R' ? 'L2R' : 'R2L'),
            PrintScaling: PDFName.of(prefPrintScaling),
            Duplex: PDFName.of(prefDuplex),
            PickTrayByPDFSize: prefPickTrayByPDFSize,
            NumCopies: prefNumCopies,
          });
          catalog.set(PDFName.of('ViewerPreferences'), viewerPrefs);

          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `viewer_prefs_updated_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Preferences Set',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'grayscale') {
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          const grayscalePdf = await PDFDocument.create();
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            if (context) {
              await page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise;
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              const data = imageData.data;
              for (let j = 0; j < data.length; j += 4) {
                const avg = (data[j] + data[j + 1] + data[j + 2]) / 3;
                data[j] = avg;
                data[j + 1] = avg;
                data[j + 2] = avg;
              }
              context.putImageData(imageData, 0, 0);
              const imgBytes = await new Promise<Uint8Array>((resolve) => {
                canvas.toBlob((blob) => {
                  blob?.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
                }, 'image/jpeg', 0.8);
              });
              const img = await grayscalePdf.embedJpg(imgBytes);
              const newPage = grayscalePdf.addPage([img.width, img.height]);
              newPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            }
          }
          const pdfBytes = await grayscalePdf.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `grayscale_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Grayscale',
            size: blob.size,
            pageCount: grayscalePdf.getPageCount()
          });
        } else if (activeTool === 'flatten') {
          const form = pdfDoc.getForm();
          form.flatten();
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `flattened_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Flattened',
            size: blob.size,
            pageCount: pdfDoc.getPageCount()
          });
        } else if (activeTool === 'sanitize') {
          const sanitizedPdf = await PDFDocument.create();
          const copiedPages = await sanitizedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => sanitizedPdf.addPage(page));
          
          // Set clean metadata
          sanitizedPdf.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          sanitizedPdf.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
          sanitizedPdf.setCreationDate(new Date());
          sanitizedPdf.setModificationDate(new Date());
          
          const pdfBytes = await sanitizedPdf.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          newResults.push({ 
            name: `sanitized_${file.name}`, 
            blob, 
            url: URL.createObjectURL(blob), 
            pageRange: 'Sanitized',
            size: blob.size,
            pageCount: sanitizedPdf.getPageCount()
          });
        }
      };

      if (activeTool === 'merge') {
        const mergedPdf = await PDFDocument.create();
        mergedPdf.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
        mergedPdf.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
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
          pageRange: `All pages`,
          size: blob.size,
          pageCount: mergedPdf.getPageCount()
        });
      } else if (activeTool === 'img2pdf') {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.setCreator('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
        pdfDoc.setProducer('PDFPilot (https://github.com/SahilKhatkar11/pdfpilot)');
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
        newResults.push({ 
          name: `images_to_pdf.pdf`, 
          blob, 
          url: URL.createObjectURL(blob), 
          pageRange: `${files.length} images`,
          size: blob.size,
          pageCount: pdfDoc.getPageCount()
        });
      } else if (activeTool === 'text2pdf') {
        // Handled at start of processPdf
      } else if (activeTool === 'copyPages') {
        if (!files[0] || !copyPagesTargetFile) throw new Error('Source and target files required');
        const sourcePdfBytes = await files[0].file.arrayBuffer();
        const targetPdfBytes = await copyPagesTargetFile.file.arrayBuffer();
        
        const sourcePdf = await PDFDocument.load(sourcePdfBytes);
        const targetPdf = await PDFDocument.load(targetPdfBytes);
        
        const indices = copyPagesRange.split(',').flatMap(r => {
          if (r.includes('-')) {
            const [start, end] = r.split('-').map(Number);
            return Array.from({ length: end - start + 1 }, (_, i) => start + i - 1);
          }
          return [Number(r) - 1];
        }).filter(i => i >= 0 && i < sourcePdf.getPageCount());
        
        if (indices.length === 0) throw new Error('Invalid page range');
        
        const copiedPages = await targetPdf.copyPages(sourcePdf, indices);
        copiedPages.forEach(p => targetPdf.addPage(p));
        
        const pdfBytes = await targetPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `modified_${copyPagesTargetFile.file.name}`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: `Copied ${indices.length} pages`,
          size: blob.size,
          pageCount: targetPdf.getPageCount()
        });
      } else if (activeTool === 'addAttachments') {
        const file = files[0].file;
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        
        for (const attachment of pdfAttachments) {
          const attBuffer = await attachment.arrayBuffer();
          await pdfDoc.attach(attBuffer, attachment.name, {
            mimeType: attachment.type,
            creationDate: new Date(),
            modificationDate: new Date(),
          });
        }
        
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `attached_${file.name}`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: `${pdfAttachments.length} attachments`,
          size: blob.size,
          pageCount: pdfDoc.getPageCount()
        });
      } else if (activeTool === 'drawImages') {
        const file = files[0].file;
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[Math.max(0, Math.min(signPageNum - 1, pages.length - 1))];
        
        if (drawImgFile) {
          const imgBuffer = await drawImgFile.arrayBuffer();
          let image;
          if (drawImgFile.type === 'image/jpeg' || drawImgFile.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(imgBuffer);
          } else if (drawImgFile.type === 'image/png') {
            image = await pdfDoc.embedPng(imgBuffer);
          }
          
          if (image) {
            page.drawImage(image, {
              x: drawX,
              y: drawY,
              width: drawWidth,
              height: drawHeight,
            });
          }
        }
        
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `image_added_${file.name}`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: 'Image drawn',
          size: blob.size,
          pageCount: pdfDoc.getPageCount()
        });
      } else if (activeTool === 'drawVectors') {
        const file = files[0].file;
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[Math.max(0, Math.min(signPageNum - 1, pages.length - 1))];
        
        const hexToRgb = (hex: string) => {
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          return rgb(r, g, b);
        };
        
        const color = hexToRgb(drawShapeColor);
        
        if (drawShape === 'rect') {
          page.drawRectangle({ x: drawX, y: drawY, width: drawWidth, height: drawHeight, color });
        } else if (drawShape === 'circle') {
          page.drawCircle({ x: drawX, y: drawY, size: drawWidth / 2, color });
        } else if (drawShape === 'line') {
          page.drawLine({ start: { x: drawX, y: drawY }, end: { x: drawX + drawWidth, y: drawY + drawHeight }, color, thickness: 2 });
        }
        
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        newResults.push({
          name: `vector_added_${file.name}`,
          blob,
          url: URL.createObjectURL(blob),
          pageRange: 'Vector drawn',
          size: blob.size,
          pageCount: pdfDoc.getPageCount()
        });
      } else {
        // Batch processing for other tools (handled in processSingleFile)
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
    const id = Math.random().toString(36).substring(2, 9) + Date.now();
    setFiles([{ id, file }]);
    if (result.pageCount) {
      setFilePageCounts(prev => ({ ...prev, [id]: result.pageCount }));
    }
    setActiveTool(toolId);
    setResults([]);
    setError(null);
    if (toolId === 'organize') {
      loadPdfPages(file);
    } else if (toolId === 'metadata') {
      loadMetadata(file);
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

      <div className="flex-grow relative z-10 flex flex-col">
        {/* Sticky Header */}
        <header className={`sticky top-0 z-30 w-full transition-all duration-300 ${
          isDarkMode ? 'bg-[#0c142e]/85 border-blue-900/20' : 'bg-blue-50/80 border-blue-100/50'
        } backdrop-blur-md border-b`}>
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              {activeTool && (
                <button 
                  onClick={() => setIsMenuOpen(true)}
                  className={`p-2 md:p-2.5 rounded-xl transition-all shadow-lg ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                >
                  <Menu className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              )}
              <Logo 
                isDarkMode={isDarkMode} 
                className="scale-85 md:scale-100 origin-left" 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              />
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => setIsInfoModalOpen(true)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 shadow-lg ${
                  isDarkMode 
                    ? 'bg-slate-800 text-slate-400 shadow-slate-900/50 hover:bg-slate-700 hover:text-white' 
                    : 'bg-white text-slate-600 shadow-slate-200 hover:bg-slate-50 hover:text-gray-900'
                }`}
                title="Application Info"
              >
                <Info className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 shadow-lg ${
                  isDarkMode 
                    ? 'bg-slate-800 text-yellow-400 shadow-slate-900/50 hover:bg-slate-700' 
                    : 'bg-white text-slate-600 shadow-slate-200 hover:bg-slate-50'
                }`}
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-grow p-4 md:p-8">
          <div className="max-w-5xl mx-auto">
            <main>
            {!activeTool ? (
              <div className="space-y-6 md:space-y-10 py-6 md:py-10">
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

                {/* Features Section */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                  {[
                    { title: 'Privacy First', icon: Lock },
                    { title: 'Local Processing', icon: Home },
                    { title: 'No File Limits', icon: Layers },
                    { title: 'Fast & Free', icon: Zap }
                  ].map((feature, i) => (
                    <motion.div
                      key={i}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const newCounts = [...featureClickCounts];
                        newCounts[i]++;
                        setFeatureClickCounts(newCounts);
                      }}
                      className={`p-4 md:p-5 rounded-2xl border flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer relative overflow-hidden ${
                        isDarkMode 
                          ? 'bg-slate-900/40 border-slate-800 text-slate-300' 
                          : 'bg-white border-gray-100 text-slate-600 shadow-sm'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-2 relative z-10">
                        <feature.icon className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">{feature.title}</span>
                      </div>
                      
                      {/* Shiny Polish Effect - One-way Diagonal */}
                      <motion.div
                        key={featureClickCounts[i]}
                        initial={{ left: '-150%', top: '150%' }}
                        animate={featureClickCounts[i] > 0 ? { left: '150%', top: '-150%' } : {}}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`absolute w-[200%] h-[200%] pointer-events-none z-20 -rotate-45 ${
                          isDarkMode 
                            ? 'bg-gradient-to-r from-transparent via-white/10 to-transparent' 
                            : 'bg-gradient-to-r from-transparent via-blue-400/20 to-transparent'
                        }`}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* Tools Quick List */}
                <div className="mb-10 md:mb-12">
                  <div className="flex items-center gap-3 mb-8">
                    <div className={`h-px flex-grow ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`} />
                    <h4 className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] whitespace-nowrap ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                      List of tools we offer
                    </h4>
                    <div className={`h-px flex-grow ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`} />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                    {TOOLS.map((tool) => (
                      <motion.button
                        key={tool.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          // Scroll to the specific tool card first
                          const element = document.getElementById(`tool-card-${tool.id}`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // Trigger the glow effect after the scroll has started/finished
                            setTimeout(() => {
                              setHighlightedTool(tool.id);
                              setTimeout(() => setHighlightedTool(null), 800);
                            }, 500);
                          }
                        }}
                        className={`px-3 md:px-4 py-1.5 md:py-2 rounded-xl border text-[9px] md:text-[11px] font-bold transition-all ${
                          isDarkMode 
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/40' 
                            : 'bg-white border-gray-100 text-slate-500 hover:text-blue-600 hover:border-blue-200 shadow-sm'
                        }`}
                      >
                        {tool.name}
                      </motion.button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-8">
                    <div className={`h-px flex-grow ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`} />
                    <div className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-gray-200'}`} />
                    <div className={`h-px flex-grow ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`} />
                  </div>
                </div>

                <div id="tools-grid" className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                  {TOOLS.map((tool, idx) => (
                    <motion.button
                      key={tool.id}
                      id={`tool-card-${tool.id}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                        boxShadow: highlightedTool === tool.id 
                          ? (isDarkMode ? '0 0 40px rgba(59, 130, 246, 0.6)' : '0 0 30px rgba(59, 130, 246, 0.4)') 
                          : 'none'
                      }}
                      transition={{ 
                        delay: highlightedTool === tool.id ? 0 : 0.1 * idx,
                        boxShadow: { duration: 0.3 }
                      }}
                      onClick={() => setActiveTool(tool.id)}
                      className={`group p-4 pb-2 md:p-6 md:pb-4 rounded-2xl md:rounded-[2rem] border text-left transition-all duration-500 ${
                        highlightedTool === tool.id 
                          ? (isDarkMode ? 'border-blue-500 bg-slate-800/80' : 'border-blue-400 bg-blue-50/30')
                          : (isDarkMode ? 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50' : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-xl')
                      } hover:scale-[1.02]`}
                    >
                      <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3 ${tool.color} shadow-lg shadow-current/20`}>
                        <tool.icon className="w-5 h-5 md:w-7 md:h-7 text-white" />
                      </div>
                      <h3 className={`text-sm md:text-xl font-bold mb-1 md:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tool.name}</h3>
                      <p className={`text-[10px] md:text-sm leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-gray-500'}`}>{tool.description}</p>
                      <div className="mt-1 md:mt-2 hidden md:flex items-center gap-2 text-blue-600 font-bold text-[10px] md:text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        Get Started <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
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
                <div className="space-y-6 md:space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

                  {files.length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 md:p-6 rounded-2xl border-l-4 border-blue-600 ${isDarkMode ? 'bg-blue-500/5 text-slate-300 shadow-lg shadow-blue-950/20' : 'bg-blue-50/50 text-slate-700 shadow-sm shadow-blue-100/50'}`}
                    >
                      <p className="text-sm md:text-base leading-relaxed font-medium">
                        {TOOLS.find(t => t.id === activeTool)?.toolInfo}
                      </p>
                    </motion.div>
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
                        activeTool === 'text2pdf' ? (
                          <div className="p-4 md:p-10 space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="text-center md:text-left space-y-1">
                                <h2 className={`text-2xl md:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Text To PDF Converter</h2>
                                <p className={`text-sm md:text-base ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Create professional PDF documents with advanced formatting tools.</p>
                              </div>
                            </div>
                            
                            <div className={`rounded-3xl border overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-slate-950 border-slate-800 shadow-2xl' : 'bg-white border-gray-100 shadow-xl'}`}>
                              {/* Custom Toolbar */}
                              <div className={`flex flex-wrap items-center gap-2 p-3 border-b sticky top-0 z-20 ${isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-gray-100 bg-white/90'} backdrop-blur-md`}>
                                <div className="flex items-center gap-0.5">
                                  <button onClick={undo} disabled={historyIdx === 0} title="Undo" className={`p-2 rounded-lg hover:bg-blue-500/10 disabled:opacity-20 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Undo2 className="w-4 h-4" /></button>
                                  <button onClick={redo} disabled={historyIdx === inputHistory.length - 1} title="Redo" className={`p-2 rounded-lg hover:bg-blue-500/10 disabled:opacity-20 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Redo2 className="w-4 h-4" /></button>
                                </div>
                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />
                                
                                {/* Format Selector */}
                                <div className="relative group">
                                  <button className={`px-3 py-1.5 rounded-lg border text-sm font-medium outline-none flex items-center gap-2 transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                    <Type className="w-4 h-4" />
                                    <span>Style</span>
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                  </button>
                                  <div className={`absolute top-full left-0 pt-2 hidden group-hover:block z-[50]`}>
                                    <div className={`p-2 rounded-2xl shadow-2xl border min-w-[220px] ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
                                      {[
                                        { id: 'p', label: 'Paragraph', className: 'text-sm font-normal' },
                                        { id: 'h1', label: 'Heading 1', className: 'text-xl font-black' },
                                        { id: 'h2', label: 'Heading 2', className: 'text-lg font-extrabold' },
                                        { id: 'h3', label: 'Heading 3', className: 'text-base font-bold' },
                                        { id: 'h4', label: 'Heading 4', className: 'text-sm font-semibold uppercase tracking-wider' },
                                        { id: 'h5', label: 'Heading 5', className: 'text-sm font-semibold underline' },
                                        { id: 'h6', label: 'Heading 6', className: 'text-xs font-semibold italic' },
                                        { id: 'pre', label: 'Preformatted', className: 'text-xs font-mono bg-slate-100 dark:bg-slate-800 p-1' }
                                      ].map(item => (
                                        <button 
                                          key={item.id}
                                          onClick={() => {
                                            if (item.id === 'p') insertFormat('header', false);
                                            else if (item.id === 'pre') insertFormat('code-block');
                                            else insertFormat('header', parseInt(item.id.replace('h', '')));
                                          }}
                                          className={`w-full text-left px-4 py-2.5 rounded-xl transition-all ${isDarkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'}`}
                                        >
                                          <div className={item.className}>{item.label}</div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />
                                
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => insertFormat('bold')} title="Bold" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Bold className="w-4 h-4" /></button>
                                  <button onClick={() => insertFormat('italic')} title="Italic" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Italic className="w-4 h-4" /></button>
                                </div>
                                
                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />
                                
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => insertFormat('align', '')} title="Align Left" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><AlignLeft className="w-4 h-4" /></button>
                                  <button onClick={() => insertFormat('align', 'center')} title="Align Center" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><AlignCenter className="w-4 h-4" /></button>
                                  <button onClick={() => insertFormat('align', 'right')} title="Align Right" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><AlignRight className="w-4 h-4" /></button>
                                  <button onClick={() => insertFormat('align', 'justify')} title="Justify" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><AlignJustify className="w-4 h-4" /></button>
                                </div>

                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />

                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => insertFormat('indent', '-1')} title="Decrease Indent" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Outdent className="w-4 h-4" /></button>
                                  <button onClick={() => insertFormat('indent', '+1')} title="Increase Indent" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Indent className="w-4 h-4" /></button>
                                </div>

                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />

                                <div className="flex items-center gap-0.5">
                                  <div className="relative group">
                                    <button className={`p-2 rounded-lg hover:bg-blue-500/10 flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                      <ListIcon className="w-4 h-4" /><ChevronDown className="w-2.5 h-2.5" />
                                    </button>
                                    <div className={`absolute top-full left-0 pt-2 hidden group-hover:block z-[40]`}>
                                      <div className={`p-2 rounded-2xl shadow-2xl border min-w-[180px] ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                                        <div className="flex gap-1 justify-center flex-wrap">
                                          {[
                                            { id: 'bullet', type: 'disc', name: 'Dot' },
                                            { id: 'circle', type: 'circle', name: 'Circle' },
                                            { id: 'square', type: 'square', name: 'Square' }
                                          ].map(item => (
                                            <button 
                                              key={item.id} 
                                              onClick={() => insertFormat('list', item.id)} 
                                              className="p-3 hover:bg-blue-500/10 rounded-xl flex flex-col items-center gap-3 transition-all min-w-[70px]"
                                            >
                                              <div className="space-y-1.5 w-full flex flex-col items-center">
                                                {[1, 2, 3].map(i => (
                                                  <div key={i} className="flex items-center gap-2 w-full justify-center">
                                                    <div className={`w-1.5 h-1.5 shrink-0 ${
                                                      item.type === 'disc' ? 'bg-blue-500 rounded-full' :
                                                      item.type === 'circle' ? 'border-2 border-blue-500 rounded-full' :
                                                      'bg-blue-500'
                                                    }`} />
                                                    <div className="w-8 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                                                  </div>
                                                ))}
                                              </div>
                                              <span className="text-[10px] font-bold opacity-60 uppercase">{item.name}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="relative group">
                                    <button className={`p-2 rounded-lg hover:bg-blue-500/10 flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                      <ListOrdered className="w-4 h-4" /><ChevronDown className="w-2.5 h-2.5" />
                                    </button>
                                    <div className={`absolute top-full left-0 pt-2 hidden group-hover:block z-[40]`}>
                                      <div className={`p-3 rounded-2xl shadow-2xl border min-w-[200px] ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'}`}>
                                        <div className="grid grid-cols-2 gap-2">
                                          {[
                                            { id: 'ordered', label: '1.', sub: 'Number' },
                                            { id: 'lower-alpha', label: 'a.', sub: 'alpha' },
                                            { id: 'upper-alpha', label: 'A.', sub: 'ALPHA' },
                                            { id: 'lower-roman', label: 'i.', sub: 'roman' },
                                            { id: 'upper-roman', label: 'I.', sub: 'ROMAN' }
                                          ].map(item => (
                                            <button 
                                              key={item.id} 
                                              onClick={() => insertFormat('list', item.id)} 
                                              className={`p-2 hover:bg-blue-500/10 rounded-xl flex flex-col items-center gap-2 transition-all border ${isDarkMode ? 'border-slate-800' : 'border-gray-50'}`}
                                            >
                                              <div className="flex flex-col items-center gap-1 w-full">
                                                {[1, 2].map(i => (
                                                  <div key={i} className="flex items-center gap-1.5 w-full justify-center">
                                                    <span className={`text-[8px] font-black w-3 text-right tabular-nums ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                                                      {i === 1 ? item.label : (item.label.replace('1', '2').replace('a', 'b').replace('i', 'ii').replace('A', 'B').replace('I', 'II'))}
                                                    </span>
                                                    <div className="w-6 h-0.5 bg-slate-200 dark:bg-slate-800 rounded-full shrink-0" />
                                                  </div>
                                                ))}
                                              </div>
                                              <span className="text-[9px] font-bold opacity-50 tracking-tighter truncate w-full text-center">{item.sub}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="w-px h-5 bg-gray-200 dark:bg-slate-800 mx-1" />

                                <div className="flex items-center gap-1">
                                  <button onClick={() => setShowLinkDialog(true)} title="Link" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Link className="w-4 h-4" /></button>
                                  <button onClick={() => setShowEmojiDialog(true)} title="Emoji" className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}><Smile className="w-4 h-4" /></button>
                                  <button 
                                    onClick={() => {
                                      const quill = quillRef.current?.getEditor();
                                      if (quill) {
                                        const range = quill.getSelection();
                                        if (range) {
                                          quill.removeFormat(range.index, range.length);
                                          quill.format('list', false);
                                          quill.format('header', false);
                                          quill.format('code-block', false);
                                          quill.format('align', false);
                                        }
                                      }
                                    }} 
                                    title="Clear Styles" 
                                    className={`p-2 rounded-lg hover:bg-blue-500/10 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}
                                  >
                                    <div className="relative">
                                      <Baseline className="w-4 h-4" />
                                      <Eraser className={`w-2.5 h-2.5 absolute -bottom-1 -right-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                                    </div>
                                  </button>
                                </div>
                              </div>
                              
                              <div className="relative text2pdf-editor-container">
                                <ReactQuill 
                                  ref={quillRef}
                                  theme="snow"
                                  value={text2pdfInput}
                                  onChange={setText2pdfInput}
                                  placeholder="Start typing your content here..."
                                  modules={{
                                    toolbar: false,
                                    history: { delay: 1000, maxStack: 50, userOnly: true }
                                  }}
                                  className={`w-full quill-custom-editor ${isDarkMode ? 'dark-mode-quill' : ''}`}
                                />
                              </div>

                              {/* Footer Counter and Clear Field */}
                              <div className={`flex items-center justify-between p-4 border-t text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'border-slate-800 bg-slate-900/50 text-slate-500' : 'border-gray-100 bg-gray-50/50 text-gray-400'}`}>
                                <div className="flex gap-4">
                                  <span>{wordCount} Words</span>
                                  <span className="w-px h-3 bg-gray-300 dark:bg-slate-700 self-center" />
                                  <span>{charCount} Characters</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="file" 
                                    accept=".txt" 
                                    ref={textFileInputRef} 
                                    onChange={handleFileUpload} 
                                    className="hidden" 
                                  />
                                  <button
                                    onClick={() => textFileInputRef.current?.click()}
                                    title="Upload TXT"
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border ${
                                      isDarkMode 
                                        ? 'border-slate-800 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400' 
                                        : 'border-gray-200 hover:bg-blue-50 text-gray-500 hover:text-blue-600'
                                    }`}
                                  >
                                    <FileUp className="w-3.5 h-3.5" />
                                    <span>Upload TXT</span>
                                  </button>
                                  
                                  <button
                                    onClick={handlePaste}
                                    title="Paste from Clipboard"
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border ${
                                      isDarkMode 
                                        ? 'border-slate-800 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400' 
                                        : 'border-gray-200 hover:bg-blue-50 text-gray-500 hover:text-blue-600'
                                    }`}
                                  >
                                    <ClipboardPaste className="w-3.5 h-3.5" />
                                    <span>Paste</span>
                                  </button>

                                  <div className="w-px h-4 bg-gray-200 dark:bg-slate-800 mx-1" />

                                  <button
                                    onClick={() => setText2pdfInput('')}
                                    title="Clear Field"
                                    className={`p-2 rounded-lg transition-all ${isDarkMode ? 'hover:bg-red-500/10 text-slate-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <style>{`
                              .quill-custom-editor .ql-container {
                                border: none !important;
                                font-family: inherit;
                                font-size: 16px;
                                height: 450px;
                              }
                              .quill-custom-editor .ql-editor {
                                padding: 32px;
                                height: 450px;
                                overflow-y: auto;
                                color: ${isDarkMode ? '#f1f5f9' : '#111827'};
                                line-height: 1.6;
                              }
                              /* Custom Scrollbar for Editor */
                              .quill-custom-editor .ql-editor::-webkit-scrollbar {
                                width: 6px;
                              }
                              .quill-custom-editor .ql-editor::-webkit-scrollbar-track {
                                background: transparent;
                              }
                              .quill-custom-editor .ql-editor::-webkit-scrollbar-thumb {
                                background-color: ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(156, 163, 175, 0.3)'};
                                border-radius: 20px;
                              }
                              .quill-custom-editor .ql-editor::-webkit-scrollbar-thumb:hover {
                                background-color: ${isDarkMode ? 'rgba(75, 85, 99, 0.6)' : 'rgba(156, 163, 175, 0.5)'};
                              }
                              .quill-custom-editor .ql-editor.ql-blank::before {
                                color: ${isDarkMode ? '#475569' : '#9ca3af'};
                                font-style: normal;
                                left: 32px;
                              }
                              .dark-mode-quill .ql-editor h1, .dark-mode-quill .ql-editor h2, .dark-mode-quill .ql-editor h3, .dark-mode-quill .ql-editor h4, .dark-mode-quill .ql-editor h5, .dark-mode-quill .ql-editor h6 { color: white; }
                              .ql-editor h1 { font-size: 2em; font-weight: 900; margin-bottom: 0.5em; }
                              .ql-editor h2 { font-size: 1.5em; font-weight: 800; margin-bottom: 0.4em; }
                              .ql-editor h3 { font-size: 1.25em; font-weight: 700; margin-bottom: 0.3em; }
                              .ql-editor h4 { font-size: 1.1em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${isDarkMode ? '#94a3b8' : '#64748b'}; }
                              .ql-editor h5 { font-size: 1em; font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
                              .ql-editor h6 { font-size: 0.9em; font-weight: 600; font-style: italic; opacity: 0.8; }
                              .ql-editor pre { background: ${isDarkMode ? '#0f172a' : '#f8fafc'}; padding: 16px; border-radius: 12px; font-family: monospace; border: 1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}; margin: 1em 0; }
                              
                              .dark-mode-quill .ql-editor a { color: #60a5fa; }
                              .dark-mode-quill .ql-editor code { background: #1e293b; color: #e2e8f0; padding: 2px 4px; border-radius: 4px; }
                              
                              /* Robust Lists Styling for Editor Visibility */
                              .quill-custom-editor .ql-editor ul, 
                              .quill-custom-editor .ql-editor ol { 
                                padding-left: 2.5em !important; 
                                margin-left: 0 !important;
                                list-style: none !important;
                                list-style-type: none !important;
                                counter-reset: custom-list-counter 0 !important;
                                overflow: visible !important;
                              }
                              .quill-custom-editor .ql-editor li { 
                                position: relative !important; 
                                padding-left: 0.5em !important; 
                                margin-bottom: 0.3em; 
                                counter-increment: custom-list-counter 1 !important; 
                                list-style: none !important;
                                list-style-type: none !important;
                                overflow: visible !important;
                              }
                              
                              /* Aggressively hide any default marker or Quill's default before */
                              .quill-custom-editor .ql-editor li::marker,
                              .quill-custom-editor .ql-ui {
                                content: none !important;
                                display: none !important;
                              }
                              
                              /* Base marker styling - High specificity and !important to override Quill defaults */
                              .quill-custom-editor .ql-editor li::before {
                                position: absolute !important;
                                left: -2.3em !important;
                                width: 2.1em !important;
                                text-align: right !important;
                                padding-right: 0.5em !important;
                                font-weight: 700 !important;
                                color: ${isDarkMode ? '#f1f5f9' : '#0f172a'} !important;
                                display: inline-block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                content: none !important; /* Default to none, enabled by specific rules */
                              }
 
                              /* Specific Bullet styles */
                              .quill-custom-editor .ql-editor ul[data-list="bullet"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="bullet"]::before { content: "•" !important; }
                              
                              .quill-custom-editor .ql-editor ul[data-list="circle"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="circle"]::before { content: "○" !important; }
                              
                              .quill-custom-editor .ql-editor ul[data-list="square"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="square"]::before { content: "■" !important; }
                              
                              /* Specific Ordered styles */
                              .quill-custom-editor .ql-editor ol[data-list="ordered"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="ordered"]::before { content: counter(custom-list-counter, decimal) "." !important; }
                              
                              .quill-custom-editor .ql-editor ol[data-list="lower-alpha"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="lower-alpha"]::before { content: counter(custom-list-counter, lower-alpha) "." !important; }
                              
                              .quill-custom-editor .ql-editor ol[data-list="upper-alpha"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="upper-alpha"]::before { content: counter(custom-list-counter, upper-alpha) "." !important; }
                              
                              .quill-custom-editor .ql-editor ol[data-list="lower-roman"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="lower-roman"]::before { content: counter(custom-list-counter, lower-roman) "." !important; }
                              
                              .quill-custom-editor .ql-editor ol[data-list="upper-roman"] li::before,
                              .quill-custom-editor .ql-editor li[data-list="upper-roman"]::before { content: counter(custom-list-counter, upper-roman) "." !important; }

                              .ql-editor li.ql-indent-1 { margin-left: 2em !important; }
                              .ql-editor li.ql-indent-2 { margin-left: 4em !important; }
                              .ql-editor li.ql-indent-3 { margin-left: 6em !important; }
                              .ql-editor li.ql-indent-4 { margin-left: 8em !important; }
                              .ql-editor li.ql-indent-5 { margin-left: 10em !important; }
                            `}</style>
                            
                            <div className="flex gap-4">
                              <button 
                                onClick={processPdf}
                                disabled={!text2pdfInput}
                                title="Convert to PDF"
                                className={`w-full py-4 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all ${text2pdfInput ? 'bg-blue-600 text-white shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                              >
                                Convert to PDF
                              </button>
                            </div>
                          </div>
                        ) : ( 
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
                                  const newPDFFiles = droppedFiles.map(f => ({ id: Math.random().toString(36).substring(2, 9), file: f }));
                                  setFiles(prev => (activeTool === 'merge' || activeTool === 'img2pdf') ? [...prev, ...newPDFFiles] : [newPDFFiles[0]]);
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
                        )
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
                                      <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${activeTool === 'img2pdf' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                          {activeTool === 'img2pdf' ? <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-white" /> : <FileUp className="w-5 h-5 md:w-6 md:h-6 text-white" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <h3 className={`font-bold text-sm md:text-base truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{f.file.name}</h3>
                                          <div className="flex items-center gap-2">
                                            <p className="text-[10px] md:text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                            {filePageCounts[f.id] && (
                                              <>
                                                <span className="text-[10px] md:text-xs text-slate-400">•</span>
                                                <p className="text-[10px] md:text-xs text-slate-500 font-medium">{filePageCounts[f.id]} {filePageCounts[f.id] === 1 ? 'Page' : 'Pages'}</p>
                                              </>
                                            )}
                                          </div>
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
                                  <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                      <FileUp className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h3 className={`font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{f.file.name}</h3>
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        {filePageCounts[f.id] && (
                                          <>
                                            <span className="text-xs text-slate-400">•</span>
                                            <p className="text-xs text-slate-500 font-medium">{filePageCounts[f.id]} {filePageCounts[f.id] === 1 ? 'Page' : 'Pages'}</p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-slate-500 hover:text-red-500 transition-colors shrink-0">
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
                            <SlickNumberInput value={pagesPerSplit} onChange={setPagesPerSplit} isDarkMode={isDarkMode} min={1} />
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
                              <SlickNumberInput value={duplicatePageNum} onChange={setDuplicatePageNum} isDarkMode={isDarkMode} min={1} />
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Number of Copies</label>
                              <SlickNumberInput value={duplicateCount} onChange={setDuplicateCount} isDarkMode={isDarkMode} min={1} max={100} />
                            </div>
                          </div>
                        )}
                        {activeTool === 'blank' && (
                          <div className="space-y-4">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Insert Position (After Page #)</label>
                            <SlickNumberInput value={blankPagePos} onChange={setBlankPagePos} isDarkMode={isDarkMode} min={0} />
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
                        {activeTool === 'copyPages' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Target PDF File</label>
                              <FileSelector 
                                accept=".pdf"
                                isDarkMode={isDarkMode}
                                selectedFileName={copyPagesTargetFile?.file.name}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setCopyPagesTargetFile({ id: Math.random().toString(36), file });
                                }}
                              />
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Page Range from Source (e.g. 1,3,5-8)</label>
                              <input type="text" value={copyPagesRange} onChange={(e) => setCopyPagesRange(e.target.value)} placeholder="1, 3-5, 10" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                            </div>
                          </div>
                        )}
                        {activeTool === 'viewerPreferences' && (
                          <div className="space-y-8">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Window and Menu Layout</label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefHideToolbar ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefHideToolbar 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefHideToolbar && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefHideToolbar} onChange={(e) => setPrefHideToolbar(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Hide Toolbar</span>
                                </label>
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefHideMenubar ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefHideMenubar 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefHideMenubar && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefHideMenubar} onChange={(e) => setPrefHideMenubar(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Hide Menubar</span>
                                </label>
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefHideWindowUI ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefHideWindowUI 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefHideWindowUI && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefHideWindowUI} onChange={(e) => setPrefHideWindowUI(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Hide Window UI</span>
                                </label>
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefDisplayDocTitle ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefDisplayDocTitle 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefDisplayDocTitle && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefDisplayDocTitle} onChange={(e) => setPrefDisplayDocTitle(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Display Doc Title</span>
                                </label>
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefFitWindow ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefFitWindow 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefFitWindow && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefFitWindow} onChange={(e) => setPrefFitWindow(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Fit Window</span>
                                </label>
                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefCenterWindow ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                  <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                    prefCenterWindow 
                                      ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                      : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                  }`}>
                                    {prefCenterWindow && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                  </div>
                                  <input type="checkbox" checked={prefCenterWindow} onChange={(e) => setPrefCenterWindow(e.target.checked)} className="sr-only" />
                                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Center Window</span>
                                </label>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Initial Page Layout</label>
                                <select 
                                  value={prefPageLayout} 
                                  onChange={(e) => setPrefPageLayout(e.target.value as any)}
                                  className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                                >
                                  <option value="SinglePage">Single Page</option>
                                  <option value="OneColumn">One Column</option>
                                  <option value="TwoColumnLeft">Two Column Left</option>
                                  <option value="TwoColumnRight">Two Column Right</option>
                                  <option value="TwoPageLeft">Two Page Left</option>
                                  <option value="TwoPageRight">Two Page Right</option>
                                </select>
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Initial Page Mode</label>
                                <select 
                                  value={prefPageMode} 
                                  onChange={(e) => setPrefPageMode(e.target.value as any)}
                                  className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                                >
                                  <option value="UseNone">Default (Use None)</option>
                                  <option value="UseOutlines">Show Outlines (Bookmarks)</option>
                                  <option value="UseThumbs">Show Thumbnails</option>
                                  <option value="FullScreen">Full Screen</option>
                                  <option value="UseOC">Show Layers</option>
                                  <option value="UseAttachments">Show Attachments</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <button 
                                onClick={() => setShowAdvancedPos(!showAdvancedPos)}
                                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvancedPos ? 'rotate-90' : ''}`} />
                                Printing & Additional Controls
                              </button>
                              
                              {showAdvancedPos && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="space-y-6 pt-2 overflow-hidden"
                                >
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Print Scaling</label>
                                      <select 
                                        value={prefPrintScaling} 
                                        onChange={(e) => setPrefPrintScaling(e.target.value as any)}
                                        className={`w-full p-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                                      >
                                        <option value="AppDefault">App Default</option>
                                        <option value="None">None</option>
                                      </select>
                                    </div>
                                    <div className="space-y-3">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duplex Printing</label>
                                      <select 
                                        value={prefDuplex} 
                                        onChange={(e) => setPrefDuplex(e.target.value as any)}
                                        className={`w-full p-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                                      >
                                        <option value="None">Default</option>
                                        <option value="Simplex">Simplex (One side)</option>
                                        <option value="DuplexFlipShortEdge">Duplex (Short Edge)</option>
                                        <option value="DuplexFlipLongEdge">Duplex (Long Edge)</option>
                                      </select>
                                    </div>
                                    <div className="space-y-3">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Non-FullScreen Page Mode</label>
                                      <select 
                                        value={prefNonFullScreenPageMode} 
                                        onChange={(e) => setPrefNonFullScreenPageMode(e.target.value as any)}
                                        className={`w-full p-3 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                                      >
                                        <option value="UseNone">Use None</option>
                                        <option value="UseOutlines">Use Outlines</option>
                                        <option value="UseThumbs">Use Thumbs</option>
                                        <option value="UseOC">Use OC</option>
                                      </select>
                                    </div>
                                    <div className="space-y-3">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Number of Copies</label>
                                      <SlickNumberInput 
                                        value={prefNumCopies} 
                                        onChange={setPrefNumCopies} 
                                        isDarkMode={isDarkMode} 
                                        min={1} 
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-4 pt-2">
                                    <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${prefPickTrayByPDFSize ? 'bg-blue-600/10 border-blue-600' : isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                      <div className={`w-5 h-5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                                       prefPickTrayByPDFSize 
                                         ? 'bg-blue-600 border-blue-600 shadow-sm' 
                                         : isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
                                     }`}>
                                       {prefPickTrayByPDFSize && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
                                     </div>
                                     <input type="checkbox" checked={prefPickTrayByPDFSize} onChange={(e) => setPrefPickTrayByPDFSize(e.target.checked)} className="sr-only" />
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-gray-600'}`}>Pick Tray by PDF Size</span>
                                    </label>
                                    <div className="flex items-center gap-4 p-4 rounded-xl border bg-transparent border-transparent">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Reading Direction:</span>
                                      <div className="flex gap-2">
                                        {(['L2R', 'R2L'] as const).map(dir => (
                                          <button
                                            key={dir}
                                            onClick={() => setPrefReadingDirection(dir)}
                                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${prefReadingDirection === dir ? 'bg-blue-600 text-white border-blue-600' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-gray-200 text-gray-400'}`}
                                          >
                                            {dir}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>
                        )}
                        {activeTool === 'addAttachments' && (
                          <div className="space-y-6">
                            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Attachments</label>
                            <FileSelector 
                              multiple 
                              isDarkMode={isDarkMode}
                              label="Choose Attachments"
                              selectedFileName={pdfAttachments.length > 0 ? `${pdfAttachments.length} files selected` : null}
                              onChange={(e) => {
                                if (e.target.files) setPdfAttachments(prev => [...prev, ...Array.from(e.target.files as FileList)]);
                              }}
                            />
                            <div className="space-y-2">
                              {pdfAttachments.map((f, i) => (
                                <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                  <span className={`text-xs font-medium truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{f.name}</span>
                                  <button onClick={() => setPdfAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeTool === 'drawImages' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Select Image</label>
                              <FileSelector 
                                accept="image/*"
                                isDarkMode={isDarkMode}
                                selectedFileName={drawImgFile?.name}
                                onChange={(e) => setDrawImgFile(e.target.files?.[0] || null)}
                              />
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Page Number</label>
                              <SlickNumberInput 
                                value={signPageNum} 
                                onChange={setSignPageNum} 
                                isDarkMode={isDarkMode} 
                                min={1} 
                              />
                            </div>

                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Quick Position</label>
                              <div className={`p-4 rounded-2xl border flex justify-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                <div className={`grid grid-cols-3 gap-3 p-3 rounded-lg border-2 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} aspect-[595/842] w-32`}>
                                  {[700, 500, 300, 100].map(y => (
                                    [50, 247, 445].map(x => (
                                      <button
                                        key={`${x}-${y}`}
                                        onClick={() => { setDrawX(x); setDrawY(y); }}
                                        className={`w-4 h-4 rounded-full border-2 transition-all ${drawX === x && drawY === y ? 'bg-blue-600 border-white scale-125' : 'bg-slate-700 hover:bg-slate-600 border-transparent opacity-30 hover:opacity-100'}`}
                                      />
                                    ))
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <button 
                                onClick={() => setShowAdvancedPos(!showAdvancedPos)}
                                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvancedPos ? 'rotate-90' : ''}`} />
                                Advanced Options
                              </button>
                              
                              {showAdvancedPos && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="grid grid-cols-2 gap-4 pb-2"
                                >
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pos X</label>
                                    <SlickNumberInput value={drawX} onChange={setDrawX} isDarkMode={isDarkMode} min={0} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pos Y</label>
                                    <SlickNumberInput value={drawY} onChange={setDrawY} isDarkMode={isDarkMode} min={0} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Width</label>
                                    <SlickNumberInput value={drawWidth} onChange={setDrawWidth} isDarkMode={isDarkMode} min={10} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Height</label>
                                    <SlickNumberInput value={drawHeight} onChange={setDrawHeight} isDarkMode={isDarkMode} min={10} />
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>
                        )}
                        {activeTool === 'drawVectors' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Shape Type</label>
                              <div className="flex gap-2">
                                {(['rect', 'circle', 'line'] as const).map(shape => (
                                  <button
                                    key={shape}
                                    onClick={() => setDrawShape(shape)}
                                    className={`flex-1 py-3 rounded-xl border font-bold capitalize transition-all ${drawShape === shape ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {shape}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest text-[10px]">Color</label>
                              <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="flex flex-wrap gap-1.5 flex-1">
                                  {['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].map(color => (
                                    <button 
                                      key={color}
                                      onClick={() => setDrawShapeColor(color)}
                                      className={`w-7 h-7 rounded-xl transition-all flex items-center justify-center relative overflow-hidden group shadow-sm`}
                                      style={{ backgroundColor: color }}
                                      title={color}
                                    >
                                      {drawShapeColor === color && (
                                        <div className={`w-2 h-2 rounded-full ${['#000000', '#64748b', '#ef4444', '#8b5cf6'].includes(color) ? 'bg-white' : 'bg-black/30'}`} />
                                      )}
                                      <div className={`absolute inset-0 ring-1 ring-inset ${color === '#ffffff' ? 'ring-gray-200' : 'ring-black/5'} rounded-xl`} />
                                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                  ))}
                                </div>
                                <div className={`w-px h-8 mx-1 ${isDarkMode ? 'bg-slate-800' : 'bg-gray-200'}`} />
                                <div className="relative group p-0.5">
                                  <input 
                                    type="color" 
                                    value={drawShapeColor} 
                                    onChange={(e) => setDrawShapeColor(e.target.value)}
                                    className="w-8 h-8 rounded-xl overflow-hidden border-none p-0 cursor-pointer opacity-0 absolute inset-0 z-10"
                                    title="Custom Color"
                                  />
                                  <div 
                                    className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                                      !['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].includes(drawShapeColor) 
                                        ? 'ring-2 ring-blue-500 shadow-md scale-105' 
                                        : 'border-dashed border-gray-300 dark:border-slate-700'
                                    }`}
                                    style={{ backgroundColor: !['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].includes(drawShapeColor) ? drawShapeColor : 'transparent' }}
                                  >
                                    {['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].includes(drawShapeColor) && (
                                      <div className={`text-xs font-bold ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>+</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Quick Position</label>
                              <div className={`p-4 rounded-2xl border flex justify-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                                <div className={`grid grid-cols-3 gap-3 p-3 rounded-lg border-2 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} aspect-[595/842] w-32`}>
                                  {[700, 500, 300, 100].map(y => (
                                    [50, 247, 445].map(x => (
                                      <button
                                        key={`${x}-${y}`}
                                        onClick={() => { setDrawX(x); setDrawY(y); }}
                                        className={`w-4 h-4 rounded-full border-2 transition-all ${drawX === x && drawY === y ? 'bg-blue-600 border-white scale-125' : 'bg-slate-700 hover:bg-slate-600 border-transparent opacity-30 hover:opacity-100'}`}
                                      />
                                    ))
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <button 
                                onClick={() => setShowAdvancedPos(!showAdvancedPos)}
                                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvancedPos ? 'rotate-90' : ''}`} />
                                Advanced Options
                              </button>
                              
                              {showAdvancedPos && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="grid grid-cols-2 gap-4 pb-2"
                                >
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pos X</label>
                                    <SlickNumberInput value={drawX} onChange={setDrawX} isDarkMode={isDarkMode} min={0} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pos Y</label>
                                    <SlickNumberInput value={drawY} onChange={setDrawY} isDarkMode={isDarkMode} min={0} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Width / Size</label>
                                    <SlickNumberInput value={drawWidth} onChange={setDrawWidth} isDarkMode={isDarkMode} min={1} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Height</label>
                                    <SlickNumberInput value={drawHeight} onChange={setDrawHeight} isDarkMode={isDarkMode} min={1} />
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>
                        )}
                        {activeTool === 'number' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Vertical Position</label>
                              <div className="flex gap-2">
                                {(['top', 'bottom'] as const).map(pos => (
                                  <button
                                    key={pos}
                                    onClick={() => setNumberVPosition(pos)}
                                    className={`flex-1 py-3 rounded-xl border font-bold capitalize transition-all ${numberVPosition === pos ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {pos}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Horizontal Position</label>
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
                                  { id: 'full', label: 'Page 1 of 5 (Full text)' },
                                  { id: 'roman-upper', label: 'I, II, III (Roman Uppercase)' },
                                  { id: 'roman-lower', label: 'i, ii, iii (Roman Lowercase)' },
                                  { id: 'alpha-upper', label: 'A, B, C (Alphabet Uppercase)' },
                                  { id: 'alpha-lower', label: 'a, b, c (Alphabet Lowercase)' }
                                ].map(fmt => (
                                  <button
                                    key={fmt.id}
                                    onClick={() => setNumberFormat(fmt.id)}
                                    className={`w-full py-3 px-4 rounded-xl border font-bold text-left transition-all ${numberFormat === fmt.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {fmt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Start from Document Page</label>
                                <SlickNumberInput 
                                  value={numberStartPageIndex}
                                  onChange={setNumberStartPageIndex}
                                  isDarkMode={isDarkMode}
                                  min={1}
                                />
                                <p className={`text-[10px] font-medium italic ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Begin numbering from this physical page of your PDF.</p>
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Starting Page Number</label>
                                <SlickNumberInput 
                                  value={numberStartValue}
                                  onChange={setNumberStartValue}
                                  isDarkMode={isDarkMode}
                                  min={1}
                                  formatType={numberFormat}
                                  formattedValue={
                                    numberFormat.startsWith('roman-upper') ? toRoman(numberStartValue) :
                                    numberFormat.startsWith('roman-lower') ? toRoman(numberStartValue).toLowerCase() :
                                    numberFormat.startsWith('alpha-upper') ? toAlpha(numberStartValue) :
                                    numberFormat.startsWith('alpha-lower') ? toAlpha(numberStartValue).toLowerCase() :
                                    undefined
                                  }
                                />
                                <p className={`text-[10px] font-medium italic ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>The actual number displayed on the first numbered page.</p>
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
                        {activeTool === 'pdf2img' && (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Image Resolution</label>
                              <div className="flex gap-2">
                                {( [ { label: 'Normal (150 DPI)', value: 150 }, { label: 'High (300 DPI)', value: 300 } ] as const).map(res => (
                                  <button
                                    key={res.value}
                                    onClick={() => setImgResolution(res.value as 150 | 300)}
                                    className={`flex-1 py-3 rounded-xl border font-bold transition-all text-xs md:text-sm ${imgResolution === res.value ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {res.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Output Format</label>
                              <div className="flex gap-2">
                                {( [ { label: 'PNG', value: 'image/png' }, { label: 'JPG', value: 'image/jpeg' }, { label: 'WebP', value: 'image/webp' } ] as const).map(fmt => (
                                  <button
                                    key={fmt.value}
                                    onClick={() => setImgFormat(fmt.value as any)}
                                    className={`flex-1 py-3 rounded-xl border font-bold transition-all text-xs md:text-sm ${imgFormat === fmt.value ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}
                                  >
                                    {fmt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {activeTool === 'extractText' && (
                          <p className="text-sm font-bold text-slate-500">Extract all text content from the PDF for viewing and downloading.</p>
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
                                <div className="flex items-center gap-3">
                                  <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
                                    {['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map(color => (
                                      <button 
                                        key={color}
                                        onClick={() => setDrawColor(color)}
                                        className={`w-5 h-5 rounded-lg transition-all flex items-center justify-center relative overflow-hidden group`}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                      >
                                        {drawColor === color && (
                                          <div className={`w-1.5 h-1.5 rounded-full ${['#000000', '#64748b', '#ef4444', '#8b5cf6'].includes(color) ? 'bg-white' : 'bg-black/40'}`} />
                                        )}
                                        <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-lg" />
                                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </button>
                                    ))}
                                    <div className={`w-px h-4 mx-1 ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
                                    <div className="relative group">
                                      <input 
                                        type="color" 
                                        value={drawColor} 
                                        onChange={(e) => setDrawColor(e.target.value)}
                                        className="w-5 h-5 rounded-lg overflow-hidden border-none p-0 cursor-pointer opacity-0 absolute inset-0 z-10"
                                        title="Pick Custom Color"
                                      />
                                      <div 
                                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                          !['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].includes(drawColor) 
                                            ? 'ring-2 ring-blue-500 scale-110' 
                                            : 'border-dashed border-gray-300 dark:border-slate-600'
                                        }`}
                                        style={{ backgroundColor: !['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].includes(drawColor) ? drawColor : 'transparent' }}
                                      >
                                        {['#000000', '#64748b', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].includes(drawColor) && (
                                          <div className={`text-[8px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>+</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={clearCanvas}
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg transition-all ${isDarkMode ? 'text-red-400 hover:bg-red-400/10' : 'text-red-500 hover:bg-red-50'}`}
                                  >
                                    Clear
                                  </button>
                                </div>
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
                                <SlickNumberInput 
                                  value={signPageNum} 
                                  onChange={setSignPageNum} 
                                  isDarkMode={isDarkMode} 
                                  min={1} 
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
                        {activeTool === 'metadata' && (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Title</label>
                                <input type="text" value={metadataTitle} onChange={(e) => setMetadataTitle(e.target.value)} placeholder="Document Title" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Author</label>
                                <input type="text" value={metadataAuthor} onChange={(e) => setMetadataAuthor(e.target.value)} placeholder="Author Name" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Subject</label>
                                <input type="text" value={metadataSubject} onChange={(e) => setMetadataSubject(e.target.value)} placeholder="Document Subject" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </div>
                              <div className="space-y-4">
                                <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest">Creator</label>
                                <input type="text" value={metadataCreator} onChange={(e) => setMetadataCreator(e.target.value)} placeholder="Application Creator" className={`w-full p-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 italic">These properties will be embedded into the PDF file's metadata.</p>
                          </div>
                        )}
                        {activeTool === 'grayscale' && (
                          <div className="space-y-4">
                            <p className="text-sm font-bold text-slate-500">This tool will convert all pages of your PDF into black and white images and re-embed them into a new PDF document.</p>
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                              <p className="text-xs text-amber-600 font-medium flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                Note: This process may increase file size as pages are converted to images.
                              </p>
                            </div>
                          </div>
                        )}
                        {activeTool === 'flatten' && (
                          <div className="space-y-4">
                            <p className="text-sm font-bold text-slate-500">Flattening will merge all interactive form fields and annotations into the page content, making them non-editable.</p>
                            <p className="text-xs text-slate-500 italic">Perfect for final versions of forms or signed documents.</p>
                          </div>
                        )}
                        {activeTool === 'sanitize' && (
                          <div className="space-y-4">
                            <p className="text-sm font-bold text-slate-500">Sanitization removes all metadata, XMP data, and resets creation/modification dates to provide a clean file for sharing.</p>
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                              <p className="text-xs text-blue-600 font-medium flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4" />
                                Your document will be stripped of all identifying hidden information.
                              </p>
                            </div>
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
                                    <motion.button 
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => {
                                        const updatedResults = [...results];
                                        updatedResults[i].name = newName.endsWith('.pdf') || newName.endsWith('.png') || newName.endsWith('.txt') ? newName : `${newName}${r.name.substring(r.name.lastIndexOf('.'))}`;
                                        setResults(updatedResults);
                                        setRenamingId(null);
                                      }}
                                      className="p-1.5 bg-green-500 text-white rounded"
                                    >
                                      <Check className="w-4 h-4" />
                                    </motion.button>
                                  </div>
                                ) : (
                                  <p className={`font-bold text-sm md:text-base truncate max-w-[120px] md:max-w-[300px] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{r.name}</p>
                                )}
                                <p className="text-[10px] md:text-xs text-slate-500">
                                  {r.pageRange} • {r.pageCount} {r.pageCount === 1 ? 'page' : 'pages'} • {(r.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  setRenamingId(i);
                                  setNewName(r.name);
                                }}
                                className={`p-2 md:p-2.5 md:p-4 rounded-xl md:rounded-2xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                                title="Rename"
                              >
                                <Type className="w-4 h-4 md:w-5 md:h-5" />
                              </motion.button>
                              {r.blob.type === 'application/pdf' && (
                                <motion.button 
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => {
                                    setPreviewUrl(r.url);
                                    setPreviewName(r.name);
                                    setIsPreviewOpen(true);
                                  }}
                                  className={`p-2 md:p-2.5 md:p-4 rounded-xl md:rounded-2xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                                  title="Preview in Browser"
                                >
                                  <Eye className="w-4 h-4 md:w-5 md:h-5" />
                                </motion.button>
                              )}
                              <motion.a 
                                whileTap={{ scale: 0.9 }}
                                href={r.url} 
                                download={r.name} 
                                className="p-2 md:p-2.5 md:p-4 bg-blue-600 text-white rounded-xl md:rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                              >
                                <Download className="w-4 h-4 md:w-5 md:h-5" />
                              </motion.a>
                            </div>
                          </div>
                          
                          {activeTool === 'pdf2img' && (
                            <div className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                              <div className="flex items-center gap-2 mb-4">
                                <ImageIcon className="w-4 h-4 text-blue-500" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Image Preview</span>
                              </div>
                              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800">
                                <img src={r.url} alt={r.name} className="w-full h-full object-contain" />
                              </div>
                            </div>
                          )}
                          
                          {r.blob.type === 'application/pdf' && (
                            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border flex flex-col gap-3 md:gap-4 ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-blue-50/30 border-blue-100'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest">Next Step: Continue with another tool</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {TOOLS.filter(t => t.id !== activeTool && t.id !== 'img2pdf' && t.id !== 'text2pdf').slice(0, 8).map(tool => (
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
                                          {TOOLS.filter(t => t.id !== activeTool && t.id !== 'img2pdf' && t.id !== 'text2pdf').map(tool => (
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
                      <button 
                        onClick={() => {
                          clearFiles();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} 
                        className={`px-8 py-4 rounded-2xl border font-bold ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >
                        Start New Task
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </main>

          {/* Footer Info */}
          <footer className={`mt-8 pt-8 border-t text-center text-sm transition-colors duration-300 ${
            isDarkMode ? 'border-slate-800 text-slate-500' : 'border-gray-100 text-gray-400'
          }`}>
            <p>Your files are processed locally in your browser and are never uploaded to any server.</p>
          </footer>
        </div>
      </div>

      {/* Developer Credit Footer */}
      <motion.footer 
        whileHover="hover"
        whileTap="hover"
        className={`w-full py-6 mt-auto relative overflow-hidden transition-all duration-500 ${
          isDarkMode 
            ? 'bg-[#0c142e]/85 border-t border-blue-900/20' 
            : 'bg-blue-50/80 border-t border-blue-100/50'
        } backdrop-blur-md`}
      >
        {/* Sparkling particles on hover - Increased count and intensity */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(45)].map((_, i) => {
            const colors = isDarkMode 
              ? ['bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-yellow-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-orange-400'] 
              : ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-yellow-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-orange-500'];
            const color = colors[i % colors.length];
            const size = Math.random() * 8 + 3; // 3px to 11px (increased size)
            
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
      <InfoModal 
        isOpen={isInfoModalOpen} 
        onClose={() => setIsInfoModalOpen(false)} 
        isDarkMode={isDarkMode} 
      />
      <PdfPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewUrl(null);
        }}
        url={previewUrl}
        name={previewName}
        isDarkMode={isDarkMode}
      />

      {/* Text to PDF Link Dialog */}
      <AnimatePresence>
        {showLinkDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLinkDialog(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-md p-6 rounded-3xl border shadow-2xl ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-gray-100 text-gray-900'}`}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black">Insert Link</h3>
                <button onClick={() => setShowLinkDialog(false)} className="p-2 hover:bg-red-500/10 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400 hover:text-red-500" /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">URL (required)</label>
                  <input 
                    type="text" 
                    placeholder="https://example.com"
                    value={linkData.url}
                    onChange={(e) => setLinkData(prev => ({ ...prev, url: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Text to display</label>
                  <input 
                    type="text" 
                    placeholder="Click here"
                    value={linkData.text}
                    onChange={(e) => setLinkData(prev => ({ ...prev, text: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title (tooltip)</label>
                  <input 
                    type="text" 
                    placeholder="Example Link"
                    value={linkData.title}
                    onChange={(e) => setLinkData(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Window</label>
                  <select
                    value={linkData.target}
                    onChange={(e) => setLinkData(prev => ({ ...prev, target: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-100 text-gray-900'}`}
                  >
                    <option value="_self">Current Window</option>
                    <option value="_blank">New Window</option>
                    <option value="_parent">Parent Frame</option>
                    <option value="_top">Full Body</option>
                  </select>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowLinkDialog(false)} className={`flex-1 py-3 rounded-xl font-bold ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Cancel</button>
                  <button 
                    disabled={!linkData.url}
                    onClick={() => {
                      const quill = quillRef.current?.getEditor();
                      if (quill) {
                        const range = quill.getSelection();
                        if (range) {
                          quill.insertText(range.index, linkData.text || linkData.url, 'link', linkData.url);
                          // Quill doesn't natively support title/target in standard link format easily without custom blurs
                          // but for our purposes, standard link is enough for PDF generation.
                        }
                      }
                      setShowLinkDialog(false);
                    }}
                    className={`flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50`}
                  >
                    Insert Link
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Text to PDF Emoji Dialog */}
      <AnimatePresence>
        {showEmojiDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmojiDialog(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`relative z-10 shadow-2xl rounded-3xl overflow-hidden border ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}
            >
                            <EmojiPicker 
                theme={isDarkMode ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                lazyLoadEmojis={true}
                onEmojiClick={(emojiData: EmojiClickData) => {
                  const quill = quillRef.current?.getEditor();
                  if (quill) {
                    const range = quill.getSelection();
                    if (range) {
                      quill.insertText(range.index, emojiData.emoji);
                      quill.setSelection(range.index + emojiData.emoji.length, 0);
                    } else {
                      const length = quill.getLength();
                      quill.insertText(length, emojiData.emoji);
                      quill.setSelection(length + emojiData.emoji.length, 0);
                    }
                  }
                  setShowEmojiDialog(false);
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}
