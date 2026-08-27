'use client';

import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';

interface PosterGeneratorProps {
    siteName: string;
    siteUrl: string;
    siteType: 'Shop' | 'Menu';
}

const PosterGenerator: React.FC<PosterGeneratorProps> = ({ siteName, siteUrl, siteType }) => {
    const posterRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
        if (!posterRef.current || isDownloading) return;

        setIsDownloading(true);
        try {
            const canvas = await html2canvas(posterRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#FFC83B',
                logging: false,
                onclone: (clonedDoc) => {
                    // Remove any animations from the cloned element before capture
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach(el => {
                        (el as HTMLElement).style.animation = 'none';
                        (el as HTMLElement).style.transition = 'none';
                    });
                },
            });

            // Use JPEG instead of PNG — poster has no transparency, cuts size by ~70%
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width / 2, canvas.height / 2],
            });

            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2);

            const fileName = `${siteName.replace(/\s+/g, '_')}_Poster.pdf`;

            // Mobile download fallback: some in-app browsers (Instagram, Facebook, etc.)
            // don't support pdf.save(). We try save first, then fall back to Blob + open.
            try {
                pdf.save(fileName);
            } catch {
                // Fallback: create a Blob URL and open in new tab
                const pdfBlob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = fileName;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                // Clean up the blob URL after a delay
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
            }

            toast.success('Poster downloaded!');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Failed to generate poster. Please try again.');
        } finally {
            setIsDownloading(false);
        }
    };

    const typeLabel = siteType === 'Menu' ? 'MENU' : 'SHOP';

    return (
        <div className="flex flex-col items-center">
            {/* Poster Template */}
            <div className="relative mb-6 shadow-2xl rounded-sm overflow-hidden border-8 border-white/50">
                <div
                    ref={posterRef}
                    style={{
                        width: '350px',
                        height: '495px',
                        backgroundColor: '#FFC83B',
                        fontFamily: "'Inter', sans-serif",
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* Shop/Menu Name */}
                    <div style={{ width: '100%', textAlign: 'center', marginTop: '40px', position: 'relative', zIndex: 20 }}>
                        <h1 style={{
                            fontSize: siteName.length > 15 ? '36px' : '48px',
                            color: '#000',
                            fontWeight: 900,
                            fontFamily: "Impact, sans-serif",
                            letterSpacing: '-1px',
                            lineHeight: 1,
                            transform: 'rotate(-2deg)',
                            margin: 0,
                            padding: '0 20px',
                            wordBreak: 'break-word',
                        }}>
                            {siteName || "SHOP NAME"}
                        </h1>
                    </div>

                    {/* Type badge */}
                    <div style={{
                        position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)',
                        zIndex: 20, backgroundColor: '#000', color: '#FFC83B',
                        padding: '2px 16px', borderRadius: '20px',
                        fontSize: '10px', fontWeight: 800, letterSpacing: '3px',
                        fontFamily: "'Courier New', monospace",
                    }}>
                        {typeLabel}
                    </div>

                    {/* Scan Here + Arrow */}
                    <div style={{
                        position: 'absolute', top: '120px', left: '30px', zIndex: 20,
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        transform: 'rotate(-6deg)',
                    }}>
                        <span style={{
                            fontSize: '12px', fontWeight: 900, textTransform: 'uppercase',
                            letterSpacing: '2px', color: '#000', marginBottom: '4px',
                            fontFamily: "'Courier New', monospace",
                        }}>SCAN HERE</span>
                        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 10C15 0 40 0 50 15C55 22 55 30 50 35M50 35L40 30M50 35L55 25" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* Crown */}
                    <div style={{ position: 'absolute', top: '115px', right: '30px', zIndex: 20, transform: 'rotate(12deg)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 20h20" />
                            <path d="M5 20v-9L2 7l6-2 4 6 4-6 6 2-3 4v9" />
                        </svg>
                    </div>

                    {/* Loop/Squiggle */}
                    <div style={{ position: 'absolute', top: '210px', left: '20px', zIndex: 20, transform: 'rotate(-12deg)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2C8 2 4 6 4 10C4 18 16 16 16 10C16 6 12 6 10 9" />
                        </svg>
                    </div>

                    {/* Paper Plane */}
                    <div style={{ position: 'absolute', top: '250px', right: '20px', zIndex: 20, transform: 'rotate(-12deg)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                        </svg>
                    </div>

                    {/* Envelope */}
                    <div style={{ position: 'absolute', bottom: '60px', left: '30px', zIndex: 20, transform: 'rotate(6deg)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                    </div>

                    {/* Wavy Lines — NO animation class */}
                    <div style={{ position: 'absolute', bottom: '60px', right: '30px', zIndex: 20 }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 8l4-4 4 4" />
                            <path d="M2 12l4-4 4 4" />
                            <path d="M2 16l4-4 4 4" />
                            <path d="M14 6l4 4 4-4" />
                            <path d="M14 10l4 4 4-4" />
                        </svg>
                    </div>

                    {/* Center QR Code Area */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 10, width: '100%',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{ width: '220px', height: '2px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '9999px', marginBottom: '32px', filter: 'blur(1px)' }} />

                        <div style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transform: 'rotate(1deg)' }}>
                            {/* QRCodeCanvas is more reliable with html2canvas than QRCodeSVG */}
                            <QRCodeCanvas
                                value={siteUrl}
                                size={180}
                                level="H"
                                includeMargin={true}
                                fgColor="#000000"
                                bgColor="#FFFFFF"
                            />
                        </div>

                        <div style={{ width: '220px', height: '2px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '9999px', marginTop: '32px', filter: 'blur(1px)' }} />
                    </div>

                    {/* Footer */}
                    <div style={{
                        position: 'absolute', bottom: '20px', width: '100%', textAlign: 'center', zIndex: 20,
                    }}>
                        <p style={{
                            fontSize: '12px', fontWeight: 500, color: '#000',
                            textTransform: 'lowercase', letterSpacing: '2px',
                            fontFamily: "'Courier New', monospace", margin: 0,
                        }}>
                            created by -voicesite.in
                        </p>
                    </div>
                </div>
            </div>

            <button
                onClick={handleDownload}
                disabled={isDownloading}
                className={`px-8 py-3 bg-[#111418] hover:bg-black text-white font-bold rounded-full shadow-xl transition-all flex items-center justify-center gap-2 min-w-[220px] ${isDownloading ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
            >
                {isDownloading ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                        Generating...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined">download</span>
                        Download Poster
                    </>
                )}
            </button>
        </div>
    );
};

export default PosterGenerator;
