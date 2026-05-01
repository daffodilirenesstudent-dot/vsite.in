'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

const NAV_ITEMS = [
    { href: '/features', icon: 'auto_awesome', label: 'Features' },
    { href: '/pricing',  icon: 'receipt_long',  label: 'Pricing'  },
    { href: '/demo',     icon: 'play_circle',   label: 'Demo'     },
    { href: '/support',  icon: 'headset_mic',   label: 'Support'  },
];

interface Props {
    menuOpen: boolean;
}

export default function MobileScrollNav({ menuOpen }: Props) {
    const [visible, setVisible] = useState(false);
    const lastY = useRef(0);

    useEffect(() => {
        const onScroll = () => {
            const y = window.scrollY;
            if (y > 160 && y < lastY.current - 12) {
                setVisible((v) => (v ? v : true));
            } else if (y > lastY.current + 4 || y <= 100) {
                setVisible((v) => (v ? false : v));
            }
            lastY.current = y;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const show = visible && !menuOpen;

    return (
        <div
            className="md:hidden fixed top-16 left-0 right-0 z-40 flex justify-center transition-transform duration-300 ease-in-out px-5 pt-2"
            style={{ transform: show ? 'translateY(0)' : 'translateY(-160%)' }}
            aria-hidden={!show}
        >
            <div className="w-full max-w-sm bg-white rounded-full shadow-xl border border-slate-100 flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-label={item.label}
                            className="flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                {item.icon}
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                <Link
                    href="/signup"
                    className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-dark transition-colors whitespace-nowrap"
                >
                    Get Started
                </Link>
            </div>
        </div>
    );
}
