/**
 * The two lines of the dashboard header's account button.
 *
 * Most owners sign in by phone OTP and never type a name, so the header read
 * "User · Product Management" — a placeholder over a label that described no
 * one. With no name it says "Owner"; the second line is the store it is
 * managing, which is what the owner actually needs to see there.
 */
export function headerIdentity(input: { fullName: string | null | undefined; storeName: string | null | undefined }): {
    name: string;
    subtitle: string;
} {
    return {
        name: input.fullName?.trim() || 'Owner',
        subtitle: input.storeName?.trim() || 'Store owner',
    };
}
