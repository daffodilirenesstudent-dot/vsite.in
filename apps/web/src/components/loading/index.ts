/**
 * The loading system. Import from here, never from the files directly, so
 * there is one list of what exists and adding a fifth kind of spinner is a
 * visible decision rather than a local convenience.
 *
 * Which one:
 *   <Spinner size="sm" tone="onBrand" />   inside a button, beside its label
 *   <ProgressTrack />                      an operation long enough that a spinner reads as stuck
 *   <SectionLoader message="…" />          a panel or table body with no data yet
 *   <PageLoader message="…" />             a whole route with nothing to show
 *   <LoadingOverlay message="…" />         stale content being replaced in place
 *   <Skeleton /> / <SkeletonRows />        placeholder geometry matching the real layout
 *   <BrandLoader />                        the full-screen splash (components/BrandLoader)
 *
 * Motion lives in globals.css under "LOADING SYSTEM", defined once.
 */

export { default as Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize, SpinnerTone } from './Spinner';

export { Skeleton, SkeletonText, SkeletonRows } from './Skeleton';
export type { SkeletonProps } from './Skeleton';

export { default as ProgressTrack } from './ProgressTrack';
export type { ProgressTrackProps } from './ProgressTrack';

export { SectionLoader, PageLoader, LoadingOverlay } from './SectionLoader';
export type { SectionLoaderProps } from './SectionLoader';
