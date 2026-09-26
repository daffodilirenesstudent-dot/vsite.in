'use client';

import React from 'react';
import { ProgressTrack, Skeleton } from '@/components/loading';
import { activeTabFor, type TabId } from '@/lib/ui/mobileNav';

/**
 * What a tapped tab shows until its page arrives (NEXT_PUBLIC_MOBILE_NAV_V2):
 * a progress track and the rough shape of THAT page — the product list for
 * Menu, the poster for QR, the store card and rows for You. One shape for
 * every tab read as a glitch rather than as loading (owner, 2026-09-25): the
 * skeleton should be the page arriving, not a different page flashing past.
 *
 * Each layout mirrors its page's phone layout block for block, so nothing
 * jumps when the real content replaces it.
 */

const NAMES: Record<TabId, string> = { home: 'Home', menu: 'Menu', qr: 'QR', you: 'You' };

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ border: '1px solid #EFEFF1', borderRadius: 16, background: '#FFFFFF', ...style }}>{children}</div>;
}

/** Title and subtitle, as every page opens. */
function Heading({ title, sub }: { title: number; sub?: number }) {
    return (
        <div>
            <Skeleton width={title} height={30} radius={8} />
            {sub ? <Skeleton width={sub} height={14} style={{ marginTop: 12 }} /> : null}
        </div>
    );
}

/** Dashboard: title + View menu, setup card, store status, Insights, stat tiles. */
function HomeShape() {
    return (
        <>
            <div className="flex items-start justify-between" style={{ gap: 12 }}>
                <Heading title={170} sub={200} />
                <Skeleton width={116} height={44} radius={12} />
            </div>
            <Skeleton height={148} radius={16} style={{ marginTop: 24 }} />
            <Card style={{ marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Skeleton circle height={36} />
                <div style={{ flex: 1 }}>
                    <Skeleton width="45%" height={14} />
                    <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
                </div>
                <Skeleton width={46} height={26} radius={13} />
            </Card>
            <Skeleton width={96} height={20} style={{ marginTop: 26 }} />
            <Skeleton height={70} radius={12} style={{ marginTop: 14 }} />
            <div className="grid grid-cols-2" style={{ gap: 12, marginTop: 12 }}>
                {[0, 1, 2, 3].map(i => (
                    <Card key={i} style={{ padding: 14 }}>
                        <Skeleton width={32} height={32} radius={10} />
                        <Skeleton width="70%" height={12} style={{ marginTop: 12 }} />
                        <Skeleton width="40%" height={22} style={{ marginTop: 8 }} />
                    </Card>
                ))}
            </div>
        </>
    );
}

/** Products: title, two full-width buttons, category chips, dish rows with photos. */
function MenuShape() {
    return (
        <>
            <Heading title={140} sub={230} />
            <Skeleton height={44} radius={12} style={{ marginTop: 18 }} />
            <Skeleton height={44} radius={12} style={{ marginTop: 8 }} />
            <div className="flex" style={{ gap: 8, marginTop: 20, overflow: 'hidden' }}>
                {[56, 104, 84, 92].map((w, i) => <Skeleton key={i} width={w} height={40} radius={999} style={{ flexShrink: 0 }} />)}
            </div>
            <Card style={{ marginTop: 18, overflow: 'hidden' }}>
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center" style={{ gap: 12, padding: 12, borderTop: i ? '1px solid #F0F0F2' : 'none' }}>
                        <Skeleton width={56} height={56} radius={10} />
                        <div style={{ flex: 1 }}>
                            <Skeleton width="62%" height={14} />
                            <Skeleton width="38%" height={12} style={{ marginTop: 8 }} />
                        </div>
                        <Skeleton width={46} height={26} radius={13} />
                    </div>
                ))}
            </Card>
        </>
    );
}

/** QR Codes: title, the poster preview card, then the design choices. */
function QrShape() {
    return (
        <>
            <Heading title={150} sub={250} />
            <Card style={{ marginTop: 22, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EFEFF1' }}>
                    <Skeleton width={130} height={15} />
                    <Skeleton width={190} height={12} style={{ marginTop: 8 }} />
                </div>
                <div style={{ padding: 16 }}>
                    <Skeleton height={280} radius={10} />
                    <Skeleton width={230} height={12} style={{ margin: '12px auto 0' }} />
                </div>
            </Card>
            <Card style={{ marginTop: 16, padding: '16px 20px' }}>
                <Skeleton width={110} height={15} />
                <div className="grid grid-cols-3" style={{ gap: 10, marginTop: 14 }}>
                    {[0, 1, 2].map(i => <Skeleton key={i} height={120} radius={12} />)}
                </div>
            </Card>
        </>
    );
}

/** You: title, the store card, then grouped rows. */
function YouShape() {
    const row = (i: number) => (
        <div key={i} className="flex items-center" style={{ gap: 14, padding: '14px 16px', borderTop: i ? '1px solid #F0F0F2' : 'none' }}>
            <Skeleton width={40} height={40} radius={12} />
            <div style={{ flex: 1 }}>
                <Skeleton width="42%" height={14} />
                <Skeleton width="64%" height={12} style={{ marginTop: 8 }} />
            </div>
        </div>
    );
    return (
        <>
            <Skeleton width={70} height={30} radius={8} />
            <Card style={{ marginTop: 16, padding: 18, borderRadius: 20 }}>
                <div className="flex items-center" style={{ gap: 14 }}>
                    <Skeleton width={56} height={56} radius={16} />
                    <div style={{ flex: 1 }}>
                        <Skeleton width="55%" height={18} />
                        <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
                    </div>
                </div>
                <Skeleton width={170} height={26} radius={999} style={{ marginTop: 16 }} />
                <Skeleton height={44} radius={12} style={{ marginTop: 14 }} />
            </Card>
            <Skeleton width={90} height={14} style={{ margin: '26px 4px 10px' }} />
            <Card style={{ overflow: 'hidden' }}>{[0, 1, 2].map(row)}</Card>
            <Skeleton width={110} height={14} style={{ margin: '26px 4px 10px' }} />
            <Card style={{ overflow: 'hidden' }}>{[0, 1].map(row)}</Card>
        </>
    );
}

/** Anything else behind the bar: a neutral page outline. */
function GenericShape() {
    return (
        <>
            <Heading title={180} sub={240} />
            <div className="grid grid-cols-2" style={{ gap: 12, marginTop: 22 }}>
                <Skeleton height={104} radius={14} />
                <Skeleton height={104} radius={14} />
            </div>
            {[0, 1, 2].map(i => <Skeleton key={i} height={64} radius={14} style={{ marginTop: 12 }} />)}
        </>
    );
}

const SHAPES: Record<TabId, () => React.JSX.Element> = { home: HomeShape, menu: MenuShape, qr: QrShape, you: YouShape };

export default function PendingPage({ href }: { href: string }) {
    const tab = activeTabFor(href);
    const label = `Opening ${tab ? NAMES[tab] : 'page'}`;
    const Shape = tab ? SHAPES[tab] : GenericShape;
    return (
        <div className="px-4 md:px-8 py-5" aria-busy="true" aria-live="polite" style={{ maxWidth: tab === 'you' ? 640 : undefined }}>
            <ProgressTrack label={label} width="100%" style={{ marginBottom: 20 }} />
            <Shape />
        </div>
    );
}
