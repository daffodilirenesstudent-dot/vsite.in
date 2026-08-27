import { redirect } from 'next/navigation';

// /manage is not a page — authenticated users land on /manage/dashboard
// via ManageLayoutClient. Unauthenticated users are sent to /login by middleware.
// This redirect is a safety net for any direct navigation to /manage.
export default function ManagePage() {
    redirect('/manage/dashboard');
}
