"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, LayoutDashboard, LogOut, MessageSquare, Store, Tag } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusTag from "@/components/ui/StatusTag";
import { money } from "@/lib/client";

const TOKEN_KEY = "tv_admin_token";

type View = "dashboard" | "businesses" | "orders" | "whatsapp" | "verticals";

const NAV: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "businesses", label: "Negocios", icon: Store },
  { id: "orders", label: "Pedidos Global", icon: ClipboardList },
  { id: "whatsapp", label: "Logs WhatsApp", icon: MessageSquare },
  { id: "verticals", label: "Verticales", icon: Tag }
];

async function adminFetch<T = any>(url: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

const fmtDate = (value: string) => (value ? new Date(value).toLocaleDateString("es-CO") : "—");
const fmtDateTime = (value: string) => (value ? new Date(value).toLocaleString("es-CO") : "—");

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ${active ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"}`}>
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "SENT"
    ? "bg-success-50 text-success-700"
    : status === "DRY_RUN"
      ? "bg-warning-50 text-warning-700"
      : "bg-error-50 text-error-700";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ${cls}`}>{status}</span>;
}

function AdminLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-8 text-center shadow-2xl sm:p-12">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-xl font-black text-white">TV</div>
        <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-500">Acceso restringido a administradores de TiqueteVivo</p>
        {error && (
          <p className="mt-4 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-left text-sm font-bold text-error-700">{error}</p>
        )}
        <form
          className="mt-6 grid gap-4 text-left"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            await onLogin(email, password).catch((err) => setError(err.message || "Error de conexión"));
            setBusy(false);
          }}
        >
          <label className="grid gap-1.5 text-sm font-extrabold text-slate-700">
            Correo electrónico
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@tiquetevivo.com"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-extrabold text-slate-700">
            Contraseña
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </label>
          <Button type="submit" disabled={busy} className="w-full py-3">
            {busy ? "Ingresando…" : "Iniciar Sesión"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [view, setView] = useState<View>("dashboard");
  const [loggedIn, setLoggedIn] = useState(false);
  const [booting, setBooting] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [verticals, setVerticals] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const [bizSearch, setBizSearch] = useState("");
  const [orderBizFilter, setOrderBizFilter] = useState("");

  const logout = useCallback((message = "") => {
    window.localStorage.removeItem(TOKEN_KEY);
    setLoggedIn(false);
    setStats(null);
    setBusinesses([]);
    setOrders([]);
    setLogs([]);
    setVerticals([]);
  }, []);

  const guard = useCallback(
    (status: number): boolean => {
      if (status === 401 || status === 403) {
        logout(status === 403 ? "Acceso restringido: solo superadmin." : "Sesión expirada. Ingresa de nuevo.");
        return false;
      }
      return true;
    },
    [logout]
  );

  const loadDashboard = useCallback(async () => {
    const res = await adminFetch("/api/admin-stats");
    if (!guard(res.status)) return null;
    if (res.ok) setStats(res.data);
    return res;
  }, [guard]);

  const loadBusinesses = useCallback(async () => {
    const res = await adminFetch<any[]>("/api/admin-businesses");
    if (!guard(res.status)) return;
    if (res.ok) setBusinesses(Array.isArray(res.data) ? res.data : []);
  }, [guard]);

  const loadOrders = useCallback(async () => {
    const res = await adminFetch<any[]>("/api/admin-orders");
    if (!guard(res.status)) return;
    if (res.ok) setOrders(Array.isArray(res.data) ? res.data : []);
  }, [guard]);

  const loadLogs = useCallback(async () => {
    const res = await adminFetch<any[]>("/api/admin-whatsapp-logs");
    if (!guard(res.status)) return;
    if (res.ok) setLogs(Array.isArray(res.data) ? res.data : []);
  }, [guard]);

  const loadVerticals = useCallback(async () => {
    const res = await adminFetch<any[]>("/api/admin-verticals");
    if (!guard(res.status)) return;
    if (res.ok) setVerticals(Array.isArray(res.data) ? res.data : []);
  }, [guard]);

  useEffect(() => {
    if (window.localStorage.getItem(TOKEN_KEY)) {
      setLoggedIn(true);
      setView("dashboard");
      loadDashboard();
    }
    setBooting(false);
  }, [loadDashboard]);

  const handleLogin = async (email: string, password: string) => {
    const res = await adminFetch<{ token?: string; error?: string; message?: string }>("/api/auth-login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (!res.ok || !res.data.token) {
      throw new Error(res.data.error || res.data.message || "Credenciales inválidas");
    }
    window.localStorage.setItem(TOKEN_KEY, res.data.token);
    setLoggedIn(true);
    setView("dashboard");
    await loadDashboard();
  };

  const switchView = async (id: View) => {
    setView(id);
    if (id === "dashboard") await loadDashboard();
    else if (id === "businesses") await loadBusinesses();
    else if (id === "orders") {
      if (!businesses.length) await loadBusinesses();
      await loadOrders();
    } else if (id === "whatsapp") await loadLogs();
    else if (id === "verticals") await loadVerticals();
  };

  const toggleBiz = async (id: string, activate: boolean) => {
    if (busy) return;
    setBusy(true);
    await adminFetch("/api/manage-business", {
      method: "POST",
      body: JSON.stringify({ action: activate ? "reactivate" : "deactivate", business_id: id })
    });
    await loadBusinesses();
    await loadDashboard();
    setBusy(false);
  };

  const filteredBusinesses = businesses.filter((b) => {
    if (!bizSearch.trim()) return true;
    const q = bizSearch.trim().toLowerCase();
    return [b.name, (b.vertical_name || ""), b.slug].some((v) => String(v).toLowerCase().includes(q));
  });

  const filteredOrders = orders.filter((o) => {
    if (!orderBizFilter) return true;
    return (o.business_slug || o.business_id) === orderBizFilter;
  });

  const Table = ({ headers, children }: { headers: string[]; children: React.ReactNode }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  const Row = ({ children }: { children: React.ReactNode }) => (
    <tr className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50/60">{children}</tr>
  );
  const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-4 py-3 align-middle text-slate-800 ${className}`}>{children}</td>
  );

  if (booting) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
      </main>
    );
  }

  if (!loggedIn) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto bg-slate-900 p-4 text-white lg:flex">
        <div className="flex items-center gap-2.5 rounded-xl px-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-black">TV</span>
          <span className="text-lg font-black">TiqueteVivo</span>
          <span className="rounded bg-brand-600/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-300">Admin</span>
        </div>
        <nav className="grid gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchView(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${view === id ? "bg-brand-600/20 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <button onClick={() => logout()} className="mt-auto flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-left text-sm font-bold text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
          <LogOut size={16} />
          Cerrar Sesión
        </button>
      </aside>

      <nav className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-xs font-black text-white">TV</span>
          <span className="font-black text-slate-900">Admin</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchView(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold ${view === id ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Icon size={13} />
              {label.split(" ")[0]}
            </button>
          ))}
        </div>
      </nav>

      <main className="p-4 sm:p-6 lg:p-8">
        {view === "dashboard" && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>
                <p className="text-sm font-semibold text-slate-500">
                  {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Negocios Activos", value: stats?.businesses ?? "—" },
                { label: "Pedidos Totales", value: stats?.orders ?? "—" },
                { label: "Ventas Totales", value: money.format(stats?.revenue ?? 0) },
                { label: "Mensajes WhatsApp", value: stats?.messages ?? "—" }
              ].map((s) => (
                <Card key={s.label} className="p-5">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{s.label}</div>
                  <div className="mt-1.5 text-3xl font-black text-slate-900">{s.value}</div>
                </Card>
              ))}
            </div>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-extrabold text-slate-900">Últimos Negocios Registrados</h2>
              </div>
              <Table headers={["Negocio", "Vertical", "Slug", "Estado", "Creado"]}>
                {(stats?.recentBusinesses || []).map((b: any) => (
                  <Row key={b.id}>
                    <Td className="font-extrabold">{b.name}</Td>
                    <Td>{b.vertical_emoji} {b.vertical_name || "N/A"}</Td>
                    <Td><code className="text-xs">{b.slug}</code></Td>
                    <Td><ActiveBadge active={b.active} /></Td>
                    <Td>{fmtDate(b.created_at)}</Td>
                  </Row>
                ))}
                {(stats?.recentBusinesses || []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay negocios registrados</td></tr>
                )}
              </Table>
            </Card>
          </>
        )}

        {view === "businesses" && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900">Gestión de Negocios</h1>
              <div className="flex items-center gap-3">
                <input
                  value={bizSearch}
                  onChange={(e) => setBizSearch(e.target.value)}
                  placeholder="🔍 Buscar…"
                  className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                />
                <Link href="/registro" target="_blank">
                  <Button variant="secondary">+ Nuevo Negocio</Button>
                </Link>
              </div>
            </div>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-extrabold text-slate-900">Todos los Negocios</h2>
              </div>
              <Table headers={["Negocio", "Vertical", "Slug", "Teléfono", "Estado", "Acciones"]}>
                {filteredBusinesses.map((b) => (
                  <Row key={b.id}>
                    <Td className="font-extrabold">{b.name}</Td>
                    <Td>{b.vertical_emoji} {b.vertical_name || "N/A"}</Td>
                    <Td><code className="text-xs">{b.slug}</code></Td>
                    <Td>{b.phone || "—"}</Td>
                    <Td><ActiveBadge active={b.active} /></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link href={`/panel?slug=${b.slug}`} target="_blank">
                          <Button variant="secondary" className="px-2.5 py-1 text-xs">Ver Panel</Button>
                        </Link>
                        <button
                          onClick={() => toggleBiz(b.id, !b.active)}
                          disabled={busy}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-60 ${b.active ? "border-error-200 text-error-700 hover:bg-error-50" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                        >
                          {b.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </Td>
                  </Row>
                ))}
                {filteredBusinesses.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No hay negocios que coincidan</td></tr>
                )}
              </Table>
            </Card>
          </>
        )}

        {view === "orders" && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900">Pedidos Global</h1>
              <select
                value={orderBizFilter}
                onChange={(e) => setOrderBizFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              >
                <option value="">Todos los negocios</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.slug}>{b.name}</option>
                ))}
              </select>
            </div>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-extrabold text-slate-900">Todos los Pedidos (Últimos 50)</h2>
              </div>
              <Table headers={["#", "Negocio", "Cliente", "Total", "Saldo", "Estado", "Fecha"]}>
                {filteredOrders.map((o) => {
                  const balance = Number(o.balance ?? 0);
                  return (
                    <Row key={o.id}>
                      <Td className="font-extrabold">#{o.order_number}</Td>
                      <Td>{o.business_name || (o.business_id ? o.business_id.slice(0, 8) : "—")}</Td>
                      <Td>{o.customer_name}</Td>
                      <Td>{money.format(Number(o.total || 0))}</Td>
                      <Td className={`font-extrabold ${balance > 0 ? "text-error-700" : "text-success-700"}`}>{money.format(balance)}</Td>
                      <Td><StatusTag label={o.status} statusKey={o.status} /></Td>
                      <Td>{fmtDate(o.created_at)}</Td>
                    </Row>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No hay pedidos</td></tr>
                )}
              </Table>
            </Card>
          </>
        )}

        {view === "whatsapp" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-slate-900">Logs de WhatsApp</h1>
            </div>
            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-extrabold text-slate-900">Mensajes Enviados</h2>
              </div>
              <Table headers={["Fecha", "Teléfono", "Estado", "Template", "Meta ID"]}>
                {logs.map((l) => (
                  <Row key={l.id}>
                    <Td>{fmtDateTime(l.created_at)}</Td>
                    <Td>{l.phone}</Td>
                    <Td><StatusBadge status={l.status} /></Td>
                    <Td>{l.template_name || "free-text"}</Td>
                    <Td><code className="text-xs">{l.meta_message_id || "—"}</code></Td>
                  </Row>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay logs</td></tr>
                )}
              </Table>
            </Card>
          </>
        )}

        {view === "verticals" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-slate-900">Verticales del Sistema</h1>
            </div>
            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-extrabold text-slate-900">Verticales Configuradas</h2>
              </div>
              <Table headers={["Emoji", "Nombre", "Slug", "Servicios", "Estados", "Estado"]}>
                {verticals.map((v) => (
                  <Row key={v.id}>
                    <Td className="text-2xl">{v.emoji}</Td>
                    <Td className="font-extrabold">{v.name}</Td>
                    <Td><code className="text-xs">{v.slug}</code></Td>
                    <Td>{(v.services_default || []).length}</Td>
                    <Td>{(v.status_flow_default || []).length} pasos</Td>
                    <Td><ActiveBadge active={v.active} /></Td>
                  </Row>
                ))}
                {verticals.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No hay verticales</td></tr>
                )}
              </Table>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}