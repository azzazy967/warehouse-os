import { useCallback, useEffect, useState } from 'react';
import { Boxes, Layers3, Search, SlidersHorizontal } from 'lucide-react';
import {
  api, apiMessage,
  type InventoryRow, type InventorySummary, type Location, type Product,
} from '../api';
import { useAuth } from '../auth';
import { ProductLink } from '../components/ProductLink';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader,
  formatMoney, type Column,
} from '../ui';

export function InventoryPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<InventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<InventorySummary | null>(null);
  const [detailRows, setDetailRows] = useState<InventoryRow[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState({ productId: '', locationId: '', quantity: '0', type: 'ADJUSTMENT', notes: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<InventorySummary[]>('/inventory/summary')
      .then((response) => setRows(response.data))
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdjust = (row?: InventorySummary) => {
    setError('');
    setAdjustOpen(true);
    setForm({
      productId: row ? String(row.productId) : '',
      locationId: '',
      quantity: '0',
      type: 'ADJUSTMENT',
      notes: '',
    });
    Promise.all([api.get<Product[]>('/products'), api.get<Location[]>('/locations')])
      .then(([productsResponse, locationsResponse]) => {
        setProducts(productsResponse.data);
        setLocations(locationsResponse.data);
      })
      .catch((caught) => setError(apiMessage(caught)));
  };

  const openDetail = async (row: InventorySummary) => {
    setDetail(row);
    setDetailRows([]);
    try {
      const response = await api.get<InventoryRow[]>(`/inventory/product/${row.productId}`);
      setDetailRows(response.data);
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const saveAdjustment = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/inventory/adjust', {
        productId: Number(form.productId),
        locationId: Number(form.locationId),
        quantity: Number(form.quantity),
        type: form.type,
        notes: form.notes || null,
      });
      setNotice('Stock adjustment recorded.');
      setAdjustOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((row) => {
    const matchesSearch =
      !search ||
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.sku.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !status || row.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<InventorySummary>[] = [
    {
      key: 'product', header: 'Product',
      render: (row) => (
        <div className="cell-stack">
          <strong><ProductLink id={row.productId} name={row.name} sku={row.sku} /></strong>
          <small className="mono">{row.sku}</small>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => row.category || '-' },
    {
      key: 'onHand', header: 'On hand',
      render: (row) => <strong className={row.status !== 'IN_STOCK' ? 'negative' : ''}>{row.quantityOnHand} {row.unitOfMeasure}</strong>,
    },
    { key: 'reserved', header: 'Reserved', render: (row) => row.quantityReserved },
    { key: 'available', header: 'Available', render: (row) => row.available },
    { key: 'reorder', header: 'Reorder at', render: (row) => row.reorderLevel },
    { key: 'locations', header: 'Bins', render: (row) => row.locations },
    { key: 'value', header: 'Stock value', render: (row) => formatMoney(row.stockValue) },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.status} /> },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => openDetail(row)}>Bins</button>
          {can('ADMIN', 'MANAGER') && <button className="btn btn-secondary btn-sm" onClick={() => openAdjust(row)}>Adjust</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels by product across all storage locations"
        actions={can('ADMIN', 'MANAGER') && <Button icon={SlidersHorizontal} onClick={() => openAdjust()}>Adjust stock</Button>}
      />
      {error && !adjustOpen && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <div className="mini-stat-row">
        <Card className="mini-stat"><Boxes size={18} /><div><strong>{rows.length}</strong><small>Tracked SKUs</small></div></Card>
        <Card className="mini-stat"><span className="mini-dot amber" /><div><strong>{rows.filter((r) => r.status === 'LOW_STOCK').length}</strong><small>Low stock</small></div></Card>
        <Card className="mini-stat"><span className="mini-dot rose" /><div><strong>{rows.filter((r) => r.status === 'OUT_OF_STOCK').length}</strong><small>Out of stock</small></div></Card>
        <Card className="mini-stat"><Layers3 size={18} /><div><strong>{formatMoney(rows.reduce((sum, r) => sum + r.stockValue, 0))}</strong><small>Total value</small></div></Card>
      </div>

      <Card>
        <div className="toolbar">
          <div className="input-wrap search-wrap"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </div>
        {loading ? (
          <Loader />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(row) => row.productId}
            emptyText="No inventory records found."
          />
        )}
      </Card>

      <Modal open={!!detail} title={detail ? `Stock by bin - ${detail.name}` : ''} onClose={() => setDetail(null)} wide>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Location</th><th>Warehouse</th><th>On hand</th><th>Reserved</th></tr></thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.id}>
                  <td className="mono accent-text">{row.location?.code}</td>
                  <td>{row.location?.warehouse}</td>
                  <td>{row.quantityOnHand}</td>
                  <td>{row.quantityReserved}</td>
                </tr>
              ))}
              {detailRows.length === 0 && <tr><td colSpan={4} className="empty-cell">No stock in any bin.</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={adjustOpen}
        title="Adjust stock"
        onClose={() => setAdjustOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button onClick={saveAdjustment} disabled={saving || !form.productId || !form.locationId || Number(form.quantity) === 0}>
            {saving ? 'Saving...' : 'Record adjustment'}
          </Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Product">
            <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">Select location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.code} - {location.warehouse}</option>)}
            </select>
          </Field>
          <Field label="Movement type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="RECEIPT">Receipt</option>
              <option value="RETURN">Return</option>
              <option value="PICK">Pick</option>
              <option value="SHIPMENT">Shipment</option>
            </select>
          </Field>
          <Field
            label="Quantity"
            hint={form.type === 'ADJUSTMENT'
              ? 'Use a negative number to deduct stock'
              : 'Enter a positive quantity'}
          >
            <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Notes" hint="Optional">
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
