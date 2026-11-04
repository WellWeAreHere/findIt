import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="font-bold text-slate-900">Find<span className="text-brand-600">It</span></p>
          <p className="mt-2 text-sm text-slate-500">
            The campus lost &amp; found. Found something? Hand it to the Security Office in the
            Administrative Block and report it here.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-slate-900">Items</p>
            <Link href="/browse?type=LOST" className="text-slate-500 hover:text-slate-900">Lost items</Link>
            <Link href="/browse?type=FOUND" className="text-slate-500 hover:text-slate-900">Found items</Link>
            <Link href="/report/new" className="text-slate-500 hover:text-slate-900">Report an item</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-slate-900">Account</p>
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">Dashboard</Link>
            <Link href="/claims" className="text-slate-500 hover:text-slate-900">My claims</Link>
            <Link href="/notifications" className="text-slate-500 hover:text-slate-900">Notifications</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        FindIt · Campus Lost &amp; Found Management System · DBMS Project
      </div>
    </footer>
  );
}
