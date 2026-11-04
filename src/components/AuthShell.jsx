import { Logo } from './Navbar';
import Icon from './ui/Icon';

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="container-page grid min-h-[calc(100vh-4rem)] items-center gap-12 py-12 lg:grid-cols-2">
      <div className="hidden lg:block">
        <div className="max-w-md">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Every campus has a lost &amp; found.<br />Ours actually finds things.</h2>
          <ul className="mt-8 space-y-4 text-slate-600">
            {[
              ['sparkles', 'Automatic matching between lost and found reports'],
              ['bell', 'Notifications the moment a likely match appears'],
              ['shield', 'Claims are verified by the Lost & Found desk'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon name={icon} className="h-5 w-5" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card mx-auto w-full max-w-md p-8 animate-fade-up">
        <Logo className="lg:hidden" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 lg:mt-0">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}
