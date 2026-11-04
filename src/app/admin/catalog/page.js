'use client';
import { useEffect, useState } from 'react';
import AdminShell, { Panel } from '@/components/admin/AdminShell';
import { Alert, Badge, Button, Field, Input, LoadError, Select, Skeleton } from '@/components/ui';
import Icon from '@/components/ui/Icon';
import { api, useApi } from '@/lib/client/api';

const ZONES = ['ACADEMIC', 'HOSTEL', 'FOOD', 'SPORTS', 'ADMIN', 'OPEN_AREA'];

// Small inline form that posts to an admin endpoint and reports the result.
function QuickForm({ endpoint, initial, onDone, children, submitLabel }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { method: 'POST', body: values });
      setValues(initial);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Alert type="error">{error.message}</Alert>}
      {children(values, (k) => (e) => setValues({ ...values, [k]: e.target.value }), error?.fields ?? {})}
      <Button type="submit" size="sm" icon="plus" loading={busy}>{submitLabel}</Button>
    </form>
  );
}

function TemplateEditor({ category, onSaved }) {
  const [fields, setFields] = useState(category.fields);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset only when switching category, so the saved message survives the reload.
  useEffect(() => { setFields(category.fields); setSaved(false); setError(null); }, [category.category_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i, patch) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const clean = fields.map(({ options, ...f }) => ({
        ...f,
        match_weight: Number(f.match_weight),
        ...(f.type === 'select' ? { options: (Array.isArray(options) ? options : String(options ?? '').split(',')).map((o) => o.trim()).filter(Boolean) } : {}),
      }));
      await api(`/api/admin/templates/${category.category_id}`, { method: 'PUT', body: { fields: clean } });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert type="error">{error.message}{Object.values(error.fields ?? {})[0] && `: ${Object.values(error.fields)[0]}`}</Alert>}
      {saved && <Alert type="success">Template saved to MongoDB. New and edited reports use it immediately.</Alert>}
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="text-left text-xs text-slate-500">
            <th className="pb-2 font-medium">Key</th><th className="pb-2 font-medium">Label</th><th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Options (comma separated)</th><th className="pb-2 font-medium">Weight</th><th />
          </tr></thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2"><Input value={f.key} onChange={(e) => update(i, { key: e.target.value })} className="py-1.5 font-mono text-xs" aria-label="Key" /></td>
                <td className="py-1 pr-2"><Input value={f.label} onChange={(e) => update(i, { label: e.target.value })} className="py-1.5" aria-label="Label" /></td>
                <td className="py-1 pr-2">
                  <Select value={f.type} onChange={(e) => update(i, { type: e.target.value })} aria-label="Type" className="w-28">
                    <option value="text">Text</option><option value="select">Select</option><option value="number">Number</option>
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input disabled={f.type !== 'select'} value={Array.isArray(f.options) ? f.options.join(', ') : f.options ?? ''}
                    onChange={(e) => update(i, { options: e.target.value })} className="py-1.5" aria-label="Options" />
                </td>
                <td className="py-1 pr-2"><Input type="number" min="0" max="5" step="1" value={f.match_weight} onChange={(e) => update(i, { match_weight: e.target.value })} className="w-20 py-1.5" aria-label="Match weight" /></td>
                <td className="py-1">
                  <button type="button" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove field">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Weight (0–5) controls how much agreement on this attribute counts when matching lost and found reports.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setFields((fs) => [...fs, { key: '', label: '', type: 'text', match_weight: 1 }])}>Add field</Button>
        <Button size="sm" loading={busy} onClick={save}>Save template</Button>
      </div>
    </div>
  );
}

export default function AdminCatalogPage() {
  const { data, error, loading, reload } = useApi('/api/catalog');
  const [templateCategory, setTemplateCategory] = useState('');
  const [deleteError, setDeleteError] = useState(null);

  async function del(path) {
    setDeleteError(null);
    try {
      await api(path, { method: 'DELETE' });
      reload();
    } catch (err) {
      setDeleteError(err);
    }
  }

  if (error) return <AdminShell title="Catalogue"><LoadError error={error} onRetry={reload} /></AdminShell>;
  if (loading && !data) return <AdminShell title="Catalogue"><Skeleton className="h-96" /></AdminShell>;

  const selected = data.categories.find((c) => String(c.category_id) === templateCategory) ?? data.categories[0];

  return (
    <AdminShell title="Catalogue" subtitle="Campus places and item types live in MySQL; per-category characteristic templates live in MongoDB.">
      {deleteError && <Alert type="error" className="mb-6">{deleteError.message}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Buildings & locations" source="buildings, locations">
          <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
            {data.buildings.map((b) => (
              <div key={b.building_id}>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">{b.building_name}<Badge tone="slate">{b.zone.replace('_', ' ').toLowerCase()}</Badge></p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {b.locations.map((l) => (
                    <li key={l.location_id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-xs text-slate-700">
                      {l.area}{l.floor !== 0 && <span className="text-slate-400"> · F{l.floor}</span>}
                      <button type="button" onClick={() => del(`/api/admin/locations/${l.location_id}`)} className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600" aria-label={`Delete ${l.area}`}>
                        <Icon name="x" className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <QuickForm endpoint="/api/admin/locations" initial={{ building_id: '', floor: '0', area: '' }} onDone={reload} submitLabel="Add location">
              {(v, set, fe) => <>
                <Field label="Building" error={fe.building_id}><Select value={v.building_id} onChange={set('building_id')}><option value="">Choose…</option>{data.buildings.map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}</Select></Field>
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <Field label="Floor" error={fe.floor}><Input type="number" min="-2" max="15" value={v.floor} onChange={set('floor')} /></Field>
                  <Field label="Area" error={fe.area}><Input value={v.area} onChange={set('area')} placeholder="e.g. Seminar hall 2" /></Field>
                </div>
              </>}
            </QuickForm>
            <QuickForm endpoint="/api/admin/buildings" initial={{ building_name: '', zone: 'ACADEMIC' }} onDone={reload} submitLabel="Add building">
              {(v, set, fe) => <>
                <Field label="Building name" error={fe.building_name}><Input value={v.building_name} onChange={set('building_name')} /></Field>
                <Field label="Zone" error={fe.zone}><Select value={v.zone} onChange={set('zone')}>{ZONES.map((z) => <option key={z} value={z}>{z.replace('_', ' ').toLowerCase()}</option>)}</Select></Field>
              </>}
            </QuickForm>
          </div>
        </Panel>

        <Panel title="Categories & item types" source="categories, items">
          <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
            {data.categories.map((c) => (
              <div key={c.category_id}>
                <p className="text-sm font-semibold text-slate-800">{c.category_name} <span className="font-normal text-slate-400">· {c.fields.length} template fields</span></p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.items.map((i) => (
                    <li key={i.item_id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-xs text-slate-700">
                      {i.item_name}
                      <button type="button" onClick={() => del(`/api/admin/items/${i.item_id}`)} className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600" aria-label={`Delete ${i.item_name}`}>
                        <Icon name="x" className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <QuickForm endpoint="/api/admin/items" initial={{ category_id: '', item_name: '' }} onDone={reload} submitLabel="Add item type">
              {(v, set, fe) => <>
                <Field label="Category" error={fe.category_id}><Select value={v.category_id} onChange={set('category_id')}><option value="">Choose…</option>{data.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}</Select></Field>
                <Field label="Item name" error={fe.item_name}><Input value={v.item_name} onChange={set('item_name')} placeholder="e.g. Headphones" /></Field>
              </>}
            </QuickForm>
            <QuickForm endpoint="/api/admin/categories" initial={{ category_name: '', description: '' }} onDone={reload} submitLabel="Add category">
              {(v, set, fe) => <>
                <Field label="Category name" error={fe.category_name}><Input value={v.category_name} onChange={set('category_name')} /></Field>
                <Field label="Description" error={fe.description}><Input value={v.description} onChange={set('description')} /></Field>
              </>}
            </QuickForm>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6" title="Characteristic templates" source="category_templates" sourceKind="mongo"
        action={
          <Select value={String(selected.category_id)} onChange={(e) => setTemplateCategory(e.target.value)} className="w-56" aria-label="Category">
            {data.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </Select>
        }>
        <TemplateEditor category={selected} onSaved={reload} />
      </Panel>
    </AdminShell>
  );
}
