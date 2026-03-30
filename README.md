# PDFPilot ✈️

**PDFPilot** is a powerful, 100% browser-based suite of PDF tools designed for speed, simplicity, and absolute privacy. Unlike other PDF services, PDFPilot processes all your documents locally in your browser—your files never leave your computer.

![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![Vite](https://img.shields.io/badge/Vite-6-purple.svg)
![Tailwind](https://img.shields.io/badge/Tailwind-4-blue.svg)

## 🛡️ Privacy First

Privacy isn't just a feature; it's our core principle.
- **Zero Server Uploads:** All PDF manipulations happen in your browser's memory.
- **No Data Collection:** We don't track your files, your data, or your usage.
- **Offline Capable:** Once the app is loaded, you can disconnect from the internet and continue processing your PDFs.

## 🚀 Key Features

PDFPilot offers a comprehensive set of tools to handle your daily PDF tasks:

- **Images to PDF:** Convert JPG/PNG images into a single PDF.
- **PDF to Images:** Export PDF pages as high-quality PNG images.
- **Split PDF:** Break a large PDF into smaller files by page range.
- **Merge PDF:** Combine multiple PDFs into one (up to 15 files).
- **Organize PDF:** Rearrange, delete, or reorder pages with drag-and-drop.
- **Draw / Sign:** Add your signature or draw directly on any PDF page.
- **Extract Text:** Pull all selectable text from your documents.
- **Extract Pages:** Save specific pages as a new PDF.
- **Rotate Pages:** Fix orientation by rotating pages (90°, 180°, 270°).
- **Protect PDF:** Add password protection to your documents.
- **Unlock PDF:** Remove password protection from your documents.
- **Page Numbers:** Add customizable page numbers in various formats.
- **Watermark:** Add text watermarks to your documents.
- **Duplicate & Blank Pages:** Easily insert blank pages or duplicate existing ones.
- **Reverse PDF:** Instantly flip the page order of your document.

## 📱 Modern & Responsive UI

- **Mobile Optimized:** A polished experience on smartphones, tablets, and desktops.
- **Dark Mode:** Built-in dark mode support for comfortable late-night work.
- **Smooth Animations:** Powered by Framer Motion for a fluid user experience.

## 🛠️ Tech Stack

- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite 6](https://vitejs.dev/)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **PDF Engine:** [pdf-lib](https://pdf-lib.js.org/) & [pdfjs-dist](https://mozilla.github.io/pdf.js/)
- **Animations:** [motion](https://motion.dev/) (Framer Motion)
- **Icons:** [Lucide React](https://lucide.dev/)

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/SahilKhatkar11/pdfpilot.git
   cd pdfpilot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## 🌐 Deployment (GitHub Pages)

This app is optimized for static hosting. To deploy to GitHub Pages:

1. Build the project: `npm run build`
2. Deploy the contents of the `dist/` folder to your `gh-pages` branch.
3. Alternatively, use the [GitHub Pages Action for Vite](https://github.com/marketplace/actions/deploy-to-github-pages).

## 📄 License

Distributed under the Apache-2.0 License. See `LICENSE` for more information.

---
Built with ❤️ for a more private web.
