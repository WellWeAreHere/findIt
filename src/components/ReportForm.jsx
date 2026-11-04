'use client';
// Create / edit a report. Characteristic inputs are generated from the
// category's MongoDB template, so every category asks different questions.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Field, Input, Select, Skeleton, Textarea, cx } from './ui';
import Icon from './ui/Icon';
import { api, useApi } from '@/lib/client/api';
import { todayISO } from '@/lib/client/format';

const MAX_PHOTOS = 3;

function CharacteristicInput({ field, value, onChange, error }) {
  const id = `char-${field.key}`;
  return (
    <Field label={field.label} htmlFor={id} error={error} required={field.required}>
      {field.type === 'select' ? (
        <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={error}>
          <option value="">Not sure</option>
          {field.options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </Select>
      ) : (
        <Input id={id} type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? 0 : undefined}
          value={value ?? ''} maxLength={100} onChange={(e) => onChange(e.target.value)} error={error} />
      )}
    </Field>
  );
}

export default function ReportForm({ mode = 'create', initialType = 'LOST', existing }) {
  const router = useRouter();
  const catalog = useApi('/api/catalog');
  const [form, setForm] = useState(() => existing ? {
    report_type: existing.report.report_type,
    category_id: String(existing.report.category_id),
    item_id: String(existing.report.item_id),
    building_id: String(existing.report.building_id),
    location_id: String(existing.report.location_id),
    custody_location_id: existing.report.custody_location_id ? String(existing.report.custody_location_id) : '',
    report_date: existing.report.report_date,
    summary: existing.report.description,
    description: existing.details?.description ?? '',
    characteristics: existing.details?.characteristics ?? {},
  } : {
    report_type: initialType, category_id: '', item_id: '', building_id: '', location_id: '',
    custody_location_id: '', report_date: todayISO(), summary: '', description: '', characteristics: {},
  });
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');

  const categories = catalog.data?.categories ?? [];
  const buildings = catalog.data?.buildings ?? [];
  const category = categories.find((c) => String(c.category_id) === form.category_id);
  const building = buildings.find((b) => String(b.building_id) === form.building_id);
  const allLocations = useMemo(() => buildings.flatMap((b) => b.locations.map((l) => ({ ...l, building_name: b.building_name }))), [buildings]);

  // Default custody for found items: the Security Office desk.
  useEffect(() => {
    if (form.report_type === 'FOUND' && !form.custody_location_id && allLocations.length && mode === 'create') {
      const desk = allLocations.find((l) => /security office/i.test(l.area));
      if (desk) setForm((f) => ({ ...f, custody_location_id: String(desk.location_id) }));
    }
  }, [form.report_type, form.custody_location_id, allLocations, mode]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const fe = error?.fields ?? {};

  function addPhotos(fileList) {
    const accepted = [...fileList].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 5 * 1024 * 1024);
    if (accepted.length < fileList.length) setError({ message: 'Photos must be JPEG, PNG or WebP and at most 5 MB each.' });
    setPhotos((p) => [...p, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const characteristics = Object.fromEntries(Object.entries(form.characteristics).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    const body = {
      item_id: Number(form.item_id) || undefined,
      location_id: Number(form.location_id) || undefined,
      custody_location_id: form.report_type === 'FOUND' && form.custody_location_id ? Number(form.custody_location_id) : null,
      report_date: form.report_date,
      summary: form.summary,
      description: form.description,
      characteristics,
    };
    try {
      let id = existing?.report.report_id;
      if (mode === 'create') {
        setStep('Saving your report…');
        ({ report_id: id } = await api('/api/reports', { method: 'POST', body: { ...body, report_type: form.report_type, custody_location_id: body.custody_location_id ?? undefined } }));
        for (const [i, p] of photos.entries()) {
          setStep(`Uploading photo ${i + 1} of ${photos.length}…`);
          const fd = new FormData();
          fd.append('image', p.file);
          await api(`/api/reports/${id}/images`, { method: 'POST', body: fd }).catch(() => {});
        }
        router.push(`/items/${id}?created=1`);
      } else {
        setStep('Saving changes…');
        await api(`/api/reports/${id}`, { method: 'PATCH', body });
        router.push(`/items/${id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
      setStep('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (catalog.loading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (catalog.error) return <Alert type="error">{catalog.error.message}</Alert>;

  const lost = form.report_type === 'LOST';

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <Alert type="error" title="Please fix the highlighted fields">{error.message}</Alert>}

      {mode === 'create' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[['LOST', 'I lost something', 'alert', 'Tell us what you lost and we will look for matching found items.'],
            ['FOUND', 'I found something', 'hand', 'Tell us what you found so we can reunite it with its owner.']].map(([value, title, icon, text]) => (
            <button key={value} type="button" onClick={() => set('report_type', value)} aria-pressed={form.report_type === value}
              className={cx('flex gap-3 rounded-2xl border-2 p-4 text-left transition',
                form.report_type === value
                  ? value === 'LOST' ? 'border-orange-400 bg-lost-50' : 'border-emerald-400 bg-found-50'
                  : 'border-slate-200 bg-white hover:border-slate-300')}>
              <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', value === 'LOST' ? 'bg-lost-100 text-lost-600' : 'bg-found-100 text-found-600')}>
                <Icon name={icon} />
              </span>
              <span><span className="block font-semibold text-slate-900">{title}</span><span className="text-sm text-slate-500">{text}</span></span>
            </button>
          ))}
        </div>
      )}

      <fieldset className="card space-y-5 p-6">
        <legend className="sr-only">The item</legend>
        <h2 className="font-semibold text-slate-900">1. What is it?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" required error={!form.category_id && fe.item_id ? 'Choose a category' : undefined}>
            <Select id="category" value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value, item_id: '', characteristics: {} }))}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </Select>
          </Field>
          <Field label="Item type" htmlFor="item" required error={fe.item_id}>
            <Select id="item" value={form.item_id} disabled={!category} onChange={(e) => set('item_id', e.target.value)} error={fe.item_id}>
              <option value="">{category ? 'Choose an item' : 'Pick a category first'}</option>
              {category?.items.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Short summary" htmlFor="summary" required error={fe.summary}
          hint={`Shown on item cards. ${form.summary.length}/255`}>
          <Input id="summary" value={form.summary} maxLength={255} onChange={(e) => set('summary', e.target.value)} error={fe.summary}
            placeholder={lost ? 'e.g. Black Milton steel bottle with a red sticker' : 'e.g. Black steel bottle found near library entrance'} />
        </Field>
        <Field label="Full description" htmlFor="description" required error={fe.description}
          hint="Distinctive marks, contents, stickers, damage: anything that helps identify it.">
          <Textarea id="description" value={form.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} error={fe.description} />
        </Field>
      </fieldset>

      {category?.fields?.length > 0 && (
        <fieldset className="card space-y-5 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">2. Details for {category.category_name.toLowerCase()}</h2>
            <p className="text-sm text-slate-500">These are compared directly when we look for matches. Fill in what you know.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {category.fields.map((field) => (
              <CharacteristicInput key={field.key} field={field} value={form.characteristics[field.key]}
                error={fe[`characteristics.${field.key}`]}
                onChange={(v) => setForm((f) => ({ ...f, characteristics: { ...f.characteristics, [field.key]: v } }))} />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="card space-y-5 p-6">
        <h2 className="font-semibold text-slate-900">{category?.fields?.length ? '3' : '2'}. Where and when?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building" htmlFor="building" required error={!form.building_id && fe.location_id ? 'Choose a building' : undefined}>
            <Select id="building" value={form.building_id} onChange={(e) => setForm((f) => ({ ...f, building_id: e.target.value, location_id: '' }))}>
              <option value="">Choose a building</option>
              {buildings.map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}
            </Select>
          </Field>
          <Field label={lost ? 'Where you last had it' : 'Where you found it'} htmlFor="location" required error={fe.location_id}>
            <Select id="location" value={form.location_id} disabled={!building} onChange={(e) => set('location_id', e.target.value)} error={fe.location_id}>
              <option value="">{building ? 'Choose an area' : 'Pick a building first'}</option>
              {building?.locations.map((l) => (
                <option key={l.location_id} value={l.location_id}>{l.area}{l.floor !== 0 ? ` (${l.floor < 0 ? 'basement' : `floor ${l.floor}`})` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label={lost ? 'Date lost' : 'Date found'} htmlFor="date" required error={fe.report_date}>
            <Input id="date" type="date" max={todayISO()} value={form.report_date} onChange={(e) => set('report_date', e.target.value)} error={fe.report_date} />
          </Field>
          {!lost && (
            <Field label="Where is it now?" htmlFor="custody" error={fe.custody_location_id} hint="Where the owner can collect it.">
              <Select id="custody" value={form.custody_location_id} onChange={(e) => set('custody_location_id', e.target.value)}>
                <option value="">I still have it</option>
                {allLocations.map((l) => <option key={l.location_id} value={l.location_id}>{l.building_name} · {l.area}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </fieldset>

      {mode === 'create' && (
        <fieldset className="card space-y-4 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">Photos <span className="font-normal text-slate-400">(optional)</span></h2>
            <p className="text-sm text-slate-500">Up to 3 photos. JPEG, PNG or WebP, max 5 MB each.{!lost && ' Tip: hide one detail so the real owner can prove it.'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.url} alt={`Selected photo ${i + 1}`} className="h-24 w-24 rounded-xl object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-white hover:bg-rose-600">
                  <Icon name="x" className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-brand-400 hover:text-brand-600">
                <span className="flex flex-col items-center gap-1 text-xs font-medium"><Icon name="upload" />Add</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        {step && <p className="text-sm text-slate-500 sm:mr-auto">{step}</p>}
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={busy} size="lg">{mode === 'create' ? `Submit ${lost ? 'lost' : 'found'} report` : 'Save changes'}</Button>
      </div>
    </form>
  );
}
