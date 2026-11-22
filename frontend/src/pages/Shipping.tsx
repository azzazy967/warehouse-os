import { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, Truck, X } from 'lucide-react';
import { api, apiMessage, type DocumentLine, type Product, type WarehouseDocument } from '../api';
import { useAuth } from '../auth';
import { ProductLink } from '../components/ProductLink';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader,
  formatDate, type Column,
} from '../ui';

interface NewLine { key: string; productId: string; quantity: string }

let lineSequence = 0;
const newLine = (): NewLine => ({ key: `ln-${++lineSequence}`, productId: '', quantity: '1' });

export function ShippingPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<WarehouseDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<WarehouseDocument | null>(null);
  const [form, setForm] = useState({ carrier: '', trackingNumber: '', destination: '', notes: '', items: [newLine()] as NewLine[] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get<WarehouseDocument[]>('/shipping'), api.get<Product[]>('/products')])
      .then(([shipments, productRows]) => {
        setRows(shipments.data);
        setProducts(productRows.data);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ carrier: '', trackingNumber: '', destination: '', notes: '', items: [newLine()] });
    setCreateOpen(true);
  };

  const createShipment = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/shipping', {
        carrier: form.carrier,
        trackingNumber: form.trackingNumber || undefined,
        destination: form.destination,
        notes: form.notes || undefined,
        items: form.items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) })),
      });
      setNotice('Shipment created.');
      setCreateOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const ship = async (order: WarehouseDocument) => {
    if (!window.confirm(`Ship ${order.shipmentNumber}? Stock will be deducted immediately.`)) return;
    try {
      await api.post(`/shipping/${order.id}/ship`);
      setNotice(`Shipment ${order.shipmentNumber} dispatched.`);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const deliver = async (order: WarehouseDocument) => {
    try {
      await api.post(`/shipping/${order.id}/deliver`);
      setNotice('Shipment marked as delivered.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const cancel = async (order: WarehouseDocument) => {
    if (!window.confirm(`Cancel shipment ${order.shipmentNumber}?`)) return;
    try {
      await api.delete(`/shipping/${order.id}`);
      setNotice('Shipment cancelled.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const productName = (id: number) => products.find((product) => product.id === id)?.name || `Product ${id}`;

  const columns: Column<WarehouseDocument>[] = [
    { key: 'number', header: 'Shipment', render: (row) => <span className="mono accent-text">{row.shipmentNumber}</span> },
    { key: 'carrier', header: 'Carrier', render: (row) => row.carrier },
    { key: 'tracking', header: 'Tracking', render: (row) => row.trackingNumber || '-' },
    { key: 'destination', header: 'Destination', render: (row) => row.destination },
    { key: 'units', header: 'Units', render: (row) => row.items.reduce((sum, item) => sum + (item.quantity || 0), 0) },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.status} /> },
    { key: 'date', header: 'Shipped', render: (row) => formatDate(row.shippedAt) },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => setViewOrder(row)} aria-label="View shipment" title="View"><Eye size={15} /></button>
          {can('ADMIN', 'MANAGER') && (
            <>
              {row.status === 'PENDING' && <Button size="sm" onClick={() => ship(row)} icon={Truck}>Ship</Button>}
              {row.status === 'SHIPPED' && <Button variant="secondary" size="sm" onClick={() => deliver(row)}>Mark delivered</Button>}
              {row.status === 'PENDING' && <button className="icon-btn danger" onClick={() => cancel(row)} aria-label="Cancel shipment" title="Cancel"><X size={15} /></button>}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Shipping"
        subtitle="Outbound shipments and dispatch confirmation"
        actions={can('ADMIN', 'MANAGER') && <Button icon={Plus} onClick={openCreate}>New shipment</Button>}
      />
      {error && !createOpen && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <Card>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No shipments yet." />}
      </Card>

      <Modal
        open={createOpen} title="New shipment" onClose={() => setCreateOpen(false)} wide
        footer={<>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={createShipment} disabled={saving || !form.carrier || !form.destination || form.items.some((i) => !i.productId || Number(i.quantity) < 1)}>{saving ? 'Creating...' : 'Create shipment'}</Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Carrier"><input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="Carrier name" required /></Field>
          <Field label="Tracking number"><input value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Destination"><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Delivery location" required /></Field>
          <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="line-header"><strong>Shipment items</strong><Button variant="secondary" size="sm" icon={Plus} onClick={() => setForm({ ...form, items: [...form.items, newLine()] })}>Add line</Button></div>
        <div className="line-list">
          {form.items.map((item, index) => (
            <div className="line-row" key={item.key}>
              <select value={item.productId} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, productId: e.target.value } : l) })} aria-label={`Product for line ${index + 1}`}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </select>
              <input type="number" min="1" value={item.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l) })} aria-label="Quantity" />
              <button className="icon-btn danger" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })} aria-label="Remove line"><X size={15} /></button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={!!viewOrder} title={viewOrder ? `Shipment ${viewOrder.shipmentNumber}` : ''} onClose={() => setViewOrder(null)} wide>
        <div className="detail-meta">
          <span><small>Carrier</small><strong>{viewOrder?.carrier}</strong></span>
          <span><small>Tracking</small><strong>{viewOrder?.trackingNumber || '-'}</strong></span>
          <span><small>Destination</small><strong>{viewOrder?.destination}</strong></span>
          <span><small>Status</small>{viewOrder && <Badge value={viewOrder.status} />}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Quantity</th><th>Shipped</th></tr></thead>
            <tbody>
              {viewOrder?.items.map((item: DocumentLine) => (
                <tr key={item.id}>
                  <td><ProductLink id={item.productId} name={productName(item.productId)} /></td>
                  <td>{item.quantity}</td>
                  <td>{item.quantityShipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
