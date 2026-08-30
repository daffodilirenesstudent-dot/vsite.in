import { BILLING_CYCLE_STEPS } from '@/content/policy';

/**
 * The 30-day period, drawn.
 *
 * This is the one diagram on a legal page, and it earns the space: the single
 * question every owner has about vsite's billing is "what happens to my menu,
 * and when", and prose buries the answer in a paragraph about payment terms.
 * The steps are a genuine sequence with real dates, so ordinal markers carry
 * information here rather than decorating a list.
 *
 * The last step is the only one with a warm marker. It is the consequence
 * rather than a scheduled event, and it is the step people are surprised by.
 */
export default function BillingCycle() {
    const steps = BILLING_CYCLE_STEPS;

    return (
        <ol className="grid gap-7 md:grid-cols-4 md:gap-5">
            {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                return (
                    <li key={step.day} className="relative pl-8 md:pl-0 md:pt-9">
                        {/* Rail. Vertical between stacked steps on a phone, horizontal
                            across the strip on a wide screen. Never drawn past the
                            final step — the sequence ends there. */}
                        {!isLast && (
                            <span
                                aria-hidden
                                className="absolute -bottom-7 left-[7px] top-3 w-px bg-line md:bottom-auto md:left-4 md:right-0 md:top-[7px] md:h-px md:w-auto"
                            />
                        )}

                        <span
                            aria-hidden
                            className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 bg-paper md:top-0 ${
                                isLast ? 'border-warning' : 'border-accent-text'
                            }`}
                        />

                        <p
                            className={`text-caption font-bold uppercase tracking-[0.1em] ${
                                isLast ? 'text-warning' : 'text-accent-text'
                            }`}
                        >
                            {step.day}
                        </p>
                        <p className="mt-1.5 font-display text-[1.0625rem] font-bold leading-snug text-ink">
                            {step.title}
                        </p>
                        <p className="mt-1.5 text-caption leading-relaxed text-ink-70">{step.body}</p>
                    </li>
                );
            })}
        </ol>
    );
}
