import { redirect } from 'next/navigation';

export default function Settings(): never {
    redirect('/settings/bookmarks');
}
