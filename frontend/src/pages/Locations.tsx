import { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, apiMessage, type Location } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader, type Column,
} from '../ui';

interface LocationForm {
  code: string;
  warehouse: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  type: string;
  capacity: string;
  isActive: boolean;
}

const emptyForm: LocationForm = {
  code: '', warehouse: '', zone: '', aisle: '', rack: '', bin: '',
  type: 'RACK', capacity: '0', isActive: true,
};

export function LocationsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [editing, setEditing] = useState<Location | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (warehouse) params.set('warehouse', warehouse);
    Promise.all([api.get<Location[]>(`/locations?${params}`), api.get<string[]>('/locations/warehouses')])
      .then(([locationsResponse, warehousesResponse]) => {
        setRows(locationsResponse.data);
        setWarehouses(warehousesResponse.data);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, [search, warehouse]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row: Location) => {
    setEditing(row);
    setForm({
      code: row.code, warehouse: row.warehouse, zone: row.zone || '', aisle: row.aisle || '',
      rack: row.rack || '', bin: row.bin || '', type: row.type, capacity: String(row.capacity),
      isActive: row.isActive,
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity),
        zone: form.zone || null,
        aisle: form.aisle || null,
        rack: form.rack || null,
        bin: form.bin || null,
      };
      if (editing) {
        await api.patch(`/locations/${editing.id}`, payload);
        setNotice('Location updated successfully.');
      } else {
        await api.post('/locations', payload);
        setNotice('Location created successfully.');
      }
      setModalOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Location) => {
    if (!window.confirm(`Delete location ${row.code}?`)) return;
    try {
      await api.delete(`/locations/${row.id}`);
      setNotice('Location deleted.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const columns: Column<Location>[] = [
    { key: 'code', header: 'Code', render: (row) => <span className="mono accent-text">{row.code}</span> },
    { key: 'warehouse', header: 'Warehouse', render: (row) => row.warehouse },
    { key: 'zone', header: 'Zone', render: (row) => row.zone || '-' },
    { key: 'aisle', header: 'Aisle', render: (row) => row.aisle || '-' },
    { key: 'rack', header: 'Rack', render: (row) => row.rack || '-' },
    { key: 'bin', header: 'Bin', render: (row) => row.bin || '-' },
    { key: 'type', header: 'Type', render: (row) => row.type },
    { key: 'capacity', header: 'Capacity', render: (row) => row.capacity },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => can('ADMIN', 'MANAGER') ? (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => openEdit(row)} aria-label="Edit location" title="Edit"><Pencil size={15} /></button>
          {can('ADMIN') && <button className="icon-btn danger" onClick={() => remove(row)} aria-label="Delete location" title="Delete"><Trash2 size={15} /></button>}
        </div>
      ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Define warehouses, zones and storage bins"
        actions={can('ADMIN', 'MANAGER') && <Button icon={Plus} onClick={openCreate}>Add location</Button>}
      />
      {error && !modalOpen && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <Card>
        <div className="toolbar">
          <div className="input-wrap search-wrap"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or warehouse" /></div>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} aria-label="Filter by warehouse">
            <option value="">All warehouses</option>
            {warehouses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No locations found." />}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Edit location' : 'New location'}
        onClose={() => setModalOpen(false)}
        wide
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save location'}</Button>
        </>}
      >
        {error && modalOpen && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Location code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WH1-A-01-01" required /></Field>
          <Field label="Warehouse"><input value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} placeholder="Main Warehouse" required /></Field>
          <Field label="Zone"><input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></Field>
          <Field label="Aisle"><input value={form.aisle} onChange={(e) => setForm({ ...form, aisle: e.target.value })} /></Field>
          <Field label="Rack"><input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} /></Field>
          <Field label="Bin"><input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} /></Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="RACK">Rack</option><option value="SHELF">Shelf</option>
              <option value="FLOOR">Floor</option><option value="BIN">Bin</option>
            </select>
          </Field>
          <Field label="Capacity"><input type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          <label className="check-inline field-check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active</label>
        </div>
        <div className="hint-row"><MapPin size={14} /> Combine zone, aisle, rack and bin to describe the physical position.</div>
      </Modal>
    </>
  );
}
