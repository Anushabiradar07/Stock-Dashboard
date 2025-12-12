// src/App.js
import React, { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

/* CONFIG */
const WS_URL = "ws://localhost:4000";
const HISTORY_LEN = 100;
const FALLBACK = ["GOOG", "TSLA", "AMZN", "META", "NVDA"];
const upColor = "#16a34a";
const downColor = "#dc2626";
const neutralColor = "#64748b";

/* Helpers */
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const tsToLabel = (ts) => new Date(ts).toLocaleTimeString();
const pushLimited = (arr, item, n = HISTORY_LEN) => {
  const copy = [...arr, item];
  if (copy.length > n) copy.shift();
  return copy;
};
const fmt = (n) => (typeof n === "number" ? n.toFixed(2) : "--");

/* Tiny sparkline component used inside cards */
function Sparkline({ data, height = 40 }) {
  if (!data || data.length === 0)
    return <div style={{ color: "#888" }}>—</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="price"
          stroke="#1f7aef"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function App() {
  const [email, setEmail] = useState(localStorage.getItem("email") || "");
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("email"));
  const [supported, setSupported] = useState(FALLBACK);

  const [subscriptions, setSubscriptions] = useState(
    new Set(JSON.parse(localStorage.getItem("subs") || "[]"))
  );
  const [subOrder, setSubOrder] = useState(
    JSON.parse(localStorage.getItem("subOrder") || "[]")
  );

  const [prices, setPrices] = useState({}); // {TICKER: {price,ts,prev}}
  const [history, setHistory] = useState(
    () => JSON.parse(localStorage.getItem("history") || "{}")
  );
  const [selectedForChart, setSelectedForChart] = useState(null);
  const [flashes, setFlashes] = useState({});
  const wsRef = useRef(null);

  /* WebSocket connect & handlers */
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "get_supported" }));
      const storedEmail = localStorage.getItem("email");
      if (storedEmail) ws.send(JSON.stringify({ type: "login", email: storedEmail }));
      const persistedSubs = JSON.parse(localStorage.getItem("subs") || "[]");
      persistedSubs.forEach((t) =>
        ws.send(JSON.stringify({ type: "subscribe", ticker: t }))
      );
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "supported") setSupported(msg.supported || FALLBACK);
        else if (msg.type === "price_updates") handlePriceUpdates(msg.updates || []);
      } catch (err) {
        console.warn("invalid ws msg", err);
      }
    });

    ws.addEventListener("close", () => console.warn("ws closed"));
    ws.addEventListener("error", (e) => console.error("ws error", e));

    return () => {
      try {
        ws.close();
      } catch (e) {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Persist storage */
  useEffect(() => {
    localStorage.setItem("subs", JSON.stringify([...subscriptions]));
  }, [subscriptions]);

  useEffect(() => {
    localStorage.setItem("subOrder", JSON.stringify(subOrder));
  }, [subOrder]);

  useEffect(() => {
    localStorage.setItem("history", JSON.stringify(history));
  }, [history]);

  /* handle incoming price updates (server broadcasts all tickers) */
  function handlePriceUpdates(updates) {
    // updates: [{ticker, price, ts}]
    setPrices((prev) => {
      const next = { ...prev };
      updates.forEach((u) => {
        next[u.ticker] = {
          price: u.price,
          ts: u.ts,
          prev: prev[u.ticker]?.price ?? null,
        };
      });
      return next;
    });

    updates.forEach((u) => {
      setHistory((h) => ({
        ...h,
        [u.ticker]: pushLimited(
          h[u.ticker] || [],
          { ts: u.ts, price: u.price, label: tsToLabel(u.ts) },
          HISTORY_LEN
        ),
      }));
      setFlashes((old) => {
        const prevPrice = prices[u.ticker]?.price ?? null;
        const delta =
          prevPrice == null ? 0 : +(u.price - prevPrice).toFixed(2);
        if (delta === 0) return old;
        const next = { ...old, [u.ticker]: delta > 0 ? "up" : "down" };
        setTimeout(
          () =>
            setFlashes((cur) => {
              const c = { ...cur };
              delete c[u.ticker];
              return c;
            }),
          450
        );
        return next;
      });
    });
  }

  /* AUTH */
  function doLogin(e) {
    e?.preventDefault();
    if (!isValidEmail(email)) {
      alert("Email must be valid and contain '@' and a domain like '.com'");
      return;
    }
    localStorage.setItem("email", email);
    setLoggedIn(true);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "login", email }));
  }
  function doLogout() {
    localStorage.removeItem("email");
    setLoggedIn(false);
    setSubscriptions(new Set());
    setSubOrder([]);
    setPrices({});
    setHistory({});
    setSelectedForChart(null);
  }

  /* SUBSCRIBE / UNSUBSCRIBE */
  function subscribe(ticker) {
    if (!loggedIn) {
      alert("Login first");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Server not connected");
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "subscribe", ticker }));
    setSubscriptions((prev) => {
      const ns = new Set(prev);
      ns.add(ticker);
      return ns;
    });
    setSubOrder((prev) => {
      const arr = prev.filter((x) => x !== ticker);
      arr.push(ticker);
      return arr;
    });
    setSelectedForChart(ticker);
  }

  function unsubscribe(ticker) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Server not connected");
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "unsubscribe", ticker }));
    setSubscriptions((prev) => {
      const ns = new Set(prev);
      ns.delete(ticker);
      return ns;
    });

    setSubOrder((prev) => {
      const newOrder = prev.filter((x) => x !== ticker);
      setSelectedForChart((current) => {
        if (current !== ticker) return current;
        if (newOrder.length > 0) return newOrder[newOrder.length - 1];
        return null; // none left -> placeholder
      });
      return newOrder;
    });
    // history preserved
  }

  /* CHART HELPERS */
  const lineData = (t) =>
    (history[t] || []).map((p) => ({ label: p.label, price: p.price }));

  // percent change between latest and previous
  const percentBarData = () =>
    supported.map((t) => {
      const p = prices[t];
      const prev = p?.prev ?? null;
      const cur = p?.price ?? null;
      const pct =
        cur != null && prev != null
          ? +(((cur - prev) / prev) * 100).toFixed(2)
          : 0;
      return { ticker: t, pct, absPct: Math.abs(pct) };
    });

  const portfolioAllocation = () => {
    const pool = subscriptions.size ? [...subscriptions] : supported.slice();
    const colors = ["#6366f1", "#06b6d4", "#f59e0b", "#ef4444", "#10b981"];
    const entries = pool.map((t, i) => ({
      name: t,
      value: prices[t]?.price ?? 1,
      color: colors[i % colors.length],
    }));
    return entries;
  };

  const upDownPie = () => {
    let up = 0,
      down = 0,
      neutral = 0;
    supported.forEach((t) => {
      const p = prices[t];
      if (!p || p.prev == null) neutral++;
      else if (p.price > p.prev) up++;
      else if (p.price < p.prev) down++;
      else neutral++;
    });
    return [
      { name: "Up", value: up, color: upColor },
      { name: "Down", value: down, color: downColor },
      { name: "Neutral", value: neutral, color: neutralColor },
    ];
  };

  /* Bar chart data & domain: bars are always positive height (abs pct), color indicates direction */
  const barData = percentBarData();
  const maxPct = Math.max(1, ...barData.map((d) => d.absPct)) * 1.2; // domain top

  /* PIE INFERENCES */
  const portfolioInference = () => {
    const entries = portfolioAllocation();
    if (!entries || entries.length === 0) return "No subscriptions";
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const second = sorted[1];
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    const topPct = ((top.value / total) * 100).toFixed(0);
    const secondPct = second
      ? ((second.value / total) * 100).toFixed(0)
      : null;
    return second
      ? `Top: ${top.name} ${topPct}% · Next: ${second.name} ${secondPct}%`
      : `Top: ${top.name} ${topPct}%`;
  };

  const upDownInference = () => {
    const u = upDownPie();
    const up = u.find((x) => x.name === "Up")?.value || 0;
    const down = u.find((x) => x.name === "Down")?.value || 0;
    const neutral = u.find((x) => x.name === "Neutral")?.value || 0;
    return `${up} up · ${down} down · ${neutral} neutral`;
  };

  /* UI */
  return (
    <div style={page}>
      <header style={header}>
        <h1 style={{ margin: 0, color: "white" }}>📈 Stock Broker Dashboard</h1>
        <div>
          {loggedIn ? (
            <>
              <span style={{ color: "white", marginRight: 12 }}>{email}</span>
              <button style={headerBtn} onClick={doLogout}>
                Logout
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!loggedIn ? (
        <main style={mainCentered}>
          <div style={loginCard}>
            <h2 style={{ marginBottom: 8 }}>Sign in</h2>
            <form
              onSubmit={doLogin}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                width: 420,
              }}
            >
              <label style={{ fontSize: 14, fontWeight: 600 }}>
                Email address
              </label>
              <input
                style={loginInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
              />
              <div style={{ color: "#666", fontSize: 13 }}>
                Email must be valid — it should contain <strong>@</strong> and a
                domain like <strong>.com</strong>. Example: user@example.com
              </div>
              <button style={loginBtn} type="submit">
                Login
              </button>
            </form>
          </div>
        </main>
      ) : (
        <main style={main}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "stretch",
              alignContent: "stretch",
            }}
          >
            {/* LEFT column */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  ...card,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <h3 style={{ marginTop: 0 }}>Supported Stocks</h3>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {supported.map((t) => {
                    const p = prices[t];
                    const prev = p?.prev ?? null;
                    const cur = p?.price ?? null;
                    const delta =
                      cur != null && prev != null
                        ? +(cur - prev).toFixed(2)
                        : 0;
                    const color =
                      delta > 0
                        ? upColor
                        : delta < 0
                        ? downColor
                        : neutralColor;
                    const flash = flashes[t];
                    return (
                      <div
                        key={t}
                        style={{
                          ...stockCard,
                          boxShadow: flash
                            ? "0 8px 30px rgba(0,0,0,0.06)"
                            : undefined,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{t}</div>
                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color,
                          }}
                        >
                          {cur != null ? fmt(cur) : "--"}
                        </div>
                        <div style={{ width: 120, height: 40 }}>
                          <Sparkline
                            data={(history[t] || []).slice(-10)}
                            height={40}
                          />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          {!subscriptions.has(t) ? (
                            <button
                              style={smallPrimary}
                              onClick={() => subscribe(t)}
                            >
                              Subscribe
                            </button>
                          ) : (
                            <button
                              style={smallDanger}
                              onClick={() => unsubscribe(t)}
                            >
                              Unsubscribe
                            </button>
                          )}
                          <button
                            style={smallGhost}
                            onClick={() => setSelectedForChart(t)}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bar chart */}
                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                  }}
                >
                  <h4 style={{ marginBottom: 8 }}>
                    Latest % Change (abs, indicator color)
                  </h4>
                  <div style={{ flex: 1, minHeight: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barData}
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="ticker" />
                        <YAxis
                          domain={[0, maxPct]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip formatter={(val) => `${val}%`} />
                        <Bar
                          dataKey="absPct"
                          barSize={18}
                          isAnimationActive={true}
                          animationDuration={700}
                        >
                          {barData.map((entry, idx) => (
                            <Cell
                              key={`cell-${idx}`}
                              fill={entry.pct >= 0 ? upColor : downColor}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div
              style={{
                flex: 1.6,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Pies side-by-side with legends & inferences below (safe sizing) */}
              <div
                style={{
                  ...card,
                  display: "flex",
                  gap: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <h4 style={{ margin: 0 }}>Portfolio Allocation</h4>
                  <div
                    style={{
                      width: "100%",
                      height: 140,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <ResponsiveContainer width="60%" height="100%">
                      <PieChart>
                        <Pie
                          data={portfolioAllocation()}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={48} // reduced radius to avoid clipping
                          label={false}
                        >
                          {portfolioAllocation().map((e, i) => (
                            <Cell key={i} fill={e.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* legend and inference below the pie */}
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "#444",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      {portfolioAllocation()
                        .slice(0, 3)
                        .map((e, i) => (
                          <span
                            key={i}
                            style={{
                              marginRight: 10,
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                background: e.color,
                                display: "inline-block",
                                marginRight: 6,
                              }}
                            />
                            <strong style={{ fontSize: 13 }}>{e.name}</strong>
                          </span>
                        ))}
                    </div>
                    <div>{portfolioInference()}</div>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <h4 style={{ margin: 0 }}>Up / Down</h4>
                  <div
                    style={{
                      width: "100%",
                      height: 140,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <ResponsiveContainer width="60%" height="100%">
                      <PieChart>
                        <Pie
                          data={upDownPie()}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={48}
                          label={false}
                        >
                          {upDownPie().map((e, i) => (
                            <Cell key={i} fill={e.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "#444",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      {upDownPie().map((e, i) => (
                        <span
                          key={i}
                          style={{
                            marginRight: 10,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              background: e.color,
                              display: "inline-block",
                              marginRight: 6,
                            }}
                          />
                          <span style={{ fontSize: 13 }}>{e.name}</span>
                        </span>
                      ))}
                    </div>
                    <div>{upDownInference()}</div>
                  </div>
                </div>
              </div>

              {/* BIG Line Chart (flexible height) */}
              <div
                style={{
                  ...card,
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                }}
              >
                <h4 style={{ marginTop: 0 }}>
                  {selectedForChart
                    ? `${selectedForChart} — Price (last ${HISTORY_LEN})`
                    : "Select a ticker to view chart"}
                </h4>
                <div style={{ flex: 1 }}>
                  {selectedForChart ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineData(selectedForChart)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={["auto", "auto"]} />
                        <Tooltip formatter={(val) => fmt(val)} />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        paddingTop: 60,
                        textAlign: "center",
                        color: "#999",
                      }}
                    >
                      Subscribe or click “View” to display chart
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

/* STYLES */
const page = {
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#f7f9fc",
  minHeight: "100vh",
};
const header = {
  background: "#0ea5e9",
  padding: "12px 18px",
  color: "white",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const headerBtn = {
  border: "none",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
  background: "#ffffff22",
  color: "white",
};
const main = { padding: 16 };
const mainCentered = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "80vh",
};
const card = {
  background: "white",
  padding: 18,
  borderRadius: 12,
  boxShadow: "0 6px 20px rgba(3,10,18,0.04)",
};
const loginCard = {
  background: "white",
  padding: 22,
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(3,10,18,0.06)",
  textAlign: "center",
};
const loginInput = {
  padding: "14px 12px",
  fontSize: 16,
  borderRadius: 10,
  border: "1px solid #e6eef9",
  width: "100%",
};
const loginBtn = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  cursor: "pointer",
  fontSize: 16,
};
const stockCard = {
  width: 150,
  padding: 12,
  borderRadius: 10,
  background: "#fff",
  boxShadow: "0 6px 14px rgba(3,10,18,0.04)",
  textAlign: "center",
};
const smallPrimary = {
  marginRight: 6,
  padding: "6px 8px",
  borderRadius: 6,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
const smallDanger = {
  marginRight: 6,
  padding: "6px 8px",
  borderRadius: 6,
  border: "none",
  background: "#ef4444",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
const smallGhost = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontSize: 13,
};
